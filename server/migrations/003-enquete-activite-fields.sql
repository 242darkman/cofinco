-- Migration: Add all enquete fields for complete data persistence
-- Run: psql -d your_database -f server/migrations/003-enquete-activite-fields.sql

-- ============================================================================
-- 1. Activité professionnelle
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'categorie_activite') THEN
        ALTER TABLE enquetes_credit ADD COLUMN categorie_activite TEXT;
        COMMENT ON COLUMN enquetes_credit.categorie_activite IS 'Catégorie: Commerce, Services, Artisanat, Agriculture, Élevage, Transport, Autre';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'type_activite') THEN
        ALTER TABLE enquetes_credit ADD COLUMN type_activite TEXT;
        COMMENT ON COLUMN enquetes_credit.type_activite IS 'Type spécifique d''activité selon la catégorie';
    END IF;
END $$;

-- ============================================================================
-- 2. Données complémentaires (JSON)
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'autres_credits') THEN
        ALTER TABLE enquetes_credit ADD COLUMN autres_credits JSON;
        COMMENT ON COLUMN enquetes_credit.autres_credits IS 'Autres crédits en cours: [{organisme, montant, echeance}]';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'garanties_proposees') THEN
        ALTER TABLE enquetes_credit ADD COLUMN garanties_proposees JSON;
        COMMENT ON COLUMN enquetes_credit.garanties_proposees IS 'Garanties proposées: [{type, description, valeur}]';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'photos_activite') THEN
        ALTER TABLE enquetes_credit ADD COLUMN photos_activite TEXT[];
        COMMENT ON COLUMN enquetes_credit.photos_activite IS 'URLs ou base64 des photos de l''activité';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'documents_justificatifs') THEN
        ALTER TABLE enquetes_credit ADD COLUMN documents_justificatifs TEXT[];
        COMMENT ON COLUMN enquetes_credit.documents_justificatifs IS 'Documents justificatifs fournis';
    END IF;
END $$;

-- ============================================================================
-- 3. Géolocalisation terrain
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'geo_latitude') THEN
        ALTER TABLE enquetes_credit ADD COLUMN geo_latitude NUMERIC;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'geo_longitude') THEN
        ALTER TABLE enquetes_credit ADD COLUMN geo_longitude NUMERIC;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'geo_accuracy') THEN
        ALTER TABLE enquetes_credit ADD COLUMN geo_accuracy NUMERIC;
        COMMENT ON COLUMN enquetes_credit.geo_accuracy IS 'Précision GPS en mètres';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'enquetes_credit' AND column_name = 'geo_timestamp') THEN
        ALTER TABLE enquetes_credit ADD COLUMN geo_timestamp TIMESTAMP;
        COMMENT ON COLUMN enquetes_credit.geo_timestamp IS 'Date/heure de capture GPS';
    END IF;
END $$;

-- ============================================================================
-- 4. Index pour performances
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_enquetes_credit_categorie_activite
ON enquetes_credit (categorie_activite)
WHERE categorie_activite IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enquetes_credit_geo
ON enquetes_credit (geo_latitude, geo_longitude)
WHERE geo_latitude IS NOT NULL;

-- ============================================================================
-- Verification
-- ============================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'enquetes_credit'
AND column_name IN (
    'categorie_activite', 'type_activite',
    'autres_credits', 'garanties_proposees', 'photos_activite', 'documents_justificatifs',
    'geo_latitude', 'geo_longitude', 'geo_accuracy', 'geo_timestamp'
)
ORDER BY column_name;
