import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign, ChevronDown, ChevronUp, Clock, CheckCircle2,
  AlertTriangle, AlertCircle, CreditCard, Calendar, Percent, X,
  TrendingDown, FileText
} from 'lucide-react';
import { creditApi } from '../../lib/api-client';
import { formatMoney } from '../../lib/format';
import { Modal, Badge, Skeleton } from '../ui';
import {
  CREDIT_STATUS_LABELS,
  CREDIT_STATUS_COLORS,
  ECHEANCE_CREDIT_STATUS_COLORS,
} from '../../lib/status-labels';
import {
  STATUT_ECHEANCE_CREDIT_LABELS,
} from '@shared/enum/status-constants';

interface ClientCreditsPanelProps {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Normalize credit fields (backend may return snake_case or camelCase)
function normalizeCredit(raw: any) {
  return {
    id: raw.id,
    numeroCredit: raw.numeroCredit || raw.numero_credit || '',
    montant: Number(raw.montant || 0),
    taux: Number(raw.taux || raw.taux_interet || 0),
    duree: Number(raw.duree || raw.duree_mois || 0),
    soldeRestant: Number(raw.soldeRestant || raw.solde_restant || 0),
    statut: raw.statut || raw.status || 'ACTIVE',
    typeCredit: raw.typeCredit || raw.type_credit || '',
    objetCredit: raw.objetCredit || raw.objet || '',
    echeance: raw.echeance || '',
    montantEcheance: Number(raw.montantEcheance || raw.montant_echeance || 0),
    dateDebut: raw.dateDebut || raw.date_debut || null,
    dateFin: raw.dateFin || raw.date_fin || null,
    prochaineEcheance: raw.prochaineEcheance || raw.prochaine_echeance || null,
  };
}

function normalizeEcheance(raw: any) {
  return {
    id: raw.id,
    numeroEcheance: Number(raw.numeroEcheance || raw.numero_echeance || 0),
    dateEcheance: raw.dateEcheance || raw.date_echeance || '',
    montantCapital: Number(raw.montantCapital || raw.montant_capital || raw.montant_principal || 0),
    montantInteret: Number(raw.montantInteret || raw.montant_interet || 0),
    montantTotal: Number(raw.montantTotal || raw.montant_total || 0),
    montantPaye: Number(raw.montantPaye || raw.montant_paye || 0),
    statut: raw.statut || raw.status || 'UPCOMING',
    datePaiement: raw.datePaiement || raw.date_paiement || null,
    penaliteMontant: Number(raw.penaliteMontant || raw.penalite_montant || 0),
  };
}

function getEcheanceIcon(statut: string) {
  switch (statut) {
    case 'PAID': case 'SETTLED': return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'LATE': return <AlertTriangle size={14} className="text-red-400" />;
    case 'PARTIALLY_PAID': return <AlertCircle size={14} className="text-orange-400" />;
    default: return <Clock size={14} className="text-blue-400" />;
  }
}

function getDaysInfo(dateEcheance: string, statut: string): string | null {
  if (!dateEcheance) return null;
  const now = new Date();
  const due = new Date(dateEcheance);
  const diffMs = now.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (statut === 'LATE' && diffDays > 0) {
    return `${diffDays}j de retard`;
  }
  if ((statut === 'UPCOMING' || statut === 'DUE') && diffDays < 0) {
    const daysLeft = Math.abs(diffDays);
    if (daysLeft <= 7) return `dans ${daysLeft}j`;
  }
  return null;
}

// Sub-component: expandable schedule for a single credit
function CreditSchedule({ creditId }: { creditId: string }) {
  const { data: rawEcheances, isLoading } = useQuery({
    queryKey: ['credit-echeances', creditId],
    queryFn: async () => {
      const res = await fetch(`/api/credits/${creditId}/echeances`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const echeances = (rawEcheances || []).map(normalizeEcheance);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={36} />)}
      </div>
    );
  }

  if (echeances.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        Aucun echéancier généré
      </div>
    );
  }

  const paid = echeances.filter((e: any) => e.statut === 'PAID' || e.statut === 'SETTLED').length;
  const late = echeances.filter((e: any) => e.statut === 'LATE').length;

  return (
    <div className="border-t border-slate-700/50 bg-slate-900/30">
      {/* Schedule summary */}
      <div className="flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
        <span>{paid}/{echeances.length} payées</span>
        {late > 0 && <span className="text-red-400 font-semibold">{late} en retard</span>}
      </div>

      {/* Schedule rows */}
      <div className="max-h-64 overflow-y-auto">
        {echeances.map((ech: any) => {
          const daysInfo = getDaysInfo(ech.dateEcheance, ech.statut);
          const colorClass = ECHEANCE_CREDIT_STATUS_COLORS[ech.statut as keyof typeof ECHEANCE_CREDIT_STATUS_COLORS] || '';
          const label = STATUT_ECHEANCE_CREDIT_LABELS[ech.statut as keyof typeof STATUT_ECHEANCE_CREDIT_LABELS] || ech.statut;
          const paidPercent = ech.montantTotal > 0 ? Math.min(100, (ech.montantPaye / ech.montantTotal) * 100) : 0;

          return (
            <div
              key={ech.id}
              className="flex items-center gap-2 px-3 py-2 border-t border-slate-800/50 text-sm hover:bg-slate-800/20"
            >
              {/* Icon + Number */}
              <div className="w-6 text-center shrink-0">
                {getEcheanceIcon(ech.statut)}
              </div>

              {/* Date */}
              <div className="w-20 sm:w-24 shrink-0 text-slate-400 text-xs">
                {ech.dateEcheance ? new Date(ech.dateEcheance).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '-'}
              </div>

              {/* Amount + paid bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 text-xs font-medium truncate">
                    {formatMoney(ech.montantTotal, { compact: true })}
                  </span>
                  {ech.montantPaye > 0 && ech.statut !== 'PAID' && ech.statut !== 'SETTLED' && (
                    <span className="text-[10px] text-slate-500 ml-1">
                      payé: {formatMoney(ech.montantPaye, { compact: true })}
                    </span>
                  )}
                </div>
                {/* Micro progress bar */}
                <div className="h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ech.statut === 'LATE' ? 'bg-red-500' :
                      ech.statut === 'PARTIALLY_PAID' ? 'bg-orange-500' :
                      paidPercent >= 100 ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${paidPercent}%` }}
                  />
                </div>
              </div>

              {/* Status badge + days info */}
              <div className="shrink-0 flex items-center gap-1.5">
                {daysInfo && (
                  <span className={`text-[10px] font-medium ${ech.statut === 'LATE' ? 'text-red-400' : 'text-blue-400'}`}>
                    {daysInfo}
                  </span>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colorClass}`}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-component: a single credit card
function CreditCard_({ credit, defaultExpanded }: { credit: any; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false);
  const c = normalizeCredit(credit);

  const montantNum = c.montant;
  const soldeNum = c.soldeRestant;
  const paid = montantNum - soldeNum;
  const progressPct = montantNum > 0 ? Math.min(100, (paid / montantNum) * 100) : 0;

  const statusLabel = CREDIT_STATUS_LABELS[c.statut as keyof typeof CREDIT_STATUS_LABELS] || c.statut;
  const statusColor = CREDIT_STATUS_COLORS[c.statut as keyof typeof CREDIT_STATUS_COLORS] || '';

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <CreditCard size={14} className="text-blue-400 shrink-0" />
              <span className="text-sm font-bold text-white truncate">{c.numeroCredit || 'Crédit'}</span>
            </div>
            {c.typeCredit && (
              <span className="text-[10px] text-slate-500">{c.typeCredit}{c.objetCredit ? ` - ${c.objetCredit}` : ''}</span>
            )}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Amount + Progress */}
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-lg font-bold text-white">{formatMoney(montantNum)}</span>
            <span className="text-xs text-slate-400">{progressPct.toFixed(0)}% remboursé</span>
          </div>
          <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                c.statut === 'LATE' ? 'bg-gradient-to-r from-red-600 to-red-400' :
                c.statut === 'PAID' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' :
                'bg-gradient-to-r from-blue-600 to-cyan-400'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Key info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-900/40 rounded-md p-2">
            <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
              <TrendingDown size={10} /> Solde restant
            </div>
            <span className="font-semibold text-white">{formatMoney(soldeNum, { compact: true })}</span>
          </div>
          <div className="bg-slate-900/40 rounded-md p-2">
            <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
              <Percent size={10} /> Taux
            </div>
            <span className="font-semibold text-white">{c.taux}%</span>
          </div>
          <div className="bg-slate-900/40 rounded-md p-2">
            <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
              <Calendar size={10} /> Durée
            </div>
            <span className="font-semibold text-white">{c.duree} éch.</span>
          </div>
          <div className="bg-slate-900/40 rounded-md p-2">
            <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1">
              <DollarSign size={10} /> Échéance
            </div>
            <span className="font-semibold text-white">{formatMoney(c.montantEcheance, { compact: true })}</span>
          </div>
        </div>

        {/* Next due date */}
        {c.prochaineEcheance && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock size={12} />
            Prochaine échéance: {new Date(c.prochaineEcheance).toLocaleDateString('fr-FR')}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition-colors py-1"
        >
          <FileText size={12} />
          {expanded ? 'Masquer' : 'Voir'} l'échéancier
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expandable schedule */}
      {expanded && <CreditSchedule creditId={c.id} />}
    </div>
  );
}

export default function ClientCreditsPanel({ clientId, isOpen, onClose }: ClientCreditsPanelProps) {
  const { data: rawCredits, isLoading } = useQuery({
    queryKey: ['client-credits', clientId],
    queryFn: () => creditApi.getAll({ clientId }),
    enabled: isOpen,
    staleTime: 30000,
  });

  const credits = (rawCredits || []).map(normalizeCredit);
  const activeCredits = credits.filter(c => c.statut === 'ACTIVE' || c.statut === 'LATE' || c.statut === 'WAITING_DISBURSEMENT');
  const closedCredits = credits.filter(c => c.statut === 'PAID' || c.statut === 'CLOSED' || c.statut === 'CANCELLED');
  const totalSoldeRestant = activeCredits.reduce((sum, c) => sum + c.soldeRestant, 0);
  const totalMontant = activeCredits.reduce((sum, c) => sum + c.montant, 0);
  const lateCount = credits.filter(c => c.statut === 'LATE').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-blue-400" />
          Crédits du client
        </div>
      }
      size="lg"
    >
      <div className="space-y-4 pt-2">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            <Skeleton variant="rounded" height={80} />
            <Skeleton variant="rounded" height={200} />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && credits.length === 0 && (
          <div className="text-center py-12">
            <CreditCard size={48} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Aucun crédit</p>
            <p className="text-slate-500 text-sm mt-1">Ce client n'a aucun crédit enregistré.</p>
          </div>
        )}

        {/* Summary bar */}
        {!isLoading && credits.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
                <p className="text-[10px] text-slate-500 uppercase mb-0.5">Crédits actifs</p>
                <p className="text-xl font-bold text-white">{activeCredits.length}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
                <p className="text-[10px] text-slate-500 uppercase mb-0.5">Solde restant</p>
                <p className="text-xl font-bold text-white">{formatMoney(totalSoldeRestant, { compact: true })}</p>
              </div>
              <div className={`bg-slate-800/50 rounded-xl p-3 border text-center ${lateCount > 0 ? 'border-red-500/30' : 'border-slate-700/50'}`}>
                <p className="text-[10px] text-slate-500 uppercase mb-0.5">En retard</p>
                <p className={`text-xl font-bold ${lateCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{lateCount}</p>
              </div>
            </div>

            {/* Global progress */}
            {totalMontant > 0 && (
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Progression globale</span>
                  <span>{((1 - totalSoldeRestant / totalMontant) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2.5 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all"
                    style={{ width: `${Math.min(100, (1 - totalSoldeRestant / totalMontant) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Active credits */}
            {activeCredits.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Crédits actifs ({activeCredits.length})
                </h4>
                {activeCredits.map((credit, idx) => (
                  <CreditCard_ key={credit.id} credit={rawCredits![credits.indexOf(credit)]} defaultExpanded={idx === 0} />
                ))}
              </div>
            )}

            {/* Closed credits */}
            {closedCredits.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Crédits soldés/clôturés ({closedCredits.length})
                </h4>
                {closedCredits.map(credit => (
                  <CreditCard_ key={credit.id} credit={rawCredits![credits.indexOf(credit)]} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
