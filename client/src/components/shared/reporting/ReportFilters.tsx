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
}

export default function ReportFilters({
  format, setFormat, dateRange, setDateRange, filters, setFilters, onGenerate, onPrint, loading
}: ReportFiltersProps) {
  return (
    <Card variant="default" padding="sm">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 pb-2 border-b border-edge">
          <Filter className="text-primary shrink-0" size={16} />
          <h3 className="text-sm font-semibold text-content-primary">Paramètres</h3>
        </div>

        {/* Format & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Format */}
          <div>
            <label className="block text-xs font-semibold text-content-muted mb-2">Format</label>
            <div className="flex gap-1.5">
              {(['pdf', 'excel', 'csv'] as const).map((fmt) => (
                <Button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  variant={format === fmt ? 'primary' : 'ghost'}
                  size="sm"
                  className="flex-1 text-xs"
                >
                  {fmt.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs font-semibold text-content-muted mb-2 flex items-center gap-1">
              <Calendar size={12} /> Période
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="bg-surface-base text-content-primary text-xs px-2 py-2 rounded-lg border border-edge focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="bg-surface-base text-content-primary text-xs px-2 py-2 rounded-lg border border-edge focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Options */}
        <div>
          <h4 className="text-[10px] font-bold text-content-muted uppercase tracking-wider mb-2">Options</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-surface-muted rounded-lg">
              <span className="text-xs text-content-secondary">Inclure transactions</span>
              <Switch checked={filters.includeTransactions} onChange={(c) => setFilters({ ...filters, includeTransactions: c })} />
            </div>
            <div className="flex items-center justify-between p-2 bg-surface-muted rounded-lg">
              <span className="text-xs text-content-secondary">Inclure statistiques</span>
              <Switch checked={filters.includeStats} onChange={(c) => setFilters({ ...filters, includeStats: c })} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-edge">
          <Button
            onClick={onGenerate}
            isLoading={loading}
            variant="primary"
            className="flex-1"
            icon={Download}
            size="sm"
          >
            Générer ({format.toUpperCase()})
          </Button>
          <Button 
            variant="secondary" 
            icon={Printer} 
            size="sm" 
            className="sm:w-auto"
            onClick={onPrint}
            disabled={loading}
          >
            Imprimer
          </Button>
        </div>
      </div>
    </Card>
  );
}
