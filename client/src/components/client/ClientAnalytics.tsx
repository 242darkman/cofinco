import type { ClientWithIdentity } from '@shared/schema';
import { StatutCompte, StatutCredit } from '@shared/enum/status-constants';
import React, { useState } from 'react';
import { DollarSign, Target, Award, CreditCard, Wallet, Users, TrendingUp, ArrowRight, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import ClientTags from './ClientTags';
import { Card, Badge, Skeleton } from '../ui';
import Modal from '../ui/Modal';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';

interface ClientAnalyticsProps {
  client: ClientWithIdentity;
}

interface AnalyticsData {
  summary: {
    totalSavings: number;
    totalCreditDue: number;
    activeLoansCount: number;
    savingsAccountsCount: number;
    activeTontinesCount: number;
    fidelityPoints: number;
    repaymentRate: number;
  };
  distribution: {
    label: string;
    value: number;
    color: string;
  }[];
  monthlyTrend: {
    savingsGrowth: string;
    creditEvolution: string;
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
              const res = await fetch(`/api/credits?clientId=${clientId}`, { credentials: 'include' });
              if (!res.ok) return [];
              const result = await res.json();
              const all = Array.isArray(result) ? result : result.data ?? [];
              return all.filter((c: any) => [StatutCredit.ACTIVE, StatutCredit.LATE].includes(c.statut));
            }
            if (type === 'savings') {
               const res = await fetch(`/api/comptes?clientId=${clientId}`, { credentials: 'include' });
               if (!res.ok) return [];
               const all = await res.json();
               return all.filter((a: any) => ['Épargne', 'Compte Bloqué', 'Terme'].includes(a.typeCompte) && a.statut === StatutCompte.ACTIVE);
            }
            if (type === 'tontines') {
                const res = await fetch(`/api/clients/${clientId}/tontines`, { credentials: 'include' });
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

type ComparePreset = 'month' | 'quarter' | 'year';

interface ComparisonData {
  periodA: { start: string; end: string; metrics: Record<string, number> };
  periodB: { start: string; end: string; metrics: Record<string, number> };
  variations: Record<string, { periodA: number; periodB: number; change: number; changePercent: number }>;
}

export default function ClientAnalytics({ client }: ClientAnalyticsProps) {
  const [activeMetric, setActiveMetric] = useState<'credits' | 'savings' | 'tontines' | null>(null);
  const [comparePreset, setComparePreset] = useState<ComparePreset>('month');

  // Fetch Real-Time Analytics
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['client-analytics', client.id],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${client.id}/analytics`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 30000, // 30s - optimized for slow connections (was 5s)
    staleTime: 15000,
  });

  // Fetch Period Comparison
  const { data: comparison, isLoading: comparisonLoading } = useQuery<ComparisonData>({
    queryKey: ['client-analytics-compare', client.id, comparePreset],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${client.id}/analytics/compare?preset=${comparePreset}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch comparison');
      return res.json();
    },
  });

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  if (isLoading || !analytics) {
    return (
      <div className="grid grid-cols-4 gap-2">
        <Skeleton className="h-16 rounded-lg col-span-2" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-32 rounded-lg col-span-2" />
        <Skeleton className="h-32 rounded-lg col-span-2" />
      </div>
    );
  }

  const distribution = analytics.distribution || [];
  const monthlyTrend = { savingsGrowth: '0', creditEvolution: '0', ...analytics.monthlyTrend };
  const summary = {
    totalSavings: 0,
    totalCreditDue: 0,
    activeLoansCount: 0,
    savingsAccountsCount: 0,
    activeTontinesCount: 0,
    fidelityPoints: 0,
    repaymentRate: 0,
    ...analytics.summary,
  };
  const totalValue = distribution.reduce((sum, item) => sum + item.value, 0);
  const memberDays = client.dateInscription ? Math.floor((new Date().getTime() - new Date(client.dateInscription).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  return (
    <div className="space-y-2 animate-in fade-in duration-300">
      {/* Row 1: Fidélité + Segment + Taux + Croissance - All in one row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* Points Fidélité */}
        <div className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/50 flex items-center gap-2.5">
          <div className="w-10 h-10 flex items-center justify-center bg-cyan-500/10 rounded-full border border-cyan-500/30 shrink-0">
            <Award size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Points Fidélité</p>
            <p className="text-lg font-bold text-cyan-400 leading-tight">{summary.fidelityPoints.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 truncate">Membre depuis {memberDays}j</p>
          </div>
        </div>

        {/* Segment & Tags */}
        <div className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Segment</p>
            <Badge value={client.segment} variant={client.segment === 'VIP' ? 'warning' : 'neutral'} />
          </div>
          <ClientTags clientId={client.id} compact={true} />
        </div>

        {/* Taux Remboursement */}
        <div className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/50 flex items-center justify-between">
          <div className="p-1.5 bg-slate-700/50 rounded-lg text-slate-400">
            <Target size={16} />
          </div>
          <div className="text-right">
            <span className={`text-xl font-bold ${summary.repaymentRate >= 90 ? 'text-emerald-400' : summary.repaymentRate >= 80 ? 'text-cyan-400' : 'text-amber-400'}`}>
              {summary.repaymentRate}%
            </span>
            <p className="text-[10px] text-slate-500 uppercase font-medium">Taux Remboursement</p>
          </div>
        </div>

        {/* Croissance */}
        <div className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/50 flex items-center justify-between">
          <div className="p-1.5 bg-slate-700/50 rounded-lg text-slate-400">
            <TrendingUp size={16} />
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-emerald-400">{monthlyTrend.savingsGrowth}</span>
            <p className="text-[10px] text-slate-500 uppercase font-medium">Croissance (Mois)</p>
          </div>
        </div>
      </div>

      {/* Row 2: Répartition Financière + Comparaison de périodes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
        {/* Répartition Financière - Compact */}
        <div className="lg:col-span-2 bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/50">
          <h4 className="text-[11px] font-bold text-white mb-2 flex items-center gap-1.5">
            <DollarSign size={12} className="text-cyan-400" />
            Répartition Financière
          </h4>
          {summary.totalSavings === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-slate-500">
              <div className="w-12 h-12 rounded-full border border-slate-700 border-dashed flex items-center justify-center mb-1">
                <DollarSign size={16} className="text-slate-600" />
              </div>
              <p className="text-[10px]">Aucune donnée financière</p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-24 h-24 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={distribution} innerRadius={28} outerRadius={40} paddingAngle={3} dataKey="value" onMouseEnter={onPieEnter}>
                      {distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0)" className="cursor-pointer hover:opacity-80" />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => `${value.toLocaleString()} F`} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[8px] text-slate-500 uppercase">Total</p>
                  <p className="text-[10px] font-bold text-white">{(summary.totalSavings / 1000).toFixed(0)}k</p>
                </div>
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                {distribution.map((item, index) => (
                  <div key={index} className={`flex items-center justify-between py-0.5 px-1.5 rounded text-[10px] cursor-pointer ${activeIndex === index ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'}`} onClick={() => setActiveIndex(index)}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-400 truncate">{item.label}</span>
                    </div>
                    <span className="font-semibold text-white shrink-0">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Comparaison de périodes - Compact */}
        <div className="lg:col-span-3 bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold text-white flex items-center gap-1.5">
              <BarChart3 size={12} className="text-cyan-400" />
              Comparaison
            </h4>
            <div className="flex gap-0.5 bg-slate-700/50 rounded p-0.5">
              {([['month', 'Mois'], ['quarter', 'Trim.'], ['year', 'An']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setComparePreset(key)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${comparePreset === key ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {comparisonLoading ? (
            <div className="grid grid-cols-3 gap-1.5">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-12 rounded" />)}</div>
          ) : comparison ? (() => {
            const presetLabels: Record<ComparePreset, [string, string]> = { month: ['Préc.', 'Actuel'], quarter: ['Préc.', 'Actuel'], year: ['Préc.', 'Actuel'] };
            const metrics: { key: string; label: string; isCurrency: boolean }[] = [
              { key: 'depots', label: 'Dépôts', isCurrency: true },
              { key: 'retraits', label: 'Retraits', isCurrency: true },
              { key: 'fluxNet', label: 'Flux net', isCurrency: true },
              { key: 'nombreTransactions', label: 'Transactions', isCurrency: false },
              { key: 'nombreCredits', label: 'Nvx crédits', isCurrency: false },
              { key: 'montantCredits', label: 'Mnt crédits', isCurrency: true },
            ];
            return (
              <>
                <div className="flex items-center gap-3 mb-1.5 text-[9px] text-slate-500 uppercase font-semibold">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> {presetLabels[comparePreset][0]}</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> {presetLabels[comparePreset][1]}</span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
                  {metrics.map(({ key, label, isCurrency }) => {
                    const v = comparison.variations[key];
                    if (!v) return null;
                    const isPositive = v.changePercent > 0;
                    const isNeutral = v.changePercent === 0;
                    const formatVal = (n: number) => isCurrency ? `${(n/1000).toFixed(n >= 1000 ? 0 : 1)}k` : n.toLocaleString();
                    return (
                      <div key={key} className="bg-slate-700/30 rounded p-1.5 border border-slate-700/30">
                        <p className="text-[9px] text-slate-500 uppercase font-semibold truncate">{label}</p>
                        <div className="flex items-end justify-between mt-0.5">
                          <p className="text-sm font-bold text-white leading-none">{isCurrency ? formatVal(v.periodB) : v.periodB}</p>
                          <div className={`flex items-center text-[9px] font-bold px-1 rounded ${isNeutral ? 'text-slate-400' : (key === 'retraits' ? !isPositive : isPositive) ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isNeutral ? <Minus size={8} /> : isPositive ? <ArrowUpRight size={8} /> : <ArrowDownRight size={8} />}
                            {Math.abs(v.changePercent).toFixed(0)}%
                          </div>
                        </div>
                        <p className="text-[8px] text-slate-500">vs {isCurrency ? formatVal(v.periodA) : v.periodA}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })() : <div className="text-center py-3 text-slate-500 text-[10px]">Aucune donnée comparative</div>}
        </div>
      </div>

      {/* Row 3: Navigation Cards - Inline compact */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'credits' as const, icon: CreditCard, count: summary.activeLoansCount, label: 'Crédits en cours', color: 'blue' },
          { key: 'savings' as const, icon: Wallet, count: summary.savingsAccountsCount, label: 'Comptes Épargne', color: 'emerald' },
          { key: 'tontines' as const, icon: Users, count: summary.activeTontinesCount, label: 'Tontines Actives', color: 'amber' },
        ].map(({ key, icon: Icon, count, label, color }) => (
          <div key={key}
            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all active:scale-[0.98] border border-transparent hover:border-${color}-500/50 ${count > 0 ? `bg-${color}-500/10 hover:bg-${color}-500/15` : 'bg-slate-800/30 hover:bg-slate-800/50'}`}
            onClick={() => setActiveMetric(key)}>
            <div className="flex items-center gap-2">
              <Icon size={16} className={`text-${color}-400`} />
              <span className="text-lg font-bold text-white">{count}</span>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">{label}</p>
              {count > 0 && <p className={`text-[9px] text-${color}-400 flex items-center justify-end gap-0.5`}>Détails <ArrowRight size={8} /></p>}
            </div>
          </div>
        ))}
      </div>

      {/* Details Modal */}
      <MetricDetailsModal isOpen={activeMetric !== null} onClose={() => setActiveMetric(null)} type={activeMetric} clientId={client.id} />
    </div>
  );
}
