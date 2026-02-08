import React, { useState } from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { useLocation } from 'wouter';
import { DollarSign, Award, MapPin, Phone, Mail, User, Building2, ChevronRight, TrendingUp, Wallet, AlertTriangle } from 'lucide-react';
import { Card, Modal, Button, Skeleton } from '../ui';
import ClientTags from './ClientTags';
import { useQuery } from '@tanstack/react-query';
import { ALL_STATUS_LABELS } from '../../lib/status-labels';

interface ClientDetailsProps {
    client: ClientWithIdentity;
}

interface AnalyticsData {
    summary: {
      totalSavings: number;
      totalCreditDue: number;
      activeLoansCount: number;
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

export default function ClientDetails({ client }: ClientDetailsProps) {
    const [, setLocation] = useLocation();
    const [showSavingsModal, setShowSavingsModal] = useState(false);

    // Fetch Real-Time Analytics (Cached from Analytics Tab)
    const { data: analytics, isLoading } = useQuery<AnalyticsData>({
        queryKey: ['client-analytics', client.id],
        queryFn: async () => {
        const res = await fetch(`/api/clients/${client.id}/analytics`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
        },
        // We can rely on cache mostly, but poll if needed
        staleTime: 30000, 
    });

    if (isLoading || !analytics) {
        return (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                 <Skeleton className="h-48 w-full rounded-xl" />
                 <Skeleton className="h-48 w-full rounded-xl" />
                 <Skeleton className="h-48 w-full rounded-xl" />
            </div>
        );
    }

    const raw = analytics as any;
    const summary = {
      totalSavings: raw.summary?.totalSavings ?? raw.summary?.total_savings ?? 0,
      totalCreditDue: raw.summary?.totalCreditDue ?? raw.summary?.total_credit_due ?? 0,
      activeLoansCount: raw.summary?.activeLoansCount ?? raw.summary?.active_loans_count ?? 0,
      fidelityPoints: raw.summary?.fidelityPoints ?? raw.summary?.fidelity_points ?? 0,
      repaymentRate: raw.summary?.repaymentRate ?? raw.summary?.repayment_rate ?? 0,
    };
    const distribution = raw.distribution ?? [];
    const monthlyTrend = {
      savingsGrowth: raw.monthlyTrend?.savingsGrowth ?? raw.monthly_trend?.savings_growth ?? '0%',
      creditEvolution: raw.monthlyTrend?.creditEvolution ?? raw.monthly_trend?.credit_evolution ?? '0%',
    };

  return (
    <>
    {/* ====== FROZEN CLIENT BANNER ====== */}
    {['INACTIVE', 'SUSPENDED', 'DELETED'].includes(client.statut || '') && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
            <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="text-red-400" size={20} />
            </div>
            <div>
                <h4 className="text-red-400 font-bold text-sm">Client {ALL_STATUS_LABELS[client.statut!] || client.statut}</h4>
                <p className="text-red-300/80 text-xs">Les comptes de ce client sont gelés. Les opérations de débit sont bloquées.</p>
            </div>
        </div>
    )}
    {/* ====== END FROZEN CLIENT BANNER ====== */}

    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-in fade-in duration-500">
      
      {/* 1. Segment & Fidélité Card */}
      <Card variant="default" padding="sm" className="relative overflow-hidden border-slate-700/50 bg-slate-900/50">
         {/* Background Accent */}
         <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

         <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4 relative z-10">
             <Award size={16} className="text-slate-400" /> Segment & Fidélité
         </h3>

         <div className="space-y-3 relative z-10">
             {/* Segment + Points row */}
             <div className="flex items-center gap-3">
                 <div className="flex-1 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                     <p className="text-[10px] text-slate-500 uppercase tracking-tighter mb-1.5">Segment</p>
                     <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                         {client.segment || 'Standard'}
                     </span>
                 </div>
                 <div className="flex-1 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                     <p className="text-[10px] text-slate-500 uppercase tracking-tighter mb-1.5">Fidélité</p>
                     <p className="text-lg font-bold text-white">{summary.fidelityPoints.toLocaleString()} <span className="text-xs font-normal text-slate-500">pts</span></p>
                     <p className="text-[10px] text-slate-400 mt-0.5">{summary.repaymentRate}% remboursement</p>
                 </div>
             </div>

             {/* Tags */}
             <ClientTags clientId={client.id} compact={true} />
         </div>
      </Card>

      {/* 2. Finances Card - Interactive */}
      <Card variant="default" padding="sm" className="flex flex-col border-slate-700/50 bg-slate-900/50">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
            <DollarSign size={16} className="text-slate-400" /> Finances
        </h3>

        <div className="space-y-3 flex-1">
            {/* Credits - Clickable Drill-down */}
            <div 
                className="group bg-slate-800/30 hover:bg-slate-800/60 rounded-lg p-3 flex items-center justify-between border border-slate-700/30 transition-colors cursor-pointer"
                onClick={() => setLocation(`/finance/credits?client=${client.id}`)}
            >
                <div>
                    <p className="text-[10px] uppercase text-slate-500 mb-0.5 flex items-center gap-2">
                        Crédits En Cours
                        {summary.totalCreditDue > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>}
                    </p>
                    <p className="text-base font-bold text-white">{summary.totalCreditDue.toLocaleString()} FCFA</p>
                </div>
                {/* Trend / Chevron */}
                <div className="flex items-center gap-2">
                   {/* Placeholder for trend if available, distinct from savings */}
                   <ChevronRight size={16} className="text-slate-600 group-hover:text-white transition-colors" />
                </div>
            </div>

            {/* Epargnes - Clickable Modal Trigger */}
            <div 
                className="group bg-slate-800/30 hover:bg-slate-800/60 rounded-lg p-3 flex items-center justify-between border border-slate-700/30 transition-colors cursor-pointer"
                onClick={() => setShowSavingsModal(true)}
            >
                <div>
                     <p className="text-[10px] uppercase text-slate-500 mb-0.5">Total des comptes</p>
                     <p className="text-base font-bold text-white">{summary.totalSavings.toLocaleString()} FCFA</p>
                </div>
                 {/* Trend / Chevron */}
                 <div className="flex items-center gap-3">
                   {monthlyTrend.savingsGrowth.startsWith('+') && (
                       <div className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                           <TrendingUp size={10} className="mr-1" />
                           {monthlyTrend.savingsGrowth}
                       </div>
                   )}
                   <ChevronRight size={16} className="text-slate-600 group-hover:text-white transition-colors" />
                </div>
            </div>
        </div>
      </Card>

      {/* 3. Contact & Info Card */}
      <Card variant="default" padding="sm" className="border-slate-700/50 bg-slate-900/50">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
              <User size={16} className="text-slate-400" /> Contact & Infos
          </h3>

          <div className="space-y-3">
               <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                   <div className="bg-slate-700/50 p-1.5 rounded-md">
                        <Phone size={14} className="text-cyan-400" />
                   </div>
                   <div className="overflow-hidden">
                       <p className="text-[10px] text-slate-500 uppercase">Téléphone</p>
                       <p className="text-sm font-medium text-slate-200 truncate">{client.telephone || '-'}</p>
                   </div>
               </div>

               <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                   <div className="bg-slate-700/50 p-1.5 rounded-md">
                        <Mail size={14} className="text-emerald-400" />
                   </div>
                   <div className="overflow-hidden">
                       <p className="text-[10px] text-slate-500 uppercase">Email</p>
                       <p className="text-sm font-medium text-slate-200 truncate">{client.email || '-'}</p>
                   </div>
               </div>
               
               {client.adresseDomicile && (
                <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                    <div className="bg-slate-700/50 p-1.5 rounded-md">
                            <MapPin size={14} className="text-purple-400" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-[10px] text-slate-500 uppercase">Adresse</p>
                        <p className="text-sm font-medium text-slate-200 truncate">{client.adresseDomicile}</p>
                    </div>
                </div>
               )}

               {client.agenceNom && (
                <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                    <div className="bg-slate-700/50 p-1.5 rounded-md">
                            <Building2 size={14} className="text-blue-400" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-[10px] text-slate-500 uppercase">Agence Affiliée</p>
                        <p className="text-sm font-medium text-slate-200 truncate">{client.agenceNom}</p>
                    </div>
                </div>
               )}
          </div>
      </Card>
      
      {/* Quick View Modal for Savings */}
      <Modal 
         isOpen={showSavingsModal} 
         onClose={() => setShowSavingsModal(false)}
         title="Détail de l'épargne"
         size="sm"
      >
          <div className="space-y-4 pt-2">
             <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center">
                 <p className="text-sm text-slate-400 mb-1">Total Consolidé</p>
                 <p className="text-3xl font-bold text-white">{summary.totalSavings.toLocaleString()} <span className="text-base font-normal text-slate-500">FCFA</span></p>
             </div>

             <div className="space-y-2">
                 {distribution.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                          <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-slate-800 text-slate-400">
                                   <Wallet size={16} style={{ color: item.color }} />
                              </div>
                              <span className="font-medium text-slate-200">{item.label}</span>
                          </div>
                          <span className="font-bold text-white">{item.value.toLocaleString()} FCFA</span>
                      </div>
                 ))}
             </div>
             
             <div className="pt-2">
                 <Button variant="outline" className="w-full" onClick={() => setShowSavingsModal(false)}>Fermer</Button>
             </div>
          </div>
      </Modal>

    </div>
    </>
  );
}
