-- Migration: Add PENDING_CAISSE to statut_refund_request_enum
-- Date: 2026-01-24
-- This adds the PENDING_CAISSE status for cash/mobile money refunds awaiting caisse validation

-- Add PENDING_CAISSE if it doesn't exist
DO $$ BEGIN
  ALTER TYPE statut_refund_request_enum ADD VALUE IF NOT EXISTS 'PENDING_CAISSE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Verification
SELECT 'Migration 0027 completed: PENDING_CAISSE added to statut_refund_request_enum' AS status;
