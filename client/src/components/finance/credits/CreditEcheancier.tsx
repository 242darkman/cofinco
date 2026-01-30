import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, CheckCircle, Clock, AlertTriangle, DollarSign, Filter } from 'lucide-react';
import { creditApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import { escapeHtml } from '../../../lib/sanitize';
import { SkeletonCard } from '../../ui/Skeleton';
import { StatutCredit, StatutEcheanceCredit, STATUT_ECHEANCE_CREDIT_LABELS } from '@shared/enum/status-constants';

interface Echeance {
  id: string;
  credit_id: string;
  numero_echeance: number;
  date_echeance: string;
  montant_principal: number;
  montant_interet: number;
  montant_total: number;
  statut: string;
  date_paiement: string | null;
  montant_paye: number;
  jours_retard: number;
  penalite: number;
  credits: {
    numero_credit: string;
    clients: {
      nom: string;
    };
  };
}

type FilterType = 'all' | 'upcoming' | 'overdue' | 'paid';
type DateFilterType = 'week' | 'month' | 'all';

export default function CreditEcheancier() {
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('upcoming');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('month');

  // Charger les échéances via api-client
  const loadEcheances = useCallback(async () => {
    setLoading(true);

    try {
      const credits = await creditApi.getAll({ statut: StatutCredit.ACTIVE, includeEcheances: true });

      let allEcheances: Echeance[] = [];

      for (const credit of credits) {
        if (credit.echeances) {
          for (const ech of credit.echeances) {
            allEcheances.push({
              ...ech,
              credits: {
                numero_credit: credit.numero_credit,
                clients: {
                  nom: formatClientName(credit.clients?.nom || credit.client_nom || 'Client', credit.clients?.prenom)
                }
              }
            });
          }
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calcul du retard pour chaque échéance
      let processedEcheances = allEcheances.map(ech => {
        const dateEch = new Date(ech.date_echeance);
        dateEch.setHours(0, 0, 0, 0);
        const joursRetard = ech.statut === StatutEcheanceCredit.UPCOMING && dateEch < today
          ? Math.floor((today.getTime() - dateEch.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          ...ech,
          jours_retard: joursRetard,
          statut: joursRetard > 0 ? StatutEcheanceCredit.LATE : ech.statut
        };
      });

      // Application des filtres
      if (filter === 'upcoming') {
        processedEcheances = processedEcheances.filter(e =>
          e.statut === StatutEcheanceCredit.UPCOMING && new Date(e.date_echeance) >= today
        );
      } else if (filter === 'overdue') {
        processedEcheances = processedEcheances.filter(e => e.statut === StatutEcheanceCredit.LATE);
      } else if (filter === 'paid') {
        processedEcheances = processedEcheances.filter(e => e.statut === StatutEcheanceCredit.PAID);
      }

      // Filtre par période
      if (dateFilter === 'week') {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        processedEcheances = processedEcheances.filter(e =>
          new Date(e.date_echeance) <= nextWeek
        );
      } else if (dateFilter === 'month') {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        processedEcheances = processedEcheances.filter(e =>
          new Date(e.date_echeance) <= nextMonth
        );
      }

      // Tri par date
      processedEcheances.sort((a, b) =>
        new Date(a.date_echeance).getTime() - new Date(b.date_echeance).getTime()
      );

      setEcheances(processedEcheances);
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du chargement des échéances');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filter, dateFilter]);

  useEffect(() => {
    loadEcheances();
  }, [loadEcheances]);

  // Badge de statut mémorisé — labels centralisés depuis status-constants
  const getStatutBadge = useCallback((statut: string, joursRetard: number) => {
    if (statut === StatutEcheanceCredit.PAID) {
      return (
        <span
          className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-semibold"
          role="status"
        >
          {STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.PAID]}
        </span>
      );
    }
    if (statut === StatutEcheanceCredit.LATE || joursRetard > 0) {
      return (
        <span
          className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-semibold"
          role="status"
          aria-label={`${STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.LATE]} de ${joursRetard} jours`}
        >
          {STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.LATE]} ({joursRetard}j)
        </span>
      );
    }
    return (
      <span
        className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-semibold"
        role="status"
      >
        {STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.UPCOMING]}
      </span>
    );
  }, []);

  // Calcul des jours restants
  const getDaysUntil = useCallback((date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const echeance = new Date(date);
    echeance.setHours(0, 0, 0, 0);
    const diff = Math.floor((echeance.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return null;
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Demain";
    return `Dans ${diff} jours`;
  }, []);

  // Statistiques mémorisées
  const stats = useMemo(() => ({
    total: echeances.length,
    enAttente: echeances.filter(e => e.statut === StatutEcheanceCredit.UPCOMING).length,
    enRetard: echeances.filter(e => e.statut === StatutEcheanceCredit.LATE || e.jours_retard > 0).length,
    paye: echeances.filter(e => e.statut === StatutEcheanceCredit.PAID).length,
    montantTotal: echeances.reduce((sum, e) => sum + (e.montant_total || 0), 0),
    montantEnAttente: echeances
      .filter(e => e.statut === StatutEcheanceCredit.UPCOMING)
      .reduce((sum, e) => sum + (e.montant_total || 0), 0),
    montantRetard: echeances
      .filter(e => e.statut === StatutEcheanceCredit.LATE || e.jours_retard > 0)
      .reduce((sum, e) => sum + (e.montant_total || 0), 0)
  }), [echeances]);

  // Groupement par mois mémorisé
  const groupedEcheances = useMemo(() => {
    const grouped: Record<string, Echeance[]> = {};

    echeances.forEach(ech => {
      const date = new Date(ech.date_echeance);
      const monthName = date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });

      if (!grouped[monthName]) {
        grouped[monthName] = [];
      }
      grouped[monthName].push(ech);
    });

    return grouped;
  }, [echeances]);

  // Handlers pour les filtres
  const handleFilterChange = useCallback((newFilter: FilterType) => {
    setFilter(newFilter);
  }, []);

  const handleDateFilterChange = useCallback((newDateFilter: DateFilterType) => {
    setDateFilter(newDateFilter);
  }, []);

  // État de chargement avec skeleton
  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Chargement de l'échéancier">
        {/* Stats skeleton */}
        <div className="grid md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} className="h-28 rounded-lg" />
          ))}
        </div>

        {/* Filters skeleton */}
        <div className="flex gap-4">
          <SkeletonCard className="h-10 w-64" />
          <div className="ml-auto flex gap-2">
            <SkeletonCard className="h-10 w-20" />
            <SkeletonCard className="h-10 w-20" />
            <SkeletonCard className="h-10 w-20" />
          </div>
        </div>

        {/* Content skeleton */}
        <SkeletonCard className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cartes de statistiques */}
      <section aria-label="Statistiques des échéances">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border border-blue-500/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-400 text-sm font-semibold">Total Échéances</span>
              <Calendar className="text-blue-400" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-white break-words">{stats.total}</div>
            <div className="text-xs text-blue-300 mt-1">Période sélectionnée</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border border-cyan-500/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-cyan-400 text-sm font-semibold">En Attente</span>
              <Clock className="text-cyan-400" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-white break-words">{stats.enAttente}</div>
            <div className="text-xs text-cyan-300 mt-1">{formatMoney(stats.montantEnAttente)}</div>
          </div>

          <div className="bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-red-400 text-sm font-semibold">En Retard</span>
              <AlertTriangle className="text-red-400" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-white break-words">{stats.enRetard}</div>
            <div className="text-xs text-red-300 mt-1">{formatMoney(stats.montantRetard)}</div>
          </div>

          <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-green-400 text-sm font-semibold">Payé</span>
              <CheckCircle className="text-green-400" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-white break-words">{stats.paye}</div>
            <div className="text-xs text-green-300 mt-1">Complétées</div>
          </div>
        </div>
      </section>

      {/* Filtres */}
      <nav aria-label="Filtres des échéances" className="flex gap-4 items-center flex-wrap">
        <div className="flex gap-2" role="group" aria-label="Filtre par statut">
          {([
            { value: 'all', label: 'Toutes' },
            { value: 'upcoming', label: 'À venir' },
            { value: 'overdue', label: 'En retard' },
            { value: 'paid', label: 'Payées' }
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleFilterChange(value)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                filter === value
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              aria-pressed={filter === value}
              aria-label={`Filtrer par ${label.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2" role="group" aria-label="Filtre par période">
          {([
            { value: 'week', label: '7 jours' },
            { value: 'month', label: '30 jours' },
            { value: 'all', label: 'Tout' }
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleDateFilterChange(value)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                dateFilter === value
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              aria-pressed={dateFilter === value}
              aria-label={`Afficher ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Liste des échéances */}
      {Object.keys(groupedEcheances).length === 0 ? (
        <div
          className="text-center py-12 text-slate-400"
          role="status"
          aria-label="Aucune échéance trouvée"
        >
          Aucune échéance à afficher pour les filtres sélectionnés
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEcheances).map(([month, echs]) => (
            <section
              key={month}
              className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden"
              aria-labelledby={`month-${month.replace(/\s+/g, '-')}`}
            >
              <header className="bg-slate-700/50 px-6 py-3 border-b border-slate-700">
                <h3
                  id={`month-${month.replace(/\s+/g, '-')}`}
                  className="text-lg font-bold text-white capitalize"
                >
                  {escapeHtml(month)}
                </h3>
                <div className="text-sm text-slate-400 mt-1">
                  {echs.length} échéance{echs.length > 1 ? 's' : ''} · {formatMoney(echs.reduce((sum, e) => sum + (e.montant_total || 0), 0))}
                </div>
              </header>

              <ul className="divide-y divide-slate-700">
                {echs.map(echeance => {
                  const daysUntil = getDaysUntil(echeance.date_echeance);
                  const isUrgent = daysUntil && (daysUntil === "Aujourd'hui" || daysUntil === "Demain");

                  return (
                    <li
                      key={echeance.id}
                      className={`p-4 hover:bg-slate-700/30 transition-colors ${isUrgent ? 'bg-cyan-500/5' : ''}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="text-cyan-400 font-mono font-bold">
                              {escapeHtml(echeance.credits.numero_credit)}
                            </span>
                            <span className="text-white font-semibold">
                              {escapeHtml(echeance.credits.clients.nom)}
                            </span>
                            {getStatutBadge(echeance.statut, echeance.jours_retard)}
                            {isUrgent && (
                              <span
                                className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-semibold"
                                role="status"
                              >
                                Urgent
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-6 text-sm text-slate-400 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Calendar size={16} aria-hidden="true" />
                              <time dateTime={echeance.date_echeance}>
                                {new Date(echeance.date_echeance).toLocaleDateString('fr-FR', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </time>
                              {daysUntil && <span className="text-cyan-400">({daysUntil})</span>}
                            </div>

                            <div className="flex items-center gap-2">
                              <DollarSign size={16} aria-hidden="true" />
                              <span>Échéance #{echeance.numero_echeance}</span>
                            </div>

                            {echeance.penalite > 0 && (
                              <div className="flex items-center gap-2 text-red-400">
                                <AlertTriangle size={16} aria-hidden="true" />
                                <span>Pénalité: {formatMoney(echeance.penalite)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-2xl font-bold text-white">
                            {formatMoney(echeance.montant_total)}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Principal: {formatMoney(echeance.montant_principal)} ·
                            Intérêt: {formatMoney(echeance.montant_interet)}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
