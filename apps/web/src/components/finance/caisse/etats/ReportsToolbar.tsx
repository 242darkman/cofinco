import React, { useState } from 'react';
import { Download, Calendar, FileSpreadsheet, FileText, ChevronDown, BarChart3, AlertTriangle, BookOpen } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export type ReportType = 'journal' | 'synthese' | 'ecarts';

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

const REPORT_TYPES: { value: ReportType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'journal', label: 'Journal', icon: <BookOpen size={16} />, description: 'Historique détaillé' },
  { value: 'synthese', label: 'Synthèse', icon: <BarChart3 size={16} />, description: 'Vue d\'ensemble' },
  { value: 'ecarts', label: 'Écarts', icon: <AlertTriangle size={16} />, description: 'Analyse des écarts' },
];

type PeriodType = 'today' | 'week' | 'month' | 'quarter' | 'custom';

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
  const [showExportMenu, setShowExportMenu] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  // Déterminer la période active
  const getActivePeriod = (): PeriodType => {
    if (dateDebut === today && dateFin === today) return 'today';

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (dateDebut === weekAgo.toISOString().slice(0, 10) && dateFin === today) return 'week';

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (dateDebut === monthStart.toISOString().slice(0, 10) && dateFin === today) return 'month';

    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    if (dateDebut === quarterStart.toISOString().slice(0, 10) && dateFin === today) return 'quarter';

    return 'custom';
  };

  const activePeriod = getActivePeriod();

  const setPeriode = (type: PeriodType) => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    let start = end;

    switch (type) {
      case 'today':
        start = end;
        break;
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

  const periodButtons = [
    { type: 'today' as PeriodType, label: "Aujourd'hui", shortLabel: 'Auj.' },
    { type: 'week' as PeriodType, label: 'Semaine', shortLabel: '7j' },
    { type: 'month' as PeriodType, label: 'Mois', shortLabel: 'Mois' },
    { type: 'quarter' as PeriodType, label: 'Trimestre', shortLabel: 'Trim.' },
  ];

  return (
    <Card className="bg-surface-base/80 border-edge backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Row 1: Report Type Tabs - Full width, always visible */}
      <div className="border-b border-edge/50">
        <div className="flex">
          {REPORT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onTypeRapportChange(type.value)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-xs sm:text-sm font-semibold transition-all relative ${
                typeRapport === type.value
                  ? 'text-accent bg-accent/5'
                  : 'text-content-muted hover:text-content-primary hover:bg-surface/50'
              }`}
            >
              <span className={typeRapport === type.value ? 'text-accent' : 'text-content-muted'}>
                {type.icon}
              </span>
              <span>{type.label}</span>
              {/* Active indicator */}
              {typeRapport === type.value && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-linear-to-r from-accent to-status-info" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Filters and Actions */}
      <div className="p-2 sm:p-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Left: Period + Dates */}
          <div className="flex flex-wrap gap-2 flex-1">
            {/* Period Pills - Horizontal scroll on mobile */}
            <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none shrink-0">
              {periodButtons.map((btn) => (
                <button
                  key={btn.type}
                  onClick={() => setPeriode(btn.type)}
                  className={`px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                    activePeriod === btn.type
                      ? 'bg-linear-to-r from-accent/20 to-status-info/20 text-accent ring-1 ring-accent/30'
                      : 'bg-surface/50 text-content-muted hover:text-content-primary hover:bg-surface-elevated/50'
                  }`}
                >
                  <span className="sm:hidden">{btn.shortLabel}</span>
                  <span className="hidden sm:inline">{btn.label}</span>
                </button>
              ))}
            </div>

            {/* Date Pickers */}
            <div className="flex items-center gap-1.5 bg-surface/40 rounded-lg px-2 py-1.5 border border-edge-subtle focus-within:border-accent/50 transition-colors flex-1 min-w-0">
              <Calendar size={14} className="text-content-muted shrink-0" />
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => onDateDebutChange(e.target.value)}
                className="bg-transparent border-none text-[11px] sm:text-xs font-medium text-content-secondary focus:ring-0 focus:outline-none p-0 min-w-0 w-full max-w-[100px] sm:max-w-[110px] [color-scheme:dark]"
              />
              <span className="text-content-muted text-[10px] font-bold shrink-0">→</span>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => onDateFinChange(e.target.value)}
                className="bg-transparent border-none text-[11px] sm:text-xs font-medium text-content-secondary focus:ring-0 focus:outline-none p-0 min-w-0 w-full max-w-[100px] sm:max-w-[110px] [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Right: Export Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop: Show both buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onExportPDF}
                disabled={loading}
                className="h-8 px-3 border-edge hover:border-status-danger/50 text-content-muted hover:text-status-danger hover:bg-status-danger/5 transition-all"
              >
                <FileText size={14} className="mr-1.5" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onExportExcel}
                disabled={loading}
                className="h-8 px-3 border-edge hover:border-status-success/50 text-content-muted hover:text-status-success hover:bg-status-success/5 transition-all"
              >
                <FileSpreadsheet size={14} className="mr-1.5" />
                Excel
              </Button>
            </div>

            {/* Mobile: Dropdown menu */}
            <div className="sm:hidden relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={loading}
                className="h-8 px-3 border-edge text-content-muted hover:text-content-primary hover:bg-surface"
              >
                <Download size={14} className="mr-1.5" />
                Export
                <ChevronDown size={12} className={`ml-1 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </Button>

              {showExportMenu && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  {/* Menu */}
                  <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-edge rounded-lg shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => {
                        onExportPDF();
                        setShowExportMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-content-secondary hover:bg-status-danger/10 hover:text-status-danger transition-colors"
                    >
                      <FileText size={16} />
                      Exporter PDF
                    </button>
                    <button
                      onClick={() => {
                        onExportExcel();
                        setShowExportMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-content-secondary hover:bg-status-success-bg hover:text-status-success transition-colors border-t border-edge-subtle"
                    >
                      <FileSpreadsheet size={16} />
                      Exporter Excel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="h-0.5 w-full bg-surface overflow-hidden">
          <div className="h-full w-1/3 bg-linear-to-r from-accent to-status-info animate-[shimmer_1s_ease-in-out_infinite]"
               style={{ animation: 'shimmer 1s ease-in-out infinite' }} />
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }

        /* Hide scrollbar but keep functionality */
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </Card>
  );
}
