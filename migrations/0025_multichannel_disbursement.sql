-- Migration: Multi-Channel Disbursement Workflow
-- Description: Adds support for ACCOUNT, CASH, and MOBILE_MONEY disbursement channels
-- Date: 2026-01-24

-- =====================================================
-- 1. CREATE ENUMS
-- =====================================================

-- Canal de décaissement
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disbursement_channel_enum') THEN
        CREATE TYPE disbursement_channel_enum AS ENUM ('ACCOUNT', 'CASH', 'MOBILE_MONEY');
    END IF;
END
$$;

-- Statut de décaissement
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disbursement_status_enum') THEN
        CREATE TYPE disbursement_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED');
    END IF;
END
$$;

-- =====================================================
-- 2. ADD NEW STATUS TO CREDIT ENUM
-- =====================================================

-- Add WAITING_DISBURSEMENT status to existing enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'statut_credit_enum'::regtype
        AND enumlabel = 'WAITING_DISBURSEMENT'
    ) THEN
        ALTER TYPE statut_credit_enum ADD VALUE 'WAITING_DISBURSEMENT';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- =====================================================
-- 3. ADD NEW COLUMNS TO CREDITS TABLE
-- =====================================================

-- Disbursement channel
ALTER TABLE credits
ADD COLUMN IF NOT EXISTS disbursement_channel disbursement_channel_enum DEFAULT 'ACCOUNT';

-- Disbursement status
ALTER TABLE credits
ADD COLUMN IF NOT EXISTS disbursement_status disbursement_status_enum;

-- Payment reference (N° reçu caisse ou ID transaction MoMo)
ALTER TABLE credits
ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- Effective disbursement date
ALTER TABLE credits
ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMP;

-- Cashier who performed the disbursement
ALTER TABLE credits
ADD COLUMN IF NOT EXISTS disbursed_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- =====================================================
-- 4. CREATE INDEX FOR PENDING DISBURSEMENTS
-- =====================================================

-- Index for efficient querying of pending cash disbursements
CREATE INDEX IF NOT EXISTS idx_credits_disbursement_pending
ON credits (disbursement_channel, disbursement_status)
WHERE disbursement_status = 'PENDING';

-- =====================================================
-- 5. ADD COMMENT FOR DOCUMENTATION
-- =====================================================

COMMENT ON COLUMN credits.disbursement_channel IS 'Canal de décaissement: ACCOUNT (compte courant), CASH (espèces caisse), MOBILE_MONEY';
COMMENT ON COLUMN credits.disbursement_status IS 'Statut du décaissement: PENDING (attente caisse), PROCESSING (en cours), COMPLETED (terminé)';
COMMENT ON COLUMN credits.payment_reference IS 'Référence de paiement: N° reçu caisse ou ID transaction Mobile Money';
COMMENT ON COLUMN credits.disbursed_at IS 'Date effective du décaissement physique (pour CASH/MOBILE_MONEY)';
COMMENT ON COLUMN credits.disbursed_by IS 'ID du caissier qui a effectué le décaissement physique';
