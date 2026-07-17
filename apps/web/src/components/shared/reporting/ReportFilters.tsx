import React from 'react';
import { Calendar, Filter, Download, Printer } from 'lucide-react';
import { Card, Button } from '../../ui';
import Switch from '../../ui/Switch';

interface ReportFiltersProps {
  format: 'pdf' | 'excel' | 'csv';
  setFormat: (format: 'pdf' | 'excel' | 'csv') => void;
  dateRange: { start: string; end: string };
  setDateRange: (range: { start: string; end: string }) => void;
  filters: { includeTransactions: boolean; includeStats: boolean };
  setFilters: (filters: any) => void;
  onGenerate: () => void;
  onPrint: () => void;
  loading: boolean;
  reportType?: string;
  context?: string[];
}

const HR_REPORT_IDS = ['registre-personnel', 'bilan-social'];

export default function ReportFilters({
  format, setFormat, dateRange, setDateRange, filters, setFilters, onGenerate, onPrint, loading,
  reportType, context
}: ReportFiltersProps) {
  const noSelection = !reportType;
  const isHrContext = context?.every(id => HR_REPORT_IDS.includes(id));

  return (
    <Card variant="glass" padding="none" className="overflow-hidden">
      {/* Header with Title and Actions integrated */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge/50 bg-surface-base/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
            <Filter size={16} />
          </div>
          <h3 className="text-sm font-semibold text-content-primary">Paramètres</h3>
        </div>

        {/* Format Selector as Segmented Control in Header */}
        <div className="bg-surface-base/80 p-0.5 rounded-lg border border-edge flex">
          {(['pdf', 'excel', 'csv'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setFormat(fmt)}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                format === fmt
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content-muted hover:text-content-secondary hover:bg-surface/50'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className={`grid grid-cols-1 ${isHrContext ? '' : 'md:grid-cols-2'} gap-4`}>
          {/* Date Range - Compact */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-content-muted flex items-center gap-1.5">
              <Calendar size={12} /> Période d'analyse
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full bg-surface-base text-content-secondary text-xs px-3 py-2 rounded-lg border border-edge focus:ring-1 focus:ring-accent focus:border-accent outline-none"
                />
              </div>
              <span className="text-content-muted">→</span>
              <div className="relative flex-1">
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full bg-surface-base text-content-secondary text-xs px-3 py-2 rounded-lg border border-edge focus:ring-1 focus:ring-accent focus:border-accent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Options - Only show for non-HR contexts */}
          {!isHrContext && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-content-muted">Options</label>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                    filters.includeTransactions
                      ? 'bg-accent/5 border-accent/20'
                      : 'bg-surface-base border-edge'
                  }`}
                >
                  <span className="text-xs text-content-secondary">Transactions</span>
                  <Switch
                    checked={filters.includeTransactions}
                    onChange={(c) => setFilters({ ...filters, includeTransactions: c })}
                    size="sm"
                  />
                </div>
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                    filters.includeStats
                      ? 'bg-accent/5 border-accent/20'
                      : 'bg-surface-base border-edge'
                  }`}
                >
                  <span className="text-xs text-content-secondary">Statistiques</span>
                  <Switch
                    checked={filters.includeStats}
                    onChange={(c) => setFilters({ ...filters, includeStats: c })}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 bg-surface-base/30 border-t border-edge/50 flex items-center justify-end gap-3">
        {noSelection && (
          <span className="text-xs text-content-muted mr-auto">Sélectionnez un type de rapport</span>
        )}
        <Button
          variant="secondary"
          icon={Printer}
          className="border-edge text-content-secondary hover:text-content-primary hover:bg-surface"
          onClick={onPrint}
          disabled={loading || noSelection}
        >
          Imprimer
        </Button>
        <Button
          onClick={onGenerate}
          isLoading={loading}
          variant="primary"
          className="bg-linear-to-r from-accent to-accent hover:from-accent hover:to-accent border-0 shadow-lg shadow-accent/20"
          icon={Download}
          disabled={noSelection}
        >
          Générer ({format.toUpperCase()})
        </Button>
      </div>
    </Card>
  );
}
