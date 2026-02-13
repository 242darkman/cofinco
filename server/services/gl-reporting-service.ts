/**
 * GL Reporting Service — OHADA/SYSCOHADA Financial Statements
 *
 * Provides:
 *   1. Journal centralisateur mensuel (monthly consolidation journal)
 *   2. Balance des comptes (trial balance)
 *   3. Bilan (balance sheet — OHADA format)
 *   4. Compte de résultat (income statement — OHADA format)
 *   5. Livre d'inventaire (accounting inventory book)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { currencyLabel, currencySymbol } from "@shared/config/currency";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JournalCentralisateurEntry {
  journalCode: string;
  journalIntitule: string;
  entryCount: number;
  totalDebit: number;
  totalCredit: number;
}

export interface JournalCentralisateur {
  agenceId: string;
  agenceNom: string;
  year: number;
  month: number;
  periodLabel: string;
  entries: JournalCentralisateurEntry[];
  grandTotalDebit: number;
  grandTotalCredit: number;
  generatedAt: string;
}

export interface BalanceCompte {
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  debitPeriode: number;
  creditPeriode: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

export interface TrialBalance {
  agenceId: string;
  agenceNom: string;
  year: number;
  month: number;
  comptes: BalanceCompte[];
  totalDebit: number;
  totalCredit: number;
  totalSoldeDebiteur: number;
  totalSoldeCrediteur: number;
  generatedAt: string;
}

export interface BilanLine {
  numeroCompte: string;
  intitule: string;
  montant: number;
}

export interface BilanSection {
  titre: string;
  lignes: BilanLine[];
  sousTotal: number;
}

export interface Bilan {
  agenceId: string;
  agenceNom: string;
  dateArret: string;
  actif: BilanSection[];
  passif: BilanSection[];
  totalActif: number;
  totalPassif: number;
  resultatExercice: number;
  equilibre: boolean;
  generatedAt: string;
}

export interface CompteResultatSection {
  titre: string;
  lignes: BilanLine[];
  sousTotal: number;
}

export interface CompteResultat {
  agenceId: string;
  agenceNom: string;
  periodeDu: string;
  periodeAu: string;
  charges: CompteResultatSection[];
  produits: CompteResultatSection[];
  totalCharges: number;
  totalProduits: number;
  resultatNet: number;
  generatedAt: string;
}

export interface LivreInventaireLine {
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  solde: number;
  sensNormal: string;
  observation: string;
}

export interface LivreInventaire {
  agenceId: string;
  agenceNom: string;
  dateInventaire: string;
  lignes: LivreInventaireLine[];
  totalActif: number;
  totalPassif: number;
  totalCharges: number;
  totalProduits: number;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. JOURNAL CENTRALISATEUR MENSUEL
// ─────────────────────────────────────────────────────────────────────────────

export async function generateJournalCentralisateur(
  agenceId: string,
  year: number,
  month: number
): Promise<JournalCentralisateur> {
  const rows = (await db.execute(sql`
    SELECT
      jc.code AS journal_code,
      jc.intitule AS journal_intitule,
      COUNT(e.id) AS entry_count,
      COALESCE(SUM(le.debit), 0) AS total_debit,
      COALESCE(SUM(le.credit), 0) AS total_credit
    FROM journaux_comptables jc
    LEFT JOIN ecritures_comptables e
      ON e.journal_id = jc.id
      AND e.agence_id = ${agenceId}
      AND e.statut = 'POSTED'
      AND EXTRACT(YEAR FROM e.date_ecriture) = ${year}
      AND EXTRACT(MONTH FROM e.date_ecriture) = ${month}
    LEFT JOIN lignes_ecritures le ON le.ecriture_id = e.id
    WHERE jc.actif = true
    GROUP BY jc.code, jc.intitule
    HAVING COUNT(e.id) > 0
    ORDER BY jc.code
  `)).rows as Array<{
    journal_code: string;
    journal_intitule: string;
    entry_count: string;
    total_debit: string;
    total_credit: string;
  }>;

  const agenceRow = (await db.execute(sql`
    SELECT nom FROM agences WHERE id = ${agenceId}
  `)).rows[0] as { nom: string } | undefined;

  const entries: JournalCentralisateurEntry[] = rows.map((r) => ({
    journalCode: r.journal_code,
    journalIntitule: r.journal_intitule,
    entryCount: parseInt(r.entry_count),
    totalDebit: parseFloat(r.total_debit),
    totalCredit: parseFloat(r.total_credit),
  }));

  const grandTotalDebit = entries.reduce((s, e) => s + e.totalDebit, 0);
  const grandTotalCredit = entries.reduce((s, e) => s + e.totalCredit, 0);

  const monthNames = [
    "", "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
  ];

  return {
    agenceId,
    agenceNom: agenceRow?.nom || agenceId,
    year,
    month,
    periodLabel: `${monthNames[month]} ${year}`,
    entries,
    grandTotalDebit,
    grandTotalCredit,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BALANCE DES COMPTES (Trial Balance)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateTrialBalance(
  agenceId: string,
  year: number,
  month: number
): Promise<TrialBalance> {
  const rows = (await db.execute(sql`
    SELECT
      pc.numero_compte,
      pc.intitule,
      pc.classe,
      pc.type_compte,
      COALESCE(SUM(le.debit), 0) AS debit_periode,
      COALESCE(SUM(le.credit), 0) AS credit_periode
    FROM plan_comptable pc
    LEFT JOIN lignes_ecritures le
      ON le.numero_compte = pc.numero_compte
    LEFT JOIN ecritures_comptables e
      ON e.id = le.ecriture_id
      AND e.agence_id = ${agenceId}
      AND e.statut = 'POSTED'
      AND EXTRACT(YEAR FROM e.date_ecriture) = ${year}
      AND EXTRACT(MONTH FROM e.date_ecriture) = ${month}
    WHERE pc.actif = true
    GROUP BY pc.numero_compte, pc.intitule, pc.classe, pc.type_compte
    HAVING COALESCE(SUM(le.debit), 0) > 0 OR COALESCE(SUM(le.credit), 0) > 0
    ORDER BY pc.numero_compte
  `)).rows as Array<{
    numero_compte: string;
    intitule: string;
    classe: number;
    type_compte: string;
    debit_periode: string;
    credit_periode: string;
  }>;

  const agenceRow = (await db.execute(sql`
    SELECT nom FROM agences WHERE id = ${agenceId}
  `)).rows[0] as { nom: string } | undefined;

  const comptes: BalanceCompte[] = rows.map((r) => {
    const debit = parseFloat(r.debit_periode);
    const credit = parseFloat(r.credit_periode);
    const solde = debit - credit;
    return {
      numeroCompte: r.numero_compte,
      intitule: r.intitule,
      classe: r.classe,
      typeCompte: r.type_compte,
      debitPeriode: debit,
      creditPeriode: credit,
      soldeDebiteur: solde > 0 ? solde : 0,
      soldeCrediteur: solde < 0 ? -solde : 0,
    };
  });

  return {
    agenceId,
    agenceNom: agenceRow?.nom || agenceId,
    year,
    month,
    comptes,
    totalDebit: comptes.reduce((s, c) => s + c.debitPeriode, 0),
    totalCredit: comptes.reduce((s, c) => s + c.creditPeriode, 0),
    totalSoldeDebiteur: comptes.reduce((s, c) => s + c.soldeDebiteur, 0),
    totalSoldeCrediteur: comptes.reduce((s, c) => s + c.soldeCrediteur, 0),
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BILAN (Balance Sheet — OHADA format)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a balance sheet at a given date.
 * OHADA structure:
 *   ACTIF: Classes 2 (immobilisations), 3 (stocks), 4 (créances), 5 (trésorerie active)
 *   PASSIF: Classes 1 (capitaux propres), 4 (dettes), 5 (trésorerie passive)
 *
 * Note: Classes 6/7 flow through as Résultat de l'exercice.
 */
export async function generateBilan(
  agenceId: string,
  dateArret: string // YYYY-MM-DD
): Promise<Bilan> {
  // Get cumulative balances for all accounts up to the date
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
      AND e.agence_id = ${agenceId}
      AND e.statut = 'POSTED'
      AND e.date_ecriture <= ${dateArret}::date
    WHERE pc.actif = true
    GROUP BY pc.numero_compte, pc.intitule, pc.classe, pc.type_compte, pc.sens_normal
    HAVING COALESCE(SUM(le.debit), 0) != 0 OR COALESCE(SUM(le.credit), 0) != 0
    ORDER BY pc.numero_compte
  `)).rows as Array<{
    numero_compte: string;
    intitule: string;
    classe: number;
    type_compte: string;
    sens_normal: string | null;
    total_debit: string;
    total_credit: string;
  }>;

  const agenceRow = (await db.execute(sql`
    SELECT nom FROM agences WHERE id = ${agenceId}
  `)).rows[0] as { nom: string } | undefined;

  // Classify accounts
  const actifLines: BilanLine[] = [];
  const passifLines: BilanLine[] = [];
  let totalCharges = 0;
  let totalProduits = 0;

  for (const r of rows) {
    const debit = parseFloat(r.total_debit);
    const credit = parseFloat(r.total_credit);
    const solde = debit - credit;

    if (r.classe === 6) {
      // Charges — flow to résultat
      totalCharges += solde;
    } else if (r.classe === 7) {
      // Produits — flow to résultat (credit-normal, so negate)
      totalProduits += -solde; // produits have credit solde, so credit - debit
    } else if (r.type_compte === "Actif") {
      if (Math.abs(solde) > 0.005) {
        actifLines.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant: solde });
      }
    } else {
      // Passif, Capitaux
      if (Math.abs(solde) > 0.005) {
        passifLines.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant: -solde });
      }
    }
  }

  const resultatExercice = totalProduits - totalCharges;

  // OHADA sections
  const actifSections: BilanSection[] = [
    buildSection("Immobilisations (Classe 2)", actifLines.filter((l) => l.numeroCompte.startsWith("2"))),
    buildSection("Stocks (Classe 3)", actifLines.filter((l) => l.numeroCompte.startsWith("3"))),
    buildSection("Creances (Classe 4)", actifLines.filter((l) => l.numeroCompte.startsWith("4"))),
    buildSection("Tresorerie Active (Classe 5)", actifLines.filter((l) => l.numeroCompte.startsWith("5"))),
  ].filter((s) => s.lignes.length > 0);

  const passifSections: BilanSection[] = [
    buildSection("Capitaux Propres & Reserves (Classe 1)", passifLines.filter((l) => l.numeroCompte.startsWith("1"))),
    buildSection("Dettes (Classe 4)", passifLines.filter((l) => l.numeroCompte.startsWith("4"))),
    buildSection("Tresorerie Passive (Classe 5)", passifLines.filter((l) => l.numeroCompte.startsWith("5"))),
  ].filter((s) => s.lignes.length > 0);

  // Add résultat de l'exercice to passif
  if (Math.abs(resultatExercice) > 0.005) {
    passifSections.push({
      titre: "Resultat de l'exercice",
      lignes: [{ numeroCompte: "—", intitule: resultatExercice >= 0 ? "Benefice" : "Perte", montant: resultatExercice }],
      sousTotal: resultatExercice,
    });
  }

  const totalActif = actifSections.reduce((s, sec) => s + sec.sousTotal, 0);
  const totalPassif = passifSections.reduce((s, sec) => s + sec.sousTotal, 0);

  return {
    agenceId,
    agenceNom: agenceRow?.nom || agenceId,
    dateArret,
    actif: actifSections,
    passif: passifSections,
    totalActif,
    totalPassif,
    resultatExercice,
    equilibre: Math.abs(totalActif - totalPassif) < 0.01,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. COMPTE DE RESULTAT (Income Statement — OHADA format)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCompteResultat(
  agenceId: string,
  dateDebut: string, // YYYY-MM-DD
  dateFin: string    // YYYY-MM-DD
): Promise<CompteResultat> {
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
      AND e.agence_id = ${agenceId}
      AND e.statut = 'POSTED'
      AND e.date_ecriture >= ${dateDebut}::date
      AND e.date_ecriture <= ${dateFin}::date
    WHERE pc.actif = true AND pc.classe IN (6, 7)
    GROUP BY pc.numero_compte, pc.intitule, pc.classe, pc.type_compte
    HAVING COALESCE(SUM(le.debit), 0) != 0 OR COALESCE(SUM(le.credit), 0) != 0
    ORDER BY pc.numero_compte
  `)).rows as Array<{
    numero_compte: string;
    intitule: string;
    classe: number;
    type_compte: string;
    total_debit: string;
    total_credit: string;
  }>;

  const agenceRow = (await db.execute(sql`
    SELECT nom FROM agences WHERE id = ${agenceId}
  `)).rows[0] as { nom: string } | undefined;

  const chargeLines: BilanLine[] = [];
  const produitLines: BilanLine[] = [];

  for (const r of rows) {
    const debit = parseFloat(r.total_debit);
    const credit = parseFloat(r.total_credit);

    if (r.classe === 6) {
      // Charges: debit-normal
      const montant = debit - credit;
      if (Math.abs(montant) > 0.005) {
        chargeLines.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant });
      }
    } else if (r.classe === 7) {
      // Produits: credit-normal
      const montant = credit - debit;
      if (Math.abs(montant) > 0.005) {
        produitLines.push({ numeroCompte: r.numero_compte, intitule: r.intitule, montant });
      }
    }
  }

  // OHADA classification
  const chargesSections: CompteResultatSection[] = [
    buildSection("Charges d'exploitation (60-65)", chargeLines.filter((l) => {
      const n = parseInt(l.numeroCompte.substring(0, 2));
      return n >= 60 && n <= 65;
    })),
    buildSection("Charges financieres (66-67)", chargeLines.filter((l) => {
      const n = parseInt(l.numeroCompte.substring(0, 2));
      return n >= 66 && n <= 67;
    })),
    buildSection("Dotations amortissements/provisions (68-69)", chargeLines.filter((l) => {
      const n = parseInt(l.numeroCompte.substring(0, 2));
      return n >= 68 && n <= 69;
    })),
  ].filter((s) => s.lignes.length > 0);

  const produitsSections: CompteResultatSection[] = [
    buildSection("Produits d'exploitation (70-75)", produitLines.filter((l) => {
      const n = parseInt(l.numeroCompte.substring(0, 2));
      return n >= 70 && n <= 75;
    })),
    buildSection("Produits financiers (76-77)", produitLines.filter((l) => {
      const n = parseInt(l.numeroCompte.substring(0, 2));
      return n >= 76 && n <= 77;
    })),
    buildSection("Reprises provisions (78-79)", produitLines.filter((l) => {
      const n = parseInt(l.numeroCompte.substring(0, 2));
      return n >= 78 && n <= 79;
    })),
  ].filter((s) => s.lignes.length > 0);

  const totalCharges = chargesSections.reduce((s, sec) => s + sec.sousTotal, 0);
  const totalProduits = produitsSections.reduce((s, sec) => s + sec.sousTotal, 0);

  return {
    agenceId,
    agenceNom: agenceRow?.nom || agenceId,
    periodeDu: dateDebut,
    periodeAu: dateFin,
    charges: chargesSections,
    produits: produitsSections,
    totalCharges,
    totalProduits,
    resultatNet: totalProduits - totalCharges,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. LIVRE D'INVENTAIRE (Accounting Inventory Book)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateLivreInventaire(
  agenceId: string,
  dateInventaire: string // YYYY-MM-DD
): Promise<LivreInventaire> {
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
    LEFT JOIN lignes_ecritures le ON le.numero_compte = pc.numero_compte
    LEFT JOIN ecritures_comptables e
      ON e.id = le.ecriture_id
      AND e.agence_id = ${agenceId}
      AND e.statut = 'POSTED'
      AND e.date_ecriture <= ${dateInventaire}::date
    WHERE pc.actif = true
    GROUP BY pc.numero_compte, pc.intitule, pc.classe, pc.type_compte, pc.sens_normal
    ORDER BY pc.numero_compte
  `)).rows as Array<{
    numero_compte: string;
    intitule: string;
    classe: number;
    type_compte: string;
    sens_normal: string | null;
    total_debit: string;
    total_credit: string;
  }>;

  const agenceRow = (await db.execute(sql`
    SELECT nom FROM agences WHERE id = ${agenceId}
  `)).rows[0] as { nom: string } | undefined;

  let totalActif = 0;
  let totalPassif = 0;
  let totalCharges = 0;
  let totalProduits = 0;

  const lignes: LivreInventaireLine[] = rows.map((r) => {
    const debit = parseFloat(r.total_debit);
    const credit = parseFloat(r.total_credit);
    const solde = debit - credit;
    let observation = "";

    if (r.classe >= 1 && r.classe <= 5) {
      if (r.type_compte === "Actif") {
        totalActif += solde;
        if (solde < 0) observation = "Solde crediteur anormal";
      } else {
        totalPassif += -solde;
        if (solde > 0) observation = "Solde debiteur anormal";
      }
    } else if (r.classe === 6) {
      totalCharges += solde;
    } else if (r.classe === 7) {
      totalProduits += -solde;
    }

    if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) {
      observation = "Compte sans mouvement";
    }

    return {
      numeroCompte: r.numero_compte,
      intitule: r.intitule,
      classe: r.classe,
      typeCompte: r.type_compte,
      solde: Math.abs(solde) < 0.005 ? 0 : solde,
      sensNormal: r.sens_normal || (r.type_compte === "Actif" || r.type_compte === "Charge" ? "Debit" : "Credit"),
      observation,
    };
  });

  return {
    agenceId,
    agenceNom: agenceRow?.nom || agenceId,
    dateInventaire,
    lignes,
    totalActif,
    totalPassif,
    totalCharges,
    totalProduits,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown formatters
// ─────────────────────────────────────────────────────────────────────────────

export function journalCentralisateurToMarkdown(jc: JournalCentralisateur): string {
  let md = `# JOURNAL CENTRALISATEUR\n\n`;
  md += `**Agence**: ${jc.agenceNom}\n`;
  md += `**Periode**: ${jc.periodLabel}\n`;
  md += `**Date generation**: ${jc.generatedAt.slice(0, 19)}\n\n`;

  if (jc.entries.length === 0) {
    md += `_Aucune ecriture pour cette periode._\n`;
    return md;
  }

  md += `| Journal | Intitule | Ecritures | Total Debit | Total Credit |\n`;
  md += `|---------|----------|-----------|-------------|-------------|\n`;
  for (const e of jc.entries) {
    md += `| ${e.journalCode} | ${e.journalIntitule} | ${e.entryCount} | ${fmt(e.totalDebit)} | ${fmt(e.totalCredit)} |\n`;
  }
  md += `| **TOTAUX** | | | **${fmt(jc.grandTotalDebit)}** | **${fmt(jc.grandTotalCredit)}** |\n\n`;
  md += `**Equilibre**: ${Math.abs(jc.grandTotalDebit - jc.grandTotalCredit) < 0.01 ? "OUI" : "NON"}\n`;
  return md;
}

export function bilanToMarkdown(bilan: Bilan): string {
  let md = `# BILAN\n\n`;
  md += `**Agence**: ${bilan.agenceNom}\n`;
  md += `**Arrete au**: ${bilan.dateArret}\n`;
  md += `**Date generation**: ${bilan.generatedAt.slice(0, 19)}\n\n`;

  md += `## ACTIF\n\n`;
  md += `| Compte | Intitule | ${currencyLabel('Montant')} |\n`;
  md += `|--------|----------|----------------|\n`;
  for (const section of bilan.actif) {
    md += `| **${section.titre}** | | |\n`;
    for (const l of section.lignes) {
      md += `| ${l.numeroCompte} | ${l.intitule} | ${fmt(l.montant)} |\n`;
    }
    md += `| | **Sous-total** | **${fmt(section.sousTotal)}** |\n`;
  }
  md += `| | **TOTAL ACTIF** | **${fmt(bilan.totalActif)}** |\n\n`;

  md += `## PASSIF\n\n`;
  md += `| Compte | Intitule | ${currencyLabel('Montant')} |\n`;
  md += `|--------|----------|----------------|\n`;
  for (const section of bilan.passif) {
    md += `| **${section.titre}** | | |\n`;
    for (const l of section.lignes) {
      md += `| ${l.numeroCompte} | ${l.intitule} | ${fmt(l.montant)} |\n`;
    }
    md += `| | **Sous-total** | **${fmt(section.sousTotal)}** |\n`;
  }
  md += `| | **TOTAL PASSIF** | **${fmt(bilan.totalPassif)}** |\n\n`;

  md += `**Equilibre Actif = Passif**: ${bilan.equilibre ? "OUI" : "NON"} `;
  md += `(ecart: ${fmt(Math.abs(bilan.totalActif - bilan.totalPassif))})\n`;
  return md;
}

export function compteResultatToMarkdown(cr: CompteResultat): string {
  let md = `# COMPTE DE RESULTAT\n\n`;
  md += `**Agence**: ${cr.agenceNom}\n`;
  md += `**Periode**: du ${cr.periodeDu} au ${cr.periodeAu}\n`;
  md += `**Date generation**: ${cr.generatedAt.slice(0, 19)}\n\n`;

  md += `## CHARGES\n\n`;
  md += `| Compte | Intitule | ${currencyLabel('Montant')} |\n`;
  md += `|--------|----------|----------------|\n`;
  for (const section of cr.charges) {
    md += `| **${section.titre}** | | |\n`;
    for (const l of section.lignes) {
      md += `| ${l.numeroCompte} | ${l.intitule} | ${fmt(l.montant)} |\n`;
    }
    md += `| | **Sous-total** | **${fmt(section.sousTotal)}** |\n`;
  }
  md += `| | **TOTAL CHARGES** | **${fmt(cr.totalCharges)}** |\n\n`;

  md += `## PRODUITS\n\n`;
  md += `| Compte | Intitule | ${currencyLabel('Montant')} |\n`;
  md += `|--------|----------|----------------|\n`;
  for (const section of cr.produits) {
    md += `| **${section.titre}** | | |\n`;
    for (const l of section.lignes) {
      md += `| ${l.numeroCompte} | ${l.intitule} | ${fmt(l.montant)} |\n`;
    }
    md += `| | **Sous-total** | **${fmt(section.sousTotal)}** |\n`;
  }
  md += `| | **TOTAL PRODUITS** | **${fmt(cr.totalProduits)}** |\n\n`;

  md += `**Resultat net**: ${cr.resultatNet >= 0 ? "Benefice" : "Perte"} de **${fmt(Math.abs(cr.resultatNet))} ${currencySymbol()}**\n`;
  return md;
}

export function livreInventaireToMarkdown(li: LivreInventaire): string {
  let md = `# LIVRE D'INVENTAIRE\n\n`;
  md += `**Agence**: ${li.agenceNom}\n`;
  md += `**Date inventaire**: ${li.dateInventaire}\n`;
  md += `**Date generation**: ${li.generatedAt.slice(0, 19)}\n\n`;

  md += `| Compte | Intitule | Classe | Type | Solde | Observation |\n`;
  md += `|--------|----------|--------|------|-------|-------------|\n`;

  let currentClasse = -1;
  for (const l of li.lignes) {
    if (l.classe !== currentClasse) {
      currentClasse = l.classe;
      md += `| **Classe ${currentClasse}** | | | | | |\n`;
    }
    if (l.solde !== 0) {
      md += `| ${l.numeroCompte} | ${l.intitule} | ${l.classe} | ${l.typeCompte} | ${fmt(l.solde)} | ${l.observation} |\n`;
    }
  }

  md += `\n## Totaux\n\n`;
  md += `| Categorie | ${currencyLabel('Montant')} |\n`;
  md += `|-----------|----------------|\n`;
  md += `| Total Actif | ${fmt(li.totalActif)} |\n`;
  md += `| Total Passif | ${fmt(li.totalPassif)} |\n`;
  md += `| Total Charges | ${fmt(li.totalCharges)} |\n`;
  md += `| Total Produits | ${fmt(li.totalProduits)} |\n`;
  md += `| **Resultat** | **${fmt(li.totalProduits - li.totalCharges)}** |\n`;
  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSection(titre: string, lignes: BilanLine[]): BilanSection {
  return {
    titre,
    lignes,
    sousTotal: lignes.reduce((s, l) => s + l.montant, 0),
  };
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
