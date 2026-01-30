-- Migration: Add SAFE_SUPPLY accounting rule for external vault provisioning
-- This rule handles external funding of the coffre-fort (from bank, capital, etc.)

INSERT INTO accounting_rules (
    code, name, description, source_type, event_type, journal_code,
    debit_account, credit_account, description_template, priority, active
)
SELECT
    'SAFE_SUPPLY',
    'Approvisionnement Externe Coffre',
    'Approvisionnement coffre depuis source externe (Banque, Capital)',
    'MOUVEMENT', 'SAFE_SUPPLY', 'OD',
    '531',  -- Coffre-fort (receives funds)
    '512',  -- Banque (source of funds)
    'Approvisionnement externe coffre-fort',
    100, true
WHERE NOT EXISTS (SELECT 1 FROM accounting_rules WHERE code = 'SAFE_SUPPLY');
