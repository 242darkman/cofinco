import React from 'react';
import { X } from 'lucide-react';
import { useReportGenerator } from '../../hooks/useReportGenerator';
import { Card, IconButton } from '../ui';
import ReportTypeSelector from './reporting/ReportTypeSelector';
import ReportPreview from './reporting/ReportPreview';
import ReportFilters from './reporting/ReportFilters';

interface ReportGeneratorProps {
  onClose?: () => void;
}

export default function ReportGenerator({ onClose }: ReportGeneratorProps) {
  const {
    reportType, dateRange, setDateRange, format, setFormat,
    filters, setFilters, loading, previewData, loadingPreview,
    loadPreview, generatePDF, generateExcel, generateCSV, printReport,
    getPreviewColumns, getPreviewRow
  } = useReportGenerator();

  const handleGenerate = async () => {
    try {
      if (format === 'csv') await generateCSV();
      else if (format === 'excel') await generateExcel();
      else await generatePDF();
      alert('Rapport généré avec succès !');
    } catch (err) {
      alert('Erreur lors de la génération');
    }
  };

  const handlePrint = async () => {
    try {
      await printReport();
    } catch (err) {
      alert('Erreur lors de l\'impression');
    }
  };

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      {/* Header - Compact */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-content-primary truncate">
            Générateur de Rapports
          </h2>
          <p className="text-xs text-content-muted">PDF, Excel ou CSV</p>
        </div>
        {onClose && (
          <IconButton icon={X} variant="ghost" size="sm" onClick={onClose} aria-label="Fermer" />
        )}
      </div>

      <ReportTypeSelector selectedType={reportType} onSelect={loadPreview} />

      <ReportPreview
        data={previewData}
        loading={loadingPreview}
        columns={getPreviewColumns()}
        getRow={getPreviewRow}
      />

      <ReportFilters
        format={format}
        setFormat={setFormat}
        dateRange={dateRange}
        setDateRange={setDateRange}
        filters={filters}
        setFilters={setFilters}
        onGenerate={handleGenerate}
        onPrint={handlePrint}
        loading={loading}
      />
    </div>
  );
}
