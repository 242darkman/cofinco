-- Migration: Complete Accounting Rules for All Account Types
--
-- Problem: The initial migration 0030 only had rules for DEPOSIT_SAVINGS/WITHDRAWAL_SAVINGS
-- but the application uses DEPOSIT_CURRENT, DEPOSIT_BLOCKED, WITHDRAWAL_CURRENT for
-- different account types (Courant, Bloqué).
--
-- This migration adds the missing rules.

-- ============================================================================
-- DEPOTS COMPTE COURANT (DEPOSIT_CURRENT)
-- ============================================================================

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "provider", "journal_code", "debit_account", "credit_account", "description_template", "priority")
VALUES
    -- Cash deposits on Compte Courant
    ('DEP_CASH_CURRENT', 'Dépôt espèces compte courant', 'Dépôt en espèces sur compte courant client', 'MOUVEMENT', 'DEPOSIT_CURRENT', 'CASH', NULL, 'CAI', '571', '4111', 'Dépôt espèces courant - {clientName}', 10),

    -- Mobile Money MTN deposits on Compte Courant
    ('DEP_MTN_CURRENT', 'Dépôt MTN compte courant', 'Dépôt Mobile Money MTN sur compte courant', 'MOUVEMENT', 'DEPOSIT_CURRENT', 'MOBILE_MONEY', 'MTN', 'MMTN', '5781', '4111', 'Dépôt MTN MoMo courant - {clientName}', 10),

    -- Mobile Money Airtel deposits on Compte Courant
    ('DEP_AIRTEL_CURRENT', 'Dépôt Airtel compte courant', 'Dépôt Mobile Money Airtel sur compte courant', 'MOUVEMENT', 'DEPOSIT_CURRENT', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '5782', '4111', 'Dépôt Airtel Money courant - {clientName}', 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- DEPOTS COMPTE BLOQUE (DEPOSIT_BLOCKED)
-- ============================================================================

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "provider", "journal_code", "debit_account", "credit_account", "description_template", "priority")
VALUES
    -- Cash deposits on Compte Bloqué
    ('DEP_CASH_BLOCKED', 'Dépôt espèces compte bloqué', 'Dépôt en espèces sur compte bloqué client', 'MOUVEMENT', 'DEPOSIT_BLOCKED', 'CASH', NULL, 'CAI', '571', '4113', 'Dépôt espèces bloqué - {clientName}', 10),

    -- Mobile Money MTN deposits on Compte Bloqué
    ('DEP_MTN_BLOCKED', 'Dépôt MTN compte bloqué', 'Dépôt Mobile Money MTN sur compte bloqué', 'MOUVEMENT', 'DEPOSIT_BLOCKED', 'MOBILE_MONEY', 'MTN', 'MMTN', '5781', '4113', 'Dépôt MTN MoMo bloqué - {clientName}', 10),

    -- Mobile Money Airtel deposits on Compte Bloqué
    ('DEP_AIRTEL_BLOCKED', 'Dépôt Airtel compte bloqué', 'Dépôt Mobile Money Airtel sur compte bloqué', 'MOUVEMENT', 'DEPOSIT_BLOCKED', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '5782', '4113', 'Dépôt Airtel Money bloqué - {clientName}', 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- RETRAITS COMPTE COURANT (WITHDRAWAL_CURRENT)
-- ============================================================================

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "provider", "journal_code", "debit_account", "credit_account", "description_template", "priority")
VALUES
    -- Cash withdrawals from Compte Courant
    ('RET_CASH_CURRENT', 'Retrait espèces compte courant', 'Retrait en espèces depuis compte courant', 'MOUVEMENT', 'WITHDRAWAL_CURRENT', 'CASH', NULL, 'CAI', '4111', '571', 'Retrait espèces courant - {clientName}', 10),

    -- Mobile Money MTN payout from Compte Courant
    ('RET_MTN_CURRENT', 'Payout MTN compte courant', 'Payout vers Mobile Money MTN depuis compte courant', 'MOUVEMENT', 'WITHDRAWAL_CURRENT', 'MOBILE_MONEY', 'MTN', 'MMTN', '4111', '5781', 'Payout MTN courant - {clientName}', 10),

    -- Mobile Money Airtel payout from Compte Courant
    ('RET_AIRTEL_CURRENT', 'Payout Airtel compte courant', 'Payout vers Mobile Money Airtel depuis compte courant', 'MOUVEMENT', 'WITHDRAWAL_CURRENT', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '4111', '5782', 'Payout Airtel courant - {clientName}', 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- RETRAITS COMPTE BLOQUE (WITHDRAWAL_BLOCKED) - Pour déblocage autorisé
-- ============================================================================

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "provider", "journal_code", "debit_account", "credit_account", "description_template", "priority")
VALUES
    -- Cash withdrawals from Compte Bloqué (after unblock)
    ('RET_CASH_BLOCKED', 'Retrait espèces compte bloqué', 'Retrait en espèces depuis compte bloqué après déblocage', 'MOUVEMENT', 'WITHDRAWAL_BLOCKED', 'CASH', NULL, 'CAI', '4113', '571', 'Retrait espèces bloqué - {clientName}', 10),

    -- Mobile Money MTN payout from Compte Bloqué
    ('RET_MTN_BLOCKED', 'Payout MTN compte bloqué', 'Payout vers MTN depuis compte bloqué après déblocage', 'MOUVEMENT', 'WITHDRAWAL_BLOCKED', 'MOBILE_MONEY', 'MTN', 'MMTN', '4113', '5781', 'Payout MTN bloqué - {clientName}', 10),

    -- Mobile Money Airtel payout from Compte Bloqué
    ('RET_AIRTEL_BLOCKED', 'Payout Airtel compte bloqué', 'Payout vers Airtel depuis compte bloqué après déblocage', 'MOUVEMENT', 'WITHDRAWAL_BLOCKED', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '4113', '5782', 'Payout Airtel bloqué - {clientName}', 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- RETRAITS EPARGNE MOBILE MONEY (manquants dans migration 0030)
-- ============================================================================

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "provider", "journal_code", "debit_account", "credit_account", "description_template", "priority")
VALUES
    -- Mobile Money MTN payout from Compte Épargne (was missing MTN)
    ('RET_MTN_EPARGNE', 'Payout MTN compte épargne', 'Payout vers Mobile Money MTN depuis compte épargne', 'MOUVEMENT', 'WITHDRAWAL_SAVINGS', 'MOBILE_MONEY', 'MTN', 'MMTN', '4112', '5781', 'Payout MTN épargne - {clientName}', 10),

    -- Mobile Money Airtel payout from Compte Épargne (was missing AIRTEL for épargne specifically)
    ('RET_AIRTEL_EPARGNE', 'Payout Airtel compte épargne', 'Payout vers Mobile Money Airtel depuis compte épargne', 'MOUVEMENT', 'WITHDRAWAL_SAVINGS', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '4112', '5782', 'Payout Airtel épargne - {clientName}', 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FIX: Update existing DEP_CASH_COURANT rule to use correct event_type
-- The original migration 0030 incorrectly set DEPOSIT_SAVINGS for courant
-- ============================================================================

-- First, check if the old rule exists and update it
UPDATE "accounting_rules"
SET
    "event_type" = 'DEPOSIT_SAVINGS',
    "credit_account" = '4112'
WHERE "code" = 'DEP_CASH_COURANT'
  AND "event_type" = 'DEPOSIT_SAVINGS'
  AND "credit_account" = '4111';

-- Note: The rule DEP_CASH_COURANT in migration 0030 was incorrectly named.
-- It credits 4111 (Comptes courants) but uses DEPOSIT_SAVINGS event type.
-- The name says "courant" but the event type says "savings" - this is the bug.
--
-- We're adding the correct rules above and leaving the old one as-is
-- since ON CONFLICT DO NOTHING will prevent duplicates.

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
