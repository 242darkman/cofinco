import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, X,
  Download, FileSpreadsheet, FileText
} from 'lucide-react';
import { Card, Button } from '../ui';
import { api } from '../../lib/api-client';
import { cn } from '@/lib/utils';
import { formatMoney, currencySymbol } from '@shared/config/currency';
import { useAdaptiveQuery } from '../../hooks/useAdaptiveQuery';
import { getCachedQuery, setCachedQuery, CACHE_TTL } from '../../lib/offline-db';

// Sub-components
import TreasuryCompactKPI from './treasury/TreasuryCompactKPI';
import TreasuryInsightBox from './treasury/TreasuryInsightBox';
import TreasuryRankingList from './treasury/TreasuryRankingList';
import TreasuryComparisonChart from './treasury/TreasuryComparisonChart';
import {
  type Period, 
  type SupervisionData,
  PERIOD_OPTIONS,
  computeInsights,
  calculateActiveStats,
  getActiveAgencies,
  type RankingEntry,
} from './treasury/treasury-helpers';

// ============================================================================
// Main component
// ============================================================================

export function TreasurySupervision() {
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const lastUpdatedRef = useRef<number>(0);

  // ---------- Data fetching with offline support ----------

  const cacheKey = `supervision:${period}`;

  const {
    data: supervisionData,
    isLoading: isGlobalLoading,
    networkStatus,
    isFromCache,
  } = useAdaptiveQuery<SupervisionData>(
    ['treasury-supervision', period],
    async () => {
      const result = await api.get(
        `/coffre/supervision?period=${period}&includeRanking=true&includePreviousPeriod=true`
      ) as SupervisionData;
      // Persist to IndexedDB for offline fallback
      setCachedQuery(cacheKey, result, CACHE_TTL.STATS);
      lastUpdatedRef.current = Date.now();
      return result;
    },
    {
      adaptiveStaleTime: {
        online: 15_000,
        unstable: 30_000,
        offline: Infinity,
        api_down: Infinity,
      },
      skipAdaptation: false,
    }
  );

  // Load cached data when offline and no data in React Query
  const [cachedFallback, setCachedFallback] = useState<SupervisionData | null>(null);
  useEffect(() => {
    if (!supervisionData && (networkStatus === 'offline' || networkStatus === 'api_down')) {
      getCachedQuery<SupervisionData>(cacheKey).then(cached => {
        if (cached) setCachedFallback(cached);
      });
    } else if (supervisionData) {
      setCachedFallback(null);
    }
  }, [supervisionData, networkStatus, cacheKey]);

  const data = supervisionData ?? cachedFallback;

  // History drill-down for selected agencies
  const { data: agencyHistoryData, isLoading: isHistoryLoading } = useQuery<SupervisionData>({
    queryKey: ['treasury-history', selectedAgencies.sort().join(','), period],
    queryFn: async () => {
      const ids = selectedAgencies.join(',');
      return (await api.get(`/coffre/supervision?historyFor=${ids}&period=${period}`)) as SupervisionData;
    },
    enabled: selectedAgencies.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // ---------- Derived state ----------

  const activeStats = useMemo(() => data ? calculateActiveStats(data) : null, [data]);
  const insights = useMemo(() => data ? computeInsights(data) : [], [data]);
  const criticalCount = useMemo(() => insights.filter(i => i.severity === 'danger').length, [insights]);

  const agencyMap = useMemo(() =>
    (data?.breakdown || []).reduce((acc, a) => { acc[a.agenceId] = a.agenceNom; return acc; }, {} as Record<string, string>),
    [data?.breakdown]
  );

  const toggleAgency = useCallback((id: string) => {
    setSelectedAgencies(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }, []);

  const getChartTitle = () => {
    if (selectedAgencies.length === 0) return 'Évolution Trésorerie Globale';
    if (selectedAgencies.length === 1) {
      const agence = data?.breakdown.find(a => a.agenceId === selectedAgencies[0]);
      return `Évolution : ${agence?.agenceNom || 'Agence'}`;
    }
    return 'Comparaison Agences';
  };

  // ---------- Export ----------

  const handleExport = useCallback((format: 'csv' | 'excel' | 'pdf') => {
    if (!data) return;

    const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || period;
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `tresorerie_${periodLabel.replace(/\s/g, '_')}_${timestamp}`;

    if (format === 'csv' || format === 'excel') {
      const headers = ['Agence', 'Ville', `Solde (${currencySymbol()})`, 'Rang', 'Part %', 'Statut'];
      const rows = (data.ranking || data.breakdown).map((a: any) => [
        a.agenceNom,
        a.ville || '-',
        a.solde.toLocaleString('fr-FR'),
        a.rank ?? '-',
        a.share != null ? `${a.share.toFixed(1)}%` : '-',
        a.solde > 0 ? 'Actif' : 'Vide'
      ]);

      rows.push([]);
      rows.push(['TOTAL GLOBAL', '', data.globalBalance.toLocaleString('fr-FR'), '', '', '']);
      rows.push(["Nombre d'agences", data.breakdown.length.toString(), '', '', '', '']);
      rows.push(['Période', periodLabel, '', '', '', '']);

      const sep = format === 'excel' ? '\t' : ',';
      const csvContent = [headers.join(sep), ...rows.map((row: any) => row.join(sep))].join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], {
        type: format === 'excel' ? 'application/vnd.ms-excel;charset=utf-8' : 'text/csv;charset=utf-8'
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.${format === 'excel' ? 'xls' : 'csv'}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } else if (format === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const tableRows = (data.ranking || data.breakdown).map((a: any) => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.rank ?? '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.agenceNom}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.ville || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatMoney(a.solde)}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.share != null ? a.share.toFixed(1) + '%' : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.solde > 0 ? '\u2713' : '\u25CB'}</td>
          </tr>
        `).join('');

        printWindow.document.write(`<!DOCTYPE html><html><head>
          <title>Rapport Trésorerie - ${periodLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #1e40af; margin-bottom: 5px; }
            .subtitle { color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #1e40af; color: white; padding: 10px; text-align: left; }
            tr:nth-child(even) { background: #f8fafc; }
            .summary { background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 20px; }
            .total { font-size: 24px; font-weight: bold; color: #1e40af; }
            @media print { body { padding: 0; } }
          </style></head><body>
          <h1>Rapport de Trésorerie</h1>
          <p class="subtitle">Période: ${periodLabel} | Généré le: ${new Date().toLocaleDateString('fr-FR')}</p>
          <table><thead><tr>
            <th>#</th><th>Agence</th><th>Ville</th><th>Solde</th><th>Part</th><th>Statut</th>
          </tr></thead><tbody>${tableRows}</tbody></table>
          <div class="summary">
            <p><strong>Résumé</strong></p>
            <p class="total">${formatMoney(data.globalBalance)}</p>
            <p>Trésorerie globale sur ${data.breakdown.length} agences</p>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body></html>`);
        printWindow.document.close();
      }
    }
    setShowExportMenu(false);
  }, [data, period]);

  // ---------- Render ----------

  if (isGlobalLoading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-content-muted">Synchronisation de la supervision...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Supervision Trésorerie</h1>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-tight">
                {activeStats?.activeCount || 0} {activeStats?.activeCount && activeStats.activeCount > 1 ? 'agences actives' : 'agence active'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all",
                  period === opt.value
                    ? "bg-white shadow-sm text-emerald-600"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          
          <div className="h-8 w-px bg-slate-200 mx-2" />

          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="h-9 px-3 text-xs font-semibold rounded-lg bg-white border-slate-200"
              >
                <Download size={14} className="mr-2" /> Export
              </Button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                    <button onClick={() => handleExport('csv')} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-slate-50 flex items-center gap-3 text-slate-600">
                      <FileText size={14} className="text-slate-400" /> CSV
                    </button>
                    <button onClick={() => handleExport('excel')} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-slate-50 flex items-center gap-3 text-slate-600">
                      <FileSpreadsheet size={14} className="text-emerald-500" /> Excel
                    </button>
                    <button onClick={() => handleExport('pdf')} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-slate-50 flex items-center gap-3 text-slate-600">
                      <FileText size={14} className="text-rose-500" /> PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 space-y-6">
        {/* Stale Data Banner and other potential top-level alerts */}
        
        {/* Compact KPI Row */}
        {activeStats && (
          <TreasuryCompactKPI 
            data={data} 
            activeStats={activeStats} 
            criticalCount={criticalCount} 
          />
        )}

        {/* Main Content Area: 60/40 Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[450px]">
          {/* Left Block: Modern Graph (60%) */}
          <div className="lg:col-span-7 flex flex-col">
            <Card className="rounded-xl p-4 shadow-sm border-slate-200 flex flex-col h-full bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{getChartTitle()}</h3>
                {selectedAgencies.length > 0 && (
                  <button onClick={() => setSelectedAgencies([])} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-tight flex items-center gap-1">
                    <X size={12} /> Réinitialiser
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-[350px]">
                <TreasuryComparisonChart
                  chartData={selectedAgencies.length > 0 ? agencyHistoryData?.history : data?.history}
                  selectedAgencies={selectedAgencies}
                  agencyMap={agencyMap}
                  period={period}
                  isLoading={selectedAgencies.length > 0 ? isHistoryLoading : isGlobalLoading}
                  allAgenciesHistory={data?.history}
                />
              </div>
            </Card>
          </div>

          {/* Right Block: Ranking List (40%) */}
          <div className="lg:col-span-5 flex flex-col">
            <Card className="rounded-xl p-0 shadow-sm border-slate-200 flex flex-col h-full bg-white overflow-hidden">
               <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classement Agences</h3>
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                   {activeStats?.activeCount || 0} {activeStats?.activeCount && activeStats.activeCount > 1 ? 'ACTIVES' : 'ACTIVE'}
                 </span>
               </div>
               
               <TreasuryRankingList 
                 ranking={getActiveAgencies(data.ranking || data.breakdown) as RankingEntry[]}
                 onToggleAgency={toggleAgency}
                 selectedAgencies={selectedAgencies}
               />
               
               {insights.length > 0 && (
                 <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                    <TreasuryInsightBox insights={insights} />
                 </div>
               )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
