-- Migration: 0022_session_opening_workflow.sql
-- Description: Workflow sécurisé d'ouverture de caisse (Coffre → Caisse)
-- Règle d'Or: L'argent ne doit jamais apparaître "magiquement". Le solde d'ouverture
-- d'une caisse doit obligatoirement provenir d'une transaction traçable débitée du Coffre-Fort.

-- ============================================================================
-- 1. AJOUT DES NOUVEAUX STATUTS À L'ENUM (PostgreSQL ne permet pas de supprimer des valeurs)
-- ============================================================================

-- Vérifier et ajouter les nouveaux statuts si nécessaire
DO $$
BEGIN
    -- Ajout de REQUESTING_FUNDS avant OPEN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'statut_session_caisse_enum'::regtype
        AND enumlabel = 'REQUESTING_FUNDS'
    ) THEN
        ALTER TYPE statut_session_caisse_enum ADD VALUE 'REQUESTING_FUNDS' BEFORE 'OPEN';
    END IF;

    -- Ajout de FUNDS_DISPATCHED avant OPEN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'statut_session_caisse_enum'::regtype
        AND enumlabel = 'FUNDS_DISPATCHED'
    ) THEN
        ALTER TYPE statut_session_caisse_enum ADD VALUE 'FUNDS_DISPATCHED' BEFORE 'OPEN';
    END IF;
END $$;

-- ============================================================================
-- 2. NOUVEAUX CHAMPS DANS sessions_caisse
-- ============================================================================

-- Lien vers le transfert d'ouverture
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS opening_transfert_id UUID;

-- Montant demandé par le caissier au coffre
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS montant_demande NUMERIC;

-- Solde résiduel de la veille (si fundsKeptInCaisse était true à la fermeture précédente)
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS solde_veille NUMERIC DEFAULT '0';

-- Timestamps du workflow d'ouverture
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS funds_requested_at TIMESTAMP;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS funds_dispatched_at TIMESTAMP;

ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS funds_received_at TIMESTAMP;

-- Billetage à la réception (pour détection d'écart)
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS billetage_reception JSONB;

-- Expiration automatique de la demande (ex: 4h après soumission)
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS request_expires_at TIMESTAMP;

-- ============================================================================
-- 3. NOUVEAUX CHAMPS DANS transferts_coffre_caisse
-- ============================================================================

-- Lien vers la session d'ouverture (si ce transfert est pour ouvrir une caisse)
ALTER TABLE transferts_coffre_caisse
ADD COLUMN IF NOT EXISTS session_ouverture_id UUID REFERENCES sessions_caisse(id) ON DELETE SET NULL;

-- Flag indiquant que ce transfert est pour l'ouverture d'une session caisse
ALTER TABLE transferts_coffre_caisse
ADD COLUMN IF NOT EXISTS is_opening_fund BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 4. AJOUT DES INDEX POUR PERFORMANCE
-- ============================================================================

-- Index sur opening_transfert_id pour jointures rapides
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_opening_transfert
ON sessions_caisse(opening_transfert_id)
WHERE opening_transfert_id IS NOT NULL;

-- Index sur statut pour filtrage rapide des sessions par état
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_statut
ON sessions_caisse(statut);

-- Index sur session_ouverture_id dans transferts_coffre_caisse
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_session_ouverture
ON transferts_coffre_caisse(session_ouverture_id)
WHERE session_ouverture_id IS NOT NULL;

-- Index partiel sur is_opening_fund pour trouver rapidement les transferts d'ouverture
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_opening_fund
ON transferts_coffre_caisse(is_opening_fund)
WHERE is_opening_fund = TRUE;

-- Index composite pour la recherche de demandes en attente par agence
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_agence_statut_pending
ON sessions_caisse(agence_id, statut, funds_requested_at DESC)
WHERE statut IN ('REQUESTING_FUNDS', 'FUNDS_DISPATCHED');

-- ============================================================================
-- 5. CONTRAINTES D'INTÉGRITÉ (FK différée pour éviter dépendance circulaire)
-- ============================================================================

-- FK de sessions_caisse.opening_transfert_id vers transferts_coffre_caisse.id
-- Note: Cette FK est ajoutée après car il y a une dépendance circulaire potentielle
ALTER TABLE sessions_caisse
DROP CONSTRAINT IF EXISTS fk_sessions_caisse_opening_transfert;

ALTER TABLE sessions_caisse
ADD CONSTRAINT fk_sessions_caisse_opening_transfert
FOREIGN KEY (opening_transfert_id)
REFERENCES transferts_coffre_caisse(id)
ON DELETE SET NULL;

-- ============================================================================
-- 6. COMMENTAIRES POUR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN sessions_caisse.opening_transfert_id IS
'Référence vers le transfert coffre→caisse qui a approvisionné cette session. Garantit la traçabilité du solde d''ouverture.';

COMMENT ON COLUMN sessions_caisse.montant_demande IS
'Montant demandé par le caissier au responsable coffre lors de la Phase A du workflow.';

COMMENT ON COLUMN sessions_caisse.solde_veille IS
'Solde résiduel de la veille (si la caisse gardait des fonds). Le solde d''ouverture final = solde_veille + montant reçu du coffre.';

COMMENT ON COLUMN sessions_caisse.funds_requested_at IS
'Timestamp Phase A: Le caissier a soumis sa demande de fonds.';

COMMENT ON COLUMN sessions_caisse.funds_dispatched_at IS
'Timestamp Phase B: Le responsable coffre a validé et envoyé les fonds.';

COMMENT ON COLUMN sessions_caisse.funds_received_at IS
'Timestamp Phase C: Le caissier a confirmé la réception des fonds.';

COMMENT ON COLUMN sessions_caisse.billetage_reception IS
'Détail du comptage des billets/pièces reçus par le caissier à la Phase C.';

COMMENT ON COLUMN sessions_caisse.request_expires_at IS
'Date/heure d''expiration automatique de la demande si non validée par le coffre.';

COMMENT ON COLUMN transferts_coffre_caisse.session_ouverture_id IS
'Référence vers la session d''ouverture que ce transfert approvisionne.';

COMMENT ON COLUMN transferts_coffre_caisse.is_opening_fund IS
'TRUE si ce transfert est destiné à l''ouverture d''une session caisse (Phase A→B→C workflow).';

-- ============================================================================
-- 7. MIGRATION DES DONNÉES EXISTANTES (optionnel, non-destructif)
-- ============================================================================

-- Les sessions existantes en OPEN ou CLOSED conservent leurs valeurs.
-- Les nouveaux champs seront NULL ce qui est correct pour les anciennes sessions.
-- Note: Les sessions existantes ont été créées avec l'ancien workflow (ouverture directe).

-- Mise à jour optionnelle pour rétroactivement documenter les anciennes sessions:
-- (Décommentez si vous souhaitez marquer explicitement les anciennes sessions)
-- UPDATE sessions_caisse
-- SET observations = COALESCE(observations, '') || ' [Ouverture legacy pre-workflow]'
-- WHERE opening_transfert_id IS NULL AND statut IN ('OPEN', 'CLOSED');
