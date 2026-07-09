/**
 * Export Comptable Service — SAGE, CIEL, EBP format adapters
 *
 * Reuses FEC data (fetchFecData) and reformats for popular accounting software.
 * Each format has specific column names, encoding, and date formatting.
 */

import { fetchFecData, FecLine, formatAmount } from "./fec-export-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('ExportComptable');

// ============================================================================
// TYPES
// ============================================================================

export type ExportFormat = 'SAGE' | 'CIEL' | 'EBP';

export interface ExportComptableResult {
  filename: string;
  content: Buffer;
  contentType: string;
  lineCount: number;
  format: ExportFormat;
  exerciceCode: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Export accounting data in SAGE, CIEL, or EBP format.
 */
export async function exportComptable(
  agenceId: string,
  exerciceId: string,
  format: ExportFormat,
  siren?: string,
): Promise<ExportComptableResult> {
  logger.info({ exerciceId, agenceId, format }, 'Starting accounting export');

  const { lines, exercice } = await fetchFecData(agenceId, exerciceId);

  let result: { content: Buffer; filename: string; contentType: string };

  switch (format) {
    case 'SAGE':
      result = formatSage(lines, exercice.code);
      break;
    case 'CIEL':
      result = formatCiel(lines, exercice.code);
      break;
    case 'EBP':
      result = formatEbp(lines, exercice.code);
      break;
    default:
      throw new Error(`Format d'export non supporté: ${format}`);
  }

  logger.info({ format, filename: result.filename, lineCount: lines.length }, 'Export generated');

  return {
    ...result,
    lineCount: lines.length,
    format,
    exerciceCode: exercice.code,
  };
}

// ============================================================================
// FORMAT ADAPTERS
// ============================================================================

/**
 * SAGE format: semicolon-separated CSV, Windows-1252 encoding.
 */
function formatSage(
  lines: FecLine[],
  exerciceCode: string,
): { content: Buffer; filename: string; contentType: string } {
  const HEADERS = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib',
    'Debit', 'Credit', 'EcrtureLettrage', 'DateLettrage',
    'ValidDate', 'Montantdevise', 'Idevise',
  ];

  const rows = lines.map(l => [
    l.journalCode, l.journalLib, l.ecritureNum, fecDateToDDMMYYYY(l.ecritureDate),
    l.compteNum, l.compteLib, l.compAuxNum, l.compAuxLib,
    l.pieceRef, fecDateToDDMMYYYY(l.pieceDate), l.ecritureLib,
    l.debit, l.credit, l.ecritureLettrage,
    l.dateLettrage ? fecDateToDDMMYYYY(l.dateLettrage) : '',
    fecDateToDDMMYYYY(l.validDate), l.montantDevise, l.iDevise,
  ]);

  const csv = HEADERS.join(';') + '\r\n' + rows.map(r => r.map(escapeCsv).join(';')).join('\r\n') + '\r\n';

  // Encode as Windows-1252
  const content = Buffer.from(csv, 'latin1');

  return {
    content,
    filename: `Export_SAGE_${exerciceCode}.csv`,
    contentType: 'text/csv; charset=windows-1252',
  };
}

/**
 * CIEL format: semicolon-separated CSV, UTF-8 (no BOM).
 */
function formatCiel(
  lines: FecLine[],
  exerciceCode: string,
): { content: Buffer; filename: string; contentType: string } {
  const HEADERS = [
    'Code journal', 'Libelle journal', 'N piece', 'Date',
    'N compte', 'Libelle compte', 'N compte auxiliaire', 'Libelle auxiliaire',
    'Reference piece', 'Date piece', 'Libelle ecriture',
    'Montant debit', 'Montant credit', 'Lettrage', 'Date lettrage',
    'Date validation', 'Montant devise', 'Code devise',
  ];

  const rows = lines.map(l => [
    l.journalCode, l.journalLib, l.ecritureNum, fecDateToDDMMYYYY(l.ecritureDate),
    l.compteNum, l.compteLib, l.compAuxNum, l.compAuxLib,
    l.pieceRef, fecDateToDDMMYYYY(l.pieceDate), l.ecritureLib,
    l.debit, l.credit, l.ecritureLettrage,
    l.dateLettrage ? fecDateToDDMMYYYY(l.dateLettrage) : '',
    fecDateToDDMMYYYY(l.validDate), l.montantDevise, l.iDevise,
  ]);

  const csv = HEADERS.join(';') + '\r\n' + rows.map(r => r.map(escapeCsv).join(';')).join('\r\n') + '\r\n';
  const content = Buffer.from(csv, 'utf-8');

  return {
    content,
    filename: `Export_CIEL_${exerciceCode}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
}

/**
 * EBP format: semicolon-separated CSV, UTF-8 with BOM.
 */
function formatEbp(
  lines: FecLine[],
  exerciceCode: string,
): { content: Buffer; filename: string; contentType: string } {
  const HEADERS = [
    'Journal', 'JournalLib', 'NumPiece', 'DateEcriture',
    'CompteGeneral', 'LibelleCompte', 'CompteAux', 'LibelleAux',
    'RefPiece', 'DatePiece', 'Libelle',
    'Debit', 'Credit', 'Lettrage', 'DateLettrage',
    'Validation', 'MontantDevise', 'Devise',
  ];

  const rows = lines.map(l => [
    l.journalCode, l.journalLib, l.ecritureNum, fecDateToDDMMYYYY(l.ecritureDate),
    l.compteNum, l.compteLib, l.compAuxNum, l.compAuxLib,
    l.pieceRef, fecDateToDDMMYYYY(l.pieceDate), l.ecritureLib,
    l.debit, l.credit, l.ecritureLettrage,
    l.dateLettrage ? fecDateToDDMMYYYY(l.dateLettrage) : '',
    fecDateToDDMMYYYY(l.validDate), l.montantDevise, l.iDevise,
  ]);

  const BOM = '\uFEFF';
  const csv = BOM + HEADERS.join(';') + '\r\n' + rows.map(r => r.map(escapeCsv).join(';')).join('\r\n') + '\r\n';
  const content = Buffer.from(csv, 'utf-8');

  return {
    content,
    filename: `Export_EBP_${exerciceCode}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/** Convert YYYYMMDD (FEC format) to DD/MM/YYYY (SAGE/CIEL/EBP format). */
function fecDateToDDMMYYYY(fecDate: string): string {
  if (!fecDate || fecDate.length !== 8) return '';
  const year = fecDate.substring(0, 4);
  const month = fecDate.substring(4, 6);
  const day = fecDate.substring(6, 8);
  return `${day}/${month}/${year}`;
}

/** Escape a CSV field: wrap in quotes if it contains semicolons, quotes, or newlines. */
function escapeCsv(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
