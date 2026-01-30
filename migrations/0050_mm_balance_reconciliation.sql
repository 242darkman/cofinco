-- Migration: Mobile Money Balance Reconciliation
-- Permet de vérifier les soldes fournisseurs MM lors de la clôture session

-- Table des réconciliations MM
CREATE TABLE mm_balance_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions_caisse(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('MTN', 'AIRTEL')),
  caisse_digitale_id UUID REFERENCES caisses(id),

  -- Soldes au moment de la réconciliation
  expected_balance NUMERIC(15,2) NOT NULL, -- Solde attendu (caisse digitale)
  provider_balance NUMERIC(15,2), -- Solde réel fournisseur (NULL si API échoue)
  ecart NUMERIC(15,2) NOT NULL,

  -- Métadonnées appel API
  api_call_success BOOLEAN NOT NULL DEFAULT FALSE,
  api_error_message TEXT,
  api_response_time_ms INTEGER,

  -- Workflow
  statut TEXT NOT NULL DEFAULT 'PENDING' CHECK (statut IN ('PENDING', 'MATCHED', 'DISCREPANCY', 'API_FAILED', 'OVERRIDDEN')),
  override_reason TEXT,
  overridden_by UUID REFERENCES users(id),
  overridden_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_mm_balance_recon_session ON mm_balance_reconciliations(session_id);
CREATE INDEX idx_mm_balance_recon_statut ON mm_balance_reconciliations(statut);
CREATE INDEX idx_mm_balance_recon_provider ON mm_balance_reconciliations(provider);
CREATE INDEX idx_mm_balance_recon_pending ON mm_balance_reconciliations(statut) WHERE statut IN ('PENDING', 'DISCREPANCY');

-- Colonnes additionnelles sur sessions_caisse
ALTER TABLE sessions_caisse
ADD COLUMN IF NOT EXISTS mm_reconciliation_status TEXT CHECK (mm_reconciliation_status IN ('PENDING', 'MATCHED', 'DISCREPANCY', 'SKIPPED')),
ADD COLUMN IF NOT EXISTS mm_reconciliation_completed_at TIMESTAMP;

COMMENT ON TABLE mm_balance_reconciliations IS 'Réconciliation soldes Mobile Money lors clôture session caisse';
COMMENT ON COLUMN mm_balance_reconciliations.expected_balance IS 'Solde attendu depuis la caisse digitale MM';
COMMENT ON COLUMN mm_balance_reconciliations.provider_balance IS 'Solde réel retourné par API fournisseur';
COMMENT ON COLUMN mm_balance_reconciliations.statut IS 'PENDING=en cours, MATCHED=ok, DISCREPANCY=écart détecté, API_FAILED=erreur API, OVERRIDDEN=forcé';
