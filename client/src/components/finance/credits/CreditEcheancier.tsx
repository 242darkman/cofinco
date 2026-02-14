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
  creditId: string;
  numeroEcheance: number;
  dateEcheance: string;
  montantPrincipal: number;
  montantInteret: number;
  montantTotal: number;
  statut: string;
  datePaiement: string | null;
  montantPaye: number;
  joursRetard: number;
  penalite: number;
  credits: {
    numeroCredit: string;
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
                numeroCredit: credit.numeroCredit,
                clients: {
                  nom: formatClientName(credit.clients?.nom || credit.clientNom || 'Client', credit.clients?.prenom)
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
        const dateEch = new Date(ech.dateEcheance);
        dateEch.setHours(0, 0, 0, 0);
        const joursRetard = ech.statut === StatutEcheanceCredit.UPCOMING && dateEch < today
          ? Math.floor((today.getTime() - dateEch.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          ...ech,
          joursRetard: joursRetard,
          statut: joursRetard > 0 ? StatutEcheanceCredit.LATE : ech.statut
        };
      });

      // Application des filtres
      if (filter === 'upcoming') {
        processedEcheances = processedEcheances.filter(e =>
          e.statut === StatutEcheanceCredit.UPCOMING && new Date(e.dateEcheance) >= today
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
          new Date(e.dateEcheance) <= nextWeek
        );
      } else if (dateFilter === 'month') {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        processedEcheances = processedEcheances.filter(e =>
          new Date(e.dateEcheance) <= nextMonth
        );
      }

      // Tri par date
      processedEcheances.sort((a, b) =>
        new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime()
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
          className="px-2 py-1 bg-status-success-bg text-status-success rounded text-xs font-semibold"
          role="status"
        >
          {STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.PAID]}
        </span>
      );
    }
    if (statut === StatutEcheanceCredit.LATE || joursRetard > 0) {
      return (
        <span
          className="px-2 py-1 bg-status-danger-bg text-status-danger rounded text-xs font-semibold"
          role="status"
          aria-label={`${STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.LATE]} de ${joursRetard} jours`}
        >
          {STATUT_ECHEANCE_CREDIT_LABELS[StatutEcheanceCredit.LATE]} ({joursRetard}j)
        </span>
      );
    }
    return (
      <span
        className="px-2 py-1 bg-accent/10 text-accent rounded text-xs font-semibold"
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
    enRetard: echeances.filter(e => e.statut === StatutEcheanceCredit.LATE || e.joursRetard > 0).length,
    paye: echeances.filter(e => e.statut === StatutEcheanceCredit.PAID).length,
    montantTotal: echeances.reduce((sum, e) => sum + (e.montantTotal || 0), 0),
    montantEnAttente: echeances
      .filter(e => e.statut === StatutEcheanceCredit.UPCOMING)
      .reduce((sum, e) => sum + (e.montantTotal || 0), 0),
    montantRetard: echeances
      .filter(e => e.statut === StatutEcheanceCredit.LATE || e.joursRetard > 0)
      .reduce((sum, e) => sum + (e.montantTotal || 0), 0)
  }), [echeances]);

  // Groupement par mois mémorisé
  const groupedEcheances = useMemo(() => {
    const grouped: Record<string, Echeance[]> = {};

    echeances.forEach(ech => {
      const date = new Date(ech.dateEcheance);
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
          <div className="bg-gradient-to-br from-status-info/20 to-accent/20 border border-status-info/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-status-info text-sm font-semibold">Total Échéances</span>
              <Calendar className="text-status-info" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-content-primary break-words">{stats.total}</div>
            <div className="text-xs text-status-info mt-1">Période sélectionnée</div>
          </div>

          <div className="bg-gradient-to-br from-accent/20 to-accent/20 border border-accent/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-accent text-sm font-semibold">En Attente</span>
              <Clock className="text-accent" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-content-primary break-words">{stats.enAttente}</div>
            <div className="text-xs text-accent mt-1">{formatMoney(stats.montantEnAttente)}</div>
          </div>

          <div className="bg-gradient-to-br from-status-danger/20 to-status-danger/20 border border-status-danger/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-status-danger text-sm font-semibold">En Retard</span>
              <AlertTriangle className="text-status-danger" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-content-primary break-words">{stats.enRetard}</div>
            <div className="text-xs text-status-danger mt-1">{formatMoney(stats.montantRetard)}</div>
          </div>

          <div className="bg-gradient-to-br from-status-success/20 to-status-success/20 border border-status-success/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-status-success text-sm font-semibold">Payé</span>
              <CheckCircle className="text-status-success" size={20} aria-hidden="true" />
            </div>
            <div className="text-2xl font-bold text-content-primary break-words">{stats.paye}</div>
            <div className="text-xs text-status-success mt-1">Complétées</div>
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
                  ? 'bg-accent-secondary text-content-primary'
                  : 'bg-surface-elevated text-content-muted hover:bg-surface-subtle'
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
                  ? 'bg-surface-subtle text-content-primary'
                  : 'bg-surface-elevated text-content-muted hover:bg-surface-subtle'
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
          className="text-center py-12 text-content-muted"
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
              className="bg-surface/50 border border-edge rounded-lg overflow-hidden"
              aria-labelledby={`month-${month.replace(/\s+/g, '-')}`}
            >
              <header className="bg-surface-elevated/50 px-6 py-3 border-b border-edge">
                <h3
                  id={`month-${month.replace(/\s+/g, '-')}`}
                  className="text-lg font-bold text-content-primary capitalize"
                >
                  {escapeHtml(month)}
                </h3>
                <div className="text-sm text-content-muted mt-1">
                  {echs.length} échéance{echs.length > 1 ? 's' : ''} · {formatMoney(echs.reduce((sum, e) => sum + (e.montantTotal || 0), 0))}
                </div>
              </header>

              <ul className="divide-y divide-edge">
                {echs.map(echeance => {
                  const daysUntil = getDaysUntil(echeance.dateEcheance);
                  const isUrgent = daysUntil && (daysUntil === "Aujourd'hui" || daysUntil === "Demain");

                  return (
                    <li
                      key={echeance.id}
                      className={`p-4 hover:bg-surface-elevated/30 transition-colors ${isUrgent ? 'bg-accent/5' : ''}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="text-accent font-mono font-bold">
                              {escapeHtml(echeance.credits.numeroCredit)}
                            </span>
                            <span className="text-content-primary font-semibold">
                              {escapeHtml(echeance.credits.clients.nom)}
                            </span>
                            {getStatutBadge(echeance.statut, echeance.joursRetard)}
                            {isUrgent && (
                              <span
                                className="px-2 py-1 bg-status-success-bg text-status-success rounded text-xs font-semibold"
                                role="status"
                              >
                                Urgent
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-6 text-sm text-content-muted flex-wrap">
                            <div className="flex items-center gap-2">
                              <Calendar size={16} aria-hidden="true" />
                              <time dateTime={echeance.dateEcheance}>
                                {new Date(echeance.dateEcheance).toLocaleDateString('fr-FR', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </time>
                              {daysUntil && <span className="text-accent">({daysUntil})</span>}
                            </div>

                            <div className="flex items-center gap-2">
                              <DollarSign size={16} aria-hidden="true" />
                              <span>Échéance #{echeance.numeroEcheance}</span>
                            </div>

                            {echeance.penalite > 0 && (
                              <div className="flex items-center gap-2 text-status-danger">
                                <AlertTriangle size={16} aria-hidden="true" />
                                <span>Pénalité: {formatMoney(echeance.penalite)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-2xl font-bold text-content-primary">
                            {formatMoney(echeance.montantTotal)}
                          </div>
                          <div className="text-xs text-content-muted mt-1">
                            Principal: {formatMoney(echeance.montantPrincipal)} ·
                            Intérêt: {formatMoney(echeance.montantInteret)}
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
