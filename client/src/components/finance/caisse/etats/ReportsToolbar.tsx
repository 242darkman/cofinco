import React from 'react';
import { Download, Calendar, Filter, FileSpreadsheet, FileText } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export type ReportType = 'journal' | 'synthese' | 'mouvements' | 'ecarts';

interface ReportsToolbarProps {
  dateDebut: string;
  dateFin: string;
  typeRapport: ReportType;
  onDateDebutChange: (date: string) => void;
  onDateFinChange: (date: string) => void;
  onTypeRapportChange: (type: ReportType) => void;
  onExportPDF: () => void;
  onExportExcel: () => void;
  loading?: boolean;
}

const REPORT_TYPES: { value: ReportType; label: string; icon: React.ReactNode }[] = [
  { value: 'journal', label: 'Journal', icon: <FileText size={14} /> },
  { value: 'synthese', label: 'Synthèse', icon: <Filter size={14} /> },
  { value: 'ecarts', label: 'Écarts', icon: <Filter size={14} /> },
];

export function ReportsToolbar({
  dateDebut,
  dateFin,
  typeRapport,
  onDateDebutChange,
  onDateFinChange,
  onTypeRapportChange,
  onExportPDF,
  onExportExcel,
  loading = false,
}: ReportsToolbarProps) {
  const today = new Date().toISOString().slice(0, 10);

  const setPeriode = (type: 'today' | 'week' | 'month' | 'quarter') => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    let start = end;

    switch (type) {
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        start = weekAgo.toISOString().slice(0, 10);
        break;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        start = monthStart.toISOString().slice(0, 10);
        break;
      case 'quarter':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        start = quarterStart.toISOString().slice(0, 10);
        break;
    }

    onDateDebutChange(start);
    onDateFinChange(end);
  };

  const isToday = dateDebut === today && dateFin === today;

  return (
    <Card className="p-2 bg-slate-900/60 border-slate-800 backdrop-blur-sm shadow-lg">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {/* Période Raccourcis */}
        <div className="flex bg-slate-950/60 rounded-lg p-1 shrink-0">
          <button
            onClick={() => setPeriode('today')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              isToday
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setPeriode('week')}
            className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Semaine
          </button>
          <button
            onClick={() => setPeriode('month')}
            className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Mois
          </button>
          <button
            onClick={() => setPeriode('quarter')}
            className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Trimestre
          </button>
        </div>

        <div className="hidden lg:block h-6 w-px bg-slate-700/50" />

        {/* Sélecteur de dates */}
        <div className="flex items-center gap-2 bg-slate-950/60 rounded-lg px-3 py-2 border border-slate-800/50 group focus-within:border-cyan-500/50 transition-colors">
          <Calendar size={14} className="text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => onDateDebutChange(e.target.value)}
            className="bg-transparent border-none text-xs font-medium text-slate-300 focus:ring-0 p-0 w-28 [color-scheme:dark]"
          />
          <span className="text-slate-600 text-xs font-medium">→</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => onDateFinChange(e.target.value)}
            className="bg-transparent border-none text-xs font-medium text-slate-300 focus:ring-0 p-0 w-28 [color-scheme:dark]"
          />
        </div>

        <div className="hidden lg:block h-6 w-px bg-slate-700/50" />

        {/* Type de rapport - Tabs style */}
        <div className="flex bg-slate-950/60 rounded-lg p-1 shrink-0">
          {REPORT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onTypeRapportChange(type.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                typeRapport === type.value
                  ? 'bg-slate-800 text-white shadow-inner'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {type.icon}
              {type.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportPDF}
            disabled={loading}
            className="h-8 px-3 border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 transition-all"
          >
            <FileText size={14} className="mr-1.5" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportExcel}
            disabled={loading}
            className="h-8 px-3 border-slate-700 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all"
          >
            <FileSpreadsheet size={14} className="mr-1.5" />
            Excel
          </Button>
        </div>
      </div>
    </Card>
  );
}
