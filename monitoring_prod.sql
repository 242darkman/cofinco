-- ============================================================================
-- MONITORING PROD - COFINCO
-- Auteur: QA/SRE Team
-- Description: Requêtes de contrôle d'intégrité et détection d'anomalies
-- ============================================================================

-- 1. DÉTECTION DES ÉCARTS DE SOLDE (Ledger vs Comptes)
-- Vérifie si la somme des transactions correspond au solde actuel
WITH SoldeCalcule AS (
    SELECT 
        "compteId",
        SUM(CASE 
            WHEN sens = 'Crédit' THEN CAST(montant AS NUMERIC) 
            WHEN sens = 'Débit' THEN -CAST(montant AS NUMERIC)
            ELSE 0 
        END) as solde_theorique
    FROM mouvements_financiers
    WHERE "compteId" IS NOT NULL
    GROUP BY "compteId"
)
SELECT 
    c.id, 
    c."numeroCompte", 
    c."soldeCourant" as solde_actuel,
    COALESCE(s.solde_theorique, 0) as solde_ledger,
    (CAST(c."soldeCourant" AS NUMERIC) - COALESCE(s.solde_theorique, 0)) as ecart
FROM comptes c
LEFT JOIN SoldeCalcule s ON c.id = s."compteId"
WHERE ABS(CAST(c."soldeCourant" AS NUMERIC) - COALESCE(s.solde_theorique, 0)) > 1; -- Tolérance 1FCFA

-- 2. TRANSACTIONS SANS ÉVÉNEMENT OUTBOX (Zombies)
-- Transactions créées depuis plus de 5 minutes mais sans trace dans l'outbox
-- Indique un échec potentiel du publishing ou un rollback partiel (si pas transactionnel)
SELECT m.id, m.reference, m."createdAt"
FROM mouvements_financiers m
LEFT JOIN evenements_outbox e ON (e.payload->>'mouvementId') = m.id::text
WHERE m."createdAt" < NOW() - INTERVAL '5 minutes'
AND e.id IS NULL;

-- 3. DOUBLONS POTENTIELS (Même montant, même client, même type, < 2 min)
-- Détecte les double-clics qui auraient contourné l'idempotency key
SELECT 
    m1.id as mouvement_1, 
    m2.id as mouvement_2, 
    m1.montant, 
    m1."clientId",
    m1."createdAt"
FROM mouvements_financiers m1
JOIN mouvements_financiers m2 ON m1."clientId" = m2."clientId" 
    AND m1.montant = m2.montant 
    AND m1."typePaiement" = m2."typePaiement"
    AND m1.id < m2.id -- Évite doublons miroirs
WHERE m2."createdAt" BETWEEN m1."createdAt" AND m1."createdAt" + INTERVAL '2 minutes';

-- 4. ÉCARTS CAISSE (Sessions Fermées)
-- Liste les sessions avec écarts non justifiés significatifs (> 1000 FCFA)
SELECT 
    s.id,
    u.nom || ' ' || u.prenom as caissier,
    s."dateOuverture",
    s."dateFermeture",
    s."soldeTheorique",
    s."soldeReel",
    s.ecart
FROM sessions_caisse s
LEFT JOIN users u ON s."caissierId" = u.id
WHERE s.statut = 'Fermée'
AND ABS(CAST(s.ecart AS NUMERIC)) > 1000
ORDER BY s."dateFermeture" DESC;

-- 5. SURVEILLANCE TONTINE (Manque de Mouvement Financier)
-- Détecte les contributions tontine sans mouvement financier associé (Faille Critique Audit)
-- Note: Ce test échouera tant que le refactor Tontine n'est pas fait (ce qui est attendu pour l'instant)
SELECT 
    ct.id as contribution_id, 
    ct."tontineId", 
    ct.montant, 
    ct."createdAt"
FROM contributions_tontine ct
-- En théorie on devrait avoir un lien ID, s'il n'existe pas, c'est dur de joindre.
-- Cette requête sert d'indicateur pour le futur refactor.
WHERE NOT EXISTS (
    SELECT 1 FROM mouvements_financiers mf 
    WHERE mf."tontineId" = ct."tontineId" 
    AND mf.montant = ct.montant
    AND mf."createdAt" BETWEEN ct."createdAt" - INTERVAL '1 second' AND ct."createdAt" + INTERVAL '1 second'
);
