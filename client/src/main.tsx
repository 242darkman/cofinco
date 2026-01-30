import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServerHealthProvider, getServerHealthBridge, isNetworkFailure } from './contexts/ServerHealthContext';
import { SERVER_HEALTH_ENDPOINT } from './lib/serverHealthConfig';

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

      // Retry configuration for flaky connections
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Network mode: always try to fetch, but return cached data if offline
      networkMode: 'offlineFirst',

      // Structural sharing for performance
      structuralSharing: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      retryDelay: 1000,

      // Network mode for mutations
      networkMode: 'offlineFirst',
    },
  },
});

const nativeFetch = window.fetch.bind(window);

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
};

const isHealthCheckRequest = (input: RequestInfo | URL): boolean => {
  return getRequestUrl(input).includes(SERVER_HEALTH_ENDPOINT);
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

// Maximum retries for network failures before giving up
const MAX_NETWORK_RETRIES = 2;

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const healthBridge = getServerHealthBridge();
  const isHealthCheck = isHealthCheckRequest(input);
  let retryCount = 0;

  while (retryCount <= MAX_NETWORK_RETRIES) {
    try {
      const response = await nativeFetch(input, {
        ...init,
        credentials: init?.credentials ?? 'include',
      });

      // Report success to reset failure counter (skip for health checks)
      if (healthBridge && !isHealthCheck) {
        healthBridge.reportSuccess();
      }

      return patchJsonResponse(response);
    } catch (error) {
      // Only retry network failures, not other errors
      if (healthBridge && !isHealthCheck && isNetworkFailure(error)) {
        retryCount++;

        // If we've exhausted retries, report failure and throw
        if (retryCount > MAX_NETWORK_RETRIES) {
          healthBridge.reportFailure(error);
          throw error;
        }

        // Report failure after 2nd attempt to trigger overlay if needed
        if (retryCount >= 2) {
          healthBridge.reportFailure(error);
        }

        // Wait before retrying (exponential backoff: 1s, 2s)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        continue;
      }

      // Non-network errors are thrown immediately
      throw error;
    }
  }

  // Should never reach here, but just in case
  throw new Error('Max retries exceeded');
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ServerHealthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <App />
          </LanguageProvider>
        </ThemeProvider>
      </ServerHealthProvider>
    </QueryClientProvider>
  </StrictMode>
);
