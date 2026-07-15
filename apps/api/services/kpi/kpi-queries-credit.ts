/**
 * KPI Queries — Domaines CRÉDIT et RISQUE.
 *
 * Chaque fonction accepte un exécuteur (`KpiDb`) en dernier paramètre pour
 * s'exécuter dans la transaction REPEATABLE READ du moteur KPI.
 * Par défaut : `db` (compatibilité avec les appels existants, ex. COBAC).
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { agencyFilter, ratioPercent, toNum, type KpiDb } from "./kpi-query-helpers";

interface TotalRow { total: string }
interface EncoursRow { encours_total: string; nombre_actifs: string }
interface DecaissementsRow { montant_total: string; nombre: string }
interface ApprobationRow { approuvees: string; total: string }
interface PanierMoyenRow { panier_moyen: string }
interface RepartitionRow { plan_nom: string; count: string; montant: string; encours: string }
interface AtRiskRow { at_risk: string }
interface TauxRow { taux: string }
interface DefautRow { montant_defaut: string; en_souffrance: string; montant_souffrance: string }
interface RadiationRow { montant_radiation: string }

// =====================
// CREDIT KPIs
// =====================

export async function queryCreditKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  const af = agencyFilter('c', agencyId);

  // Encours total actif + nombre crédits actifs
  const encours = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS encours_total,
      COUNT(*) AS nombre_actifs
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE')
      AND c.deleted_at IS NULL
      ${af}
  `);

  // Décaissements sur la période
  const decaissements = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0), 2) AS montant_total,
      COUNT(*) AS nombre
    FROM credits c
    WHERE c.disbursed_at IS NOT NULL
      AND c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      ${af}
  `);

  // Taux d'approbation (demandes approuvées / total traitées sur la période)
  const approbation = await dbx.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE dc.statut IN ('APPROVED', 'DISBURSED', 'CLOSED')) AS approuvees,
      COUNT(*) FILTER (WHERE dc.statut IN ('APPROVED', 'DISBURSED', 'CLOSED', 'REJECTED', 'DEFINITIVELY_REJECTED')) AS total
    FROM demandes_credit dc
    WHERE dc.created_at >= ${periodStart}
      AND dc.created_at < ${periodEnd}
      AND dc.deleted_at IS NULL
      ${agencyFilter('dc', agencyId)}
  `);

  // Panier moyen
  const panierMoyen = await dbx.execute(sql`
    SELECT ROUND(COALESCE(AVG(CAST(c.montant AS DECIMAL)), 0), 2) AS panier_moyen
    FROM credits c
    WHERE c.disbursed_at IS NOT NULL
      AND c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      ${af}
  `);

  // Répartition par plan
  const repartition = await dbx.execute(sql`
    SELECT
      COALESCE(c.type_credit, 'Non classé') AS plan_nom,
      COUNT(*) AS count,
      ROUND(COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0), 2) AS montant,
      ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS encours
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE')
      AND c.deleted_at IS NULL
      ${af}
    GROUP BY c.type_credit
    ORDER BY encours DESC
  `);

  const row = encours.rows[0] as unknown as EncoursRow | undefined;
  const decRow = decaissements.rows[0] as unknown as DecaissementsRow | undefined;
  const appRow = approbation.rows[0] as unknown as ApprobationRow | undefined;
  const panRow = panierMoyen.rows[0] as unknown as PanierMoyenRow | undefined;

  return {
    encoursTotalActif: toNum(row?.encours_total),
    nombreCreditsActifs: toNum(row?.nombre_actifs),
    decaissementsPeriode: toNum(decRow?.montant_total),
    nombreDecaissements: toNum(decRow?.nombre),
    tauxApprobation: ratioPercent(appRow?.approuvees, appRow?.total),
    panierMoyen: toNum(panRow?.panier_moyen),
    repartitionParPlan: (repartition.rows as unknown as RepartitionRow[]).map(r => ({
      planId: '',
      planNom: r.plan_nom || 'Non classé',
      count: toNum(r.count),
      montant: toNum(r.montant),
      encours: toNum(r.encours),
    })),
  };
}

// =====================
// RISQUE KPIs (PAR30/60/90)
// =====================

export async function queryRisqueKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  const af = agencyFilter('c', agencyId);

  // Encours total du portefeuille actif (dénominateur pour PAR)
  const portfolio = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS total
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE')
      AND c.deleted_at IS NULL
      ${af}
  `);
  const totalPortfolioRaw = (portfolio.rows[0] as unknown as TotalRow | undefined)?.total;
  const totalPortfolio = toNum(totalPortfolioRaw);

  // PAR30, PAR60, PAR90 — encours des crédits ayant au moins une échéance LATE > N jours
  const parQuery = async (days: number): Promise<number> => {
    if (totalPortfolio === 0) return 0;
    const result = await dbx.execute(sql`
      SELECT ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS at_risk
      FROM credits c
      WHERE c.statut IN ('ACTIVE', 'LATE')
        AND c.deleted_at IS NULL
        ${af}
        AND EXISTS (
          SELECT 1 FROM echeances_credits e
          WHERE e.credit_id = c.id
            AND e.statut IN ('LATE', 'PARTIALLY_PAID')
            AND e.date_echeance < NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
        )
    `);
    const atRisk = (result.rows[0] as unknown as AtRiskRow | undefined)?.at_risk;
    return ratioPercent(atRisk, totalPortfolioRaw);
  };

  // Séquentiel : compatible avec une exécution dans une transaction (connexion unique)
  const par30 = await parQuery(30);
  const par60 = await parQuery(60);
  const par90 = await parQuery(90);

  // Taux de recouvrement scopé à la période (fallback : toutes échéances passées)
  const recouvrementQuery = periodStart && periodEnd
    ? sql`
      WITH echeances_dues AS (
        SELECT COALESCE(SUM(CAST(e.montant_total AS DECIMAL)), 0) AS total
        FROM echeances_credits e
        INNER JOIN credits c ON c.id = e.credit_id
        WHERE e.date_echeance >= ${periodStart}
          AND e.date_echeance < ${periodEnd}
          AND e.statut NOT IN ('UPCOMING', 'RESTRUCTURED')
          AND c.deleted_at IS NULL
          ${af}
      ),
      rembourses AS (
        SELECT COALESCE(SUM(CAST(e.montant_paye AS DECIMAL)), 0) AS total
        FROM echeances_credits e
        INNER JOIN credits c ON c.id = e.credit_id
        WHERE e.date_echeance >= ${periodStart}
          AND e.date_echeance < ${periodEnd}
          AND e.statut NOT IN ('UPCOMING', 'RESTRUCTURED')
          AND c.deleted_at IS NULL
          ${af}
      )
      SELECT
        CASE WHEN echeances_dues.total > 0
          THEN ROUND(rembourses.total / echeances_dues.total * 100, 2)
          ELSE 0
        END AS taux
      FROM echeances_dues, rembourses
    `
    : sql`
      WITH echeances_dues AS (
        SELECT COALESCE(SUM(CAST(e.montant_total AS DECIMAL)), 0) AS total
        FROM echeances_credits e
        INNER JOIN credits c ON c.id = e.credit_id
        WHERE e.date_echeance < NOW()
          AND e.statut NOT IN ('UPCOMING', 'RESTRUCTURED')
          AND c.deleted_at IS NULL
          ${af}
      ),
      rembourses AS (
        SELECT COALESCE(SUM(CAST(e.montant_paye AS DECIMAL)), 0) AS total
        FROM echeances_credits e
        INNER JOIN credits c ON c.id = e.credit_id
        WHERE e.date_echeance < NOW()
          AND e.statut NOT IN ('UPCOMING', 'RESTRUCTURED')
          AND c.deleted_at IS NULL
          ${af}
      )
      SELECT
        CASE WHEN echeances_dues.total > 0
          THEN ROUND(rembourses.total / echeances_dues.total * 100, 2)
          ELSE 0
        END AS taux
      FROM echeances_dues, rembourses
    `;

  const recouvrement = await dbx.execute(recouvrementQuery);

  // Taux de défaut + souffrance
  const defaut = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)) FILTER (WHERE c.statut = 'LATE'), 0), 2) AS montant_defaut,
      COUNT(*) FILTER (WHERE c.statut = 'LATE') AS en_souffrance,
      ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)) FILTER (WHERE c.statut = 'LATE'), 0), 2) AS montant_souffrance
    FROM credits c
    WHERE c.deleted_at IS NULL
      ${af}
      AND c.statut IN ('ACTIVE', 'LATE')
  `);

  // Taux de radiation — crédits CLOSED avec solde impayé (written off)
  const radiation = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS montant_radiation
    FROM credits c
    WHERE c.statut = 'CLOSED'
      AND CAST(c.solde_restant AS DECIMAL) > 0
      AND c.deleted_at IS NULL
      ${af}
  `);

  const defRow = defaut.rows[0] as unknown as DefautRow | undefined;
  const radRow = radiation.rows[0] as unknown as RadiationRow | undefined;

  return {
    par30,
    par60,
    par90,
    tauxRecouvrement: toNum((recouvrement.rows[0] as unknown as TauxRow | undefined)?.taux),
    tauxDefaut: ratioPercent(defRow?.montant_defaut, totalPortfolioRaw),
    tauxRadiation: ratioPercent(radRow?.montant_radiation, totalPortfolioRaw),
    creditsEnSouffrance: toNum(defRow?.en_souffrance),
    montantEnSouffrance: toNum(defRow?.montant_souffrance),
  };
}
