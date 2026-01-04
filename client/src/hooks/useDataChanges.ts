import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export interface DataChange {
  id: string;
  timestamp?: string;
  table_name?: string;
  record_id?: string;
  operation: string;
  user_email?: string;
  changed_fields: any;
  old_data: any;
  new_data: any;
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
        timestamp: log.timestamp ?? log.createdAt ?? log.created_at ?? log.date,
        table_name: log.table_name ?? log.resource ?? log.table,
        record_id: log.record_id ?? log.resourceId ?? log.resource_id ?? log.entityId ?? log.id,
        operation: normalizeOperation(log.operation ?? log.action),
        user_email:
          log.user_email ??
          log.userEmail ??
          log.details?.username ??
          log.details?.user ??
          log.details?.email ??
          (log.userId ? `user:${String(log.userId).slice(0, 8)}` : undefined),
        changed_fields: log.changed_fields ?? log.details?.changes ?? log.details?.changedFields ?? null,
        old_data: log.old_data ?? log.details?.old ?? log.details?.oldData ?? null,
        new_data: log.new_data ?? log.details?.new ?? log.details?.newData ?? null,
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
      change.table_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      change.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      change.record_id?.toLowerCase().includes(searchTerm.toLowerCase())
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
      csvContent += `${idx + 1}${separator}${formatTimestamp(ch.timestamp)}${separator}${ch.table_name || ''}${separator}${ch.operation}${separator}${ch.user_email || 'Système'}${separator}${ch.record_id || ''}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Modifications_Donnees_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');
    
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text("JOURNAL DES MODIFICATIONS - COFIN", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date d'export: ${dateExport} | Total: ${filteredChanges.length} modifications`, 14, 28);
    
    const tableData = filteredChanges.slice(0, 50).map((ch, idx) => [
      idx + 1,
      formatTimestamp(ch.timestamp),
      ch.table_name || '',
      ch.operation,
      ch.user_email || 'Système',
      (ch.record_id || '').toString().substring(0, 8) + '...'
    ]);
    
    (doc as any).autoTable({
      head: [['N°', 'Date/Heure', 'Table', 'Opération', 'Utilisateur', 'ID']],
      body: tableData,
      startY: 35,
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
        table: ch.table_name,
        operation: ch.operation,
        utilisateur: ch.user_email,
        recordId: ch.record_id,
        changedFields: ch.changed_fields
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
