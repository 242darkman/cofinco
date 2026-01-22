-- Migration: Standardize Status Enums from French to English
-- Date: 2026-01-19
--
-- INSTRUCTIONS PGADMIN:
-- 1. Exécutez d'abord: ROLLBACK;
-- 2. Désactivez Auto-commit: Query Tool > Preferences > Auto commit OFF
-- 3. Ou exécutez chaque ALTER TYPE ligne par ligne
--
-- OU utilisez psql en ligne de commande:
-- psql -U user -d database -f migrations/0018_standardize_statuts_fr_to_en.sql

-- First, ensure we're not in a failed transaction
ROLLBACK;

-- 1. STATUT_COMPTE_ENUM
DO $$ BEGIN ALTER TYPE statut_compte_enum ADD VALUE IF NOT EXISTS 'ACTIVE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_compte_enum ADD VALUE IF NOT EXISTS 'SUSPENDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_compte_enum ADD VALUE IF NOT EXISTS 'CLOSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_compte_enum ADD VALUE IF NOT EXISTS 'PENDING_ACTIVATION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_compte_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. STATUT_CREDIT_ENUM
DO $$ BEGIN ALTER TYPE statut_credit_enum ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_credit_enum ADD VALUE IF NOT EXISTS 'ACTIVE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_credit_enum ADD VALUE IF NOT EXISTS 'LATE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_credit_enum ADD VALUE IF NOT EXISTS 'PAID'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_credit_enum ADD VALUE IF NOT EXISTS 'CLOSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_credit_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. STATUT_DEMANDE_ENUM
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'PENDING_FEES'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'READY_FOR_INVESTIGATION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'UNDER_INVESTIGATION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'INVESTIGATION_COMPLETE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'APPROVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'DISBURSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'CLOSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'REEVALUATION_IN_PROGRESS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'APPROVED_AFTER_REEVALUATION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'DEFINITIVELY_REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. STATUT_TRANSACTION_ENUM
DO $$ BEGIN ALTER TYPE statut_transaction_enum ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transaction_enum ADD VALUE IF NOT EXISTS 'POSTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transaction_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transaction_enum ADD VALUE IF NOT EXISTS 'REVERSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. STATUT_TRANSFERT_CAISSE_ENUM
DO $$ BEGIN ALTER TYPE statut_transfert_caisse_enum ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_caisse_enum ADD VALUE IF NOT EXISTS 'VALIDATED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_caisse_enum ADD VALUE IF NOT EXISTS 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_caisse_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_caisse_enum ADD VALUE IF NOT EXISTS 'RECEIVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. STATUT_TRANSFERT_COFFRE_ENUM
DO $$ BEGIN ALTER TYPE statut_transfert_coffre_enum ADD VALUE IF NOT EXISTS 'REQUESTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_coffre_enum ADD VALUE IF NOT EXISTS 'VALIDATED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_coffre_enum ADD VALUE IF NOT EXISTS 'EXECUTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_coffre_enum ADD VALUE IF NOT EXISTS 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_coffre_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. STATUT_COFFRE_ENUM
DO $$ BEGIN ALTER TYPE statut_coffre_enum ADD VALUE IF NOT EXISTS 'ACTIVE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_coffre_enum ADD VALUE IF NOT EXISTS 'SUSPENDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_coffre_enum ADD VALUE IF NOT EXISTS 'CLOSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. STATUT_CAISSE_AGENT_ENUM
DO $$ BEGIN ALTER TYPE statut_caisse_agent_enum ADD VALUE IF NOT EXISTS 'ACTIVE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_caisse_agent_enum ADD VALUE IF NOT EXISTS 'SUSPENDED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_caisse_agent_enum ADD VALUE IF NOT EXISTS 'CLOSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. STATUT_TRANSFERT_INTER_COFFRE_ENUM
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'DRAFT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'SUBMITTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'APPROVED_L1'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'APPROVED_L2'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'IN_TRANSIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'RECEIVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'RECEIVED_WITH_DISCREPANCY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_transfert_inter_coffre_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. STATUT_RECONCILIATION_ENUM
DO $$ BEGIN ALTER TYPE statut_reconciliation_enum ADD VALUE IF NOT EXISTS 'PENDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reconciliation_enum ADD VALUE IF NOT EXISTS 'RECONCILED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reconciliation_enum ADD VALUE IF NOT EXISTS 'DISCREPANCY_DETECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. STATUT_TACHE_REGULARISATION_ENUM
DO $$ BEGIN ALTER TYPE statut_tache_regularisation_enum ADD VALUE IF NOT EXISTS 'OPEN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_tache_regularisation_enum ADD VALUE IF NOT EXISTS 'IN_PROGRESS'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_tache_regularisation_enum ADD VALUE IF NOT EXISTS 'RESOLVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_tache_regularisation_enum ADD VALUE IF NOT EXISTS 'ESCALATED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 12. PRIORITE_TACHE_ENUM
DO $$ BEGIN ALTER TYPE priorite_tache_enum ADD VALUE IF NOT EXISTS 'LOW'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE priorite_tache_enum ADD VALUE IF NOT EXISTS 'NORMAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE priorite_tache_enum ADD VALUE IF NOT EXISTS 'HIGH'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE priorite_tache_enum ADD VALUE IF NOT EXISTS 'CRITICAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 13. STATUT_REEVALUATION_ENUM
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'REQUESTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'ELIGIBILITY_CHECK'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'AUTHORIZED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'REFUSED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'ADDITIONAL_INVESTIGATION'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'INVESTIGATION_COMPLETE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'IN_COMMITTEE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'APPROVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'DEFINITIVELY_REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE statut_reevaluation_enum ADD VALUE IF NOT EXISTS 'CANCELLED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verification
SELECT 'Migration 0018 completed successfully' AS status;
