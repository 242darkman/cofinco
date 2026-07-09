/**
 * Network Error Classes
 * Custom errors for network-related failures with proper classification
 */

export type NetworkErrorType =
  | 'OFFLINE' // Browser reports no network
  | 'API_DOWN' // Server returns 502/503/504 or health check fails
  | 'TIMEOUT' // Request timed out
  | 'CIRCUIT_OPEN' // Circuit breaker is open
  | 'NETWORK_ERROR'; // Generic network failure

/**
 * Base network error class
 */
export class NetworkError extends Error {
  public readonly type: NetworkErrorType;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(
    message: string,
    type: NetworkErrorType,
    options?: { retryable?: boolean; statusCode?: number }
  ) {
    super(message);
    this.name = 'NetworkError';
    this.type = type;
    this.retryable = options?.retryable ?? true;
    this.statusCode = options?.statusCode;
  }
}

/**
 * Thrown when the device is offline (no internet connection)
 */
export class OfflineError extends NetworkError {
  constructor(message = 'Aucune connexion internet') {
    super(message, 'OFFLINE', { retryable: true });
    this.name = 'OfflineError';
  }
}

/**
 * Thrown when the API is down but internet is available
 */
export class ApiDownError extends NetworkError {
  constructor(
    message = 'Le serveur est temporairement indisponible',
    statusCode?: number
  ) {
    super(message, 'API_DOWN', { retryable: true, statusCode });
    this.name = 'ApiDownError';
  }
}

/**
 * Thrown when a request times out
 */
export class TimeoutError extends NetworkError {
  public readonly timeoutMs: number;

  constructor(message = 'La requête a expiré', timeoutMs = 10000) {
    super(message, 'TIMEOUT', { retryable: true });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when circuit breaker is open
 */
export class CircuitOpenError extends NetworkError {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Service temporairement indisponible. Réessai dans ${Math.ceil(retryAfterMs / 1000)}s`,
      'CIRCUIT_OPEN',
      { retryable: false }
    );
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Check if an error indicates offline state
 */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  if (error instanceof TypeError) {
    const message = error.message || '';
    return (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Load failed') ||
      message.includes('Network request failed')
    );
  }
  return false;
}

/**
 * Check if an error indicates API is down
 */
export function isApiDownError(error: unknown): boolean {
  if (error instanceof ApiDownError) return true;
  if (error instanceof NetworkError && error.statusCode) {
    return [502, 503, 504].includes(error.statusCode);
  }
  return false;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // NetworkError subclasses
  if (error instanceof NetworkError) {
    return error.retryable;
  }

  // Native fetch errors (network failure)
  if (error instanceof TypeError) {
    return isOfflineError(error);
  }

  // HTTP errors that may be retryable
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    // 408 Request Timeout, 429 Too Many Requests, 5xx Server Errors
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }

  return false;
}

/**
 * Classify an error and return appropriate NetworkError
 */
export function classifyError(error: unknown, statusCode?: number): NetworkError {
  // Already classified
  if (error instanceof NetworkError) {
    return error;
  }

  // Offline detection
  if (isOfflineError(error)) {
    return new OfflineError();
  }

  // API down (5xx errors)
  if (statusCode && [502, 503, 504].includes(statusCode)) {
    return new ApiDownError(undefined, statusCode);
  }

  // Timeout (AbortError)
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new TimeoutError();
  }

  // Generic network error
  const message = error instanceof Error ? error.message : 'Erreur réseau';
  return new NetworkError(message, 'NETWORK_ERROR');
}

/**
 * Get user-friendly error message
 */
export function getNetworkErrorMessage(error: unknown): string {
  if (error instanceof OfflineError) {
    return 'Vous êtes hors ligne. Vérifiez votre connexion internet.';
  }

  if (error instanceof ApiDownError) {
    return 'Le serveur est temporairement indisponible. Veuillez réessayer dans quelques instants.';
  }

  if (error instanceof TimeoutError) {
    return 'La requête a pris trop de temps. Vérifiez votre connexion et réessayez.';
  }

  if (error instanceof CircuitOpenError) {
    return error.message;
  }

  if (error instanceof NetworkError) {
    return error.message;
  }

  if (isOfflineError(error)) {
    return 'Vous êtes hors ligne. Vérifiez votre connexion internet.';
  }

  return 'Une erreur réseau est survenue. Veuillez réessayer.';
}
