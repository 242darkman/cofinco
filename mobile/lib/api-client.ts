import Constants from 'expo-constants';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://localhost:5001';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type UnauthorizedCallback = () => void;

let onUnauthorized: UnauthorizedCallback | null = null;

export function setOnUnauthorized(cb: UnauthorizedCallback) {
  onUnauthorized = cb;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal } = options;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
    credentials: 'include',
    signal,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError('Non authentifie', 401);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message =
      (data as Record<string, string>).message ||
      (data as Record<string, string>).error ||
      `Erreur ${res.status}`;
    throw new ApiError(message, res.status, data);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { signal }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

export { API_URL };
