-- Migration: Clôture Journalière Agence (Multi-Caisse Validation)
-- Validation que toutes les caisses sont fermées avant clôture coffre/agence

-- Table de clôture journalière par agence
CREATE TABLE agency_daily_closure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id UUID NOT NULL REFERENCES agences(id),
  date_cloture DATE NOT NULL,

  -- Statut global
  statut TEXT NOT NULL DEFAULT 'OPEN' CHECK (statut IN ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED')),

  -- Compteurs caisses
  total_caisses INTEGER NOT NULL DEFAULT 0,
  caisses_closed INTEGER NOT NULL DEFAULT 0,
  caisses_with_pending_transfers INTEGER NOT NULL DEFAULT 0,
  caisses_with_pending_remises INTEGER NOT NULL DEFAULT 0,
  caisses_with_pending_ecarts INTEGER NOT NULL DEFAULT 0,

  -- Agrégats financiers
  total_montant_ouverture NUMERIC(15,2) DEFAULT 0,
  total_montant_fermeture NUMERIC(15,2) DEFAULT 0,
  total_montant_vers_coffre NUMERIC(15,2) DEFAULT 0,
  total_montant_reporte NUMERIC(15,2) DEFAULT 0,
  total_ecarts NUMERIC(15,2) DEFAULT 0,
  total_ecarts_surplus NUMERIC(15,2) DEFAULT 0,
  total_ecarts_deficit NUMERIC(15,2) DEFAULT 0,

  -- Workflow validations
  all_caisses_closed BOOLEAN NOT NULL DEFAULT FALSE,
  all_transfers_executed BOOLEAN NOT NULL DEFAULT FALSE,
  all_remises_settled BOOLEAN NOT NULL DEFAULT FALSE,
  all_ecarts_approved BOOLEAN NOT NULL DEFAULT FALSE,
  coffre_reconciled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Clôture finale
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMP,
  closure_observations TEXT,

  -- Réouverture exceptionnelle
  reopened_by UUID REFERENCES users(id),
  reopened_at TIMESTAMP,
  reopened_reason TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_agency_closure_date UNIQUE (agence_id, date_cloture)
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_agency_closure_agence ON agency_daily_closure(agence_id);
CREATE INDEX idx_agency_closure_date ON agency_daily_closure(date_cloture);
CREATE INDEX idx_agency_closure_statut ON agency_daily_closure(statut);
CREATE INDEX idx_agency_closure_open ON agency_daily_closure(agence_id, date_cloture) WHERE statut = 'OPEN';

-- Table des blockers de clôture (détails)
CREATE TABLE agency_closure_blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES agency_daily_closure(id) ON DELETE CASCADE,
  blocker_type TEXT NOT NULL CHECK (blocker_type IN (
    'CAISSE_OPEN',
    'TRANSFER_PENDING',
    'REMISE_PENDING',
    'ECART_PENDING',
    'MM_DISCREPANCY',
    'COFFRE_MISMATCH'
  )),
  entity_id UUID, -- ID de la caisse, transfert, remise, etc. concerné
  entity_type TEXT, -- Type d'entité (caisse, transfert, remise)
  description TEXT NOT NULL,
  montant NUMERIC(15,2),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_closure_blockers_closure ON agency_closure_blockers(closure_id);
CREATE INDEX idx_closure_blockers_unresolved ON agency_closure_blockers(closure_id, resolved) WHERE resolved = FALSE;

-- Table d'audit clôture agence
CREATE TABLE agency_closure_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id UUID NOT NULL REFERENCES agency_daily_closure(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- CREATED, CAISSE_CLOSED, TRANSFER_EXECUTED, FINALIZED, REOPENED, etc.
  actor_id UUID REFERENCES users(id),
  statut_avant TEXT,
  statut_apres TEXT,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_closure_audit_closure ON agency_closure_audit_log(closure_id);

-- Vue pour dashboard supervision
CREATE OR REPLACE VIEW v_agency_closure_status AS
SELECT
  adc.id,
  adc.agence_id,
  a.nom as agence_nom,
  adc.date_cloture,
  adc.statut,
  adc.total_caisses,
  adc.caisses_closed,
  (adc.total_caisses - adc.caisses_closed) as caisses_open,
  adc.all_caisses_closed,
  adc.all_transfers_executed,
  adc.all_remises_settled,
  adc.all_ecarts_approved,
  adc.coffre_reconciled,
  CASE
    WHEN adc.all_caisses_closed
      AND adc.all_transfers_executed
      AND adc.all_remises_settled
      AND adc.all_ecarts_approved
    THEN TRUE
    ELSE FALSE
  END as ready_to_close,
  (SELECT COUNT(*) FROM agency_closure_blockers acb WHERE acb.closure_id = adc.id AND acb.resolved = FALSE) as blockers_count,
  adc.closed_at,
  adc.closed_by
FROM agency_daily_closure adc
JOIN agences a ON adc.agence_id = a.id;

COMMENT ON TABLE agency_daily_closure IS 'Suivi de la clôture journalière multi-caisse par agence';
COMMENT ON TABLE agency_closure_blockers IS 'Éléments bloquant la clôture agence';
COMMENT ON VIEW v_agency_closure_status IS 'Vue synthétique du statut clôture par agence';
