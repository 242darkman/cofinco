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
        <div className="flex items-center gap-2 mb-2 text-content-muted text-[10px]">
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
                      ? 'bg-status-warning border-status-warning text-white shadow-lg shadow-status-warning/30'
                      : isPaid
                        ? 'bg-status-success border-status-success text-white'
                        : isCurrent
                          ? 'bg-accent/10 border-accent text-accent animate-pulse'
                          : 'bg-surface border-edge text-content-muted'
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
                      ${isPaid && tour < toursPayes ? 'bg-status-success' : 'bg-surface-elevated'}
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
                        ? 'text-status-warning font-bold'
                        : isPaid
                          ? 'text-status-success'
                          : isCurrent
                            ? 'text-accent font-bold'
                            : 'text-content-muted'
                      }
                    `}
                  >
                    Tour {tour}
                    {isCurrent && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-accent/10 rounded text-[9px] uppercase tracking-wider">
                        En cours
                      </span>
                    )}
                  </span>

                  <span
                    className={`
                      text-[10px] shrink-0
                      ${isBenefice
                        ? 'text-status-warning'
                        : isPaid
                          ? 'text-status-success/70'
                          : isPast
                            ? 'text-status-danger/70'
                            : 'text-content-muted'
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
        <div className="flex items-center gap-2 mt-2 text-content-muted text-[10px]">
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
        <span className="text-content-muted text-[10px] mr-1">...</span>
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
                ? 'bg-status-success-bg text-status-success border border-status-success/30'
                : isCurrent
                  ? 'bg-accent/10 text-accent border border-accent/50 animate-pulse'
                  : 'bg-surface/50 text-content-muted border border-edge-subtle'
              }
            `}
            title={`Tour ${tour}: ${isPaid ? 'Payé' : isCurrent ? 'En cours' : 'À venir'}`}
          >
            {isPaid ? <Check size={10} /> : tour}
          </div>
        );
      })}

      {endTour < nombreMembres && (
        <span className="text-content-muted text-[10px] ml-1">...</span>
      )}
    </div>
  );
}

export default TontineTimeline;
