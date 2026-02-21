import React from 'react';
import { X } from 'lucide-react';
import { useReportGenerator, reportTypes } from '../../hooks/useReportGenerator';
import { Card, IconButton } from '../ui';
import ReportTypeSelector from './reporting/ReportTypeSelector';
import ReportPreview from './reporting/ReportPreview';
import ReportFilters from './reporting/ReportFilters';
import { toast } from '../../lib/toast';

interface ReportGeneratorProps {
  onClose?: () => void;
  filter?: string[];
}

export default function ReportGenerator({ onClose, filter }: ReportGeneratorProps) {
  const {
    reportType, dateRange, setDateRange, format, setFormat,
    filters, setFilters, loading, previewData, loadingPreview,
    loadPreview, generatePDF, generateExcel, generateCSV, printReport,
    getPreviewColumns, getPreviewRow
  } = useReportGenerator();

  const getReportLabel = () => {
    const type = reportTypes.find(t => t.id === reportType);
    return type?.label || 'Rapport';
  };

  const getFormatLabel = () => {
    switch (format) {
      case 'csv': return 'CSV';
      case 'excel': return 'Excel';
      default: return 'PDF';
    }
  };

  const handleGenerate = async () => {
    try {
      if (format === 'csv') await generateCSV();
      else if (format === 'excel') await generateExcel();
      else await generatePDF();
      toast.success(`${getReportLabel()} exporté en ${getFormatLabel()}`);
    } catch (err) {
      toast.error(`Erreur lors de la génération du ${getReportLabel().toLowerCase()}`);
    }
  };

  const handlePrint = async () => {
    try {
      await printReport();
      toast.success(`${getReportLabel()} envoyé à l'impression`);
    } catch (err) {
      toast.error("Erreur lors de l'impression");
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

      <ReportTypeSelector selectedType={reportType} onSelect={loadPreview} filter={filter} />

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
        reportType={reportType}
        context={filter}
      />
    </div>
  );
}
