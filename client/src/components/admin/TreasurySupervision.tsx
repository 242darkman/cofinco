import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Building2, TrendingUp, TrendingDown,
  Search, ChevronLeft, ChevronRight, X,
  Download, FileSpreadsheet, FileText
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, Button, Badge, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import { api } from '../../lib/api-client';
import { cn } from '@/lib/utils';

// --- Constants & Helpers ---
const AGENCY_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

const getAgencyColor = (agencyId: string) => {
    let hash = 0;
    for (let i = 0; i < agencyId.length; i++) {
        hash = agencyId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AGENCY_COLORS.length;
    return AGENCY_COLORS[index];
};

const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR').format(val);
};

// --- Sub-components ---

function ChartSkeleton() {
  return (
    <div className="w-full h-[200px] bg-surface-muted/50 rounded-lg animate-pulse flex items-center justify-center">
      <TrendingUp size={40} className="opacity-10" />
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  agencyMap: Record<string, string>;
  period?: string;
}

const CustomTooltip = ({ active, payload, label, agencyMap, period }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  const dataPoints = payload
    .filter(p => p.dataKey !== 'balance')
    .sort((a, b) => b.value - a.value);

  const total = payload.find(p => p.dataKey === 'balance')?.value;

  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (period === 'today') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' — Aujourd\'hui';
    if (period === '1y') return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-xl p-4 min-w-[200px] backdrop-blur-sm bg-card/95">
      <p className="text-sm font-semibold mb-3 border-b pb-2 text-foreground">
        {formatTooltipDate(label!)}
      </p>
      <div className="space-y-2.5">
        {dataPoints.map((p, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {agencyMap[p.dataKey] || p.name}
              </span>
            </div>
            <span className="text-sm font-bold font-mono text-foreground">
              {formatCurrency(p.value)}
            </span>
          </div>
        ))}
        {dataPoints.length > 1 && (
             <div className="pt-2 border-t mt-1 flex justify-between items-center opacity-80">
                <span className="text-xs font-semibold">TOTAL SÉLECTION</span>
                <span className="text-sm font-bold font-mono">{formatCurrency(total)}</span>
             </div>
        )}
        {dataPoints.length === 0 && total !== undefined && (
            <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Solde Global</span>
                <span className="text-sm font-bold font-mono">{formatCurrency(total)}</span>
            </div>
        )}
      </div>
    </div>
  );
};

// --- Types ---
interface TreasuryStats {
  globalBalance: number;
  breakdown: Array<{
    agenceId: string;
    agenceNom: string;
    ville: string;
    solde: number;
  }>;
  history: Array<{
    date: string;
    balance: number;
  }>;
}

// --- Components ---

type Period = 'today' | '7d' | '30d' | '1y';
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Aujourd\'hui' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '1 mois' },
  { value: '1y', label: '1 an' },
];

export function TreasurySupervision() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const ITEMS_PER_PAGE = 12;

  // 1. Global Data Poll - reduced from 5s to 30s for network efficiency
  const { data: _globalStats, isLoading: isGlobalLoading, refetch: refetchGlobal } = useQuery<TreasuryStats>({
    queryKey: ['treasury-supervision', period],
    queryFn: async (): Promise<TreasuryStats> => {
      return (await api.get(`/coffre/supervision?period=${period}`)) as TreasuryStats;
    },
    refetchInterval: 30000, // 30s - optimized for slow connections
    staleTime: 15000, // Consider data fresh for 15s
    placeholderData: keepPreviousData
  });
  const globalStats = _globalStats as TreasuryStats | undefined;

  // Export functionality
  const handleExport = useCallback((format: 'csv' | 'excel' | 'pdf') => {
    if (!globalStats) return;

    const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || period;
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `tresorerie_${periodLabel.replace(/\s/g, '_')}_${timestamp}`;

    if (format === 'csv' || format === 'excel') {
      // Generate CSV content
      const headers = ['Agence', 'Ville', 'Solde (FCFA)', 'Statut'];
      const rows = globalStats.breakdown.map(a => [
        a.agenceNom,
        a.ville || '-',
        a.solde.toLocaleString('fr-FR'),
        a.solde > 0 ? 'Actif' : 'Vide'
      ]);

      // Add summary row
      rows.push([]);
      rows.push(['TOTAL GLOBAL', '', globalStats.globalBalance.toLocaleString('fr-FR'), '']);
      rows.push(['Nombre d\'agences', globalStats.breakdown.length.toString(), '', '']);
      rows.push(['Période', periodLabel, '', '']);

      const csvContent = [
        headers.join(format === 'excel' ? '\t' : ','),
        ...rows.map(row => row.join(format === 'excel' ? '\t' : ','))
      ].join('\n');

      const bom = '\uFEFF'; // UTF-8 BOM for Excel
      const blob = new Blob([bom + csvContent], {
        type: format === 'excel'
          ? 'application/vnd.ms-excel;charset=utf-8'
          : 'text/csv;charset=utf-8'
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.${format === 'excel' ? 'xls' : 'csv'}`;
      link.click();
    } else if (format === 'pdf') {
      // Open print dialog for PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const tableRows = globalStats.breakdown.map(a => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.agenceNom}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.ville || '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${a.solde.toLocaleString('fr-FR')} FCFA</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${a.solde > 0 ? '✓ Actif' : '○ Vide'}</td>
          </tr>
        `).join('');

        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
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
            </style>
          </head>
          <body>
            <h1>Rapport de Trésorerie</h1>
            <p class="subtitle">Période: ${periodLabel} | Généré le: ${new Date().toLocaleDateString('fr-FR')}</p>

            <table>
              <thead>
                <tr>
                  <th>Agence</th>
                  <th>Ville</th>
                  <th>Solde</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <div class="summary">
              <p><strong>Résumé</strong></p>
              <p class="total">${globalStats.globalBalance.toLocaleString('fr-FR')} FCFA</p>
              <p>Trésorerie globale sur ${globalStats.breakdown.length} agences</p>
            </div>

            <script>window.onload = function() { window.print(); }</script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    }

    setShowExportMenu(false);
  }, [globalStats, period]);

  // 2. Specific History Poll (for drill-down)
  // Only fetch if agencies are selected
  const { data: agencyHistoryData, isLoading: isHistoryLoading } = useQuery<TreasuryStats>({
    queryKey: ['treasury-history', selectedAgencies.sort().join(','), period],
    queryFn: async () => {
       const ids = selectedAgencies.join(',');
       return (await api.get(`/coffre/supervision?historyFor=${ids}&period=${period}`)) as TreasuryStats;
    },
    enabled: selectedAgencies.length > 0,
    refetchInterval: 30000, // 30s - optimized for slow connections
    staleTime: 15000
  });

  // --- Derived State & Helpers ---

  // Determine which history to show: Global or Specific
  const chartData = selectedAgencies.length > 0 ? agencyHistoryData?.history : globalStats?.history;
  const isLoadingChart = selectedAgencies.length > 0 ? isHistoryLoading : isGlobalLoading;
  
  // Grid Filtering & Pagination
  const filteredAgencies = useMemo(() => {
    return globalStats?.breakdown.filter(a => 
      a.agenceNom.toLowerCase().includes(searchTerm.toLowerCase()) || 
      a.ville?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];
  }, [globalStats, searchTerm]);

  const totalPages = Math.ceil(filteredAgencies.length / ITEMS_PER_PAGE);
  const paginatedAgencies = filteredAgencies.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const toggleAgency = (id: string) => {
    setSelectedAgencies(prev => {
        if (prev.includes(id)) return prev.filter(x => x !== id);
        if (prev.length >= 2) return [prev[1], id]; // Keep max 2, shift selection
        return [...prev, id];
    });
  };

  const getChartTitle = () => {
     if (selectedAgencies.length === 0) return `Évolution Trésorerie Globale`;
     if (selectedAgencies.length === 1) {
         const agence = globalStats?.breakdown.find(a => a.agenceId === selectedAgencies[0]);
         return `Évolution : ${agence?.agenceNom || 'Agence'}`;
     }
     return `Comparaison Agences`;
  };

  // --- Render ---

  if (isGlobalLoading && !globalStats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Synchronisation de la supervision...</p>
        </div>
      </div>
    );
  }

  // Calculate generic growth for header card (always global)
  const calculateGrowth = (history: any[]) => {
    if (!history || history.length < 2) return 0;
    const current = history[history.length - 1].balance;
    const previous = history[history.length - 2].balance;
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const globalGrowth = calculateGrowth(globalStats?.history || []);
  const isPositive = globalGrowth >= 0;

  return (
    <div className="flex flex-col h-full space-y-2 overflow-y-auto overflow-x-hidden animate-in fade-in duration-500">
      {/* 1. Header - Ultra Compact */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-accent" />
          <div>
            <h2 className="text-sm font-bold text-content-primary">Supervision Trésorerie</h2>
            <p className="text-[10px] text-content-muted">{globalStats?.breakdown.length || 0} agences</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {selectedAgencies.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedAgencies([])} className="h-6 px-2 text-[10px]">
              <X size={10} className="mr-1"/> Reset
            </Button>
          )}
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowExportMenu(!showExportMenu)} className="h-6 px-2 text-[10px]" disabled={!globalStats}>
              <Download size={10} className="mr-1" /> Export
            </Button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                  <button onClick={() => handleExport('csv')} className="w-full px-3 py-1.5 text-left text-[10px] hover:bg-muted flex items-center gap-2">
                    <FileText size={12} className="text-content-muted" /> CSV
                  </button>
                  <button onClick={() => handleExport('excel')} className="w-full px-3 py-1.5 text-left text-[10px] hover:bg-muted flex items-center gap-2">
                    <FileSpreadsheet size={12} className="text-status-success" /> Excel
                  </button>
                  <button onClick={() => handleExport('pdf')} className="w-full px-3 py-1.5 text-left text-[10px] hover:bg-muted flex items-center gap-2">
                    <FileText size={12} className="text-status-danger" /> PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Stats + Chart Row */}
      <div className="grid grid-cols-12 gap-2 px-1 shrink-0">
        {/* Stats Column */}
        <div className="col-span-12 md:col-span-4 flex flex-col gap-2">
          <Card className="relative overflow-hidden bg-gradient-to-r from-status-info/10 to-surface-base/40 border-status-info/20 p-2.5">
            <p className="text-[9px] font-bold text-status-info uppercase tracking-wider">Trésorerie Globale</p>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black font-mono text-foreground">
                  {formatCurrency(globalStats?.globalBalance || 0)}
                </span>
                <span className="text-[9px] text-content-muted">FCFA</span>
              </div>
              <div className={`flex items-center text-[10px] font-bold ${isPositive ? 'text-status-success' : 'text-status-danger'}`}>
                {isPositive ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
                {Math.abs(globalGrowth).toFixed(1)}%
              </div>
            </div>
          </Card>
          <Card className="bg-surface-base/20 border-edge p-2.5 flex items-center gap-2">
            <Building2 size={16} className="text-accent shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-content-muted uppercase truncate">Moyenne/Agence</p>
              <span className="text-base font-bold text-foreground">
                {globalStats?.breakdown.length ? Math.round((globalStats.globalBalance / globalStats.breakdown.length)).toLocaleString() : 0}
                <span className="text-[9px] text-content-muted ml-1">F</span>
              </span>
            </div>
          </Card>
        </div>

        {/* Chart Column */}
        <Card className="col-span-12 md:col-span-8 p-2 border-edge bg-surface-base/30">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-medium text-content-muted shrink-0">{getChartTitle()}</span>
              {selectedAgencies.length > 0 && (
                <div className="flex gap-1 overflow-x-auto">
                  {selectedAgencies.map(id => {
                    const agence = globalStats?.breakdown.find(a => a.agenceId === id);
                    return (
                      <div key={id} className="flex items-center gap-1 px-1.5 py-0.5 bg-surface rounded-full border border-edge shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgencyColor(id) }} />
                        <span className="text-[8px] font-medium text-content-secondary">{agence?.agenceNom}</span>
                        <button onClick={(e) => { e.stopPropagation(); toggleAgency(id); }} className="text-content-muted hover:text-content-primary">
                          <X size={8} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center bg-surface-base rounded p-0.5 shrink-0">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-medium transition-all",
                    period === opt.value ? "bg-accent text-white" : "text-content-muted hover:text-content-secondary"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[200px] w-full">
            {isLoadingChart ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData || []} margin={{ top: 5, right: 10, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                    </linearGradient>
                    {selectedAgencies.map(id => (
                      <linearGradient key={`grad-${id}`} id={`color-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getAgencyColor(id)} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={getAgencyColor(id)} stopOpacity={0.05}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 8, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-default)', strokeWidth: 0.5 }}
                    tickFormatter={(value) => {
                      const d = new Date(value);
                      if (period === 'today') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                      if (period === '1y') return d.toLocaleDateString('fr-FR', { month: 'short' });
                      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: 'var(--text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                    width={45}
                    tickFormatter={(value) => {
                      if (value >= 1000000000) return `${(value / 1000000000).toFixed(0)}G`;
                      if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                      return value.toString();
                    }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<CustomTooltip period={period} agencyMap={globalStats?.breakdown.reduce((acc, a) => { acc[a.agenceId] = a.agenceNom; return acc; }, {} as Record<string, string>) || {}} />} />
                  <Legend
                    wrapperStyle={{ paddingTop: 0, fontSize: '9px' }}
                    iconSize={8}
                    iconType="circle"
                    formatter={(value) => <span className="text-[9px] text-content-muted ml-0.5">{value}</span>}
                  />
                  {selectedAgencies.length === 0 ? (
                    <Area type="monotone" dataKey="balance" name="Flux Global" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
                  ) : (
                    selectedAgencies.map((id) => {
                      const agence = globalStats?.breakdown.find(a => a.agenceId === id);
                      return (
                        <Area key={id} type="monotone" dataKey={id} name={agence?.agenceNom || 'Agence'} stroke={getAgencyColor(id)} strokeWidth={2} fillOpacity={1} fill={`url(#color-${id})`} />
                      );
                    })
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* 3. Agency Grid - Compact */}
      <div className="flex-1 min-h-0 px-1 space-y-2">
        <div className="flex items-center justify-between bg-surface-base/20 px-2 py-1.5 rounded-lg border border-edge/50">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-content-muted" />
            <span className="text-[10px] font-semibold text-content-secondary">Réseau</span>
            <Badge value={filteredAgencies.length} variant="neutral" size="sm" className="h-4 text-[9px]" />
          </div>
          <div className="relative w-40">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-content-muted" />
            <input
              type="text"
              placeholder="Filtrer..."
              className="w-full pl-6 pr-2 py-1 text-[10px] bg-surface-base border border-edge rounded focus:outline-none focus:border-accent/50 text-content-secondary"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 overflow-y-auto max-h-[calc(100%-40px)] custom-scrollbar pb-1">
          {paginatedAgencies.map((agency: TreasuryStats['breakdown'][0]) => {
            const isSelected = selectedAgencies.includes(agency.agenceId);
            return (
              <Card
                key={agency.agenceId}
                className={cn(
                  "cursor-pointer transition-all duration-150 hover:bg-surface/50 relative overflow-hidden border-edge p-2",
                  isSelected ? "ring-1 ring-accent border-accent bg-accent/[0.05]" : "hover:border-edge"
                )}
                onClick={() => toggleAgency(agency.agenceId)}
              >
                {isSelected && (
                  <div className="absolute top-0 left-0 w-0.5 h-full" style={{ backgroundColor: getAgencyColor(agency.agenceId) }} />
                )}
                <div className="flex justify-between items-start mb-0.5">
                  <h4 className="font-semibold text-[11px] truncate text-content-secondary max-w-[70%]">{agency.agenceNom}</h4>
                  <Badge
                    value={agency.solde > 0 ? 'Actif' : '—'}
                    variant={agency.solde > 0 ? 'success' : 'neutral'}
                    size="sm"
                    className="text-[8px] h-4 px-1"
                  />
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-[9px] text-content-muted truncate max-w-[40%]">{agency.ville || '—'}</span>
                  <div className="text-xs font-bold font-mono text-content-primary">
                    {agency.solde.toLocaleString()}
                    <span className="text-[8px] font-sans text-content-muted ml-0.5">F</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-5 w-5 p-0">
              <ChevronLeft size={12} />
            </Button>
            <span className="text-[10px] font-medium text-content-muted">{page}/{totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-5 w-5 p-0">
              <ChevronRight size={12} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
