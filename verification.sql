-- 1. Divergence solde comptes
WITH soldes_calcules AS (
    SELECT
        compte_id,
        SUM(CASE
            WHEN sens = 'Crédit' THEN montant
            WHEN sens = 'Débit' THEN -montant
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
    c.solde_courant as solde_affiche,
    COALESCE(sc.solde_calcule, 0) as solde_calcule,
    c.solde_courant - COALESCE(sc.solde_calcule, 0) as ecart
FROM comptes c
LEFT JOIN soldes_calcules sc ON c.id = sc.compte_id
WHERE ABS(c.solde_courant - COALESCE(sc.solde_calcule, 0)) > 0.01;

-- 2. Divergence solde crédits
WITH remboursements_total AS (
    SELECT
        credit_id,
        SUM(montant) as total_rembourse
    FROM remboursements
    WHERE statut = 'Posté'
    GROUP BY credit_id
),
credits_avec_interets AS (
    SELECT
        id,
        montant * (1 + taux / 100) as montant_total_du
    FROM credits
    WHERE statut IN ('Actif', 'En retard', 'Soldé')
)
SELECT
    c.id,
    c.numero_credit,
    c.solde_restant as solde_affiche,
    cai.montant_total_du - COALESCE(rt.total_rembourse, 0) as solde_calcule,
    c.solde_restant - (cai.montant_total_du - COALESCE(rt.total_rembourse, 0)) as ecart
FROM credits c
JOIN credits_avec_interets cai ON c.id = cai.id
LEFT JOIN remboursements_total rt ON c.id = rt.credit_id
WHERE ABS(c.solde_restant - (cai.montant_total_du - COALESCE(rt.total_rembourse, 0))) > 0.01;

-- 3. Events bloqués
SELECT * FROM evenements_outbox WHERE published_at IS NULL
AND created_at < NOW() - INTERVAL '5 minutes';

-- 4. Mouvements sans traçabilité
SELECT * FROM mouvements_financiers WHERE created_by IS NULL;
