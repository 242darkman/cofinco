import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { creditApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import { escapeHtml } from '../../../lib/sanitize';
import { SkeletonCard } from '../../ui/Skeleton';
import { StatutCredit, StatutEcheanceCredit, STATUT_ECHEANCE_CREDIT_LABELS } from '@shared/enum/status-constants';

interface Echeance {
  id: string;
  creditId: string;
  numeroEcheance: number;
  dateEcheance: string;
  montantCapital: number;
  montantInteret: number;
  montantTotal: number;
  statut: string;
  datePaiement: string | null;
  montantPaye: number;
  penaliteMontant: number;
  joursRetard: number;
  credits: {
    numeroCredit: string;
    clients: { nom: string };
  };
}

type FilterType = 'all' | 'upcoming' | 'overdue' | 'paid';
type DateFilterType = 'week' | 'month' | 'all';

const PAGE_SIZE = 15;

export default function CreditEcheancier() {
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('upcoming');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('month');
  const [page, setPage] = useState(1);

  const loadEcheances = useCallback(async () => {
    setLoading(true);
    try {
      const credits = await creditApi.getAll({ statut: StatutCredit.ACTIVE, includeEcheances: true });

      const allEcheances: Echeance[] = [];
      for (const credit of credits) {
        if (credit.echeances) {
          for (const ech of credit.echeances) {
            allEcheances.push({
              id: ech.id,
              creditId: ech.creditId,
              numeroEcheance: ech.numeroEcheance,
              dateEcheance: ech.dateEcheance,
              montantCapital: Number(ech.montantCapital) || 0,
              montantInteret: Number(ech.montantInteret) || 0,
              montantTotal: Number(ech.montantTotal) || 0,
              montantPaye: Number(ech.montantPaye) || 0,
              penaliteMontant: Number(ech.penaliteMontant) || 0,
              statut: ech.statut,
              datePaiement: ech.datePaiement,
              joursRetard: 0,
              credits: {
                numeroCredit: credit.numeroCredit,
                clients: {
                  nom: formatClientName(credit.clients?.nom || credit.clientNom || 'Client', credit.clients?.prenom),
                },
              },
            });
          }
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let processed = allEcheances.map(ech => {
        const dateEch = new Date(ech.dateEcheance);
        dateEch.setHours(0, 0, 0, 0);
        const joursRetard =
          (ech.statut === StatutEcheanceCredit.UPCOMING || ech.statut === StatutEcheanceCredit.LATE) && dateEch < today
            ? Math.floor((today.getTime() - dateEch.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        return {
          ...ech,
          joursRetard,
          statut: joursRetard > 0 ? StatutEcheanceCredit.LATE : ech.statut,
        };
      });

      if (filter === 'upcoming') {
        processed = processed.filter(e => e.statut === StatutEcheanceCredit.UPCOMING && new Date(e.dateEcheance) >= today);
      } else if (filter === 'overdue') {
        processed = processed.filter(e => e.statut === StatutEcheanceCredit.LATE);
      } else if (filter === 'paid') {
        processed = processed.filter(e => e.statut === StatutEcheanceCredit.PAID || e.statut === StatutEcheanceCredit.SETTLED);
      }

      if (dateFilter === 'week') {
        const limit = new Date();
        limit.setDate(limit.getDate() + 7);
        processed = processed.filter(e => new Date(e.dateEcheance) <= limit);
      } else if (dateFilter === 'month') {
        const limit = new Date();
        limit.setMonth(limit.getMonth() + 1);
        processed = processed.filter(e => new Date(e.dateEcheance) <= limit);
      }

      processed.sort((a, b) => new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime());
      setEcheances(processed);
    } catch (error) {
      handleApiError(error, 'Erreur lors du chargement des échéances');
    } finally {
      setLoading(false);
    }
  }, [filter, dateFilter]);

  useEffect(() => { loadEcheances(); }, [loadEcheances]);
  useEffect(() => { setPage(1); }, [filter, dateFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: echeances.length,
    enAttente: echeances.filter(e => e.statut === StatutEcheanceCredit.UPCOMING).length,
    enRetard: echeances.filter(e => e.statut === StatutEcheanceCredit.LATE || e.joursRetard > 0).length,
    paye: echeances.filter(e => e.statut === StatutEcheanceCredit.PAID || e.statut === StatutEcheanceCredit.SETTLED).length,
    montantEnAttente: echeances.filter(e => e.statut === StatutEcheanceCredit.UPCOMING).reduce((s, e) => s + e.montantTotal, 0),
    montantRetard: echeances.filter(e => e.statut === StatutEcheanceCredit.LATE || e.joursRetard > 0).reduce((s, e) => s + e.montantTotal, 0),
  }), [echeances]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(echeances.length / PAGE_SIZE));
  const pagedEcheances = useMemo(() => echeances.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [echeances, page]);

  // Helpers
  const getDaysLabel = useCallback((date: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return null;
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    return `${diff}j`;
  }, []);

  const getStatutBadge = useCallback((statut: string, joursRetard: number) => {
    if (statut === StatutEcheanceCredit.PAID || statut === StatutEcheanceCredit.SETTLED) {
      return <span className="px-1.5 py-0.5 bg-status-success-bg text-status-success rounded text-[10px] font-semibold">{STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.PAID]}</span>;
    }
    if (statut === StatutEcheanceCredit.LATE || joursRetard > 0) {
      return <span className="px-1.5 py-0.5 bg-status-danger-bg text-status-danger rounded text-[10px] font-semibold">{joursRetard}j retard</span>;
    }
    return <span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[10px] font-semibold">{STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.UPCOMING]}</span>;
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} className="h-16 rounded-lg" />)}
        </div>
        <SkeletonCard className="h-8 w-80" />
        <SkeletonCard className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stat cards — compact */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          { label: 'Total Échéances', value: stats.total, sub: 'Période sélectionnée', icon: Calendar, color: 'text-status-info', bg: 'bg-status-info-bg' },
          { label: 'En Attente', value: stats.enAttente, sub: formatMoney(stats.montantEnAttente), icon: Clock, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'En Retard', value: stats.enRetard, sub: formatMoney(stats.montantRetard), icon: AlertTriangle, color: 'text-status-danger', bg: 'bg-status-danger-bg' },
          { label: 'Payé', value: stats.paye, sub: 'Complétées', icon: CheckCircle, color: 'text-status-success', bg: 'bg-status-success-bg' },
        ] as const).map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} border border-edge/50 rounded-lg px-3 py-2`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>{label}</span>
              <Icon size={13} className={color} />
            </div>
            <div className="text-lg font-bold text-content-primary leading-tight">{value}</div>
            <div className={`text-[10px] ${color} truncate`}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters — inline compact */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-surface-elevated rounded-lg p-0.5">
          {([
            { value: 'all' as const, label: 'Toutes' },
            { value: 'upcoming' as const, label: 'À venir' },
            { value: 'overdue' as const, label: 'En retard' },
            { value: 'paid' as const, label: 'Payées' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filter === value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-1 bg-surface-elevated rounded-lg p-0.5">
          {([
            { value: 'week' as const, label: '7 jours' },
            { value: 'month' as const, label: '30 jours' },
            { value: 'all' as const, label: 'Tout' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setDateFilter(value)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                dateFilter === value
                  ? 'bg-surface-base text-content-primary shadow-sm'
                  : 'text-content-muted hover:text-content-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {echeances.length === 0 ? (
        <div className="text-center py-10 text-content-muted text-sm">
          Aucune échéance à afficher pour les filtres sélectionnés
        </div>
      ) : (
        <div className="border border-edge rounded-lg overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 px-3 py-2 bg-surface-elevated/60 text-[10px] font-semibold text-content-muted uppercase tracking-wider border-b border-edge">
            <span>Crédit / Client</span>
            <span>Date</span>
            <span className="text-right w-24">Montant</span>
            <span className="text-center w-20">Statut</span>
            <span className="text-right w-20">Payé</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-edge/50">
            {pagedEcheances.map(ech => {
              const daysLabel = getDaysLabel(ech.dateEcheance);
              const isUrgent = daysLabel === "Aujourd'hui" || daysLabel === 'Demain';
              const pct = ech.montantTotal > 0 ? Math.round((ech.montantPaye / ech.montantTotal) * 100) : 0;

              return (
                <div
                  key={ech.id}
                  className={`grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-1 sm:gap-2 items-center px-3 py-2 hover:bg-surface-subtle/50 transition-colors ${isUrgent ? 'bg-status-warning-bg/30' : ''}`}
                >
                  {/* Credit + Client */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-accent font-mono font-bold">{escapeHtml(ech.credits.numeroCredit)}</span>
                      <span className="text-[11px] text-content-primary font-medium truncate">{escapeHtml(ech.credits.clients.nom)}</span>
                    </div>
                    <span className="text-[10px] text-content-muted">Éch. #{ech.numeroEcheance}</span>
                  </div>

                  {/* Date */}
                  <div className="flex items-center gap-1.5 text-[11px] text-content-secondary">
                    <Calendar size={11} className="shrink-0 text-content-muted" />
                    <time dateTime={ech.dateEcheance}>
                      {new Date(ech.dateEcheance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </time>
                    {daysLabel && (
                      <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${isUrgent ? 'bg-status-warning-bg text-status-warning' : 'text-accent'}`}>
                        {daysLabel}
                      </span>
                    )}
                  </div>

                  {/* Montant */}
                  <div className="text-right w-24">
                    <div className="text-xs font-bold text-content-primary">{formatMoney(ech.montantTotal)}</div>
                    <div className="text-[9px] text-content-muted">
                      C:{formatMoney(ech.montantCapital)} I:{formatMoney(ech.montantInteret)}
                    </div>
                  </div>

                  {/* Statut */}
                  <div className="flex justify-center w-20">
                    {getStatutBadge(ech.statut, ech.joursRetard)}
                  </div>

                  {/* Payé */}
                  <div className="text-right w-20">
                    <div className="text-[11px] font-semibold text-content-primary">{formatMoney(ech.montantPaye)}</div>
                    {ech.montantTotal > 0 && (
                      <div className="flex items-center gap-1 justify-end">
                        <div className="w-10 h-1 bg-surface-elevated rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? 'bg-status-success' : pct > 0 ? 'bg-accent' : 'bg-surface-elevated'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-content-muted">{pct}%</span>
                      </div>
                    )}
                    {ech.penaliteMontant > 0 && (
                      <div className="text-[9px] text-status-danger">+{formatMoney(ech.penaliteMontant)} pén.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-edge bg-surface-elevated/40">
              <span className="text-[10px] text-content-muted">
                {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, echeances.length)} sur {echeances.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} className="text-content-secondary" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-6 h-6 rounded text-[10px] font-semibold transition-colors ${
                        page === p ? 'bg-accent text-white' : 'text-content-muted hover:bg-surface-subtle'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} className="text-content-secondary" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
