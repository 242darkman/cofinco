-- Migration: Shift Templates
-- Permet de sauvegarder et réutiliser des modèles d'horaires de travail

CREATE TABLE IF NOT EXISTS "shift_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nom" text NOT NULL,
  "description" text,
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE CASCADE,
  "horaires" jsonb NOT NULL, -- [{jourSemaine: 0-6, heureDebut, heureFin, pauseMinutes}]
  "created_by" uuid REFERENCES "users"("id"),
  "is_default" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_agence ON shift_templates(agence_id);
CREATE INDEX IF NOT EXISTS idx_shift_templates_default ON shift_templates(agence_id, is_default) WHERE is_default = true;

COMMENT ON TABLE shift_templates IS 'Modèles d''horaires de travail réutilisables';
COMMENT ON COLUMN shift_templates.horaires IS 'JSON array: [{jourSemaine, heureDebut, heureFin, pauseMinutes}]';
