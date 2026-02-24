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
import TreasuryKPIStrip from './treasury/TreasuryKPIStrip';
import TreasuryInsightBox from './treasury/TreasuryInsightBox';
import TreasuryRankingChart from './treasury/TreasuryRankingChart';
import TreasuryAgencyTable from './treasury/TreasuryAgencyTable';
import TreasuryStaleDataBanner from './treasury/TreasuryStaleDataBanner';
import TreasuryComparisonChart from './treasury/TreasuryComparisonChart';
import {
  type Period, type SupervisionData,
  PERIOD_OPTIONS,
  getAgencyColor,
  computeInsights,
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

  const chartData = selectedAgencies.length > 0 ? agencyHistoryData?.history : data?.history;
  const isLoadingChart = selectedAgencies.length > 0 ? isHistoryLoading : isGlobalLoading;
  const insights = useMemo(() => data ? computeInsights(data) : [], [data]);

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
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden animate-in fade-in duration-500">
      <div className="flex-1 py-8 px-2 sm:px-4 lg:px-6 w-full space-y-8">

        {/* Stale data banner */}
        <TreasuryStaleDataBanner
          networkStatus={networkStatus}
          isFromCache={isFromCache}
          lastUpdated={lastUpdatedRef.current || undefined}
        />

        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-accent" />
              <h1 className="text-2xl font-bold text-content-primary">Supervision Trésorerie</h1>
            </div>
            <p className="mt-1 text-sm text-content-secondary ml-9">{data.breakdown.length} agences connectées</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedAgencies.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedAgencies([])} className="text-xs">
                <X size={14} className="mr-1" /> Reset
              </Button>
            )}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={!data}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg"
              >
                <Download size={16} className="mr-2" /> Export
              </Button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-edge rounded-lg shadow-xl z-50 py-1">
                    <button onClick={() => handleExport('csv')} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-subtle flex items-center gap-2 text-content-secondary">
                      <FileText size={14} className="text-content-muted" /> CSV
                    </button>
                    <button onClick={() => handleExport('excel')} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-subtle flex items-center gap-2 text-content-secondary">
                      <FileSpreadsheet size={14} className="text-status-success" /> Excel
                    </button>
                    <button onClick={() => handleExport('pdf')} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-subtle flex items-center gap-2 text-content-secondary">
                      <FileText size={14} className="text-status-danger" /> PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* KPI Strip */}
        <TreasuryKPIStrip data={data} />

        {/* Insights */}
        <TreasuryInsightBox insights={insights} />

        {/* Charts row: Ranking + AreaChart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 auto-rows-[minmax(420px,auto)]">
          {/* Ranking chart */}
          {data.ranking && data.ranking.length > 0 && (
            <Card className="rounded-xl p-6 shadow-card border-edge flex flex-col">
              <h3 className="text-sm font-semibold text-content-muted uppercase tracking-wider mb-6">
                Classement Agences
              </h3>
              <TreasuryRankingChart
                ranking={data.ranking}
                selectedAgencies={selectedAgencies}
                onToggleAgency={toggleAgency}
              />
            </Card>
          )}

          {/* Evolution / Comparison chart */}
          <Card className="rounded-xl p-6 shadow-card border-edge flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-content-muted uppercase tracking-wider">{getChartTitle()}</h3>
                {selectedAgencies.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto">
                    {selectedAgencies.map(id => {
                      const agence = data.breakdown.find(a => a.agenceId === id);
                      return (
                        <div key={id} className="flex items-center gap-1 px-2 py-0.5 bg-surface-subtle rounded-full border border-edge shrink-0">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getAgencyColor(id) }} />
                          <span className="text-xs font-medium text-content-secondary">{agence?.agenceNom}</span>
                          <button onClick={(e) => { e.stopPropagation(); toggleAgency(id); }} className="text-content-muted hover:text-content-primary">
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="bg-surface-subtle rounded-lg p-1 inline-flex text-xs font-medium shrink-0">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPeriod(opt.value)}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-medium transition-all",
                      period === opt.value
                        ? "bg-surface shadow-sm text-accent"
                        : "text-content-muted hover:text-content-secondary"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <TreasuryComparisonChart
                chartData={chartData}
                selectedAgencies={selectedAgencies}
                agencyMap={agencyMap}
                period={period}
                isLoading={isLoadingChart}
                allAgenciesHistory={data?.history}
              />
            </div>
          </Card>
        </div>

        {/* Agency Grid */}
        <TreasuryAgencyTable
          agencies={data.breakdown}
          selectedAgencies={selectedAgencies}
          onToggleAgency={toggleAgency}
        />
      </div>
    </div>
  );
}
