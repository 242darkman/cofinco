-- Migration: Add agences and user_agences tables
-- Date: 2025-12-27

-- Create agences table
CREATE TABLE IF NOT EXISTS agences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_agence VARCHAR(20) NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    type_agence TEXT NOT NULL DEFAULT 'Secondaire', -- 'Principale', 'Secondaire', 'Kiosque'
    adresse TEXT,
    ville TEXT,
    region TEXT,
    pays TEXT DEFAULT 'Congo-Brazzaville',
    telephone TEXT,
    email TEXT,
    responsable_id UUID REFERENCES users(id),
    responsable_nom TEXT,
    responsable_phone TEXT,
    statut TEXT NOT NULL DEFAULT 'Actif', -- 'Actif', 'Suspendu', 'Fermé'
    date_ouverture DATE,
    nombre_employes INTEGER DEFAULT 0,
    nombre_clients INTEGER DEFAULT 0,
    latitude NUMERIC,
    longitude NUMERIC,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_agences table (liaison table for multi-agency users)
CREATE TABLE IF NOT EXISTS user_agences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agence_id UUID NOT NULL REFERENCES agences(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    role TEXT, -- Role specific to this agency (optional)
    date_affectation DATE DEFAULT CURRENT_DATE,
    date_fin DATE, -- If the assignment is temporary
    actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, agence_id) -- Prevent duplicate assignments
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agences_statut ON agences(statut);
CREATE INDEX IF NOT EXISTS idx_agences_type ON agences(type_agence);
CREATE INDEX IF NOT EXISTS idx_agences_ville ON agences(ville);
CREATE INDEX IF NOT EXISTS idx_user_agences_user ON user_agences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agences_agence ON user_agences(agence_id);
CREATE INDEX IF NOT EXISTS idx_user_agences_primary ON user_agences(user_id, is_primary) WHERE is_primary = true;

-- Insert default "Agence Centrale" if it doesn't exist
INSERT INTO agences (code_agence, nom, type_agence, ville, pays, statut)
VALUES ('COF-CENTRAL', 'Agence Centrale', 'Principale', 'Brazzaville', 'Congo-Brazzaville', 'Actif')
ON CONFLICT (code_agence) DO NOTHING;

-- Migrate existing users' agence field to user_agences table
-- This will create entries in user_agences for users who have an agence value
DO $$
DECLARE
    default_agence_id UUID;
    r RECORD;
BEGIN
    -- Get the default agence ID
    SELECT id INTO default_agence_id FROM agences WHERE code_agence = 'COF-CENTRAL';

    -- For each user that has an agence value but no entry in user_agences
    FOR r IN
        SELECT u.id as user_id, u.agence
        FROM users u
        WHERE u.agence IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM user_agences ua WHERE ua.user_id = u.id)
    LOOP
        -- Check if agence exists, if not create it
        IF NOT EXISTS (SELECT 1 FROM agences WHERE nom = r.agence OR code_agence = r.agence) THEN
            INSERT INTO agences (code_agence, nom, type_agence, statut)
            VALUES (
                'COF-' || UPPER(LEFT(REPLACE(r.agence, ' ', ''), 6)) || '-' || FLOOR(RANDOM() * 1000)::TEXT,
                r.agence,
                'Secondaire',
                'Actif'
            );
        END IF;

        -- Get the agence ID
        SELECT id INTO default_agence_id FROM agences WHERE nom = r.agence OR code_agence = r.agence LIMIT 1;

        -- Create user_agences entry
        IF default_agence_id IS NOT NULL THEN
            INSERT INTO user_agences (user_id, agence_id, is_primary, actif)
            VALUES (r.user_id, default_agence_id, true, true)
            ON CONFLICT (user_id, agence_id) DO NOTHING;
        END IF;
    END LOOP;

    -- For users without any agence, assign them to Agence Centrale
    SELECT id INTO default_agence_id FROM agences WHERE code_agence = 'COF-CENTRAL';

    INSERT INTO user_agences (user_id, agence_id, is_primary, actif)
    SELECT u.id, default_agence_id, true, true
    FROM users u
    WHERE NOT EXISTS (SELECT 1 FROM user_agences ua WHERE ua.user_id = u.id)
    ON CONFLICT (user_id, agence_id) DO NOTHING;
END $$;

-- Comment: The old 'agence' column in users table is kept for backward compatibility
-- It can be removed in a future migration after verifying all data is migrated
