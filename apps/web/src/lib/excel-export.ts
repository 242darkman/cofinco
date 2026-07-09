/**
 * Export Excel/CSV (ExcelJS + papaparse).
 *
 * À importer dynamiquement depuis les composants pour préserver le
 * lazy-loading du chunk d'export :
 *   const { downloadWorkbook } = await import('@/lib/excel-export');
 */
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export interface SheetSpec {
  name: string;
  /** Bloc de titre optionnel (lignes brutes) écrit avant le tableau. */
  titleRows?: unknown[][];
  /** Lignes objet — la première ligne d'en-tête est dérivée des clés. */
  rows?: Array<Record<string, unknown>>;
  /** Lignes brutes (array of arrays), en-têtes incluses si souhaité. */
  aoa?: unknown[][];
  /** Largeurs de colonnes en caractères. */
  columnWidths?: number[];
}

/** Construit un classeur ExcelJS à partir de specs de feuilles. */
export function buildWorkbook(sheets: SheetSpec[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  for (const spec of sheets) {
    const worksheet = workbook.addWorksheet(spec.name);

    if (spec.titleRows) {
      for (const row of spec.titleRows) {
        const added = worksheet.addRow(row);
        added.font = { bold: true };
      }
    }

    if (spec.rows && spec.rows.length > 0) {
      const headers = Object.keys(spec.rows[0]);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      for (const row of spec.rows) {
        worksheet.addRow(headers.map((h) => row[h]));
      }
    } else if (spec.aoa) {
      for (const row of spec.aoa) {
        worksheet.addRow(row);
      }
    }

    if (spec.columnWidths) {
      spec.columnWidths.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });
    }
  }

  return workbook;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Génère et télécharge un fichier .xlsx. */
export async function downloadWorkbook(fileName: string, sheets: SheetSpec[]): Promise<void> {
  const workbook = buildWorkbook(sheets);
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName,
  );
}

/** Génère et télécharge un fichier .csv depuis des lignes objet. */
export function downloadCsv(fileName: string, rows: Array<Record<string, unknown>>): void {
  const csv = Papa.unparse(rows);
  // BOM UTF-8 pour l'ouverture directe dans Excel avec accents corrects
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), fileName);
}
