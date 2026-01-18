import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { requestListAll } from '../lib/api-client';

export interface ExcelRow {
  [key: string]: any;
}

export interface ImportResult {
  success: number;
  errors: string[];
}

interface UseExcelSheetProps {
  initialColumns: string[];
  initialData?: ExcelRow[];
}

const normalizeApiPath = (endpoint: string) =>
  endpoint.startsWith('/api/') ? endpoint.slice(4) : endpoint;

const parseEndpointParams = (endpoint: string) => {
  const [path, query] = endpoint.split('?');
  const params = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
  return { path, params };
};

export function useExcelSheet({ initialColumns, initialData = [] }: UseExcelSheetProps) {
  const [spreadsheetData, setSpreadsheetData] = useState<ExcelRow[]>(initialData);
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // --- Spreadsheet Management ---
  const addRow = useCallback(() => {
    const newRow: ExcelRow = {};
    columns.forEach(col => newRow[col] = '');
    setSpreadsheetData(prev => [...prev, newRow]);
  }, [columns]);

  const addColumn = useCallback(() => {
    const newColumnName = `Colonne ${columns.length + 1}`;
    setColumns(prev => [...prev, newColumnName]);
    setSpreadsheetData(prev => prev.map(row => ({ ...row, [newColumnName]: '' })));
  }, [columns]);

  const removeRow = useCallback((index: number) => {
    setSpreadsheetData(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateCell = useCallback((rowIndex: number, column: string, value: string) => {
    setSpreadsheetData(prev => {
        const newData = [...prev];
        newData[rowIndex] = { ...newData[rowIndex], [column]: value };
        return newData;
    });
  }, []);

  const setDataType = useCallback((newColumns: string[]) => {
      setColumns(newColumns);
      setSpreadsheetData([]); // Clear data on type change
      setImportResult(null);
  }, []);

  // --- File Handling ---
  const parseExcelFile = useCallback(async (file: File): Promise<ExcelRow[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);
                resolve(jsonData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Erreur lecture fichier'));
        reader.readAsArrayBuffer(file);
    });
  }, []);

  // --- API Handling (Generic) ---
  const processImport = useCallback(async (
      data: ExcelRow[], 
      validateRow: (row: ExcelRow, index: number) => { valid: boolean, error?: string, body?: any },
      endpoint: string
  ) => {
      setImporting(true);
      setImportResult(null);
      let successCount = 0;
      const errors: string[] = [];

      try {
          for (let i = 0; i < data.length; i++) {
              const { valid, error, body } = validateRow(data[i], i);
              
              if (!valid) {
                  errors.push(error || `Ligne ${i + 2}: Invalide`);
                  continue;
              }

              try {
                  const response = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify(body)
                  });

                  if (response.ok) {
                      successCount++;
                  } else {
                      const errData = await response.json().catch(() => ({}));
                      errors.push(`Ligne ${i + 2}: ${errData.error || 'Erreur serveur'}`);
                  }
              } catch (e: any) {
                  errors.push(`Ligne ${i + 2}: ${e.message}`);
              }
          }
           setImportResult({ success: successCount, errors });
      } catch (e: any) {
          setImportResult({ success: 0, errors: [e.message] });
      } finally {
          setImporting(false);
      }
  }, []);

  const handleExport = useCallback(async (
      type: string, 
      endpoint: string, 
      filenamePrefix: string
  ) => {
    setExporting(true);
    try {
        if (type === 'custom') {
             if (spreadsheetData.length === 0) throw new Error('Aucune donnée à exporter');
             const ws = XLSX.utils.json_to_sheet(spreadsheetData);
             const wb = XLSX.utils.book_new();
             XLSX.utils.book_append_sheet(wb, ws, 'Données');
             XLSX.writeFile(wb, `donnees_cofin_${new Date().toISOString().split('T')[0]}.xlsx`);
             return;
        }

        if (!endpoint) throw new Error('Endpoint manquant');

        let data: any[] = [];
        if (endpoint.startsWith('/api/')) {
             const { path, params } = parseEndpointParams(endpoint);
             data = await requestListAll<any>(normalizeApiPath(path), params);
        } else {
             const response = await fetch(endpoint, { credentials: 'include' });
             if (!response.ok) throw new Error(`Erreur ${response.status}`);
             const payload = await response.json();
             if (Array.isArray(payload)) {
               data = payload;
             } else if (payload?.data && Array.isArray(payload.data)) {
               data = payload.data;
             }
        }

        if (!data || data.length === 0) throw new Error('Aucune donnée à exporter');

        // Clean data (remove nulls)
        const cleanData = data.map((item: any) => {
             const clean: any = {};
             Object.keys(item).forEach(k => {
                 if (item[k] !== null && item[k] !== undefined) clean[k] = item[k];
             });
             return clean;
        });

        const ws = XLSX.utils.json_to_sheet(cleanData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, type);
        XLSX.writeFile(wb, `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);

    } catch (e: any) {
        console.error('Export error:', e);
        alert(`Erreur export: ${e.message}`);
    } finally {
        setExporting(false);
    }
  }, [spreadsheetData]);


  return {
    spreadsheetData,
    setSpreadsheetData,
    columns,
    setColumns,
    addRow,
    addColumn,
    removeRow,
    updateCell,
    setDataType,
    importing,
    exporting,
    importResult,
    parseExcelFile,
    processImport,
    handleExport,
    setImportResult // Exposed to clear it
  };
}
