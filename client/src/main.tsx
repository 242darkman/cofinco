import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServerHealthProvider, getServerHealthBridge, isNetworkFailure } from './contexts/ServerHealthContext';
import { NetworkProvider } from './contexts/NetworkContext';
import { SERVER_HEALTH_ENDPOINT } from './lib/serverHealthConfig';
import { networkManager } from './lib/networkManager';
import { isOfflineError, isApiDownError, CircuitOpenError } from './lib/networkErrors';

// ========== FETCH CONFIGURATION ==========
const FETCH_CONFIG = {
  DEFAULT_TIMEOUT_MS: 10_000, // 10 seconds
  MAX_RETRIES_GET: 3,
  MAX_RETRIES_MUTATION: 1, // Only retry mutations with idempotency key
  RETRY_DELAYS: [1000, 2000, 4000], // Backoff delays
  JITTER_MAX_MS: 500, // Max random jitter
} as const;

// ========== REACT QUERY CONFIGURATION FOR SLOW CONNECTIONS ==========
// Optimized for 3G/slow networks with aggressive caching and deduplication
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data freshness: 5 minutes before marking as stale
      staleTime: 5 * 60 * 1000, // 5 minutes

      // Garbage collection: keep unused data for 30 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (was cacheTime in v4)

      // Don't refetch on window focus (saves bandwidth on slow connections)
      refetchOnWindowFocus: false,

      // Don't refetch on mount if data is still fresh
      refetchOnMount: false,

      // Only refetch on reconnect if data is stale
      refetchOnReconnect: 'always',

      // Retry with circuit breaker awareness
      retry: (failureCount, error) => {
        // Don't retry if circuit breaker is open
        if (networkManager.isCircuitOpen()) return false;
        // Don't retry 4xx errors (client errors)
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => {
        const base = Math.min(1000 * 2 ** attemptIndex, 30000);
        const jitter = Math.random() * FETCH_CONFIG.JITTER_MAX_MS;
        return base + jitter;
      },

      // Network mode: always try to fetch, but return cached data if offline
      networkMode: 'offlineFirst',

      // Structural sharing for performance
      structuralSharing: true,
    },
    mutations: {
      // Retry mutations only once (requires idempotency key for safety)
      retry: (failureCount, error) => {
        if (networkManager.isCircuitOpen()) return false;
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 1;
      },
      retryDelay: () => 1000 + Math.random() * FETCH_CONFIG.JITTER_MAX_MS,

      // Network mode for mutations
      networkMode: 'offlineFirst',
    },
  },
});

const nativeFetch = window.fetch.bind(window);

// ========== FETCH HELPERS ==========

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
};

const getRequestMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
};

const isHealthCheckRequest = (input: RequestInfo | URL): boolean => {
  return getRequestUrl(input).includes(SERVER_HEALTH_ENDPOINT);
};

const isIdempotentMethod = (method: string): boolean => {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
};

const patchJsonResponse = (response: Response): Response => {
  const originalText = response.text.bind(response);
  response.json = async () => {
    const text = await originalText();
    if (!text) {
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    return JSON.parse(text);
  };
  return response;
};

/**
 * Calculate retry delay with exponential backoff and jitter
 */
const getRetryDelay = (attemptIndex: number): number => {
  const baseDelay = FETCH_CONFIG.RETRY_DELAYS[
    Math.min(attemptIndex, FETCH_CONFIG.RETRY_DELAYS.length - 1)
  ];
  const jitter = Math.random() * FETCH_CONFIG.JITTER_MAX_MS;
  return baseDelay + jitter;
};

/**
 * Check if error indicates API is down (502/503/504)
 */
const isServerDownError = (response: Response): boolean => {
  return [502, 503, 504].includes(response.status);
};

/**
 * Check if error is retryable
 */
const shouldRetry = (
  error: unknown,
  response: Response | null,
  method: string,
  hasIdempotencyKey: boolean,
  attemptIndex: number
): boolean => {
  // Check circuit breaker
  if (networkManager.isCircuitOpen()) {
    return false;
  }

  // Check max retries
  const maxRetries = isIdempotentMethod(method)
    ? FETCH_CONFIG.MAX_RETRIES_GET
    : hasIdempotencyKey
      ? FETCH_CONFIG.MAX_RETRIES_MUTATION
      : 0;

  if (attemptIndex >= maxRetries) {
    return false;
  }

  // Network errors are retryable
  if (isNetworkFailure(error) || isOfflineError(error)) {
    return true;
  }

  // Server down errors are retryable
  if (response && isServerDownError(response)) {
    return true;
  }

  // 408 (Request Timeout) and 429 (Too Many Requests) are retryable
  if (response && [408, 429].includes(response.status)) {
    return true;
  }

  return false;
};

// Extended RequestInit with custom options
interface EnhancedRequestInit extends RequestInit {
  timeout?: number;
  idempotencyKey?: string;
  skipNetworkManager?: boolean;
}

// ========== ENHANCED FETCH WRAPPER ==========

window.fetch = async (
  input: RequestInfo | URL,
  init?: EnhancedRequestInit
): Promise<Response> => {
  const healthBridge = getServerHealthBridge();
  const isHealthCheck = isHealthCheckRequest(input);
  const method = getRequestMethod(input, init);
  const timeout = init?.timeout ?? FETCH_CONFIG.DEFAULT_TIMEOUT_MS;
  const idempotencyKey = init?.idempotencyKey;
  const skipNetworkManager = init?.skipNetworkManager ?? false;

  // Generate request ID for tracing
  const requestId = crypto.randomUUID();

  // Check circuit breaker before making request (except health checks)
  if (!isHealthCheck && !skipNetworkManager) {
    try {
      networkManager.checkCircuit();
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        throw error;
      }
    }
  }

  let attemptIndex = 0;
  const startTime = performance.now();

  while (true) {
    const attemptStartTime = performance.now();
    let response: Response | null = null;

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Build headers with request ID and optional idempotency key
      const headers = new Headers(init?.headers);
      headers.set('X-Request-Id', requestId);
      if (idempotencyKey && !isIdempotentMethod(method)) {
        headers.set('X-Idempotency-Key', idempotencyKey);
      }

      response = await nativeFetch(input, {
        ...init,
        headers,
        credentials: init?.credentials ?? 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Calculate latency
      const latencyMs = performance.now() - attemptStartTime;

      // Check for server down errors (502/503/504)
      if (isServerDownError(response)) {
        const error = new Error(`Server error: ${response.status}`);
        (error as unknown as { status: number }).status = response.status;

        // Report to network manager
        if (!isHealthCheck && !skipNetworkManager) {
          networkManager.reportError(error, true);
        }

        // Check if we should retry
        if (shouldRetry(null, response, method, !!idempotencyKey, attemptIndex)) {
          attemptIndex++;
          await new Promise(resolve => setTimeout(resolve, getRetryDelay(attemptIndex - 1)));
          continue;
        }

        // Report to health bridge
        if (healthBridge && !isHealthCheck) {
          healthBridge.reportFailure(error);
        }

        return patchJsonResponse(response);
      }

      // Success - report to network manager
      if (!isHealthCheck && !skipNetworkManager) {
        networkManager.reportSuccess(latencyMs);
      }

      // Report success to health bridge
      if (healthBridge && !isHealthCheck) {
        healthBridge.reportSuccess();
      }

      return patchJsonResponse(response);
    } catch (error) {
      // Handle timeout (AbortError)
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (!isHealthCheck && !skipNetworkManager) {
          networkManager.reportError(error, false);
        }
      }

      // Handle network failures
      if (isNetworkFailure(error) || isOfflineError(error)) {
        if (!isHealthCheck && !skipNetworkManager) {
          networkManager.reportError(error, false);
        }
      }

      // Check if we should retry
      if (shouldRetry(error, response, method, !!idempotencyKey, attemptIndex)) {
        attemptIndex++;

        // Report failure after 2nd attempt to trigger overlay
        if (attemptIndex >= 2 && healthBridge && !isHealthCheck) {
          healthBridge.reportFailure(error);
        }

        await new Promise(resolve => setTimeout(resolve, getRetryDelay(attemptIndex - 1)));
        continue;
      }

      // No more retries - report final failure
      if (healthBridge && !isHealthCheck) {
        healthBridge.reportFailure(error);
      }

      throw error;
    }
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ServerHealthProvider>
        <NetworkProvider>
          <ThemeProvider>
            <LanguageProvider>
              <App />
            </LanguageProvider>
          </ThemeProvider>
        </NetworkProvider>
      </ServerHealthProvider>
    </QueryClientProvider>
  </StrictMode>
);
