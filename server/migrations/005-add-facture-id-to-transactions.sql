-- Migration: Add factureId to transaction tables
-- Description: Links transactions to their generated invoices/receipts
-- Date: 2026-01-15

-- 1. Add factureId to transactions_compte
ALTER TABLE transactions_compte 
ADD COLUMN IF NOT EXISTS facture_id UUID REFERENCES factures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_compte_facture 
ON transactions_compte(facture_id);

COMMENT ON COLUMN transactions_compte.facture_id IS 'Reference to the generated invoice/receipt for this transaction';

-- 2. Add factureId to remboursements
ALTER TABLE remboursements 
ADD COLUMN IF NOT EXISTS facture_id UUID REFERENCES factures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_remboursements_facture 
ON remboursements(facture_id);

COMMENT ON COLUMN remboursements.facture_id IS 'Reference to the generated invoice/receipt for this repayment';

-- 3. Add factureId to contributions_tontine (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'contributions_tontine') THEN
    ALTER TABLE contributions_tontine 
    ADD COLUMN IF NOT EXISTS facture_id UUID REFERENCES factures(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_contributions_tontine_facture 
    ON contributions_tontine(facture_id);
    
    COMMENT ON COLUMN contributions_tontine.facture_id IS 'Reference to the generated invoice/receipt for this contribution';
  END IF;
END $$;

-- Verification queries
-- SELECT COUNT(*) as transactions_with_facture FROM transactions_compte WHERE facture_id IS NOT NULL;
-- SELECT COUNT(*) as remboursements_with_facture FROM remboursements WHERE facture_id IS NOT NULL;
