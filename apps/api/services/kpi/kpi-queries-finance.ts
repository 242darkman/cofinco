/**
 * KPI Queries — Domaines TONTINES & ÉPARGNE, RENTABILITÉ et TRÉSORERIE.
 *
 * Chaque fonction accepte un exécuteur (`KpiDb`) pour s'exécuter dans la
 * transaction REPEATABLE READ du moteur KPI. Les requêtes sont séquentielles
 * (connexion unique en transaction) et les montants sont arrondis en SQL.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { D, Decimal } from "../../lib/money";
import {
  agencyFilter,
  agencyFilterOwner,
  ratioPercent,
  subNum,
  toNum,
  type KpiDb,
} from "./kpi-query-helpers";

interface TotalRow { total: string }
interface TontinesInfoRow { actives: string; membres: string }
interface VolumesRow { collectes: string; retires: string }
interface ChargesProduitsRow { charges: string; produits: string; frais_commissions: string }
interface BanqueRow { banque: string }
interface FluxRow { entrants: string; sortants: string }

// =====================
// TONTINES & ÉPARGNE KPIs
// =====================

export async function queryTontinesEpargneKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  // Encours épargne
  const epargne = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_courant AS DECIMAL)), 0), 2) AS total
    FROM comptes c
    WHERE c.type_compte = 'SAVINGS'
      AND c.statut = 'ACTIVE'
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);

  // Encours comptes courants
  const comptesCourants = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_courant AS DECIMAL)), 0), 2) AS total
    FROM comptes c
    WHERE c.type_compte = 'CURRENT'
      AND c.statut = 'ACTIVE'
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);

  // Tontines actives + membres
  const tontinesInfo = await dbx.execute(sql`
    SELECT
      COUNT(*) AS actives,
      COALESCE(SUM(t.membres_actuels), 0) AS membres
    FROM tontines t
    WHERE t.statut = 'ACTIVE'
      AND t.deleted_at IS NULL
      ${agencyFilter('t', agencyId)}
  `);

  // Volumes collectés et retirés sur la période
  const volumes = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(ct.montant AS DECIMAL)) FILTER (WHERE ct.type_operation = 'Versement'), 0), 2) AS collectes,
      ROUND(COALESCE(SUM(CAST(ct.montant AS DECIMAL)) FILTER (WHERE ct.type_operation = 'Retrait'), 0), 2) AS retires
    FROM contributions_tontine ct
    WHERE ct.statut_transaction = 'POSTED'
      AND ct.created_at >= ${periodStart}
      AND ct.created_at < ${periodEnd}
      AND ct.deleted_at IS NULL
      ${agencyFilter('ct', agencyId)}
  `);

  // Cotisations tontines = montant nominal attendu par cycle
  const cotisations = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(t.montant_cotisation AS DECIMAL) * t.membres_actuels), 0), 2) AS total
    FROM tontines t
    WHERE t.statut = 'ACTIVE'
      AND t.deleted_at IS NULL
      ${agencyFilter('t', agencyId)}
  `);

  return {
    encoursEpargne: toNum((epargne.rows[0] as unknown as TotalRow | undefined)?.total),
    encoursComptesCourants: toNum((comptesCourants.rows[0] as unknown as TotalRow | undefined)?.total),
    tontinesActives: toNum((tontinesInfo.rows[0] as unknown as TontinesInfoRow | undefined)?.actives),
    membresTontines: toNum((tontinesInfo.rows[0] as unknown as TontinesInfoRow | undefined)?.membres),
    volumesCollectes: toNum((volumes.rows[0] as unknown as VolumesRow | undefined)?.collectes),
    volumesRetires: toNum((volumes.rows[0] as unknown as VolumesRow | undefined)?.retires),
    cotisationsTontines: toNum((cotisations.rows[0] as unknown as TotalRow | undefined)?.total),
  };
}

// =====================
// RENTABILITÉ KPIs
// =====================

export async function queryRentabiliteKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  // Intérêts perçus (via allocations sur remboursements POSTED)
  const interets = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(re.allocated_interest AS DECIMAL)), 0), 2) AS total
    FROM remboursement_echeances re
    INNER JOIN remboursements r ON r.id = re.remboursement_id
    INNER JOIN credits c ON c.id = r.credit_id
    WHERE r.statut = 'POSTED'
      AND r.date_remboursement >= ${periodStart}
      AND r.date_remboursement < ${periodEnd}
      AND re.reversed_at IS NULL
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);

  // Revenus tontines (cotisations × taux plateforme)
  const revenusTontines = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(ct.montant AS DECIMAL) * COALESCE(CAST(t.taux_plateforme AS DECIMAL), 0) / 100), 0), 2) AS total
    FROM contributions_tontine ct
    INNER JOIN tontines t ON t.id = ct.tontine_id
    WHERE ct.statut_transaction = 'POSTED'
      AND ct.type_operation = 'Versement'
      AND ct.created_at >= ${periodStart}
      AND ct.created_at < ${periodEnd}
      AND ct.deleted_at IS NULL
      ${agencyFilter('ct', agencyId)}
  `);

  // GL = source de vérité pour charges (classe 6) et revenus (classe 7)
  const chargesProduits = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(le.debit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '6%'), 0)
      - COALESCE(SUM(CAST(le.credit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '6%'), 0), 2) AS charges,
      ROUND(COALESCE(SUM(CAST(le.credit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '7%'), 0)
      - COALESCE(SUM(CAST(le.debit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '7%'), 0), 2) AS produits,
      ROUND(COALESCE(SUM(CAST(le.credit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '70%'), 0)
      - COALESCE(SUM(CAST(le.debit AS DECIMAL)) FILTER (WHERE le.numero_compte LIKE '70%'), 0), 2) AS frais_commissions
    FROM lignes_ecritures le
    INNER JOIN ecritures_comptables ec ON ec.id = le.ecriture_id
    WHERE ec.statut = 'POSTED'
      AND ec.date_ecriture >= ${periodStart}
      AND ec.date_ecriture < ${periodEnd}
      ${agencyFilter('ec', agencyId)}
  `);

  const cpRow = chargesProduits.rows[0] as unknown as ChargesProduitsRow | undefined;
  const interetsVal = D((interets.rows[0] as unknown as TotalRow | undefined)?.total ?? 0);
  const revTontinesVal = D((revenusTontines.rows[0] as unknown as TotalRow | undefined)?.total ?? 0);
  const fraisVal = D(cpRow?.frais_commissions ?? 0);
  const chargesVal = D(cpRow?.charges ?? 0);
  const glProduits = D(cpRow?.produits ?? 0);

  // GL classe 7 = totalRevenus faisant autorité ; fallback somme des composantes
  const totalRevenus = glProduits.gt(0)
    ? glProduits
    : interetsVal.plus(fraisVal).plus(revTontinesVal);

  // Encours pour ratio charges/encours
  const encours = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_restant AS DECIMAL)), 0), 2) AS total
    FROM credits c
    WHERE c.statut IN ('ACTIVE', 'LATE') AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const encoursRaw = (encours.rows[0] as unknown as TotalRow | undefined)?.total;

  return {
    interetsPercus: interetsVal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    fraisCommissions: fraisVal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    revenusTontines: revTontinesVal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    totalRevenus: totalRevenus.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    charges: chargesVal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    resultatNet: totalRevenus.minus(chargesVal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    ratioChargesEncours: ratioPercent(cpRow?.charges, encoursRaw),
  };
}

// =====================
// TRÉSORERIE KPIs
// =====================

export async function queryTresorerieKpis(
  agencyId?: string,
  periodStart?: Date,
  periodEnd?: Date,
  dbx: KpiDb = db,
) {
  // Solde caisses physiques ouvertes (exclut les caisses digitales mobile money)
  const caisses = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde AS DECIMAL)), 0), 2) AS total
    FROM caisses c
    WHERE c.statut = 'OPEN'
      AND (c.type = 'PHYSICAL' OR c.type IS NULL)
      ${agencyFilter('c', agencyId)}
  `);

  // Solde coffres actifs
  const coffres = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(cf.solde AS DECIMAL)), 0), 2) AS total
    FROM coffres_forts cf
    WHERE cf.statut = 'ACTIVE'
      ${agencyFilterOwner('cf', agencyId)}
  `);

  // Flux entrants et sortants sur la période
  const flux = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(m.montant AS DECIMAL)) FILTER (WHERE m.sens = 'CREDIT'), 0), 2) AS entrants,
      ROUND(COALESCE(SUM(CAST(m.montant AS DECIMAL)) FILTER (WHERE m.sens = 'DEBIT'), 0), 2) AS sortants
    FROM mouvements_financiers m
    WHERE m.statut = 'POSTED'
      AND m.date_operation >= ${periodStart}
      AND m.date_operation < ${periodEnd}
      ${agencyFilter('m', agencyId)}
  `);

  // Écarts caisses sur la période
  const ecarts = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(adc.total_ecarts AS DECIMAL)), 0), 2) AS total
    FROM agency_daily_closure adc
    WHERE adc.date_cloture >= ${periodStart}
      AND adc.date_cloture < ${periodEnd}
      ${agencyFilter('adc', agencyId)}
  `);

  // Solde banque (comptes GL 512xxx)
  const glBanque = await dbx.execute(sql`
    SELECT
      ROUND(COALESCE(SUM(CAST(le.debit AS DECIMAL) - CAST(le.credit AS DECIMAL)), 0), 2) AS banque
    FROM lignes_ecritures le
    INNER JOIN ecritures_comptables ec ON ec.id = le.ecriture_id
    WHERE le.numero_compte LIKE '512%'
      AND ec.statut = 'POSTED'
      ${agencyFilter('ec', agencyId)}
  `);

  // Solde Mobile Money — caisses digitales (DIGITAL_MM_MTN + DIGITAL_MM_AIRTEL)
  const mmCaisses = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde AS DECIMAL)), 0), 2) AS total
    FROM caisses c
    WHERE c.type IN ('DIGITAL_MM_MTN', 'DIGITAL_MM_AIRTEL')
      ${agencyFilter('c', agencyId)}
  `);

  const soldeCaisses = D((caisses.rows[0] as unknown as TotalRow | undefined)?.total ?? 0);
  const soldeCoffres = D((coffres.rows[0] as unknown as TotalRow | undefined)?.total ?? 0);
  const soldeBanque = D((glBanque.rows[0] as unknown as BanqueRow | undefined)?.banque ?? 0);
  const soldeMM = D((mmCaisses.rows[0] as unknown as TotalRow | undefined)?.total ?? 0);
  const totalLiquidite = soldeCaisses.plus(soldeCoffres).plus(soldeBanque).plus(soldeMM);

  // Ratio de liquidité = Liquidités / Dépôts clients
  const deposits = await dbx.execute(sql`
    SELECT ROUND(COALESCE(SUM(CAST(c.solde_courant AS DECIMAL)), 0), 2) AS total
    FROM comptes c
    WHERE c.statut = 'ACTIVE'
      AND c.type_compte IN ('SAVINGS', 'CURRENT')
      AND c.deleted_at IS NULL
      ${agencyFilter('c', agencyId)}
  `);
  const totalDeposits = (deposits.rows[0] as unknown as TotalRow | undefined)?.total;
  const fluxRow = flux.rows[0] as unknown as FluxRow | undefined;

  return {
    soldeCaisses: soldeCaisses.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    soldeCoffres: soldeCoffres.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    soldeBanque: soldeBanque.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    soldeMobileMoney: soldeMM.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    fluxEntrants: toNum(fluxRow?.entrants),
    fluxSortants: toNum(fluxRow?.sortants),
    ratioLiquidite: ratioPercent(totalLiquidite.toString(), totalDeposits),
    ecartsCaisses: toNum((ecarts.rows[0] as unknown as TotalRow | undefined)?.total),
  };
}
