-- Migration: Add sens column to transactions_compte
-- Purpose: Store transaction direction directly to avoid complex LEFT JOINs
-- and ensure correct CREDIT/DEBIT classification for transfers

-- Step 1: Add the sens column (nullable initially for backfill)
ALTER TABLE "transactions_compte"
ADD COLUMN "sens" sens_mouvement_enum;

-- Step 2: Backfill existing records by deriving sens from typePaiement
-- CREDIT types (money coming in)
UPDATE "transactions_compte"
SET "sens" = 'CREDIT'
WHERE "type_paiement" IN (
  'TRANSFER_IN',
  'DEPOSIT_SAVINGS',
  'DEPOSIT_CURRENT',
  'DEPOSIT_BLOCKED',
  'INITIAL_DEPOSIT',
  'SAVINGS_DEPOSIT',
  'INTEREST_PAYMENT',
  'CREDIT_DISBURSEMENT',
  'TONTINE_WITHDRAWAL',
  'TONTINE_DISTRIBUTION',
  'MOBILE_MONEY_DEPOSIT',
  'ENTREE_COFFRE_RECEPTION',
  'SAFE_SUPPLY',
  'RESTITUTION_CAISSE',
  'MISC_COLLECTION'
);

-- DEBIT types (money going out)
UPDATE "transactions_compte"
SET "sens" = 'DEBIT'
WHERE "sens" IS NULL; -- Everything else defaults to DEBIT

-- Step 3: Make the column NOT NULL now that all records are backfilled
ALTER TABLE "transactions_compte"
ALTER COLUMN "sens" SET NOT NULL;

-- Step 4: Add a default for new inserts (will be overwritten by application logic)
ALTER TABLE "transactions_compte"
ALTER COLUMN "sens" SET DEFAULT 'DEBIT';

-- Step 5: Create index for common queries filtering by sens
CREATE INDEX "idx_transactions_compte_sens" ON "transactions_compte" ("sens");

-- Step 6: Add composite index for account history queries
CREATE INDEX "idx_transactions_compte_compte_sens_date" ON "transactions_compte" ("compte_id", "sens", "created_at" DESC);

COMMENT ON COLUMN "transactions_compte"."sens" IS 'Direction of the transaction: CREDIT (money in) or DEBIT (money out). Derived from typePaiement at creation time.';
