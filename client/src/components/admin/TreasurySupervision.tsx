import React, { useState, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { 
  Building2, TrendingUp, TrendingDown, DollarSign, 
  Search, Calendar, RefreshCcw, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Area
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
}

const CustomTooltip = ({ active, payload, label, agencyMap }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  // Filter out the 'balance' (total) if comparing, or keep it depending on UX preference
  // User wants: Nord: 15M, Sud: 12M... sorted by amount desc
  const dataPoints = payload
    .filter(p => p.dataKey !== 'balance')
    .sort((a, b) => b.value - a.value);

  const total = payload.find(p => p.dataKey === 'balance')?.value;

  return (
    <div className="bg-card border border-border rounded-xl shadow-xl p-4 min-w-[200px] backdrop-blur-sm bg-card/95">
      <p className="text-sm font-semibold mb-3 border-b pb-2 text-foreground">
        {new Date(label!).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
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

export function TreasurySupervision() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  
  const ITEMS_PER_PAGE = 12;

  // 1. Global Data Poll (Real-time every 5s)
  const { data: _globalStats, isLoading: isGlobalLoading, refetch: refetchGlobal } = useQuery<TreasuryStats>({
    queryKey: ['treasury-supervision'],
    queryFn: async (): Promise<TreasuryStats> => {
      return (await api.get('/coffre/supervision')) as TreasuryStats;
    },
    refetchInterval: 5000,
    placeholderData: keepPreviousData
  });
  const globalStats = _globalStats as TreasuryStats | undefined;

  // 2. Specific History Poll (for drill-down)
  // Only fetch if agencies are selected
  const { data: agencyHistoryData, isLoading: isHistoryLoading } = useQuery<TreasuryStats>({
    queryKey: ['treasury-history', selectedAgencies.sort().join(',')], // stable key
    queryFn: async () => {
       const ids = selectedAgencies.join(',');
       return (await api.get(`/coffre/supervision?historyFor=${ids}`)) as TreasuryStats;
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

  const getChartTitle = () => {
     if (selectedAgencies.length === 0) return "Évolution Trésorerie Globale (30 Jours)";
     if (selectedAgencies.length === 1) {
         const agence = globalStats?.breakdown.find(a => a.agenceId === selectedAgencies[0]);
         return `Évolution : ${agence?.agenceNom || 'Agence'}`;
     }
     return "Comparaison Agences (30 Jours)";
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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supervision Trésorerie</h1>
          <p className="text-muted-foreground">Vue temps réel des fonds disponibles ({globalStats?.breakdown.length} agences connectées).</p>
        </div>
        <div className="flex items-center gap-2">
             {selectedAgencies.length > 0 && (
                 <Button variant="outline" size="sm" onClick={() => setSelectedAgencies([])} className="mr-2">
                     <X size={14} className="mr-2"/>
                     Réinitialiser vue
                 </Button>
             )}
            <Button variant="ghost" size="sm" onClick={() => refetchGlobal()} icon={RefreshCcw}>
            Actualiser
            </Button>
        </div>
      </div>

      {/* Global Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Cash */}
        <Card className="col-span-1 md:col-span-2 relative overflow-hidden bg-gradient-to-br from-card to-background border-primary/20">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <DollarSign size={180} />
          </div>
          <div className="p-6 relative z-10">
            <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">Trésorerie Globale Réseau</h3>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl md:text-6xl font-black font-mono tracking-tighter text-foreground">
                {formatCurrency(globalStats?.globalBalance || 0)} 
              </span>
              <span className="text-xl font-semibold text-muted-foreground opacity-70">FCFA</span>
            </div>
            
            <div className={`inline-flex items-center gap-2 mt-5 text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              <div className={`flex items-center px-2.5 py-1 rounded-full ${isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {isPositive ? <TrendingUp size={16} className="mr-1.5" /> : <TrendingDown size={16} className="mr-1.5" />}
                {Math.abs(globalGrowth).toFixed(2)}%
              </div>
              <span className="text-muted-foreground font-medium italic opacity-60">evolution sur 24h</span>
            </div>
          </div>
        </Card>

        {/* Agency Summary */}
        <Card className="flex flex-col justify-center p-6 bg-slate-900/[0.02] dark:bg-slate-900/40">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                 <Building2 size={24} />
              </div>
              <div>
                 <h3 className="text-sm font-medium text-muted-foreground">Solde Moyen / Agence</h3>
                 <span className="text-2xl font-bold">
                    {globalStats?.breakdown.length ? 
                        Math.round((globalStats.globalBalance / globalStats.breakdown.length)).toLocaleString() 
                        : 0} 
                    <span className="text-xs text-muted-foreground ml-1">FCFA</span>
                </span>
              </div>
           </div>
        </Card>
      </div>

      {/* Evolution Chart (Interactive) */}
      <Card className="p-6 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
                <Calendar size={20} className="text-primary" />
                {getChartTitle()}
            </h3>
            {selectedAgencies.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">Sélectionnez une ou deux agences ci-dessous pour filtrer ce graphique.</p>
            ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                    {selectedAgencies.map(id => {
                        const agence = globalStats?.breakdown.find(a => a.agenceId === id);
                        return (
                            <div 
                                key={id} 
                                className="flex items-center gap-1.5 px-3 py-1 bg-secondary rounded-full border border-border group transition-all hover:border-primary/50"
                            >
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getAgencyColor(id) }} />
                                <span className="text-xs font-semibold">{agence?.agenceNom || 'Agence'}</span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); toggleAgency(id); }}
                                    className="ml-1 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        );
                    })}
                    <span className="text-xs text-muted-foreground self-center ml-2 italic">Max 2 agences</span>
                </div>
            )}
          </div>
          {isLoadingChart && <div className="text-xs text-muted-foreground animate-pulse">Mise à jour graphique...</div>}
        </div>

        <div className="h-[350px] w-full">
          {isLoadingChart ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => {
                      const d = new Date(val);
                      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                  }}
                  stroke="transparent"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                  minTickGap={40}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis 
                  tickFormatter={(val) => {
                      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                      return val.toString();
                  }}
                  stroke="transparent"
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                />
                <Tooltip 
                  content={
                    <CustomTooltip 
                        agencyMap={globalStats?.breakdown.reduce((acc, a) => {
                            acc[a.agenceId] = a.agenceNom;
                            return acc;
                        }, {} as Record<string, string>) || {}}
                    />
                  }
                />
                <Legend 
                   wrapperStyle={{ paddingTop: '20px' }}
                   content={(props) => {
                       const { payload } = props;
                       if (!payload) return null;
                       return (
                           <div className="flex overflow-x-auto pb-2 scrollbar-hide gap-4 px-2 justify-center sm:justify-start">
                               {payload.map((entry: any, index: number) => (
                                   <div key={`item-${index}`} className="flex items-center gap-1.5 whitespace-nowrap">
                                       <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                       <span className="text-xs font-medium text-muted-foreground">{entry.value}</span>
                                   </div>
                               ))}
                           </div>
                       );
                   }}
                />
                
                {selectedAgencies.length === 0 ? (
                  <Line 
                    type="monotone" 
                    dataKey="balance" 
                    name="Trésorerie Globale"
                    stroke="#3b82f6" 
                    strokeWidth={4}
                    dot={false}
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={1500}
                  />
                ) : (
                  selectedAgencies.map((id) => {
                    const agence = globalStats?.breakdown.find(a => a.agenceId === id);
                    return (
                      <Line
                        key={id}
                        type="monotone"
                        dataKey={id}
                        name={agence?.agenceNom || 'Agence'}
                        stroke={getAgencyColor(id)}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                        animationDuration={1000}
                      />
                    );
                  })
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Agency Grid (Paginated) */}
      <div className="space-y-4">
         <div className="flex flex-col sm:flex-row justify-between items-center bg-card p-4 rounded-xl border gap-4 shadow-sm">
             <div className="flex items-center gap-3">
                 <div className="bg-primary/10 p-2 rounded-lg text-primary">
                    <Building2 className="w-5 h-5" />
                 </div>
                 <div>
                    <h3 className="font-semibold text-foreground">Agences du Réseau</h3>
                    <p className="text-xs text-muted-foreground">{filteredAgencies.length} agences trouvées</p>
                 </div>
             </div>
             
             <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filtrer par nom ou ville..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                />
             </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedAgencies.map((agency: TreasuryStats['breakdown'][0]) => {
               const isSelected = selectedAgencies.includes(agency.agenceId);
               return (
               <Card 
                    key={agency.agenceId} 
                    className={cn(
                        "cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-md group relative overflow-hidden",
                        isSelected ? "ring-2 ring-primary border-primary bg-primary/[0.02]" : "hover:border-primary/50"
                    )}
                    onClick={() => toggleAgency(agency.agenceId)}
               >
                   {/* Selection Indicator */}
                   {isSelected && (
                       <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: getAgencyColor(agency.agenceId) }} />
                   )}

                  <div className="p-5">
                      <div className="flex justify-between items-start mb-4">
                          <div className={cn(
                              "p-2 rounded-lg transition-colors",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary"
                          )}>
                              <Building2 className="w-4 h-4" />
                          </div>
                          <Badge 
                            value={agency.solde > 0 ? 'Actif' : 'Vide'} 
                            variant={agency.solde > 0 ? 'success' : 'neutral'} 
                            className="text-xs"
                          />
                      </div>
                      
                      <h4 className="font-semibold text-base mb-1 truncate">{agency.agenceNom}</h4>
                      <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                          {agency.ville || 'Non localisé'}
                      </p>
                      
                      <div className="pt-3 border-t border-border mt-auto">
                          <div className="text-xl font-bold font-mono text-primary flex items-baseline gap-1">
                              {agency.solde.toLocaleString()} 
                              <span className="text-xs font-sans text-muted-foreground font-normal">FCFA</span>
                          </div>
                      </div>
                  </div>
               </Card>
            )})}
            
            {filteredAgencies.length === 0 && (
                <div className="col-span-full py-16 text-center text-muted-foreground bg-card/50 rounded-xl border border-dashed flex flex-col items-center">
                    <Search size={32} className="mb-3 opacity-20" />
                    <p>Aucune agence trouvée pour "{searchTerm}"</p>
                </div>
            )}
         </div>

         {/* Pagination */}
         {totalPages > 1 && (
             <div className="flex justify-center items-center gap-2 mt-8 pt-4">
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    icon={ChevronLeft}
                 >
                    Précédent
                 </Button>
                 <span className="text-sm font-medium text-muted-foreground px-4">
                    Page <span className="text-foreground">{page}</span> sur {totalPages}
                 </span>
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                 >
                    Suivant
                    <ChevronRight size={14} className="ml-2" />
                 </Button>
             </div>
         )}
      </div>
    </div>
  );
}
