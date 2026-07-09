/**
 * FEC Export Service — Fichier des Écritures Comptables
 *
 * Generates FEC files compliant with Article A47 A-1 of the French tax code.
 * 18 pipe-delimited columns, UTF-8 + BOM encoding.
 * Sorted by JournalCode > EcritureDate > EcritureNum.
 */

import { db } from "../db";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  ecritures,
  lignesEcritures,
  journaux,
  planComptable,
  exercices,
  EntryStatus,
} from "@shared/schema";
import { clients } from "@shared/schema/clients";
import { users } from "@shared/schema/auth";
import { createLogger } from "../lib/logger";

const logger = createLogger('FecExport');

// ============================================================================
// TYPES
// ============================================================================

export interface FecResult {
  filename: string;
  content: string;
  lineCount: number;
  exerciceCode: string;
}

export interface FecLine {
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  ecritureDate: string;
  compteNum: string;
  compteLib: string;
  compAuxNum: string;
  compAuxLib: string;
  pieceRef: string;
  pieceDate: string;
  ecritureLib: string;
  debit: string;
  credit: string;
  ecritureLettrage: string;
  dateLettrage: string;
  validDate: string;
  montantDevise: string;
  iDevise: string;
}

export interface FecData {
  lines: FecLine[];
  exercice: typeof exercices.$inferSelect;
}

// ============================================================================
// DATA FETCHER (shared by FEC + SAGE/CIEL/EBP exports)
// ============================================================================

/**
 * Fetch all FEC-compatible data for an exercice.
 * Shared by generateFEC() and export-comptable-service.ts.
 */
export async function fetchFecData(
  agenceId: string,
  exerciceId: string,
): Promise<FecData> {
  // 1. Get exercice info
  const [exercice] = await db
    .select()
    .from(exercices)
    .where(eq(exercices.id, exerciceId))
    .limit(1);

  if (!exercice) {
    throw new Error(`Exercice ${exerciceId} non trouvé`);
  }

  // 2. Query all posted entries for this exercice with lines
  const rows = await db
    .select({
      ecritureId: ecritures.id,
      numeroPiece: ecritures.numeroPiece,
      dateEcriture: ecritures.dateEcriture,
      libelle: ecritures.libelle,
      metadata: ecritures.metadata,
      validatedAt: ecritures.validatedAt,
      journalCode: journaux.code,
      journalIntitule: journaux.intitule,
      ligneId: lignesEcritures.id,
      numeroCompte: lignesEcritures.numeroCompte,
      ligneLibelle: lignesEcritures.libelle,
      debit: lignesEcritures.debit,
      credit: lignesEcritures.credit,
      lettrageKey: lignesEcritures.lettrageKey,
      lettrageDate: lignesEcritures.lettrageDate,
      compteIntitule: planComptable.intitule,
    })
    .from(lignesEcritures)
    .innerJoin(ecritures, eq(lignesEcritures.ecritureId, ecritures.id))
    .innerJoin(journaux, eq(ecritures.journalId, journaux.id))
    .innerJoin(planComptable, eq(lignesEcritures.compteId, planComptable.id))
    .where(
      and(
        eq(ecritures.exerciceId, exerciceId),
        eq(ecritures.agenceId, agenceId),
        eq(ecritures.statut, EntryStatus.POSTED),
      )
    )
    .orderBy(
      asc(journaux.code),
      asc(ecritures.dateEcriture),
      asc(ecritures.numeroPiece),
    );

  if (rows.length === 0) {
    throw new Error(`Aucune écriture trouvée pour l'exercice ${exercice.code}`);
  }

  // 3. Pre-load client names for auxiliary accounts
  const clientIds = new Set<string>();
  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.clientId && typeof meta.clientId === 'string' && row.numeroCompte.startsWith('411')) {
      clientIds.add(meta.clientId);
    }
  }

  const clientNameMap = new Map<string, string>();
  if (clientIds.size > 0) {
    const clientRows = await db
      .select({ id: clients.id, nom: users.nom, prenom: users.prenom })
      .from(clients)
      .leftJoin(users, eq(clients.userId, users.id))
      .where(sql`${clients.id} IN (${sql.join([...clientIds].map(id => sql`${id}::uuid`), sql`, `)})`);

    for (const c of clientRows) {
      clientNameMap.set(c.id, [c.nom, c.prenom].filter(Boolean).join(' '));
    }
  }

  // 4. Build FEC lines
  const lines: FecLine[] = rows.map(row => {
    const meta = row.metadata as Record<string, unknown> | null;
    const clientId = meta?.clientId as string | undefined;
    const isAuxAccount = row.numeroCompte.startsWith('411') || row.numeroCompte.startsWith('401');

    return {
      journalCode: row.journalCode,
      journalLib: row.journalIntitule,
      ecritureNum: row.numeroPiece,
      ecritureDate: formatDateFEC(row.dateEcriture),
      compteNum: row.numeroCompte,
      compteLib: row.compteIntitule,
      compAuxNum: isAuxAccount && clientId ? clientId : '',
      compAuxLib: isAuxAccount && clientId ? (clientNameMap.get(clientId) || '') : '',
      pieceRef: row.numeroPiece,
      pieceDate: formatDateFEC(row.dateEcriture),
      ecritureLib: row.libelle || row.ligneLibelle || '',
      debit: formatAmount(row.debit),
      credit: formatAmount(row.credit),
      ecritureLettrage: row.lettrageKey || '',
      dateLettrage: row.lettrageDate ? formatDateFEC(row.lettrageDate) : '',
      validDate: row.validatedAt ? formatDateFEC(row.validatedAt.toISOString().split('T')[0]) : formatDateFEC(row.dateEcriture),
      montantDevise: '',
      iDevise: 'XAF',
    };
  });

  return { lines, exercice };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate a complete FEC file for an exercice.
 */
export async function generateFEC(
  agenceId: string,
  exerciceId: string,
  siren?: string,
): Promise<FecResult> {
  logger.info({ exerciceId, agenceId }, 'Generating FEC');

  const { lines: fecLines, exercice } = await fetchFecData(agenceId, exerciceId);

  // Build file content
  const header = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib',
    'Debit', 'Credit', 'EcrtureLettrage', 'DateLettrage',
    'ValidDate', 'Montantdevise', 'Idevise',
  ].join('|');

  const dataLines = fecLines.map(l => [
    l.journalCode, l.journalLib, l.ecritureNum, l.ecritureDate,
    l.compteNum, l.compteLib, l.compAuxNum, l.compAuxLib,
    l.pieceRef, l.pieceDate, l.ecritureLib,
    l.debit, l.credit, l.ecritureLettrage, l.dateLettrage,
    l.validDate, l.montantDevise, l.iDevise,
  ].join('|'));

  // UTF-8 BOM + header + data
  const BOM = '\uFEFF';
  const content = BOM + header + '\n' + dataLines.join('\n') + '\n';

  // Filename: {SIREN}FEC{YYYYMMDD}.txt (YYYYMMDD = last day of exercice)
  const sirenCode = siren || '000000000';
  const dateFin = exercice.dateFin.replace(/-/g, '');
  const filename = `${sirenCode}FEC${dateFin}.txt`;

  logger.info({ filename, lineCount: fecLines.length, exercice: exercice.code }, 'FEC generated');

  return {
    filename,
    content,
    lineCount: fecLines.length,
    exerciceCode: exercice.code,
  };
}

/**
 * Preview first N lines of a FEC export (returns structured data, not the file).
 */
export async function previewFEC(
  agenceId: string,
  exerciceId: string,
  limit: number = 50,
): Promise<{ headers: string[]; rows: string[][]; totalLines: number }> {
  const fec = await generateFEC(agenceId, exerciceId);
  const lines = fec.content.split('\n').filter(l => l.trim());

  // Remove BOM from first line
  const headers = lines[0].replace('\uFEFF', '').split('|');
  const dataRows = lines.slice(1, limit + 1).map(l => l.split('|'));

  return {
    headers,
    rows: dataRows,
    totalLines: fec.lineCount,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateFEC(date: string): string {
  return date.replace(/-/g, '');
}

export function formatAmount(value: string): string {
  const num = parseFloat(value || '0');
  if (num === 0) return '0,00';
  return num.toFixed(2).replace('.', ',');
}
