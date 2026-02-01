-- Migration: Enforce agence_id on ecritures_comptables
--
-- Toutes les écritures comptables doivent appartenir à une agence.
-- Cette contrainte garantit la traçabilité et la réconciliation par agence.

-- 1. S'assurer qu'il n'y a pas d'écritures sans agence_id
UPDATE ecritures_comptables e
SET agence_id = mf.agence_id
FROM mouvements_financiers mf
WHERE e.mouvement_id = mf.id
  AND e.agence_id IS NULL
  AND mf.agence_id IS NOT NULL;

-- 2. Pour les écritures restantes sans mouvement, utiliser l'agence par défaut
-- (cas rare: écritures manuelles, reclassements, etc.)
UPDATE ecritures_comptables
SET agence_id = (SELECT id FROM agences LIMIT 1)
WHERE agence_id IS NULL;

-- 3. Ajouter la contrainte NOT NULL
ALTER TABLE ecritures_comptables
ALTER COLUMN agence_id SET NOT NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
