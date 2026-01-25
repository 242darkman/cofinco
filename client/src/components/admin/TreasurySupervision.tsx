import React, { useState, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { 
  Building2, TrendingUp, TrendingDown, DollarSign, 
  Search, Calendar, RefreshCcw, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, Button, Badge } from '../ui';
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
    <div className="w-full h-[350px] bg-slate-100 dark:bg-slate-800/50 rounded-xl animate-pulse flex flex-col items-center justify-center space-y-4">
      <div className="w-4/5 h-1/2 bg-slate-200 dark:bg-slate-700/50 rounded-lg relative overflow-hidden">
         <div className="absolute inset-0 flex items-center justify-center opacity-10">
            <TrendingUp size={100} />
         </div>
      </div>
      <div className="flex gap-4 w-1/2 justify-center">
         <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded shadow-sm" />
         <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded shadow-sm" />
      </div>
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

  const ITEMS_PER_PAGE = 12;

  // 1. Global Data Poll (Real-time every 5s)
  const { data: _globalStats, isLoading: isGlobalLoading, refetch: refetchGlobal } = useQuery<TreasuryStats>({
    queryKey: ['treasury-supervision', period],
    queryFn: async (): Promise<TreasuryStats> => {
      return (await api.get(`/coffre/supervision?period=${period}`)) as TreasuryStats;
    },
    refetchInterval: 5000,
    placeholderData: keepPreviousData
  });
  const globalStats = _globalStats as TreasuryStats | undefined;

  // 2. Specific History Poll (for drill-down)
  // Only fetch if agencies are selected
  const { data: agencyHistoryData, isLoading: isHistoryLoading } = useQuery<TreasuryStats>({
    queryKey: ['treasury-history', selectedAgencies.sort().join(','), period],
    queryFn: async () => {
       const ids = selectedAgencies.join(',');
       return (await api.get(`/coffre/supervision?historyFor=${ids}&period=${period}`)) as TreasuryStats;
    },
    enabled: selectedAgencies.length > 0,
    refetchInterval: 5000
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

  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || '1 mois';

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
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
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
    <div className="flex flex-col h-full space-y-2 overflow-hidden animate-in fade-in duration-500 pt-1">
      {/* 1. Header & Actions - Compact */}
      <div className="shrink-0 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
             <div className="bg-primary/20 p-2 rounded-lg">
                <TrendingUp className="w-5 h-5 text-primary" />
             </div>
             <div>
                <h1 className="text-lg font-bold tracking-tight">Supervision Trésorerie</h1>
                <p className="text-[10px] text-muted-foreground">Vue temps réel ({globalStats?.breakdown.length} agences)</p>
             </div>
        </div>
        <div className="flex items-center gap-2">
             {selectedAgencies.length > 0 && (
                 <Button variant="outline" size="sm" onClick={() => setSelectedAgencies([])} className="h-7 text-xs mr-1">
                     <X size={12} className="mr-1"/>
                     Reset
                 </Button>
             )}
            <Button variant="ghost" size="sm" onClick={() => refetchGlobal()} className="h-7 w-7 p-0 rounded-full">
               <RefreshCcw size={14} />
            </Button>
        </div>
      </div>

      {/* 2. Main Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1 space-y-4 pb-4">
          
          {/* Top Stats Row - Compact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
             <Card className="relative overflow-hidden bg-gradient-to-r from-blue-900/40 to-slate-900/40 border-blue-500/20 p-3 flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">Trésorerie Globale</p>
                   <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black font-mono tracking-tighter text-foreground">
                        {formatCurrency(globalStats?.globalBalance || 0)} 
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">FCFA</span>
                   </div>
                </div>
                <div className={`flex flex-col items-end ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                   <div className={`flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                     {isPositive ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                     {Math.abs(globalGrowth).toFixed(2)}%
                   </div>
                   <span className="text-[10px] text-muted-foreground opacity-60 mt-0.5">24h</span>
                </div>
             </Card>

             <Card className="bg-slate-900/20 border-slate-800 p-3 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                     <Building2 size={20} />
                  </div>
                  <div>
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Solde Moyen / Agence</p>
                     <span className="text-xl font-bold text-foreground">
                        {globalStats?.breakdown.length ? 
                            Math.round((globalStats.globalBalance / globalStats.breakdown.length)).toLocaleString() 
                            : 0} 
                        <span className="text-xs text-muted-foreground ml-1 font-normal">FCFA</span>
                    </span>
                  </div>
             </Card>
          </div>

          {/* Chart Section - Enhanced Visuals */}
          <Card className="p-4 shadow-sm border-slate-800 bg-slate-950/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm flex items-center gap-2 text-slate-200">
                      <Calendar size={16} className="text-primary" />
                      {getChartTitle()}
                  </h3>
                   {selectedAgencies.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 ml-2">
                            {selectedAgencies.map(id => {
                                const agence = globalStats?.breakdown.find(a => a.agenceId === id);
                                return (
                                    <div 
                                        key={id} 
                                        className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 rounded-full border border-slate-700"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgencyColor(id) }} />
                                        <span className="text-[10px] font-medium text-slate-300">{agence?.agenceNom || 'Agence'}</span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleAgency(id); }}
                                            className="ml-1 text-slate-500 hover:text-white"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                   )}
              </div>
              <div className="flex items-center gap-2">
                {isLoadingChart && <div className="text-[10px] text-muted-foreground animate-pulse mr-2">Mise à jour...</div>}
                <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5">
                  {PERIOD_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPeriod(opt.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                        period === opt.value
                          ? "bg-primary text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-[320px] w-full">
              {isLoadingChart ? (
                <ChartSkeleton />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData || []} margin={{ top: 10, right: 0, left: 10, bottom: 0 }}>
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
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val) => {
                          const d = new Date(val);
                          if (period === 'today') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                          if (period === '1y') return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
                          return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                      }}
                      stroke="transparent"
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                      minTickGap={30}
                    />
                    <YAxis 
                      domain={['auto', 'auto']}
                      tickFormatter={(val) => {
                          if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                          return `${(val / 1000).toFixed(0)}k`;
                      }}
                      stroke="transparent"
                      tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }}
                      tickLine={false}
                      axisLine={false}
                      dx={-5}
                      width={45} 
                    />
                    <Tooltip 
                      content={
                        <CustomTooltip
                            period={period}
                            agencyMap={globalStats?.breakdown.reduce((acc, a) => {
                                acc[a.agenceId] = a.agenceNom;
                                return acc;
                            }, {} as Record<string, string>) || {}}
                        />
                      }
                      cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Legend 
                       wrapperStyle={{ paddingTop: '10px' }}
                       iconType="circle"
                       formatter={(value) => <span className="text-xs text-slate-400 font-medium ml-1">{value}</span>}
                    />
                    
                    {selectedAgencies.length === 0 ? (
                      <Area 
                        type="monotone" 
                        dataKey="balance" 
                        name="Flux Global"
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorBalance)" 
                        activeDot={{ r: 4, strokeWidth: 0, stroke: '#fff' }}
                      />
                    ) : (
                      selectedAgencies.map((id) => {
                        const agence = globalStats?.breakdown.find(a => a.agenceId === id);
                        return (
                          <Area
                            key={id}
                            type="monotone"
                            dataKey={id}
                            name={agence?.agenceNom || 'Agence'}
                            stroke={getAgencyColor(id)}
                            strokeWidth={3}
                            fillOpacity={1}
                            fill={`url(#color-${id})`}
                            activeDot={{ r: 4, strokeWidth: 0, stroke: '#fff' }}
                          />
                        );
                      })
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Agency Grid & Filter */}
          <div className="space-y-3">
             <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/20 p-2 rounded-lg border border-slate-800/50 gap-3">
                 <div className="flex items-center gap-2">
                     <Building2 className="w-4 h-4 text-slate-500" />
                     <span className="text-xs font-semibold text-slate-300">Réseau d'agences</span>
                     <Badge value={filteredAgencies.length} variant="neutral" size="sm" className="h-5" />
                 </div>
                 
                 <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filtrer..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md focus:outline-none focus:border-primary/50 text-slate-200"
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    />
                 </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {paginatedAgencies.map((agency: TreasuryStats['breakdown'][0]) => {
                   const isSelected = selectedAgencies.includes(agency.agenceId);
                   return (
                   <Card 
                        key={agency.agenceId} 
                        className={cn(
                            "cursor-pointer transition-all duration-200 hover:bg-slate-800/50 group relative overflow-hidden border-slate-800",
                            isSelected ? "ring-1 ring-primary border-primary bg-primary/[0.05]" : "hover:border-slate-700"
                        )}
                        onClick={() => toggleAgency(agency.agenceId)}
                   >
                       {isSelected && (
                           <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: getAgencyColor(agency.agenceId) }} />
                       )}

                      <div className="p-3">
                          <div className="flex justify-between items-center mb-2">
                              <h4 className="font-semibold text-sm truncate text-slate-200">{agency.agenceNom}</h4>
                              <Badge 
                                value={agency.solde > 0 ? 'Actif' : 'Vide'} 
                                variant={agency.solde > 0 ? 'success' : 'neutral'} 
                                size="sm"
                                className="text-[10px] h-5"
                              />
                          </div>
                          
                          <div className="flex items-end justify-between">
                              <p className="text-[10px] text-slate-500 flex items-center gap-1 truncate max-w-[50%]">
                                  {agency.ville || '—'}
                              </p>
                              <div className="text-sm font-bold font-mono text-white">
                                  {agency.solde.toLocaleString()} <span className="text-[10px] font-sans text-slate-500 font-normal">F</span>
                              </div>
                          </div>
                      </div>
                   </Card>
                )})}
             </div>

             {/* Pagination */}
             {totalPages > 1 && (
                 <div className="flex justify-center items-center gap-2 pt-2">
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="h-7 w-7 p-0"
                     >
                        <ChevronLeft size={14} />
                     </Button>
                     <span className="text-xs font-medium text-slate-500">
                        {page}/{totalPages}
                     </span>
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="h-7 w-7 p-0"
                     >
                        <ChevronRight size={14} />
                     </Button>
                 </div>
             )}
          </div>
      </div>
    </div>
  );
}
