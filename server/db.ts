import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";
import { dbCircuitBreaker, CircuitState } from "./lib/circuit-breaker";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool configuration robuste avec reconnexion automatique
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Pool sizing
  max: 20,                        // Maximum de connexions dans le pool
  min: 2,                         // Minimum de connexions maintenues
  // Timeouts
  idleTimeoutMillis: 30000,       // Fermer les connexions inactives après 30s
  connectionTimeoutMillis: 10000, // Timeout de connexion: 10s
  // Reconnexion automatique
  allowExitOnIdle: false,         // Ne pas fermer le pool si toutes les connexions sont inactives
});

// Gestion des erreurs du pool (évite les crashs silencieux)
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

pool.on('connect', () => {
  console.log('[DB Pool] New client connected');
});

export const db = drizzle(pool, { schema });

/**
 * Health check de la base de données
 * Retourne true si la DB est accessible, false sinon
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  poolStats: { total: number; idle: number; waiting: number };
  circuitBreaker: { state: string; failureCount: number };
  error?: string;
}> {
  const start = Date.now();
  const circuitStats = dbCircuitBreaker.getStats();

  try {
    // Test simple avec timeout
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    return {
      healthy: true,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      circuitBreaker: {
        state: circuitStats.state,
        failureCount: circuitStats.failureCount,
      },
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      circuitBreaker: {
        state: circuitStats.state,
        failureCount: circuitStats.failureCount,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Exécute une opération DB avec circuit breaker et timeout
 * Utiliser pour les opérations critiques qui ne doivent pas bloquer
 */
export async function safeDbOperation<T>(
  operation: () => Promise<T>,
  options: {
    timeoutMs?: number;
    operationName?: string;
    fallback?: () => T | Promise<T>;
  } = {}
): Promise<T> {
  const { timeoutMs = 5000, operationName = 'db-operation', fallback } = options;

  const wrappedOperation = () => withTimeout(operation(), timeoutMs, operationName);

  if (fallback) {
    return dbCircuitBreaker.executeWithFallback(wrappedOperation, fallback);
  }

  return dbCircuitBreaker.execute(wrappedOperation);
}

/**
 * Vérifie si le circuit breaker DB est ouvert
 */
export function isDbCircuitOpen(): boolean {
  return dbCircuitBreaker.getState() === CircuitState.OPEN;
}

/**
 * Reset manuel du circuit breaker (pour admin/debug)
 */
export function resetDbCircuit(): void {
  dbCircuitBreaker.reset();
}

/**
 * Exécute une requête avec timeout
 * Évite les blocages infinis sur les requêtes DB
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[DB Timeout] ${operationName} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Ferme proprement le pool de connexions
 * À appeler lors du graceful shutdown
 */
export async function closePool(): Promise<void> {
  console.log('[DB Pool] Closing all connections...');
  await pool.end();
  console.log('[DB Pool] All connections closed');
}

/**
 * Ensures custom SQL functions exist in the database.
 * Called on application startup to handle cases where db:push was used
 * instead of migrations (db:push only syncs tables, not functions).
 */
export async function ensureCustomFunctions(): Promise<void> {
    // Custom unaccent function (fallback if extension is missing/restricted)
  // This uses translate() to map accented characters to ASCII
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.unaccent(text)
    RETURNS text AS $$
    BEGIN
        RETURN translate($1,
            'âãäåāăąÁÂÃÄÅĀĂĄèééêëēĕėęěÈÉÊËĒĔĖĘĚìíîïìĩīĭÌÍÎÏÌĨĪĬóôõöōŏőÒÓÔÕÖŌŎŐùúûüũūŭůÙÚÛÜŨŪŬŮñÑçÇ',
            'aaaaaaaAAAAAAAAeeeeeeeeeeEEEEEEEEiiiiiiiiIIIIIIIIoooooooOOOOOOOOuuuuuuuuUUUUUUUUnNcC'
        );
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  // get_next_piece_number: Generates sequential piece numbers for GL entries
  // This function is essential for the accounting module
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION get_next_piece_number(p_agence_id uuid, p_journal_code text, p_year integer)
    RETURNS text AS $$
    DECLARE
        v_next_number integer;
        v_piece_number text;
    BEGIN
        -- Lock and increment sequence atomically
        INSERT INTO gl_sequences (agence_id, journal_code, year, last_number)
        VALUES (p_agence_id, p_journal_code, p_year, 1)
        ON CONFLICT (agence_id, journal_code, year)
        DO UPDATE SET
            last_number = gl_sequences.last_number + 1,
            updated_at = now()
        RETURNING last_number INTO v_next_number;

        -- Format: JOURNAL-YYYY-NNNNNN (e.g., CAI-2025-000001)
        v_piece_number := p_journal_code || '-' || p_year || '-' || LPAD(v_next_number::text, 6, '0');

        RETURN v_piece_number;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
