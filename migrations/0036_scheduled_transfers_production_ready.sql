-- Migration: Scheduled Transfers Production Ready
-- Version: 0036
-- Date: 2026-01-25
-- Description: Renforce la table virements_programmes et ajoute scheduled_transfer_runs
--              pour garantir l'idempotence et la robustesse en production

-- ============================================
-- 1. Nouveau enum pour statut d'execution
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_run_virement_enum') THEN
        CREATE TYPE statut_run_virement_enum AS ENUM (
            'PENDING',
            'RUNNING',
            'SUCCESS',
            'FAILED',
            'SKIPPED'
        );
    END IF;
END $$;

-- ============================================
-- 2. Ajout des colonnes sur virements_programmes
-- ============================================

-- Agence pour filtrage RBAC rapide
ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id) ON DELETE SET NULL;

-- Configuration timezone et jour d'execution
ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Brazzaville';

ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS jour_execution INTEGER;

-- Retry management
ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;

-- Verrou de traitement (anti double-execution)
ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS processing_lock TEXT;

ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP;

-- Libelle personnalise
ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS libelle TEXT;

-- Soft delete
ALTER TABLE virements_programmes
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- ============================================
-- 3. Contraintes sur virements_programmes
-- ============================================

-- Contrainte jour_execution valide (1-28)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE constraint_name = 'chk_virements_prog_jour_execution'
    ) THEN
        ALTER TABLE virements_programmes
        ADD CONSTRAINT chk_virements_prog_jour_execution
        CHECK (jour_execution IS NULL OR (jour_execution >= 1 AND jour_execution <= 28));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Contrainte existe deja
    NULL;
END $$;

-- ============================================
-- 4. Index supplementaires sur virements_programmes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_virements_prog_agence
ON virements_programmes(agence_id, actif);

CREATE INDEX IF NOT EXISTS idx_virements_prog_lock
ON virements_programmes(processing_lock, processing_started_at);

CREATE INDEX IF NOT EXISTS idx_virements_prog_deleted
ON virements_programmes(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================
-- 5. Creation table scheduled_transfer_runs
-- ============================================

CREATE TABLE IF NOT EXISTS scheduled_transfer_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    scheduled_transfer_id UUID NOT NULL REFERENCES virements_programmes(id) ON DELETE CASCADE,

    -- Cle d'idempotence: VP-{scheduleId}-{YYYY-MM-DD}
    -- UNIQUE constraint empeche toute double execution pour la meme date
    execution_key TEXT NOT NULL,

    -- Statut de l'execution
    status statut_run_virement_enum NOT NULL DEFAULT 'PENDING',

    -- Timestamps
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Resultat
    mouvement_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
    error_message TEXT,

    -- Tentative (pour retries)
    attempt_number INTEGER NOT NULL DEFAULT 1,

    -- Metadata supplementaire
    metadata JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- 6. Index et contraintes sur scheduled_transfer_runs
-- ============================================

-- CRITIQUE: Contrainte unique anti double-execution
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_transfer_runs_execution_key
ON scheduled_transfer_runs(execution_key);

-- Index pour recherche par schedule
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_schedule_status
ON scheduled_transfer_runs(scheduled_transfer_id, status);

-- Index pour recherche par date
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_created_at
ON scheduled_transfer_runs(created_at);

-- Index pour recherche par mouvement
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_mouvement
ON scheduled_transfer_runs(mouvement_id);

-- ============================================
-- 7. Ajout run_id sur audit logs existants
-- ============================================

ALTER TABLE virements_programmes_audit_logs
ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES scheduled_transfer_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_virement_audit_run_id
ON virements_programmes_audit_logs(run_id);

-- ============================================
-- 8. Migration des donnees: peupler agence_id
-- ============================================

-- Met a jour agence_id depuis le compte source (denormalisation)
UPDATE virements_programmes vp
SET agence_id = c.agence_id
FROM comptes c
WHERE vp.compte_source_id = c.id
AND vp.agence_id IS NULL;

-- ============================================
-- 9. Fonction helper pour calcul prochaine execution
-- ============================================

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
    -- Convertir en timezone locale
    v_next := p_base_date AT TIME ZONE p_timezone;

    CASE p_frequence
        WHEN 'ONCE' THEN
            RETURN NULL;
        WHEN 'DAILY' THEN
            v_next := v_next + INTERVAL '1 day';
        WHEN 'WEEKLY' THEN
            v_next := v_next + INTERVAL '7 days';
        WHEN 'MONTHLY' THEN
            -- Gestion du jour d'execution
            v_day_of_month := COALESCE(p_jour_execution, EXTRACT(DAY FROM v_next)::INTEGER);
            -- Passage au mois suivant
            v_next := DATE_TRUNC('month', v_next) + INTERVAL '1 month';
            -- Ajuster au jour voulu (max 28 pour eviter problemes fin de mois)
            v_day_of_month := LEAST(v_day_of_month, 28);
            v_next := v_next + (v_day_of_month - 1) * INTERVAL '1 day';
        ELSE
            RETURN NULL;
    END CASE;

    -- Reconvertir en UTC
    RETURN v_next AT TIME ZONE p_timezone AT TIME ZONE 'UTC';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 10. Commentaires de documentation
-- ============================================

COMMENT ON TABLE scheduled_transfer_runs IS
'Historique des executions de virements programmes. Chaque ligne = 1 tentative. La contrainte UNIQUE sur execution_key garantit l''idempotence.';

COMMENT ON COLUMN scheduled_transfer_runs.execution_key IS
'Cle d''idempotence au format VP-{scheduleId}-{YYYY-MM-DD}. Empeche toute double execution pour la meme date.';

COMMENT ON COLUMN virements_programmes.processing_lock IS
'ID du worker qui traite ce virement. NULL = disponible. Utilise avec SELECT FOR UPDATE SKIP LOCKED.';

COMMENT ON COLUMN virements_programmes.timezone IS
'Timezone pour l''execution (ex: Africa/Brazzaville). Les heures d''execution sont interpretees dans cette timezone.';

-- ============================================
-- FIN MIGRATION
-- ============================================
