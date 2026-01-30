-- Migration: Salary Rate History
-- Tracer les changements de salaire avec dates d'effet

CREATE TABLE IF NOT EXISTS "salary_rate_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employe_id" uuid NOT NULL REFERENCES "employes"("id") ON DELETE CASCADE,
  "salaire_base" numeric NOT NULL,
  "taux_horaire" numeric,
  "taux_journalier" numeric,
  "mode_calcul" varchar(20) NOT NULL DEFAULT 'MONTHLY', -- MONTHLY, HOURLY, DAILY
  "effective_from" date NOT NULL,
  "effective_to" date, -- NULL = actif
  "motif_changement" text,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_rate_history_employe ON salary_rate_history(employe_id);
CREATE INDEX IF NOT EXISTS idx_salary_rate_history_active ON salary_rate_history(employe_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_salary_rate_history_current ON salary_rate_history(employe_id)
  WHERE effective_to IS NULL;

COMMENT ON TABLE salary_rate_history IS 'Historique versionné des taux salariaux';
COMMENT ON COLUMN salary_rate_history.effective_to IS 'NULL indique le taux actuellement en vigueur';
