import React, { useState } from 'react';
import DataChangesList from './datachanges/DataChangesList';
import DataChangesHeader from './datachanges/DataChangesHeader';
import DataChangesDetailModal from './datachanges/DataChangesDetailModal';
import { useDataChanges, DataChange } from '../../hooks/useDataChanges';

export default function DataChangesViewer() {
  const {
    changes,
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
  } = useDataChanges();

  const [selectedChange, setSelectedChange] = useState<DataChange | null>(null);

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-in fade-in duration-500">
      <DataChangesHeader
        onExportCSV={exportToCSV}
        onExportPDF={exportToPDF}
        onExportJSON={exportToJSON}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterTable={filterTable}
        setFilterTable={setFilterTable}
        filterOperation={filterOperation}
        setFilterOperation={setFilterOperation}
        onRefresh={fetchChanges}
        loading={loading}
      />

      <DataChangesList
        changes={changes}
        loading={loading}
        onSelect={setSelectedChange}
        formatTimestamp={formatTimestamp}
      />

      <DataChangesDetailModal
        change={selectedChange}
        onClose={() => setSelectedChange(null)}
        formatTimestamp={formatTimestamp}
      />
    </div>
  );
}
