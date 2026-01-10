-- Migration: 004-reevaluation-workflow.sql
-- Description: Adds complete support for credit reevaluation workflow
-- Run: psql -d database -f server/migrations/004-reevaluation-workflow.sql

BEGIN;

-- ============================================================================
-- 1. NEW ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE statut_reevaluation_enum AS ENUM (
        'Demandée',
        'Éligibilité en cours',
        'Autorisée',
        'Refusée',
        'Enquête complémentaire',
        'Enquête terminée',
        'En comité',
        'Approuvée',
        'Rejetée définitivement',
        'Annulée'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE type_element_nouveau_enum AS ENUM (
        'Garantie supplémentaire',
        'Co-emprunteur',
        'Justificatif de revenus',
        'Réduction montant demandé',
        'Ajustement durée',
        'Amélioration situation',
        'Document manquant',
        'Autre'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add new statuses to existing enum (if they don't exist)
DO $$ BEGIN
    ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'Réévaluation en cours';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'Approuvée après réévaluation';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'Rejetée définitivement';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================================
-- 2. CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_reevaluation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delai_minimum_jours INTEGER NOT NULL DEFAULT 30,
    max_reevaluations_par_demande INTEGER NOT NULL DEFAULT 2,
    motifs_non_reevaluables TEXT[],
    elements_nouveaux_obligatoires BOOLEAN NOT NULL DEFAULT true,
    enquete_complementaire_obligatoire BOOLEAN NOT NULL DEFAULT false,
    documents_minimum INTEGER NOT NULL DEFAULT 1,
    seuil_score_minimum INTEGER DEFAULT 40,
    delta_score_minimum INTEGER DEFAULT 5,
    reduction_montant_max_pourcentage INTEGER DEFAULT 50,
    actif BOOLEAN NOT NULL DEFAULT true,
    agence_id UUID REFERENCES agences(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default configuration if not exists
INSERT INTO config_reevaluation (
    delai_minimum_jours,
    max_reevaluations_par_demande,
    motifs_non_reevaluables,
    elements_nouveaux_obligatoires,
    documents_minimum
) 
SELECT 
    30,
    2,
    ARRAY['Fraude avérée', 'Client blacklisté', 'Faux documents', 'Identité non vérifiable', 'Contentieux juridique'],
    true,
    1
WHERE NOT EXISTS (SELECT 1 FROM config_reevaluation LIMIT 1);

-- ============================================================================
-- 3. REEVALUATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS reevaluations_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demande_id UUID NOT NULL REFERENCES demandes_credit(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    numero_version INTEGER NOT NULL DEFAULT 1,
    numero_reevaluation TEXT NOT NULL UNIQUE,

    -- Snapshot of initial rejection (immutable)
    motif_rejet_initial TEXT NOT NULL,
    date_rejet_initial TIMESTAMP NOT NULL,
    score_rejet_initial INTEGER,
    montant_initial_demande NUMERIC NOT NULL,

    -- New elements
    elements_nouveaux JSON NOT NULL,
    justification TEXT NOT NULL,

    -- Adjustments
    nouveau_montant_demande NUMERIC,
    nouvelle_duree_valeur INTEGER,
    nouvelle_duree_unite duree_unite_enum,
    nouvelle_frequence frequence_remboursement_enum,

    -- Guarantees
    garanties_additionnelles JSON,
    co_emprunteur_id UUID REFERENCES clients(id),
    co_emprunteur_details JSON,

    documents_joints TEXT[],

    -- Workflow
    statut statut_reevaluation_enum NOT NULL DEFAULT 'Demandée',
    eligibilite_validee BOOLEAN,
    motif_refus_eligibilite TEXT,
    date_validation_eligibilite TIMESTAMP,
    valide_par UUID REFERENCES users(id),

    enquete_complementaire_id UUID,

    -- Scoring
    nouveau_score INTEGER,
    delta_score INTEGER,
    details_scoring JSON,

    -- Committee decision
    decision_comite TEXT,
    montant_approuve_comite NUMERIC,
    duree_approuvee_comite INTEGER,
    conditions_speciales TEXT,
    commentaire_comite TEXT,
    date_decision_comite TIMESTAMP,
    decide_par UUID REFERENCES users(id),
    membres_comite UUID[],

    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    verrouille BOOLEAN NOT NULL DEFAULT false,
    date_verrouillage TIMESTAMP,

    CONSTRAINT uq_reevaluation_demande_version UNIQUE (demande_id, numero_version)
);

CREATE INDEX IF NOT EXISTS idx_reevaluations_demande_id ON reevaluations_credit(demande_id);
CREATE INDEX IF NOT EXISTS idx_reevaluations_client_id ON reevaluations_credit(client_id);
CREATE INDEX IF NOT EXISTS idx_reevaluations_statut ON reevaluations_credit(statut);
CREATE INDEX IF NOT EXISTS idx_reevaluations_created_at ON reevaluations_credit(created_at);

-- ============================================================================
-- 4. COMPLEMENTARY INQUIRIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS enquetes_complementaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reevaluation_id UUID NOT NULL REFERENCES reevaluations_credit(id),
    demande_id UUID NOT NULL REFERENCES demandes_credit(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    enquete_initiale_id UUID REFERENCES enquetes_credit(id),
    numero_enquete TEXT NOT NULL UNIQUE,

    objectif_enquete TEXT NOT NULL,
    points_a_verifier TEXT[],
    verifications_effectuees JSON,
    situation_actuelle JSON,
    garanties_verifiees JSON,
    co_emprunteur_verifie JSON,

    photos_enquete TEXT[],
    documents_collectes TEXT[],

    geo_latitude NUMERIC,
    geo_longitude NUMERIC,
    geo_accuracy NUMERIC,
    geo_timestamp TIMESTAMP,

    score_complementaire INTEGER,
    recommandation_enqueteur TEXT,
    observations_enqueteur TEXT,
    risques_identifies TEXT[],

    statut TEXT NOT NULL DEFAULT 'En cours',
    enqueteur_id UUID NOT NULL REFERENCES users(id),
    date_debut TIMESTAMP DEFAULT NOW(),
    date_fin TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquetes_comp_reevaluation_id ON enquetes_complementaires(reevaluation_id);
CREATE INDEX IF NOT EXISTS idx_enquetes_comp_enqueteur_id ON enquetes_complementaires(enqueteur_id);
CREATE INDEX IF NOT EXISTS idx_enquetes_comp_statut ON enquetes_complementaires(statut);

-- ============================================================================
-- 5. SCORING HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scoring_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demande_id UUID NOT NULL REFERENCES demandes_credit(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    reevaluation_id UUID REFERENCES reevaluations_credit(id),
    enquete_id UUID REFERENCES enquetes_credit(id),
    enquete_complementaire_id UUID REFERENCES enquetes_complementaires(id),

    type_score TEXT NOT NULL,
    numero_version INTEGER NOT NULL DEFAULT 1,

    score_total INTEGER NOT NULL,
    score_capacite_remboursement INTEGER,
    score_stabilite_revenus INTEGER,
    score_anciennete_activite INTEGER,
    score_historique_credit INTEGER,
    score_garanties INTEGER,
    score_charges_endettement INTEGER,

    donnees_calcul JSON NOT NULL,
    score_precedent INTEGER,
    delta_score INTEGER,
    facteurs_delta JSON,

    seuil_approbation INTEGER DEFAULT 60,
    recommandation_auto TEXT,

    calcule_par_systeme BOOLEAN NOT NULL DEFAULT true,
    calcule_par UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT uq_scoring_demande_type_version UNIQUE (demande_id, type_score, numero_version)
);

CREATE INDEX IF NOT EXISTS idx_scoring_history_demande_id ON scoring_history(demande_id);
CREATE INDEX IF NOT EXISTS idx_scoring_history_reevaluation_id ON scoring_history(reevaluation_id);
CREATE INDEX IF NOT EXISTS idx_scoring_history_created_at ON scoring_history(created_at);

-- ============================================================================
-- 6. REEVALUATION AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS reevaluation_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reevaluation_id UUID NOT NULL REFERENCES reevaluations_credit(id),
    demande_id UUID NOT NULL REFERENCES demandes_credit(id),

    action TEXT NOT NULL,
    statut_avant TEXT,
    statut_apres TEXT,
    details JSON NOT NULL,

    user_id UUID NOT NULL REFERENCES users(id),
    role_utilisateur TEXT,
    ip_address TEXT,
    user_agent TEXT,

    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reeval_audit_reevaluation_id ON reevaluation_audit_logs(reevaluation_id);
CREATE INDEX IF NOT EXISTS idx_reeval_audit_demande_id ON reevaluation_audit_logs(demande_id);
CREATE INDEX IF NOT EXISTS idx_reeval_audit_action ON reevaluation_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_reeval_audit_timestamp ON reevaluation_audit_logs(timestamp);

-- ============================================================================
-- 7. MODIFY DEMANDES_CREDIT TABLE
-- ============================================================================

ALTER TABLE demandes_credit
ADD COLUMN IF NOT EXISTS date_rejet TIMESTAMP,
ADD COLUMN IF NOT EXISTS nombre_reevaluations INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS derniere_reevaluation_id UUID REFERENCES reevaluations_credit(id),
ADD COLUMN IF NOT EXISTS date_derniere_reevaluation TIMESTAMP,
ADD COLUMN IF NOT EXISTS reevaluation_en_cours BOOLEAN NOT NULL DEFAULT false;

-- Update date_rejet for already rejected demandes
UPDATE demandes_credit
SET date_rejet = created_at
WHERE statut = 'Rejetée' AND date_rejet IS NULL;

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger to auto-increment numero_version
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

DROP TRIGGER IF EXISTS trg_set_reevaluation_version ON reevaluations_credit;
CREATE TRIGGER trg_set_reevaluation_version
    BEFORE INSERT ON reevaluations_credit
    FOR EACH ROW
    EXECUTE FUNCTION set_reevaluation_version();

-- Trigger to auto-lock after final decision
CREATE OR REPLACE FUNCTION lock_reevaluation_on_final()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.statut IN ('Approuvée', 'Rejetée définitivement', 'Annulée')
       AND OLD.statut != NEW.statut THEN
        NEW.verrouille := true;
        NEW.date_verrouillage := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_reevaluation ON reevaluations_credit;
CREATE TRIGGER trg_lock_reevaluation
    BEFORE UPDATE ON reevaluations_credit
    FOR EACH ROW
    EXECUTE FUNCTION lock_reevaluation_on_final();

-- Trigger to sync demande status with reevaluation status
CREATE OR REPLACE FUNCTION sync_demande_reevaluation_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.statut = 'Approuvée' THEN
        UPDATE demandes_credit
        SET statut = 'Approuvée après réévaluation',
            montant_approuve = COALESCE(NEW.montant_approuve_comite, NEW.nouveau_montant_demande, montant_demande),
            reevaluation_en_cours = false,
            nombre_reevaluations = nombre_reevaluations + 1
        WHERE id = NEW.demande_id;
    ELSIF NEW.statut = 'Rejetée définitivement' THEN
        UPDATE demandes_credit
        SET statut = 'Rejetée définitivement',
            reevaluation_en_cours = false,
            nombre_reevaluations = nombre_reevaluations + 1
        WHERE id = NEW.demande_id;
    ELSIF NEW.statut IN ('Demandée', 'Autorisée', 'Enquête complémentaire', 'En comité') THEN
        UPDATE demandes_credit
        SET reevaluation_en_cours = true,
            derniere_reevaluation_id = NEW.id,
            date_derniere_reevaluation = NOW()
        WHERE id = NEW.demande_id;
    ELSIF NEW.statut IN ('Refusée', 'Annulée') THEN
        UPDATE demandes_credit
        SET reevaluation_en_cours = false
        WHERE id = NEW.demande_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_demande_reevaluation ON reevaluations_credit;
CREATE TRIGGER trg_sync_demande_reevaluation
    AFTER INSERT OR UPDATE OF statut ON reevaluations_credit
    FOR EACH ROW
    EXECUTE FUNCTION sync_demande_reevaluation_status();

-- ============================================================================
-- 9. VERIFICATION
-- ============================================================================

SELECT
    'Tables créées:' as info,
    (SELECT COUNT(*) FROM information_schema.tables 
     WHERE table_name IN ('config_reevaluation', 'reevaluations_credit', 'enquetes_complementaires', 'scoring_history', 'reevaluation_audit_logs')) as count
UNION ALL
SELECT
    'Nouvelles colonnes demandes_credit:',
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'demandes_credit' AND column_name IN ('date_rejet', 'nombre_reevaluations', 'derniere_reevaluation_id', 'reevaluation_en_cours'))
UNION ALL
SELECT
    'Triggers créés:',
    (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE '%reevaluation%');

COMMIT;
