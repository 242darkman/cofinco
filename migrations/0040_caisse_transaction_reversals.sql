-- Migration: Add reversal tracking columns to financial tables
-- This enables transaction cancellation/reversal with full audit trail

-- 1. Add reversal columns to operations_caisse
ALTER TABLE "operations_caisse"
  ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid REFERENCES "operations_caisse"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text,
  ADD COLUMN IF NOT EXISTS "reversed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- 2. Add reversal columns to transactions_compte
ALTER TABLE "transactions_compte"
  ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid REFERENCES "transactions_compte"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text,
  ADD COLUMN IF NOT EXISTS "reversed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- 3. Add reversal columns to mouvements_financiers
ALTER TABLE "mouvements_financiers"
  ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid REFERENCES "mouvements_financiers"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text;

-- 4. Indexes for efficient reversal lookups
CREATE INDEX IF NOT EXISTS "idx_operations_caisse_reversal_of" ON "operations_caisse" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_transactions_compte_reversal_of" ON "transactions_compte" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_mouvements_reversal_of" ON "mouvements_financiers" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
