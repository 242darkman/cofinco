-- Migration: Denomination Templates
-- Pré-remplir le billetage depuis des modèles sauvegardés

CREATE TABLE IF NOT EXISTS "denomination_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nom" text NOT NULL,
  "description" text,
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE CASCADE,
  "caisse_id" uuid REFERENCES "caisses"("id") ON DELETE CASCADE,
  "billetage" jsonb NOT NULL, -- {10000: count, 5000: count, ...}
  "total_calcule" numeric NOT NULL,
  "type_template" varchar(20) DEFAULT 'GENERAL', -- OPENING, CLOSING, GENERAL
  "usage_count" integer DEFAULT 0,
  "last_used_at" timestamp,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_denomination_templates_agence ON denomination_templates(agence_id);
CREATE INDEX IF NOT EXISTS idx_denomination_templates_caisse ON denomination_templates(caisse_id);
CREATE INDEX IF NOT EXISTS idx_denomination_templates_type ON denomination_templates(agence_id, type_template);

COMMENT ON TABLE denomination_templates IS 'Modèles de billetage pour pré-remplissage rapide';
COMMENT ON COLUMN denomination_templates.billetage IS 'JSON object: {denomination: count} ex: {"10000": 5, "5000": 10}';
