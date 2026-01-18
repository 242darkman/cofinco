import React from 'react';
import { Check, Circle, Clock, Gift } from 'lucide-react';

interface TontineTimelineProps {
  tourActuel: number;
  toursPayes: number;
  nombreMembres: number; // Total de tours dans la tontine
  aRecuBenefice?: boolean;
  tourBenefice?: number; // Tour où le membre a reçu son bénéfice
  compact?: boolean; // Mode compact pour les petits écrans
}

/**
 * Timeline verticale visualisant l'état de paiement d'un membre
 * Affiche les tours passés, courant et futurs avec leur statut de paiement
 */
export function TontineTimeline({
  tourActuel,
  toursPayes,
  nombreMembres,
  aRecuBenefice = false,
  tourBenefice,
  compact = false
}: TontineTimelineProps) {
  // Limiter l'affichage pour les grandes tontines en mode compact
  const maxVisibleTours = compact ? 5 : nombreMembres;
  const startTour = compact && tourActuel > 3 ? Math.max(1, tourActuel - 2) : 1;
  const endTour = compact ? Math.min(nombreMembres, startTour + maxVisibleTours - 1) : nombreMembres;

  const tours = Array.from(
    { length: endTour - startTour + 1 },
    (_, i) => startTour + i
  );

  const getTourStatus = (tour: number) => {
    const isPaid = tour <= toursPayes;
    const isCurrent = tour === tourActuel;
    const isPast = tour < tourActuel;
    const isBenefice = aRecuBenefice && tour === tourBenefice;

    return { isPaid, isCurrent, isPast, isBenefice };
  };

  return (
    <div className="relative">
      {/* Indicateur de début tronqué */}
      {compact && startTour > 1 && (
        <div className="flex items-center gap-2 mb-2 text-slate-500 text-[10px]">
          <span>...</span>
          <span>{startTour - 1} tour{startTour > 2 ? 's' : ''} précédent{startTour > 2 ? 's' : ''}</span>
        </div>
      )}

      <div className="space-y-1">
        {tours.map((tour, index) => {
          const { isPaid, isCurrent, isPast, isBenefice } = getTourStatus(tour);
          const isLast = index === tours.length - 1;

          return (
            <div key={tour} className="flex items-stretch gap-3">
              {/* Ligne de connexion verticale + Icône */}
              <div className="flex flex-col items-center">
                {/* Icône du tour */}
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold
                    border-2 transition-all shrink-0
                    ${isBenefice
                      ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/30'
                      : isPaid
                        ? 'bg-green-500 border-green-400 text-white'
                        : isCurrent
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 animate-pulse'
                          : 'bg-slate-800 border-slate-700 text-slate-500'
                    }
                  `}
                  title={
                    isBenefice ? 'Bénéfice reçu' :
                    isPaid ? 'Payé' :
                    isCurrent ? 'Tour en cours' :
                    'À venir'
                  }
                >
                  {isBenefice ? (
                    <Gift size={14} />
                  ) : isPaid ? (
                    <Check size={14} />
                  ) : isCurrent ? (
                    <Clock size={12} />
                  ) : (
                    tour
                  )}
                </div>

                {/* Ligne de connexion vers le tour suivant */}
                {!isLast && (
                  <div
                    className={`
                      w-0.5 flex-1 min-h-[12px]
                      ${isPaid && tour < toursPayes ? 'bg-green-500' : 'bg-slate-700'}
                    `}
                  />
                )}
              </div>

              {/* Contenu du tour */}
              <div
                className={`
                  flex-1 pb-2 min-w-0
                  ${isCurrent ? 'font-medium' : ''}
                `}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`
                      text-xs truncate
                      ${isBenefice
                        ? 'text-amber-400 font-bold'
                        : isPaid
                          ? 'text-green-400'
                          : isCurrent
                            ? 'text-cyan-400 font-bold'
                            : 'text-slate-500'
                      }
                    `}
                  >
                    Tour {tour}
                    {isCurrent && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-cyan-500/20 rounded text-[9px] uppercase tracking-wider">
                        En cours
                      </span>
                    )}
                  </span>

                  <span
                    className={`
                      text-[10px] shrink-0
                      ${isBenefice
                        ? 'text-amber-400'
                        : isPaid
                          ? 'text-green-400/70'
                          : isPast
                            ? 'text-red-400/70'
                            : 'text-slate-600'
                      }
                    `}
                  >
                    {isBenefice
                      ? '🎉 Bénéfice'
                      : isPaid
                        ? '✓ Payé'
                        : isPast
                          ? '⚠ Impayé'
                          : '○ À venir'
                    }
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Indicateur de fin tronquée */}
      {compact && endTour < nombreMembres && (
        <div className="flex items-center gap-2 mt-2 text-slate-500 text-[10px]">
          <span>...</span>
          <span>{nombreMembres - endTour} tour{nombreMembres - endTour > 1 ? 's' : ''} restant{nombreMembres - endTour > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Version horizontale compacte de la timeline (pour les cards)
 */
export function TontineTimelineHorizontal({
  tourActuel,
  toursPayes,
  nombreMembres
}: Omit<TontineTimelineProps, 'compact' | 'aRecuBenefice' | 'tourBenefice'>) {
  // Limiter à 7 tours visibles max
  const maxVisible = 7;
  const startTour = tourActuel > 4 ? Math.max(1, tourActuel - 3) : 1;
  const endTour = Math.min(nombreMembres, startTour + maxVisible - 1);

  const tours = Array.from(
    { length: endTour - startTour + 1 },
    (_, i) => startTour + i
  );

  return (
    <div className="flex items-center gap-0.5 overflow-hidden">
      {startTour > 1 && (
        <span className="text-slate-600 text-[10px] mr-1">...</span>
      )}

      {tours.map((tour) => {
        const isPaid = tour <= toursPayes;
        const isCurrent = tour === tourActuel;

        return (
          <div
            key={tour}
            className={`
              w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold
              transition-all shrink-0
              ${isPaid
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : isCurrent
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 animate-pulse'
                  : 'bg-slate-800/50 text-slate-600 border border-slate-700/50'
              }
            `}
            title={`Tour ${tour}: ${isPaid ? 'Payé' : isCurrent ? 'En cours' : 'À venir'}`}
          >
            {isPaid ? <Check size={10} /> : tour}
          </div>
        );
      })}

      {endTour < nombreMembres && (
        <span className="text-slate-600 text-[10px] ml-1">...</span>
      )}
    </div>
  );
}

export default TontineTimeline;
