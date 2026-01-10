-- migrations/0009_coffre_fort_workflow.sql

-- =============================================================================
-- MIGRATION: Coffre-Fort Workflow
-- Description: Ajoute le système de transfert Coffre ↔ Caisse avec workflow
-- =============================================================================

-- 1. Créer les enums
DO $$ BEGIN
    CREATE TYPE statut_transfert_coffre_enum AS ENUM (
        'Demandé',
        'Validé',
        'Exécuté',
        'Rejeté',
        'Annulé'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE type_transfert_coffre_enum AS ENUM (
        'COFFRE_VERS_CAISSE',
        'CAISSE_VERS_COFFRE'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ajouter les nouveaux types d'opération caisse (si pas déjà présents)
ALTER TYPE type_operation_caisse_enum ADD VALUE IF NOT EXISTS 'Approvisionnement coffre';
ALTER TYPE type_operation_caisse_enum ADD VALUE IF NOT EXISTS 'Versement coffre';

-- 3. Créer la table des transferts coffre ↔ caisse
CREATE TABLE IF NOT EXISTS transferts_coffre_caisse (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Contexte agence
    agence_id UUID NOT NULL REFERENCES agences(id) ON DELETE RESTRICT,
    
    -- Type de transfert
    type_transfert type_transfert_coffre_enum NOT NULL,
    
    -- Source et destination
    caisse_source_id UUID NOT NULL REFERENCES caisses(id) ON DELETE RESTRICT,
    caisse_destination_id UUID NOT NULL REFERENCES caisses(id) ON DELETE RESTRICT,
    
    -- Montant
    montant NUMERIC NOT NULL,
    devise TEXT NOT NULL DEFAULT 'XAF',
    
    -- Motif
    motif TEXT NOT NULL,
    commentaire TEXT,
    
    -- Référence
    reference TEXT NOT NULL,
    idempotency_key TEXT,
    
    -- Statut workflow
    statut statut_transfert_coffre_enum NOT NULL DEFAULT 'Demandé',
    
    -- Phase 1: Demande
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    session_request_id UUID REFERENCES sessions_caisse(id) ON DELETE SET NULL,
    
    -- Phase 2: Validation
    validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    validated_at TIMESTAMP,
    reason_rejection TEXT,
    
    -- Phase 3: Exécution
    executed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    executed_at TIMESTAMP,
    session_execute_id UUID REFERENCES sessions_caisse(id) ON DELETE SET NULL,
    
    -- Liens ledger
    mouvement_debit_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
    mouvement_credit_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
    
    -- Liens opérations
    operation_source_id UUID REFERENCES operations_caisse(id) ON DELETE SET NULL,
    operation_dest_id UUID REFERENCES operations_caisse(id) ON DELETE SET NULL,
    
    -- Billetage
    billetage JSONB,
    
    -- Métadonnées
    metadata JSONB,
    
    -- Verrouillage
    verrouille BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Contraintes
    CONSTRAINT chk_transferts_coffre_montant_pos CHECK (montant > 0),
    CONSTRAINT chk_transferts_coffre_different CHECK (caisse_source_id <> caisse_destination_id)
);

-- 4. Créer les index
CREATE UNIQUE INDEX IF NOT EXISTS uq_transferts_coffre_reference 
    ON transferts_coffre_caisse(reference);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transferts_coffre_idempotency 
    ON transferts_coffre_caisse(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_agence_statut 
    ON transferts_coffre_caisse(agence_id, statut);
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_agence_date 
    ON transferts_coffre_caisse(agence_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_source 
    ON transferts_coffre_caisse(caisse_source_id);
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_dest 
    ON transferts_coffre_caisse(caisse_destination_id);
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_statut_date 
    ON transferts_coffre_caisse(statut, created_at);
CREATE INDEX IF NOT EXISTS idx_transferts_coffre_requested_by 
    ON transferts_coffre_caisse(requested_by);

-- 5. Créer la table d'audit
CREATE TABLE IF NOT EXISTS transferts_coffre_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    transfert_id UUID NOT NULL REFERENCES transferts_coffre_caisse(id) ON DELETE CASCADE,
    
    action TEXT NOT NULL,
    statut_avant TEXT,
    statut_apres TEXT NOT NULL,
    
    details JSONB NOT NULL,
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    user_role TEXT,
    
    ip_address TEXT,
    user_agent TEXT,
    
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coffre_audit_transfert_id 
    ON transferts_coffre_audit_logs(transfert_id);
CREATE INDEX IF NOT EXISTS idx_coffre_audit_action 
    ON transferts_coffre_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_coffre_audit_timestamp 
    ON transferts_coffre_audit_logs(timestamp);

-- 6. Créer la table de configuration
CREATE TABLE IF NOT EXISTS config_coffre_fort (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    agence_id UUID NOT NULL REFERENCES agences(id) ON DELETE CASCADE,
    
    seuil_double_validation NUMERIC DEFAULT 1000000,
    montant_max_transfert NUMERIC,
    
    separation_initiateur_valideur BOOLEAN NOT NULL DEFAULT TRUE,
    separation_valideur_executeur BOOLEAN NOT NULL DEFAULT FALSE,
    
    roles_initiateurs JSONB DEFAULT '["caissier", "chef_caisse"]',
    roles_valideurs JSONB DEFAULT '["chef_agence", "superviseur"]',
    roles_executeurs JSONB DEFAULT '["caissier", "chef_caisse", "chef_agence"]',
    
    billetage_obligatoire BOOLEAN NOT NULL DEFAULT FALSE,
    
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_config_coffre_agence UNIQUE (agence_id)
);

-- 7. Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transferts_coffre_updated_at ON transferts_coffre_caisse;
CREATE TRIGGER trg_transferts_coffre_updated_at
    BEFORE UPDATE ON transferts_coffre_caisse
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_config_coffre_updated_at ON config_coffre_fort;
CREATE TRIGGER trg_config_coffre_updated_at
    BEFORE UPDATE ON config_coffre_fort
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Créer les coffres-forts manquants pour chaque agence existante
INSERT INTO caisses (id, nom, agence_id, type, solde, statut, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    'Coffre-Fort ' || a.nom,
    a.id,
    'Coffre-Fort',
    '0',
    'Ouverte',
    NOW(),
    NOW()
FROM agences a
WHERE NOT EXISTS (
    SELECT 1 FROM caisses c 
    WHERE c.agence_id = a.id AND c.type = 'Coffre-Fort'
);

-- 9. Créer les configurations par défaut pour chaque agence
INSERT INTO config_coffre_fort (agence_id)
SELECT id FROM agences a
WHERE NOT EXISTS (
    SELECT 1 FROM config_coffre_fort c WHERE c.agence_id = a.id
);
