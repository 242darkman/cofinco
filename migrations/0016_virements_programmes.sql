-- Migration: Ajout des virements internes programmes
-- Date: 2026-01-20
-- Description: Table pour persister les virements programmes et planifier l'execution via cron.

CREATE TABLE IF NOT EXISTS virements_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compte_source_id uuid NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  compte_dest_id uuid NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  montant numeric NOT NULL,
  frequence text NOT NULL,
  prochaine_execution timestamp,
  actif boolean NOT NULL DEFAULT true,
  dernier_execution timestamp,
  statut_dernier text,
  erreur_derniere text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_virements_prog_montant_pos CHECK (montant > 0),
  CONSTRAINT chk_virements_prog_frequence CHECK (frequence IN ('once', 'daily', 'weekly', 'monthly'))
);

CREATE INDEX IF NOT EXISTS idx_virements_prog_execution
  ON virements_programmes (actif, prochaine_execution);

CREATE INDEX IF NOT EXISTS idx_virements_prog_source
  ON virements_programmes (compte_source_id, created_at);

CREATE INDEX IF NOT EXISTS idx_virements_prog_dest
  ON virements_programmes (compte_dest_id, created_at);
