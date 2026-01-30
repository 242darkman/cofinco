-- Migration: Onboarding Pipeline
-- Pipeline de conversion candidat embauché vers employé

-- Checklist items template par agence
CREATE TABLE IF NOT EXISTS "onboarding_checklists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE CASCADE,
  "nom" text NOT NULL,
  "description" text,
  "items" jsonb NOT NULL DEFAULT '[]', -- [{name, required, category, order}]
  "actif" boolean DEFAULT true,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Instance d'onboarding pour chaque candidat/employé
CREATE TABLE IF NOT EXISTS "onboarding_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidature_id" integer REFERENCES "candidatures"("id") ON DELETE SET NULL,
  "employe_id" uuid REFERENCES "employes"("id") ON DELETE CASCADE,
  "checklist_id" uuid REFERENCES "onboarding_checklists"("id"),
  "completed_items" jsonb DEFAULT '[]', -- [{itemName, completedAt, completedBy, notes}]
  "statut" varchar(20) DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, COMPLETED, CANCELLED
  "started_at" timestamp,
  "completed_at" timestamp,
  "assigned_to" uuid REFERENCES "users"("id"), -- HR responsable
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_agence ON onboarding_checklists(agence_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_candidature ON onboarding_instances(candidature_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_employe ON onboarding_instances(employe_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_status ON onboarding_instances(statut);

COMMENT ON TABLE onboarding_checklists IS 'Modèles de checklist d''onboarding par agence';
COMMENT ON TABLE onboarding_instances IS 'Instances d''onboarding pour suivi individuel';
COMMENT ON COLUMN onboarding_checklists.items IS 'JSON array: [{name, required, category, order}]';
