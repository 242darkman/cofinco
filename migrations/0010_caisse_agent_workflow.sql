-- Migration: Caisse Agent avec Workflow d'Approbation
-- Description: Crée les tables pour gérer les caisses internes des agents terrain
--              avec un workflow d'approbation pour les opérations de collecte et remise

-- ============================================================================
-- 1. CRÉATION DES ENUMS
-- ============================================================================

-- Enum pour le statut de la caisse agent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_caisse_agent_enum') THEN
    CREATE TYPE statut_caisse_agent_enum AS ENUM ('Active', 'Suspendue', 'Clôturée');
  END IF;
END $$;

-- Enum pour le type d'opération terrain
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_operation_terrain_enum') THEN
    CREATE TYPE type_operation_terrain_enum AS ENUM ('COLLECT_CASH', 'SETTLEMENT_CASH');
  END IF;
END $$;

-- Enum pour le statut d'opération terrain
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_operation_terrain_enum') THEN
    CREATE TYPE statut_operation_terrain_enum AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

-- Ajouter CAISSE_AGENT au source_module_enum existant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CAISSE_AGENT'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'source_module_enum')
  ) THEN
    ALTER TYPE source_module_enum ADD VALUE IF NOT EXISTS 'CAISSE_AGENT';
  END IF;
END $$;

-- Ajouter les nouveaux événements au type_evenement_enum existant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'CAISSE_AGENT_SOLDE_CHANGE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'type_evenement_enum')
  ) THEN
    ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'CAISSE_AGENT_SOLDE_CHANGE';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'OPERATION_TERRAIN_SUBMITTED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'type_evenement_enum')
  ) THEN
    ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'OPERATION_TERRAIN_SUBMITTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'OPERATION_TERRAIN_APPROVED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'type_evenement_enum')
  ) THEN
    ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'OPERATION_TERRAIN_APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'OPERATION_TERRAIN_REJECTED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'type_evenement_enum')
  ) THEN
    ALTER TYPE type_evenement_enum ADD VALUE IF NOT EXISTS 'OPERATION_TERRAIN_REJECTED';
  END IF;
END $$;

-- ============================================================================
-- 2. TABLE: caisses_agent
-- Compte interne (custody/float) par agent terrain
-- ============================================================================

CREATE TABLE IF NOT EXISTS caisses_agent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lien vers l'agent terrain (1:1 strict)
  agent_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,

  -- Solde validé (seules les opérations APPROVED impactent ce solde)
  solde_valide NUMERIC NOT NULL DEFAULT '0',

  -- Devise (XOF par défaut)
  devise TEXT NOT NULL DEFAULT 'XOF',

  -- Statut de la caisse
  statut statut_caisse_agent_enum NOT NULL DEFAULT 'Active',

  -- Traçabilité
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete

  -- Contrainte: solde ne peut pas être négatif
  CONSTRAINT chk_caisses_agent_solde_nonneg CHECK (solde_valide >= 0)
);

-- Index unique: un agent ne peut avoir qu'une seule caisse active
CREATE UNIQUE INDEX IF NOT EXISTS uq_caisses_agent_agent_actif
  ON caisses_agent (agent_id)
  WHERE deleted_at IS NULL;

-- Index de recherche
CREATE INDEX IF NOT EXISTS idx_caisses_agent_statut ON caisses_agent (statut);
CREATE INDEX IF NOT EXISTS idx_caisses_agent_agent_id ON caisses_agent (agent_id);

-- ============================================================================
-- 3. TABLE: operations_terrain
-- Opérations de collecte et remise avec workflow d'approbation
-- ============================================================================

CREATE TABLE IF NOT EXISTS operations_terrain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiants uniques pour idempotence
  reference TEXT NOT NULL,
  idempotency_key TEXT,

  -- Type d'opération
  type type_operation_terrain_enum NOT NULL,

  -- Agent concerné
  agent_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,
  caisse_agent_id UUID NOT NULL REFERENCES caisses_agent(id) ON DELETE RESTRICT,

  -- Client (obligatoire pour COLLECT_CASH, null pour SETTLEMENT_CASH)
  client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,

  -- Destination (pour SETTLEMENT_CASH uniquement)
  destination_caisse_id UUID REFERENCES caisses(id) ON DELETE RESTRICT,

  -- Montant et devise
  montant NUMERIC NOT NULL,
  devise TEXT NOT NULL DEFAULT 'XOF',

  -- ========== WORKFLOW ==========
  statut statut_operation_terrain_enum NOT NULL DEFAULT 'SUBMITTED',

  -- Soumission
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Approbation
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,

  -- Rejet
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,

  -- Annulation
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,

  -- ========== IDEMPOTENCE - Références aux écritures postées ==========
  posted_at TIMESTAMP,

  -- Mouvement sur la CaisseAgent
  posted_mouvement_caisse_agent_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,

  -- Mouvement côté client (pour COLLECT_CASH)
  posted_mouvement_client_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,

  -- Mouvement sur la caisse destination (pour SETTLEMENT_CASH)
  posted_mouvement_destination_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,

  -- Paiement terrain créé (pour COLLECT_CASH)
  posted_paiement_terrain_id UUID REFERENCES paiements_terrain(id) ON DELETE SET NULL,

  -- ========== MÉTADONNÉES ==========
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- ========== CONTRAINTES MÉTIER ==========
  CONSTRAINT chk_operations_terrain_montant_pos CHECK (montant > 0),
  CONSTRAINT chk_operations_terrain_client_collect CHECK (type != 'COLLECT_CASH' OR client_id IS NOT NULL),
  CONSTRAINT chk_operations_terrain_destination_settlement CHECK (type != 'SETTLEMENT_CASH' OR destination_caisse_id IS NOT NULL)
);

-- Index d'unicité
CREATE UNIQUE INDEX IF NOT EXISTS uq_operations_terrain_reference ON operations_terrain (reference);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operations_terrain_idempotency
  ON operations_terrain (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index de recherche
CREATE INDEX IF NOT EXISTS idx_operations_terrain_agent_statut ON operations_terrain (agent_id, statut);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_statut_date ON operations_terrain (statut, submitted_at);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_type_date ON operations_terrain (type, submitted_at);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_client_date ON operations_terrain (client_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_caisse_agent ON operations_terrain (caisse_agent_id);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_destination_caisse ON operations_terrain (destination_caisse_id);

-- ============================================================================
-- 4. TABLE: operations_terrain_audit_logs
-- Logs d'audit immuables
-- ============================================================================

CREATE TABLE IF NOT EXISTS operations_terrain_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Référence à l'opération
  operation_id UUID NOT NULL REFERENCES operations_terrain(id) ON DELETE CASCADE,

  -- Action effectuée
  action TEXT NOT NULL, -- SUBMITTED, APPROVED, REJECTED, CANCELLED

  -- États avant/après
  statut_avant TEXT,
  statut_apres TEXT NOT NULL,

  -- Détails de l'action
  details JSONB NOT NULL,

  -- Acteur
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_role TEXT,

  -- Contexte de la requête
  ip_address TEXT,
  user_agent TEXT,

  -- Timestamp immuable
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_operations_terrain_audit_operation_date
  ON operations_terrain_audit_logs (operation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_audit_action
  ON operations_terrain_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_operations_terrain_audit_timestamp
  ON operations_terrain_audit_logs (timestamp);

-- ============================================================================
-- 5. BACKFILL: Créer une caisse pour chaque agent existant
-- ============================================================================

INSERT INTO caisses_agent (agent_id, solde_valide, devise, statut, created_at, updated_at)
SELECT
  id,
  '0',
  'XOF',
  'Active',
  NOW(),
  NOW()
FROM agents_terrain
WHERE deleted_at IS NULL
AND id NOT IN (
  SELECT agent_id FROM caisses_agent WHERE deleted_at IS NULL
);

-- ============================================================================
-- 6. FONCTION: Trigger pour créer automatiquement une caisse agent
-- ============================================================================

CREATE OR REPLACE FUNCTION create_caisse_agent_on_agent_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Créer automatiquement une caisse agent pour le nouvel agent
  INSERT INTO caisses_agent (agent_id, solde_valide, devise, statut)
  VALUES (NEW.id, '0', 'XOF', 'Active')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: créer caisse agent automatiquement
DROP TRIGGER IF EXISTS trigger_create_caisse_agent ON agents_terrain;
CREATE TRIGGER trigger_create_caisse_agent
  AFTER INSERT ON agents_terrain
  FOR EACH ROW
  EXECUTE FUNCTION create_caisse_agent_on_agent_creation();

-- ============================================================================
-- 7. COMMENTAIRES
-- ============================================================================

COMMENT ON TABLE caisses_agent IS 'Compte interne (custody/float) par agent terrain pour gérer le cash collecté';
COMMENT ON TABLE operations_terrain IS 'Opérations de collecte et remise avec workflow d''approbation';
COMMENT ON TABLE operations_terrain_audit_logs IS 'Logs d''audit immuables pour toutes les transitions d''état des opérations terrain';

COMMENT ON COLUMN caisses_agent.solde_valide IS 'Solde confirmé - seules les opérations APPROVED impactent ce solde';
COMMENT ON COLUMN operations_terrain.statut IS 'SUBMITTED: en attente | APPROVED: validé, écritures postées | REJECTED: refusé | CANCELLED: annulé';
COMMENT ON COLUMN operations_terrain.posted_at IS 'Timestamp de posting des écritures - utilisé pour idempotence';
