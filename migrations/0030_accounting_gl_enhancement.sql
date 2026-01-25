-- Migration: Accounting GL Enhancement for SYSCOHADA Compliance
-- This migration adds multi-tenant support, posting links, period management,
-- and reversal tracking to the accounting module.

-- ============================================================================
-- 1. ADD MULTI-TENANT SUPPORT (agence_id) TO ACCOUNTING TABLES
-- ============================================================================

-- Add agence_id to plan_comptable (chart of accounts can be per-agency or shared)
ALTER TABLE "plan_comptable" ADD COLUMN IF NOT EXISTS "agence_id" uuid REFERENCES "agences"("id");
ALTER TABLE "plan_comptable" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false;

-- Add agence_id to journaux_comptables
ALTER TABLE "journaux_comptables" ADD COLUMN IF NOT EXISTS "agence_id" uuid REFERENCES "agences"("id");

-- Add agence_id to ecritures_comptables
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "agence_id" uuid REFERENCES "agences"("id");

-- Add agence_id to exercices_comptables
ALTER TABLE "exercices_comptables" ADD COLUMN IF NOT EXISTS "agence_id" uuid REFERENCES "agences"("id");

-- ============================================================================
-- 2. ENHANCE ECRITURES_COMPTABLES FOR SOURCE TRACKING AND REVERSALS
-- ============================================================================

-- Add source tracking (link to business transaction)
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "source_type" text;
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "source_id" uuid;
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "mouvement_id" uuid REFERENCES "mouvements_financiers"("id");

-- Add reversal tracking
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid REFERENCES "ecritures_comptables"("id");
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "reversed_by_id" uuid REFERENCES "ecritures_comptables"("id");
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "reversal_reason" text;

-- Add metadata for additional context (clientId, loanId, etc.)
ALTER TABLE "ecritures_comptables" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}';

-- Update statut to be more explicit (DRAFT, POSTED, REVERSED)
-- First, update existing values to new format
UPDATE "ecritures_comptables" SET statut = 'DRAFT' WHERE statut IN ('Brouillon', 'brouillon');
UPDATE "ecritures_comptables" SET statut = 'POSTED' WHERE statut IN ('Validé', 'validé', 'Validated', 'VALIDATED');

-- ============================================================================
-- 3. CREATE GL_POSTING_LINKS TABLE (Idempotency for Accounting Postings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "gl_posting_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "agence_id" uuid NOT NULL REFERENCES "agences"("id"),
    "source_type" text NOT NULL,
    "source_id" uuid NOT NULL,
    "ecriture_id" uuid NOT NULL REFERENCES "ecritures_comptables"("id") ON DELETE CASCADE,
    "created_at" timestamp DEFAULT now() NOT NULL,

    -- Unique constraint: one source can only post one GL entry per agency
    CONSTRAINT "uq_gl_posting_source" UNIQUE ("agence_id", "source_type", "source_id")
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS "idx_gl_posting_links_source" ON "gl_posting_links" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "idx_gl_posting_links_ecriture" ON "gl_posting_links" ("ecriture_id");

-- ============================================================================
-- 4. CREATE GL_PERIODS TABLE (Monthly Period Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "gl_periods" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "agence_id" uuid NOT NULL REFERENCES "agences"("id"),
    "exercice_id" uuid NOT NULL REFERENCES "exercices_comptables"("id"),
    "year" integer NOT NULL,
    "month" integer NOT NULL CHECK (month >= 1 AND month <= 12),
    "name" text NOT NULL, -- e.g., "Janvier 2025"
    "date_debut" date NOT NULL,
    "date_fin" date NOT NULL,
    "statut" text NOT NULL DEFAULT 'OPEN' CHECK (statut IN ('OPEN', 'CLOSING', 'CLOSED', 'LOCKED')),
    "closed_at" timestamp,
    "closed_by" uuid REFERENCES "users"("id"),
    "closure_notes" text,
    "total_debits" numeric DEFAULT '0',
    "total_credits" numeric DEFAULT '0',
    "entry_count" integer DEFAULT 0,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now(),

    -- One period per month per agency
    CONSTRAINT "uq_gl_periods_month" UNIQUE ("agence_id", "year", "month")
);

-- Indexes for period lookups
CREATE INDEX IF NOT EXISTS "idx_gl_periods_agency_year" ON "gl_periods" ("agence_id", "year");
CREATE INDEX IF NOT EXISTS "idx_gl_periods_date" ON "gl_periods" ("date_debut", "date_fin");
CREATE INDEX IF NOT EXISTS "idx_gl_periods_statut" ON "gl_periods" ("statut");

-- ============================================================================
-- 5. CREATE ACCOUNTING_RULES TABLE (Mapping Business Events to GL Accounts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "accounting_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "agence_id" uuid REFERENCES "agences"("id"), -- NULL = global rule
    "code" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "source_type" text NOT NULL, -- MOUVEMENT, PAYMENT_INTENT, OPERATION_TERRAIN, etc.
    "event_type" text NOT NULL, -- DEPOSIT_SAVINGS, WITHDRAWAL_SAVINGS, CREDIT_REPAYMENT, etc.
    "payment_method" text, -- CASH, MOBILE_MONEY, TRANSFER (NULL = any)
    "provider" text, -- MTN, AIRTEL (NULL = any)
    "journal_code" text NOT NULL, -- CAI, MMTN, MAIR, BNK, etc.
    "debit_account" text NOT NULL, -- OHADA account number
    "credit_account" text NOT NULL, -- OHADA account number
    "description_template" text, -- Template for entry description
    "priority" integer DEFAULT 100, -- Lower = higher priority (for rule matching)
    "active" boolean DEFAULT true,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now(),

    CONSTRAINT "uq_accounting_rules_code" UNIQUE ("agence_id", "code")
);

-- Index for rule matching
CREATE INDEX IF NOT EXISTS "idx_accounting_rules_matching"
    ON "accounting_rules" ("source_type", "event_type", "payment_method", "provider", "active");

-- ============================================================================
-- 6. ADD INDEXES TO EXISTING TABLES
-- ============================================================================

-- Indexes on ecritures_comptables
CREATE INDEX IF NOT EXISTS "idx_ecritures_agence" ON "ecritures_comptables" ("agence_id");
CREATE INDEX IF NOT EXISTS "idx_ecritures_source" ON "ecritures_comptables" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "idx_ecritures_date_journal" ON "ecritures_comptables" ("date_ecriture", "journal_id");
CREATE INDEX IF NOT EXISTS "idx_ecritures_mouvement" ON "ecritures_comptables" ("mouvement_id");
CREATE INDEX IF NOT EXISTS "idx_ecritures_statut" ON "ecritures_comptables" ("statut");

-- Indexes on lignes_ecritures for Grand Livre queries
CREATE INDEX IF NOT EXISTS "idx_lignes_compte_date" ON "lignes_ecritures" ("compte_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_lignes_numero_compte" ON "lignes_ecritures" ("numero_compte");

-- Indexes on plan_comptable
CREATE INDEX IF NOT EXISTS "idx_plan_comptable_agence" ON "plan_comptable" ("agence_id");
CREATE INDEX IF NOT EXISTS "idx_plan_comptable_classe" ON "plan_comptable" ("classe");
CREATE INDEX IF NOT EXISTS "idx_plan_comptable_numero" ON "plan_comptable" ("numero_compte");

-- Indexes on journaux_comptables
CREATE INDEX IF NOT EXISTS "idx_journaux_agence" ON "journaux_comptables" ("agence_id");

-- ============================================================================
-- 7. CREATE SEQUENCE TABLE FOR PIECE NUMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "gl_sequences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "agence_id" uuid NOT NULL REFERENCES "agences"("id"),
    "journal_code" text NOT NULL,
    "year" integer NOT NULL,
    "last_number" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp DEFAULT now(),

    CONSTRAINT "uq_gl_sequences" UNIQUE ("agence_id", "journal_code", "year")
);

-- ============================================================================
-- 8. CREATE VIEW FOR GRAND LIVRE (General Ledger)
-- ============================================================================

CREATE OR REPLACE VIEW "v_grand_livre" AS
SELECT
    le.id,
    le.ecriture_id,
    le.compte_id,
    le.numero_compte,
    pc.intitule AS compte_intitule,
    pc.classe,
    pc.type_compte,
    le.libelle AS ligne_libelle,
    le.debit,
    le.credit,
    le.ref_externe,
    ec.agence_id,
    ec.date_ecriture,
    ec.numero_piece,
    ec.libelle AS ecriture_libelle,
    ec.journal_id,
    jc.code AS journal_code,
    jc.intitule AS journal_intitule,
    ec.statut,
    ec.source_type,
    ec.source_id,
    ec.mouvement_id,
    ec.metadata,
    ec.created_at,
    ec.created_by
FROM "lignes_ecritures" le
JOIN "ecritures_comptables" ec ON le.ecriture_id = ec.id
JOIN "plan_comptable" pc ON le.compte_id = pc.id
JOIN "journaux_comptables" jc ON ec.journal_id = jc.id
WHERE ec.statut = 'POSTED';

-- ============================================================================
-- 9. CREATE VIEW FOR BALANCE (Trial Balance)
-- ============================================================================

CREATE OR REPLACE VIEW "v_balance_generale" AS
SELECT
    pc.id AS compte_id,
    pc.numero_compte,
    pc.intitule,
    pc.classe,
    pc.type_compte,
    pc.sens_normal,
    ec.agence_id,
    COALESCE(SUM(le.debit), 0) AS total_debit,
    COALESCE(SUM(le.credit), 0) AS total_credit,
    CASE
        WHEN COALESCE(SUM(le.debit), 0) > COALESCE(SUM(le.credit), 0)
        THEN COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
        ELSE 0
    END AS solde_debiteur,
    CASE
        WHEN COALESCE(SUM(le.credit), 0) > COALESCE(SUM(le.debit), 0)
        THEN COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)
        ELSE 0
    END AS solde_crediteur
FROM "plan_comptable" pc
LEFT JOIN "lignes_ecritures" le ON pc.id = le.compte_id
LEFT JOIN "ecritures_comptables" ec ON le.ecriture_id = ec.id AND ec.statut = 'POSTED'
GROUP BY pc.id, pc.numero_compte, pc.intitule, pc.classe, pc.type_compte, pc.sens_normal, ec.agence_id;

-- ============================================================================
-- 10. SEED DEFAULT JOURNALS FOR MICROFINANCE
-- ============================================================================

INSERT INTO "journaux_comptables" ("code", "intitule", "type_journal", "actif")
VALUES
    ('CAI', 'Caisse Espèces', 'Trésorerie', true),
    ('MMTN', 'Mobile Money MTN', 'Trésorerie', true),
    ('MAIR', 'Mobile Money Airtel', 'Trésorerie', true),
    ('BNK', 'Banque', 'Trésorerie', true),
    ('VRT', 'Virements Internes', 'Général', true),
    ('OD', 'Opérations Diverses', 'Général', true),
    ('CRD', 'Crédits', 'Général', true),
    ('TON', 'Tontines', 'Général', true),
    ('AN', 'À Nouveau', 'Général', true)
ON CONFLICT (code) DO UPDATE SET intitule = EXCLUDED.intitule;

-- ============================================================================
-- 11. SEED DEFAULT OHADA ACCOUNTS FOR MICROFINANCE
-- ============================================================================

-- Class 1: Capitaux propres
INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system")
VALUES
    ('10', 'Capital', 1, 'Capitaux', 'Crédit', 1, true),
    ('101', 'Capital social', 1, 'Capitaux', 'Crédit', 2, true),
    ('11', 'Réserves', 1, 'Capitaux', 'Crédit', 1, true),
    ('12', 'Report à nouveau', 1, 'Capitaux', 'Crédit', 1, true),
    ('13', 'Résultat net de l''exercice', 1, 'Capitaux', 'Crédit', 1, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- Class 2: Immobilisations
INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system")
VALUES
    ('20', 'Immobilisations incorporelles', 2, 'Actif', 'Débit', 1, true),
    ('21', 'Immobilisations corporelles', 2, 'Actif', 'Débit', 1, true),
    ('27', 'Autres immobilisations financières', 2, 'Actif', 'Débit', 1, true),
    ('271', 'Prêts et créances à la clientèle', 2, 'Actif', 'Débit', 2, true),
    ('2711', 'Prêts - Principal', 2, 'Actif', 'Débit', 3, true),
    ('2712', 'Prêts - Intérêts courus', 2, 'Actif', 'Débit', 3, true),
    ('2713', 'Prêts - Pénalités à recevoir', 2, 'Actif', 'Débit', 3, true),
    ('279', 'Provisions pour dépréciation des prêts', 2, 'Actif', 'Crédit', 2, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- Class 4: Tiers (Clients, Fournisseurs)
INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system")
VALUES
    ('40', 'Fournisseurs et comptes rattachés', 4, 'Passif', 'Crédit', 1, true),
    ('41', 'Clients et comptes rattachés', 4, 'Passif', 'Crédit', 1, true),
    ('411', 'Dépôts de la clientèle', 4, 'Passif', 'Crédit', 2, true),
    ('4111', 'Dépôts clients - Comptes courants', 4, 'Passif', 'Crédit', 3, true),
    ('4112', 'Dépôts clients - Comptes épargne', 4, 'Passif', 'Crédit', 3, true),
    ('4113', 'Dépôts clients - Comptes bloqués', 4, 'Passif', 'Crédit', 3, true),
    ('419', 'Fonds de tontine (passif)', 4, 'Passif', 'Crédit', 2, true),
    ('4191', 'Fonds tontine - Cotisations', 4, 'Passif', 'Crédit', 3, true),
    ('4192', 'Fonds tontine - Pénalités', 4, 'Passif', 'Crédit', 3, true),
    ('42', 'Personnel', 4, 'Passif', 'Crédit', 1, true),
    ('43', 'Organismes sociaux', 4, 'Passif', 'Crédit', 1, true),
    ('44', 'État et collectivités', 4, 'Passif', 'Crédit', 1, true),
    ('4431', 'TVA collectée', 4, 'Passif', 'Crédit', 3, true),
    ('4432', 'TVA déductible', 4, 'Actif', 'Débit', 3, true),
    ('47', 'Comptes transitoires ou d''attente', 4, 'Passif', 'Crédit', 1, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- Class 5: Trésorerie
INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system")
VALUES
    ('50', 'Valeurs mobilières de placement', 5, 'Actif', 'Débit', 1, true),
    ('51', 'Banques, établissements financiers', 5, 'Actif', 'Débit', 1, true),
    ('512', 'Banques comptes courants', 5, 'Actif', 'Débit', 2, true),
    ('52', 'Instruments de trésorerie', 5, 'Actif', 'Débit', 1, true),
    ('57', 'Caisse', 5, 'Actif', 'Débit', 1, true),
    ('571', 'Caisse siège', 5, 'Actif', 'Débit', 2, true),
    ('572', 'Caisse agences', 5, 'Actif', 'Débit', 2, true),
    ('573', 'Caisse agents terrain', 5, 'Actif', 'Débit', 2, true),
    ('578', 'Autres valeurs à encaisser', 5, 'Actif', 'Débit', 2, true),
    ('5781', 'Mobile Money MTN', 5, 'Actif', 'Débit', 3, true),
    ('5782', 'Mobile Money Airtel', 5, 'Actif', 'Débit', 3, true),
    ('5783', 'Mobile Money Orange', 5, 'Actif', 'Débit', 3, true),
    ('58', 'Virements internes', 5, 'Actif', 'Débit', 1, true),
    ('59', 'Provisions pour dépréciation trésorerie', 5, 'Actif', 'Crédit', 1, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- Class 6: Charges
INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system")
VALUES
    ('60', 'Achats', 6, 'Charge', 'Débit', 1, true),
    ('61', 'Services extérieurs', 6, 'Charge', 'Débit', 1, true),
    ('62', 'Autres services extérieurs', 6, 'Charge', 'Débit', 1, true),
    ('627', 'Services bancaires et assimilés', 6, 'Charge', 'Débit', 2, true),
    ('6271', 'Frais sur opérations bancaires', 6, 'Charge', 'Débit', 3, true),
    ('6272', 'Commissions Mobile Money', 6, 'Charge', 'Débit', 3, true),
    ('6273', 'Commissions transferts', 6, 'Charge', 'Débit', 3, true),
    ('63', 'Impôts et taxes', 6, 'Charge', 'Débit', 1, true),
    ('64', 'Charges de personnel', 6, 'Charge', 'Débit', 1, true),
    ('65', 'Autres charges de gestion courante', 6, 'Charge', 'Débit', 1, true),
    ('66', 'Charges financières', 6, 'Charge', 'Débit', 1, true),
    ('67', 'Charges exceptionnelles', 6, 'Charge', 'Débit', 1, true),
    ('68', 'Dotations aux amortissements et provisions', 6, 'Charge', 'Débit', 1, true),
    ('681', 'Dotations aux provisions pour dépréciation prêts', 6, 'Charge', 'Débit', 2, true),
    ('69', 'Impôts sur les bénéfices', 6, 'Charge', 'Débit', 1, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- Class 7: Produits
INSERT INTO "plan_comptable" ("numero_compte", "intitule", "classe", "type_compte", "sens_normal", "niveau", "is_system")
VALUES
    ('70', 'Ventes', 7, 'Produit', 'Crédit', 1, true),
    ('706', 'Prestations de services', 7, 'Produit', 'Crédit', 2, true),
    ('707', 'Produits accessoires', 7, 'Produit', 'Crédit', 2, true),
    ('7071', 'Intérêts sur prêts', 7, 'Produit', 'Crédit', 3, true),
    ('7072', 'Frais de dossier', 7, 'Produit', 'Crédit', 3, true),
    ('7073', 'Pénalités de retard', 7, 'Produit', 'Crédit', 3, true),
    ('7074', 'Commissions tontine', 7, 'Produit', 'Crédit', 3, true),
    ('7075', 'Frais de tenue de compte', 7, 'Produit', 'Crédit', 3, true),
    ('7076', 'Frais de transfert', 7, 'Produit', 'Crédit', 3, true),
    ('71', 'Production stockée', 7, 'Produit', 'Crédit', 1, true),
    ('75', 'Autres produits de gestion courante', 7, 'Produit', 'Crédit', 1, true),
    ('76', 'Produits financiers', 7, 'Produit', 'Crédit', 1, true),
    ('77', 'Produits exceptionnels', 7, 'Produit', 'Crédit', 1, true),
    ('78', 'Reprises sur amortissements et provisions', 7, 'Produit', 'Crédit', 1, true),
    ('781', 'Reprises sur provisions pour dépréciation prêts', 7, 'Produit', 'Crédit', 2, true)
ON CONFLICT (numero_compte) DO NOTHING;

-- ============================================================================
-- 12. SEED DEFAULT ACCOUNTING RULES FOR MICROFINANCE
-- ============================================================================

INSERT INTO "accounting_rules" ("code", "name", "description", "source_type", "event_type", "payment_method", "provider", "journal_code", "debit_account", "credit_account", "description_template", "priority")
VALUES
    -- === DEPOTS ===
    ('DEP_CASH_COURANT', 'Dépôt espèces compte courant', 'Dépôt en espèces sur compte courant client', 'MOUVEMENT', 'DEPOSIT_SAVINGS', 'CASH', NULL, 'CAI', '571', '4111', 'Dépôt espèces - {clientName}', 10),
    ('DEP_CASH_EPARGNE', 'Dépôt espèces compte épargne', 'Dépôt en espèces sur compte épargne client', 'MOUVEMENT', 'DEPOSIT_SAVINGS', 'CASH', NULL, 'CAI', '571', '4112', 'Dépôt espèces épargne - {clientName}', 10),
    ('DEP_MTN_COURANT', 'Dépôt MTN compte courant', 'Dépôt Mobile Money MTN sur compte courant', 'MOUVEMENT', 'DEPOSIT_SAVINGS', 'MOBILE_MONEY', 'MTN', 'MMTN', '5781', '4111', 'Dépôt MTN MoMo - {clientName}', 10),
    ('DEP_MTN_EPARGNE', 'Dépôt MTN compte épargne', 'Dépôt Mobile Money MTN sur compte épargne', 'MOUVEMENT', 'DEPOSIT_SAVINGS', 'MOBILE_MONEY', 'MTN', 'MMTN', '5781', '4112', 'Dépôt MTN MoMo épargne - {clientName}', 10),
    ('DEP_AIRTEL_COURANT', 'Dépôt Airtel compte courant', 'Dépôt Mobile Money Airtel sur compte courant', 'MOUVEMENT', 'DEPOSIT_SAVINGS', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '5782', '4111', 'Dépôt Airtel Money - {clientName}', 10),
    ('DEP_AIRTEL_EPARGNE', 'Dépôt Airtel compte épargne', 'Dépôt Mobile Money Airtel sur compte épargne', 'MOUVEMENT', 'DEPOSIT_SAVINGS', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '5782', '4112', 'Dépôt Airtel Money épargne - {clientName}', 10),

    -- === RETRAITS ===
    ('RET_CASH_COURANT', 'Retrait espèces compte courant', 'Retrait en espèces depuis compte courant', 'MOUVEMENT', 'WITHDRAWAL_SAVINGS', 'CASH', NULL, 'CAI', '4111', '571', 'Retrait espèces - {clientName}', 10),
    ('RET_CASH_EPARGNE', 'Retrait espèces compte épargne', 'Retrait en espèces depuis compte épargne', 'MOUVEMENT', 'WITHDRAWAL_SAVINGS', 'CASH', NULL, 'CAI', '4112', '571', 'Retrait espèces épargne - {clientName}', 10),
    ('RET_MTN', 'Payout MTN', 'Payout vers Mobile Money MTN', 'MOUVEMENT', 'WITHDRAWAL_SAVINGS', 'MOBILE_MONEY', 'MTN', 'MMTN', '4111', '5781', 'Payout MTN MoMo - {clientName}', 10),
    ('RET_AIRTEL', 'Payout Airtel', 'Payout vers Mobile Money Airtel', 'MOUVEMENT', 'WITHDRAWAL_SAVINGS', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '4111', '5782', 'Payout Airtel Money - {clientName}', 10),

    -- === CREDITS ===
    ('CREDIT_DECAISS_CASH', 'Décaissement crédit espèces', 'Décaissement d''un crédit en espèces', 'MOUVEMENT', 'CREDIT_DISBURSEMENT', 'CASH', NULL, 'CRD', '2711', '571', 'Décaissement crédit #{creditNumber} - {clientName}', 10),
    ('CREDIT_DECAISS_MTN', 'Décaissement crédit MTN', 'Décaissement d''un crédit vers MTN', 'MOUVEMENT', 'CREDIT_DISBURSEMENT', 'MOBILE_MONEY', 'MTN', 'CRD', '2711', '5781', 'Décaissement crédit #{creditNumber} MTN - {clientName}', 10),
    ('CREDIT_DECAISS_AIRTEL', 'Décaissement crédit Airtel', 'Décaissement d''un crédit vers Airtel', 'MOUVEMENT', 'CREDIT_DISBURSEMENT', 'MOBILE_MONEY', 'AIRTEL', 'CRD', '2711', '5782', 'Décaissement crédit #{creditNumber} Airtel - {clientName}', 10),
    ('CREDIT_DECAISS_COMPTE', 'Décaissement crédit vers compte', 'Décaissement d''un crédit vers compte client', 'MOUVEMENT', 'CREDIT_DISBURSEMENT', 'TRANSFER', NULL, 'CRD', '2711', '4111', 'Décaissement crédit #{creditNumber} vers compte - {clientName}', 10),

    -- === REMBOURSEMENTS CREDIT ===
    ('REMBOURS_CASH_PRINCIPAL', 'Remboursement crédit principal espèces', 'Remboursement du principal en espèces', 'MOUVEMENT', 'CREDIT_REPAYMENT', 'CASH', NULL, 'CAI', '571', '2711', 'Remboursement principal crédit #{creditNumber} - {clientName}', 20),
    ('REMBOURS_CASH_INTERET', 'Remboursement intérêts espèces', 'Remboursement des intérêts en espèces', 'MOUVEMENT', 'CREDIT_REPAYMENT_INTEREST', 'CASH', NULL, 'CAI', '571', '7071', 'Remboursement intérêts crédit #{creditNumber} - {clientName}', 20),
    ('REMBOURS_CASH_PENALITE', 'Remboursement pénalités espèces', 'Remboursement des pénalités en espèces', 'MOUVEMENT', 'CREDIT_REPAYMENT_PENALTY', 'CASH', NULL, 'CAI', '571', '7073', 'Remboursement pénalités crédit #{creditNumber} - {clientName}', 20),
    ('REMBOURS_MTN_PRINCIPAL', 'Remboursement crédit principal MTN', 'Remboursement du principal via MTN', 'MOUVEMENT', 'CREDIT_REPAYMENT', 'MOBILE_MONEY', 'MTN', 'MMTN', '5781', '2711', 'Remboursement principal crédit #{creditNumber} MTN - {clientName}', 20),
    ('REMBOURS_AIRTEL_PRINCIPAL', 'Remboursement crédit principal Airtel', 'Remboursement du principal via Airtel', 'MOUVEMENT', 'CREDIT_REPAYMENT', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '5782', '2711', 'Remboursement principal crédit #{creditNumber} Airtel - {clientName}', 20),

    -- === TONTINES ===
    ('TONTINE_COTIS_CASH', 'Cotisation tontine espèces', 'Cotisation tontine en espèces', 'MOUVEMENT', 'TONTINE_CONTRIBUTION', 'CASH', NULL, 'TON', '571', '4191', 'Cotisation tontine {tontineName} - {clientName}', 10),
    ('TONTINE_COTIS_MTN', 'Cotisation tontine MTN', 'Cotisation tontine via MTN', 'MOUVEMENT', 'TONTINE_CONTRIBUTION', 'MOBILE_MONEY', 'MTN', 'TON', '5781', '4191', 'Cotisation tontine {tontineName} MTN - {clientName}', 10),
    ('TONTINE_COTIS_AIRTEL', 'Cotisation tontine Airtel', 'Cotisation tontine via Airtel', 'MOUVEMENT', 'TONTINE_CONTRIBUTION', 'MOBILE_MONEY', 'AIRTEL', 'TON', '5782', '4191', 'Cotisation tontine {tontineName} Airtel - {clientName}', 10),
    ('TONTINE_DISTRIB_CASH', 'Distribution tontine espèces', 'Distribution gain tontine en espèces', 'MOUVEMENT', 'TONTINE_DISTRIBUTION', 'CASH', NULL, 'TON', '4191', '571', 'Distribution tontine {tontineName} - {clientName}', 10),
    ('TONTINE_DISTRIB_MTN', 'Distribution tontine MTN', 'Distribution gain tontine via MTN', 'MOUVEMENT', 'TONTINE_DISTRIBUTION', 'MOBILE_MONEY', 'MTN', 'TON', '4191', '5781', 'Distribution tontine {tontineName} MTN - {clientName}', 10),
    ('TONTINE_DISTRIB_AIRTEL', 'Distribution tontine Airtel', 'Distribution gain tontine via Airtel', 'MOUVEMENT', 'TONTINE_DISTRIBUTION', 'MOBILE_MONEY', 'AIRTEL', 'TON', '4191', '5782', 'Distribution tontine {tontineName} Airtel - {clientName}', 10),
    ('TONTINE_PENALITE', 'Pénalité tontine', 'Pénalité de retard tontine', 'MOUVEMENT', 'TONTINE_PENALTY', NULL, NULL, 'TON', '571', '4192', 'Pénalité tontine {tontineName} - {clientName}', 10),

    -- === TRANSFERTS INTERNES ===
    ('TRANSFERT_INTER_CAISSE', 'Transfert inter-caisses', 'Transfert entre caisses', 'MOUVEMENT', 'TRANSFER_INTERNAL', NULL, NULL, 'VRT', '58', '58', 'Transfert inter-caisses', 10),
    ('TRANSFERT_COFFRE_CAISSE', 'Transfert coffre vers caisse', 'Approvisionnement caisse depuis coffre', 'MOUVEMENT', 'TRANSFER_FROM_SAFE', NULL, NULL, 'VRT', '572', '571', 'Approvisionnement caisse depuis coffre', 10),
    ('TRANSFERT_CAISSE_COFFRE', 'Transfert caisse vers coffre', 'Versement caisse vers coffre', 'MOUVEMENT', 'TRANSFER_TO_SAFE', NULL, NULL, 'VRT', '571', '572', 'Versement caisse vers coffre', 10),

    -- === COMMISSIONS ET FRAIS ===
    ('COMM_MTN', 'Commission MTN', 'Commission opérateur MTN', 'MOUVEMENT', 'OPERATOR_FEE', 'MOBILE_MONEY', 'MTN', 'MMTN', '6272', '5781', 'Commission MTN MoMo', 10),
    ('COMM_AIRTEL', 'Commission Airtel', 'Commission opérateur Airtel', 'MOUVEMENT', 'OPERATOR_FEE', 'MOBILE_MONEY', 'AIRTEL', 'MAIR', '6272', '5782', 'Commission Airtel Money', 10),
    ('FRAIS_DOSSIER', 'Frais de dossier crédit', 'Frais de dossier crédit', 'MOUVEMENT', 'CREDIT_FEE', NULL, NULL, 'CRD', '571', '7072', 'Frais de dossier crédit #{creditNumber}', 10)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 13. CREATE FUNCTION FOR NEXT PIECE NUMBER
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_piece_number(p_agence_id uuid, p_journal_code text, p_year integer)
RETURNS text AS $$
DECLARE
    v_next_number integer;
    v_piece_number text;
BEGIN
    -- Lock and increment sequence
    INSERT INTO gl_sequences (agence_id, journal_code, year, last_number)
    VALUES (p_agence_id, p_journal_code, p_year, 1)
    ON CONFLICT (agence_id, journal_code, year)
    DO UPDATE SET
        last_number = gl_sequences.last_number + 1,
        updated_at = now()
    RETURNING last_number INTO v_next_number;

    -- Format: JOURNAL-YYYY-NNNNNN (e.g., CAI-2025-000001)
    v_piece_number := p_journal_code || '-' || p_year || '-' || LPAD(v_next_number::text, 6, '0');

    RETURN v_piece_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
