-- ============================================================
-- VÉRIFICATION COMPTES - ASSET TRACKER
-- Exécuter AVANT déploiement prod
-- Chaque requête DOIT retourner 0 lignes (sauf indication contraire)
-- ============================================================

-- ============================================================
-- SECTION 1: INTÉGRITÉ DES COMPTES
-- ============================================================

-- 1.1 Comptes avec solde négatif (INTERDIT)
SELECT id, numero_compte, type_compte, solde_courant, client_id
FROM comptes
WHERE solde_courant::numeric < 0;
-- Attendu: 0 lignes

-- 1.2 Client avec plusieurs comptes du même type (INTERDIT)
SELECT client_id, type_compte, COUNT(*) as nb_comptes, ARRAY_AGG(id) as compte_ids
FROM comptes
WHERE deleted_at IS NULL
GROUP BY client_id, type_compte
HAVING COUNT(*) > 1;
-- Attendu: 0 lignes

-- 1.3 Comptes sans numéro ou numéro dupliqué
SELECT numero_compte, COUNT(*) as nb
FROM comptes
WHERE deleted_at IS NULL
GROUP BY numero_compte
HAVING COUNT(*) > 1 OR numero_compte IS NULL;
-- Attendu: 0 lignes

-- 1.4 Comptes bloqués sans motif
SELECT id, numero_compte, blocage_actif, blocage_motif
FROM comptes
WHERE blocage_actif = true AND blocage_motif IS NULL;
-- Attendu: 0 lignes

-- 1.5 Comptes avec date blocage incohérente
SELECT id, numero_compte, blocage_debut, blocage_fin
FROM comptes
WHERE blocage_fin IS NOT NULL
  AND blocage_debut IS NOT NULL
  AND blocage_fin < blocage_debut;
-- Attendu: 0 lignes

-- ============================================================
-- SECTION 2: DIVERGENCE SOLDE AFFICHÉ vs CALCULÉ
-- ============================================================

-- 2.1 Divergence solde compte vs somme mouvements (CRITIQUE)
WITH soldes_calcules AS (
    SELECT
        compte_id,
        SUM(CASE
            WHEN sens = 'Crédit' THEN montant::numeric
            WHEN sens = 'Débit' THEN -montant::numeric
            ELSE 0
        END) as solde_calcule
    FROM mouvements_financiers
    WHERE compte_id IS NOT NULL
      AND statut = 'Posté'
    GROUP BY compte_id
)
SELECT
    c.id,
    c.numero_compte,
    c.type_compte,
    c.solde_courant::numeric as solde_affiche,
    COALESCE(sc.solde_calcule, 0) as solde_calcule,
    c.solde_courant::numeric - COALESCE(sc.solde_calcule, 0) as ecart
FROM comptes c
LEFT JOIN soldes_calcules sc ON c.id = sc.compte_id
WHERE c.deleted_at IS NULL
  AND ABS(c.solde_courant::numeric - COALESCE(sc.solde_calcule, 0)) > 0.01;
-- Attendu: 0 lignes - SI DES LIGNES APPARAISSENT = BUG CRITIQUE

-- 2.2 Transactions compte sans mouvement associé (orphelins)
SELECT tc.id, tc.compte_id, tc.montant, tc.type_paiement, tc.created_at
FROM transactions_compte tc
LEFT JOIN mouvements_financiers mf ON tc.mouvement_id = mf.id
WHERE tc.mouvement_id IS NOT NULL
  AND mf.id IS NULL;
-- Attendu: 0 lignes

-- 2.3 Mouvements compte sans transaction associée
SELECT mf.id, mf.reference, mf.compte_id, mf.montant, mf.sens, mf.created_at
FROM mouvements_financiers mf
LEFT JOIN transactions_compte tc ON tc.mouvement_id = mf.id
WHERE mf.compte_id IS NOT NULL
  AND mf.source_module IN ('EPARGNE', 'CAISSE')
  AND mf.statut = 'Posté'
  AND tc.id IS NULL
  AND mf.created_at > NOW() - INTERVAL '7 days';  -- Dernière semaine
-- Attendu: 0 lignes (ou très peu, à investiguer)

-- ============================================================
-- SECTION 3: COHÉRENCE OPÉRATIONS
-- ============================================================

-- 3.1 Mouvements avec montant <= 0 (INTERDIT par contrainte)
SELECT id, reference, montant, sens, source_module
FROM mouvements_financiers
WHERE montant::numeric <= 0;
-- Attendu: 0 lignes

-- 3.2 Mouvements sans sens défini
SELECT id, reference, montant, sens
FROM mouvements_financiers
WHERE sens NOT IN ('Débit', 'Crédit') OR sens IS NULL;
-- Attendu: 0 lignes

-- 3.3 Mouvements sans source_module
SELECT id, reference, montant, created_at
FROM mouvements_financiers
WHERE source_module IS NULL;
-- Attendu: 0 lignes

-- 3.4 Mouvements sans created_by (traçabilité)
SELECT id, reference, montant, source_module, created_at
FROM mouvements_financiers
WHERE created_by IS NULL;
-- Attendu: 0 lignes

-- 3.5 Doublons idempotency_key (CRITIQUE - double facturation)
SELECT idempotency_key, COUNT(*) as nb, ARRAY_AGG(id) as mouvement_ids
FROM mouvements_financiers
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
-- Attendu: 0 lignes - SI DES LIGNES = DOUBLE FACTURATION

-- 3.6 Doublons potentiels (même compte, même montant, même minute)
SELECT
    compte_id,
    montant,
    sens,
    DATE_TRUNC('minute', date_operation) as minute_op,
    COUNT(*) as nb,
    ARRAY_AGG(id) as ids,
    ARRAY_AGG(idempotency_key) as keys
FROM mouvements_financiers
WHERE compte_id IS NOT NULL
  AND statut = 'Posté'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY compte_id, montant, sens, DATE_TRUNC('minute', date_operation)
HAVING COUNT(*) > 1;
-- À analyser manuellement - certains peuvent être légitimes

-- ============================================================
-- SECTION 4: COHÉRENCE TEMPS RÉEL (OUTBOX)
-- ============================================================

-- 4.1 Events bloqués dans l'outbox (> 5 min)
SELECT
    id,
    type,
    aggregate_type,
    aggregate_id,
    tentative,
    erreur,
    created_at,
    EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_bloque
FROM evenements_outbox
WHERE published_at IS NULL
  AND created_at < NOW() - INTERVAL '5 minutes'
ORDER BY created_at ASC;
-- Attendu: 0 lignes - SI DES LIGNES = WebSocket cassé

-- 4.2 Events échoués (5+ tentatives)
SELECT id, type, aggregate_type, tentative, erreur, created_at
FROM evenements_outbox
WHERE tentative >= 5
  AND published_at IS NULL;
-- Attendu: 0 lignes

-- 4.3 Ratio events publiés (santé du système)
SELECT
    DATE(created_at) as jour,
    COUNT(*) FILTER (WHERE published_at IS NOT NULL) as publies,
    COUNT(*) FILTER (WHERE published_at IS NULL) as en_attente,
    ROUND(
        COUNT(*) FILTER (WHERE published_at IS NOT NULL)::numeric /
        NULLIF(COUNT(*), 0) * 100, 2
    ) as taux_succes_pct
FROM evenements_outbox
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY jour DESC;
-- Attendu: taux_succes_pct = 100% chaque jour

-- ============================================================
-- SECTION 5: VÉRIFICATION SESSIONS CAISSE
-- ============================================================

-- 5.1 Sessions avec solde théorique divergent
WITH operations_par_session AS (
    SELECT
        session_caisse_id,
        SUM(CASE
            WHEN sens = 'Crédit' THEN montant::numeric
            WHEN sens = 'Débit' THEN -montant::numeric
            ELSE 0
        END) as delta_operations
    FROM mouvements_financiers
    WHERE session_caisse_id IS NOT NULL
      AND statut = 'Posté'
    GROUP BY session_caisse_id
)
SELECT
    sc.id,
    sc.solde_initial::numeric,
    sc.solde_theorique::numeric as solde_affiche,
    sc.solde_initial::numeric + COALESCE(ops.delta_operations, 0) as solde_calcule,
    sc.solde_theorique::numeric - (sc.solde_initial::numeric + COALESCE(ops.delta_operations, 0)) as ecart
FROM sessions_caisse sc
LEFT JOIN operations_par_session ops ON sc.id = ops.session_caisse_id
WHERE ABS(sc.solde_theorique::numeric - (sc.solde_initial::numeric + COALESCE(ops.delta_operations, 0))) > 0.01;
-- Attendu: 0 lignes

-- 5.2 Sessions ouvertes multiples pour même caissier
SELECT caissier_id, COUNT(*) as nb_sessions, ARRAY_AGG(id) as session_ids
FROM sessions_caisse
WHERE statut = 'Ouverte'
GROUP BY caissier_id
HAVING COUNT(*) > 1;
-- Attendu: 0 lignes (1 session active par caissier max)

-- ============================================================
-- SECTION 6: STATISTIQUES GÉNÉRALES (INFO)
-- ============================================================

-- 6.1 Répartition des comptes par type
SELECT
    type_compte,
    statut,
    COUNT(*) as nb_comptes,
    SUM(solde_courant::numeric) as solde_total
FROM comptes
WHERE deleted_at IS NULL
GROUP BY type_compte, statut
ORDER BY type_compte, statut;

-- 6.2 Opérations des dernières 24h
SELECT
    source_module,
    sens,
    COUNT(*) as nb_operations,
    SUM(montant::numeric) as montant_total
FROM mouvements_financiers
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND statut = 'Posté'
GROUP BY source_module, sens
ORDER BY source_module, sens;

-- 6.3 Top 10 comptes par volume d'opérations (24h)
SELECT
    c.numero_compte,
    c.type_compte,
    COUNT(mf.id) as nb_operations,
    SUM(mf.montant::numeric) as volume_total
FROM comptes c
JOIN mouvements_financiers mf ON mf.compte_id = c.id
WHERE mf.created_at > NOW() - INTERVAL '24 hours'
GROUP BY c.id, c.numero_compte, c.type_compte
ORDER BY nb_operations DESC
LIMIT 10;

-- ============================================================
-- SECTION 7: SCRIPT DE CORRECTION (SI DIVERGENCE DÉTECTÉE)
-- ============================================================

-- ⚠️ NE PAS EXÉCUTER EN PROD SANS BACKUP ⚠️
-- Ce script recalcule et corrige les soldes divergents

/*
-- ÉTAPE 1: Créer une table de sauvegarde
CREATE TABLE comptes_backup_YYYYMMDD AS
SELECT * FROM comptes;

-- ÉTAPE 2: Recalculer et mettre à jour les soldes
WITH soldes_corrects AS (
    SELECT
        compte_id,
        SUM(CASE
            WHEN sens = 'Crédit' THEN montant::numeric
            WHEN sens = 'Débit' THEN -montant::numeric
            ELSE 0
        END) as solde_correct
    FROM mouvements_financiers
    WHERE compte_id IS NOT NULL
      AND statut = 'Posté'
    GROUP BY compte_id
)
UPDATE comptes c
SET
    solde_courant = COALESCE(sc.solde_correct, 0)::text,
    updated_at = NOW()
FROM soldes_corrects sc
WHERE c.id = sc.compte_id
  AND ABS(c.solde_courant::numeric - COALESCE(sc.solde_correct, 0)) > 0.01;

-- ÉTAPE 3: Vérifier la correction
-- Relancer la requête 2.1
*/

-- ============================================================
-- FIN DES VÉRIFICATIONS
-- ============================================================
