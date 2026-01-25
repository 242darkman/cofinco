-- Migration 0029: Fix empty reference_externe values
-- Converts empty strings to NULL to comply with UNIQUE constraint
-- This must be run before db:push to ensure UNIQUE constraints can be created

-- Update mouvements_financiers
UPDATE mouvements_financiers
SET reference_externe = NULL
WHERE reference_externe = '';

-- Update remboursements
UPDATE remboursements
SET reference_externe = NULL
WHERE reference_externe = '' AND reference_externe IS NOT NULL;

-- Update transactions_compte
UPDATE transactions_compte
SET reference_externe = NULL
WHERE reference_externe = '' AND reference_externe IS NOT NULL;
