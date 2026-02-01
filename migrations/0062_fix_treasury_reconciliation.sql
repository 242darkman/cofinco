-- Migration: Fix Treasury Reconciliation - Missing GL Accounts and Accounting Rules
--
-- Problem: The treasury reconciliation shows a critical discrepancy (GL=0, Operational=100,620,000)
-- because:
--   1. GL account prefixes used by encaisse-service.ts don't match the seeded plan comptable
--   2. Accounting rules don't match the typePaiement values used in transfer-executor.ts
--
-- This migration fixes both issues.

-- ============================================================================
-- 1. ADD MISSING GL ACCOUNTS FOR TREASURY RECONCILIATION
-- ============================================================================
-- The encaisse-service.ts expects:
--   - 521xxx: Caisse Guichet (not 571/572)
--   - 531xxx: Coffre-Fort Central
--
-- These accounts were missing from the original OHADA seed in migration 0030.

INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system", "actif")
VALUES
    -- Classe 5: Caisse et Coffre-Fort (comptes de trésorerie centrale)
    ('52', 'Instruments financiers et trésorerie active', 5, 'Actif', 'Débit', 1, true, true),
    ('521', 'Caisse centrale', 5, 'Actif', 'Débit', 2, true, true),
    ('5211', 'Caisse centrale siège', 5, 'Actif', 'Débit', 3, true, true),
    ('5212', 'Caisse centrale agences', 5, 'Actif', 'Débit', 3, true, true),
    ('53', 'Coffres et valeurs', 5, 'Actif', 'Débit', 1, true, true),
    ('531', 'Coffre-fort central', 5, 'Actif', 'Débit', 2, true, true),
    ('5311', 'Coffre-fort siège', 5, 'Actif', 'Débit', 3, true, true),
    ('5312', 'Coffre-fort agences', 5, 'Actif', 'Débit', 3, true, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- ============================================================================
-- 2. ADD ACCOUNTING RULES FOR COFFRE <-> CAISSE TRANSFERS
-- ============================================================================
-- The transfer-executor.ts uses:
--   - typePaiement: "COFFRE_TO_CAISSE" (for Coffre → Caisse transfers)
--   - typePaiement: "CAISSE_TO_COFFRE" (for Caisse → Coffre transfers)
--
-- But the existing rules use TRANSFER_FROM_SAFE and TRANSFER_TO_SAFE.
-- We need rules matching the actual typePaiement values.

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "journal_code", "debit_account", "credit_account", "description_template", "priority", "active")
VALUES
    -- Coffre vers Caisse (approvisionnement caisse)
    -- Débit 521 (Caisse centrale) / Crédit 531 (Coffre-fort)
    ('TRF_COFFRE_TO_CAISSE', 'Transfert Coffre vers Caisse', 'Approvisionnement caisse depuis le coffre-fort',
     'MOUVEMENT', 'COFFRE_TO_CAISSE', NULL, 'VRT', '521', '531',
     'Approvisionnement caisse depuis coffre', 10, true),

    -- Caisse vers Coffre (versement au coffre)
    -- Débit 531 (Coffre-fort) / Crédit 521 (Caisse centrale)
    ('TRF_CAISSE_TO_COFFRE', 'Transfert Caisse vers Coffre', 'Versement caisse vers le coffre-fort',
     'MOUVEMENT', 'CAISSE_TO_COFFRE', NULL, 'VRT', '531', '521',
     'Versement au coffre depuis caisse', 10, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. ADD ACCOUNTING RULES FOR CAISSE AGENT OPERATIONS
-- ============================================================================
-- The approval-service.ts creates mouvements with sourceModule: "CAISSE_AGENT"
-- but uses various typePaiement values. We need rules for caisse agent operations.

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "journal_code", "debit_account", "credit_account", "description_template", "priority", "active")
VALUES
    -- Encaissement agent terrain (l'agent collecte de l'argent client)
    -- Débit 573 (Caisse agent) / Crédit 419 ou 4111 selon le type
    ('AGENT_COLLECT_CASH', 'Collecte espèces agent terrain', 'Encaissement par agent terrain',
     'MOUVEMENT', 'COLLECT_CASH', 'CASH', 'CAI', '573', '4191',
     'Collecte agent terrain', 10, true),

    -- Remise agent (l'agent verse sa collecte à la caisse agence)
    -- Débit 521 (Caisse centrale) / Crédit 573 (Caisse agent)
    ('AGENT_SETTLEMENT_CASH', 'Remise espèces agent terrain', 'Remise de collecte par agent terrain vers caisse agence',
     'MOUVEMENT', 'SETTLEMENT_CASH', 'CASH', 'CAI', '521', '573',
     'Remise agent terrain vers caisse', 10, true),

    -- Remboursement crédit via agent terrain
    ('AGENT_CREDIT_REPAYMENT', 'Remboursement crédit via agent', 'Remboursement crédit collecté par agent terrain',
     'MOUVEMENT', 'CREDIT_REPAYMENT', 'CASH', 'CRD', '573', '2711',
     'Remboursement crédit via agent - {clientName}', 15, true),

    -- Dépôt épargne via agent terrain
    ('AGENT_DEPOSIT_SAVINGS', 'Dépôt épargne via agent', 'Dépôt sur compte épargne collecté par agent terrain',
     'MOUVEMENT', 'DEPOSIT_SAVINGS', 'CASH', 'CAI', '573', '4112',
     'Dépôt épargne via agent - {clientName}', 15, true),

    -- Cotisation tontine via agent terrain
    ('AGENT_TONTINE_CONTRIBUTION', 'Cotisation tontine via agent', 'Cotisation tontine collectée par agent terrain',
     'MOUVEMENT', 'TONTINE_CONTRIBUTION', 'CASH', 'TON', '573', '4191',
     'Cotisation tontine via agent - {clientName}', 15, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. ADD ACCOUNTING RULES FOR SESSION OPENING/CLOSING OPERATIONS
-- ============================================================================
-- The session-opening-service.ts creates mouvements for restitution

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "journal_code", "debit_account", "credit_account", "description_template", "priority", "active")
VALUES
    -- Restitution coffre (annulation d'ouverture)
    ('TRF_RESTITUTION_COFFRE', 'Restitution au coffre', 'Restitution des fonds au coffre après annulation',
     'MOUVEMENT', 'RESTITUTION', NULL, 'VRT', '531', '521',
     'Restitution fonds au coffre', 10, true),

    -- Approvisionnement coffre externe (depuis banque, capital, etc.)
    ('EXT_COFFRE_SUPPLY_BANK', 'Approvisionnement coffre depuis banque', 'Approvisionnement externe du coffre depuis compte bancaire',
     'MOUVEMENT', 'SAFE_SUPPLY', 'TRANSFER', 'BNK', '531', '512',
     'Approvisionnement coffre depuis banque', 10, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. UPDATE EXISTING RULES TO USE CORRECT ACCOUNT NUMBERS
-- ============================================================================
-- The existing rules in 0030 use 571/572 for caisse, but encaisse-service expects 521.
-- We update the rules to use 521 instead.

-- Update TRANSFER_FROM_SAFE rule
UPDATE "accounting_rules"
SET "debit_account" = '521', "credit_account" = '531'
WHERE "code" = 'TRANSFERT_COFFRE_CAISSE' AND "active" = true;

-- Update TRANSFER_TO_SAFE rule
UPDATE "accounting_rules"
SET "debit_account" = '531', "credit_account" = '521'
WHERE "code" = 'TRANSFERT_CAISSE_COFFRE' AND "active" = true;

-- Update deposit/withdrawal rules to use 521 instead of 571
UPDATE "accounting_rules"
SET "debit_account" = '521'
WHERE "debit_account" = '571' AND "active" = true;

UPDATE "accounting_rules"
SET "credit_account" = '521'
WHERE "credit_account" = '571' AND "active" = true;

-- ============================================================================
-- 6. ADD MAPPING VIEW FOR DEBUGGING RECONCILIATION ISSUES
-- ============================================================================

CREATE OR REPLACE VIEW "v_mouvements_gl_status" AS
SELECT
    mf.id,
    mf.reference,
    mf.montant,
    mf.sens,
    mf.source_module,
    mf.type_paiement,
    mf.methode_paiement,
    mf.gl_posting_status,
    mf.gl_posting_error,
    mf.created_at,
    ar.code AS rule_code,
    ar.name AS rule_name,
    ar.debit_account,
    ar.credit_account,
    CASE
        WHEN mf.gl_posting_status = 'POSTED' THEN 'OK'
        WHEN mf.gl_posting_status = 'PENDING' THEN 'En attente'
        WHEN mf.gl_posting_status = 'SKIPPED' THEN 'Règle manquante'
        WHEN mf.gl_posting_status = 'FAILED' THEN 'Erreur'
        ELSE 'Inconnu'
    END AS status_label
FROM mouvements_financiers mf
LEFT JOIN accounting_rules ar ON (
    ar.source_type = 'MOUVEMENT'
    AND ar.event_type = mf.type_paiement
    AND ar.active = true
    AND (ar.payment_method IS NULL OR ar.payment_method = mf.methode_paiement)
)
WHERE mf.requires_gl_posting = true
ORDER BY mf.created_at DESC;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- After running this migration:
-- 1. The GL accounts 521 (Caisse centrale) and 531 (Coffre-fort) will exist
-- 2. Accounting rules will match the typePaiement values used in the code
-- 3. New mouvements will be properly posted to the GL
-- 4. To fix existing mouvements, run: UPDATE mouvements_financiers SET gl_posting_status = 'PENDING' WHERE gl_posting_status = 'SKIPPED';
--    Then trigger a re-processing of pending GL postings
