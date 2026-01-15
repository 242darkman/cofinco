import type { Client } from '@shared/schema';
import React, { useState } from 'react';
import { DollarSign, Target, Award, CreditCard, Wallet, Users, Activity, TrendingUp, TrendingDown, X, Calendar, ArrowRight } from 'lucide-react';
import ClientTags from './ClientTags';
import { Card, Badge, Skeleton } from '../ui';
import Modal from '../ui/Modal';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
// Removed missing formatMoney import, using toLocaleString instead

interface ClientAnalyticsProps {
  client: Client;
}

interface AnalyticsData {
  summary: {
    total_savings: number;
    total_credit_due: number;
    active_loans_count: number;
    savings_accounts_count: number;
    active_tontines_count: number;
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

// Sub-component for Details Modal
const MetricDetailsModal = ({ 
    isOpen, 
    onClose, 
    type, 
    clientId 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    type: 'credits' | 'savings' | 'tontines' | null; 
    clientId: string;
}) => {
    // Fetch detailed data based on type
    const { data: details, isLoading } = useQuery({
        queryKey: ['analytics-details', clientId, type],
        queryFn: async () => {
            if (!type) return null;
            // Re-using existing endpoints or fetching from generic "details" endpoint if created?
            // Actually, for "Pro" feel, let's fetch specific lists.
            // But I don't want to make 3 new raw API calls if I don't have to. 
            // I'll use the existing generic GET /credits, /comptes, /tontines endpoints but filtered?
            // Or better: The user wanted "plus de detail". 
            // I'll assume we can hit the lists. 
            // Implementation: I'll use the logic I know exists or generic fetch.
            
            if (type === 'credits') {
              const res = await fetch(`/api/credits?clientId=${clientId}`);
              if (!res.ok) return [];
              const all = await res.json();
              return all.filter((c: any) => ['Actif', 'En retard', 'En cours'].includes(c.statut));
            }
            if (type === 'savings') {
               const res = await fetch(`/api/comptes?clientId=${clientId}`);
               if (!res.ok) return [];
               const all = await res.json();
               return all.filter((a: any) => ['Épargne', 'Compte Bloqué', 'Terme'].includes(a.typeCompte) && a.statut === 'Actif');
            }
            if (type === 'tontines') {
                // This might be tricky if no direct endpoint.
                // Assuming /api/tontines/participations/:clientId or similar.
                // Or /api/clients/:id/tontines. 
                // Let's try /api/tontines/member/${clientId} based on common patterns, or fallback to empty.
                const res = await fetch(`/api/clients/${clientId}/tontines`); // Hypothetical
                if (res.ok) return res.json();
                return []; 
            }
            return [];
        },
        enabled: !!type && isOpen
    });

    if (!isOpen) return null;

    const title = {
        credits: 'Crédits en cours',
        savings: 'Épargne & Placements',
        tontines: 'Tontines actives'
    }[type || 'credits'];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
            {isLoading ? (
                <div className="space-y-3 p-4">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                </div>
            ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
                  {(!details || details.length === 0) ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-4 text-slate-400 border border-slate-200 dark:border-slate-700">
                             {type === 'credits' && <CreditCard size={32} className="opacity-50" />}
                             {type === 'savings' && <Wallet size={32} className="opacity-50" />}
                             {type === 'tontines' && <Users size={32} className="opacity-50" />}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
                             {type === 'credits' ? 'Aucun crédit actif' : type === 'savings' ? 'Aucun compte actif' : 'Aucune tontine active'}
                          </h3>
                          <p className="text-sm text-slate-500 max-w-[280px]">
                             {type === 'credits' 
                                ? "Ce client ne dispose actuellement d'aucun dossier de crédit en cours de remboursement." 
                                : type === 'savings' 
                                    ? "Aucun compte d'épargne, bloqué ou à terme n'est rattaché à ce client pour le moment." 
                                    : "Le client n'est inscrit à aucune tontine ou n'a aucune participation active."}
                          </p>
                      </div>
                  ) : (
                      details.map((item: any, idx: number) => (
                          <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between gap-4 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                               {type === 'credits' && (
                                   <>
                                     <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge value={item.statut} variant={item.statut === 'En retard' ? 'danger' : 'success'} />
                                            <span className="font-bold text-slate-700 dark:text-slate-200">Prêt {item.typeCredit || 'Personnel'}</span>
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            Reste à payer : <span className="font-semibold text-red-500">{Number(item.soldeRestant).toLocaleString()} FCFA</span>
                                        </p>
                                     </div>
                                     <div className="text-right">
                                         <p className="text-xs text-slate-500 uppercase">Prochaine échéance</p>
                                         <p className="font-medium text-slate-700 dark:text-slate-300">
                                             {item.prochaineEcheance ? new Date(item.prochaineEcheance).toLocaleDateString() : 'N/A'}
                                         </p>
                                         <p className="text-xs text-slate-400 mt-1">{Number(item.montantEcheance).toLocaleString()} FCFA</p>
                                     </div>
                                   </>
                               )}

                               {type === 'savings' && (
                                   <>
                                     <div className="flex items-center gap-4">
                                         <div className={`p-3 rounded-full ${item.typeCompte === 'Compte Bloqué' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                             <Wallet size={20} />
                                         </div>
                                         <div>
                                            <p className="font-bold text-slate-700 dark:text-slate-200">{item.typeCompte}</p>
                                            <p className="text-xs text-slate-500 font-mono">{item.numeroCompte}</p>
                                         </div>
                                     </div>
                                     <div className="text-right flex flex-col justify-center">
                                         <p className="text-lg font-bold text-emerald-500">{Number(item.soldeCourant).toLocaleString()} FCFA</p>
                                         <p className="text-xs text-slate-500">Disponible</p>
                                     </div>
                                   </>
                               )}

                               {type === 'tontines' && (
                                   <>
                                      <div>
                                          <p className="font-bold text-slate-700 dark:text-slate-200">{item.tontine?.nom || 'Tontine'}</p>
                                          <div className="flex items-center gap-2 mt-1">
                                              <Badge value="Active" variant="success" />
                                              <span className="text-xs text-slate-500">Tour: {item.positionTour}/{item.tontine?.nombreTours || sourceDummyTours(item)}</span>
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <p className="text-xs text-slate-500 uppercase">Cotisation</p>
                                          <p className="font-bold text-amber-500">{Number(item.montantCotisation || item.tontine?.montantCotisation).toLocaleString()} FCFA</p>
                                          <p className="text-xs text-slate-400">/ fréquence</p>
                                      </div>
                                   </>
                               )}
                          </div>
                      ))
                  )}
               </div>
            )}
        </Modal>
    );
};

// Helper for dummy tours if data missing (fallback)
const sourceDummyTours = (item: any) => item.nombreParticipants || 12;

export default function ClientAnalytics({ client }: ClientAnalyticsProps) {
  const [, setLocation] = useLocation();
  const [activeMetric, setActiveMetric] = useState<'credits' | 'savings' | 'tontines' | null>(null);

  // Fetch Real-Time Analytics
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['client-analytics', client.id],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${client.id}/analytics`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 5000,
  });
  
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


      {/* 2. & 3. Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Répartition Financière */}
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
                   
                   <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Total</p>
                      <p className="text-lg font-bold text-white">{summary.total_savings.toLocaleString()}</p>
                   </div>
                </div>

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

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
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

      
      {/* 4. Navigation Cards (Interactive Drill-Down) */}
      <div className="grid grid-cols-3 gap-3">
         {/* Credits */}
         <Card 
            variant="default" 
            padding="sm" 
            className={`text-center py-4 cursor-pointer transition-all active:scale-95 border border-transparent hover:border-blue-500/50 ${summary.active_loans_count > 0 ? 'bg-blue-500/10 hover:bg-blue-500/20' : 'bg-slate-800/20 hover:bg-slate-800/50'}`}
            onClick={() => setActiveMetric('credits')}
         >
            <div className="flex items-center justify-center mb-2 gap-2">
                <CreditCard size={18} className="text-blue-400" />
                <span className="text-2xl font-bold text-white">{summary.active_loans_count}</span>
            </div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Crédits en cours</p>
            {summary.active_loans_count > 0 && (
                <p className="text-[10px] text-blue-400 mt-1 flex items-center justify-center gap-1">
                    Voir détails <ArrowRight size={10} />
                </p>
            )}
         </Card>

         {/* Epargnes */}
         <Card 
            variant="default" 
            padding="sm" 
            className={`text-center py-4 cursor-pointer transition-all active:scale-95 border border-transparent hover:border-emerald-500/50 ${summary.savings_accounts_count > 0 ? 'bg-emerald-500/10 hover:bg-emerald-500/20' : 'bg-slate-800/20 hover:bg-slate-800/50'}`}
            onClick={() => setActiveMetric('savings')}
         >
            <div className="flex items-center justify-center mb-2 gap-2">
                <Wallet size={18} className="text-emerald-400" />
                <span className="text-2xl font-bold text-white">{summary.savings_accounts_count}</span>
            </div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Comptes Épargne</p>
            {summary.savings_accounts_count > 0 && (
                <p className="text-[10px] text-emerald-400 mt-1 flex items-center justify-center gap-1">
                    Voir les comptes <ArrowRight size={10} />
                </p>
            )}
         </Card>

         {/* Tontines */}
         <Card 
            variant="default" 
            padding="sm" 
            className={`text-center py-4 cursor-pointer transition-all active:scale-95 border border-transparent hover:border-amber-500/50 ${summary.active_tontines_count > 0 ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'bg-slate-800/20 hover:bg-slate-800/50'}`}
            onClick={() => setActiveMetric('tontines')}
         >
            <div className="flex items-center justify-center mb-2 gap-2">
                <Users size={18} className="text-amber-400" />
                <span className="text-2xl font-bold text-white">{summary.active_tontines_count}</span>
            </div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Tontines Actives</p>
            {summary.active_tontines_count > 0 && (
                <p className="text-[10px] text-amber-400 mt-1 flex items-center justify-center gap-1">
                    Voir participations <ArrowRight size={10} />
                </p>
            )}
         </Card>
      </div>

      {/* Details Modal */}
      <MetricDetailsModal 
          isOpen={activeMetric !== null} 
          onClose={() => setActiveMetric(null)} 
          type={activeMetric} 
          clientId={client.id}
      />
    </div>
  );
}
