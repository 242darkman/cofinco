/**
 * Circuit Breaker pour les appels provider Mobile Money
 *
 * États:
 * - CLOSED: normal, les appels passent
 * - OPEN: le circuit est coupé, les appels échouent immédiatement
 * - HALF_OPEN: un seul appel test est autorisé
 *
 * Transition:
 * CLOSED → OPEN: après N échecs consécutifs
 * OPEN → HALF_OPEN: après resetTimeout ms
 * HALF_OPEN → CLOSED: si l'appel test réussit
 * HALF_OPEN → OPEN: si l'appel test échoue
 */

import { createLogger } from "../../lib/logger";

const logger = createLogger('CircuitBreaker');

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold: number;   // Nombre d'échecs avant ouverture (défaut: 5)
  resetTimeoutMs: number;     // Temps avant tentative de fermeture (défaut: 60000)
  name: string;               // Nom pour les logs
}

const DEFAULT_OPTIONS: Omit<CircuitBreakerOptions, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> & { name: string }) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Exécute une fonction protégée par le circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      // Vérifier si le timeout est écoulé
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        logger.info({ name: this.options.name }, "Circuit breaker: OPEN → HALF_OPEN");
      } else {
        throw new CircuitBreakerOpenError(this.options.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      logger.info({ name: this.options.name }, "Circuit breaker: HALF_OPEN → CLOSED");
    }
    this.state = "CLOSED";
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      logger.warn({ name: this.options.name }, "Circuit breaker: HALF_OPEN → OPEN (test failed)");
      return;
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "OPEN";
      logger.warn({
        name: this.options.name,
        failureCount: this.failureCount,
        threshold: this.options.failureThreshold,
      }, "Circuit breaker: CLOSED → OPEN");
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }

  /**
   * Reset manuel du circuit breaker
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    logger.info({ name: this.options.name }, "Circuit breaker manually reset");
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit breaker '${circuitName}' is OPEN - call rejected`);
    this.name = "CircuitBreakerOpenError";
  }
}
