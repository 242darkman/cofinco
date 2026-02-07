-- ============================================================================
-- REQUÊTES DE VÉRIFICATION DES SEEDS
-- À exécuter après pnpm seed:prod pour valider l'insertion
-- ============================================================================

-- ============================================================================
-- 1. VÉRIFICATION DES COFFRES-FORTS PAR AGENCE (Migration 0009)
-- ============================================================================

-- Doit retourner toutes les agences avec un coffre-fort
SELECT
    a.code_agence,
    a.nom AS agence_nom,
    c.nom AS coffre_nom,
    c.type,
    c.solde,
    c.statut,
    CASE
        WHEN c.id IS NULL THEN '❌ MANQUANT'
        ELSE '✅ OK'
    END AS status
FROM agences a
LEFT JOIN caisses c ON c.agence_id = a.id AND c.type = 'Coffre-Fort'
ORDER BY a.code_agence;

-- Comptage: doit être égal au nombre d'agences
SELECT
    COUNT(DISTINCT a.id) AS total_agences,
    COUNT(DISTINCT c.id) AS total_coffres,
    CASE
        WHEN COUNT(DISTINCT a.id) = COUNT(DISTINCT c.id) THEN '✅ OK'
        ELSE '❌ MANQUANT'
    END AS status
FROM agences a
LEFT JOIN caisses c ON c.agence_id = a.id AND c.type = 'Coffre-Fort';

-- ============================================================================
-- 2. VÉRIFICATION DES CONFIG COFFRE-FORT (Migration 0009)
-- ============================================================================

-- Doit retourner toutes les agences avec une config
SELECT
    a.code_agence,
    a.nom AS agence_nom,
    cf.seuil_double_validation,
    cf.separation_initiateur_valideur,
    cf.actif,
    CASE
        WHEN cf.id IS NULL THEN '❌ MANQUANT'
        ELSE '✅ OK'
    END AS status
FROM agences a
LEFT JOIN config_coffre_fort cf ON cf.agence_id = a.id
ORDER BY a.code_agence;

-- Comptage: doit être égal au nombre d'agences
SELECT
    COUNT(DISTINCT a.id) AS total_agences,
    COUNT(DISTINCT cf.id) AS total_configs,
    CASE
        WHEN COUNT(DISTINCT a.id) = COUNT(DISTINCT cf.id) THEN '✅ OK'
        ELSE '❌ MANQUANT'
    END AS status
FROM agences a
LEFT JOIN config_coffre_fort cf ON cf.agence_id = a.id;

-- Vérifier les valeurs par défaut
SELECT
    agence_id,
    seuil_double_validation = 1000000 AS seuil_ok,
    separation_initiateur_valideur = true AS separation_ok,
    separation_valideur_executeur = false AS separation_executeur_ok,
    billetage_obligatoire = false AS billetage_ok,
    actif = true AS actif_ok,
    CASE
        WHEN seuil_double_validation = 1000000
            AND separation_initiateur_valideur = true
            AND separation_valideur_executeur = false
            AND billetage_obligatoire = false
            AND actif = true
        THEN '✅ VALEURS OK'
        ELSE '⚠️ VALEURS MODIFIÉES'
    END AS status
FROM config_coffre_fort;

-- ============================================================================
-- 3. VÉRIFICATION DES CAISSES AGENT (Migration 0010)
-- ============================================================================

-- Doit retourner tous les agents terrain avec une caisse
SELECT
    at.nom,
    at.prenom,
    at.telephone,
    ca.solde_valide,
    ca.devise,
    ca.statut,
    CASE
        WHEN ca.id IS NULL THEN '❌ MANQUANT'
        ELSE '✅ OK'
    END AS status
FROM agents_terrain at
LEFT JOIN caisses_agent ca ON ca.agent_id = at.id AND ca.deleted_at IS NULL
WHERE at.deleted_at IS NULL
ORDER BY at.nom, at.prenom;

-- Comptage: doit être égal au nombre d'agents actifs
SELECT
    COUNT(DISTINCT at.id) AS total_agents_actifs,
    COUNT(DISTINCT ca.id) AS total_caisses_agent,
    CASE
        WHEN COUNT(DISTINCT at.id) = COUNT(DISTINCT ca.id) THEN '✅ OK'
        ELSE '❌ MANQUANT'
    END AS status
FROM agents_terrain at
LEFT JOIN caisses_agent ca ON ca.agent_id = at.id AND ca.deleted_at IS NULL
WHERE at.deleted_at IS NULL;

-- Vérifier les valeurs par défaut
SELECT
    agent_id,
    solde_valide = '0' AS solde_ok,
    devise = 'XOF' AS devise_ok,
    statut = 'Active' AS statut_ok,
    CASE
        WHEN solde_valide = '0' AND devise = 'XOF' AND statut = 'Active'
        THEN '✅ VALEURS OK'
        ELSE '⚠️ VALEURS MODIFIÉES'
    END AS status
FROM caisses_agent
WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. VÉRIFICATION DES JOURNAUX COMPTABLES (Migration 0030)
-- ============================================================================

-- Liste complète des journaux (doit en avoir au moins 14)
SELECT
    code,
    intitule,
    type_journal,
    actif,
    created_at
FROM journaux_comptables
ORDER BY code;

-- Comptage total
SELECT COUNT(*) AS total_journaux FROM journaux_comptables;

-- Vérifier les journaux spécifiques de la migration 0030
SELECT
    code,
    intitule,
    type_journal,
    CASE
        WHEN code IN ('CAI', 'MMTN', 'MAIR', 'BNK', 'VRT', 'OD', 'CRD', 'TON', 'AN')
        THEN '✅ Migration 0030'
        ELSE 'Autre'
    END AS source
FROM journaux_comptables
WHERE code IN ('CAI', 'MMTN', 'MAIR', 'BNK', 'VRT', 'OD', 'CRD', 'TON', 'AN')
ORDER BY code;

-- Vérifier que les 3 nouveaux journaux sont présents
SELECT
    CASE WHEN EXISTS (SELECT 1 FROM journaux_comptables WHERE code = 'BNK')
        THEN '✅ BNK présent'
        ELSE '❌ BNK manquant'
    END AS bnk_status,
    CASE WHEN EXISTS (SELECT 1 FROM journaux_comptables WHERE code = 'TON')
        THEN '✅ TON présent'
        ELSE '❌ TON manquant'
    END AS ton_status,
    CASE WHEN EXISTS (SELECT 1 FROM journaux_comptables WHERE code = 'AN')
        THEN '✅ AN présent'
        ELSE '❌ AN manquant'
    END AS an_status;

-- ============================================================================
-- 5. VÉRIFICATION DU PLAN COMPTABLE OHADA (Migration 0030)
-- ============================================================================

-- Comptage total (doit être >= 100)
SELECT
    COUNT(*) AS total_comptes,
    CASE
        WHEN COUNT(*) >= 100 THEN '✅ OK (>= 100 comptes)'
        ELSE '❌ INSUFFISANT'
    END AS status
FROM plan_comptable;

-- Comptage par classe
SELECT
    classe,
    COUNT(*) AS nb_comptes,
    type_compte,
    sens_normal
FROM plan_comptable
GROUP BY classe, type_compte, sens_normal
ORDER BY classe;

-- Vérifier les comptes clés de la migration 0030
SELECT
    numero_compte,
    intitule,
    classe,
    type_compte,
    sens_normal,
    is_system
FROM plan_comptable
WHERE numero_compte IN (
    '10', '11', '12', '13',  -- Classe 1: Capitaux
    '20', '21', '271', '2711', '2712', '2713', '279',  -- Classe 2: Immobilisations et prêts
    '40', '41', '411', '4111', '4112', '4113', '419', '4191', '4192', '4431', '4432',  -- Classe 4: Tiers
    '50', '51', '512', '52', '57', '571', '572', '573', '578', '5781', '5782', '5783', '58', '59',  -- Classe 5: Trésorerie
    '60', '61', '62', '627', '6271', '6272', '6273', '63', '64', '65', '66', '67', '68', '681', '69',  -- Classe 6: Charges
    '70', '706', '707', '7071', '7072', '7073', '7074', '7075', '7076', '71', '75', '76', '77', '78', '781'  -- Classe 7: Produits
)
ORDER BY numero_compte;

-- Comptes critiques pour microfinance (doivent être présents)
SELECT
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '2711')
        THEN '✅ Prêts - Principal'
        ELSE '❌ 2711 manquant'
    END AS prets_principal,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '4111')
        THEN '✅ Dépôts courants'
        ELSE '❌ 4111 manquant'
    END AS depots_courants,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '4112')
        THEN '✅ Dépôts épargne'
        ELSE '❌ 4112 manquant'
    END AS depots_epargne,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '419')
        THEN '✅ Fonds tontine'
        ELSE '❌ 419 manquant'
    END AS fonds_tontine,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '571')
        THEN '✅ Caisse siège'
        ELSE '❌ 571 manquant'
    END AS caisse_siege,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '573')
        THEN '✅ Caisse agents'
        ELSE '❌ 573 manquant'
    END AS caisse_agents,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '5781')
        THEN '✅ Mobile Money MTN'
        ELSE '❌ 5781 manquant'
    END AS momo_mtn,
    CASE WHEN EXISTS (SELECT 1 FROM plan_comptable WHERE numero_compte = '7071')
        THEN '✅ Intérêts prêts'
        ELSE '❌ 7071 manquant'
    END AS interets_prets;

-- ============================================================================
-- 6. VÉRIFICATION DES ACCOUNTING RULES (Migration 0030)
-- ============================================================================

-- Comptage total (doit être >= 40)
SELECT
    COUNT(*) AS total_rules,
    CASE
        WHEN COUNT(*) >= 40 THEN '✅ OK (>= 40 règles)'
        ELSE '❌ INSUFFISANT'
    END AS status
FROM accounting_rules;

-- Règles par type d'événement
SELECT
    event_type,
    COUNT(*) AS nb_rules
FROM accounting_rules
GROUP BY event_type
ORDER BY event_type;

-- Règles par journal
SELECT
    journal_code,
    COUNT(*) AS nb_rules
FROM accounting_rules
GROUP BY journal_code
ORDER BY journal_code;

-- Règles par méthode de paiement
SELECT
    payment_method,
    COUNT(*) AS nb_rules
FROM accounting_rules
GROUP BY payment_method
ORDER BY payment_method;

-- Vérifier quelques règles clés
SELECT
    code,
    name,
    event_type,
    payment_method,
    provider,
    journal_code,
    debit_account,
    credit_account,
    active
FROM accounting_rules
WHERE code IN (
    'DEP_CASH_COURANT',
    'DEP_MTN_EPARGNE',
    'RET_CASH_COURANT',
    'CREDIT_DECAISS_CASH',
    'REMBOURS_CASH_PRINCIPAL',
    'TONTINE_COTIS_CASH',
    'TRANSFERT_COFFRE_CAISSE'
)
ORDER BY code;

-- ============================================================================
-- 7. VÉRIFICATION GLOBALE
-- ============================================================================

-- Résumé de tous les seeds
SELECT
    'Agences' AS table_name,
    COUNT(*) AS count
FROM agences
UNION ALL
SELECT
    'Coffres-forts' AS table_name,
    COUNT(*) AS count
FROM caisses WHERE type = 'Coffre-Fort'
UNION ALL
SELECT
    'Config coffre-fort' AS table_name,
    COUNT(*) AS count
FROM config_coffre_fort
UNION ALL
SELECT
    'Agents terrain actifs' AS table_name,
    COUNT(*) AS count
FROM agents_terrain WHERE deleted_at IS NULL
UNION ALL
SELECT
    'Caisses agent' AS table_name,
    COUNT(*) AS count
FROM caisses_agent WHERE deleted_at IS NULL
UNION ALL
SELECT
    'Journaux comptables' AS table_name,
    COUNT(*) AS count
FROM journaux_comptables
UNION ALL
SELECT
    'Plan comptable' AS table_name,
    COUNT(*) AS count
FROM plan_comptable
UNION ALL
SELECT
    'Accounting rules' AS table_name,
    COUNT(*) AS count
FROM accounting_rules;

-- ============================================================================
-- 8. VÉRIFICATION DES DONNÉES COHÉRENTES
-- ============================================================================

-- Vérifier que chaque agence a un coffre ET une config
SELECT
    a.code_agence,
    a.nom,
    CASE WHEN c.id IS NOT NULL THEN '✅' ELSE '❌' END AS has_coffre,
    CASE WHEN cf.id IS NOT NULL THEN '✅' ELSE '❌' END AS has_config
FROM agences a
LEFT JOIN caisses c ON c.agence_id = a.id AND c.type = 'Coffre-Fort'
LEFT JOIN config_coffre_fort cf ON cf.agence_id = a.id
ORDER BY a.code_agence;

-- Vérifier que chaque agent actif a une caisse
SELECT
    at.nom || ' ' || at.prenom AS agent_name,
    CASE WHEN ca.id IS NOT NULL THEN '✅' ELSE '❌' END AS has_caisse,
    ca.solde_valide,
    ca.statut
FROM agents_terrain at
LEFT JOIN caisses_agent ca ON ca.agent_id = at.id AND ca.deleted_at IS NULL
WHERE at.deleted_at IS NULL
ORDER BY at.nom, at.prenom;

-- ============================================================================
-- 9. VÉRIFICATION RBAC VERSIONS (Migration 0034)
-- ============================================================================

-- Cette table n'est pas encore implémentée dans le schema TypeScript
-- TODO: Une fois le schema créé, ajouter cette requête:
/*
SELECT
    id,
    version,
    last_change_type,
    last_change_entity,
    updated_at,
    CASE
        WHEN id = 'global' AND version = 1 THEN '✅ OK'
        ELSE '⚠️ VALEURS MODIFIÉES'
    END AS status
FROM rbac_versions
WHERE id = 'global';
*/

-- ============================================================================
-- FIN DES VÉRIFICATIONS
-- ============================================================================

-- Si toutes les requêtes ci-dessus retournent ✅, les seeds sont correctement insérés!
