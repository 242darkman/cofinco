-- Migration: Convert employe_id columns from VARCHAR to UUID
-- Created: 2024-12-25
-- Description: Fix type mismatch - convert VARCHAR to UUID with USING clause

-- Drop existing foreign key constraints first
ALTER TABLE demandes_conges DROP CONSTRAINT IF EXISTS demandes_conges_employe_id_fkey;
ALTER TABLE formation_participants DROP CONSTRAINT IF EXISTS formation_participants_employe_id_fkey;
ALTER TABLE sanctions DROP CONSTRAINT IF EXISTS sanctions_employe_id_fkey;
ALTER TABLE bulletins_paie DROP CONSTRAINT IF EXISTS bulletins_paie_employe_id_fkey;

-- Drop unique constraint on bulletins_paie (uses employe_id)
ALTER TABLE bulletins_paie DROP CONSTRAINT IF EXISTS bulletins_paie_employe_id_mois_key;

-- Drop indexes that use these columns
DROP INDEX IF EXISTS idx_demandes_conges_employe;
DROP INDEX IF EXISTS idx_formation_participants_employe;
DROP INDEX IF EXISTS idx_sanctions_employe;
DROP INDEX IF EXISTS idx_bulletins_paie_employe;

-- Convert columns from VARCHAR to UUID
ALTER TABLE demandes_conges
  ALTER COLUMN employe_id TYPE UUID USING employe_id::uuid;

ALTER TABLE demandes_conges
  ALTER COLUMN approuve_par TYPE UUID USING approuve_par::uuid;

ALTER TABLE formation_participants
  ALTER COLUMN employe_id TYPE UUID USING employe_id::uuid;

ALTER TABLE sanctions
  ALTER COLUMN employe_id TYPE UUID USING employe_id::uuid;

ALTER TABLE sanctions
  ALTER COLUMN emetteur_id TYPE UUID USING emetteur_id::uuid;

ALTER TABLE bulletins_paie
  ALTER COLUMN employe_id TYPE UUID USING employe_id::uuid;

ALTER TABLE bulletins_paie
  ALTER COLUMN genere_par_id TYPE UUID USING genere_par_id::uuid;

ALTER TABLE candidatures
  ALTER COLUMN responsable_rh_id TYPE UUID USING responsable_rh_id::uuid;

-- Recreate foreign key constraints
ALTER TABLE demandes_conges
  ADD CONSTRAINT demandes_conges_employe_id_fkey
  FOREIGN KEY (employe_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE formation_participants
  ADD CONSTRAINT formation_participants_employe_id_fkey
  FOREIGN KEY (employe_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE sanctions
  ADD CONSTRAINT sanctions_employe_id_fkey
  FOREIGN KEY (employe_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE bulletins_paie
  ADD CONSTRAINT bulletins_paie_employe_id_fkey
  FOREIGN KEY (employe_id) REFERENCES users(id) ON DELETE CASCADE;

-- Recreate unique constraint
ALTER TABLE bulletins_paie
  ADD CONSTRAINT bulletins_paie_employe_id_mois_key UNIQUE (employe_id, mois);

-- Recreate indexes
CREATE INDEX idx_demandes_conges_employe ON demandes_conges(employe_id);
CREATE INDEX idx_formation_participants_employe ON formation_participants(employe_id);
CREATE INDEX idx_sanctions_employe ON sanctions(employe_id);
CREATE INDEX idx_bulletins_paie_employe ON bulletins_paie(employe_id);
