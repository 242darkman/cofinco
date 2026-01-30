import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { Card, Badge, IconButton, ProgressBar } from '../../ui';
import { toast, handleApiError } from '../../../lib/toast';
import {
  StatutEcheanceTontine,
  StatutEcheanceTontineType,
  STATUT_ECHEANCE_TONTINE_LABELS,
} from '@shared/enum/status-constants';

interface TontineCalendarProps {
  tontineId: string;
  dateDebut: string;
  frequence: string;
  tourActuel: number;
  nombreMembres: number;
}

interface EcheanceItem {
  tour: number;
  date: Date;
  beneficiaire: string | null;
  statut: StatutEcheanceTontineType;
  contributionsRecues: number;
  contributionsAttendues: number;
}

// Map backend turn status to frontend display status
const mapTurnStatus = (backendStatus: string): StatutEcheanceTontineType => {
  switch (backendStatus) {
    case 'PAID_OUT':
    case 'SKIPPED':
      return StatutEcheanceTontine.COMPLETED;
    case 'READY':
    case 'PARTIAL_PAID':
      return StatutEcheanceTontine.IN_PROGRESS;
    case 'SCHEDULED':
    default:
      return StatutEcheanceTontine.UPCOMING;
  }
};

// Helper pour obtenir le label du statut d'échéance
const getStatutEcheanceLabel = (statut: StatutEcheanceTontineType): string => {
  return STATUT_ECHEANCE_TONTINE_LABELS[statut] || statut;
};

export default function TontineCalendar({
  tontineId,
  tourActuel,
  nombreMembres
}: TontineCalendarProps) {
  const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const currentTour = toNumber(tourActuel);
  const totalMembres = toNumber(nombreMembres);
  const [echeances, setEcheances] = useState<EcheanceItem[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const fetchEcheances = useCallback(async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tontines/${tontineId}/echeances`);
      if (!response.ok) throw new Error('Erreur serveur');
      const data: Array<{
        tour: number;
        date: string;
        beneficiaire: string | null;
        statut: string;
        contributions_recues: number;
        contributions_attendues: number;
      }> = await response.json();

      setEcheances(
        data.map((item) => ({
          tour: item.tour,
          date: new Date(item.date),
          beneficiaire: item.beneficiaire,
          statut: mapTurnStatus(item.statut),
          contributionsRecues: item.contributions_recues,
          contributionsAttendues: item.contributions_attendues,
        }))
      );
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement échéances'));
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  useEffect(() => {
    fetchEcheances();
  }, [fetchEcheances]);

  const getEcheancesForMonth = () => {
    return echeances.filter(e => {
      return e.date.getMonth() === currentMonth.getMonth() &&
             e.date.getFullYear() === currentMonth.getFullYear();
    });
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const echeancesMonth = getEcheancesForMonth();
  const prochaines = echeances.filter(e => e.statut === StatutEcheanceTontine.UPCOMING).slice(0, 3);

  const progressGlobal = totalMembres > 0 ? (currentTour / totalMembres) * 100 : 0;

  // Badge variant pour le statut
  const getStatutBadgeVariant = (statut: StatutEcheanceTontineType): 'success' | 'primary' | 'neutral' => {
    switch (statut) {
      case StatutEcheanceTontine.COMPLETED: return 'success';
      case StatutEcheanceTontine.IN_PROGRESS: return 'primary';
      default: return 'neutral';
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Chargement...</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-slate-800/80 border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <div className="p-2 bg-slate-700/50 rounded-lg">
                <Calendar size={18} className="text-cyan-400" />
             </div>
             <div>
                <h3 className="text-sm font-bold text-white leading-tight">Calendrier</h3>
                <p className="text-xs text-slate-500 uppercase font-semibold">Échéances</p>
             </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
            <IconButton icon={ChevronLeft} onClick={prevMonth} size="sm" aria-label="Mois précédent" />
            <span className="text-white text-xs font-bold px-3 min-w-[100px] text-center capitalize">
              {currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </span>
            <IconButton icon={ChevronRight} onClick={nextMonth} size="sm" aria-label="Mois suivant" />
          </div>
        </div>

        {echeancesMonth.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm border-t border-slate-700/50 pt-8">
            Aucune échéance prévue pour ce mois
          </div>
        ) : (
          <div className="space-y-2">
            {echeancesMonth.map((echeance) => {
               const daysDiff = Math.ceil((echeance.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

               return (
                <div key={echeance.tour} className={`
                    group relative flex flex-col gap-2 p-3 rounded-xl border transition-all
                    ${echeance.statut === StatutEcheanceTontine.IN_PROGRESS
                      ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[0_0_15px_-5px_rgba(6,182,212,0.15)]'
                      : 'bg-slate-700/20 border-slate-700/40 hover:bg-slate-700/30'
                    }
                `}>
                  <div className="flex items-start justify-between">
                     <div className="flex items-center gap-3">
                         <div className={`
                             w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 border
                             ${echeance.statut === StatutEcheanceTontine.COMPLETED ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                               echeance.statut === StatutEcheanceTontine.IN_PROGRESS ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                               'bg-slate-800 border-slate-700 text-slate-400'}
                         `}>
                             <span className="text-[10px] font-bold uppercase">{echeance.date.toLocaleDateString('fr-FR', { month: 'short' }).slice(0, 3)}</span>
                             <span className="text-sm font-bold leading-none">{echeance.date.getDate()}</span>
                         </div>
                         <div>
                             <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">Tour #{echeance.tour}</span>
                                <Badge
                                  variant={getStatutBadgeVariant(echeance.statut)}
                                  value={getStatutEcheanceLabel(echeance.statut)}
                                  className="py-0 px-1.5 text-[9px]"
                                />
                             </div>
                             <div className="text-xs text-slate-400 mt-0.5">
                                 {echeance.beneficiaire ? (
                                     <span className="flex items-center gap-1.5">
                                         <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                         {echeance.beneficiaire}
                                     </span>
                                 ) : 'Bénéficiaire non assigné'}
                             </div>
                         </div>
                     </div>

                     <div className="text-right">
                         <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Progression</div>
                         <div className="text-xs font-bold text-white">
                             {echeance.contributionsRecues}<span className="text-slate-500">/{echeance.contributionsAttendues}</span>
                         </div>
                     </div>
                  </div>

                  {echeance.statut === StatutEcheanceTontine.IN_PROGRESS && (
                     <div className="mt-1">
                        <ProgressBar
                            value={(echeance.contributionsRecues / echeance.contributionsAttendues) * 100}
                            size="sm"
                            color="primary"
                            showValue={false}
                        />
                     </div>
                  )}
                </div>
               );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 bg-slate-800/50 border-slate-700/50">
             <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock size={14} /> Prochaines échéances
             </h4>
             <div className="space-y-2">
                {prochaines.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-500">Aucune échéance à venir</div>
                ) : (
                    prochaines.map(e => {
                        const diffTime = e.date.getTime() - Date.now();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        let timeText = '';
                        let timeColor = 'text-slate-500';

                        if (diffDays < 0) {
                            timeText = `Retard de ${Math.abs(diffDays)}j`;
                            timeColor = 'text-red-400';
                        } else if (diffDays === 0) {
                            timeText = "Aujourd'hui";
                            timeColor = 'text-amber-400';
                        } else {
                            timeText = `Dans ${diffDays}j`;
                            timeColor = 'text-emerald-400';
                        }

                        return (
                        <div key={e.tour} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/30 transition-colors cursor-default border border-transparent hover:border-slate-700/50">
                             <div className="flex items-center gap-2">
                                <div className="text-xs font-bold text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">#{e.tour}</div>
                                <div className="text-xs text-slate-300">{e.beneficiaire || 'Non assigné'}</div>
                             </div>
                             <div className="text-right">
                                <div className="text-xs font-medium text-white">{e.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                                <div className={`text-[10px] ${timeColor}`}>
                                   {timeText}
                                </div>
                             </div>
                        </div>
                    )})
                )}
             </div>
          </Card>

          <Card className="p-4 bg-slate-800/50 border-slate-700/50">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CheckCircle size={14} /> Progression Globale
              </h4>
              <div className="flex flex-col items-center justify-center py-2">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                       <svg className="w-full h-full transform -rotate-90">
                          <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                          <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * progressGlobal) / 100} className="text-cyan-500 transition-all duration-1000 ease-out" />
                       </svg>
                       <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-white">{progressGlobal.toFixed(0)}%</span>
                       </div>
                  </div>
                  <div className="mt-2 text-center">
                     <div className="text-xs text-slate-400">Tour actuel</div>
                     <div className="text-sm font-bold text-white">#{currentTour} <span className="text-slate-500 font-normal">/ {totalMembres}</span></div>
                  </div>
              </div>
          </Card>
      </div>
    </div>
  );
}
