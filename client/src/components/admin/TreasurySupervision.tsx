import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Building2, TrendingUp, TrendingDown, DollarSign, 
  Search, Calendar, ArrowUpRight, ArrowDownRight, RefreshCcw 
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { Card, Button, FormField, Badge, SelectField } from '../ui';
import { api } from '../../lib/api-client';

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

export function TreasurySupervision() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: stats, isLoading, refetch } = useQuery<TreasuryStats>({
    queryKey: ['treasury-supervision'],
    queryFn: async () => {
      return api.get('/coffre/supervision');
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const filteredAgencies = stats?.breakdown.filter(a => 
    a.agenceNom.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.ville?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const calculateGrowth = () => {
    if (!stats?.history || stats.history.length < 2) return 0;
    const current = stats.history[stats.history.length - 1].balance;
    const previous = stats.history[stats.history.length - 2].balance; // Yesterday
    // Or compare to 30 days ago? Let's do yesterday for "Daily Change"
    // Or 30 days for "Monthly Trend"
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const growth = calculateGrowth();
  const isPositive = growth >= 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Chargement des données de trésorerie...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supervision Trésorerie</h1>
          <p className="text-muted-foreground">Vue d'ensemble des fonds disponibles dans le réseau.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} icon={RefreshCcw}>
          Actualiser
        </Button>
      </div>

      {/* Global Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Cash */}
        <Card className="col-span-1 md:col-span-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign size={120} />
          </div>
          <div className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Trésorerie Globale (Solde Coffres)</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold font-mono tracking-tight">
                {stats?.globalBalance.toLocaleString()} 
              </span>
              <span className="text-xl font-medium text-muted-foreground">FCFA</span>
            </div>
            
            <div className={`flex items-center gap-2 mt-4 text-sm ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              <span className={`flex items-center px-2 py-0.5 rounded-full ${isPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {isPositive ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                {Math.abs(growth).toFixed(2)}%
              </span>
              <span className="text-muted-foreground">vs hier</span>
            </div>
          </div>
        </Card>

        {/* Agency Count */}
        <Card className="flex flex-col justify-center p-6">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                 <Building2 size={24} />
              </div>
              <div>
                 <h3 className="text-sm font-medium text-muted-foreground">Agences Actives</h3>
                 <span className="text-2xl font-bold">{stats?.breakdown.length}</span>
              </div>
           </div>
           <div className="mt-4 pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground flex justify-between">
                 <span>Solde Moyen:</span>
                 <span className="font-medium">
                     {stats?.breakdown.length ? 
                        Math.round((stats.globalBalance / stats.breakdown.length)).toLocaleString() : 0} FCFA
                 </span>
              </div>
           </div>
        </Card>
      </div>

      {/* Evolution Chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar size={18} className="text-muted-foreground" />
            Évolution 30 Jours
          </h3>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats?.history || []}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(val) => new Date(val).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toLocaleString()} FCFA`, 'Solde']}
                labelFormatter={(label) => new Date(label).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorBalance)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Agency Grid */}
      <div className="space-y-4">
         <div className="flex flex-col sm:flex-row justify-between items-center bg-card p-4 rounded-lg border gap-4">
             <h3 className="font-semibold text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Détail par Agence
             </h3>
             <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher une agence..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgencies.map((agency) => (
               <Card key={agency.agenceId} className="hover:border-primary/50 transition-colors group">
                  <div className="p-5">
                      <div className="flex justify-between items-start mb-4">
                          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-primary/10 transition-colors">
                              <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-primary" />
                          </div>
                          <Badge 
                            value={agency.solde > 0 ? 'Positif' : 'Vide'} 
                            variant={agency.solde > 0 ? 'success' : 'neutral'} 
                          />
                      </div>
                      
                      <h4 className="font-semibold text-lg mb-1">{agency.agenceNom}</h4>
                      <p className="text-sm text-muted-foreground mb-4">{agency.ville || 'Localisation non définie'}</p>
                      
                      <div className="pt-4 border-t border-border mt-auto">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Solde Coffre</span>
                          <div className="text-2xl font-bold font-mono text-primary mt-1">
                              {agency.solde.toLocaleString()} <span className="text-sm font-sans text-muted-foreground font-normal">FCFA</span>
                          </div>
                      </div>
                  </div>
               </Card>
            ))}
            
            {filteredAgencies.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-card/50 rounded-lg border border-dashed">
                    Aucune agence trouvée pour "{searchTerm}"
                </div>
            )}
         </div>
      </div>
    </div>
  );
}
