-- Migration: Fix SAFE_SUPPLY Accounting Entry
--
-- Problème: L'écriture d'approvisionnement initial du coffre (SAFE_SUPPLY) a été
-- comptabilisée avec:
--   - Débit 531 (Coffre): 100,000,000
--   - Crédit 512 (Banque): 100,000,000
--
-- Cela crée un solde négatif sur le compte banque car il n'avait pas de solde initial.
-- L'apport initial devrait plutôt être comptabilisé comme un apport en capital:
--   - Débit 531 (Coffre): 100,000,000
--   - Crédit 101 (Capital social) ou 103 (Apports): 100,000,000
--
-- Solution: Créer une écriture de correction qui:
-- 1. Débite 512 (annule le crédit erroné)
-- 2. Crédite 101 (enregistre l'apport en capital correctement)

DO $$
DECLARE
    v_ecriture_id UUID;
    v_exercice_id UUID;
    v_journal_id UUID;
    v_compte_512_id UUID;
    v_compte_101_id UUID;
    v_agence_id UUID := 'b8519d5d-93ac-468f-aed6-335bb9ed9639';
    v_montant NUMERIC := 100000000; -- 100,000,000 FCFA
BEGIN
    -- Récupérer les IDs nécessaires
    SELECT id INTO v_exercice_id FROM exercices_comptables WHERE statut = 'OUVERT' ORDER BY date_debut DESC LIMIT 1;
    SELECT id INTO v_journal_id FROM journaux_comptables WHERE code = 'OD' LIMIT 1;
    SELECT id INTO v_compte_512_id FROM plan_comptable WHERE numero_compte = '512' LIMIT 1;

    -- Créer le compte 101 s'il n'existe pas
    INSERT INTO plan_comptable (
        id, numero_compte, intitule, classe, type_compte, sens_normal, niveau, actif, is_system
    ) VALUES (
        gen_random_uuid(),
        '101',
        'Capital social',
        1,
        'Capitaux',
        'Crédit',
        1,
        true,
        true
    )
    ON CONFLICT (numero_compte) DO NOTHING;

    SELECT id INTO v_compte_101_id FROM plan_comptable WHERE numero_compte = '101';

    IF v_compte_512_id IS NULL THEN
        RAISE EXCEPTION 'Compte 512 (Banque) non trouvé';
    END IF;

    IF v_compte_101_id IS NULL THEN
        RAISE EXCEPTION 'Compte 101 (Capital social) non trouvé';
    END IF;

    IF v_exercice_id IS NULL THEN
        RAISE EXCEPTION 'Aucun exercice comptable ouvert';
    END IF;

    IF v_journal_id IS NULL THEN
        RAISE EXCEPTION 'Journal OD non trouvé';
    END IF;

    -- Créer l'écriture de correction
    INSERT INTO ecritures_comptables (
        id, numero_piece, date_ecriture, libelle, journal_id, exercice_id,
        statut, source_type, agence_id, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        'OD-CORR-SAFESUPPLY-' || TO_CHAR(NOW(), 'YYYYMMDD'),
        CURRENT_DATE,
        'Correction SAFE_SUPPLY: reclassement Banque vers Capital social',
        v_journal_id,
        v_exercice_id,
        'POSTED',
        'MIGRATION',
        v_agence_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_ecriture_id;

    -- Ligne débit 512 (annule le crédit erroné, augmente le solde bancaire)
    INSERT INTO lignes_ecritures (
        id, ecriture_id, compte_id, numero_compte, libelle, debit, credit, created_at
    ) VALUES (
        gen_random_uuid(),
        v_ecriture_id,
        v_compte_512_id,
        '512',
        'Correction: annulation crédit SAFE_SUPPLY sur banque',
        v_montant,
        0,
        NOW()
    );

    -- Ligne crédit 101 (enregistre l'apport en capital)
    INSERT INTO lignes_ecritures (
        id, ecriture_id, compte_id, numero_compte, libelle, debit, credit, created_at
    ) VALUES (
        gen_random_uuid(),
        v_ecriture_id,
        v_compte_101_id,
        '101',
        'Apport initial en capital (SAFE_SUPPLY)',
        0,
        v_montant,
        NOW()
    );

    RAISE NOTICE 'Écriture de correction créée: % - % FCFA reclassés de 512 vers 101', v_ecriture_id, v_montant;
END $$;

-- ============================================================================
-- VÉRIFICATION POST-MIGRATION
-- ============================================================================
-- Après cette migration, les soldes devraient être:
-- - 512 (Banque): 0 FCFA (équilibré)
-- - 521 (Caisse): ~10,625,000 FCFA
-- - 531 (Coffre): ~89,995,000 FCFA
-- - 101 (Capital): -100,000,000 FCFA (solde créditeur = passif)
--
-- GL Total (classe 5 actifs): ~100,620,000 FCFA
-- Opérationnel: ~100,620,000 FCFA
-- Écart: 0 FCFA

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
