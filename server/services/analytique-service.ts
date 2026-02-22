/**
 * Analytical Accounting Service — Cost Centers & Product Lines (Class 9)
 *
 * Provides analytical entry posting (parallel to GL), distribution key application,
 * and analytical reporting (balance by center, P&L by product).
 */

import { db } from "../db";
import { eq, and, sql, between } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  lignesAnalytiques,
  centresCouts,
  lignesProduits,
  clesRepartition,
  clesRepartitionLignes,
} from "@shared/schema/analytique";
import { ecritures, lignesEcritures, planComptable } from "@shared/schema";
import { createLogger } from "../lib/logger";

const logger = createLogger('AnalytiqueService');

// ============================================================================
// TYPES
// ============================================================================

export interface AnalyticalLineInput {
  ligneEcritureId: string;
  compteAnalytique?: string;
  centreCoutId?: string;
  ligneProduitId?: string;
  debit: string;
  credit: string;
  pourcentage?: string;
}

export interface BalanceAnalytiqueEntry {
  id: string;
  code: string;
  intitule: string;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

export interface CompteResultatAnalytiqueSection {
  classe: number;
  libelle: string;
  total: number;
  comptes: Array<{
    numeroCompte: string;
    intitule: string;
    montant: number;
  }>;
}

// ============================================================================
// POSTING
// ============================================================================

/**
 * Post analytical lines alongside a GL entry (within the same transaction).
 */
export async function postAnalyticalLines(
  tx: PgTransaction<any, any, any>,
  ecritureId: string,
  lines: AnalyticalLineInput[],
): Promise<void> {
  if (lines.length === 0) return;

  await tx.insert(lignesAnalytiques).values(
    lines.map(l => ({
      ligneEcritureId: l.ligneEcritureId,
      ecritureId,
      compteAnalytique: l.compteAnalytique,
      centreCoutId: l.centreCoutId,
      ligneProduitId: l.ligneProduitId,
      debit: l.debit,
      credit: l.credit,
      pourcentage: l.pourcentage || '100',
    }))
  );

  logger.info({ ecritureId, linesCount: lines.length }, 'Analytical lines posted');
}

/**
 * Distribute a GL line across cost centers using a distribution key.
 */
export async function distributeByKey(
  tx: PgTransaction<any, any, any>,
  ecritureId: string,
  ligneEcritureId: string,
  cleRepartitionId: string,
  debit: number,
  credit: number,
): Promise<void> {
  // Load distribution key lines
  const keyLines = await tx
    .select({
      centreCoutId: clesRepartitionLignes.centreCoutId,
      pourcentage: clesRepartitionLignes.pourcentage,
    })
    .from(clesRepartitionLignes)
    .where(eq(clesRepartitionLignes.cleId, cleRepartitionId));

  if (keyLines.length === 0) {
    throw new Error(`Clé de répartition ${cleRepartitionId} vide`);
  }

  const analyticalLines: AnalyticalLineInput[] = keyLines.map(kl => {
    const pct = parseFloat(kl.pourcentage) / 100;
    return {
      ligneEcritureId,
      centreCoutId: kl.centreCoutId,
      debit: (debit * pct).toFixed(2),
      credit: (credit * pct).toFixed(2),
      pourcentage: kl.pourcentage,
    };
  });

  await postAnalyticalLines(tx, ecritureId, analyticalLines);
}

// ============================================================================
// REPORTS
// ============================================================================

/**
 * Analytical balance grouped by cost center or product line.
 */
export async function getBalanceAnalytique(
  agenceId: string,
  dateDebut: string,
  dateFin: string,
  groupBy: 'centre_cout' | 'ligne_produit',
): Promise<BalanceAnalytiqueEntry[]> {
  if (groupBy === 'centre_cout') {
    const rows = await db.execute(sql`
      SELECT
        cc.id,
        cc.code,
        cc.intitule,
        COALESCE(SUM(la.debit::numeric), 0) AS total_debit,
        COALESCE(SUM(la.credit::numeric), 0) AS total_credit
      FROM lignes_analytiques la
      INNER JOIN ecritures_comptables ec ON la.ecriture_id = ec.id
      INNER JOIN centres_couts cc ON la.centre_cout_id = cc.id
      WHERE ec.agence_id = ${agenceId}
        AND ec.date_ecriture >= ${dateDebut}
        AND ec.date_ecriture <= ${dateFin}
        AND ec.statut = 'POSTED'
      GROUP BY cc.id, cc.code, cc.intitule
      ORDER BY cc.code
    `);

    return (rows.rows as any[]).map(r => ({
      id: r.id,
      code: r.code,
      intitule: r.intitule,
      totalDebit: parseFloat(r.total_debit),
      totalCredit: parseFloat(r.total_credit),
      solde: parseFloat(r.total_debit) - parseFloat(r.total_credit),
    }));
  } else {
    const rows = await db.execute(sql`
      SELECT
        lp.id,
        lp.code,
        lp.intitule,
        COALESCE(SUM(la.debit::numeric), 0) AS total_debit,
        COALESCE(SUM(la.credit::numeric), 0) AS total_credit
      FROM lignes_analytiques la
      INNER JOIN ecritures_comptables ec ON la.ecriture_id = ec.id
      INNER JOIN lignes_produits lp ON la.ligne_produit_id = lp.id
      WHERE ec.agence_id = ${agenceId}
        AND ec.date_ecriture >= ${dateDebut}
        AND ec.date_ecriture <= ${dateFin}
        AND ec.statut = 'POSTED'
      GROUP BY lp.id, lp.code, lp.intitule
      ORDER BY lp.code
    `);

    return (rows.rows as any[]).map(r => ({
      id: r.id,
      code: r.code,
      intitule: r.intitule,
      totalDebit: parseFloat(r.total_debit),
      totalCredit: parseFloat(r.total_credit),
      solde: parseFloat(r.total_debit) - parseFloat(r.total_credit),
    }));
  }
}

/**
 * Analytical P&L — charges (class 6) and produits (class 7)
 * optionally filtered by cost center or product line.
 */
export async function getCompteResultatAnalytique(
  agenceId: string,
  dateDebut: string,
  dateFin: string,
  centreCoutId?: string,
  ligneProduitId?: string,
): Promise<{
  charges: CompteResultatAnalytiqueSection[];
  produits: CompteResultatAnalytiqueSection[];
  totalCharges: number;
  totalProduits: number;
  resultatAnalytique: number;
}> {
  const centreFilter = centreCoutId ? sql`AND la.centre_cout_id = ${centreCoutId}` : sql``;
  const produitFilter = ligneProduitId ? sql`AND la.ligne_produit_id = ${ligneProduitId}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      pc.numero_compte,
      pc.intitule,
      pc.classe,
      COALESCE(SUM(la.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(la.credit::numeric), 0) AS total_credit
    FROM lignes_analytiques la
    INNER JOIN lignes_ecritures le ON la.ligne_ecriture_id = le.id
    INNER JOIN plan_comptable pc ON le.compte_id = pc.id
    INNER JOIN ecritures_comptables ec ON la.ecriture_id = ec.id
    WHERE ec.agence_id = ${agenceId}
      AND ec.date_ecriture >= ${dateDebut}
      AND ec.date_ecriture <= ${dateFin}
      AND ec.statut = 'POSTED'
      AND pc.classe IN (6, 7)
      ${centreFilter}
      ${produitFilter}
    GROUP BY pc.numero_compte, pc.intitule, pc.classe
    ORDER BY pc.numero_compte
  `);

  const chargesComptes: Array<{ numeroCompte: string; intitule: string; montant: number }> = [];
  const produitsComptes: Array<{ numeroCompte: string; intitule: string; montant: number }> = [];

  for (const row of rows.rows as any[]) {
    const entry = {
      numeroCompte: row.numero_compte,
      intitule: row.intitule,
      montant: row.classe === 6
        ? parseFloat(row.total_debit) - parseFloat(row.total_credit)
        : parseFloat(row.total_credit) - parseFloat(row.total_debit),
    };

    if (row.classe === 6) {
      chargesComptes.push(entry);
    } else {
      produitsComptes.push(entry);
    }
  }

  const totalCharges = chargesComptes.reduce((s, c) => s + c.montant, 0);
  const totalProduits = produitsComptes.reduce((s, c) => s + c.montant, 0);

  return {
    charges: [{ classe: 6, libelle: 'Charges', total: totalCharges, comptes: chargesComptes }],
    produits: [{ classe: 7, libelle: 'Produits', total: totalProduits, comptes: produitsComptes }],
    totalCharges,
    totalProduits,
    resultatAnalytique: totalProduits - totalCharges,
  };
}
