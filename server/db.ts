import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import fs from "fs";
import * as schema from "@shared/schema";
import { dbCircuitBreaker, CircuitState } from "./lib/circuit-breaker";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('[DB] Environment variables missing. Current NODE_ENV:', process.env.NODE_ENV);
  // Also check if .env file exists in current directory for debugging
  try {
    const hasEnvFile = fs.existsSync('.env');
    console.error('[DB] .env file exists:', hasEnvFile);
  } catch (e) {
    // ignore
  }
  
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
 * Ensures custom SQL functions and triggers exist in the database.
 * Called on application startup to handle cases where db:push was used
 * instead of migrations (db:push only syncs tables, not functions/triggers).
 *
 * This consolidates critical functions from migrations to reduce the number
 * of migration files needed for basic functionality.
 */
export async function ensureCustomFunctions(): Promise<void> {
  const start = Date.now();
  console.log('[DB] Ensuring custom SQL functions and triggers exist...');

  try {
    // ========================================================================
    // 1. UTILITY FUNCTIONS
    // ========================================================================

    // Custom unaccent function (fallback if extension is missing/restricted)
    try {
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
      console.log('[DB] ✓ unaccent()');
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "unaccent":', err instanceof Error ? err.message : err);
    }

    // Generic updated_at trigger function (used by many tables)
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ update_updated_at_column()');

    // ========================================================================
    // 2. ACCOUNTING (OHADA) FUNCTIONS
    // ========================================================================

    // Generate sequential GL piece numbers
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION get_next_piece_number(p_agence_id uuid, p_journal_code text, p_year integer)
      RETURNS text AS $$
      DECLARE
          v_next_number integer;
          v_piece_number text;
      BEGIN
          INSERT INTO gl_sequences (agence_id, journal_code, year, last_number)
          VALUES (p_agence_id, p_journal_code, p_year, 1)
          ON CONFLICT (agence_id, journal_code, year)
          DO UPDATE SET
              last_number = gl_sequences.last_number + 1,
              updated_at = now()
          RETURNING last_number INTO v_next_number;

          v_piece_number := p_journal_code || '-' || p_year || '-' || LPAD(v_next_number::text, 6, '0');
          RETURN v_piece_number;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ get_next_piece_number()');

    // Prevent usage of obsolete account 571 (migration constraint)
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION check_no_legacy_accounts()
      RETURNS TRIGGER AS $$
      BEGIN
          IF EXISTS (
              SELECT 1 FROM plan_comptable
              WHERE id = NEW.compte_id
              AND numero_compte = '571'
          ) THEN
              RAISE EXCEPTION 'Le compte 571 est obsolète. Utilisez le compte 521 à la place.';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ check_no_legacy_accounts()');

    // Create trigger for legacy account prevention
    await db.execute(sql`
      DROP TRIGGER IF EXISTS prevent_legacy_account_571 ON lignes_ecritures;
      CREATE TRIGGER prevent_legacy_account_571
          BEFORE INSERT ON lignes_ecritures
          FOR EACH ROW
          EXECUTE FUNCTION check_no_legacy_accounts();
    `);
    console.log('[DB] ✓ Trigger: prevent_legacy_account_571');

    // ========================================================================
    // 3. RBAC & AUTHENTICATION FUNCTIONS
    // ========================================================================

    // Ensure single primary role per user
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION check_single_primary_role()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.is_primary = true THEN
          IF EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = NEW.user_id
              AND is_primary = true
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          ) THEN
            UPDATE user_roles
            SET is_primary = false, updated_at = now()
            WHERE user_id = NEW.user_id
              AND is_primary = true
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ check_single_primary_role()');

    // Create trigger for single primary role
    await db.execute(sql`
      DROP TRIGGER IF EXISTS trg_ensure_single_primary ON user_roles;
      CREATE TRIGGER trg_ensure_single_primary
      BEFORE INSERT OR UPDATE OF is_primary ON user_roles
      FOR EACH ROW
      WHEN (NEW.is_primary = true)
      EXECUTE FUNCTION check_single_primary_role();
    `);
    console.log('[DB] ✓ Trigger: trg_ensure_single_primary');

    // Get effective role for user (used in authentication)
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION get_effective_role(p_user_id UUID)
      RETURNS user_role AS $$
      DECLARE
        v_role user_role;
      BEGIN
        SELECT role INTO v_role
        FROM user_roles
        WHERE user_id = p_user_id AND is_primary = true
        LIMIT 1;

        IF v_role IS NULL THEN
          SELECT role INTO v_role
          FROM user_roles
          WHERE user_id = p_user_id
          ORDER BY created_at ASC
          LIMIT 1;
        END IF;

        RETURN COALESCE(v_role, 'CLIENT'::user_role);
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);
    console.log('[DB] ✓ get_effective_role()');

    // RBAC version management for cache invalidation
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION increment_rbac_version(
        p_change_type TEXT DEFAULT NULL,
        p_change_entity TEXT DEFAULT NULL,
        p_change_detail JSONB DEFAULT NULL
      )
      RETURNS BIGINT AS $$
      DECLARE
        new_version BIGINT;
      BEGIN
        UPDATE rbac_versions
        SET
          version = version + 1,
          last_change_type = COALESCE(p_change_type, last_change_type),
          last_change_entity = COALESCE(p_change_entity, last_change_entity),
          last_change_detail = COALESCE(p_change_detail, last_change_detail),
          updated_at = NOW()
        WHERE id = 'global'
        RETURNING version INTO new_version;

        RETURN new_version;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ increment_rbac_version()');

    await db.execute(sql`
      CREATE OR REPLACE FUNCTION get_rbac_version()
      RETURNS BIGINT AS $$
      DECLARE
        current_version BIGINT;
      BEGIN
        SELECT version INTO current_version FROM rbac_versions WHERE id = 'global';
        RETURN COALESCE(current_version, 1);
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ get_rbac_version()');

    // RBAC version triggers for role_permissions
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION trigger_role_permissions_version()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM increment_rbac_version(
          'role_permission',
          COALESCE(NEW.role, OLD.role)::TEXT,
          jsonb_build_object(
            'operation', TG_OP,
            'permission_id', COALESCE(NEW.permission_id, OLD.permission_id),
            'granted', NEW.granted
          )
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.execute(sql`
      DROP TRIGGER IF EXISTS rbac_version_role_permissions ON role_permissions;
      CREATE TRIGGER rbac_version_role_permissions
        AFTER INSERT OR UPDATE OR DELETE ON role_permissions
        FOR EACH ROW
        EXECUTE FUNCTION trigger_role_permissions_version();
    `);
    console.log('[DB] ✓ Trigger: rbac_version_role_permissions');

    // RBAC version triggers for user_permissions
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION trigger_user_permissions_version()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM increment_rbac_version(
          'user_permission',
          COALESCE(NEW.user_id, OLD.user_id)::TEXT,
          jsonb_build_object(
            'operation', TG_OP,
            'permission_id', COALESCE(NEW.permission_id, OLD.permission_id),
            'granted', NEW.granted
          )
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.execute(sql`
      DROP TRIGGER IF EXISTS rbac_version_user_permissions ON user_permissions;
      CREATE TRIGGER rbac_version_user_permissions
        AFTER INSERT OR UPDATE OR DELETE ON user_permissions
        FOR EACH ROW
        EXECUTE FUNCTION trigger_user_permissions_version();
    `);
    console.log('[DB] ✓ Trigger: rbac_version_user_permissions');

    // ========================================================================
    // 4. MICROFINANCE & ACCOUNTS FUNCTIONS
    // ========================================================================

    // Check withdrawal eligibility (business rules)
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION check_withdrawal_eligibility(p_compte_id UUID)
      RETURNS TABLE (
          allowed BOOLEAN,
          reason TEXT
      ) AS $$
      DECLARE
          v_compte RECORD;
      BEGIN
          SELECT * INTO v_compte FROM comptes WHERE id = p_compte_id;

          IF NOT FOUND THEN
              RETURN QUERY SELECT FALSE, 'Compte non trouvé'::TEXT;
              RETURN;
          END IF;

          IF v_compte.statut = 'Suspendu' THEN
              RETURN QUERY SELECT FALSE, 'Compte suspendu'::TEXT;
              RETURN;
          END IF;

          IF v_compte.statut = 'Clôturé' THEN
              RETURN QUERY SELECT FALSE, 'Compte clôturé'::TEXT;
              RETURN;
          END IF;

          IF v_compte.type_compte = 'Bloqué' AND v_compte.blocage_actif = TRUE THEN
              RETURN QUERY SELECT FALSE, ('Compte bloqué: ' || COALESCE(v_compte.blocage_motif::TEXT, 'Raison non spécifiée'))::TEXT;
              RETURN;
          END IF;

          IF v_compte.blocage_actif = TRUE AND v_compte.blocage_fin IS NOT NULL THEN
              IF NOW() < v_compte.blocage_fin THEN
                  RETURN QUERY SELECT FALSE, ('Compte bloqué jusqu''au ' || TO_CHAR(v_compte.blocage_fin, 'DD/MM/YYYY'))::TEXT;
                  RETURN;
              END IF;
          END IF;

          RETURN QUERY SELECT TRUE, NULL::TEXT;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('[DB] ✓ check_withdrawal_eligibility()');

    // Auto-update timestamp when balance changes
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION update_compte_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          IF OLD.solde_courant IS DISTINCT FROM NEW.solde_courant THEN
              NEW.updated_at = NOW();
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.execute(sql`
      DROP TRIGGER IF EXISTS trg_compte_balance_update ON comptes;
      CREATE TRIGGER trg_compte_balance_update
      BEFORE UPDATE ON comptes
      FOR EACH ROW
      EXECUTE FUNCTION update_compte_timestamp();
    `);
    console.log('[DB] ✓ Trigger: trg_compte_balance_update');

    // ========================================================================
    // 5. CREDIT & REPAYMENT FUNCTIONS
    // ========================================================================

    // Calculate installment status based on payment state
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION calculate_echeance_status(
          p_date_echeance TIMESTAMP,
          p_montant_total NUMERIC,
          p_montant_paye NUMERIC
      ) RETURNS VARCHAR AS $$
      DECLARE
          v_status VARCHAR;
      BEGIN
          IF p_montant_paye >= p_montant_total THEN
              v_status := 'PAID';
          ELSIF p_montant_paye > 0 AND p_montant_paye < p_montant_total THEN
              v_status := 'PARTIALLY_PAID';
          ELSIF p_date_echeance < CURRENT_DATE AND p_montant_paye < p_montant_total THEN
              v_status := 'LATE';
          ELSIF p_date_echeance <= CURRENT_DATE + INTERVAL '7 days' THEN
              v_status := 'DUE';
          ELSE
              v_status := 'UPCOMING';
          END IF;

          RETURN v_status;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);
    console.log('[DB] ✓ calculate_echeance_status()');

    console.log(`[DB] ✅ All custom functions and triggers ensured in ${Date.now() - start}ms`);
  } catch (error) {
    console.error('[DB] ❌ Error ensuring custom functions:', error);
    throw error;
  }
}
