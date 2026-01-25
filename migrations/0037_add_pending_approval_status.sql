-- Migration: Add PENDING_APPROVAL status to demande credit workflow
-- Version: 0037
-- Date: 2026-01-25
-- Description: Adds PENDING_APPROVAL enum value to statut_demande_enum
--   for the intermediate step between investigation completion and committee decision.

DO $$ BEGIN
  ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate existing INVESTIGATION_COMPLETE demands to PENDING_APPROVAL
-- These are demands that were waiting for committee decision
UPDATE demandes_credit
SET statut = 'PENDING_APPROVAL'
WHERE statut = 'INVESTIGATION_COMPLETE';
