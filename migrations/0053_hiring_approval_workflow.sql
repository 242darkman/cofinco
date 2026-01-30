-- Migration: Hiring Approval Workflow
-- Chaîne d'approbation multi-niveaux pour le recrutement

-- Configuration des niveaux d'approbation par agence
CREATE TABLE IF NOT EXISTS "hiring_approval_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE CASCADE,
  "approval_levels" jsonb NOT NULL DEFAULT '[]', -- [{level: 1, role: 'MANAGER', required: true}, {level: 2, role: 'DIRECTOR', required: true}]
  "min_salary_threshold" numeric, -- Seuil de salaire au-dessus duquel approbation supplémentaire requise
  "actif" boolean DEFAULT true,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Instance d'approbation pour chaque candidature
CREATE TABLE IF NOT EXISTS "hiring_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidature_id" integer NOT NULL REFERENCES "candidatures"("id") ON DELETE CASCADE,
  "level" integer NOT NULL,
  "approver_role" varchar(50) NOT NULL,
  "approver_id" uuid REFERENCES "users"("id"),
  "statut" varchar(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, SKIPPED
  "commentaire" text,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

-- Ajout de colonnes à candidatures pour tracker le workflow
ALTER TABLE "candidatures"
  ADD COLUMN IF NOT EXISTS "current_approval_level" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approval_status" varchar(20) DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, APPROVED, REJECTED
  ADD COLUMN IF NOT EXISTS "final_approved_at" timestamp,
  ADD COLUMN IF NOT EXISTS "final_approved_by" uuid REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS idx_hiring_approval_config_agence ON hiring_approval_config(agence_id);
CREATE INDEX IF NOT EXISTS idx_hiring_approvals_candidature ON hiring_approvals(candidature_id);
CREATE INDEX IF NOT EXISTS idx_hiring_approvals_status ON hiring_approvals(statut, approver_role);
CREATE INDEX IF NOT EXISTS idx_candidatures_approval_status ON candidatures(approval_status);

COMMENT ON TABLE hiring_approval_config IS 'Configuration des niveaux d''approbation pour le recrutement par agence';
COMMENT ON TABLE hiring_approvals IS 'Instances d''approbation pour chaque candidature';
COMMENT ON COLUMN hiring_approval_config.approval_levels IS 'JSON array: [{level, role, required}]';
