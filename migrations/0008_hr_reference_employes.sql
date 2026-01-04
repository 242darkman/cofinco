-- Migration: Update HR tables to reference employes.id instead of users.id
-- This establishes the correct architecture: HR tables → employes → users

-- Note: This migration assumes that all employees referenced in HR tables
-- already have corresponding records in the employes table via employes.userId

-- Step 1: Add temporary columns to store employes.id
ALTER TABLE demandes_conges ADD COLUMN IF NOT EXISTS new_employe_id UUID;
ALTER TABLE formation_participants ADD COLUMN IF NOT EXISTS new_employe_id UUID;
ALTER TABLE sanctions ADD COLUMN IF NOT EXISTS new_employe_id UUID;
ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS new_employe_id UUID;
ALTER TABLE avantages_employes ADD COLUMN IF NOT EXISTS new_employe_id UUID;
ALTER TABLE presences ADD COLUMN IF NOT EXISTS new_employe_id UUID;
ALTER TABLE horaires_travail ADD COLUMN IF NOT EXISTS new_employe_id UUID;

-- Step 2: Populate new columns by mapping users.id → employes.id
UPDATE demandes_conges dc
SET new_employe_id = e.id
FROM employes e
WHERE dc.employe_id = e.user_id;

UPDATE formation_participants fp
SET new_employe_id = e.id
FROM employes e
WHERE fp.employe_id = e.user_id;

UPDATE sanctions s
SET new_employe_id = e.id
FROM employes e
WHERE s.employe_id = e.user_id;

UPDATE bulletins_paie bp
SET new_employe_id = e.id
FROM employes e
WHERE bp.employe_id = e.user_id;

UPDATE avantages_employes ae
SET new_employe_id = e.id
FROM employes e
WHERE ae.employe_id = e.user_id;

UPDATE presences p
SET new_employe_id = e.id
FROM employes e
WHERE p.employe_id = e.user_id;

UPDATE horaires_travail ht
SET new_employe_id = e.id
FROM employes e
WHERE ht.employe_id = e.user_id;

-- Step 3: Drop old foreign key constraints (if they exist)
DO $$ 
BEGIN
    -- Drop constraints if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'demandes_conges_employe_id_users_id_fk') THEN
        ALTER TABLE demandes_conges DROP CONSTRAINT demandes_conges_employe_id_users_id_fk;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'formation_participants_employe_id_users_id_fk') THEN
        ALTER TABLE formation_participants DROP CONSTRAINT formation_participants_employe_id_users_id_fk;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'sanctions_employe_id_users_id_fk') THEN
        ALTER TABLE sanctions DROP CONSTRAINT sanctions_employe_id_users_id_fk;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'bulletins_paie_employe_id_users_id_fk') THEN
        ALTER TABLE bulletins_paie DROP CONSTRAINT bulletins_paie_employe_id_users_id_fk;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'avantages_employes_employe_id_users_id_fk') THEN
        ALTER TABLE avantages_employes DROP CONSTRAINT avantages_employes_employe_id_users_id_fk;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'presences_employe_id_users_id_fk') THEN
        ALTER TABLE presences DROP CONSTRAINT presences_employe_id_users_id_fk;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'horaires_travail_employe_id_users_id_fk') THEN
        ALTER TABLE horaires_travail DROP CONSTRAINT horaires_travail_employe_id_users_id_fk;
    END IF;
END $$;

-- Step 4: Drop old employe_id columns
ALTER TABLE demandes_conges DROP COLUMN employe_id;
ALTER TABLE formation_participants DROP COLUMN employe_id;
ALTER TABLE sanctions DROP COLUMN employe_id;
ALTER TABLE bulletins_paie DROP COLUMN employe_id;
ALTER TABLE avantages_employes DROP COLUMN employe_id;
ALTER TABLE presences DROP COLUMN employe_id;
ALTER TABLE horaires_travail DROP COLUMN employe_id;

-- Step 5: Rename new columns to employe_id
ALTER TABLE demandes_conges RENAME COLUMN new_employe_id TO employe_id;
ALTER TABLE formation_participants RENAME COLUMN new_employe_id TO employe_id;
ALTER TABLE sanctions RENAME COLUMN new_employe_id TO employe_id;
ALTER TABLE bulletins_paie RENAME COLUMN new_employe_id TO employe_id;
ALTER TABLE avantages_employes RENAME COLUMN new_employe_id TO employe_id;
ALTER TABLE presences RENAME COLUMN new_employe_id TO employe_id;
ALTER TABLE horaires_travail RENAME COLUMN new_employe_id TO employe_id;

-- Step 6: Add NOT NULL constraints
ALTER TABLE demandes_conges ALTER COLUMN employe_id SET NOT NULL;
ALTER TABLE formation_participants ALTER COLUMN employe_id SET NOT NULL;
ALTER TABLE sanctions ALTER COLUMN employe_id SET NOT NULL;
ALTER TABLE bulletins_paie ALTER COLUMN employe_id SET NOT NULL;
ALTER TABLE avantages_employes ALTER COLUMN employe_id SET NOT NULL;
ALTER TABLE presences ALTER COLUMN employe_id SET NOT NULL;
ALTER TABLE horaires_travail ALTER COLUMN employe_id SET NOT NULL;

-- Step 7: Add new foreign key constraints to employes table
ALTER TABLE demandes_conges 
    ADD CONSTRAINT demandes_conges_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id);

ALTER TABLE formation_participants 
    ADD CONSTRAINT formation_participants_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id) ON DELETE CASCADE;

ALTER TABLE sanctions 
    ADD CONSTRAINT sanctions_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id);

ALTER TABLE bulletins_paie 
    ADD CONSTRAINT bulletins_paie_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id);

ALTER TABLE avantages_employes 
    ADD CONSTRAINT avantages_employes_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id);

ALTER TABLE presences 
    ADD CONSTRAINT presences_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id);

ALTER TABLE horaires_travail 
    ADD CONSTRAINT horaires_travail_employe_id_employes_id_fk 
    FOREIGN KEY (employe_id) REFERENCES employes(id);
