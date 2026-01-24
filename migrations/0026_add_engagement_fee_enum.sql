-- Migration: Add ENGAGEMENT_FEE to type_operation_caisse enum
-- Date: 2026-01-24
-- This adds the missing ENGAGEMENT_FEE enum value for credit engagement fee payments

-- Add ENGAGEMENT_FEE if it doesn't exist
DO $$ BEGIN
  ALTER TYPE type_operation_caisse ADD VALUE IF NOT EXISTS 'ENGAGEMENT_FEE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Verification
SELECT 'Migration 0026 completed: ENGAGEMENT_FEE added to type_operation_caisse' AS status;
