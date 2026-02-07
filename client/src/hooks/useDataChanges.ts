import { useState, useEffect } from 'react';
import { addPdfLogoHeader } from '../lib/pdf-logo';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '../lib/lazy-export';

export interface DataChange {
  id: string;
  timestamp?: string;
  tableName?: string;
  recordId?: string;
  operation: string;
  userEmail?: string;
  changedFields: any;
  oldData: any;
  newData: any;
}

export function useDataChanges() {
  const [changes, setChanges] = useState<DataChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTable, setFilterTable] = useState('all');
  const [filterOperation, setFilterOperation] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const normalizeOperation = (operation?: string) => {
    const value = (operation || '').toLowerCase();
    if (value === 'create' || value === 'insert') return 'INSERT';
    if (value === 'update') return 'UPDATE';
    if (value === 'delete' || value === 'remove') return 'DELETE';
    return operation ? operation.toUpperCase() : 'UNKNOWN';
  };

  const fetchChanges = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTable !== 'all') {
        params.append('table', filterTable);
      }
      if (filterOperation !== 'all') {
        params.append('operation', filterOperation);
      }
      params.append('limit', '100');

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur chargement modifications');
      const data = await res.json();
      const normalized = (data || []).map((log: any) => ({
        id: log.id,
        timestamp: log.timestamp ?? log.createdAt ?? log.date,
        tableName: log.tableName ?? log.resource ?? log.table,
        recordId: log.recordId ?? log.resourceId ?? log.entityId ?? log.id,
        operation: normalizeOperation(log.operation ?? log.action),
        userEmail:
          log.userEmail ??
          log.details?.username ??
          log.details?.user ??
          log.details?.email ??
          (log.userId ? `user:${String(log.userId).slice(0, 8)}` : undefined),
        changedFields: log.changedFields ?? log.details?.changes ?? log.details?.changedFields ?? null,
        oldData: log.oldData ?? log.details?.old ?? log.details?.oldData ?? null,
        newData: log.newData ?? log.details?.new ?? log.details?.newData ?? null,
      })) as DataChange[];
      setChanges(normalized);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChanges();
  }, [filterTable, filterOperation]);

  const filteredChanges = changes.filter(change => {
    if (!searchTerm) return true;
    return (
      change.tableName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      change.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      change.recordId?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const formatTimestamp = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString('fr-FR');
  };

  const exportToCSV = () => {
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const BOM = '\uFEFF';
    const separator = ';';
    
    let csvContent = BOM;
    csvContent += `JOURNAL DES MODIFICATIONS DE DONNÉES - COFIN${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Total modifications: ${filteredChanges.length}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Date/Heure${separator}Table${separator}Opération${separator}Utilisateur${separator}ID Enreg.\n`;
    
    filteredChanges.forEach((ch, idx) => {
      csvContent += `${idx + 1}${separator}${formatTimestamp(ch.timestamp)}${separator}${ch.tableName || ''}${separator}${ch.operation}${separator}${ch.userEmail || 'Système'}${separator}${ch.recordId || ''}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Modifications_Donnees_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = async () => {
    // P4.1: Lazy-load PDF library
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');

    const startY = addPdfLogoHeader(doc, {
      title: 'JOURNAL DES MODIFICATIONS',
      subtitle: `Total: ${filteredChanges.length} modifications`,
      dateRight: `Export: ${dateExport}`,
    });

    const tableData = filteredChanges.slice(0, 50).map((ch, idx) => [
      idx + 1,
      formatTimestamp(ch.timestamp),
      ch.tableName || '',
      ch.operation,
      ch.userEmail || 'Système',
      (ch.recordId || '').toString().substring(0, 8) + '...'
    ]);

    autoTable(doc, {
      head: [['N°', 'Date/Heure', 'Table', 'Opération', 'Utilisateur', 'ID']],
      body: tableData,
      startY,
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    doc.save(`COFIN_Modifications_Donnees_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: "Journal des Modifications de Données COFIN",
      dateExport: new Date().toISOString(),
      totalModifications: filteredChanges.length,
      modifications: filteredChanges.map(ch => ({
        timestamp: ch.timestamp,
        table: ch.tableName,
        operation: ch.operation,
        utilisateur: ch.userEmail,
        recordId: ch.recordId,
        changedFields: ch.changedFields
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Modifications_Donnees_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    changes: filteredChanges,
    loading,
    filterTable,
    filterOperation,
    searchTerm,
    setFilterTable,
    setFilterOperation,
    setSearchTerm,
    fetchChanges,
    exportToCSV,
    exportToPDF,
    exportToJSON,
    formatTimestamp
  };
}
