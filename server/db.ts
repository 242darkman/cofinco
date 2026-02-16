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
 * Ensures custom SQL functions, triggers, and views exist in the database.
 * Called on application startup to handle cases where db:push was used
 * instead of migrations (db:push only syncs tables, not functions/triggers).
 *
 * Consolidated from all historical SQL migrations. Single source of truth
 * for all DB routines.
 */
export async function ensureCustomFunctions(): Promise<void> {
  const start = Date.now();
  console.log('[DB] Ensuring custom SQL functions and triggers exist...');

  let objectCount = 0;

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
      objectCount++;
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
    objectCount++;

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
    objectCount++;

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
    objectCount++;

    // Create trigger for legacy account prevention
    await db.execute(sql`
      DROP TRIGGER IF EXISTS prevent_legacy_account_571 ON lignes_ecritures;
      CREATE TRIGGER prevent_legacy_account_571
          BEFORE INSERT ON lignes_ecritures
          FOR EACH ROW
          EXECUTE FUNCTION check_no_legacy_accounts();
    `);
    console.log('[DB] ✓ Trigger: prevent_legacy_account_571');
    objectCount++;

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
    objectCount++;

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
    objectCount++;

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
    objectCount++;

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
    objectCount++;

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
    objectCount++;

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
    objectCount += 2;

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
    objectCount += 2;

    // Feature flag helpers (from 0066_rbac_hardening)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION get_feature_flag(p_flag_key TEXT)
        RETURNS BOOLEAN AS $$
        DECLARE
          v_value BOOLEAN;
        BEGIN
          SELECT flag_value INTO v_value
          FROM system_feature_flags
          WHERE flag_key = p_flag_key;

          RETURN COALESCE(v_value, false);
        END;
        $$ LANGUAGE plpgsql STABLE;
      `);
      console.log('[DB] ✓ get_feature_flag()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "get_feature_flag":', err instanceof Error ? err.message : err);
    }

    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION set_feature_flag(p_flag_key TEXT, p_value BOOLEAN, p_user_id UUID DEFAULT NULL)
        RETURNS BOOLEAN AS $$
        BEGIN
          UPDATE system_feature_flags
          SET
            flag_value = p_value,
            enabled_at = CASE WHEN p_value THEN NOW() ELSE NULL END,
            enabled_by = p_user_id,
            updated_at = NOW()
          WHERE flag_key = p_flag_key
            AND is_system = false;

          RETURN FOUND;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ set_feature_flag()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "set_feature_flag":', err instanceof Error ? err.message : err);
    }

    // Check if permission is critical (from 0066_rbac_hardening)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION is_critical_permission(p_permission_code TEXT)
        RETURNS BOOLEAN AS $$
        DECLARE
          v_is_critical BOOLEAN := false;
        BEGIN
          SELECT EXISTS (
            SELECT 1 FROM critical_permission_patterns
            WHERE p_permission_code LIKE REPLACE(pattern, '%', '') || '%'
               OR p_permission_code = pattern
          ) INTO v_is_critical;

          RETURN v_is_critical;
        END;
        $$ LANGUAGE plpgsql STABLE;
      `);
      console.log('[DB] ✓ is_critical_permission()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "is_critical_permission":', err instanceof Error ? err.message : err);
    }

    // Audit user permission changes trigger (from 0066_rbac_hardening)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION trigger_audit_user_permission_change()
        RETURNS TRIGGER AS $$
        DECLARE
          v_version_before BIGINT;
          v_version_after BIGINT;
          v_permission_code TEXT;
          v_actor_id UUID;
        BEGIN
          SELECT get_rbac_version() INTO v_version_before;

          SELECT code INTO v_permission_code
          FROM permissions
          WHERE id = COALESCE(NEW.permission_id, OLD.permission_id);

          v_actor_id := COALESCE(NEW.granted_by, OLD.granted_by);

          IF get_feature_flag('RBAC_AUDIT_LOG_ENABLED') THEN
            INSERT INTO rbac_audit_log (
              actor_user_id,
              target_user_id,
              action,
              permission_id,
              permission_code,
              old_value,
              new_value,
              scope,
              agence_id,
              reason,
              rbac_version_before,
              metadata
            ) VALUES (
              COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'::UUID),
              COALESCE(NEW.user_id, OLD.user_id),
              CASE TG_OP
                WHEN 'INSERT' THEN 'TOGGLE'::rbac_audit_action
                WHEN 'UPDATE' THEN 'TOGGLE'::rbac_audit_action
                WHEN 'DELETE' THEN 'RESET'::rbac_audit_action
              END,
              COALESCE(NEW.permission_id, OLD.permission_id),
              v_permission_code,
              OLD.granted,
              NEW.granted,
              COALESCE(NEW.scope, OLD.scope, 'GLOBAL'),
              COALESCE(NEW.agence_id, OLD.agence_id),
              COALESCE(NEW.reason, OLD.reason),
              v_version_before,
              jsonb_build_object(
                'operation', TG_OP,
                'conditions', NEW.conditions,
                'table', 'user_permissions'
              )
            );
          END IF;

          RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS audit_user_permission_change ON user_permissions;
        CREATE TRIGGER audit_user_permission_change
          AFTER INSERT OR UPDATE OR DELETE ON user_permissions
          FOR EACH ROW
          EXECUTE FUNCTION trigger_audit_user_permission_change();
      `);
      console.log('[DB] ✓ trigger_audit_user_permission_change() + Trigger: audit_user_permission_change');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "trigger_audit_user_permission_change":', err instanceof Error ? err.message : err);
    }

    // Increment user RBAC version (from 0066_rbac_hardening)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION increment_user_rbac_version(p_user_id UUID)
        RETURNS BIGINT AS $$
        DECLARE
          v_new_version BIGINT;
        BEGIN
          UPDATE users
          SET rbac_version = rbac_version + 1, updated_at = NOW()
          WHERE id = p_user_id
          RETURNING rbac_version INTO v_new_version;

          RETURN v_new_version;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ increment_user_rbac_version()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "increment_user_rbac_version":', err instanceof Error ? err.message : err);
    }

    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION trigger_increment_user_rbac_version()
        RETURNS TRIGGER AS $$
        BEGIN
          PERFORM increment_user_rbac_version(COALESCE(NEW.user_id, OLD.user_id));
          RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS user_rbac_version_on_permission ON user_permissions;
        CREATE TRIGGER user_rbac_version_on_permission
          AFTER INSERT OR UPDATE OR DELETE ON user_permissions
          FOR EACH ROW
          EXECUTE FUNCTION trigger_increment_user_rbac_version();
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS user_rbac_version_on_temp_permission ON temporary_permissions;
        CREATE TRIGGER user_rbac_version_on_temp_permission
          AFTER INSERT OR UPDATE OR DELETE ON temporary_permissions
          FOR EACH ROW
          EXECUTE FUNCTION trigger_increment_user_rbac_version();
      `);
      console.log('[DB] ✓ trigger_increment_user_rbac_version() + Triggers: user_rbac_version_on_permission, user_rbac_version_on_temp_permission');
      objectCount += 3;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "trigger_increment_user_rbac_version":', err instanceof Error ? err.message : err);
    }

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

          IF v_compte.statut = 'SUSPENDED' THEN
              RETURN QUERY SELECT FALSE, 'Compte suspendu'::TEXT;
              RETURN;
          END IF;

          IF v_compte.statut = 'CLOSED' THEN
              RETURN QUERY SELECT FALSE, 'Compte clôturé'::TEXT;
              RETURN;
          END IF;

          IF v_compte.type_compte = 'BLOCKED' AND v_compte.blocage_actif = TRUE THEN
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
    objectCount++;

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
    objectCount += 2;

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
    objectCount++;

    // ========================================================================
    // 6. SESSIONS & CAISSE FUNCTIONS (from 0003, 0011)
    // ========================================================================

    // Cleanup expired sessions (from 0003_add_active_sessions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
        RETURNS void AS $$
        BEGIN
          DELETE FROM "active_sessions" WHERE "expires_at" < NOW();
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ cleanup_expired_sessions()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "cleanup_expired_sessions":', err instanceof Error ? err.message : err);
    }

    // Update session heartbeat (from 0011_robust_caisse_sessions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_session_heartbeat()
        RETURNS TRIGGER AS $$
        BEGIN
          UPDATE sessions_caisse
          SET last_activity = NOW()
          WHERE id = NEW.session_id AND statut = 'OPEN';

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trigger_update_session_heartbeat ON operations_caisse;
        CREATE TRIGGER trigger_update_session_heartbeat
          AFTER INSERT ON operations_caisse
          FOR EACH ROW
          EXECUTE FUNCTION update_session_heartbeat();
      `);
      console.log('[DB] ✓ update_session_heartbeat() + Trigger: trigger_update_session_heartbeat');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "update_session_heartbeat":', err instanceof Error ? err.message : err);
    }

    // Close expired sessions (from 0011_robust_caisse_sessions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION close_expired_sessions(timeout_hours INTEGER DEFAULT 12)
        RETURNS TABLE (
          session_id UUID,
          caisse_id UUID,
          caissier_id UUID,
          opened_at TIMESTAMP,
          last_activity TIMESTAMP,
          hours_inactive NUMERIC
        ) AS $$
        DECLARE
          expired_session RECORD;
          session_ops RECORD;
          calculated_solde NUMERIC;
        BEGIN
          FOR expired_session IN
            SELECT s.*
            FROM sessions_caisse s
            WHERE s.statut = 'OPEN'
            AND s.last_activity < NOW() - (timeout_hours || ' hours')::INTERVAL
          LOOP
            SELECT
              COALESCE(SUM(
                CASE
                  WHEN o.type_operation IN ('SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'MISC_COLLECTION', 'CREDIT_REPAYMENT', 'LOAN_REPAYMENT', 'ENGAGEMENT_FEE', 'SAFE_SUPPLY', 'INITIAL_DEPOSIT')
                  THEN CAST(o.montant AS NUMERIC)
                  WHEN o.type_operation IN ('SAVINGS_WITHDRAWAL', 'WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'MISC_DISBURSEMENT', 'CREDIT_DISBURSEMENT', 'LOAN_DISBURSEMENT', 'FEE', 'SAFE_DEPOSIT', 'FEE_REFUND')
                  THEN -CAST(o.montant AS NUMERIC)
                  ELSE 0
                END
              ), 0) INTO calculated_solde
            FROM operations_caisse o
            WHERE o.session_id = expired_session.id;

            calculated_solde := CAST(expired_session.montant_ouverture AS NUMERIC) + calculated_solde;

            UPDATE sessions_caisse
            SET
              statut = 'CLOSED',
              closed_at = NOW(),
              montant_fermeture_theorique = calculated_solde::TEXT,
              closed_reason = 'timeout',
              observations = COALESCE(observations, '') ||
                E'\n[AUTO-FERMETURE] Session expirée après ' || timeout_hours || 'h d''inactivité. ' ||
                'Dernière activité: ' || expired_session.last_activity::TEXT
            WHERE id = expired_session.id;

            session_id := expired_session.id;
            caisse_id := expired_session.caisse_id;
            caissier_id := expired_session.caissier_id;
            opened_at := expired_session.date_ouverture;
            last_activity := expired_session.last_activity;
            hours_inactive := EXTRACT(EPOCH FROM (NOW() - expired_session.last_activity)) / 3600;

            RETURN NEXT;
          END LOOP;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ close_expired_sessions()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "close_expired_sessions":', err instanceof Error ? err.message : err);
    }

    // Audit session changes (from 0011_robust_caisse_sessions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION audit_session_changes()
        RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            INSERT INTO sessions_caisse_audit_logs (session_id, action, statut_apres, details)
            VALUES (
              NEW.id,
              'OPENED',
              NEW.statut,
              jsonb_build_object(
                'montant_ouverture', NEW.montant_ouverture,
                'caisse_id', NEW.caisse_id,
                'caissier_id', NEW.caissier_id,
                'billetage_ouverture', NEW.billetage_ouverture
              )
            );
            RETURN NEW;
          ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.statut != NEW.statut THEN
              INSERT INTO sessions_caisse_audit_logs (session_id, action, statut_avant, statut_apres, details)
              VALUES (
                NEW.id,
                CASE
                  WHEN NEW.statut = 'CLOSED' AND NEW.closed_reason = 'timeout' THEN 'TIMEOUT'
                  WHEN NEW.statut = 'CLOSED' AND NEW.closed_reason = 'admin' THEN 'ADMIN_CLOSED'
                  WHEN NEW.statut = 'CLOSED' THEN 'CLOSED'
                  ELSE 'STATUS_CHANGE'
                END,
                OLD.statut,
                NEW.statut,
                jsonb_build_object(
                  'montant_fermeture_theorique', NEW.montant_fermeture_theorique,
                  'montant_fermeture_declare', NEW.montant_fermeture_declare,
                  'ecart', NEW.ecart,
                  'billetage_fermeture', NEW.billetage_fermeture,
                  'observations', NEW.observations,
                  'closed_reason', NEW.closed_reason
                )
              );
            END IF;
            RETURN NEW;
          END IF;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trigger_audit_session_changes ON sessions_caisse;
        CREATE TRIGGER trigger_audit_session_changes
          AFTER INSERT OR UPDATE ON sessions_caisse
          FOR EACH ROW
          EXECUTE FUNCTION audit_session_changes();
      `);
      console.log('[DB] ✓ audit_session_changes() + Trigger: trigger_audit_session_changes');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "audit_session_changes":', err instanceof Error ? err.message : err);
    }

    // Get risky sessions (from 0011_robust_caisse_sessions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION get_risky_sessions(
          warning_hours INTEGER DEFAULT 6,
          critical_hours INTEGER DEFAULT 10
        )
        RETURNS TABLE (
          session_id UUID,
          caisse_nom TEXT,
          caissier_nom TEXT,
          hours_inactive NUMERIC,
          risk_level TEXT,
          solde_current NUMERIC
        ) AS $$
        BEGIN
          RETURN QUERY
          SELECT
            s.id,
            c.nom,
            u.nom || ' ' || COALESCE(u.prenom, ''),
            EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600,
            CASE
              WHEN EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600 >= critical_hours THEN 'CRITICAL'
              WHEN EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600 >= warning_hours THEN 'WARNING'
              ELSE 'OK'
            END,
            CAST(s.montant_ouverture AS NUMERIC) + COALESCE(
              (SELECT SUM(
                CASE
                  WHEN o.type_operation IN ('SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'MISC_COLLECTION', 'CREDIT_REPAYMENT', 'LOAN_REPAYMENT', 'ENGAGEMENT_FEE', 'SAFE_SUPPLY', 'INITIAL_DEPOSIT')
                  THEN CAST(o.montant AS NUMERIC)
                  WHEN o.type_operation IN ('SAVINGS_WITHDRAWAL', 'WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'MISC_DISBURSEMENT', 'CREDIT_DISBURSEMENT', 'LOAN_DISBURSEMENT', 'FEE', 'SAFE_DEPOSIT', 'FEE_REFUND')
                  THEN -CAST(o.montant AS NUMERIC)
                  ELSE 0
                END
              ) FROM operations_caisse o WHERE o.session_id = s.id), 0
            )
          FROM sessions_caisse s
          LEFT JOIN caisses c ON s.caisse_id = c.id
          LEFT JOIN users u ON s.caissier_id = u.id
          WHERE s.statut = 'OPEN'
          AND EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 3600 >= warning_hours
          ORDER BY EXTRACT(EPOCH FROM (NOW() - s.last_activity)) DESC;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ get_risky_sessions()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "get_risky_sessions":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 7. TONTINES FUNCTIONS (from 0031_tontine_production_ready)
    // ========================================================================

    // Generate tontine calendar
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION generate_tontine_calendar(
            p_tontine_id UUID,
            p_cycle_id UUID,
            p_user_id UUID,
            p_random_seed INTEGER DEFAULT NULL
        ) RETURNS TABLE (
            schedules_created INTEGER,
            turns_created INTEGER,
            audit_id UUID
        ) AS $$
        DECLARE
            v_tontine RECORD;
            v_members UUID[];
            v_member_count INTEGER;
            v_current_date DATE;
            v_due_date DATE;
            v_interval INTERVAL;
            v_turn_order JSONB;
            v_audit_id UUID;
            v_schedules_count INTEGER := 0;
            v_turns_count INTEGER := 0;
            v_seed INTEGER;
            i INTEGER;
        BEGIN
            SELECT t.*, tc.start_date AS cycle_start
            INTO v_tontine
            FROM tontines t
            JOIN tontine_cycles tc ON tc.id = p_cycle_id
            WHERE t.id = p_tontine_id;

            IF v_tontine IS NULL THEN
                RAISE EXCEPTION 'Tontine ou cycle non trouvé';
            END IF;

            SELECT ARRAY_AGG(id ORDER BY position NULLS LAST, date_adhesion)
            INTO v_members
            FROM membres_tontine
            WHERE tontine_id = p_tontine_id AND statut = 'ACTIVE' AND deleted_at IS NULL;

            v_member_count := COALESCE(array_length(v_members, 1), 0);

            IF v_member_count = 0 THEN
                RAISE EXCEPTION 'Aucun membre actif dans la tontine';
            END IF;

            v_interval := CASE v_tontine.frequence
                WHEN 'DAILY' THEN INTERVAL '1 day' * v_tontine.intervalle_cotisation
                WHEN 'WEEKLY' THEN INTERVAL '1 week' * v_tontine.intervalle_cotisation
                WHEN 'BIWEEKLY' THEN INTERVAL '2 weeks' * v_tontine.intervalle_cotisation
                WHEN 'MONTHLY' THEN INTERVAL '1 month' * v_tontine.intervalle_cotisation
                WHEN 'BIMONTHLY' THEN INTERVAL '2 months' * v_tontine.intervalle_cotisation
                WHEN 'QUARTERLY' THEN INTERVAL '3 months' * v_tontine.intervalle_cotisation
                ELSE INTERVAL '1 month'
            END;

            v_current_date := v_tontine.cycle_start;

            FOR i IN 1..v_member_count LOOP
                v_due_date := v_current_date + (v_interval * (i - 1));

                INSERT INTO tontine_schedules (
                    agence_id, tontine_id, cycle_id, period_number, due_date,
                    amount_expected_per_member, status
                ) VALUES (
                    v_tontine.agence_id, p_tontine_id, p_cycle_id, i, v_due_date,
                    v_tontine.montant_cotisation, 'UPCOMING'
                );
                v_schedules_count := v_schedules_count + 1;

                INSERT INTO tontine_turns (
                    agence_id, tontine_id, cycle_id, turn_number,
                    beneficiary_member_id, due_date, amount_expected, status
                ) VALUES (
                    v_tontine.agence_id, p_tontine_id, p_cycle_id, i,
                    v_members[i], v_due_date,
                    v_tontine.montant_cotisation * v_member_count,
                    'SCHEDULED'
                );
                v_turns_count := v_turns_count + 1;
            END LOOP;

            IF v_tontine.type_distribution = 'RANDOM' THEN
                v_seed := COALESCE(p_random_seed, (EXTRACT(EPOCH FROM NOW()) * 1000)::INTEGER);

                UPDATE tontine_turns tt
                SET beneficiary_member_id = (
                    SELECT m.id
                    FROM membres_tontine m
                    WHERE m.tontine_id = p_tontine_id AND m.statut = 'ACTIVE' AND m.deleted_at IS NULL
                    ORDER BY md5(m.id::text || v_seed::text)
                    OFFSET tt.turn_number - 1 LIMIT 1
                )
                WHERE tt.cycle_id = p_cycle_id;
            END IF;

            v_turn_order := (
                SELECT jsonb_agg(jsonb_build_object('turn_number', turn_number, 'member_id', beneficiary_member_id))
                FROM tontine_turns WHERE cycle_id = p_cycle_id ORDER BY turn_number
            );

            INSERT INTO tontine_turn_audit (
                agence_id, tontine_id, cycle_id, action_type, new_order,
                reason, changed_by, metadata
            ) VALUES (
                v_tontine.agence_id, p_tontine_id, p_cycle_id, 'INITIAL_GENERATION',
                v_turn_order, 'Génération initiale du calendrier',
                p_user_id, jsonb_build_object('seed', v_seed, 'distribution_type', v_tontine.type_distribution)
            ) RETURNING id INTO v_audit_id;

            RETURN QUERY SELECT v_schedules_count, v_turns_count, v_audit_id;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ generate_tontine_calendar()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "generate_tontine_calendar":', err instanceof Error ? err.message : err);
    }

    // Calculate tontine retirable amount
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION calculate_tontine_retirable(
            p_tontine_id UUID,
            p_member_id UUID
        ) RETURNS TABLE (
            pot_disponible NUMERIC,
            droits_membre NUMERIC,
            penalites_deduire NUMERIC,
            montant_retirable NUMERIC,
            peut_retirer BOOLEAN,
            raison TEXT
        ) AS $$
        DECLARE
            v_tontine RECORD;
            v_member RECORD;
            v_pot NUMERIC;
            v_droits NUMERIC;
            v_penalites NUMERIC;
            v_retirable NUMERIC;
            v_can_withdraw BOOLEAN;
            v_reason TEXT;
            v_member_count INTEGER;
        BEGIN
            SELECT * INTO v_tontine FROM tontines WHERE id = p_tontine_id AND deleted_at IS NULL;
            IF v_tontine IS NULL THEN
                RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, FALSE, 'Tontine non trouvée'::TEXT;
                RETURN;
            END IF;

            SELECT * INTO v_member FROM membres_tontine WHERE id = p_member_id AND deleted_at IS NULL;
            IF v_member IS NULL THEN
                RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, FALSE, 'Membre non trouvé'::TEXT;
                RETURN;
            END IF;

            IF v_member.statut != 'ACTIVE' THEN
                v_can_withdraw := FALSE;
                v_reason := 'Membre non actif';
            ELSIF v_member.a_recu_benefice THEN
                v_can_withdraw := FALSE;
                v_reason := 'Bénéfice déjà reçu pour ce cycle';
            ELSE
                v_can_withdraw := TRUE;
                v_reason := NULL;
            END IF;

            v_pot := COALESCE(v_tontine.solde, 0);

            SELECT COUNT(*) INTO v_member_count
            FROM membres_tontine WHERE tontine_id = p_tontine_id AND statut = 'ACTIVE' AND deleted_at IS NULL;

            v_droits := v_tontine.montant_cotisation * v_member_count;

            SELECT COALESCE(SUM(montant), 0) INTO v_penalites
            FROM tontine_penalites
            WHERE membre_id = p_member_id AND statut = 'PENDING' AND deleted_at IS NULL;

            v_retirable := LEAST(v_pot, v_droits - v_penalites);
            IF v_retirable < 0 THEN v_retirable := 0; END IF;

            IF v_can_withdraw AND v_retirable < v_droits THEN
                v_reason := 'Pot insuffisant (distribution partielle possible)';
            END IF;

            RETURN QUERY SELECT v_pot, v_droits, v_penalites, v_retirable, v_can_withdraw, v_reason;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ calculate_tontine_retirable()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "calculate_tontine_retirable":', err instanceof Error ? err.message : err);
    }

    // Auto-lock turn when distribution starts
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION tontine_turn_auto_lock() RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' AND NEW.turn_id IS NOT NULL THEN
                UPDATE tontine_turns
                SET is_locked = TRUE,
                    locked_at = NOW(),
                    locked_reason = 'Distribution request created'
                WHERE id = NEW.turn_id AND NOT is_locked;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_tontine_turn_auto_lock ON tontine_distribution_requests;
        CREATE TRIGGER trg_tontine_turn_auto_lock
            AFTER INSERT ON tontine_distribution_requests
            FOR EACH ROW EXECUTE FUNCTION tontine_turn_auto_lock();
      `);
      console.log('[DB] ✓ tontine_turn_auto_lock() + Trigger: trg_tontine_turn_auto_lock');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "tontine_turn_auto_lock":', err instanceof Error ? err.message : err);
    }

    // Update cycle totals on contribution
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_cycle_totals_on_contribution() RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.cycle_id IS NOT NULL AND NEW.statut_transaction = 'POSTED' THEN
                UPDATE tontine_cycles
                SET pot_collected = pot_collected + NEW.montant,
                    updated_at = NOW()
                WHERE id = NEW.cycle_id;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_update_cycle_totals_contrib ON contributions_tontine;
        CREATE TRIGGER trg_update_cycle_totals_contrib
            AFTER INSERT OR UPDATE ON contributions_tontine
            FOR EACH ROW
            WHEN (NEW.statut_transaction = 'POSTED')
            EXECUTE FUNCTION update_cycle_totals_on_contribution();
      `);
      console.log('[DB] ✓ update_cycle_totals_on_contribution() + Trigger: trg_update_cycle_totals_contrib');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "update_cycle_totals_on_contribution":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 8. AGENT TERRAIN FUNCTIONS (from 0032_agent_terrain_production)
    // ========================================================================

    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION calculate_remise_totals(p_remise_id UUID)
        RETURNS TABLE(
          total_items INTEGER,
          montant_calcule NUMERIC,
          by_type JSONB
        ) AS $$
        BEGIN
          RETURN QUERY
          SELECT
            COUNT(*)::INTEGER AS total_items,
            COALESCE(SUM(ri.montant), 0) AS montant_calcule,
            jsonb_object_agg(ri.type_paiement, item_totals.total) AS by_type
          FROM remise_items ri
          LEFT JOIN LATERAL (
            SELECT ri2.type_paiement, SUM(ri2.montant) AS total
            FROM remise_items ri2
            WHERE ri2.remise_id = p_remise_id
            GROUP BY ri2.type_paiement
          ) item_totals ON true
          WHERE ri.remise_id = p_remise_id;
        END;
        $$ LANGUAGE plpgsql STABLE;
      `);
      console.log('[DB] ✓ calculate_remise_totals()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "calculate_remise_totals":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 9. AGENCY MANAGEMENT FUNCTIONS (from 0033_agency_feature_locks)
    // ========================================================================

    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_agency_feature_locks_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trigger_agency_feature_locks_updated_at ON agency_feature_locks;
        CREATE TRIGGER trigger_agency_feature_locks_updated_at
          BEFORE UPDATE ON agency_feature_locks
          FOR EACH ROW
          EXECUTE FUNCTION update_agency_feature_locks_updated_at();
      `);
      console.log('[DB] ✓ update_agency_feature_locks_updated_at() + Trigger: trigger_agency_feature_locks_updated_at');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "update_agency_feature_locks_updated_at":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 10. HR MODULE FUNCTIONS (from 0035_hr_production_ready)
    // ========================================================================

    // Calculate business days (excluding weekends)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION calculate_business_days(start_date DATE, end_date DATE)
        RETURNS INTEGER AS $$
        DECLARE
          total_days INTEGER;
          full_weeks INTEGER;
          remaining_days INTEGER;
          start_dow INTEGER;
          end_dow INTEGER;
          weekend_days INTEGER;
        BEGIN
          IF start_date > end_date THEN
            RETURN 0;
          END IF;

          total_days := end_date - start_date + 1;
          full_weeks := total_days / 7;
          remaining_days := total_days % 7;
          weekend_days := full_weeks * 2;

          start_dow := EXTRACT(DOW FROM start_date);
          end_dow := EXTRACT(DOW FROM end_date);

          IF remaining_days > 0 THEN
            IF start_dow = 0 THEN
              weekend_days := weekend_days + 1;
            ELSIF start_dow = 6 THEN
              weekend_days := weekend_days + 2;
            ELSIF start_dow + remaining_days > 6 THEN
              weekend_days := weekend_days + LEAST(2, start_dow + remaining_days - 6);
            END IF;
          END IF;

          RETURN GREATEST(0, total_days - weekend_days);
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
      `);
      console.log('[DB] ✓ calculate_business_days()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "calculate_business_days":', err instanceof Error ? err.message : err);
    }

    // Check leave overlap
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION check_leave_overlap(
          p_employe_id UUID,
          p_date_debut DATE,
          p_date_fin DATE,
          p_exclude_id INTEGER DEFAULT NULL
        )
        RETURNS BOOLEAN AS $$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM demandes_conges dc
            WHERE dc.employe_id = p_employe_id
              AND dc.statut IN ('PENDING', 'APPROVED')
              AND dc.id != COALESCE(p_exclude_id, -1)
              AND (
                (p_date_debut BETWEEN dc.date_debut AND dc.date_fin)
                OR (p_date_fin BETWEEN dc.date_debut AND dc.date_fin)
                OR (dc.date_debut BETWEEN p_date_debut AND p_date_fin)
              )
          );
        END;
        $$ LANGUAGE plpgsql STABLE;
      `);
      console.log('[DB] ✓ check_leave_overlap()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "check_leave_overlap":', err instanceof Error ? err.message : err);
    }

    // Get leave balance
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION get_leave_balance(
          p_employe_id UUID,
          p_leave_type VARCHAR DEFAULT 'Congé Annuel'
        )
        RETURNS INTEGER AS $$
        DECLARE
          v_balance INTEGER;
        BEGIN
          SELECT (lb.acquired + lb.carry_over - lb.used - lb.pending)
          INTO v_balance
          FROM leave_balances lb
          WHERE lb.employe_id = p_employe_id
            AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)
            AND lb.leave_type = p_leave_type;

          RETURN COALESCE(v_balance, 0);
        END;
        $$ LANGUAGE plpgsql STABLE;
      `);
      console.log('[DB] ✓ get_leave_balance()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "get_leave_balance":', err instanceof Error ? err.message : err);
    }

    // HR audit trigger function
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION hr_audit_trigger_fn()
        RETURNS TRIGGER AS $$
        DECLARE
          v_old_values JSONB;
          v_new_values JSONB;
          v_action VARCHAR(50);
          v_entity_type VARCHAR(50);
        BEGIN
          v_entity_type := TG_TABLE_NAME;

          IF TG_OP = 'INSERT' THEN
            v_action := 'created';
            v_old_values := NULL;
            v_new_values := to_jsonb(NEW);
          ELSIF TG_OP = 'UPDATE' THEN
            v_action := 'updated';
            v_old_values := to_jsonb(OLD);
            v_new_values := to_jsonb(NEW);
          ELSIF TG_OP = 'DELETE' THEN
            v_action := 'deleted';
            v_old_values := to_jsonb(OLD);
            v_new_values := NULL;
          END IF;

          INSERT INTO hr_audit_log (
            entity_type,
            entity_id,
            action,
            old_values,
            new_values,
            created_at
          ) VALUES (
            v_entity_type,
            COALESCE(NEW.id::text, OLD.id::text),
            v_action,
            v_old_values,
            v_new_values,
            NOW()
          );

          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          ELSE
            RETURN NEW;
          END IF;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ hr_audit_trigger_fn()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "hr_audit_trigger_fn":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 11. SCHEDULED TRANSFERS FUNCTIONS (from 0036_scheduled_transfers_production_ready)
    // ========================================================================

    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION compute_next_execution(
            p_base_date TIMESTAMP,
            p_frequence TEXT,
            p_timezone TEXT DEFAULT 'Africa/Brazzaville',
            p_jour_execution INTEGER DEFAULT NULL
        ) RETURNS TIMESTAMP AS $$
        DECLARE
            v_next TIMESTAMP;
            v_day_of_month INTEGER;
        BEGIN
            v_next := p_base_date AT TIME ZONE p_timezone;

            CASE p_frequence
                WHEN 'ONCE' THEN
                    RETURN NULL;
                WHEN 'DAILY' THEN
                    v_next := v_next + INTERVAL '1 day';
                WHEN 'WEEKLY' THEN
                    v_next := v_next + INTERVAL '7 days';
                WHEN 'MONTHLY' THEN
                    v_day_of_month := COALESCE(p_jour_execution, EXTRACT(DAY FROM v_next)::INTEGER);
                    v_next := DATE_TRUNC('month', v_next) + INTERVAL '1 month';
                    v_day_of_month := LEAST(v_day_of_month, 28);
                    v_next := v_next + (v_day_of_month - 1) * INTERVAL '1 day';
                ELSE
                    RETURN NULL;
            END CASE;

            RETURN v_next AT TIME ZONE p_timezone AT TIME ZONE 'UTC';
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
      `);
      console.log('[DB] ✓ compute_next_execution()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "compute_next_execution":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 12. AUDIT & SETTINGS FUNCTIONS (from 0048, 0049, 0051)
    // ========================================================================

    // Get next settings version (from 0048_audit_trail_snapshots)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION get_next_settings_version(p_settings_type VARCHAR)
        RETURNS INTEGER AS $$
        DECLARE
          next_version INTEGER;
        BEGIN
          SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
          FROM settings_history
          WHERE settings_type = p_settings_type;
          RETURN next_version;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ get_next_settings_version()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "get_next_settings_version":', err instanceof Error ? err.message : err);
    }

    // Auto-set settings version on insert (from 0048_audit_trail_snapshots)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION set_settings_version()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.version IS NULL THEN
            NEW.version := get_next_settings_version(NEW.settings_type);
          END IF;

          UPDATE settings_history
          SET is_current = false
          WHERE settings_type = NEW.settings_type AND is_current = true;

          NEW.is_current := true;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_settings_version ON settings_history;
        CREATE TRIGGER trg_settings_version
        BEFORE INSERT ON settings_history
        FOR EACH ROW
        EXECUTE FUNCTION set_settings_version();
      `);
      console.log('[DB] ✓ set_settings_version() + Trigger: trg_settings_version');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "set_settings_version":', err instanceof Error ? err.message : err);
    }

    // Temporary permissions updated_at (from 0049_temporary_permissions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_temp_perm_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_temp_perm_updated ON temporary_permissions;
        CREATE TRIGGER trg_temp_perm_updated
        BEFORE UPDATE ON temporary_permissions
        FOR EACH ROW
        EXECUTE FUNCTION update_temp_perm_updated_at();
      `);
      console.log('[DB] ✓ update_temp_perm_updated_at() + Trigger: trg_temp_perm_updated');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "update_temp_perm_updated_at":', err instanceof Error ? err.message : err);
    }

    // Permission condition templates updated_at (from 0051_casl_conditions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_pct_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_pct_updated ON permission_condition_templates;
        CREATE TRIGGER trg_pct_updated
        BEFORE UPDATE ON permission_condition_templates
        FOR EACH ROW
        EXECUTE FUNCTION update_pct_updated_at();
      `);
      console.log('[DB] ✓ update_pct_updated_at() + Trigger: trg_pct_updated');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "update_pct_updated_at":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 13. PERMISSION ANALYTICS FUNCTIONS (from 0052_permission_analytics)
    // ========================================================================

    // Refresh permission stats materialized view
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION refresh_permission_stats()
        RETURNS void AS $$
        BEGIN
          REFRESH MATERIALIZED VIEW CONCURRENTLY permission_usage_stats;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ refresh_permission_stats()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "refresh_permission_stats":', err instanceof Error ? err.message : err);
    }

    // Purge old permission logs
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION purge_old_permission_logs(days_to_keep INTEGER DEFAULT 30)
        RETURNS INTEGER AS $$
        DECLARE
          deleted_count INTEGER;
        BEGIN
          DELETE FROM permission_usage_logs
          WHERE checked_at < NOW() - (days_to_keep || ' days')::INTERVAL;

          GET DIAGNOSTICS deleted_count = ROW_COUNT;
          RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ purge_old_permission_logs()');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "purge_old_permission_logs":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 14. CREDIT REEVALUATION FUNCTIONS (from 004-reevaluation-workflow)
    // ========================================================================

    // Set reevaluation version
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION set_reevaluation_version()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.numero_version := COALESCE(
                (SELECT MAX(numero_version) + 1
                 FROM reevaluations_credit
                 WHERE demande_id = NEW.demande_id),
                1
            );
            NEW.numero_reevaluation := 'REEV-' ||
                TO_CHAR(NOW(), 'YYYY') || '-' ||
                LPAD(NEW.numero_version::TEXT, 4, '0') || '-' ||
                SUBSTRING(NEW.demande_id::TEXT, 1, 8);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_set_reevaluation_version ON reevaluations_credit;
        CREATE TRIGGER trg_set_reevaluation_version
            BEFORE INSERT ON reevaluations_credit
            FOR EACH ROW
            EXECUTE FUNCTION set_reevaluation_version();
      `);
      console.log('[DB] ✓ set_reevaluation_version() + Trigger: trg_set_reevaluation_version');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "set_reevaluation_version":', err instanceof Error ? err.message : err);
    }

    // Lock reevaluation on final decision
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION lock_reevaluation_on_final()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.statut IN ('APPROVED', 'DEFINITIVELY_REJECTED', 'CANCELLED')
               AND OLD.statut != NEW.statut THEN
                NEW.verrouille := true;
                NEW.date_verrouillage := NOW();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_lock_reevaluation ON reevaluations_credit;
        CREATE TRIGGER trg_lock_reevaluation
            BEFORE UPDATE ON reevaluations_credit
            FOR EACH ROW
            EXECUTE FUNCTION lock_reevaluation_on_final();
      `);
      console.log('[DB] ✓ lock_reevaluation_on_final() + Trigger: trg_lock_reevaluation');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "lock_reevaluation_on_final":', err instanceof Error ? err.message : err);
    }

    // Sync demande status with reevaluation status
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION sync_demande_reevaluation_status()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.statut = 'APPROVED' THEN
                UPDATE demandes_credit
                SET statut = 'APPROVED_AFTER_REEVALUATION',
                    montant_approuve = COALESCE(NEW.montant_approuve_comite, NEW.nouveau_montant_demande, montant_demande),
                    reevaluation_en_cours = false,
                    nombre_reevaluations = nombre_reevaluations + 1
                WHERE id = NEW.demande_id;
            ELSIF NEW.statut = 'DEFINITIVELY_REJECTED' THEN
                UPDATE demandes_credit
                SET statut = 'DEFINITIVELY_REJECTED',
                    reevaluation_en_cours = false,
                    nombre_reevaluations = nombre_reevaluations + 1
                WHERE id = NEW.demande_id;
            ELSIF NEW.statut IN ('REQUESTED', 'AUTHORIZED', 'ADDITIONAL_INVESTIGATION', 'IN_COMMITTEE') THEN
                UPDATE demandes_credit
                SET reevaluation_en_cours = true,
                    derniere_reevaluation_id = NEW.id,
                    date_derniere_reevaluation = NOW()
                WHERE id = NEW.demande_id;
            ELSIF NEW.statut IN ('REFUSED', 'CANCELLED') THEN
                UPDATE demandes_credit
                SET reevaluation_en_cours = false
                WHERE id = NEW.demande_id;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_sync_demande_reevaluation ON reevaluations_credit;
        CREATE TRIGGER trg_sync_demande_reevaluation
            AFTER INSERT OR UPDATE OF statut ON reevaluations_credit
            FOR EACH ROW
            EXECUTE FUNCTION sync_demande_reevaluation_status();
      `);
      console.log('[DB] ✓ sync_demande_reevaluation_status() + Trigger: trg_sync_demande_reevaluation');
      objectCount += 2;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create "sync_demande_reevaluation_status":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // 15. VIEWS (ALL views at the end, after all functions/triggers)
    // ========================================================================

    // VIEW: v_sessions_caisse_stats (from 0011_robust_caisse_sessions)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW v_sessions_caisse_stats AS
        SELECT
          s.id,
          s.caisse_id,
          s.caissier_id,
          s.agence_id,
          s.statut,
          s.opened_at,
          s.closed_at,
          s.montant_ouverture,
          s.montant_fermeture_theorique,
          s.montant_fermeture_declare,
          s.ecart,
          s.last_activity,
          s.timeout_at,
          s.closed_reason,
          EXTRACT(EPOCH FROM (NOW() - s.opened_at)) / 3600 AS hours_open,
          EXTRACT(EPOCH FROM (NOW() - s.last_activity)) / 60 AS minutes_since_activity,
          (SELECT COUNT(*) FROM operations_caisse o WHERE o.session_id = s.id) AS nb_operations,
          (SELECT COALESCE(SUM(CAST(o.montant AS NUMERIC)), 0)
           FROM operations_caisse o
           WHERE o.session_id = s.id
           AND o.type_operation::text IN ('SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'MISC_COLLECTION', 'CREDIT_REPAYMENT', 'LOAN_REPAYMENT', 'ENGAGEMENT_FEE', 'SAFE_SUPPLY', 'INITIAL_DEPOSIT')
          ) AS total_entrees,
          (SELECT COALESCE(SUM(CAST(o.montant AS NUMERIC)), 0)
           FROM operations_caisse o
           WHERE o.session_id = s.id
           AND o.type_operation::text IN ('SAVINGS_WITHDRAWAL', 'WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'MISC_DISBURSEMENT', 'CREDIT_DISBURSEMENT', 'LOAN_DISBURSEMENT', 'FEE', 'SAFE_DEPOSIT', 'FEE_REFUND')
          ) AS total_sorties,
          c.nom AS caisse_nom,
          u.nom AS caissier_nom,
          u.prenom AS caissier_prenom
        FROM sessions_caisse s
        LEFT JOIN caisses c ON s.caisse_id = c.id
        LEFT JOIN users u ON s.caissier_id = u.id;
      `);
      console.log('[DB] ✓ VIEW: v_sessions_caisse_stats');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "v_sessions_caisse_stats":', err instanceof Error ? err.message : err);
    }

    // VIEW: v_user_primary_roles (from 0021_auth_v3_clean_architecture)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW v_user_primary_roles AS
        SELECT
          ur.user_id,
          ur.role,
          ur.agence_id,
          u.nom,
          u.prenom,
          u.username,
          a.nom as agence_nom
        FROM user_roles ur
        JOIN users u ON ur.user_id = u.id
        LEFT JOIN agences a ON ur.agence_id = a.id
        WHERE ur.is_primary = true;
      `);
      console.log('[DB] ✓ VIEW: v_user_primary_roles');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "v_user_primary_roles":', err instanceof Error ? err.message : err);
    }

    // VIEW: v_tontine_dashboard (from 0031_tontine_production_ready)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW v_tontine_dashboard AS
        SELECT
            t.id AS tontine_id,
            t.agence_id,
            t.nom AS tontine_name,
            t.statut,
            t.montant_cotisation,
            t.frequence,

            COUNT(DISTINCT CASE WHEN m.statut = 'ACTIVE' THEN m.id END) AS membres_actifs,
            COUNT(DISTINCT CASE WHEN m.late_count > 0 THEN m.id END) AS membres_en_retard,

            COALESCE(SUM(c.montant) FILTER (WHERE c.statut_transaction = 'POSTED'), 0) AS pot_collecte,
            COALESCE(t.solde, 0) AS pot_solde,

            tc.cycle_number AS cycle_actuel,
            tc.status AS cycle_status,

            (SELECT tt.turn_number FROM tontine_turns tt
             WHERE tt.tontine_id = t.id AND tt.status IN ('SCHEDULED', 'READY')
             ORDER BY tt.turn_number LIMIT 1) AS prochain_tour,

            (SELECT u.nom || ' ' || COALESCE(u.prenom, '')
             FROM tontine_turns tt
             JOIN membres_tontine mt ON tt.beneficiary_member_id = mt.id
             JOIN clients cl ON mt.client_id = cl.id
             JOIN users u ON cl.user_id = u.id
             WHERE tt.tontine_id = t.id AND tt.status IN ('SCHEDULED', 'READY')
             ORDER BY tt.turn_number LIMIT 1) AS prochain_beneficiaire,

            COALESCE(SUM(p.montant) FILTER (WHERE p.statut = 'PENDING'), 0) AS penalites_impayees

        FROM tontines t
        LEFT JOIN membres_tontine m ON m.tontine_id = t.id AND m.deleted_at IS NULL
        LEFT JOIN contributions_tontine c ON c.tontine_id = t.id AND c.deleted_at IS NULL
        LEFT JOIN tontine_cycles tc ON tc.id = t.current_cycle_id
        LEFT JOIN tontine_penalites p ON p.tontine_id = t.id AND p.deleted_at IS NULL

        WHERE t.deleted_at IS NULL

        GROUP BY t.id, t.agence_id, t.nom, t.statut, t.montant_cotisation, t.frequence, t.solde,
                 tc.cycle_number, tc.status;
      `);
      console.log('[DB] ✓ VIEW: v_tontine_dashboard');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "v_tontine_dashboard":', err instanceof Error ? err.message : err);
    }

    // VIEW: v_tontine_member_retirable (from 0031_tontine_production_ready)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW v_tontine_member_retirable AS
        SELECT
            mt.id AS membre_id,
            mt.tontine_id,
            mt.client_id,
            t.agence_id,

            t.montant_cotisation * (SELECT COUNT(*) FROM membres_tontine WHERE tontine_id = t.id AND statut = 'ACTIVE') AS droits_theoriques,

            COALESCE(t.solde, 0) AS pot_disponible,

            COALESCE(
                (SELECT SUM(montant) FROM tontine_penalites WHERE membre_id = mt.id AND statut = 'PENDING' AND deleted_at IS NULL),
                0
            ) AS penalites_impayees,

            mt.a_recu_benefice AS deja_recu,

            LEAST(
                COALESCE(t.solde, 0),
                t.montant_cotisation * (SELECT COUNT(*) FROM membres_tontine WHERE tontine_id = t.id AND statut = 'ACTIVE')
                - COALESCE(
                    (SELECT SUM(montant) FROM tontine_penalites WHERE membre_id = mt.id AND statut = 'PENDING' AND deleted_at IS NULL),
                    0
                )
            ) AS montant_retirable,

            (mt.statut = 'ACTIVE' AND NOT COALESCE(mt.a_recu_benefice, FALSE)) AS peut_retirer

        FROM membres_tontine mt
        JOIN tontines t ON t.id = mt.tontine_id

        WHERE mt.deleted_at IS NULL AND t.deleted_at IS NULL;
      `);
      console.log('[DB] ✓ VIEW: v_tontine_member_retirable');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "v_tontine_member_retirable":', err instanceof Error ? err.message : err);
    }

    // VIEW: v_mouvements_gl_status (from 0062_fix_treasury_reconciliation)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW "v_mouvements_gl_status" AS
        SELECT
            mf.id,
            mf.reference,
            mf.montant,
            mf.sens,
            mf.source_module,
            mf.type_paiement,
            mf.methode_paiement,
            mf.gl_posting_status,
            mf.gl_posting_error,
            mf.created_at,
            ar.code AS rule_code,
            ar.name AS rule_name,
            ar.debit_account,
            ar.credit_account,
            CASE
                WHEN mf.gl_posting_status = 'POSTED' THEN 'OK'
                WHEN mf.gl_posting_status = 'PENDING' THEN 'En attente'
                WHEN mf.gl_posting_status = 'SKIPPED' THEN 'Règle manquante'
                WHEN mf.gl_posting_status = 'FAILED' THEN 'Erreur'
                ELSE 'Inconnu'
            END AS status_label
        FROM mouvements_financiers mf
        LEFT JOIN accounting_rules ar ON (
            ar.source_type = 'MOUVEMENT'
            AND ar.event_type = mf.type_paiement::text
            AND ar.active = true
            AND (ar.payment_method IS NULL OR ar.payment_method = mf.methode_paiement::text)
        )
        WHERE mf.requires_gl_posting = true
        ORDER BY mf.created_at DESC;
      `);
      console.log('[DB] ✓ VIEW: v_mouvements_gl_status');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "v_mouvements_gl_status":', err instanceof Error ? err.message : err);
    }

    // VIEW: unused_permissions (from 0052_permission_analytics)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW unused_permissions AS
        SELECT
          p.id,
          p.code,
          p.name,
          m.name as module_name,
          p.created_at
        FROM permissions p
        LEFT JOIN modules m ON m.id = p.module_id
        WHERE NOT EXISTS (
          SELECT 1 FROM permission_usage_logs pul
          WHERE pul.permission_code = p.code
        )
        ORDER BY p.created_at;
      `);
      console.log('[DB] ✓ VIEW: unused_permissions');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "unused_permissions":', err instanceof Error ? err.message : err);
    }

    // VIEW: v_effective_permissions (from 0066_rbac_hardening)
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW v_effective_permissions AS
        WITH user_role_perms AS (
          SELECT
            ur.user_id,
            p.id AS permission_id,
            p.code AS permission_code,
            p.name AS permission_name,
            rp.granted,
            'ROLE' AS source,
            ur.role::text AS source_role,
            NULL::UUID AS source_agence_id,
            rp.conditions
          FROM user_roles ur
          JOIN role_permissions rp ON rp.role = ur.role
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.is_primary = true
        ),
        temp_perms AS (
          SELECT
            tp.user_id,
            p.id AS permission_id,
            p.code AS permission_code,
            p.name AS permission_name,
            true AS granted,
            'TEMPORARY' AS source,
            NULL AS source_role,
            NULL::UUID AS source_agence_id,
            NULL::JSONB AS conditions
          FROM temporary_permissions tp
          JOIN permissions p ON p.id = tp.permission_id
          WHERE tp.is_active = true
            AND tp.expires_at > NOW()
        ),
        user_overrides AS (
          SELECT
            up.user_id,
            p.id AS permission_id,
            p.code AS permission_code,
            p.name AS permission_name,
            up.granted,
            'OVERRIDE' AS source,
            NULL AS source_role,
            NULL::UUID AS source_agence_id,
            up.conditions
          FROM user_permissions up
          JOIN permissions p ON p.id = up.permission_id
        )
        SELECT DISTINCT ON (user_id, permission_id)
          user_id,
          permission_id,
          permission_code,
          permission_name,
          granted,
          source,
          source_role,
          source_agence_id,
          conditions
        FROM (
          SELECT *, 1 AS priority FROM user_overrides
          UNION ALL
          SELECT *, 2 AS priority FROM temp_perms
          UNION ALL
          SELECT *, 3 AS priority FROM user_role_perms
        ) combined
        ORDER BY user_id, permission_id, priority ASC;
      `);
      console.log('[DB] ✓ VIEW: v_effective_permissions');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create VIEW "v_effective_permissions":', err instanceof Error ? err.message : err);
    }

    // MATERIALIZED VIEW: permission_usage_stats (from 0052_permission_analytics)
    try {
      await db.execute(sql`
        DROP MATERIALIZED VIEW IF EXISTS permission_usage_stats;
        CREATE MATERIALIZED VIEW permission_usage_stats AS
        SELECT
          permission_code,
          action,
          subject,
          COUNT(*) as total_checks,
          COUNT(*) FILTER (WHERE allowed = true) as allowed_count,
          COUNT(*) FILTER (WHERE allowed = false) as denied_count,
          COUNT(DISTINCT user_id) as unique_users,
          ROUND(100.0 * COUNT(*) FILTER (WHERE allowed = true) / NULLIF(COUNT(*), 0), 2) as allow_rate,
          MIN(checked_at) as first_check,
          MAX(checked_at) as last_check
        FROM permission_usage_logs
        GROUP BY permission_code, action, subject;
      `);

      // Index on materialized view
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pus_perm ON permission_usage_stats(permission_code);
      `);
      console.log('[DB] ✓ MATERIALIZED VIEW: permission_usage_stats');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create MATERIALIZED VIEW "permission_usage_stats":', err instanceof Error ? err.message : err);
    }

    // ============================================================
    // BALANCE GUARD — prevents direct balance updates without mouvement
    // ============================================================
    // Two-part mechanism:
    //   1. AFTER INSERT on mouvements_financiers → sets transaction-local flag
    //   2. BEFORE UPDATE on balance tables → blocks if flag is absent
    //
    // Bypass for seeds/migrations: SET LOCAL "app.balance_guard_bypass" = 'true';
    // ============================================================

    // Part 1: Auto-flag when mouvement is created in the current transaction
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_mouvement_flag()
        RETURNS TRIGGER AS $t$
        BEGIN
          PERFORM set_config('app.mouvement_created', 'true', true);
          RETURN NEW;
        END;
        $t$ LANGUAGE plpgsql;
      `);
      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_mouvement_flag ON mouvements_financiers;
        CREATE TRIGGER trg_mouvement_flag
          AFTER INSERT ON mouvements_financiers
          FOR EACH ROW EXECUTE FUNCTION fn_mouvement_flag();
      `);
      console.log('[DB] ✓ TRIGGER: trg_mouvement_flag (mouvements_financiers)');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create TRIGGER "trg_mouvement_flag":', err instanceof Error ? err.message : err);
    }

    // Part 2: Guard function — rejects balance updates unless mouvement flag or bypass is set
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_guard_balance_update()
        RETURNS TRIGGER AS $t$
        BEGIN
          -- Allow if mouvement was created in this transaction
          IF current_setting('app.mouvement_created', true) = 'true' THEN
            RETURN NEW;
          END IF;

          -- Allow if guard explicitly bypassed (seeds, migrations, admin ops)
          IF current_setting('app.balance_guard_bypass', true) = 'true' THEN
            RETURN NEW;
          END IF;

          RAISE EXCEPTION 'BALANCE_GUARD: direct balance update on % (id=%) blocked — create a mouvement_financier first',
            TG_TABLE_NAME, NEW.id
            USING ERRCODE = 'P0001';
        END;
        $t$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_guard_balance_update');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_guard_balance_update":', err instanceof Error ? err.message : err);
    }

    // Part 3: Attach guard triggers to all balance-bearing tables
    const balanceGuardTargets = [
      { table: 'comptes',      column: 'solde_courant' },
      { table: 'caisses',      column: 'solde' },
      { table: 'coffres_forts', column: 'solde' },
      { table: 'tontines',     column: 'solde' },
      { table: 'credits',      column: 'solde_restant' },
    ];

    for (const { table, column } of balanceGuardTargets) {
      try {
        await db.execute(sql.raw(`
          DROP TRIGGER IF EXISTS trg_guard_balance ON ${table};
          CREATE TRIGGER trg_guard_balance
            BEFORE UPDATE ON ${table}
            FOR EACH ROW
            WHEN (OLD.${column} IS DISTINCT FROM NEW.${column})
            EXECUTE FUNCTION fn_guard_balance_update();
        `));
        console.log(`[DB] ✓ TRIGGER: trg_guard_balance (${table}.${column})`);
        objectCount++;
      } catch (err) {
        console.warn(`[DB] ⚠ Failed to create TRIGGER "trg_guard_balance" on ${table}:`, err instanceof Error ? err.message : err);
      }
    }

    // Part 4: Period guard — prevents GL entries being created in CLOSED/LOCKED periods
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_guard_period_closed()
        RETURNS TRIGGER AS $t$
        DECLARE
          v_period_status TEXT;
          v_closed_at TIMESTAMPTZ;
        BEGIN
          -- Check if the GL period for this entry's agence/date is closed
          SELECT statut, closed_at INTO v_period_status, v_closed_at
          FROM gl_periods
          WHERE agence_id = NEW.agence_id
            AND year = EXTRACT(YEAR FROM NEW.date_ecriture)::INTEGER
            AND month = EXTRACT(MONTH FROM NEW.date_ecriture)::INTEGER;

          -- If period exists and is closed/locked, block the insert
          IF v_period_status IN ('CLOSED', 'LOCKED') THEN
            -- Allow bypass for explicit administrative corrections
            IF current_setting('app.period_guard_bypass', true) = 'true' THEN
              RETURN NEW;
            END IF;

            RAISE EXCEPTION 'PERIOD_GUARD: cannot create ecriture in CLOSED period (agence=%, year=%, month=%, closed_at=%)',
              NEW.agence_id,
              EXTRACT(YEAR FROM NEW.date_ecriture),
              EXTRACT(MONTH FROM NEW.date_ecriture),
              v_closed_at
              USING ERRCODE = 'P0002';
          END IF;

          RETURN NEW;
        END;
        $t$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_guard_period_closed');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_guard_period_closed":', err instanceof Error ? err.message : err);
    }

    try {
      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_guard_period ON ecritures_comptables;
        CREATE TRIGGER trg_guard_period
          BEFORE INSERT ON ecritures_comptables
          FOR EACH ROW
          EXECUTE FUNCTION fn_guard_period_closed();
      `);
      console.log('[DB] ✓ TRIGGER: trg_guard_period (ecritures_comptables)');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create TRIGGER "trg_guard_period":', err instanceof Error ? err.message : err);
    }

    // Part 5: Debit = Credit constraint — verifies SUM(debit) = SUM(credit) per ecriture
    // Uses a CONSTRAINT TRIGGER deferred to transaction end so all lines are inserted first
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_check_ecriture_balance()
        RETURNS TRIGGER AS $t$
        DECLARE
          v_total_debit  NUMERIC;
          v_total_credit NUMERIC;
          v_line_count   INTEGER;
          v_num_piece    TEXT;
        BEGIN
          SELECT SUM(debit), SUM(credit), COUNT(*)
          INTO v_total_debit, v_total_credit, v_line_count
          FROM lignes_ecritures
          WHERE ecriture_id = NEW.ecriture_id;

          -- Only validate when we have at least 2 lines (complete entry)
          IF v_line_count >= 2 THEN
            IF v_total_debit IS DISTINCT FROM v_total_credit THEN
              SELECT numero_piece INTO v_num_piece
              FROM ecritures_comptables WHERE id = NEW.ecriture_id;

              RAISE EXCEPTION 'BALANCE_CHECK: ecriture % (%) is unbalanced — debit=% credit=%',
                NEW.ecriture_id, COALESCE(v_num_piece, 'N/A'), v_total_debit, v_total_credit
                USING ERRCODE = 'P0003';
            END IF;
          END IF;

          RETURN NEW;
        END;
        $t$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_check_ecriture_balance');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_check_ecriture_balance":', err instanceof Error ? err.message : err);
    }

    try {
      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_check_ecriture_balance ON lignes_ecritures;
        CREATE CONSTRAINT TRIGGER trg_check_ecriture_balance
          AFTER INSERT ON lignes_ecritures
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW
          EXECUTE FUNCTION fn_check_ecriture_balance();
      `);
      console.log('[DB] ✓ TRIGGER: trg_check_ecriture_balance (lignes_ecritures, DEFERRED)');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create TRIGGER "trg_check_ecriture_balance":', err instanceof Error ? err.message : err);
    }

    // ── Entity versioning (optimistic locking for offline sync) ─────
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_increment_version()
        RETURNS trigger AS $$
        BEGIN
          NEW.version := COALESCE(OLD.version, 0) + 1;
          NEW.updated_at := NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_increment_version');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_increment_version":', err instanceof Error ? err.message : err);
    }

    // Apply version trigger to sync-relevant entities
    const versionedTables = [
      'clients', 'credits', 'remboursements', 'comptes',
      'transferts', 'tontines', 'remises_terrain', 'paiements_terrain', 'prospections'
    ];
    for (const tableName of versionedTables) {
      try {
        await db.execute(sql.raw(`
          DROP TRIGGER IF EXISTS trg_version_${tableName} ON ${tableName};
          CREATE TRIGGER trg_version_${tableName}
            BEFORE UPDATE ON ${tableName}
            FOR EACH ROW
            EXECUTE FUNCTION fn_increment_version();
        `));
        objectCount++;
      } catch (err) {
        console.warn(`[DB] ⚠ Failed to create version trigger for "${tableName}":`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[DB] ✓ TRIGGERS: fn_increment_version on ${versionedTables.length} tables`);

    // ── Idempotency keys cleanup ────────────────────────────────────
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_cleanup_expired_idempotency_keys()
        RETURNS void AS $$
        BEGIN
          DELETE FROM idempotency_keys WHERE expires_at <= NOW();
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_cleanup_expired_idempotency_keys');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_cleanup_expired_idempotency_keys":', err instanceof Error ? err.message : err);
    }

    // ── Outbox NOTIFY trigger (event-driven dispatch) ───────────────
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_notify_outbox_event()
        RETURNS trigger AS $$
        BEGIN
          PERFORM pg_notify('outbox_events', NEW.id::text);
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_notify_outbox_event');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_notify_outbox_event":', err instanceof Error ? err.message : err);
    }

    try {
      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_outbox_notify ON evenements_outbox;
        CREATE TRIGGER trg_outbox_notify
          AFTER INSERT ON evenements_outbox
          FOR EACH ROW
          EXECUTE FUNCTION fn_notify_outbox_event();
      `);
      console.log('[DB] ✓ TRIGGER: trg_outbox_notify (evenements_outbox → NOTIFY)');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create TRIGGER "trg_outbox_notify":', err instanceof Error ? err.message : err);
    }

    // ========================================================================
    // HR AUDIT TRIGGERS — attach hr_audit_trigger_fn() to critical HR tables
    // ========================================================================
    const hrAuditTables = [
      'bulletins_paie',
      'payroll_runs',
      'avantages_employes',
      'demandes_conges',
      'presences',
      'avances_salaire',
      'rubrique_definitions',
      'charge_definitions',
    ];
    for (const table of hrAuditTables) {
      try {
        await db.execute(sql.raw(`
          DROP TRIGGER IF EXISTS trg_hr_audit_${table} ON ${table};
          CREATE TRIGGER trg_hr_audit_${table}
            AFTER INSERT OR UPDATE OR DELETE ON ${table}
            FOR EACH ROW
            EXECUTE FUNCTION hr_audit_trigger_fn();
        `));
        objectCount++;
      } catch (err) {
        // Table may not exist yet — safe to skip
      }
    }
    console.log(`[DB] ✓ HR audit triggers attached to ${hrAuditTables.length} tables`);

    // ── Guard: Prevent orphan mouvements (PENDING GL at commit time) ──────
    // Un mouvement avec requires_gl_posting=true DOIT avoir son gl_posting_status
    // résolu (POSTED/SKIPPED/FAILED) avant le COMMIT de la transaction.
    // Si le status est encore PENDING au commit, c'est que le mouvement a été créé
    // en dehors de executeWithLedger() — ce qui viole l'invariant GL.
    try {
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_guard_mouvement_gl_pending()
        RETURNS trigger AS $$
        DECLARE
          current_status text;
        BEGIN
          -- Ne vérifier que les mouvements nécessitant un posting GL
          IF NEW.requires_gl_posting IS NOT TRUE THEN
            RETURN NEW;
          END IF;

          -- Relire le status actuel (la ligne a pu être UPDATE depuis l'INSERT)
          SELECT gl_posting_status INTO current_status
          FROM mouvements_financiers
          WHERE id = NEW.id;

          IF current_status = 'PENDING' THEN
            RAISE EXCEPTION 'MOUVEMENT_GL_GUARD: mouvement % still has gl_posting_status=PENDING at commit. Use executeWithLedger() to create mouvements with GL posting.', NEW.id;
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('[DB] ✓ FUNCTION: fn_guard_mouvement_gl_pending');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create FUNCTION "fn_guard_mouvement_gl_pending":', err instanceof Error ? err.message : err);
    }

    try {
      await db.execute(sql`
        DROP TRIGGER IF EXISTS trg_guard_mouvement_gl ON mouvements_financiers;
        CREATE CONSTRAINT TRIGGER trg_guard_mouvement_gl
          AFTER INSERT ON mouvements_financiers
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW
          EXECUTE FUNCTION fn_guard_mouvement_gl_pending();
      `);
      console.log('[DB] ✓ TRIGGER: trg_guard_mouvement_gl (anti-orphan, DEFERRED)');
      objectCount++;
    } catch (err) {
      console.warn('[DB] ⚠ Failed to create TRIGGER "trg_guard_mouvement_gl":', err instanceof Error ? err.message : err);
    }

    // ── One-time data migration: legacy account statuses → new status system ──
    try {
      await db.execute(sql`
        -- Migrate legacy account statuses to new status system
        UPDATE comptes SET statut = 'PENDING_PAYMENT' WHERE statut = 'PENDING_ACTIVATION';
        UPDATE comptes SET statut = 'PENDING_PAYMENT_AND_APPROVAL' WHERE statut = 'PENDING_VALIDATION';
        UPDATE comptes SET is_approved = true WHERE statut = 'ACTIVE' AND is_approved = false;
      `);
      console.log('[DB] ✓ DATA MIGRATION: legacy account statuses migrated');
    } catch (err) {
      console.warn('[DB] ⚠ Failed data migration "legacy account statuses":', err instanceof Error ? err.message : err);
    }

    console.log(`[DB] All ${objectCount} custom functions, triggers, and views ensured in ${Date.now() - start}ms`);
  } catch (error) {
    console.error('[DB] Error ensuring custom functions:', error);
    throw error;
  }
}
