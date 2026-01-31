/**
 * Circuit Breaker Pattern
 *
 * Protège le système contre les cascades d'erreurs quand un service externe
 * (comme la DB) a des problèmes. Évite de surcharger un service déjà en difficulté.
 *
 * États:
 * - CLOSED: Tout fonctionne, les requêtes passent normalement
 * - OPEN: Trop d'erreurs, les requêtes sont rejetées immédiatement
 * - HALF_OPEN: Période de test, quelques requêtes passent pour vérifier la récupération
 */

import { createLogger } from './logger';

const logger = createLogger('CircuitBreaker');

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Nombre d'erreurs avant d'ouvrir le circuit */
  failureThreshold: number;
  /** Temps avant de passer en HALF_OPEN (ms) */
  resetTimeout: number;
  /** Nombre de succès requis en HALF_OPEN pour fermer */
  successThreshold: number;
  /** Nom du circuit (pour les logs) */
  name: string;
  /** Callback quand le circuit change d'état */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> & { name: string }) {
    this.options = {
      failureThreshold: 5,
      resetTimeout: 30000, // 30 secondes
      successThreshold: 3,
      ...options,
    };
  }

  /**
   * Exécute une fonction avec protection du circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Vérifier si on peut passer en HALF_OPEN
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(this.options.name, this.getRemainingTimeout());
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

  /**
   * Exécute avec fallback si le circuit est ouvert
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    try {
      return await this.execute(fn);
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        logger.warn({ circuit: this.options.name }, 'Circuit open, using fallback');
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Une seule erreur en HALF_OPEN réouvre le circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }

    logger.info({
      circuit: this.options.name,
      from: oldState,
      to: newState,
    }, `Circuit breaker state change: ${oldState} -> ${newState}`);

    this.options.onStateChange?.(oldState, newState);
  }

  private getRemainingTimeout(): number {
    return Math.max(0, this.options.resetTimeout - (Date.now() - this.lastFailureTime));
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Force le circuit à se fermer (pour les tests ou la récupération manuelle)
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterMs: number
  ) {
    super(`Circuit '${circuitName}' is OPEN. Retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

// ============================================
// Circuit breakers pré-configurés
// ============================================

/** Circuit breaker pour les opérations de base de données */
export const dbCircuitBreaker = new CircuitBreaker({
  name: 'database',
  failureThreshold: 5,
  resetTimeout: 30000, // 30s
  successThreshold: 3,
  onStateChange: (from, to) => {
    if (to === CircuitState.OPEN) {
      logger.error('[DB Circuit] OPEN - Database operations will be rejected');
    } else if (to === CircuitState.CLOSED) {
      logger.info('[DB Circuit] CLOSED - Database operations resumed');
    }
  },
});

/** Circuit breaker pour les services externes (SMS, Email, etc.) */
export const externalServiceCircuitBreaker = new CircuitBreaker({
  name: 'external-services',
  failureThreshold: 3,
  resetTimeout: 60000, // 1 minute
  successThreshold: 2,
});

/**
 * Helper pour exécuter une opération DB avec circuit breaker
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  fallback?: () => T | Promise<T>
): Promise<T> {
  if (fallback) {
    return dbCircuitBreaker.executeWithFallback(operation, fallback);
  }
  return dbCircuitBreaker.execute(operation);
}
