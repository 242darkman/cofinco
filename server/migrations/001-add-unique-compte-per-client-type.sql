-- Migration: Add unique partial index for one account per type per client
-- Run: psql -d your_database -f server/migrations/001-add-unique-compte-per-client-type.sql

-- Ensure a client can have only ONE account of each type (Épargne, Courant, Bloqué) across ALL agencies
-- Using partial index to exclude soft-deleted accounts (deleted_at IS NULL)

CREATE UNIQUE INDEX IF NOT EXISTS uq_comptes_client_type_actif
ON comptes (client_id, type_compte)
WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON INDEX uq_comptes_client_type_actif IS
'Ensures a client can have only one account per type (Épargne/Courant/Bloqué) across all agencies. Soft-deleted accounts are excluded.';

-- Also ensure compte_agences_historique has only one active (date_fin IS NULL) record per compte
CREATE UNIQUE INDEX IF NOT EXISTS uq_compte_agence_active
ON compte_agences_historique (compte_id)
WHERE date_fin IS NULL;

COMMENT ON INDEX uq_compte_agence_active IS
'Ensures a compte has only one active agency assignment at a time.';
