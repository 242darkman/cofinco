-- Migration: Dual Count Verification
-- Vérification obligatoire à deux pour les clôtures de caisse

-- Configuration du comptage à deux par agence
CREATE TABLE IF NOT EXISTS "dual_count_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE CASCADE,
  "threshold_montant" numeric DEFAULT 1000000, -- Seuil au-dessus duquel double comptage requis
  "always_required_for_closing" boolean DEFAULT true,
  "require_different_user" boolean DEFAULT true, -- Les deux compteurs doivent être différents
  "max_ecart_tolerance" numeric DEFAULT 100, -- Tolérance maximale entre les deux comptages
  "actif" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Ajout de colonnes à comptage_billets pour le dual count
ALTER TABLE "comptage_billets"
  ADD COLUMN IF NOT EXISTS "compteur_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "verificateur_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "verification_billetage" jsonb,
  ADD COLUMN IF NOT EXISTS "verification_total" numeric,
  ADD COLUMN IF NOT EXISTS "ecart_verification" numeric,
  ADD COLUMN IF NOT EXISTS "dual_count_required" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dual_count_completed" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verification_submitted_at" timestamp;

CREATE INDEX IF NOT EXISTS idx_dual_count_config_agence ON dual_count_config(agence_id);
CREATE INDEX IF NOT EXISTS idx_comptage_billets_dual ON comptage_billets(session_caisse_id, dual_count_required) WHERE dual_count_required = true;

COMMENT ON TABLE dual_count_config IS 'Configuration du comptage à deux par agence';
COMMENT ON COLUMN comptage_billets.verification_billetage IS 'Billetage du vérificateur (second comptage)';
COMMENT ON COLUMN comptage_billets.ecart_verification IS 'Écart entre comptage principal et vérification';
