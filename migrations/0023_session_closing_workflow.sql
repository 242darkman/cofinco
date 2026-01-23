-- Migration: 0023_session_closing_workflow.sql
-- Description: Workflow sécurisé de fermeture de caisse (Gel → Comptage → Remise Coffre)
-- Règle d'Or: L'argent compté physiquement doit correspondre à:
-- MontantVersCoffre + MontantReporte = TotalPhysique

-- ============================================================================
-- 1. AJOUT DES NOUVEAUX STATUTS À L'ENUM
-- ============================================================================

DO $$
BEGIN
    -- Ajout de CLOSING_COUNT après OPEN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'statut_session_caisse_enum'::regtype
        AND enumlabel = 'CLOSING_COUNT'
    ) THEN
        ALTER TYPE statut_session_caisse_enum ADD VALUE 'CLOSING_COUNT' AFTER 'OPEN';
    END IF;

    -- Ajout de CLOSING_VALIDATION après CLOSING_COUNT
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'statut_session_caisse_enum'::regtype
        AND enumlabel = 'CLOSING_VALIDATION'
    ) THEN
        ALTER TYPE statut_session_caisse_enum ADD VALUE 'CLOSING_VALIDATION' AFTER 'CLOSING_COUNT';
    END IF;
END $$;

-- ============================================================================
-- 2. NOUVEAUX CHAMPS DANS sessions_caisse POUR LE WORKFLOW DE FERMETURE
-- ============================================================================

-- Timestamps du workflow de fermeture
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS closing_initiated_at TIMESTAMP;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS count_submitted_at TIMESTAMP;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS closing_finalized_at TIMESTAMP;

-- Comptage physique et écart
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS montant_physique NUMERIC;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS ecart_justification TEXT;

-- Décision de transfert vers coffre
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS montant_vers_coffre NUMERIC;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS montant_reporte NUMERIC;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS closing_transfert_id UUID;

-- Validation par responsable coffre
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS coffre_validation_status TEXT CHECK (coffre_validation_status IN ('PENDING', 'APPROVED', 'REJECTED'));

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS coffre_validated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS coffre_validated_at TIMESTAMP;

-- Bordereau de clôture
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS closing_bordereau_url TEXT;

-- ============================================================================
-- 3. AJOUT DES INDEX POUR PERFORMANCE
-- ============================================================================

-- Index sur closing_transfert_id pour jointures rapides
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_closing_transfert
ON sessions_caisse(closing_transfert_id)
WHERE closing_transfert_id IS NOT NULL;

-- Index sur statut pour filtrage rapide des sessions en cours de fermeture
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_closing_status
ON sessions_caisse(agence_id, statut, closing_initiated_at DESC)
WHERE statut IN ('CLOSING_COUNT', 'CLOSING_VALIDATION');

-- Index partiel pour sessions avec écart non justifié (audit)
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_ecart_non_justifie
ON sessions_caisse(agence_id, ecart)
WHERE ecart IS NOT NULL AND ecart::numeric != 0 AND ecart_justification IS NULL;

-- ============================================================================
-- 4. CONTRAINTES D'INTÉGRITÉ
-- ============================================================================

-- FK de sessions_caisse.closing_transfert_id vers transferts_coffre_caisse.id
ALTER TABLE sessions_caisse
DROP CONSTRAINT IF EXISTS fk_sessions_caisse_closing_transfert;

ALTER TABLE sessions_caisse
ADD CONSTRAINT fk_sessions_caisse_closing_transfert
FOREIGN KEY (closing_transfert_id)
REFERENCES transferts_coffre_caisse(id)
ON DELETE SET NULL;

-- Contrainte: Si écart != 0, la justification doit être non-nulle
-- Note: Cette contrainte est appliquée au niveau applicatif pour plus de flexibilité
-- ALTER TABLE sessions_caisse
-- ADD CONSTRAINT chk_ecart_justification
-- CHECK (ecart IS NULL OR ecart::numeric = 0 OR ecart_justification IS NOT NULL);

-- ============================================================================
-- 5. COMMENTAIRES POUR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN sessions_caisse.closing_initiated_at IS
'Timestamp du début du processus de fermeture. La session est gelée à partir de ce moment.';

COMMENT ON COLUMN sessions_caisse.count_submitted_at IS
'Timestamp de soumission du comptage physique (blind count).';

COMMENT ON COLUMN sessions_caisse.closing_finalized_at IS
'Timestamp de la fermeture définitive de la session.';

COMMENT ON COLUMN sessions_caisse.montant_physique IS
'Montant total compté physiquement par le caissier (somme du billetage).';

COMMENT ON COLUMN sessions_caisse.ecart_justification IS
'Justification obligatoire en cas d''écart entre le solde théorique et le montant physique.';

COMMENT ON COLUMN sessions_caisse.montant_vers_coffre IS
'Montant à transférer vers le coffre-fort lors de la clôture.';

COMMENT ON COLUMN sessions_caisse.montant_reporte IS
'Montant conservé en caisse pour le lendemain (fonds de roulement J+1).';

COMMENT ON COLUMN sessions_caisse.closing_transfert_id IS
'Référence vers le transfert caisse→coffre créé lors de la clôture.';

COMMENT ON COLUMN sessions_caisse.coffre_validation_status IS
'Statut de validation du transfert par le responsable coffre: PENDING, APPROVED, REJECTED.';

COMMENT ON COLUMN sessions_caisse.coffre_validated_by IS
'Utilisateur ayant validé/rejeté le transfert vers le coffre.';

COMMENT ON COLUMN sessions_caisse.coffre_validated_at IS
'Timestamp de la validation/rejet du transfert par le coffre.';

COMMENT ON COLUMN sessions_caisse.closing_bordereau_url IS
'URL du bordereau de clôture PDF généré.';

-- ============================================================================
-- 6. TABLE D'AUDIT POUR ÉCARTS DE CAISSE (optionnel mais recommandé)
-- ============================================================================

-- Table pour suivre l'historique des écarts de caisse par agent
CREATE TABLE IF NOT EXISTS ecarts_caisse_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions_caisse(id) ON DELETE CASCADE,
    caissier_id UUID NOT NULL REFERENCES users(id),
    agence_id UUID REFERENCES agences(id),

    -- Montants
    solde_theorique NUMERIC NOT NULL,
    montant_physique NUMERIC NOT NULL,
    ecart NUMERIC NOT NULL,

    -- Justification et classification
    justification TEXT NOT NULL,
    type_ecart TEXT CHECK (type_ecart IN ('SURPLUS', 'DEFICIT')),

    -- Écriture comptable liée
    mouvement_ecart_id UUID REFERENCES mouvements_financiers(id),

    -- Traçabilité
    created_at TIMESTAMP DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

-- Index pour reporting sur les écarts par agent
CREATE INDEX IF NOT EXISTS idx_ecarts_caisse_caissier ON ecarts_caisse_audit(caissier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecarts_caisse_agence ON ecarts_caisse_audit(agence_id, created_at DESC);

COMMENT ON TABLE ecarts_caisse_audit IS
'Historique des écarts de caisse pour audit et suivi des performances des caissiers.';
