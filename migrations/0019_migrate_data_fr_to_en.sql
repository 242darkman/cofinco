-- Migration: Update existing data from French to English status values
-- Date: 2026-01-19
-- Description: Migrate existing data to use EN status values
-- Prerequisites: Run 0018_standardize_statuts_fr_to_en.sql first

-- Clear any failed transaction state
ROLLBACK;

-- ============================================
-- 1. COMPTES
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comptes') THEN
        UPDATE comptes SET statut = 'ACTIVE' WHERE statut = 'Actif';
        UPDATE comptes SET statut = 'SUSPENDED' WHERE statut = 'Suspendu';
        UPDATE comptes SET statut = 'CLOSED' WHERE statut = 'Clôturé';
        UPDATE comptes SET statut = 'PENDING_ACTIVATION' WHERE statut = 'EN_ATTENTE_PAIEMENT';
        UPDATE comptes SET statut = 'CANCELLED' WHERE statut = 'Annulé';
        RAISE NOTICE 'comptes: migration completed';
    ELSE
        RAISE NOTICE 'comptes: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 2. CREDITS
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credits') THEN
        UPDATE credits SET statut = 'PENDING' WHERE statut = 'En attente';
        UPDATE credits SET statut = 'ACTIVE' WHERE statut = 'Actif';
        UPDATE credits SET statut = 'LATE' WHERE statut = 'En retard';
        UPDATE credits SET statut = 'PAID' WHERE statut = 'Soldé';
        UPDATE credits SET statut = 'CLOSED' WHERE statut = 'Clôturé';
        UPDATE credits SET statut = 'CANCELLED' WHERE statut = 'Annulé';
        RAISE NOTICE 'credits: migration completed';
    ELSE
        RAISE NOTICE 'credits: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 3. DEMANDES_CREDIT
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'demandes_credit') THEN
        UPDATE demandes_credit SET statut = 'PENDING_FEES' WHERE statut = 'En attente';
        UPDATE demandes_credit SET statut = 'READY_FOR_INVESTIGATION' WHERE statut = 'A enquêter';
        UPDATE demandes_credit SET statut = 'UNDER_INVESTIGATION' WHERE statut = 'En enquête';
        UPDATE demandes_credit SET statut = 'INVESTIGATION_COMPLETE' WHERE statut = 'Enquête terminée';
        UPDATE demandes_credit SET statut = 'APPROVED' WHERE statut = 'Approuvée';
        UPDATE demandes_credit SET statut = 'REJECTED' WHERE statut = 'Rejetée';
        UPDATE demandes_credit SET statut = 'CANCELLED' WHERE statut = 'Annulée';
        UPDATE demandes_credit SET statut = 'DISBURSED' WHERE statut = 'Décaissée';
        UPDATE demandes_credit SET statut = 'CLOSED' WHERE statut = 'Clôturée';
        UPDATE demandes_credit SET statut = 'REEVALUATION_IN_PROGRESS' WHERE statut = 'Réévaluation en cours';
        UPDATE demandes_credit SET statut = 'APPROVED_AFTER_REEVALUATION' WHERE statut = 'Approuvée après réévaluation';
        UPDATE demandes_credit SET statut = 'DEFINITIVELY_REJECTED' WHERE statut = 'Rejetée définitivement';
        RAISE NOTICE 'demandes_credit: migration completed';
    ELSE
        RAISE NOTICE 'demandes_credit: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 4. MOUVEMENTS_FINANCIERS
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mouvements_financiers') THEN
        UPDATE mouvements_financiers SET statut = 'PENDING' WHERE statut = 'Pending';
        UPDATE mouvements_financiers SET statut = 'POSTED' WHERE statut = 'Posté';
        UPDATE mouvements_financiers SET statut = 'CANCELLED' WHERE statut = 'Annulé';
        UPDATE mouvements_financiers SET statut = 'REVERSED' WHERE statut = 'Reversé';
        RAISE NOTICE 'mouvements_financiers: migration completed';
    ELSE
        RAISE NOTICE 'mouvements_financiers: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 5. TRANSFERTS_CAISSE
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transferts_caisse') THEN
        UPDATE transferts_caisse SET statut = 'PENDING' WHERE statut = 'En attente';
        UPDATE transferts_caisse SET statut = 'VALIDATED' WHERE statut = 'Validé';
        UPDATE transferts_caisse SET statut = 'REJECTED' WHERE statut = 'Rejeté';
        UPDATE transferts_caisse SET statut = 'CANCELLED' WHERE statut = 'Annulé';
        UPDATE transferts_caisse SET statut = 'RECEIVED' WHERE statut = 'Reçu';
        RAISE NOTICE 'transferts_caisse: migration completed';
    ELSE
        RAISE NOTICE 'transferts_caisse: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 6. TRANSFERTS_COFFRE
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transferts_coffre') THEN
        UPDATE transferts_coffre SET statut = 'REQUESTED' WHERE statut = 'Demandé';
        UPDATE transferts_coffre SET statut = 'VALIDATED' WHERE statut = 'Validé';
        UPDATE transferts_coffre SET statut = 'EXECUTED' WHERE statut = 'Exécuté';
        UPDATE transferts_coffre SET statut = 'REJECTED' WHERE statut = 'Rejeté';
        UPDATE transferts_coffre SET statut = 'CANCELLED' WHERE statut = 'Annulé';
        RAISE NOTICE 'transferts_coffre: migration completed';
    ELSE
        RAISE NOTICE 'transferts_coffre: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 7. COFFRES_FORTS
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coffres_forts') THEN
        UPDATE coffres_forts SET statut = 'ACTIVE' WHERE statut = 'Actif';
        UPDATE coffres_forts SET statut = 'SUSPENDED' WHERE statut = 'Suspendu';
        UPDATE coffres_forts SET statut = 'CLOSED' WHERE statut = 'Fermé';
        RAISE NOTICE 'coffres_forts: migration completed';
    ELSE
        RAISE NOTICE 'coffres_forts: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 8. CAISSES_AGENT
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caisses_agent') THEN
        UPDATE caisses_agent SET statut = 'ACTIVE' WHERE statut = 'Active';
        UPDATE caisses_agent SET statut = 'SUSPENDED' WHERE statut = 'Suspendue';
        UPDATE caisses_agent SET statut = 'CLOSED' WHERE statut = 'Clôturée';
        RAISE NOTICE 'caisses_agent: migration completed';
    ELSE
        RAISE NOTICE 'caisses_agent: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 9. TRANSFERTS_INTER_COFFRES
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transferts_inter_coffres') THEN
        UPDATE transferts_inter_coffres SET statut = 'DRAFT' WHERE statut = 'Brouillon';
        UPDATE transferts_inter_coffres SET statut = 'SUBMITTED' WHERE statut = 'Soumis';
        UPDATE transferts_inter_coffres SET statut = 'APPROVED_L1' WHERE statut = 'Approuvé N1';
        UPDATE transferts_inter_coffres SET statut = 'APPROVED_L2' WHERE statut = 'Approuvé N2';
        UPDATE transferts_inter_coffres SET statut = 'IN_TRANSIT' WHERE statut = 'En transit';
        UPDATE transferts_inter_coffres SET statut = 'RECEIVED' WHERE statut = 'Reçu';
        UPDATE transferts_inter_coffres SET statut = 'RECEIVED_WITH_DISCREPANCY' WHERE statut = 'Reçu avec écart';
        UPDATE transferts_inter_coffres SET statut = 'REJECTED' WHERE statut = 'Rejeté';
        UPDATE transferts_inter_coffres SET statut = 'CANCELLED' WHERE statut = 'Annulé';
        RAISE NOTICE 'transferts_inter_coffres: migration completed';
    ELSE
        RAISE NOTICE 'transferts_inter_coffres: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 10. RECONCILIATIONS
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reconciliations') THEN
        UPDATE reconciliations SET statut = 'PENDING' WHERE statut = 'En attente';
        UPDATE reconciliations SET statut = 'RECONCILED' WHERE statut = 'Rapproché';
        UPDATE reconciliations SET statut = 'DISCREPANCY_DETECTED' WHERE statut = 'Écart détecté';
        RAISE NOTICE 'reconciliations: migration completed';
    ELSE
        RAISE NOTICE 'reconciliations: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 11. TACHES_REGULARISATION
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'taches_regularisation') THEN
        UPDATE taches_regularisation SET statut = 'OPEN' WHERE statut = 'Ouverte';
        UPDATE taches_regularisation SET statut = 'IN_PROGRESS' WHERE statut = 'En cours';
        UPDATE taches_regularisation SET statut = 'RESOLVED' WHERE statut = 'Résolue';
        UPDATE taches_regularisation SET statut = 'ESCALATED' WHERE statut = 'Escaladée';

        UPDATE taches_regularisation SET priorite = 'LOW' WHERE priorite = 'Basse';
        UPDATE taches_regularisation SET priorite = 'NORMAL' WHERE priorite = 'Normale';
        UPDATE taches_regularisation SET priorite = 'HIGH' WHERE priorite = 'Haute';
        UPDATE taches_regularisation SET priorite = 'CRITICAL' WHERE priorite = 'Critique';
        RAISE NOTICE 'taches_regularisation: migration completed';
    ELSE
        RAISE NOTICE 'taches_regularisation: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- 12. REEVALUATIONS
-- ============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reevaluations') THEN
        UPDATE reevaluations SET statut = 'REQUESTED' WHERE statut = 'Demandée';
        UPDATE reevaluations SET statut = 'ELIGIBILITY_CHECK' WHERE statut = 'Éligibilité en cours';
        UPDATE reevaluations SET statut = 'AUTHORIZED' WHERE statut = 'Autorisée';
        UPDATE reevaluations SET statut = 'REFUSED' WHERE statut = 'Refusée';
        UPDATE reevaluations SET statut = 'ADDITIONAL_INVESTIGATION' WHERE statut = 'Enquête complémentaire';
        UPDATE reevaluations SET statut = 'INVESTIGATION_COMPLETE' WHERE statut = 'Enquête terminée';
        UPDATE reevaluations SET statut = 'IN_COMMITTEE' WHERE statut = 'En comité';
        UPDATE reevaluations SET statut = 'APPROVED' WHERE statut = 'Approuvée';
        UPDATE reevaluations SET statut = 'DEFINITIVELY_REJECTED' WHERE statut = 'Rejetée définitivement';
        UPDATE reevaluations SET statut = 'CANCELLED' WHERE statut = 'Annulée';
        RAISE NOTICE 'reevaluations: migration completed';
    ELSE
        RAISE NOTICE 'reevaluations: table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- Verification queries (optional - run manually)
-- ============================================
-- SELECT statut, COUNT(*) FROM comptes GROUP BY statut;
-- SELECT statut, COUNT(*) FROM credits GROUP BY statut;
-- SELECT statut, COUNT(*) FROM demandes_credit GROUP BY statut;
-- SELECT statut, COUNT(*) FROM coffres_forts GROUP BY statut;
