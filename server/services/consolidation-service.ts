/**
 * Consolidation Service — Multi-Agency Consolidated Financial Statements
 *
 * Generates consolidated Bilan, Compte de Résultat, and Trial Balance
 * across all active agencies with inter-agency elimination.
 *
 * Inter-agency elimination targets reciprocal account pairs:
 *   - 185 (Comptes de liaison agences - débit) vs 485 (Comptes de liaison agences - crédit)
 *   - 181 (Dettes rattachées inter-agences) vs 271 (Créances rattachées inter-agences)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type {
  Bilan, BilanSection, BilanLine,
  CompteResultat, CompteResultatSection,
  TrialBalance,
} from "./gl-reporting-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('ConsolidationService');

// ============================================================================
// TYPES
// ============================================================================

export interface ConsolidatedBilan extends Omit<Bilan, 'agenceId' | 'agenceNom'> {
  type: 'CONSOLIDE';
  agencesIncluses: string[];
  eliminationsInterAgences: number;
}

export interface ConsolidatedCompteResultat extends Omit<CompteResultat, 'agenceId' | 'agenceNom'> {
  type: 'CONSOLIDE';
  agencesIncluses: string[];
  eliminationsInterAgences: number;
}

export interface ConsolidatedTrialBalance extends Omit<TrialBalance, 'agenceId' | 'agenceNom'> {
  type: 'CONSOLIDE';
  agencesIncluses: string[];
}

export interface AgencyBreakdown {
  agenceId: string;
  agenceNom: string;
  totalActif: number;
  totalPassif: number;
  resultatNet: number;
}

export interface ConsolidationReport {
  bilan: ConsolidatedBilan;
  compteResultat: ConsolidatedCompteResultat;
  breakdown: AgencyBreakdown[];
  generatedAt: string;
}

// Reciprocal account pairs to eliminate in consolidation
const ELIMINATION_PAIRS = [
  { debitPrefix: '185', creditPrefix: '485' }, // Comptes de liaison inter-agences
  { debitPrefix: '181', creditPrefix: '481' }, // Dettes/créances rattachées
  { debitPrefix: '271', creditPrefix: '181' }, // Créances sur siège / dettes rattachées
];

// ============================================================================
// CONSOLIDATED BILAN
// ============================================================================

export async function generateConsolidatedBilan(
  dateArret: string,
): Promise<ConsolidatedBilan> {
  logger.info({ dateArret }, 'Generating consolidated bilan');

  // 1. Get all active agencies
  const agencies = await getActiveAgencies();
  const agenceIds = agencies.map(a => a.id);

  // 2. Aggregate balances across all agencies
  const rows = (await db.execute(sql`
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
  `)).rows as Array<{
    numero_compte: string; intitule: string; classe: number;
    type_compte: string; sens_normal: string | null;
    total_debit: string; total_credit: string;
  }>;

  // 3. Calculate inter-agency eliminations
  let eliminationsTotal = 0;
  const eliminatedAccounts = new Set<string>();

  for (const pair of ELIMINATION_PAIRS) {
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

  // 4. Build bilan sections (exclude eliminated accounts)
  const actifSections = buildBilanSections(
    rows.filter(r => !eliminatedAccounts.has(r.numero_compte)),
    'actif'
  );
  const passifSections = buildBilanSections(
    rows.filter(r => !eliminatedAccounts.has(r.numero_compte)),
    'passif'
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

// ============================================================================
// CONSOLIDATED COMPTE DE RESULTAT
// ============================================================================

export async function generateConsolidatedCompteResultat(
  dateDebut: string,
  dateFin: string,
): Promise<ConsolidatedCompteResultat> {
  logger.info({ dateDebut, dateFin }, 'Generating consolidated compte de résultat');

  const agencies = await getActiveAgencies();

  const rows = (await db.execute(sql`
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
  `)).rows as Array<{
    numero_compte: string; intitule: string; classe: number;
    type_compte: string; total_debit: string; total_credit: string;
  }>;

  // Eliminate inter-agency charges/produits (e.g., internal commissions, management fees)
  const eliminatedPrefixes = ['186', '486', '7086', '6086']; // Internal service charges
  let eliminationsTotal = 0;

  const chargeLines: BilanLine[] = [];
  const produitLines: BilanLine[] = [];

  for (const r of rows) {
    const isEliminated = eliminatedPrefixes.some(p => r.numero_compte.startsWith(p));
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

  const charges = buildCRSections(chargeLines, 'charges');
  const produits = buildCRSections(produitLines, 'produits');
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

// ============================================================================
// FULL CONSOLIDATION REPORT
// ============================================================================

export async function generateConsolidationReport(
  dateArret: string,
): Promise<ConsolidationReport> {
  const year = parseInt(dateArret.substring(0, 4));
  const dateDebut = `${year}-01-01`;

  const [bilan, compteResultat, breakdown] = await Promise.all([
    generateConsolidatedBilan(dateArret),
    generateConsolidatedCompteResultat(dateDebut, dateArret),
    getAgencyBreakdown(dateArret),
  ]);

  return {
    bilan,
    compteResultat,
    breakdown,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// AGENCY BREAKDOWN
// ============================================================================

async function getAgencyBreakdown(dateArret: string): Promise<AgencyBreakdown[]> {
  const year = parseInt(dateArret.substring(0, 4));
  const dateDebut = `${year}-01-01`;

  const rows = (await db.execute(sql`
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
  `)).rows as Array<{
    agence_id: string; agence_nom: string;
    total_actif: string; total_passif: string; resultat_net: string;
  }>;

  return rows.map(r => ({
    agenceId: r.agence_id,
    agenceNom: r.agence_nom,
    totalActif: parseFloat(r.total_actif),
    totalPassif: parseFloat(r.total_passif),
    resultatNet: parseFloat(r.resultat_net),
  }));
}

// ============================================================================
// HELPERS
// ============================================================================

async function getActiveAgencies(): Promise<Array<{ id: string; nom: string }>> {
  const rows = (await db.execute(sql`
    SELECT id, nom FROM agences WHERE statut = 'ACTIVE' AND deleted_at IS NULL ORDER BY nom
  `)).rows as Array<{ id: string; nom: string }>;
  return rows;
}

function buildBilanSections(
  rows: Array<{ numero_compte: string; intitule: string; classe: number; type_compte: string; sens_normal: string | null; total_debit: string; total_credit: string }>,
  side: 'actif' | 'passif',
): BilanSection[] {
  const ACTIF_CLASSES = [
    { classe: 2, titre: 'Immobilisations (Classe 2)' },
    { classe: 3, titre: 'Stocks (Classe 3)' },
    { classe: 4, titre: 'Créances (Classe 4)', filter: (n: string) => n.startsWith('41') || n.startsWith('42') || n.startsWith('43') || n.startsWith('44') || n.startsWith('45') || n.startsWith('46') || n.startsWith('47') || n.startsWith('409') },
    { classe: 5, titre: 'Trésorerie Actif (Classe 5)', filter: (n: string) => n.startsWith('5') && !n.startsWith('56') },
  ];

  const PASSIF_CLASSES = [
    { classe: 1, titre: 'Capitaux propres et ressources (Classe 1)' },
    { classe: 4, titre: 'Dettes (Classe 4)', filter: (n: string) => n.startsWith('40') && !n.startsWith('409') || n.startsWith('48') || n.startsWith('49') },
    { classe: 5, titre: 'Trésorerie Passif (Classe 5)', filter: (n: string) => n.startsWith('56') },
  ];

  const classes = side === 'actif' ? ACTIF_CLASSES : PASSIF_CLASSES;
  const sections: BilanSection[] = [];

  for (const cls of classes) {
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

function buildCRSections(lines: BilanLine[], type: 'charges' | 'produits'): CompteResultatSection[] {
  const CHARGE_SECTIONS = [
    { prefix: '60', titre: 'Achats et variations de stocks' },
    { prefix: '61', titre: 'Transports' },
    { prefix: '62', titre: 'Services extérieurs A' },
    { prefix: '63', titre: 'Services extérieurs B' },
    { prefix: '64', titre: 'Impôts et taxes' },
    { prefix: '65', titre: 'Autres charges' },
    { prefix: '66', titre: 'Charges de personnel' },
    { prefix: '67', titre: 'Frais financiers et charges assimilées' },
    { prefix: '68', titre: 'Dotations aux amortissements et provisions' },
    { prefix: '69', titre: 'Dotations aux provisions financières' },
  ];

  const PRODUIT_SECTIONS = [
    { prefix: '70', titre: 'Ventes' },
    { prefix: '71', titre: 'Production stockée' },
    { prefix: '72', titre: 'Production immobilisée' },
    { prefix: '73', titre: 'Variation de stocks de produits' },
    { prefix: '75', titre: 'Autres produits' },
    { prefix: '76', titre: 'Produits financiers' },
    { prefix: '77', titre: 'Revenus financiers' },
    { prefix: '78', titre: 'Reprises de provisions et amortissements' },
    { prefix: '79', titre: 'Reprises de provisions financières' },
  ];

  const sectionDefs = type === 'charges' ? CHARGE_SECTIONS : PRODUIT_SECTIONS;
  const sections: CompteResultatSection[] = [];

  for (const def of sectionDefs) {
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
