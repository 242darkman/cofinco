-- Add warranty, depreciation, and maintenance fields to agent_materiel
ALTER TABLE "agent_materiel" ADD COLUMN IF NOT EXISTS "date_garantie_fin" text;
ALTER TABLE "agent_materiel" ADD COLUMN IF NOT EXISTS "duree_amortissement_mois" integer DEFAULT 36;
ALTER TABLE "agent_materiel" ADD COLUMN IF NOT EXISTS "prochaine_maintenance" text;
ALTER TABLE "agent_materiel" ADD COLUMN IF NOT EXISTS "historique_maintenances" jsonb DEFAULT '[]';

-- Add incident escalation and attachment fields (from previous schema changes)
ALTER TABLE "agent_incidents" ADD COLUMN IF NOT EXISTS "pieces_jointes" jsonb DEFAULT '[]';
ALTER TABLE "agent_incidents" ADD COLUMN IF NOT EXISTS "escalade_par" text;
ALTER TABLE "agent_incidents" ADD COLUMN IF NOT EXISTS "date_escalade" timestamp;
