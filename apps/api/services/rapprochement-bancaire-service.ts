/**
 * Bank Reconciliation Service — Rapprochement Bancaire
 *
 * Compares GL entries on bank accounts (512) against imported bank statements.
 * Auto-matches by amount/date, identifies discrepancies.
 */

import { db } from "../db";
import { eq, and, sql, isNull, desc, asc, gte, lte } from "drizzle-orm";
import {
  rapprochementsBancaires,
  rapprochementLignes,
  ecritures,
  lignesEcritures,
  planComptable,
  EntryStatus,
  RapprochementStatut,
  MatchStatus,
} from "@shared/schema";
import { createLogger } from "../lib/logger";

const logger = createLogger('RapprochementBancaire');

// ============================================================================
// TYPES
// ============================================================================

export interface CreateRapprochementRequest {
  agenceId: string;
  compteGl: string; // "512"
  period: string; // "2025-01"
  soldeBanqueDebut: number;
  soldeBanqueFin: number;
  userId: string;
}

export interface BankStatementLine {
  reference: string;
  libelle: string;
  debit: number;
  credit: number;
  dateValeur: string;
}

export interface RapprochementSummary {
  id: string;
  period: string;
  compteGl: string;
  statut: string;
  soldeBanqueFin: number;
  soldeGlFin: number;
  ecart: number;
  matchedCount: number;
  unmatchedCount: number;
}

export interface AutoMatchResult {
  matched: number;
  remaining: number;
}

// ============================================================================
// CREATE SESSION
// ============================================================================

/**
 * Create a new bank reconciliation session for a period.
 * Automatically loads GL entries for the bank account.
 */
export async function createRapprochement(
  request: CreateRapprochementRequest,
): Promise<{ id: string; glLinesLoaded: number }> {
  const { agenceId, compteGl, period, soldeBanqueDebut, soldeBanqueFin, userId } = request;

  // Parse period
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const dateDebut = `${period}-01`;
  const dateFin = new Date(year, month, 0).toISOString().split('T')[0]; // last day

  // Calculate GL balance for the period
  const [glAccount] = await db
    .select({ id: planComptable.id })
    .from(planComptable)
    .where(eq(planComptable.numeroCompte, compteGl))
    .limit(1);

  if (!glAccount) throw new Error(`Compte GL ${compteGl} non trouvé`);

  // GL opening balance (all entries before the period)
  const openingResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(le.credit::numeric), 0) AS total_credit
    FROM lignes_ecritures le
    JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
    WHERE le.numero_compte = ${compteGl}
      AND ec.agence_id = ${agenceId}
      AND ec.statut = 'POSTED'
      AND ec.date_ecriture < ${dateDebut}
  `);
  const openRow = (openingResult.rows[0] as Record<string, string>) || {};
  const soldeGlDebut = parseFloat(openRow.total_debit || '0') - parseFloat(openRow.total_credit || '0');

  // GL closing balance (all entries up to end of period)
  const closingResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(le.debit::numeric), 0) AS total_debit,
      COALESCE(SUM(le.credit::numeric), 0) AS total_credit
    FROM lignes_ecritures le
    JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
    WHERE le.numero_compte = ${compteGl}
      AND ec.agence_id = ${agenceId}
      AND ec.statut = 'POSTED'
      AND ec.date_ecriture <= ${dateFin}
  `);
  const closeRow = (closingResult.rows[0] as Record<string, string>) || {};
  const soldeGlFin = parseFloat(closeRow.total_debit || '0') - parseFloat(closeRow.total_credit || '0');

  const ecart = soldeBanqueFin - soldeGlFin;

  // Create session
  const [session] = await db
    .insert(rapprochementsBancaires)
    .values({
      agenceId,
      compteGl,
      period,
      soldeBanqueDebut: soldeBanqueDebut.toFixed(2),
      soldeBanqueFin: soldeBanqueFin.toFixed(2),
      soldeGlDebut: soldeGlDebut.toFixed(2),
      soldeGlFin: soldeGlFin.toFixed(2),
      ecart: ecart.toFixed(2),
      statut: RapprochementStatut.DRAFT,
      createdBy: userId,
    })
    .onConflictDoUpdate({
      target: [rapprochementsBancaires.agenceId, rapprochementsBancaires.compteGl, rapprochementsBancaires.period],
      set: {
        soldeBanqueDebut: soldeBanqueDebut.toFixed(2),
        soldeBanqueFin: soldeBanqueFin.toFixed(2),
        soldeGlDebut: soldeGlDebut.toFixed(2),
        soldeGlFin: soldeGlFin.toFixed(2),
        ecart: ecart.toFixed(2),
        statut: RapprochementStatut.DRAFT,
      },
    })
    .returning();

  // Load GL entries for the period as reconciliation lines
  const glEntries = await db.execute(sql`
    SELECT
      le.id AS ligne_id,
      ec.id AS ecriture_id,
      ec.numero_piece,
      ec.libelle AS ecriture_libelle,
      le.libelle AS ligne_libelle,
      le.debit::numeric AS debit,
      le.credit::numeric AS credit,
      ec.date_ecriture
    FROM lignes_ecritures le
    JOIN ecritures_comptables ec ON le.ecriture_id = ec.id
    WHERE le.numero_compte = ${compteGl}
      AND ec.agence_id = ${agenceId}
      AND ec.statut = 'POSTED'
      AND ec.date_ecriture >= ${dateDebut}
      AND ec.date_ecriture <= ${dateFin}
    ORDER BY ec.date_ecriture
  `);

  const glRows = glEntries.rows as Array<{
    ligne_id: string;
    ecriture_id: string;
    numero_piece: string;
    ecriture_libelle: string;
    ligne_libelle: string;
    debit: string;
    credit: string;
    date_ecriture: string;
  }>;

  // Delete existing GL lines for this session (in case of re-creation)
  await db.delete(rapprochementLignes).where(
    and(
      eq(rapprochementLignes.rapprochementId, session.id),
      eq(rapprochementLignes.source, 'GL'),
    )
  );

  // Insert GL lines
  for (const row of glRows) {
    await db.insert(rapprochementLignes).values({
      rapprochementId: session.id,
      source: 'GL',
      reference: row.numero_piece,
      libelle: row.ligne_libelle || row.ecriture_libelle,
      debit: row.debit,
      credit: row.credit,
      dateValeur: row.date_ecriture,
      matchStatus: MatchStatus.UNMATCHED,
      ecritureId: row.ecriture_id,
    });
  }

  logger.info({ sessionId: session.id, period, glLinesLoaded: glRows.length }, 'Reconciliation session created');

  return { id: session.id, glLinesLoaded: glRows.length };
}

// ============================================================================
// IMPORT BANK STATEMENT LINES
// ============================================================================

/**
 * Import bank statement lines into an existing reconciliation session.
 */
export async function importBankLines(
  rapprochementId: string,
  lines: BankStatementLine[],
  fileName?: string,
): Promise<{ imported: number }> {
  // Verify session exists
  const [session] = await db.select().from(rapprochementsBancaires).where(eq(rapprochementsBancaires.id, rapprochementId)).limit(1);
  if (!session) throw new Error('Session de rapprochement non trouvée');

  // Delete existing bank lines
  await db.delete(rapprochementLignes).where(
    and(
      eq(rapprochementLignes.rapprochementId, rapprochementId),
      eq(rapprochementLignes.source, 'BANK'),
    )
  );

  // Insert bank lines
  for (const line of lines) {
    await db.insert(rapprochementLignes).values({
      rapprochementId,
      source: 'BANK',
      reference: line.reference,
      libelle: line.libelle,
      debit: line.debit.toFixed(2),
      credit: line.credit.toFixed(2),
      dateValeur: line.dateValeur,
      matchStatus: MatchStatus.UNMATCHED,
    });
  }

  // Update session
  if (fileName) {
    await db.update(rapprochementsBancaires)
      .set({ importFileName: fileName, statut: RapprochementStatut.IN_PROGRESS })
      .where(eq(rapprochementsBancaires.id, rapprochementId));
  }

  logger.info({ rapprochementId, imported: lines.length }, 'Bank lines imported');
  return { imported: lines.length };
}

// ============================================================================
// AUTO-MATCHING
// ============================================================================

/**
 * Automatically match GL lines against bank statement lines by amount and date.
 */
export async function autoMatch(
  rapprochementId: string,
): Promise<AutoMatchResult> {
  const glLines = await db
    .select()
    .from(rapprochementLignes)
    .where(
      and(
        eq(rapprochementLignes.rapprochementId, rapprochementId),
        eq(rapprochementLignes.source, 'GL'),
        eq(rapprochementLignes.matchStatus, MatchStatus.UNMATCHED),
      )
    );

  const bankLines = await db
    .select()
    .from(rapprochementLignes)
    .where(
      and(
        eq(rapprochementLignes.rapprochementId, rapprochementId),
        eq(rapprochementLignes.source, 'BANK'),
        eq(rapprochementLignes.matchStatus, MatchStatus.UNMATCHED),
      )
    );

  let matched = 0;
  const usedBankIds = new Set<string>();

  for (const gl of glLines) {
    const glAmount = parseFloat(gl.debit) - parseFloat(gl.credit);

    // Find matching bank line (same amount, bank sees it reversed: GL debit = bank credit)
    const match = bankLines.find(bl => {
      if (usedBankIds.has(bl.id)) return false;
      const bankAmount = parseFloat(bl.debit) - parseFloat(bl.credit);
      // Amounts should be equal (same direction)
      return Math.abs(glAmount - bankAmount) < 1;
    });

    if (match) {
      const ecart = Math.abs(
        (parseFloat(gl.debit) - parseFloat(gl.credit)) -
        (parseFloat(match.debit) - parseFloat(match.credit))
      );

      const status = ecart < 0.01 ? MatchStatus.MATCHED : MatchStatus.DISCREPANCY;

      // Update both lines
      await db.update(rapprochementLignes)
        .set({ matchStatus: status, matchedWithId: match.id, ecart: ecart.toFixed(2) })
        .where(eq(rapprochementLignes.id, gl.id));

      await db.update(rapprochementLignes)
        .set({ matchStatus: status, matchedWithId: gl.id, ecart: ecart.toFixed(2) })
        .where(eq(rapprochementLignes.id, match.id));

      usedBankIds.add(match.id);
      matched++;
    }
  }

  // Update session totals
  await updateSessionTotals(rapprochementId);

  const remaining = glLines.length + bankLines.length - (matched * 2);
  logger.info({ rapprochementId, matched, remaining }, 'Auto-match completed');

  return { matched, remaining };
}

// ============================================================================
// MANUAL MATCHING
// ============================================================================

/**
 * Manually match a GL line with a bank line.
 */
export async function manualMatch(
  glLineId: string,
  bankLineId: string,
): Promise<void> {
  const [glLine] = await db.select().from(rapprochementLignes).where(eq(rapprochementLignes.id, glLineId)).limit(1);
  const [bankLine] = await db.select().from(rapprochementLignes).where(eq(rapprochementLignes.id, bankLineId)).limit(1);

  if (!glLine || !bankLine) throw new Error('Ligne(s) non trouvée(s)');
  if (glLine.source !== 'GL' || bankLine.source !== 'BANK') throw new Error('Une ligne GL et une ligne banque sont requises');
  if (glLine.rapprochementId !== bankLine.rapprochementId) throw new Error('Les lignes doivent appartenir au même rapprochement');

  const ecart = Math.abs(
    (parseFloat(glLine.debit) - parseFloat(glLine.credit)) -
    (parseFloat(bankLine.debit) - parseFloat(bankLine.credit))
  );

  const status = ecart < 0.01 ? MatchStatus.MATCHED : MatchStatus.DISCREPANCY;

  await db.update(rapprochementLignes)
    .set({ matchStatus: status, matchedWithId: bankLineId, ecart: ecart.toFixed(2) })
    .where(eq(rapprochementLignes.id, glLineId));

  await db.update(rapprochementLignes)
    .set({ matchStatus: status, matchedWithId: glLineId, ecart: ecart.toFixed(2) })
    .where(eq(rapprochementLignes.id, bankLineId));

  await updateSessionTotals(glLine.rapprochementId);
}

/**
 * Unmatch a pair of lines.
 */
export async function unmatch(lineId: string): Promise<void> {
  const [line] = await db.select().from(rapprochementLignes).where(eq(rapprochementLignes.id, lineId)).limit(1);
  if (!line || !line.matchedWithId) throw new Error('Ligne non trouvée ou non rapprochée');

  await db.update(rapprochementLignes)
    .set({ matchStatus: MatchStatus.UNMATCHED, matchedWithId: null, ecart: '0' })
    .where(eq(rapprochementLignes.id, lineId));

  await db.update(rapprochementLignes)
    .set({ matchStatus: MatchStatus.UNMATCHED, matchedWithId: null, ecart: '0' })
    .where(eq(rapprochementLignes.id, line.matchedWithId));

  await updateSessionTotals(line.rapprochementId);
}

// ============================================================================
// COMPLETE / QUERY
// ============================================================================

/**
 * Mark reconciliation as completed.
 */
export async function completeRapprochement(
  rapprochementId: string,
  userId: string,
): Promise<void> {
  await db.update(rapprochementsBancaires)
    .set({
      statut: RapprochementStatut.COMPLETED,
      completedAt: new Date(),
      completedBy: userId,
    })
    .where(eq(rapprochementsBancaires.id, rapprochementId));
}

/**
 * Get reconciliation detail with all lines.
 */
export async function getRapprochementDetail(rapprochementId: string) {
  const [session] = await db.select().from(rapprochementsBancaires).where(eq(rapprochementsBancaires.id, rapprochementId)).limit(1);
  if (!session) throw new Error('Session de rapprochement non trouvée');

  const lines = await db
    .select()
    .from(rapprochementLignes)
    .where(eq(rapprochementLignes.rapprochementId, rapprochementId))
    .orderBy(asc(rapprochementLignes.source), asc(rapprochementLignes.dateValeur));

  return { ...session, lignes: lines };
}

/**
 * List reconciliation sessions for an agency.
 */
export async function listRapprochements(
  agenceId: string,
): Promise<RapprochementSummary[]> {
  const sessions = await db
    .select()
    .from(rapprochementsBancaires)
    .where(eq(rapprochementsBancaires.agenceId, agenceId))
    .orderBy(desc(rapprochementsBancaires.period));

  return sessions.map(s => ({
    id: s.id,
    period: s.period,
    compteGl: s.compteGl,
    statut: s.statut,
    soldeBanqueFin: parseFloat(s.soldeBanqueFin),
    soldeGlFin: parseFloat(s.soldeGlFin),
    ecart: parseFloat(s.ecart),
    matchedCount: s.matchedCount,
    unmatchedCount: s.unmatchedCount,
  }));
}

// ============================================================================
// HELPERS
// ============================================================================

async function updateSessionTotals(rapprochementId: string): Promise<void> {
  const stats = await db.execute(sql`
    SELECT
      match_status,
      COUNT(*) AS cnt,
      COALESCE(SUM(ABS(debit::numeric - credit::numeric)), 0) AS total
    FROM rapprochement_lignes
    WHERE rapprochement_id = ${rapprochementId}
    GROUP BY match_status
  `);

  let matchedCount = 0, unmatchedCount = 0, totalMatched = 0, totalUnmatched = 0;

  for (const row of stats.rows as Array<{ match_status: string; cnt: string; total: string }>) {
    if (row.match_status === 'MATCHED') {
      matchedCount = parseInt(row.cnt);
      totalMatched = parseFloat(row.total);
    } else if (row.match_status === 'UNMATCHED') {
      unmatchedCount = parseInt(row.cnt);
      totalUnmatched = parseFloat(row.total);
    }
  }

  await db.update(rapprochementsBancaires)
    .set({
      matchedCount,
      unmatchedCount,
      totalMatched: totalMatched.toFixed(2),
      totalUnmatched: totalUnmatched.toFixed(2),
    })
    .where(eq(rapprochementsBancaires.id, rapprochementId));
}
