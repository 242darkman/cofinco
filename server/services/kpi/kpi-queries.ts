/**
 * KPI Queries — Raw SQL queries for each KPI domain.
 *
 * Each function accepts an optional agencyId filter and a date range.
 * When agencyId is undefined, queries aggregate across ALL agencies (consolidated).
 */
import { db } from "../../db";
import { sql } from "drizzle-orm";

// =====================
// SQL Result Row Interfaces
// =====================

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
interface TontinesInfoRow { actives: string; membres: string }
interface VolumesRow { collectes: string; retires: string }
interface ChargesProduitsRow { charges: string; produits: string; frais_commissions: string }
interface BanqueRow { banque: string }
interface FluxRow { entrants: string; sortants: string }
interface SegmentRow { segment: string; total: string }
interface AgentRow { agent_id: string; nom: string; prenom: string; decaissements: string; montant: string; clients: string }
interface DecPeriodeRow { nombre: string; montant: string }

// =====================
// Helpers
// =====================

function agencyFilter(alias: string, agencyId?: string) {
  return agencyId ? sql`AND ${sql.raw(alias)}.agence_id = ${agencyId}` : sql``;
}

function agencyFilterOwner(alias: string, agencyId?: string) {
  return agencyId ? sql`AND ${sql.raw(alias)}.owner_id = ${agencyId}` : sql``;
}

function num(value: string | number | null | undefined): number {
  const n = Number(value);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// =====================
// CREDIT KPIs
// =====================

export async function queryCreditKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  const af = agencyFilter('c', agencyId);

  // Encours total actif + nombre crédits actifs
  const encours = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS encours_total,
      COUNT(*) AS nombre_actifs
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE')
      AND c.deleted_at IS NULL
      ${af}
  `);

  // Décaissements sur la période
  const decaissements = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0) AS montant_total,
      COUNT(*) AS nombre
    FROM credits c
    WHERE c.disbursed_at IS NOT NULL
      AND c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      ${af}
  `);

  // Taux d'approbation (demandes approuvées / total traitées sur la période)
  const approbation = await db.execute(sql`
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
  const panierMoyen = await db.execute(sql`
    SELECT COALESCE(AVG(CAST(c.montant AS DECIMAL)), 0) AS panier_moyen
    FROM credits c
    WHERE c.disbursed_at IS NOT NULL
      AND c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      ${af}
  `);

  // Répartition par plan
  const repartition = await db.execute(sql`
    SELECT
      COALESCE(c.type_credit, 'Non classé') AS plan_nom,
      COUNT(*) AS count,
      COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0) AS montant,
      COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS encours
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
  const totalTraitees = num(appRow?.total);

  return {
    encoursTotalActif: num(row?.encours_total),
    nombreCreditsActifs: num(row?.nombre_actifs),
    decaissementsPeriode: num(decRow?.montant_total),
    nombreDecaissements: num(decRow?.nombre),
    tauxApprobation: totalTraitees > 0 ? Math.round(num(appRow?.approuvees) / totalTraitees * 10000) / 100 : 0,
    panierMoyen: num(panRow?.panier_moyen),
    repartitionParPlan: (repartition.rows as unknown as RepartitionRow[]).map(r => ({
      planId: '',
      planNom: r.plan_nom || 'Non classé',
      count: num(r.count),
      montant: num(r.montant),
      encours: num(r.encours),
    })),
  };
}

// =====================
// RISQUE KPIs (PAR30/60/90)
// =====================

export async function queryRisqueKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  const af = agencyFilter('c', agencyId);

  // Encours total du portefeuille actif (dénominateur pour PAR)
  const portfolio = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS total
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE')
      AND c.deleted_at IS NULL
      ${af}
  `);
  const totalPortfolio = num((portfolio.rows[0] as unknown as TotalRow | undefined)?.total);

  // PAR30, PAR60, PAR90 — encours des crédits ayant au moins une échéance LATE > N jours
  // FIX: Removed 'DUE' status — only truly late echéances count for PAR
  const parQuery = async (days: number): Promise<number> => {
    if (totalPortfolio === 0) return 0;
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS at_risk
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
    const atRisk = num((result.rows[0] as unknown as AtRiskRow | undefined)?.at_risk);
    return Math.round(atRisk / totalPortfolio * 10000) / 100;
  };

  const [par30, par60, par90] = await Promise.all([parQuery(30), parQuery(60), parQuery(90)]);

  // FIX: Taux de recouvrement scoped to period (not all-time)
  // Uses periodStart/periodEnd when available, otherwise falls back to all past echéances
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

  const recouvrement = await db.execute(recouvrementQuery);

  // Taux de défaut + souffrance
  const defaut = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)) FILTER (WHERE c.statut = 'LATE'), 0) AS montant_defaut,
      COUNT(*) FILTER (WHERE c.statut = 'LATE') AS en_souffrance,
      COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)) FILTER (WHERE c.statut = 'LATE'), 0) AS montant_souffrance
    FROM credits c
    WHERE c.deleted_at IS NULL
      ${af}
      AND c.statut IN ('ACTIVE', 'LATE')
  `);

  // FIX: Taux de radiation — crédits CLOSED with unpaid balance (written off)
  const radiation = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS montant_radiation
    FROM credits c
    WHERE c.statut = 'CLOSED'
      AND CAST(c.solde_restant AS DECIMAL) > 0
      AND c.deleted_at IS NULL
      ${af}
  `);

  const defRow = defaut.rows[0] as unknown as DefautRow | undefined;
  const radRow = radiation.rows[0] as unknown as RadiationRow | undefined;
  const totalActifEtDefaut = totalPortfolio;

  return {
    par30,
    par60,
    par90,
    tauxRecouvrement: num((recouvrement.rows[0] as unknown as TauxRow | undefined)?.taux),
    tauxDefaut: totalActifEtDefaut > 0 ? Math.round(num(defRow?.montant_defaut) / totalActifEtDefaut * 10000) / 100 : 0,
    tauxRadiation: totalActifEtDefaut > 0 ? Math.round(num(radRow?.montant_radiation) / totalActifEtDefaut * 10000) / 100 : 0,
    creditsEnSouffrance: num(defRow?.en_souffrance),
    montantEnSouffrance: num(defRow?.montant_souffrance),
  };
}

// =====================
// TONTINES & ÉPARGNE KPIs
// =====================

export async function queryTontinesEpargneKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  const [epargne, comptesCourants, tontinesInfo, volumes, cotisations] = await Promise.all([
    // Encours épargne
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(c.solde_courant AS DECIMAL)), 0) AS total
      FROM comptes c
      WHERE c.type_compte = 'SAVINGS'
        AND c.statut = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    // Encours comptes courants
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(c.solde_courant AS DECIMAL)), 0) AS total
      FROM comptes c
      WHERE c.type_compte = 'CURRENT'
        AND c.statut = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    // Tontines actives + membres
    db.execute(sql`
      SELECT
        COUNT(*) AS actives,
        COALESCE(SUM(t.membres_actuels), 0) AS membres
      FROM tontines t
      WHERE t.statut = 'ACTIVE'
        AND t.deleted_at IS NULL
        ${agencyFilter('t', agencyId)}
    `),
    // Volumes collectés (all versements) et retirés (all retraits) sur la période
    db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(ct.montant AS DECIMAL)) FILTER (WHERE ct.type_operation = 'Versement'), 0) AS collectes,
        COALESCE(SUM(CAST(ct.montant AS DECIMAL)) FILTER (WHERE ct.type_operation = 'Retrait'), 0) AS retires
      FROM contributions_tontine ct
      WHERE ct.statut_transaction = 'POSTED'
        AND ct.created_at >= ${periodStart}
        AND ct.created_at < ${periodEnd}
        AND ct.deleted_at IS NULL
        ${agencyFilter('ct', agencyId)}
    `),
    // FIX: Cotisations tontines = montant nominal attendu par cycle (distinct from total versements)
    // montant_cotisation × membres_actuels = cotisation totale attendue par tour
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(t.montant_cotisation AS DECIMAL) * t.membres_actuels), 0) AS total
      FROM tontines t
      WHERE t.statut = 'ACTIVE'
        AND t.deleted_at IS NULL
        ${agencyFilter('t', agencyId)}
    `),
  ]);

  return {
    encoursEpargne: num((epargne.rows[0] as unknown as TotalRow | undefined)?.total),
    encoursComptesCourants: num((comptesCourants.rows[0] as unknown as TotalRow | undefined)?.total),
    tontinesActives: num((tontinesInfo.rows[0] as unknown as TontinesInfoRow | undefined)?.actives),
    membresTontines: num((tontinesInfo.rows[0] as unknown as TontinesInfoRow | undefined)?.membres),
    volumesCollectes: num((volumes.rows[0] as unknown as VolumesRow | undefined)?.collectes),
    volumesRetires: num((volumes.rows[0] as unknown as VolumesRow | undefined)?.retires),
    cotisationsTontines: num((cotisations.rows[0] as unknown as TotalRow | undefined)?.total),
  };
}

// =====================
// RENTABILITÉ KPIs
// =====================

export async function queryRentabiliteKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  const [interets, revenusTontines, chargesProduits] = await Promise.all([
    // Intérêts perçus (via allocations on posted remboursements)
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(re.allocated_interest AS DECIMAL)), 0) AS total
      FROM remboursement_echeances re
      INNER JOIN remboursements r ON r.id = re.remboursement_id
      INNER JOIN credits c ON c.id = r.credit_id
      WHERE r.statut = 'POSTED'
        AND r.date_remboursement >= ${periodStart}
        AND r.date_remboursement < ${periodEnd}
        AND re.reversed_at IS NULL
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    // Revenus tontines (cotisations × taux plateforme)
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(ct.montant AS DECIMAL) * COALESCE(CAST(t.taux_plateforme AS DECIMAL), 0) / 100), 0) AS total
      FROM contributions_tontine ct
      INNER JOIN tontines t ON t.id = ct.tontine_id
      WHERE ct.statut_transaction = 'POSTED'
        AND ct.type_operation = 'Versement'
        AND ct.created_at >= ${periodStart}
        AND ct.created_at < ${periodEnd}
        AND ct.deleted_at IS NULL
        ${agencyFilter('ct', agencyId)}
    `),
    // FIX: Use GL as source of truth for charges (class 6) and total revenue (class 7)
    // Also extract frais/commissions (class 70) as a sub-breakdown
    db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '6%'), 0)
        - COALESCE(SUM(CAST(le.credit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '6%'), 0) AS charges,
        COALESCE(SUM(CAST(le.credit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '7%'), 0)
        - COALESCE(SUM(CAST(le.debit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '7%'), 0) AS produits,
        COALESCE(SUM(CAST(le.credit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '70%'), 0)
        - COALESCE(SUM(CAST(le.debit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '70%'), 0) AS frais_commissions
      FROM lignes_ecritures le
      INNER JOIN ecritures_comptables ec ON ec.id = le.ecriture_id
      WHERE ec.statut = 'POSTED'
        AND ec.date_ecriture >= ${periodStart}
        AND ec.date_ecriture < ${periodEnd}
        ${agencyFilter('ec', agencyId)}
    `),
  ]);

  const interetsVal = num((interets.rows[0] as unknown as TotalRow | undefined)?.total);
  const cpRow = chargesProduits.rows[0] as unknown as ChargesProduitsRow | undefined;
  const fraisVal = num(cpRow?.frais_commissions);
  const revTontinesVal = num((revenusTontines.rows[0] as unknown as TotalRow | undefined)?.total);
  const chargesVal = num(cpRow?.charges);
  const glProduits = num(cpRow?.produits);

  // FIX: Use GL class 7 total as authoritative totalRevenus (includes all revenue classes 70-79)
  // Fall back to component sum if GL has no entries yet
  const totalRevenus = glProduits > 0 ? glProduits : (interetsVal + fraisVal + revTontinesVal);
  const resultatNet = totalRevenus - chargesVal;

  // Encours pour ratio
  const encours = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS total
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE') AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const encoursVal = num((encours.rows[0] as unknown as TotalRow | undefined)?.total);

  return {
    interetsPercus: interetsVal,
    fraisCommissions: fraisVal,
    revenusTontines: revTontinesVal,
    totalRevenus,
    charges: chargesVal,
    resultatNet,
    ratioChargesEncours: encoursVal > 0 ? Math.round(chargesVal / encoursVal * 10000) / 100 : 0,
  };
}

// =====================
// TRÉSORERIE KPIs
// =====================

export async function queryTresorerieKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  const [caisses, coffres, flux, ecarts] = await Promise.all([
    // Solde caisses physiques ouvertes (exclut les caisses digitales mobile money)
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(c.solde AS DECIMAL)), 0) AS total
      FROM caisses c
      WHERE c.statut = 'OPEN'
        AND (c.type = 'PHYSICAL' OR c.type IS NULL)
        ${agencyFilter('c', agencyId)}
    `),
    // Solde coffres actifs
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(cf.solde AS DECIMAL)), 0) AS total
      FROM coffres_forts cf
      WHERE cf.statut = 'ACTIVE'
        ${agencyFilterOwner('cf', agencyId)}
    `),
    // Flux entrants et sortants sur la période
    db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(m.montant AS DECIMAL)) FILTER (WHERE m.sens = 'CREDIT'), 0) AS entrants,
        COALESCE(SUM(CAST(m.montant AS DECIMAL)) FILTER (WHERE m.sens = 'DEBIT'), 0) AS sortants
      FROM mouvements_financiers m
      WHERE m.statut = 'POSTED'
        AND m.date_operation >= ${periodStart}
        AND m.date_operation < ${periodEnd}
        ${agencyFilter('m', agencyId)}
    `),
    // Écarts caisses sur la période
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(adc.total_ecarts AS DECIMAL)), 0) AS total
      FROM agency_daily_closure adc
      WHERE adc.date_cloture >= ${periodStart}
        AND adc.date_cloture < ${periodEnd}
        ${agencyFilter('adc', agencyId)}
    `),
  ]);

  // Solde banque (comptes GL 512xxx)
  const glBanque = await db.execute(sql`
    SELECT
      COALESCE(SUM(CAST(le.debit AS DECIMAL) - CAST(le.credit AS DECIMAL)), 0) AS banque
    FROM lignes_ecritures le
    INNER JOIN ecritures_comptables ec ON ec.id = le.ecriture_id
    WHERE le.numero_compte LIKE '512%'
      AND ec.statut = 'POSTED'
      ${agencyFilter('ec', agencyId)}
  `);

  // Solde Mobile Money — from digital caisses (DIGITAL_MM_MTN + DIGITAL_MM_AIRTEL)
  // Source of truth: caisses digitales mises à jour en temps réel via les callbacks PawaPay
  const mmCaisses = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(c.solde AS DECIMAL)), 0) AS total
    FROM caisses c
    WHERE c.type IN ('DIGITAL_MM_MTN', 'DIGITAL_MM_AIRTEL')
      ${agencyFilter('c', agencyId)}
  `);

  const soldeCaisses = num((caisses.rows[0] as unknown as TotalRow | undefined)?.total);
  const soldeCoffres = num((coffres.rows[0] as unknown as TotalRow | undefined)?.total);
  const soldeBanque = num((glBanque.rows[0] as unknown as BanqueRow | undefined)?.banque);
  const soldeMM = num((mmCaisses.rows[0] as unknown as TotalRow | undefined)?.total);
  const totalLiquidite = soldeCaisses + soldeCoffres + soldeBanque + soldeMM;

  // FIX: Ratio de liquidité = Liquidités / Dépôts clients (pas encours crédit)
  // Standard microfinance: mesure la capacité à servir les retraits des épargnants
  const deposits = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(c.solde_courant AS DECIMAL)), 0) AS total
    FROM comptes c
    WHERE c.statut = 'ACTIVE'
      AND c.type_compte IN ('SAVINGS', 'CURRENT')
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const totalDeposits = num((deposits.rows[0] as unknown as TotalRow | undefined)?.total);
  const fluxRow = flux.rows[0] as unknown as FluxRow | undefined;

  return {
    soldeCaisses,
    soldeCoffres,
    soldeBanque,
    soldeMobileMoney: soldeMM,
    fluxEntrants: num(fluxRow?.entrants),
    fluxSortants: num(fluxRow?.sortants),
    ratioLiquidite: totalDeposits > 0 ? Math.round(totalLiquidite / totalDeposits * 10000) / 100 : 0,
    ecartsCaisses: num((ecarts.rows[0] as unknown as TotalRow | undefined)?.total),
  };
}

// =====================
// CLIENTS KPIs
// =====================

export async function queryClientsKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  const [actifs, nouveaux, segments] = await Promise.all([
    // Total clients actifs
    db.execute(sql`
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE u.statut = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    // Nouveaux clients sur la période
    db.execute(sql`
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.created_at >= ${periodStart}
        AND c.created_at < ${periodEnd}
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    // Par segment
    db.execute(sql`
      SELECT
        COALESCE(c.segment, 'Standard') AS segment,
        COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE u.statut = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
      GROUP BY c.segment
    `),
  ]);

  // Taux de rétention : clients actifs en début de période qui sont encore actifs
  const retention = await db.execute(sql`
    WITH debut AS (
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.created_at < ${periodStart}
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    ),
    retenus AS (
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE c.created_at < ${periodStart}
        AND u.statut = 'ACTIVE'
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    )
    SELECT CASE WHEN debut.total > 0 THEN ROUND(retenus.total::numeric / debut.total * 100, 2) ELSE 0 END AS taux
    FROM debut, retenus
  `);

  const segmentMap: Record<string, number> = {};
  for (const row of segments.rows as unknown as SegmentRow[]) {
    segmentMap[row.segment || 'Standard'] = num(row.total);
  }

  return {
    totalClientsActifs: num((actifs.rows[0] as unknown as TotalRow | undefined)?.total),
    nouveauxClients: num((nouveaux.rows[0] as unknown as TotalRow | undefined)?.total),
    clientsParSegment: segmentMap,
    tauxRetention: num((retention.rows[0] as unknown as TauxRow | undefined)?.taux),
  };
}

// =====================
// RH & PRODUCTIVITÉ KPIs
// =====================

export async function queryRhProductiviteKpis(agencyId?: string, periodStart?: Date, periodEnd?: Date) {
  // Agents actifs (employés avec statut ACTIVE)
  const agents = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM employes e
    WHERE e.statut = 'ACTIVE'
      ${agencyFilter('e', agencyId)}
  `);
  const agentsActifs = num((agents.rows[0] as unknown as TotalRow | undefined)?.total);

  // Clients actifs, encours, et nombre de décaissements pour ratios par agent
  const [clientsTotal, encoursTotal, decPeriode] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*) AS total
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id
      WHERE u.statut = 'ACTIVE' AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0) AS total
      FROM credits c
      WHERE c.statut IN ('ACTIVE', 'LATE') AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
    // FIX: Query both COUNT and SUM separately for proper per-agent ratios
    db.execute(sql`
      SELECT
        COUNT(*) AS nombre,
        COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0) AS montant
      FROM credits c
      WHERE c.disbursed_at >= ${periodStart}
        AND c.disbursed_at < ${periodEnd}
        AND c.deleted_at IS NULL
        ${agencyFilter('c', agencyId)}
    `),
  ]);
  const cTotal = num((clientsTotal.rows[0] as unknown as TotalRow | undefined)?.total);
  const eTotal = num((encoursTotal.rows[0] as unknown as TotalRow | undefined)?.total);
  const decNombre = num((decPeriode.rows[0] as unknown as DecPeriodeRow | undefined)?.nombre);

  // FIX: Top agents — separate query with LIMIT 5 DESC
  const topQuery = await db.execute(sql`
    SELECT
      c.disbursed_by AS agent_id,
      u.nom, u.prenom,
      COUNT(*) AS decaissements,
      COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0) AS montant,
      COUNT(DISTINCT c.client_id) AS clients
    FROM credits c
    INNER JOIN users u ON u.id = c.disbursed_by
    WHERE c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      AND c.disbursed_by IS NOT NULL
      ${agencyFilter('c', agencyId)}
    GROUP BY c.disbursed_by, u.nom, u.prenom
    ORDER BY montant DESC
    LIMIT 5
  `);

  // FIX: Bottom agents — separate query with ASC order, excluding agents already in top
  const bottomQuery = await db.execute(sql`
    SELECT
      c.disbursed_by AS agent_id,
      u.nom, u.prenom,
      COUNT(*) AS decaissements,
      COALESCE(SUM(CAST(c.montant AS DECIMAL)), 0) AS montant,
      COUNT(DISTINCT c.client_id) AS clients
    FROM credits c
    INNER JOIN users u ON u.id = c.disbursed_by
    WHERE c.disbursed_at >= ${periodStart}
      AND c.disbursed_at < ${periodEnd}
      AND c.deleted_at IS NULL
      AND c.disbursed_by IS NOT NULL
      ${agencyFilter('c', agencyId)}
    GROUP BY c.disbursed_by, u.nom, u.prenom
    ORDER BY montant ASC
    LIMIT 5
  `);

  const mapAgentRow = (r: AgentRow) => ({
    id: r.agent_id,
    nom: r.nom,
    prenom: r.prenom,
    decaissements: num(r.decaissements),
    montant: num(r.montant),
    clients: num(r.clients),
  });

  const topAgents = (topQuery.rows as unknown as AgentRow[]).map(mapAgentRow);
  const bottomAgents = (bottomQuery.rows as unknown as AgentRow[]).map(mapAgentRow);

  // Masse salariale
  const salaires = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(bp.salaire_net AS DECIMAL)), 0) AS total
    FROM bulletins_paie bp
    INNER JOIN employes e ON e.id = bp.employe_id
    WHERE bp.mois = ${periodStart ? `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}` : ''}
      AND bp.statut IN ('VALIDATED', 'PAID')
      AND (bp.cancelled IS NULL OR bp.cancelled = false)
      ${agencyFilter('e', agencyId)}
  `);

  return {
    agentsActifs,
    clientsParAgent: agentsActifs > 0 ? Math.round(cTotal / agentsActifs * 100) / 100 : 0,
    encoursParAgent: agentsActifs > 0 ? Math.round(eTotal / agentsActifs * 100) / 100 : 0,
    // FIX: decaissementsParAgent now uses COUNT (number of credits) not SUM (amount)
    decaissementsParAgent: agentsActifs > 0 ? Math.round(decNombre / agentsActifs * 100) / 100 : 0,
    topAgents,
    bottomAgents,
    masseSalariale: num((salaires.rows[0] as unknown as TotalRow | undefined)?.total),
  };
}
