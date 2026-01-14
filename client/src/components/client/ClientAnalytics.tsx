import type { Client } from '@shared/schema';
import React, { useState } from 'react';
import { DollarSign, Target, Award, CreditCard, Wallet, Users, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import ClientTags from './ClientTags';
import { Card, Badge, Skeleton } from '../ui';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

interface ClientAnalyticsProps {
  client: Client;
}

interface AnalyticsData {
  summary: {
    total_savings: number;
    total_credit_due: number;
    active_loans_count: number;
    fidelity_points: number;
    repayment_rate: number;
  };
  distribution: {
    label: string;
    value: number;
    color: string;
  }[];
  monthly_trend: {
    savings_growth: string;
    credit_evolution: string;
  };
}

export default function ClientAnalytics({ client }: ClientAnalyticsProps) {
  const [, setLocation] = useLocation();

  // Fetch Real-Time Analytics
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['client-analytics', client.id],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${client.id}/analytics`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 5000, // Poll every 5s for "Real-Time" feel without websockets complexity for now
  });

  // Fetch Activities for counters (keep existing logic or rely on summary if backend provided count)
  // The summary provides active_loans_count, but not others. We can keep the old activity fetch or simplify.
  // For now, let's keep the activity fetch for the counts if they are "All Time" vs "Active".
  // The prompt asks for "Drill-down" from counters.
  
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  if (isLoading || !analytics) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const { summary, distribution, monthly_trend } = analytics;

  // Compute total for percentage calculation in donut center
  const totalValue = distribution.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* 1. Segment & Fidélité Card */}
      <Card variant="elevated" className="relative overflow-hidden border-blue-500/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row gap-6">
            {/* Points Fidélité */}
            <div className="flex-1 flex items-center justify-center sm:justify-start gap-4">
                <div className="relative w-20 h-20 flex items-center justify-center bg-cyan-500/10 rounded-full border border-cyan-500/30">
                    <Award size={32} className="text-cyan-400" />
                </div>
                <div>
                     <p className="text-xs text-slate-500 uppercase font-semibold">Points Fidélité</p>
                     <p className="text-2xl font-bold text-cyan-400">{summary.fidelity_points.toLocaleString()}</p>
                     <p className="text-xs text-slate-400 mt-1">
                        Membre depuis {client.dateInscription ? Math.floor((new Date().getTime() - new Date(client.dateInscription).getTime()) / (1000 * 60 * 60 * 24)) : 0}j
                     </p>
                </div>
            </div>

            {/* Segment & Tags */}
            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-slate-700/50 pt-4 sm:pt-0 sm:pl-6 flex flex-col justify-center">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Segment Client</p>
                    <Badge value={client.segment} variant={client.segment === 'VIP' ? 'warning' : 'neutral'} />
                 </div>
                 <div className="mt-auto">
                    <ClientTags clientId={client.id} compact={true} />
                 </div>
            </div>
        </div>
      </Card>


      {/* 2. & 3. Main Content Grid - Desktop Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Répartition Financière (Interactive Donut) - Takes more space on desktop */}
          <Card variant="default" padding="md" className="lg:col-span-2 flex flex-col h-[300px] sm:h-auto">
            <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <DollarSign size={16} className="text-cyan-400" />
                Répartition Financière
            </h4>

            {summary.total_savings === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                 <div className="w-20 h-20 rounded-full border-2 border-slate-700 border-dashed flex items-center justify-center mb-2">
                    <DollarSign size={24} className="text-slate-600" />
                 </div>
                 <p className="text-sm">Aucune donnée financière</p>
               </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center h-full">
                <div className="w-full sm:w-1/2 h-[200px] relative">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                          data={distribution}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          onMouseEnter={onPieEnter}
                          onClick={(_, index) => setActiveIndex(index)}
                        >
                          {distribution.map((entry, index) => (
                            <Cell 
                               key={`cell-${index}`} 
                               fill={entry.color} 
                               stroke="rgba(0,0,0,0)"
                               className="cursor-pointer hover:opacity-80 transition-opacity"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                            formatter={(value: number) => `${value.toLocaleString()} FCFA`}
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                            itemStyle={{ color: '#f8fafc' }}
                        />
                     </PieChart>
                   </ResponsiveContainer>
                   
                   {/* Center Text (Total or Selection) */}
                   <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Total</p>
                      <p className="text-lg font-bold text-white">{summary.total_savings.toLocaleString()}</p>
                   </div>
                </div>

                {/* Custom Legend / Details */}
                <div className="w-full sm:w-1/2 mt-4 sm:mt-0 sm:pl-6 space-y-3">
                    {distribution.map((item, index) => (
                        <div 
                            key={index} 
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${activeIndex === index ? 'bg-slate-800 ring-1 ring-slate-700' : 'hover:bg-slate-800/50'}`}
                            onClick={() => setActiveIndex(index)}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span className="text-sm text-slate-300">{item.label}</span>
                            </div>
                            <div className="text-right">
                                 <p className="text-sm font-bold text-white">{item.value.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">FCFA</span></p>
                                 <p className="text-[10px] text-slate-500">
                                    {((item.value / totalValue) * 100).toFixed(1)}%
                                 </p>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
            )}
          </Card>

          {/* Key Metrics Grid - Stacked Vertically on Desktop, Grid on Mobile */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
              {/* Taux Remboursement */}
              <Card variant="default" padding="sm" className="bg-slate-800/30">
                 <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                        <Target size={18} />
                    </div>
                    <span className={`text-xl font-bold ${summary.repayment_rate >= 90 ? 'text-emerald-400' : summary.repayment_rate >= 80 ? 'text-cyan-400' : 'text-amber-400'}`}>
                        {summary.repayment_rate}%
                    </span>
                 </div>
                 <p className="text-xs text-slate-500 font-medium uppercase truncate">Taux Remboursement</p>
              </Card>

              {/* Croissance Epargne */}
              <Card variant="default" padding="sm" className="bg-slate-800/30">
                 <div className="flex items-start justify-between mb-2">
                    <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                        <TrendingUp size={18} />
                    </div>
                    <span className="text-xl font-bold text-emerald-400">
                        {monthly_trend.savings_growth}
                    </span>
                 </div>
                 <p className="text-xs text-slate-500 font-medium uppercase truncate">Croissance (Mois)</p>
              </Card>
          </div>
      </div>

      
      {/* 4. Navigation Cards (Drill-Down) */}
      <div className="grid grid-cols-4 gap-2">
         {/* Credits Drill-down */}
         <Card 
            variant="default" 
            padding="sm" 
            className="text-center py-3 bg-slate-800/20 hover:bg-slate-800/50 cursor-pointer transition-colors active:scale-95"
            onClick={() => setLocation(`/finance/credits?client=${client.id}`)}
         >
            <CreditCard size={16} className="mx-auto mb-1 text-blue-400" />
            <p className="text-lg font-bold text-white">{summary.active_loans_count}</p>
            <p className="text-[10px] text-slate-500 uppercase">Crédits</p>
         </Card>

         {/* Epargnes Drill-down */}
         <Card 
            variant="default" 
            padding="sm" 
            className="text-center py-3 bg-slate-800/20 hover:bg-slate-800/50 cursor-pointer transition-colors active:scale-95"
            onClick={() => setLocation(`/finance/epargne?client=${client.id}`)}
         >
            <Wallet size={16} className="mx-auto mb-1 text-emerald-400" />
            <p className="text-lg font-bold text-white">-</p> 
            <p className="text-[10px] text-slate-500 uppercase">Épargnes</p>
         </Card>

         {/* Tontines Drill-down */}
         <Card 
            variant="default" 
            padding="sm" 
            className="text-center py-3 bg-slate-800/20 hover:bg-slate-800/50 cursor-pointer transition-colors active:scale-95"
            onClick={() => setLocation(`/tontines?client=${client.id}`)}
         >
            <Users size={16} className="mx-auto mb-1 text-amber-400" />
            <p className="text-lg font-bold text-white">-</p>
            <p className="text-[10px] text-slate-500 uppercase">Tontines</p>
         </Card>

         {/* Ops History Drill-down */}
         <Card 
            variant="default" 
            padding="sm" 
            className="text-center py-3 bg-slate-800/20 hover:bg-slate-800/50 cursor-pointer transition-colors active:scale-95"
            onClick={() => setLocation(`/finance/transactions?client=${client.id}`)}
         >
            <Activity size={16} className="mx-auto mb-1 text-purple-400" />
            <p className="text-lg font-bold text-white">Ops</p>
            <p className="text-[10px] text-slate-500 uppercase">Historique</p>
         </Card>
      </div>
    </div>
  );
}
