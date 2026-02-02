-- ================================================================
-- SCRIPT DE VIDAGE DES DONNÉES FINANCIÈRES
-- ================================================================
-- Ce script supprime toutes les transactions financières mais conserve:
-- - Les utilisateurs et employés
-- - Les clients
-- - Les agences
-- - Les référentiels (plan comptable, produits, configurations)
-- ================================================================

BEGIN;

-- ================================================================
-- 1. MOBILE MONEY - Transactions et paiements
-- ================================================================
TRUNCATE TABLE loan_payment_allocations CASCADE;
TRUNCATE TABLE provider_events CASCADE;
TRUNCATE TABLE payment_intents CASCADE;
TRUNCATE TABLE mm_reconciliation_reports CASCADE;

-- ================================================================
-- 2. REMBOURSEMENTS - Allocations et écheances
-- ================================================================
TRUNCATE TABLE remboursement_allocation_audit CASCADE;
TRUNCATE TABLE client_credit_balances CASCADE;
TRUNCATE TABLE remboursement_echeances CASCADE;

-- ================================================================
-- 3. CRÉDITS - Remboursements et écheances
-- ================================================================
TRUNCATE TABLE remboursements CASCADE;
TRUNCATE TABLE echeances_credits CASCADE;
TRUNCATE TABLE credit_refund_requests CASCADE;
TRUNCATE TABLE reevaluation_audit_logs CASCADE;
TRUNCATE TABLE reevaluations_credit CASCADE;
TRUNCATE TABLE credits CASCADE;
-- Note: dossiers_credit et demandes_credit sont conservés car ce sont des demandes/dossiers

-- ================================================================
-- 4. COMPTES D'ÉPARGNE - Transactions et mouvements
-- ================================================================
TRUNCATE TABLE transactions_compte CASCADE;
TRUNCATE TABLE versements_automatiques CASCADE;
TRUNCATE TABLE virements_programmes_audit_logs CASCADE;
TRUNCATE TABLE scheduled_transfer_runs CASCADE;
TRUNCATE TABLE virements_programmes CASCADE;
TRUNCATE TABLE decaissements_programmes CASCADE;
TRUNCATE TABLE compte_agences_historique CASCADE;
TRUNCATE TABLE comptes CASCADE;

-- ================================================================
-- 5. MOUVEMENTS FINANCIERS GÉNÉRAUX
-- ================================================================
TRUNCATE TABLE mouvements_financiers CASCADE;
TRUNCATE TABLE evenements_outbox CASCADE;

-- ================================================================
-- 6. CAISSES - Sessions et opérations
-- ================================================================
TRUNCATE TABLE caisse_handover_audit_logs CASCADE;
TRUNCATE TABLE caisse_handovers CASCADE;
TRUNCATE TABLE sessions_caisse_audit_logs CASCADE;
TRUNCATE TABLE operations_caisse CASCADE;
TRUNCATE TABLE scheduled_caisse_transfers CASCADE;
TRUNCATE TABLE caisse_transferts CASCADE;
TRUNCATE TABLE sessions_caisse CASCADE;
-- Note: table 'caisses' est conservée (référentiel)

-- ================================================================
-- 7. CAISSES AGENT - Opérations terrain
-- ================================================================
TRUNCATE TABLE operations_terrain_audit_logs CASCADE;
TRUNCATE TABLE operations_terrain CASCADE;
TRUNCATE TABLE caisse_code_usages CASCADE;
TRUNCATE TABLE caisses_agent CASCADE;

-- ================================================================
-- 8. OPÉRATIONS TERRAIN - Remises et paiements
-- ================================================================
TRUNCATE TABLE remise_audit_logs CASCADE;
TRUNCATE TABLE agent_mm_payments CASCADE;
TRUNCATE TABLE remise_items CASCADE;
TRUNCATE TABLE paiements_terrain CASCADE;
TRUNCATE TABLE remises_terrain CASCADE;
TRUNCATE TABLE pos_device_logs CASCADE;

-- ================================================================
-- 9. FACTURATION
-- ================================================================
TRUNCATE TABLE lignes_factures CASCADE;
TRUNCATE TABLE factures CASCADE;
-- Note: modeles_factures est conservé (référentiel)

-- ================================================================
-- 10. COMPTAGE BILLETS
-- ================================================================
TRUNCATE TABLE comptage_billets CASCADE;

-- ================================================================
-- 11. COFFRE-FORT - Transferts et mouvements
-- ================================================================
TRUNCATE TABLE taches_regularisation_coffre_caisse CASCADE;
TRUNCATE TABLE reconciliations_coffre_caisse CASCADE;
TRUNCATE TABLE transferts_coffre_audit_logs CASCADE;
TRUNCATE TABLE transferts_coffre_caisse CASCADE;

TRUNCATE TABLE taches_regularisation CASCADE;
TRUNCATE TABLE reconciliations_liaison CASCADE;
TRUNCATE TABLE transferts_inter_coffres_audit_logs CASCADE;
TRUNCATE TABLE documents_transfert CASCADE;
TRUNCATE TABLE transferts_inter_coffres CASCADE;
-- Note: coffres_forts et comptes_liaison sont conservés (référentiels)

-- ================================================================
-- 12. TRANSFERTS - Opérations de transfert
-- ================================================================
TRUNCATE TABLE otp_validations CASCADE;
TRUNCATE TABLE transfert_reconciliation CASCADE;
TRUNCATE TABLE transfert_audit_logs CASCADE;
TRUNCATE TABLE transferts CASCADE;
-- Note: kyc_levels, transfert_limits, transfert_webhooks, transfert_blacklist conservés

-- ================================================================
-- 13. CLÔTURE CAISSE - Écarts et réconciliations
-- ================================================================
TRUNCATE TABLE agency_closure_audit_log CASCADE;
TRUNCATE TABLE agency_closure_blockers CASCADE;
TRUNCATE TABLE agency_daily_closure CASCADE;
TRUNCATE TABLE ecarts_approval_audit_log CASCADE;
TRUNCATE TABLE ecarts_approval_requests CASCADE;
TRUNCATE TABLE mm_balance_reconciliations CASCADE;
-- Note: config_ecart_caisse est conservée (référentiel)

-- ================================================================
-- 14. TONTINES - Contributions et distributions
-- ================================================================
TRUNCATE TABLE tontine_distribution_requests CASCADE;
TRUNCATE TABLE tontine_turn_audit CASCADE;
TRUNCATE TABLE tontine_turns CASCADE;
TRUNCATE TABLE tontine_schedules CASCADE;
TRUNCATE TABLE tontine_cycles CASCADE;
TRUNCATE TABLE tontine_distributions CASCADE;
TRUNCATE TABLE contributions_tontine CASCADE;
-- Note: tontines, membres_tontine et référentiels conservés

-- ================================================================
-- 15. GRAND LIVRE - Écritures comptables
-- ================================================================
TRUNCATE TABLE lignes_ecritures CASCADE;
TRUNCATE TABLE gl_posting_links CASCADE;
TRUNCATE TABLE ecritures_comptables CASCADE;
TRUNCATE TABLE declarations_tva CASCADE;
-- Note: plan_comptable, journaux_comptables, exercices_comptables conservés

-- ================================================================
-- VÉRIFICATION - Afficher les compteurs
-- ================================================================
DO $$
DECLARE
    r RECORD;
    total_rows BIGINT := 0;
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'RÉSUMÉ DES DONNÉES APRÈS NETTOYAGE';
    RAISE NOTICE '================================================================';

    -- Données conservées (référentiels)
    RAISE NOTICE '';
    RAISE NOTICE 'DONNÉES CONSERVÉES (Référentiels & Métiers):';
    RAISE NOTICE '------------------------------------------------------------';

    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN (
            'users', 'employes', 'clients', 'agences',
            'plan_comptable', 'journaux_comptables', 'exercices_comptables',
            'credit_plans', 'produits_compte', 'plans_epargne',
            'interest_rates', 'coffres_forts', 'comptes_liaison',
            'caisses', 'tontines', 'membres_tontine'
        )
        ORDER BY tablename
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I.%I', r.schemaname, r.tablename) INTO total_rows;
        RAISE NOTICE '  % : % enregistrements', rpad(r.tablename, 40), total_rows;
    END LOOP;

    -- Données vidées (transactions)
    RAISE NOTICE '';
    RAISE NOTICE 'DONNÉES VIDÉES (Transactions financières):';
    RAISE NOTICE '------------------------------------------------------------';

    FOR r IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN (
            'ecritures_comptables', 'lignes_ecritures', 'credits', 'remboursements',
            'operations_caisse', 'sessions_caisse', 'transactions_compte', 'comptes',
            'transferts', 'contributions_tontine', 'payment_intents',
            'operations_terrain', 'remises_terrain', 'factures'
        )
        ORDER BY tablename
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I.%I', r.schemaname, r.tablename) INTO total_rows;
        RAISE NOTICE '  % : % enregistrements', rpad(r.tablename, 40), total_rows;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'NETTOYAGE TERMINÉ AVEC SUCCÈS';
    RAISE NOTICE '================================================================';
END $$;

COMMIT;
