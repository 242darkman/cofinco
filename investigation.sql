-- DIAGNOSTIC POUR COMPTE 19171f03-7b46-4dbc-b620-d2d4d9ba3e0f

-- 1. Voir détail compte
SELECT * FROM comptes WHERE id = '19171f03-7b46-4dbc-b620-d2d4d9ba3e0f';

-- 2. Voir TOUS les mouvements liés (même non postés)
SELECT id, sens, montant, statut, created_at, source_module 
FROM mouvements_financiers 
WHERE compte_id = '19171f03-7b46-4dbc-b620-d2d4d9ba3e0f'
ORDER BY created_at;

-- 3. Voir s'il y a des movements orphelins (mauvais compte_id ?)
-- Potentiellement difficile sans index fuzzy, on va skipper pour l'instant

-- DIAGNOSTIC POUR CREDIT 0af1934f-c19c-498f-b8c3-25667b64a5ff

-- 1. Détail crédit
SELECT id, montant, taux, solde_restant, statut 
FROM credits 
WHERE id = '0af1934f-c19c-498f-b8c3-25667b64a5ff';

-- 2. Voir remboursements
SELECT id, montant, statut, date_remboursement, mouvement_id
FROM remboursements
WHERE credit_id = '0af1934f-c19c-498f-b8c3-25667b64a5ff';

-- 3. Voir les mouvements correspondants
SELECT mf.id, mf.montant, mf.sens, mf.statut
FROM mouvements_financiers mf
JOIN remboursements r ON r.mouvement_id = mf.id
WHERE r.credit_id = '0af1934f-c19c-498f-b8c3-25667b64a5ff';
