import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServerHealthProvider, getServerHealthBridge, isNetworkFailure } from './contexts/ServerHealthContext';
import { SERVER_HEALTH_ENDPOINT } from './lib/serverHealthConfig';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
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

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const healthBridge = getServerHealthBridge();
  const isHealthCheck = isHealthCheckRequest(input);

  while (true) {
    if (healthBridge && !isHealthCheck && !healthBridge.getIsServerReachable()) {
      await healthBridge.waitForReachable();
    }

    try {
      const response = await nativeFetch(input, {
        ...init,
        credentials: init?.credentials ?? 'include',
      });

      if (healthBridge && !isHealthCheck) {
        healthBridge.reportSuccess();
      }

      return patchJsonResponse(response);
    } catch (error) {
      if (healthBridge && !isHealthCheck && isNetworkFailure(error)) {
        healthBridge.reportFailure(error);
        await healthBridge.waitForReachable();
        continue;
      }
      throw error;
    }
  }
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
