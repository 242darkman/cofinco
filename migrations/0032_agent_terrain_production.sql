-- Migration: Agent de Terrain Production-Ready
-- Date: 2026-01-25
-- Description: Implements deferred settlement workflow where cash collections
--              are validated ONLY when the REMISE (settlement) is accepted,
--              not at operation approval.

-- =============================================================================
-- PHASE 1: Add new statuses for deferred settlement workflow
-- =============================================================================

-- Add PENDING_SETTLEMENT status to operations_terrain
-- This status means: approved by supervisor but not yet settled (remise not done)
ALTER TYPE statut_operation_terrain_enum ADD VALUE IF NOT EXISTS 'PENDING_SETTLEMENT';

-- Add PENDING_SETTLEMENT status to paiements_terrain
-- This separates "collected but not settled" from "posted to client accounts"
ALTER TYPE statut_transaction_enum ADD VALUE IF NOT EXISTS 'PENDING_SETTLEMENT';

-- =============================================================================
-- PHASE 2: Enhance remises_terrain for complete settlement workflow
-- =============================================================================

-- Add columns to track the full settlement lifecycle
ALTER TABLE remises_terrain
  ADD COLUMN IF NOT EXISTS agence_id UUID REFERENCES agences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caisse_destination_id UUID REFERENCES caisses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ecart NUMERIC DEFAULT '0',
  ADD COLUMN IF NOT EXISTS motif_ecart TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS mouvement_caisse_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mouvement_coffre_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billetage JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique index on idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS uq_remises_terrain_idempotency
  ON remises_terrain(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add settled_remise_id to paiements_terrain to track which remise settled each payment
ALTER TABLE paiements_terrain
  ADD COLUMN IF NOT EXISTS settled_remise_id UUID REFERENCES remises_terrain(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS posted_mouvement_client_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL;

-- Index for finding unsettled payments
CREATE INDEX IF NOT EXISTS idx_paiements_terrain_settled
  ON paiements_terrain(settled_remise_id)
  WHERE settled_remise_id IS NULL;

-- =============================================================================
-- PHASE 3: Remise Items (link table for bordereau de remise)
-- =============================================================================

CREATE TABLE IF NOT EXISTS remise_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  remise_id UUID NOT NULL REFERENCES remises_terrain(id) ON DELETE CASCADE,
  paiement_terrain_id UUID NOT NULL REFERENCES paiements_terrain(id) ON DELETE RESTRICT,
  operation_terrain_id UUID REFERENCES operations_terrain(id) ON DELETE SET NULL,

  -- Snapshot of payment details at settlement time
  montant NUMERIC NOT NULL,
  type_paiement TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,

  -- Settlement tracking
  settled_at TIMESTAMP,
  mouvement_client_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_remise_items_montant_pos CHECK (montant > 0)
);

-- Indexes for remise_items
CREATE INDEX IF NOT EXISTS idx_remise_items_remise ON remise_items(remise_id);
CREATE INDEX IF NOT EXISTS idx_remise_items_paiement ON remise_items(paiement_terrain_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_remise_items_paiement ON remise_items(paiement_terrain_id);

-- =============================================================================
-- PHASE 4: Dossier Crédit (Loan Applications by Field Agent)
-- =============================================================================

-- Create enum for loan application status
DO $$ BEGIN
  CREATE TYPE statut_dossier_credit_enum AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'PENDING_FEES',
    'READY_FOR_INVESTIGATION',
    'UNDER_INVESTIGATION',
    'INVESTIGATION_COMPLETE',
    'IN_COMMITTEE',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS dossiers_credit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference and identification
  reference TEXT NOT NULL,
  idempotency_key TEXT,

  -- Source: from prospection or existing client
  prospection_id UUID REFERENCES prospections(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,

  -- Agent who created the dossier
  agent_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,
  agence_id UUID REFERENCES agences(id) ON DELETE SET NULL,

  -- Loan request details
  montant_demande NUMERIC NOT NULL,
  objet_credit TEXT NOT NULL,
  duree_souhaitee INTEGER, -- in months
  frequence_remboursement TEXT DEFAULT 'MONTHLY',

  -- Client information (snapshot or editable)
  nom_client TEXT NOT NULL,
  prenom_client TEXT,
  telephone_client TEXT NOT NULL,
  adresse_client TEXT,
  profession TEXT,
  type_activite TEXT,
  revenu_estime NUMERIC,

  -- Guarantor information
  nom_garant TEXT,
  telephone_garant TEXT,
  adresse_garant TEXT,
  relation_garant TEXT,

  -- Documents and attachments
  documents JSONB DEFAULT '[]',
  photo_url TEXT,

  -- Location
  latitude NUMERIC,
  longitude NUMERIC,

  -- Workflow status
  statut statut_dossier_credit_enum NOT NULL DEFAULT 'DRAFT',

  -- Fee tracking
  frais_engagement_attendus NUMERIC,
  frais_engagement_payes NUMERIC DEFAULT '0',
  paiement_frais_id UUID REFERENCES paiements_terrain(id) ON DELETE SET NULL,
  frais_payes_at TIMESTAMP,

  -- Submission
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP,

  -- Investigation link (created when ready)
  enquete_id UUID, -- Will be set when enquete is created

  -- Committee decision
  committee_decision TEXT,
  committee_decision_at TIMESTAMP,
  committee_decision_by UUID REFERENCES users(id) ON DELETE SET NULL,
  committee_observations TEXT,
  montant_approuve NUMERIC,

  -- Final outcome
  demande_credit_id UUID REFERENCES demandes_credit(id) ON DELETE SET NULL,
  credit_id UUID REFERENCES credits(id) ON DELETE SET NULL,

  -- Rejection/cancellation
  rejected_at TIMESTAMP,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  cancelled_at TIMESTAMP,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,

  -- Audit
  observations TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for dossiers_credit
CREATE UNIQUE INDEX IF NOT EXISTS uq_dossiers_credit_reference ON dossiers_credit(reference);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dossiers_credit_idempotency ON dossiers_credit(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dossiers_credit_agent ON dossiers_credit(agent_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_credit_client ON dossiers_credit(client_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_credit_prospection ON dossiers_credit(prospection_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_credit_statut ON dossiers_credit(statut);
CREATE INDEX IF NOT EXISTS idx_dossiers_credit_agence ON dossiers_credit(agence_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_credit_date ON dossiers_credit(created_at);

-- =============================================================================
-- PHASE 5: Enquête Crédit (Field Investigation)
-- =============================================================================

-- Create enum for investigation status
DO $$ BEGIN
  CREATE TYPE statut_enquete_credit_enum AS ENUM (
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'APPROVED',
    'REJECTED',
    'REDUCED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS enquetes_credit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  reference TEXT NOT NULL,

  -- Link to dossier
  dossier_id UUID NOT NULL REFERENCES dossiers_credit(id) ON DELETE RESTRICT,

  -- Assigned investigator (can be different from dossier agent)
  enqueteur_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Investigation dates
  date_visite_prevue DATE,
  date_visite_effective DATE,

  -- Location verification
  latitude_visite NUMERIC,
  longitude_visite NUMERIC,
  adresse_verifiee TEXT,
  adresse_conforme BOOLEAN,

  -- Activity verification
  activite_verifiee TEXT,
  activite_conforme BOOLEAN,
  local_type TEXT, -- Propre, Loué, Autre
  anciennete_activite TEXT,

  -- Revenue assessment
  revenu_constate NUMERIC,
  charges_mensuelles NUMERIC,
  capacite_remboursement NUMERIC,

  -- Guarantor verification
  garant_visite BOOLEAN DEFAULT FALSE,
  garant_conforme BOOLEAN,
  garant_observations TEXT,

  -- Risk assessment
  niveau_risque TEXT, -- FAIBLE, MOYEN, ELEVE
  score_risque INTEGER, -- 0-100

  -- Photos and documents
  photos JSONB DEFAULT '[]',
  documents_collectes JSONB DEFAULT '[]',

  -- Investigation result
  statut statut_enquete_credit_enum NOT NULL DEFAULT 'ASSIGNED',

  -- Recommendation
  avis_enqueteur TEXT, -- FAVORABLE, DEFAVORABLE, RESERVE
  montant_recommande NUMERIC,
  duree_recommandee INTEGER,
  observations TEXT,

  -- Completion
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Review
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  review_observations TEXT,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Update dossiers_credit to reference enquete
ALTER TABLE dossiers_credit
  ADD CONSTRAINT fk_dossiers_credit_enquete
  FOREIGN KEY (enquete_id) REFERENCES enquetes_credit(id) ON DELETE SET NULL;

-- Indexes for enquetes_credit
CREATE UNIQUE INDEX IF NOT EXISTS uq_enquetes_credit_reference ON enquetes_credit(reference);
CREATE INDEX IF NOT EXISTS idx_enquetes_credit_dossier ON enquetes_credit(dossier_id);
CREATE INDEX IF NOT EXISTS idx_enquetes_credit_enqueteur ON enquetes_credit(enqueteur_id);
CREATE INDEX IF NOT EXISTS idx_enquetes_credit_statut ON enquetes_credit(statut);
CREATE INDEX IF NOT EXISTS idx_enquetes_credit_date ON enquetes_credit(assigned_at);

-- =============================================================================
-- PHASE 6: Agent Mobile Money Payments (without REMISE)
-- =============================================================================

-- Table to track agent-initiated mobile money payments
-- These bypass the remise workflow and settle immediately on SUCCESS
CREATE TABLE IF NOT EXISTS agent_mm_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Payment intent reference
  payment_intent_id UUID REFERENCES mm_payment_intents(id) ON DELETE SET NULL,

  -- Agent and client
  agent_id UUID NOT NULL REFERENCES agents_terrain(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  agence_id UUID REFERENCES agences(id) ON DELETE SET NULL,

  -- Payment details
  type_paiement TEXT NOT NULL, -- CREDIT_REPAYMENT, DEPOSIT_SAVINGS, etc.
  montant NUMERIC NOT NULL,
  provider TEXT NOT NULL, -- MTN, AIRTEL
  phone TEXT NOT NULL,

  -- External references
  reference TEXT NOT NULL,
  external_reference TEXT,
  idempotency_key TEXT,

  -- Target financial product
  credit_id UUID REFERENCES credits(id) ON DELETE SET NULL,
  compte_id UUID REFERENCES comptes(id) ON DELETE SET NULL,
  tontine_id UUID,

  -- Status tracking
  statut TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, SUCCESS, FAILED, CANCELLED

  -- Settlement (on SUCCESS)
  settled_at TIMESTAMP,
  mouvement_client_id UUID REFERENCES mouvements_financiers(id) ON DELETE SET NULL,

  -- Error tracking
  error_code TEXT,
  error_message TEXT,

  -- Location
  latitude NUMERIC,
  longitude NUMERIC,

  -- Audit
  observations TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_agent_mm_payments_montant_pos CHECK (montant > 0)
);

-- Indexes for agent_mm_payments
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_mm_payments_reference ON agent_mm_payments(reference);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_mm_payments_idempotency ON agent_mm_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_mm_payments_agent ON agent_mm_payments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_mm_payments_client ON agent_mm_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_mm_payments_intent ON agent_mm_payments(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_agent_mm_payments_statut ON agent_mm_payments(statut);
CREATE INDEX IF NOT EXISTS idx_agent_mm_payments_date ON agent_mm_payments(created_at);

-- =============================================================================
-- PHASE 7: Audit logs for settlement operations
-- =============================================================================

CREATE TABLE IF NOT EXISTS remise_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  remise_id UUID NOT NULL REFERENCES remises_terrain(id) ON DELETE CASCADE,

  action TEXT NOT NULL, -- CREATED, SUBMITTED, APPROVED, REJECTED, SETTLED
  statut_avant TEXT,
  statut_apres TEXT NOT NULL,

  details JSONB,

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ip_address TEXT,
  user_agent TEXT,

  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remise_audit_logs_remise ON remise_audit_logs(remise_id);
CREATE INDEX IF NOT EXISTS idx_remise_audit_logs_timestamp ON remise_audit_logs(timestamp);

-- =============================================================================
-- PHASE 8: Update prospections to link to dossier_credit
-- =============================================================================

ALTER TABLE prospections
  ADD COLUMN IF NOT EXISTS dossier_credit_id UUID REFERENCES dossiers_credit(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_to_client BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_prospections_dossier ON prospections(dossier_credit_id);
CREATE INDEX IF NOT EXISTS idx_prospections_converted_client ON prospections(converted_client_id);

-- =============================================================================
-- PHASE 9: Function to calculate remise totals
-- =============================================================================

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

-- =============================================================================
-- PHASE 10: Comments for documentation
-- =============================================================================

COMMENT ON TABLE remise_items IS 'Items included in a bordereau de remise. Links paiements_terrain to their settling remise.';
COMMENT ON TABLE dossiers_credit IS 'Loan application files created by field agents. Tracks the full lifecycle from prospection to credit approval.';
COMMENT ON TABLE enquetes_credit IS 'Field investigations for loan applications. Contains verification data and risk assessment.';
COMMENT ON TABLE agent_mm_payments IS 'Mobile money payments initiated by field agents. These bypass the remise workflow and settle immediately on SUCCESS.';
COMMENT ON TABLE remise_audit_logs IS 'Immutable audit trail for all remise state transitions.';

COMMENT ON COLUMN operations_terrain.statut IS 'Workflow status. PENDING_SETTLEMENT means approved but awaiting remise settlement.';
COMMENT ON COLUMN paiements_terrain.settled_remise_id IS 'Reference to the remise that settled this payment. NULL means not yet settled.';
COMMENT ON COLUMN paiements_terrain.posted_mouvement_client_id IS 'Mouvement on client account, created only at settlement time.';
