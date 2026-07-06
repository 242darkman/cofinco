/**
 * COBAC Prudential Ratios Service
 *
 * Calculates and stores COBAC-mandated prudential ratios:
 * ROE, ROA, Solvency, Liquidity, Operating Coefficient, PAR.
 * Compares against regulatory thresholds for alerts.
 */

import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { ratiosPrudentiels, cobacSeuils } from "@shared/schema";
import { generateBilan, generateCompteResultat } from "./gl-reporting-service";
import { queryRisqueKpis } from "./kpi/kpi-queries";
import { createLogger } from "../lib/logger";

const logger = createLogger('CobacRatios');

// ============================================================================
// TYPES
// ============================================================================

export interface CobacAlert {
  ratio: string;
  value: number;
  threshold: number;
  status: 'OK' | 'WARNING' | 'BREACH';
}

export interface CobacRatioResult {
  agenceId: string;
  periodeDate: string;
  ratios: {
    roe: number;
    roa: number;
    ratioSolvabilite: number;
    ratioLiquidite: number;
    coeffExploitation: number;
    par30: number;
    par60: number;
    par90: number;
    tauxRecouvrement: number;
    tauxDefaut: number;
  };
  underlyingValues: {
    resultatNet: number;
    capitauxPropres: number;
    totalActif: number;
    fondsPropres: number;
    encoursPondere: number;
    actifsLiquides: number;
    passifsCt: number;
    chargesExploitation: number;
    pnb: number;
  };
  alerts: CobacAlert[];
}

// ============================================================================
// MAIN CALCULATION
// ============================================================================

/**
 * Calculate all COBAC prudential ratios for an agency at a given date.
 */
export async function calculateCobacRatios(
  agenceId: string,
  periodeDate: Date,
  userId?: string,
): Promise<CobacRatioResult> {
  const periodeDateStr = periodeDate.toISOString().split('T')[0];
  const year = periodeDate.getFullYear();
  const dateDebut = `${year}-01-01`;
  const dateFin = periodeDateStr;

  logger.info({ agenceId, periodeDate: periodeDateStr }, 'Calculating COBAC ratios');

  // 1. Generate Bilan and Compte de Résultat
  const [bilan, compteResultat] = await Promise.all([
    generateBilan(agenceId, dateFin),
    generateCompteResultat(agenceId, dateDebut, dateFin),
  ]);

  // 2. Extract underlying values
  const resultatNet = compteResultat.resultatNet;
  const totalActif = bilan.totalActif;

  // Capitaux propres = total class 1 (from bilan passif, section "Capitaux propres")
  const capitauxPropres = extractClassBalance(bilan.passif, '1');
  const fondsPropres = capitauxPropres;

  // Actifs liquides = class 5 (trésorerie)
  const actifsLiquides = extractClassBalance(bilan.actif, '5');

  // Passifs court terme = class 4 (tiers — dépôts clients, fournisseurs)
  const passifsCt = extractClassBalance(bilan.passif, '4');

  // Charges d'exploitation = class 60-65 (from compte de résultat)
  const chargesExploitation = extractChargesExploitation(compteResultat.charges);

  // PNB = Produit Net Bancaire = Interest income - Interest expense + Commissions
  const pnb = computePNB(compteResultat);

  // 3. Get PAR data from KPI engine
  const riskKpis = await queryRisqueKpis(agenceId);

  // 4. Encours pondéré (risk-weighted portfolio from provisions)
  const encoursPondere = await computeEncoursPondere(agenceId);

  // 5. Calculate ratios
  const ratios = {
    roe: capitauxPropres !== 0 ? round(resultatNet / capitauxPropres * 100) : 0,
    roa: totalActif !== 0 ? round(resultatNet / totalActif * 100) : 0,
    ratioSolvabilite: encoursPondere !== 0 ? round(fondsPropres / encoursPondere * 100) : 0,
    ratioLiquidite: passifsCt !== 0 ? round(actifsLiquides / passifsCt * 100) : 0,
    coeffExploitation: pnb !== 0 ? round(chargesExploitation / pnb * 100) : 0,
    par30: riskKpis.par30,
    par60: riskKpis.par60,
    par90: riskKpis.par90,
    tauxRecouvrement: riskKpis.tauxRecouvrement,
    tauxDefaut: riskKpis.tauxDefaut,
  };

  const underlyingValues = {
    resultatNet, capitauxPropres, totalActif, fondsPropres,
    encoursPondere, actifsLiquides, passifsCt, chargesExploitation, pnb,
  };

  // 6. Compare against thresholds
  const alerts = await evaluateAlerts(ratios);

  // Convert to strings for DB numeric columns
  const ratiosStr = Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, String(v)]));
  const underlyingStr = Object.fromEntries(Object.entries(underlyingValues).map(([k, v]) => [k, String(v)]));

  // 7. Store snapshot
  await db
    .insert(ratiosPrudentiels)
    .values({
      agenceId,
      periodeDate: periodeDateStr,
      ...ratiosStr,
      ...underlyingStr,
      alerts,
      generatedBy: userId,
    } as any)
    .onConflictDoUpdate({
      target: [ratiosPrudentiels.agenceId, ratiosPrudentiels.periodeDate],
      set: {
        ...ratiosStr,
        ...underlyingStr,
        alerts,
        generatedAt: new Date(),
        generatedBy: userId,
      } as any,
    });

  logger.info({ agenceId, periodeDate: periodeDateStr, roe: ratios.roe, roa: ratios.roa, alerts: alerts.length }, 'COBAC ratios calculated');

  return { agenceId, periodeDate: periodeDateStr, ratios, underlyingValues, alerts };
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get latest ratios for an agency.
 */
export async function getCurrentRatios(agenceId: string) {
  const [latest] = await db
    .select()
    .from(ratiosPrudentiels)
    .where(eq(ratiosPrudentiels.agenceId, agenceId))
    .orderBy(desc(ratiosPrudentiels.periodeDate))
    .limit(1);

  return latest || null;
}

/**
 * Get historical ratios for an agency.
 */
export async function getRatiosHistory(
  agenceId: string,
  fromDate: string,
  toDate: string,
) {
  return db
    .select()
    .from(ratiosPrudentiels)
    .where(
      and(
        eq(ratiosPrudentiels.agenceId, agenceId),
        sql`${ratiosPrudentiels.periodeDate} >= ${fromDate}`,
        sql`${ratiosPrudentiels.periodeDate} <= ${toDate}`,
      )
    )
    .orderBy(ratiosPrudentiels.periodeDate);
}

/**
 * Get all COBAC thresholds.
 */
export async function getSeuils() {
  return db.select().from(cobacSeuils).where(eq(cobacSeuils.actif, true));
}

/**
 * Update a threshold.
 */
export async function updateSeuil(
  id: string,
  data: Partial<{ seuilMinimum: string; seuilWarning: string; seuilMaximum: string }>,
) {
  const [result] = await db
    .update(cobacSeuils)
    .set(data)
    .where(eq(cobacSeuils.id, id))
    .returning();

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function round(value: number, decimals = 2): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function extractClassBalance(sections: Array<{ lignes: Array<{ numeroCompte: string; montant: number }> }>, classePrefix: string): number {
  let total = 0;
  for (const section of sections) {
    for (const ligne of section.lignes) {
      if (ligne.numeroCompte.startsWith(classePrefix)) {
        total += ligne.montant;
      }
    }
  }
  return total;
}

function extractChargesExploitation(chargesSections: Array<{ lignes: Array<{ numeroCompte: string; montant: number }> }>): number {
  let total = 0;
  for (const section of chargesSections) {
    for (const ligne of section.lignes) {
      const prefix = parseInt(ligne.numeroCompte.substring(0, 2));
      if (prefix >= 60 && prefix <= 65) {
        total += ligne.montant;
      }
    }
  }
  return total;
}

function computePNB(cr: { charges: Array<{ lignes: Array<{ numeroCompte: string; montant: number }> }>; produits: Array<{ lignes: Array<{ numeroCompte: string; montant: number }> }> }): number {
  let interestIncome = 0;
  let interestExpense = 0;
  let commissions = 0;

  for (const section of cr.produits) {
    for (const l of section.lignes) {
      // 7071-7073: interest income, 706: commissions
      if (l.numeroCompte.startsWith('707')) interestIncome += l.montant;
      if (l.numeroCompte.startsWith('706')) commissions += l.montant;
    }
  }

  for (const section of cr.charges) {
    for (const l of section.lignes) {
      // 661: interest expense
      if (l.numeroCompte.startsWith('661')) interestExpense += l.montant;
    }
  }

  return interestIncome - interestExpense + commissions;
}

async function computeEncoursPondere(agenceId: string): Promise<number> {
  // Risk-weighted credit portfolio using COBAC provision categories
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN pc.categorie = 'SAIN' THEN c.solde_restant::numeric * 0.00
          WHEN pc.categorie = 'PRE_DOUTEUX' THEN c.solde_restant::numeric * 0.25
          WHEN pc.categorie = 'DOUTEUX' THEN c.solde_restant::numeric * 0.50
          WHEN pc.categorie = 'COMPROMIS' THEN c.solde_restant::numeric * 1.00
          ELSE c.solde_restant::numeric * 0.00
        END
      ), 0) AS encours_pondere
    FROM credits c
    LEFT JOIN LATERAL (
      SELECT categorie FROM provisions_credits
      WHERE credit_id = c.id
      ORDER BY periode_date DESC LIMIT 1
    ) pc ON true
    WHERE c.agence_id = ${agenceId}
      AND c.statut IN ('ACTIVE', 'LATE')
      AND c.deleted_at IS NULL
  `);

  return parseFloat((rows.rows[0] as any)?.encours_pondere || '0');
}

async function evaluateAlerts(ratios: Record<string, number>): Promise<CobacAlert[]> {
  const seuils = await db.select().from(cobacSeuils).where(eq(cobacSeuils.actif, true));
  const alerts: CobacAlert[] = [];

  const RATIO_MAP: Record<string, string> = {
    ROE: 'roe',
    ROA: 'roa',
    SOLVABILITE: 'ratioSolvabilite',
    LIQUIDITE: 'ratioLiquidite',
    COEFF_EXPLOITATION: 'coeffExploitation',
    PAR30: 'par30',
    PAR60: 'par60',
    PAR90: 'par90',
  };

  for (const seuil of seuils) {
    const ratioKey = RATIO_MAP[seuil.ratioCode];
    if (!ratioKey || ratios[ratioKey] === undefined) continue;

    const value = ratios[ratioKey];
    let status: 'OK' | 'WARNING' | 'BREACH' = 'OK';
    let threshold = 0;

    if (seuil.seuilMaximum) {
      // For ratios where high = bad (PAR, coeff exploitation)
      const max = parseFloat(seuil.seuilMaximum);
      const warn = seuil.seuilWarning ? parseFloat(seuil.seuilWarning) : max;
      threshold = max;
      if (value > max) status = 'BREACH';
      else if (value > warn) status = 'WARNING';
    } else if (seuil.seuilMinimum) {
      // For ratios where low = bad (ROE, ROA, solvabilité, liquidité)
      const min = parseFloat(seuil.seuilMinimum);
      const warn = seuil.seuilWarning ? parseFloat(seuil.seuilWarning) : min;
      threshold = min;
      if (value < min) status = 'BREACH';
      else if (value < warn) status = 'WARNING';
    }

    alerts.push({ ratio: seuil.ratioCode, value, threshold, status });
  }

  return alerts;
}
