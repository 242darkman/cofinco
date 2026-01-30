-- Migration: Scheduled Caisse Transfers
-- Planification de transferts futurs entre agences

CREATE TABLE IF NOT EXISTS "scheduled_caisse_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agence_source_id" uuid NOT NULL REFERENCES "agences"("id"),
  "agence_dest_id" uuid NOT NULL REFERENCES "agences"("id"),
  "montant" numeric NOT NULL,
  "date_prevue" date NOT NULL,
  "frequence" varchar(20) DEFAULT 'ONE_TIME', -- ONE_TIME, DAILY, WEEKLY, MONTHLY
  "jour_semaine" integer, -- 0-6 for weekly frequency
  "jour_mois" integer, -- 1-31 for monthly frequency
  "motif" text,
  "statut" varchar(20) DEFAULT 'SCHEDULED', -- SCHEDULED, EXECUTED, CANCELLED, FAILED
  "transfert_id" uuid REFERENCES "caisse_transferts"("id"), -- Link to executed transfer
  "derniere_execution" timestamp,
  "prochaine_execution" timestamp,
  "nombre_executions" integer DEFAULT 0,
  "max_executions" integer, -- NULL = unlimited for recurring
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_date ON scheduled_caisse_transfers(date_prevue, statut);
CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_agence_source ON scheduled_caisse_transfers(agence_source_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_next_exec ON scheduled_caisse_transfers(prochaine_execution) WHERE statut = 'SCHEDULED';

COMMENT ON TABLE scheduled_caisse_transfers IS 'Transferts inter-agences planifiés';
COMMENT ON COLUMN scheduled_caisse_transfers.frequence IS 'ONE_TIME, DAILY, WEEKLY, MONTHLY';
