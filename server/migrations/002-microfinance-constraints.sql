-- Migration: Microfinance constraints and indexes
-- Run: psql -d your_database -f server/migrations/002-microfinance-constraints.sql

-- ============================================================================
-- 1. UNIQUE INDEX: One account per type per client (across all agencies)
-- ============================================================================

-- Drop if exists (for idempotency)
DROP INDEX IF EXISTS uq_comptes_client_type_actif;

-- Create unique partial index (excludes soft-deleted accounts)
CREATE UNIQUE INDEX uq_comptes_client_type_actif
ON comptes (client_id, type_compte)
WHERE deleted_at IS NULL;

COMMENT ON INDEX uq_comptes_client_type_actif IS
'Microfinance rule: A client can have only ONE account per type (Épargne/Courant/Bloqué) across ALL agencies.';

-- ============================================================================
-- 2. UNIQUE INDEX: One active agency per account at a time
-- ============================================================================

DROP INDEX IF EXISTS uq_compte_agence_active;

CREATE UNIQUE INDEX uq_compte_agence_active
ON compte_agences_historique (compte_id)
WHERE date_fin IS NULL;

COMMENT ON INDEX uq_compte_agence_active IS
'Ensures each account has exactly one active agency assignment (date_fin IS NULL).';

-- ============================================================================
-- 3. ADD NEW EVENT TYPES TO ENUM (if not exists)
-- ============================================================================

-- Check and add new enum values for type_evenement_enum
DO $$
BEGIN
    -- COMPTE_CREE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPTE_CREE' AND enumtypid = 'type_evenement_enum'::regtype) THEN
        ALTER TYPE type_evenement_enum ADD VALUE 'COMPTE_CREE';
    END IF;

    -- COMPTE_BLOQUE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPTE_BLOQUE' AND enumtypid = 'type_evenement_enum'::regtype) THEN
        ALTER TYPE type_evenement_enum ADD VALUE 'COMPTE_BLOQUE';
    END IF;

    -- COMPTE_DEBLOQUE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPTE_DEBLOQUE' AND enumtypid = 'type_evenement_enum'::regtype) THEN
        ALTER TYPE type_evenement_enum ADD VALUE 'COMPTE_DEBLOQUE';
    END IF;

    -- COMPTE_TRANSFERE_AGENCE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPTE_TRANSFERE_AGENCE' AND enumtypid = 'type_evenement_enum'::regtype) THEN
        ALTER TYPE type_evenement_enum ADD VALUE 'COMPTE_TRANSFERE_AGENCE';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Enum values already exist, ignore
        NULL;
END $$;

-- ============================================================================
-- 4. VALIDATION FUNCTION: Check withdrawal eligibility
-- ============================================================================

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

    -- Check status
    IF v_compte.statut = 'Suspendu' THEN
        RETURN QUERY SELECT FALSE, 'Compte suspendu'::TEXT;
        RETURN;
    END IF;

    IF v_compte.statut = 'Clôturé' THEN
        RETURN QUERY SELECT FALSE, 'Compte clôturé'::TEXT;
        RETURN;
    END IF;

    -- Check blocking for Bloqué accounts
    IF v_compte.type_compte = 'Bloqué' AND v_compte.blocage_actif = TRUE THEN
        RETURN QUERY SELECT FALSE, ('Compte bloqué: ' || COALESCE(v_compte.blocage_motif::TEXT, 'Raison non spécifiée'))::TEXT;
        RETURN;
    END IF;

    -- Check blocking dates
    IF v_compte.blocage_actif = TRUE AND v_compte.blocage_fin IS NOT NULL THEN
        IF NOW() < v_compte.blocage_fin THEN
            RETURN QUERY SELECT FALSE, ('Compte bloqué jusqu''au ' || TO_CHAR(v_compte.blocage_fin, 'DD/MM/YYYY'))::TEXT;
            RETURN;
        END IF;
    END IF;

    -- All checks passed
    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_withdrawal_eligibility(UUID) IS
'Validates if a withdrawal is allowed on the given account. Returns (allowed, reason).';

-- ============================================================================
-- 5. TRIGGER: Auto-update solde_courant timestamp on balance change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_compte_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.solde_courant IS DISTINCT FROM NEW.solde_courant THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compte_balance_update ON comptes;

CREATE TRIGGER trg_compte_balance_update
BEFORE UPDATE ON comptes
FOR EACH ROW
EXECUTE FUNCTION update_compte_timestamp();

-- ============================================================================
-- 6. VIEW: Portfolio summary per client
-- ============================================================================

CREATE OR REPLACE VIEW v_client_portfolio AS
SELECT
    c.id AS client_id,
    c.nom,
    c.prenom,
    c.telephone,
    COALESCE(SUM(CASE WHEN co.type_compte = 'Épargne' THEN co.solde_courant::NUMERIC ELSE 0 END), 0) AS total_epargne,
    COALESCE(SUM(CASE WHEN co.type_compte = 'Courant' THEN co.solde_courant::NUMERIC ELSE 0 END), 0) AS total_courant,
    COALESCE(SUM(CASE WHEN co.type_compte = 'Bloqué' THEN co.solde_courant::NUMERIC ELSE 0 END), 0) AS total_bloque,
    COALESCE(SUM(co.solde_courant::NUMERIC), 0) AS total_comptes,
    COALESCE(
        (SELECT SUM(cr.solde_restant::NUMERIC) FROM credits cr WHERE cr.client_id = c.id AND cr.statut IN ('Actif', 'En cours')),
        0
    ) AS total_credits_restant,
    COUNT(DISTINCT co.id) AS nombre_comptes,
    (SELECT COUNT(*) FROM credits cr WHERE cr.client_id = c.id AND cr.statut IN ('Actif', 'En cours')) AS nombre_credits_actifs
FROM clients c
LEFT JOIN comptes co ON co.client_id = c.id AND co.deleted_at IS NULL AND co.statut = 'Actif'
GROUP BY c.id, c.nom, c.prenom, c.telephone;

COMMENT ON VIEW v_client_portfolio IS
'Aggregated portfolio view for each client: account balances, credit remaining, counts.';

-- ============================================================================
-- 7. INDEX: Optimize common queries
-- ============================================================================

-- Index for fast portfolio lookups
CREATE INDEX IF NOT EXISTS idx_comptes_client_actif
ON comptes (client_id, type_compte)
WHERE deleted_at IS NULL AND statut = 'Actif';

-- Index for blocked accounts queries
CREATE INDEX IF NOT EXISTS idx_comptes_blocage_actif
ON comptes (blocage_actif, blocage_fin)
WHERE blocage_actif = TRUE;

-- Index for agency transfer history
CREATE INDEX IF NOT EXISTS idx_compte_agences_hist_recent
ON compte_agences_historique (compte_id, date_debut DESC);

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Migration 002-microfinance-constraints completed successfully' AS status;
