/**
 * P4.1: Lazy-loaded export utilities
 * jsPDF (~350KB) + jspdf-autotable (~100KB) chargés uniquement au clic export.
 * Pour les exports Excel/CSV, utiliser '@/lib/excel-export' (ExcelJS + papaparse).
 */

/**
 * Lazy-load jsPDF and autoTable (PDF exports)
 */
export async function loadPDFLibraries() {
  const [jsPDFModule, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  return {
    jsPDF: jsPDFModule.default,
    autoTable: autoTableModule.default
  };
}

// Type exports for consumers
export type { jsPDF } from 'jspdf';
export type { default as autoTable } from 'jspdf-autotable';
