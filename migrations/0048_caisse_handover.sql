-- Migration: 0048_caisse_handover.sql
-- Description: Ajout du workflow de transfert de garde (handover) pour les sessions de caisse
-- Permet le changement de caissier en cours de journée sans clôturer la session

-- ============================================================================
-- 1. TABLE DES TRANSFERTS DE GARDE
-- ============================================================================

CREATE TABLE IF NOT EXISTS caisse_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Session concernée
    session_id UUID NOT NULL REFERENCES sessions_caisse(id) ON DELETE RESTRICT,
    caisse_id UUID NOT NULL REFERENCES caisses(id) ON DELETE RESTRICT,
    agence_id UUID REFERENCES agences(id) ON DELETE SET NULL,

    -- Caissiers impliqués
    from_caissier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    to_caissier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Montants au moment du transfert
    montant_theorique NUMERIC NOT NULL,
    montant_compte NUMERIC NOT NULL,
    ecart NUMERIC DEFAULT 0,

    -- Billetage au moment du transfert
    billetage_sortant JSONB,
    billetage_entrant JSONB,

    -- Statut du workflow
    statut TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COUNTING, CONFIRMED, CANCELLED, DISPUTED

    -- Justifications et observations
    motif TEXT,
    observations_sortant TEXT,
    observations_entrant TEXT,
    ecart_justification TEXT,

    -- Timestamps workflow
    initiated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    counting_started_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    cancel_reason TEXT,

    -- Approbation (si écart)
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    approval_comment TEXT,

    -- Métadonnées
    ip_address_from TEXT,
    ip_address_to TEXT,
    user_agent_from TEXT,
    user_agent_to TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 2. TABLE AUDIT DES TRANSFERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS caisse_handover_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handover_id UUID NOT NULL REFERENCES caisse_handovers(id) ON DELETE CASCADE,

    action TEXT NOT NULL, -- INITIATED, COUNTING_STARTED, CONFIRMED, CANCELLED, DISPUTED, APPROVED, REJECTED
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,

    statut_avant TEXT,
    statut_apres TEXT,

    details JSONB,
    ip_address TEXT,
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. MODIFICATION DE sessions_caisse POUR TRACER LES HANDOVERS
-- ============================================================================

-- Ajouter des champs pour tracker les handovers
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS handover_count INTEGER DEFAULT 0;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS last_handover_id UUID REFERENCES caisse_handovers(id) ON DELETE SET NULL;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS original_caissier_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. INDEX POUR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_caisse_handovers_session
ON caisse_handovers(session_id);

CREATE INDEX IF NOT EXISTS idx_caisse_handovers_caisse
ON caisse_handovers(caisse_id);

CREATE INDEX IF NOT EXISTS idx_caisse_handovers_from
ON caisse_handovers(from_caissier_id);

CREATE INDEX IF NOT EXISTS idx_caisse_handovers_to
ON caisse_handovers(to_caissier_id);

CREATE INDEX IF NOT EXISTS idx_caisse_handovers_statut
ON caisse_handovers(statut);

CREATE INDEX IF NOT EXISTS idx_caisse_handovers_date
ON caisse_handovers(initiated_at);

CREATE INDEX IF NOT EXISTS idx_caisse_handover_audit_logs_handover
ON caisse_handover_audit_logs(handover_id);

-- ============================================================================
-- 5. COMMENTAIRES
-- ============================================================================

COMMENT ON TABLE caisse_handovers IS
'Transferts de garde (handovers) permettant le changement de caissier en cours de session sans clôturer la caisse.';

COMMENT ON COLUMN caisse_handovers.statut IS
'Statut du transfert: PENDING (initié), COUNTING (comptage en cours), CONFIRMED (confirmé par le nouveau caissier), CANCELLED (annulé), DISPUTED (contesté).';

COMMENT ON COLUMN caisse_handovers.billetage_sortant IS
'Billetage déclaré par le caissier sortant lors de l''initiation du transfert.';

COMMENT ON COLUMN caisse_handovers.billetage_entrant IS
'Billetage vérifié par le caissier entrant lors de la confirmation.';

COMMENT ON COLUMN sessions_caisse.handover_count IS
'Nombre de transferts de garde effectués sur cette session.';

COMMENT ON COLUMN sessions_caisse.original_caissier_id IS
'ID du caissier qui a ouvert la session à l''origine (avant tout handover).';
