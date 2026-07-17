import React, { useEffect, useRef, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * TopProgressBar — barre de progression « Glow Up » de navigation (web).
 *
 * Fine ligne (3px) fixée en haut du viewport. Elle démarre dès qu'une activité
 * asynchrone globale commence (requêtes/mutations react-query, ou prop `active`
 * pour les transitions de route), progresse jusqu'à ~90 % en ralentissant
 * (effet « trickle » façon néobanque), puis termine à 100 % et s'estompe une
 * fois l'activité finie.
 *
 * Performance : la largeur est animée via `transform: scaleX` (origine gauche)
 * et l'opacité — deux propriétés composées par le GPU → 60 FPS, coût CPU nul.
 * La lueur premium vient d'un `box-shadow` sur la couleur d'accent tenant.
 *
 * Placement : monter une seule fois, en haut de l'arbre (juste sous la barre
 * système / le haut du layout), à l'intérieur du `QueryClientProvider`.
 */

export interface TopProgressBarProps {
  /**
   * Force l'état actif (ex. transition de route). Si omis, la barre se pilote
   * automatiquement sur l'activité react-query globale.
   */
  readonly active?: boolean;
  /** Hauteur en px (défaut : 3). */
  readonly height?: number;
}

export function TopProgressBar({ active: activeProp, height = 3 }: TopProgressBarProps) {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = activeProp ?? fetching + mutating > 0;

  // `scale` = fraction de largeur (0 → 1) appliquée en scaleX.
  const [scale, setScale] = useState(0);
  const [opacity, setOpacity] = useState(0);
  const [fast, setFast] = useState(false); // transition rapide en fin de course
  const wasActive = useRef(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    let resetTimer: ReturnType<typeof setTimeout>;

    if (active) {
      // Démarrage : montée douce jusqu'à ~90 % qui ralentit (trickle).
      wasActive.current = true;
      setFast(false);
      setOpacity(1);
      setScale(0.9);
    } else if (wasActive.current) {
      // Fin : course jusqu'à 100 %, puis fondu et remise à zéro.
      wasActive.current = false;
      setFast(true);
      setScale(1);
      hideTimer = setTimeout(() => {
        setOpacity(0);
        resetTimer = setTimeout(() => {
          setScale(0);
          setFast(false);
        }, 320);
      }, 220);
    }

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(resetTimer);
    };
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] overflow-hidden"
      style={{ height }}
    >
      <div
        className="h-full w-full origin-left rounded-r-full"
        style={{
          transform: `scaleX(${scale})`,
          opacity,
          background: 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))',
          boxShadow:
            '0 0 10px var(--accent-primary), 0 0 4px var(--accent-primary), 0 1px 2px rgba(0,0,0,0.15)',
          transition: `transform ${fast ? '200ms cubic-bezier(0.4,0,0.2,1)' : '8000ms cubic-bezier(0,0.7,0.3,1)'}, opacity 300ms ease-out`,
          willChange: 'transform, opacity',
        }}
      />
    </div>
  );
}

export default TopProgressBar;
