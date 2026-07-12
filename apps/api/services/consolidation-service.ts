/**
 * Service de consolidation comptable multi-agences.
 *
 * Génère les états consolidés en éliminant les comptes réciproques
 * inter-agences avant de produire le bilan et le compte de résultat.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type {
  BilanSection,
  BilanLine,
  CompteResultatSection,
} from "./gl-reporting-service";
import { createLogger } from "../lib/logger";
import type {
  ActiveAgency,
  AgencyBreakdown,
  AgencyBreakdownRow,
  ConsolidatedBilan,
  ConsolidatedCompteResultat,
  ConsolidationBalanceRow,
  ConsolidationReport,
  ConsolidationResultRow,
} from "./consolidation-types";
import {
  getAccountingPresentationStandard,
  type AccountingPresentationStandardCode,
  type BilanSectionDefinition,
  type ResultatSectionDefinition,
} from "./accounting-presentation-standards";

export type {
  AgencyBreakdown,
  ConsolidatedBilan,
  ConsolidatedCompteResultat,
  ConsolidatedTrialBalance,
  ConsolidationReport,
} from "./consolidation-types";

const logger = createLogger('ConsolidationService');

export interface ConsolidationOptions {
  standardCode?: AccountingPresentationStandardCode;
}

/**
 * Génère le bilan consolidé à une date d'arrêté.
 */
export async function generateConsolidatedBilan(
  dateArret: string,
  options: ConsolidationOptions = {},
): Promise<ConsolidatedBilan> {
  const standard = getAccountingPresentationStandard(options.standardCode);
  logger.info({ dateArret, standardCode: standard.code }, 'Generating consolidated bilan');

  const agencies = await getActiveAgencies();

  const rows = ((await db.execute(sql`
    SELECT
      pc.numero_compte,
      pc.intitule,
      pc.classe,
      pc.type_compte,
      pc.sens_normal,
      COALESCE(SUM(le.debit), 0) AS total_debit,
      COALESCE(SUM(le.credit), 0) AS total_credit
    FROM plan_comptable pc
    LEFT JOIN lignes_ecritures le
      ON le.numero_compte = pc.numero_compte
    LEFT JOIN ecritures_comptables e
      ON e.id = le.ecriture_id
      AND e.statut = 'POSTED'
      AND e.date_ecriture <= ${dateArret}::date
    WHERE pc.actif = true
    GROUP BY pc.numero_compte, pc.intitule, pc.classe, pc.type_compte, pc.sens_normal
    HAVING COALESCE(SUM(le.debit), 0) != 0 OR COALESCE(SUM(le.credit), 0) != 0
    ORDER BY pc.numero_compte
  `)) as unknown as { rows: ConsolidationBalanceRow[] }).rows;

  let eliminationsTotal = 0;
  const eliminatedAccounts = new Set<string>();

  for (const pair of standard.eliminations.bilanInterAgences) {
    const debitAccounts = rows.filter(r => r.numero_compte.startsWith(pair.debitPrefix));
    const creditAccounts = rows.filter(r => r.numero_compte.startsWith(pair.creditPrefix));

    const debitBalance = debitAccounts.reduce((s, r) => s + parseFloat(r.total_debit) - parseFloat(r.total_credit), 0);
    const creditBalance = creditAccounts.reduce((s, r) => s + parseFloat(r.total_credit) - parseFloat(r.total_debit), 0);

    const eliminationAmount = Math.min(Math.abs(debitBalance), Math.abs(creditBalance));
    if (eliminationAmount > 0) {
      eliminationsTotal += eliminationAmount;
      debitAccounts.forEach(r => eliminatedAccounts.add(r.numero_compte));
      creditAccounts.forEach(r => eliminatedAccounts.add(r.numero_compte));
    }
  }

  const actifSections = buildBilanSections(
    rows.filter(r => !eliminatedAccounts.has(r.numero_compte)),
    standard.bilan.actif,
    'actif',
  );
  const passifSections = buildBilanSections(
    rows.filter(r => !eliminatedAccounts.has(r.numero_compte)),
    standard.bilan.passif,
    'passif',
  );

  const totalActif = actifSections.reduce((s, sec) => s + sec.sousTotal, 0);
  const totalPassif = passifSections.reduce((s, sec) => s + sec.sousTotal, 0);

  // Résultat = Produits (class 7) - Charges (class 6)
  const produits = rows
    .filter(r => r.classe === 7 && !eliminatedAccounts.has(r.numero_compte))
    .reduce((s, r) => s + parseFloat(r.total_credit) - parseFloat(r.total_debit), 0);
  const charges = rows
    .filter(r => r.classe === 6 && !eliminatedAccounts.has(r.numero_compte))
    .reduce((s, r) => s + parseFloat(r.total_debit) - parseFloat(r.total_credit), 0);
  const resultatExercice = produits - charges;

  return {
    type: 'CONSOLIDE',
    dateArret,
    actif: actifSections,
    passif: passifSections,
    totalActif,
    totalPassif: totalPassif + resultatExercice,
    resultatExercice,
    equilibre: Math.abs(totalActif - (totalPassif + resultatExercice)) < 1,
    agencesIncluses: agencies.map(a => a.nom),
    eliminationsInterAgences: eliminationsTotal,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Génère le compte de résultat consolidé pour une période.
 */
export async function generateConsolidatedCompteResultat(
  dateDebut: string,
  dateFin: string,
  options: ConsolidationOptions = {},
): Promise<ConsolidatedCompteResultat> {
  const standard = getAccountingPresentationStandard(options.standardCode);
  logger.info({ dateDebut, dateFin, standardCode: standard.code }, 'Generating consolidated compte de résultat');

  const agencies = await getActiveAgencies();

  const rows = ((await db.execute(sql`
    SELECT
      pc.numero_compte,
      pc.intitule,
      pc.classe,
      pc.type_compte,
      COALESCE(SUM(le.debit), 0) AS total_debit,
      COALESCE(SUM(le.credit), 0) AS total_credit
    FROM plan_comptable pc
    JOIN lignes_ecritures le ON le.numero_compte = pc.numero_compte
    JOIN ecritures_comptables e
      ON e.id = le.ecriture_id
      AND e.statut = 'POSTED'
      AND e.date_ecriture >= ${dateDebut}::date
      AND e.date_ecriture <= ${dateFin}::date
    WHERE pc.actif = true AND pc.classe IN (6, 7)
    GROUP BY pc.numero_compte, pc.intitule, pc.classe, pc.type_compte
    HAVING COALESCE(SUM(le.debit), 0) != 0 OR COALESCE(SUM(le.credit), 0) != 0
    ORDER BY pc.numero_compte
  `)) as unknown as { rows: ConsolidationResultRow[] }).rows;

  let eliminationsTotal = 0;

  const chargeLines: BilanLine[] = [];
  const produitLines: BilanLine[] = [];

  for (const r of rows) {
    const isEliminated = standard.eliminations.compteResultatInternePrefixes.some(p => r.numero_compte.startsWith(p));
    const debit = parseFloat(r.total_debit);
    const credit = parseFloat(r.total_credit);

    if (isEliminated) {
      eliminationsTotal += Math.abs(debit - credit);
      continue;
    }

    if (r.classe === 6) {
      chargeLines.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant: debit - credit });
    } else {
      produitLines.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant: credit - debit });
    }
  }

  const charges = buildCRSections(chargeLines, standard.compteResultat.charges);
  const produits = buildCRSections(produitLines, standard.compteResultat.produits);
  const totalCharges = charges.reduce((s, sec) => s + sec.sousTotal, 0);
  const totalProduits = produits.reduce((s, sec) => s + sec.sousTotal, 0);

  return {
    type: 'CONSOLIDE',
    periodeDu: dateDebut,
    periodeAu: dateFin,
    charges,
    produits,
    totalCharges,
    totalProduits,
    resultatNet: totalProduits - totalCharges,
    agencesIncluses: agencies.map(a => a.nom),
    eliminationsInterAgences: eliminationsTotal,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Génère le rapport complet de consolidation pour l'exercice de la date donnée.
 */
export async function generateConsolidationReport(
  dateArret: string,
  options: ConsolidationOptions = {},
): Promise<ConsolidationReport> {
  const year = parseInt(dateArret.substring(0, 4));
  const dateDebut = `${year}-01-01`;

  const [bilan, compteResultat, breakdown] = await Promise.all([
    generateConsolidatedBilan(dateArret, options),
    generateConsolidatedCompteResultat(dateDebut, dateArret, options),
    getAgencyBreakdown(dateArret),
  ]);

  return {
    bilan,
    compteResultat,
    breakdown,
    generatedAt: new Date().toISOString(),
  };
}

async function getAgencyBreakdown(dateArret: string): Promise<AgencyBreakdown[]> {
  const year = parseInt(dateArret.substring(0, 4));
  const dateDebut = `${year}-01-01`;

  const rows = ((await db.execute(sql`
    SELECT
      a.id AS agence_id,
      a.nom AS agence_nom,
      COALESCE(SUM(CASE WHEN pc.classe BETWEEN 1 AND 5 AND (pc.sens_normal = 'Débit' OR pc.type_compte = 'Actif')
        THEN le.debit::numeric - le.credit::numeric ELSE 0 END), 0) AS total_actif,
      COALESCE(SUM(CASE WHEN pc.classe BETWEEN 1 AND 5 AND (pc.sens_normal = 'Crédit' OR pc.type_compte IN ('Passif', 'Capitaux'))
        THEN le.credit::numeric - le.debit::numeric ELSE 0 END), 0) AS total_passif,
      COALESCE(SUM(CASE WHEN pc.classe = 7 THEN le.credit::numeric - le.debit::numeric
        WHEN pc.classe = 6 THEN -(le.debit::numeric - le.credit::numeric)
        ELSE 0 END), 0) AS resultat_net
    FROM agences a
    LEFT JOIN ecritures_comptables e ON e.agence_id = a.id AND e.statut = 'POSTED' AND e.date_ecriture <= ${dateArret}::date
    LEFT JOIN lignes_ecritures le ON le.ecriture_id = e.id
    LEFT JOIN plan_comptable pc ON le.numero_compte = pc.numero_compte
    WHERE a.statut = 'ACTIVE' AND a.deleted_at IS NULL
    GROUP BY a.id, a.nom
    ORDER BY a.nom
  `)) as unknown as { rows: AgencyBreakdownRow[] }).rows;

  return rows.map(r => ({
    agenceId: r.agence_id,
    agenceNom: r.agence_nom,
    totalActif: parseFloat(r.total_actif),
    totalPassif: parseFloat(r.total_passif),
    resultatNet: parseFloat(r.resultat_net),
  }));
}

async function getActiveAgencies(): Promise<ActiveAgency[]> {
  const rows = ((await db.execute(sql`
    SELECT id, nom FROM agences WHERE statut = 'ACTIVE' AND deleted_at IS NULL ORDER BY nom
  `)) as unknown as { rows: ActiveAgency[] }).rows;
  return rows;
}

function buildBilanSections(
  rows: ConsolidationBalanceRow[],
  definitions: BilanSectionDefinition[],
  side: 'actif' | 'passif',
): BilanSection[] {
  const sections: BilanSection[] = [];

  for (const cls of definitions) {
    const lignes: BilanLine[] = [];

    for (const r of rows) {
      if (r.classe !== cls.classe) continue;
      if (cls.filter && !cls.filter(r.numero_compte)) continue;

      const debit = parseFloat(r.total_debit);
      const credit = parseFloat(r.total_credit);
      const montant = side === 'actif' ? debit - credit : credit - debit;

      if (Math.abs(montant) > 0.01) {
        lignes.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant });
      }
    }

    if (lignes.length > 0) {
      sections.push({
        titre: cls.titre,
        lignes,
        sousTotal: lignes.reduce((s, l) => s + l.montant, 0),
      });
    }
  }

  return sections;
}

/**
 * Regroupe les lignes du compte de résultat selon les rubriques du standard.
 *
 * @param lines Lignes déjà calculées en montant signé.
 * @param definitions Rubriques de présentation à appliquer.
 */
function buildCRSections(
  lines: BilanLine[],
  definitions: ResultatSectionDefinition[],
): CompteResultatSection[] {
  const sections: CompteResultatSection[] = [];

  for (const def of definitions) {
    const lignes = lines.filter(l => l.numeroCompte.startsWith(def.prefix));
    if (lignes.length > 0) {
      sections.push({
        titre: def.titre,
        lignes,
        sousTotal: lignes.reduce((s, l) => s + l.montant, 0),
      });
    }
  }

  return sections;
}
