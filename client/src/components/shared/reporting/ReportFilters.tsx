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
    <Card variant="glass" padding="none" className="overflow-hidden">
      {/* Header with Title and Actions integrated */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge/50 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Filter size={16} />
          </div>
          <h3 className="text-sm font-semibold text-content-primary">Paramètres</h3>
        </div>
        
        {/* Format Selector as Segmented Control in Header */}
        <div className="bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 flex">
          {(['pdf', 'excel', 'csv'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setFormat(fmt)}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                format === fmt 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date Range - Compact */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
              <Calendar size={12} /> Période d'analyse
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <span className="text-slate-600">→</span>
              <div className="relative flex-1">
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Options - Grid instead of stacked */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Options</label>
            <div className="grid grid-cols-2 gap-2">
              <div 
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                  filters.includeTransactions 
                    ? 'bg-indigo-500/5 border-indigo-500/20' 
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <span className="text-xs text-slate-300">Transactions</span>
                <Switch 
                  checked={filters.includeTransactions} 
                  onChange={(c) => setFilters({ ...filters, includeTransactions: c })} 
                  size="sm"
                />
              </div>
              <div 
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                  filters.includeStats 
                    ? 'bg-indigo-500/5 border-indigo-500/20' 
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <span className="text-xs text-slate-300">Statistiques</span>
                <Switch 
                  checked={filters.includeStats} 
                  onChange={(c) => setFilters({ ...filters, includeStats: c })} 
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 bg-slate-950/30 border-t border-edge/50 flex items-center justify-end gap-3">
        <Button 
          variant="secondary" 
          icon={Printer} 
          className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          onClick={onPrint}
          disabled={loading}
        >
          Imprimer
        </Button>
        <Button
          onClick={onGenerate}
          isLoading={loading}
          variant="primary"
          className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border-0 shadow-lg shadow-indigo-900/20"
          icon={Download}
        >
          Générer ({format.toUpperCase()})
        </Button>
      </div>
    </Card>
  );
}
