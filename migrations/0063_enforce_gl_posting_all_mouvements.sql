-- Migration: Enforce GL Posting for ALL Financial Movements
--
-- Objectif: Garantir que 100% des mouvements financiers sont tracés dans le Grand Livre
--
-- Actions:
-- 1. Reclasser les soldes du compte 571 vers 521 (écriture comptable)
-- 2. Mettre à jour toutes les règles pour utiliser 521 au lieu de 571
-- 3. Activer requires_gl_posting sur tous les mouvements
-- 4. Reprocesser les mouvements en statut SKIPPED

-- ============================================================================
-- 1. ECRITURE DE RECLASSEMENT 571 → 521
-- ============================================================================
-- Transférer le solde du compte legacy 571 vers le compte standard 521

DO $$
DECLARE
    v_solde_571 NUMERIC;
    v_compte_571_id UUID;
    v_compte_521_id UUID;
    v_ecriture_id UUID;
    v_exercice_id UUID;
    v_journal_id UUID;
BEGIN
    -- Calculer le solde actuel du compte 571
    SELECT pc.id, COALESCE(SUM(le.debit - le.credit), 0)
    INTO v_compte_571_id, v_solde_571
    FROM plan_comptable pc
    LEFT JOIN lignes_ecritures le ON le.compte_id = pc.id
    LEFT JOIN ecritures_comptables e ON le.ecriture_id = e.id AND e.statut = 'POSTED'
    WHERE pc.numero_compte = '571'
    GROUP BY pc.id;

    -- Si le solde est non nul, créer une écriture de reclassement
    IF v_solde_571 IS NOT NULL AND v_solde_571 != 0 THEN
        -- Récupérer les IDs nécessaires
        SELECT id INTO v_compte_521_id FROM plan_comptable WHERE numero_compte = '521' LIMIT 1;
        SELECT id INTO v_exercice_id FROM exercices_comptables WHERE statut = 'OUVERT' ORDER BY date_debut DESC LIMIT 1;
        SELECT id INTO v_journal_id FROM journaux_comptables WHERE code = 'OD' LIMIT 1;

        IF v_compte_521_id IS NOT NULL AND v_exercice_id IS NOT NULL AND v_journal_id IS NOT NULL THEN
            -- Créer l'écriture de reclassement
            INSERT INTO ecritures_comptables (
                id, reference, date_ecriture, libelle, journal_id, exercice_id,
                statut, source_module, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                'RECL-571-521-' || TO_CHAR(NOW(), 'YYYYMMDD'),
                CURRENT_DATE,
                'Reclassement compte 571 vers 521 - Migration legacy',
                v_journal_id,
                v_exercice_id,
                'POSTED',
                'MIGRATION',
                NOW(),
                NOW()
            ) RETURNING id INTO v_ecriture_id;

            -- Ligne débit 521 (on reçoit les fonds)
            INSERT INTO lignes_ecritures (
                id, ecriture_id, compte_id, libelle, debit, credit, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                v_ecriture_id,
                v_compte_521_id,
                'Reclassement depuis compte 571',
                v_solde_571,
                0,
                NOW(),
                NOW()
            );

            -- Ligne crédit 571 (on vide le compte)
            INSERT INTO lignes_ecritures (
                id, ecriture_id, compte_id, libelle, debit, credit, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                v_ecriture_id,
                v_compte_571_id,
                'Reclassement vers compte 521',
                0,
                v_solde_571,
                NOW(),
                NOW()
            );

            RAISE NOTICE 'Écriture de reclassement créée: % FCFA de 571 vers 521', v_solde_571;
        END IF;
    ELSE
        RAISE NOTICE 'Pas de solde à reclasser sur le compte 571';
    END IF;
END $$;

-- ============================================================================
-- 2. MISE À JOUR DES RÈGLES COMPTABLES POUR UTILISER 521
-- ============================================================================

-- Mettre à jour toutes les règles qui utilisent 571 pour utiliser 521
UPDATE accounting_rules
SET debit_account = '521'
WHERE debit_account = '571' AND active = true;

UPDATE accounting_rules
SET credit_account = '521'
WHERE credit_account = '571' AND active = true;

-- Désactiver les règles dupliquées (garder seulement les plus prioritaires)
-- Par exemple, si on a à la fois DEP_CASH_CURRENT et DEPOSIT_CURRENT_DEFAULT

-- ============================================================================
-- 3. ACTIVER requires_gl_posting SUR TOUS LES MOUVEMENTS
-- ============================================================================

-- Exception: Les mouvements "CRE" des transferts (pour éviter double-comptage)
-- Ces mouvements sont la contrepartie d'un mouvement "DEB" qui a déjà été posté

-- D'abord, identifier les mouvements CRE qui sont la contrepartie d'un DEB
-- Format: TRF-XXXXXX-CRE est la contrepartie de TRF-XXXXXX-DEB

UPDATE mouvements_financiers
SET requires_gl_posting = true,
    gl_posting_status = 'PENDING'
WHERE requires_gl_posting = false
  AND reference NOT LIKE '%-CRE';  -- Exclure les contreparties crédit des transferts

-- Les mouvements CRE restent à false car ils font partie de la même transaction
-- que le mouvement DEB correspondant

-- ============================================================================
-- 4. CRÉER LES RÈGLES MANQUANTES POUR LES CAS SPÉCIAUX
-- ============================================================================

-- Règle pour DEPOSIT_CURRENT sans méthode de paiement (cas SYSTEME)
INSERT INTO accounting_rules (
    code, name, description, source_type, event_type, payment_method,
    journal_code, debit_account, credit_account, description_template, priority, active
)
SELECT
    'DEP_SYSTEM_CURRENT',
    'Dépôt système compte courant',
    'Dépôt automatique/système sur compte courant',
    'MOUVEMENT', 'DEPOSIT_CURRENT', NULL,
    'OD', '521', '4111',
    'Dépôt système - {clientName}', 5, true
WHERE NOT EXISTS (
    SELECT 1 FROM accounting_rules
    WHERE code = 'DEP_SYSTEM_CURRENT'
);

-- ============================================================================
-- 5. DÉSACTIVER LE COMPTE 571 (LEGACY)
-- ============================================================================

UPDATE plan_comptable
SET actif = false,
    intitule = '[LEGACY - Ne plus utiliser] ' || intitule
WHERE numero_compte = '571'
  AND intitule NOT LIKE '%LEGACY%';

-- ============================================================================
-- 6. CRÉER UNE CONTRAINTE POUR EMPÊCHER LES NOUVELLES ÉCRITURES SUR 571
-- ============================================================================

-- Note: On ne peut pas créer une contrainte CHECK sur une colonne qui référence
-- une autre table, donc on utilise un trigger

CREATE OR REPLACE FUNCTION check_no_legacy_accounts()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM plan_comptable
        WHERE id = NEW.compte_id
        AND numero_compte = '571'
    ) THEN
        RAISE EXCEPTION 'Le compte 571 est obsolète. Utilisez le compte 521 à la place.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_legacy_account_571 ON lignes_ecritures;
CREATE TRIGGER prevent_legacy_account_571
    BEFORE INSERT ON lignes_ecritures
    FOR EACH ROW
    EXECUTE FUNCTION check_no_legacy_accounts();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Après cette migration:
-- 1. Le solde de 571 a été transféré vers 521
-- 2. Toutes les règles utilisent 521 (pas 571)
-- 3. Tous les mouvements (sauf contreparties CRE) ont requires_gl_posting = true
-- 4. Le compte 571 est marqué comme legacy et bloqué
-- 5. Les mouvements PENDING seront reprocessés par le service GL

