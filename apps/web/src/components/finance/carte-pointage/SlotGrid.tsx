/**
 * Grille des 31 cases d'une carte de pointage.
 *
 * Cases pointées : état visuel fort (couleur de marque, coche, profondeur).
 * Cases restantes : état d'attente neutre et élégant.
 * `printMode` bascule vers un rendu noir et blanc haute fidélité pour l'impression.
 */

import React from 'react';
import { Check } from 'lucide-react';

export const NOMBRE_CASES = 31;

interface SlotGridProps {
  /** Nombre de cases déjà pointées (0..31). */
  completedSlots: number;
  /** Rendu noir & blanc dense pour l'impression papier. */
  printMode?: boolean;
  /** Taille compacte pour les vignettes du dashboard. */
  compact?: boolean;
}

export const SlotGrid: React.FC<SlotGridProps> = ({ completedSlots, printMode = false, compact = false }) => {
  const slots = Array.from({ length: NOMBRE_CASES }, (_, i) => i + 1);

  if (printMode) {
    // Impression : cases carrées à bordure franche, coche noire, numéro lisible.
    return (
      <div className="grid grid-cols-7 gap-[6px]" aria-hidden="true">
        {slots.map((n) => {
          const done = n <= completedSlots;
          return (
            <div
              key={n}
              className="relative flex h-14 items-center justify-center border-2 border-black"
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            >
              <span className="absolute left-1 top-0.5 text-[9px] font-bold text-black">{n}</span>
              {done && <Check className="h-7 w-7 text-black" strokeWidth={3.5} />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-7 ${compact ? 'gap-1' : 'gap-1.5 sm:gap-2'}`}
      role="img"
      aria-label={`${completedSlots} case(s) pointée(s) sur ${NOMBRE_CASES}`}
    >
      {slots.map((n) => {
        const done = n <= completedSlots;
        const base = compact ? 'h-6 rounded-md text-[8px]' : 'h-9 sm:h-10 rounded-lg text-[10px]';
        return (
          <div
            key={n}
            className={`relative flex items-center justify-center font-semibold transition-all duration-200 ${base} ${
              done
                ? 'bg-gradient-to-br from-accent to-accent/80 text-content-inverted shadow-md ring-1 ring-accent/40 scale-[1.02]'
                : 'border border-dashed border-edge bg-surface-muted/50 text-content-muted'
            }`}
          >
            <span className={`absolute ${compact ? 'left-0.5 top-0' : 'left-1 top-0.5'} opacity-70`}>{n}</span>
            {done && <Check className={compact ? 'h-3 w-3' : 'h-4 w-4 sm:h-5 sm:w-5'} strokeWidth={3} />}
          </div>
        );
      })}
    </div>
  );
};

export default SlotGrid;
