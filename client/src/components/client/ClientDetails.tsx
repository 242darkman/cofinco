import React, { useState } from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { DollarSign, Award, MapPin, Phone, Mail, User, Building2, ChevronRight, TrendingUp, Wallet, AlertTriangle, Star, CreditCard, PiggyBank, ExternalLink } from 'lucide-react';
import { Card, Modal, Button, Skeleton } from '../ui';
import ClientTags from './ClientTags';
import ClientCreditsPanel from './ClientCreditsPanel';
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
    const [showSavingsModal, setShowSavingsModal] = useState(false);
    const [showCreditsPanel, setShowCreditsPanel] = useState(false);

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
        <div className="mb-4 p-4 bg-status-danger-bg border border-status-danger/30 rounded-xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
            <div className="shrink-0 w-10 h-10 rounded-full bg-status-danger-bg flex items-center justify-center">
                <AlertTriangle className="text-status-danger" size={20} />
            </div>
            <div>
                <h4 className="text-status-danger font-bold text-sm">Client {ALL_STATUS_LABELS[client.statut!] || client.statut}</h4>
                <p className="text-status-danger/80 text-xs">Les comptes de ce client sont gelés. Les opérations de débit sont bloquées.</p>
            </div>
        </div>
    )}
    {/* ====== END FROZEN CLIENT BANNER ====== */}

    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-in fade-in duration-500">

      {/* 1. Segment & Fidélité Card */}
      <Card variant="default" padding="none" className="overflow-hidden">
         <div className="p-4 sm:p-5">
           <div className="flex items-center gap-3 mb-4">
             <div className="p-2 bg-gradient-to-br from-accent/20 to-status-info/20 rounded-lg">
               <Star size={16} className="text-accent" />
             </div>
             <h3 className="text-sm font-bold text-content-primary tracking-tight">Segment & Fidélité</h3>
           </div>

           <div className="space-y-3">
             {/* Segment */}
             <div className="flex items-center justify-between p-3 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
               <span className="text-xs text-content-muted uppercase tracking-wide">Segment</span>
               <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-accent/10 text-accent border border-accent/20">
                 {client.segment || 'Standard'}
               </span>
             </div>

             {/* Fidélité */}
             <div className="p-3 rounded-lg bg-surface-subtle/30 border border-edge-subtle">
               <div className="flex items-center justify-between mb-2">
                 <span className="text-xs text-content-muted uppercase tracking-wide">Points fidélité</span>
                 <span className="text-lg font-bold text-content-primary">{summary.fidelityPoints.toLocaleString()}</span>
               </div>
               {/* Progress bar for repayment rate */}
               <div className="flex items-center gap-2">
                 <div className="flex-1 h-1.5 bg-surface-subtle-elevated rounded-full overflow-hidden">
                   <div
                     className="h-full bg-gradient-to-r from-status-success to-accent rounded-full transition-all duration-500"
                     style={{ width: `${Math.min(summary.repaymentRate, 100)}%` }}
                   />
                 </div>
                 <span className="text-[10px] font-semibold text-content-muted shrink-0">{summary.repaymentRate}%</span>
               </div>
               <p className="text-[10px] text-content-muted mt-1">Taux de remboursement</p>
             </div>

             <ClientTags clientId={client.id} compact={true} />
           </div>
         </div>
      </Card>

      {/* 2. Finances Card - Interactive */}
      <Card variant="default" padding="none" className="overflow-hidden flex flex-col">
        <div className="p-4 sm:p-5 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-status-info/20 to-accent/20 rounded-lg">
              <DollarSign size={16} className="text-status-info" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Finances</h3>
          </div>

          <div className="space-y-3 flex-1">
            {/* Credits - Clickable */}
            <button
              type="button"
              className={`group w-full text-left rounded-lg p-3 flex items-center justify-between border transition-all duration-200 cursor-pointer hover:shadow-sm ${
                summary.totalCreditDue > 0
                  ? 'bg-status-info/5 border-status-info/20 hover:border-status-info/40'
                  : 'bg-surface-subtle/30 border-edge-subtle hover:bg-surface-subtle/50'
              }`}
              onClick={() => setShowCreditsPanel(true)}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${summary.totalCreditDue > 0 ? 'bg-status-info-bg' : 'bg-surface-elevated/50'}`}>
                  <CreditCard size={14} className={summary.totalCreditDue > 0 ? 'text-status-info' : 'text-content-muted'} />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-content-muted mb-0.5 flex items-center gap-1.5">
                    Crédits en cours
                    {summary.totalCreditDue > 0 && <span className="w-1.5 h-1.5 rounded-full bg-status-info animate-pulse" />}
                  </p>
                  <p className="text-base font-bold text-content-primary">{summary.totalCreditDue.toLocaleString()} <span className="text-xs font-normal text-content-muted">FCFA</span></p>
                </div>
              </div>
              <ChevronRight size={16} className="text-content-muted group-hover:text-content-primary transition-colors shrink-0" />
            </button>

            {/* Epargnes - Clickable */}
            <button
              type="button"
              className="group w-full text-left rounded-lg p-3 flex items-center justify-between border border-edge-subtle bg-surface-subtle/30 hover:bg-surface-subtle/50 transition-all duration-200 cursor-pointer hover:shadow-sm"
              onClick={() => setShowSavingsModal(true)}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-status-success-bg">
                  <PiggyBank size={14} className="text-status-success" />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-content-muted mb-0.5">Total des comptes</p>
                  <p className="text-base font-bold text-content-primary">{summary.totalSavings.toLocaleString()} <span className="text-xs font-normal text-content-muted">FCFA</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {monthlyTrend.savingsGrowth.startsWith('+') && (
                  <span className="flex items-center text-[10px] font-bold text-status-success bg-status-success-bg px-1.5 py-0.5 rounded">
                    <TrendingUp size={10} className="mr-0.5" />
                    {monthlyTrend.savingsGrowth}
                  </span>
                )}
                <ChevronRight size={16} className="text-content-muted group-hover:text-content-primary transition-colors" />
              </div>
            </button>
          </div>
        </div>
      </Card>

      {/* 3. Contact & Info Card */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-status-success/20 to-accent/20 rounded-lg">
              <User size={16} className="text-status-success" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Contact & Infos</h3>
          </div>

          <div className="space-y-2">
            {/* Phone */}
            <a
              href={client.telephone ? `tel:${client.telephone}` : undefined}
              className={`flex items-center gap-3 p-2.5 rounded-lg border border-edge-subtle transition-colors ${
                client.telephone ? 'hover:bg-surface-subtle/50 cursor-pointer group' : ''
              }`}
            >
              <div className="p-1.5 rounded-md bg-accent/10 shrink-0">
                <Phone size={14} className="text-accent" />
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-[10px] text-content-muted uppercase">Téléphone</p>
                <p className="text-sm font-medium text-content-secondary truncate">{client.telephone || '-'}</p>
              </div>
              {client.telephone && <ExternalLink size={12} className="text-content-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
            </a>

            {/* Email */}
            <a
              href={client.email ? `mailto:${client.email}` : undefined}
              className={`flex items-center gap-3 p-2.5 rounded-lg border border-edge-subtle transition-colors ${
                client.email ? 'hover:bg-surface-subtle/50 cursor-pointer group' : ''
              }`}
            >
              <div className="p-1.5 rounded-md bg-status-success/10 shrink-0">
                <Mail size={14} className="text-status-success" />
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-[10px] text-content-muted uppercase">Email</p>
                <p className="text-sm font-medium text-content-secondary truncate">{client.email || '-'}</p>
              </div>
              {client.email && <ExternalLink size={12} className="text-content-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
            </a>

            {client.adresseDomicile && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-edge-subtle">
                <div className="p-1.5 rounded-md bg-status-info/10 shrink-0">
                  <MapPin size={14} className="text-status-info" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] text-content-muted uppercase">Adresse</p>
                  <p className="text-sm font-medium text-content-secondary truncate">{client.adresseDomicile}</p>
                </div>
              </div>
            )}

            {client.agenceNom && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg border border-edge-subtle">
                <div className="p-1.5 rounded-md bg-status-info/10 shrink-0">
                  <Building2 size={14} className="text-status-info" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] text-content-muted uppercase">Agence</p>
                  <p className="text-sm font-medium text-content-secondary truncate">{client.agenceNom}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
      
      {/* Credits Panel Modal */}
      <ClientCreditsPanel
        clientId={client.id}
        isOpen={showCreditsPanel}
        onClose={() => setShowCreditsPanel(false)}
      />

      {/* Quick View Modal for Savings */}
      <Modal 
         isOpen={showSavingsModal} 
         onClose={() => setShowSavingsModal(false)}
         title="Détail de l'épargne"
         size="sm"
      >
          <div className="space-y-4 pt-2">
             <div className="bg-surface/50 rounded-xl p-4 border border-edge-subtle text-center">
                 <p className="text-sm text-content-muted mb-1">Total Consolidé</p>
                 <p className="text-3xl font-bold text-content-primary">{summary.totalSavings.toLocaleString()} <span className="text-base font-normal text-content-muted">FCFA</span></p>
             </div>

             <div className="space-y-2">
                 {distribution.map((item: { label: string; value: number; color: string }, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-surface/30 border border-edge-subtle">
                          <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-surface text-content-muted">
                                   <Wallet size={16} style={{ color: item.color }} />
                              </div>
                              <span className="font-medium text-content-secondary">{item.label}</span>
                          </div>
                          <span className="font-bold text-content-primary">{item.value.toLocaleString()} FCFA</span>
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
