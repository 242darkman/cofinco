/**
 * TAFIRE Service — Tableau Financier des Ressources et Emplois (OHADA)
 *
 * Complete OHADA financing table split into two parts:
 *   Part 1: Emplois et Ressources de l'exercice (investment & financing flows)
 *   Part 2: Variation du Fonds de Roulement Net Global et de la Trésorerie
 *
 * Works for single agency or consolidated (all agencies).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger('TafireService');

// ============================================================================
// TYPES
// ============================================================================

export interface TafireLine {
  ref: string;
  intitule: string;
  montantN: number;
  montantN1: number;
}

export interface TafireSection {
  titre: string;
  lignes: TafireLine[];
  total: number;
  totalN1: number;
}

export interface Tafire {
  exercice: number;
  agenceId: string | null; // null = consolidated
  agenceNom: string;

  // Part 1: Emplois et Ressources
  cafg: number;
  emploisStables: TafireSection;
  ressourcesStables: TafireSection;
  variationBfrExploitation: TafireSection;
  variationBfrHorsExploitation: TafireSection;

  // Part 2: Variation trésorerie
  tresorerieNette: {
    debut: number;
    fin: number;
    variation: number;
  };

  // SIG derived values
  valeurAjoutee: number;
  ebe: number;
  resultatExploitation: number;
  resultatNet: number;

  generatedAt: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate a complete TAFIRE for an exercice.
 * @param agenceId - null for consolidated across all agencies
 */
export async function generateTafire(
  exercice: number,
  agenceId: string | null,
): Promise<Tafire> {
  const dateDebut = `${exercice}-01-01`;
  const dateFin = `${exercice}-12-31`;
  const dateDebutN1 = `${exercice - 1}-01-01`;
  const dateFinN1 = `${exercice - 1}-12-31`;

  logger.info({ exercice, agenceId }, 'Generating TAFIRE');

  // Fetch balances for N and N-1
  const [balanceN, balanceN1, balanceCumN, balanceCumN1] = await Promise.all([
    getBalanceByPrefix(agenceId, dateDebut, dateFin),
    getBalanceByPrefix(agenceId, dateDebutN1, dateFinN1),
    getCumulativeBalance(agenceId, dateFin),
    getCumulativeBalance(agenceId, dateFinN1),
  ]);

  const agenceNom = agenceId ? await getAgenceNom(agenceId) : 'Consolidé';

  // -----------------------------------------------------------------------
  // SIG (Soldes Intermédiaires de Gestion)
  // -----------------------------------------------------------------------
  const ventes = sumPrefixes(balanceN, ['70'], 'credit');
  const achats = sumPrefixes(balanceN, ['60'], 'debit');
  const margeBrute = ventes - achats;

  const autresProduits = sumPrefixes(balanceN, ['71', '72', '73', '74', '75'], 'credit');
  const autresCharges = sumPrefixes(balanceN, ['61', '62', '63'], 'debit');
  const valeurAjoutee = margeBrute + autresProduits - autresCharges;

  const personnel = sumPrefixes(balanceN, ['66'], 'debit');
  const impots = sumPrefixes(balanceN, ['64'], 'debit');
  const ebe = valeurAjoutee - personnel - impots;

  const dotations = sumPrefixes(balanceN, ['68', '69'], 'debit');
  const reprises = sumPrefixes(balanceN, ['78', '79'], 'credit');
  const autresCharges2 = sumPrefixes(balanceN, ['65'], 'debit');
  const resultatExploitation = ebe - dotations + reprises - autresCharges2;

  const produitsFinanciers = sumPrefixes(balanceN, ['76', '77'], 'credit');
  const chargesFinancieres = sumPrefixes(balanceN, ['67'], 'debit');
  const resultatNet = resultatExploitation + produitsFinanciers - chargesFinancieres;

  // CAFG = Résultat net + Dotations - Reprises + Plus/Moins values
  const cafg = resultatNet + dotations - reprises;

  // -----------------------------------------------------------------------
  // Part 1: Emplois et Ressources stables
  // -----------------------------------------------------------------------
  const emploisStables = computeEmploisStables(balanceCumN, balanceCumN1);
  const ressourcesStables = computeRessourcesStables(balanceCumN, balanceCumN1, cafg);

  // -----------------------------------------------------------------------
  // BFR Exploitation
  // -----------------------------------------------------------------------
  const bfrExploitation = computeBfrExploitation(balanceCumN, balanceCumN1);

  // -----------------------------------------------------------------------
  // BFR Hors Exploitation
  // -----------------------------------------------------------------------
  const bfrHorsExploitation = computeBfrHorsExploitation(balanceCumN, balanceCumN1);

  // -----------------------------------------------------------------------
  // Trésorerie nette
  // -----------------------------------------------------------------------
  const tresoActifN = sumPrefixes(balanceCumN, ['5'], 'debit') - sumPrefixes(balanceCumN, ['56'], 'debit');
  const tresoPassifN = sumPrefixes(balanceCumN, ['56'], 'credit');
  const tresoActifN1 = sumPrefixes(balanceCumN1, ['5'], 'debit') - sumPrefixes(balanceCumN1, ['56'], 'debit');
  const tresoPassifN1 = sumPrefixes(balanceCumN1, ['56'], 'credit');

  const tresoDebut = tresoActifN1 - tresoPassifN1;
  const tresoFin = tresoActifN - tresoPassifN;

  return {
    exercice,
    agenceId,
    agenceNom,
    cafg,
    emploisStables,
    ressourcesStables,
    variationBfrExploitation: bfrExploitation,
    variationBfrHorsExploitation: bfrHorsExploitation,
    tresorerieNette: {
      debut: tresoDebut,
      fin: tresoFin,
      variation: tresoFin - tresoDebut,
    },
    valeurAjoutee,
    ebe,
    resultatExploitation,
    resultatNet,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

function computeEmploisStables(
  cumN: Map<string, AccountBalance>,
  cumN1: Map<string, AccountBalance>,
): TafireSection {
  const lignes: TafireLine[] = [
    { ref: 'EA', intitule: 'Acquisitions d\'immobilisations incorporelles', montantN: variation(cumN, cumN1, ['21'], 'debit'), montantN1: 0 },
    { ref: 'EB', intitule: 'Acquisitions d\'immobilisations corporelles', montantN: variation(cumN, cumN1, ['22', '23', '24'], 'debit'), montantN1: 0 },
    { ref: 'EC', intitule: 'Acquisitions d\'immobilisations financières', montantN: variation(cumN, cumN1, ['26', '27'], 'debit'), montantN1: 0 },
    { ref: 'ED', intitule: 'Remboursement des emprunts', montantN: Math.max(0, -variation(cumN, cumN1, ['16'], 'credit')), montantN1: 0 },
    { ref: 'EE', intitule: 'Prélèvements sur le capital', montantN: Math.max(0, -variation(cumN, cumN1, ['10'], 'credit')), montantN1: 0 },
    { ref: 'EF', intitule: 'Dividendes distribués', montantN: Math.max(0, -variation(cumN, cumN1, ['12'], 'credit')), montantN1: 0 },
  ].filter(l => Math.abs(l.montantN) > 0.01);

  const total = lignes.reduce((s, l) => s + l.montantN, 0);

  return { titre: 'Emplois stables de l\'exercice', lignes, total, totalN1: 0 };
}

function computeRessourcesStables(
  cumN: Map<string, AccountBalance>,
  cumN1: Map<string, AccountBalance>,
  cafg: number,
): TafireSection {
  const lignes: TafireLine[] = [
    { ref: 'RA', intitule: 'Capacité d\'autofinancement globale (CAFG)', montantN: cafg, montantN1: 0 },
    { ref: 'RB', intitule: 'Cessions d\'immobilisations incorporelles', montantN: Math.max(0, -variation(cumN, cumN1, ['21'], 'debit')), montantN1: 0 },
    { ref: 'RC', intitule: 'Cessions d\'immobilisations corporelles', montantN: Math.max(0, -variation(cumN, cumN1, ['22', '23', '24'], 'debit')), montantN1: 0 },
    { ref: 'RD', intitule: 'Cessions d\'immobilisations financières', montantN: Math.max(0, -variation(cumN, cumN1, ['26', '27'], 'debit')), montantN1: 0 },
    { ref: 'RE', intitule: 'Augmentation des capitaux propres', montantN: Math.max(0, variation(cumN, cumN1, ['10'], 'credit')), montantN1: 0 },
    { ref: 'RF', intitule: 'Augmentation des dettes financières', montantN: Math.max(0, variation(cumN, cumN1, ['16'], 'credit')), montantN1: 0 },
  ].filter(l => Math.abs(l.montantN) > 0.01);

  const total = lignes.reduce((s, l) => s + l.montantN, 0);

  return { titre: 'Ressources stables de l\'exercice', lignes, total, totalN1: 0 };
}

function computeBfrExploitation(
  cumN: Map<string, AccountBalance>,
  cumN1: Map<string, AccountBalance>,
): TafireSection {
  const lignes: TafireLine[] = [
    { ref: 'VA', intitule: 'Variation des stocks', montantN: variation(cumN, cumN1, ['3'], 'debit'), montantN1: 0 },
    { ref: 'VB', intitule: 'Variation des créances clients', montantN: variation(cumN, cumN1, ['411'], 'debit'), montantN1: 0 },
    { ref: 'VC', intitule: 'Variation des autres créances d\'exploitation', montantN: variation(cumN, cumN1, ['409', '42', '43', '44'], 'debit'), montantN1: 0 },
    { ref: 'VD', intitule: 'Variation des dettes fournisseurs (−)', montantN: -variation(cumN, cumN1, ['401'], 'credit'), montantN1: 0 },
    { ref: 'VE', intitule: 'Variation des dettes fiscales et sociales (−)', montantN: -variation(cumN, cumN1, ['43', '44'], 'credit'), montantN1: 0 },
    { ref: 'VF', intitule: 'Variation des autres dettes d\'exploitation (−)', montantN: -variation(cumN, cumN1, ['408', '419'], 'credit'), montantN1: 0 },
  ].filter(l => Math.abs(l.montantN) > 0.01);

  const total = lignes.reduce((s, l) => s + l.montantN, 0);

  return { titre: 'Variation du BFR d\'exploitation', lignes, total, totalN1: 0 };
}

function computeBfrHorsExploitation(
  cumN: Map<string, AccountBalance>,
  cumN1: Map<string, AccountBalance>,
): TafireSection {
  const lignes: TafireLine[] = [
    { ref: 'WA', intitule: 'Variation des créances HAO', montantN: variation(cumN, cumN1, ['47', '48'], 'debit'), montantN1: 0 },
    { ref: 'WB', intitule: 'Variation des dettes HAO (−)', montantN: -variation(cumN, cumN1, ['47', '48'], 'credit'), montantN1: 0 },
  ].filter(l => Math.abs(l.montantN) > 0.01);

  const total = lignes.reduce((s, l) => s + l.montantN, 0);

  return { titre: 'Variation du BFR hors activité ordinaire', lignes, total, totalN1: 0 };
}

// ============================================================================
// DATA QUERIES
// ============================================================================

interface AccountBalance {
  numeroCompte: string;
  totalDebit: number;
  totalCredit: number;
}

/**
 * Get period-only balances (movements within dateDebut..dateFin).
 */
async function getBalanceByPrefix(
  agenceId: string | null,
  dateDebut: string,
  dateFin: string,
): Promise<Map<string, AccountBalance>> {
  const agenceFilter = agenceId ? sql`AND e.agence_id = ${agenceId}` : sql``;

  const rows = (await db.execute(sql`
    SELECT
      pc.numero_compte,
      COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(le.credit::numeric), 0) AS total_credit
    FROM plan_comptable pc
    JOIN lignes_ecritures le ON le.numero_compte = pc.numero_compte
    JOIN ecritures_comptables e ON e.id = le.ecriture_id
      AND e.statut = 'POSTED'
      AND e.date_ecriture >= ${dateDebut}::date
      AND e.date_ecriture <= ${dateFin}::date
      ${agenceFilter}
    WHERE pc.actif = true
    GROUP BY pc.numero_compte
  `)).rows as Array<{ numero_compte: string; total_debit: string; total_credit: string }>;

  const map = new Map<string, AccountBalance>();
  for (const r of rows) {
    map.set(r.numero_compte, {
      numeroCompte: r.numero_compte,
      totalDebit: parseFloat(r.total_debit),
      totalCredit: parseFloat(r.total_credit),
    });
  }
  return map;
}

/**
 * Get cumulative balances (inception to date).
 */
async function getCumulativeBalance(
  agenceId: string | null,
  dateFin: string,
): Promise<Map<string, AccountBalance>> {
  const agenceFilter = agenceId ? sql`AND e.agence_id = ${agenceId}` : sql``;

  const rows = (await db.execute(sql`
    SELECT
      pc.numero_compte,
      COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(le.credit::numeric), 0) AS total_credit
    FROM plan_comptable pc
    JOIN lignes_ecritures le ON le.numero_compte = pc.numero_compte
    JOIN ecritures_comptables e ON e.id = le.ecriture_id
      AND e.statut = 'POSTED'
      AND e.date_ecriture <= ${dateFin}::date
      ${agenceFilter}
    WHERE pc.actif = true
    GROUP BY pc.numero_compte
  `)).rows as Array<{ numero_compte: string; total_debit: string; total_credit: string }>;

  const map = new Map<string, AccountBalance>();
  for (const r of rows) {
    map.set(r.numero_compte, {
      numeroCompte: r.numero_compte,
      totalDebit: parseFloat(r.total_debit),
      totalCredit: parseFloat(r.total_credit),
    });
  }
  return map;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sum balances for accounts matching given prefixes.
 */
function sumPrefixes(
  balances: Map<string, AccountBalance>,
  prefixes: string[],
  side: 'debit' | 'credit',
): number {
  let total = 0;
  for (const [key, val] of balances) {
    if (prefixes.some(p => key.startsWith(p))) {
      total += side === 'debit'
        ? val.totalDebit - val.totalCredit
        : val.totalCredit - val.totalDebit;
    }
  }
  return Math.max(0, total); // Positive amounts only for SIG
}

/**
 * Variation between N and N-1 for given prefixes.
 */
function variation(
  cumN: Map<string, AccountBalance>,
  cumN1: Map<string, AccountBalance>,
  prefixes: string[],
  side: 'debit' | 'credit',
): number {
  const balN = sumPrefixesRaw(cumN, prefixes, side);
  const balN1 = sumPrefixesRaw(cumN1, prefixes, side);
  return balN - balN1;
}

function sumPrefixesRaw(
  balances: Map<string, AccountBalance>,
  prefixes: string[],
  side: 'debit' | 'credit',
): number {
  let total = 0;
  for (const [key, val] of balances) {
    if (prefixes.some(p => key.startsWith(p))) {
      total += side === 'debit'
        ? val.totalDebit - val.totalCredit
        : val.totalCredit - val.totalDebit;
    }
  }
  return total;
}

async function getAgenceNom(agenceId: string): Promise<string> {
  const rows = (await db.execute(sql`SELECT nom FROM agences WHERE id = ${agenceId}`)).rows as Array<{ nom: string }>;
  return rows[0]?.nom || agenceId;
}
