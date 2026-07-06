/**
 * P4.1: Lazy-loaded export utilities
 * jsPDF (~350KB) + xlsx (~200KB) + jspdf-autotable (~100KB) = ~650KB
 * These are only loaded when user clicks export, not on initial page load
 */

// Cache the loaded modules to avoid re-importing
let cachedModules: {
  jsPDF: typeof import('jspdf').default;
  autoTable: typeof import('jspdf-autotable').default;
  XLSX: typeof import('xlsx');
} | null = null;

/**
 * Lazy-load export libraries on demand
 * Uses Promise.all for parallel loading
 */
export async function loadExportLibraries() {
  if (cachedModules) {
    return cachedModules;
  }

  const [jsPDFModule, autoTableModule, xlsxModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('xlsx')
  ]);

  cachedModules = {
    jsPDF: jsPDFModule.default,
    autoTable: autoTableModule.default,
    XLSX: xlsxModule
  };

  return cachedModules;
}

/**
 * Lazy-load only jsPDF and autoTable (for PDF-only exports)
 * Saves ~200KB if xlsx not needed
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

/**
 * Lazy-load only xlsx (for Excel/CSV exports)
 * Saves ~450KB if PDF not needed
 */
export async function loadExcelLibrary() {
  const xlsxModule = await import('xlsx');
  return xlsxModule;
}

// Type exports for consumers
export type { jsPDF } from 'jspdf';
export type { default as autoTable } from 'jspdf-autotable';
