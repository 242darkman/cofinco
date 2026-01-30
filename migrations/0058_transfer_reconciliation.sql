-- Migration: Transfer Reconciliation
-- Réconciliation des transferts inter-agences

-- Ajout de colonnes de réconciliation aux transferts
ALTER TABLE "caisse_transferts"
  ADD COLUMN IF NOT EXISTS "reconciled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reconciled_at" timestamp,
  ADD COLUMN IF NOT EXISTS "reconciled_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "days_in_transit" integer,
  ADD COLUMN IF NOT EXISTS "reconciliation_notes" text;

CREATE INDEX IF NOT EXISTS idx_caisse_transferts_reconciled ON caisse_transferts(reconciled, statut);
CREATE INDEX IF NOT EXISTS idx_caisse_transferts_pending_reconciliation ON caisse_transferts(agence_dest_id, reconciled)
  WHERE statut = 'COMPLETED' AND reconciled = false;

COMMENT ON COLUMN caisse_transferts.reconciled IS 'Indique si le transfert a été réconcilié côté réception';
COMMENT ON COLUMN caisse_transferts.days_in_transit IS 'Nombre de jours entre envoi et réception effective';
