-- Migration: Sanction Escalation Rules
-- Règles d'escalade automatique des sanctions basées sur le nombre et la gravité

-- Table des règles d'escalade
CREATE TABLE IF NOT EXISTS "sanction_escalation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE CASCADE,
  "nom" text NOT NULL,
  "description" text,
  "sanction_count_threshold" integer NOT NULL, -- Nombre de sanctions avant escalade
  "period_months" integer DEFAULT 12, -- Période de comptage (en mois)
  "source_gravite" varchar(20) NOT NULL, -- Gravité source (AVERTISSEMENT, BLAME, etc.)
  "escalate_to_gravite" varchar(20) NOT NULL, -- Gravité vers laquelle escalader
  "notification_required" boolean DEFAULT true,
  "auto_apply" boolean DEFAULT false, -- Si true, applique automatiquement
  "actif" boolean DEFAULT true,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Ajout de colonnes à sanctions pour tracker l'escalade
ALTER TABLE "sanctions"
  ADD COLUMN IF NOT EXISTS "escalated_from_id" integer REFERENCES "sanctions"("id"),
  ADD COLUMN IF NOT EXISTS "auto_escalated" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "escalation_rule_id" uuid REFERENCES "sanction_escalation_rules"("id");

CREATE INDEX IF NOT EXISTS idx_sanction_escalation_rules_agence ON sanction_escalation_rules(agence_id);
CREATE INDEX IF NOT EXISTS idx_sanction_escalation_rules_active ON sanction_escalation_rules(agence_id, actif);
CREATE INDEX IF NOT EXISTS idx_sanctions_escalation ON sanctions(escalated_from_id) WHERE escalated_from_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanctions_auto_escalated ON sanctions(employe_id, auto_escalated) WHERE auto_escalated = true;

COMMENT ON TABLE sanction_escalation_rules IS 'Règles d''escalade automatique des sanctions';
COMMENT ON COLUMN sanction_escalation_rules.sanction_count_threshold IS 'Nombre de sanctions du même type dans la période avant escalade';
COMMENT ON COLUMN sanction_escalation_rules.period_months IS 'Période glissante en mois pour compter les sanctions';
