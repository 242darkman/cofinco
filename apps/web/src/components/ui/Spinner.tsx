import React from 'react';

/**
 * Spinner — source unique du loader de l'application.
 *
 * Rendu premium : un anneau à dégradé conique (effet « comète ») dérivé du
 * branding tenant (`--accent-primary` → `--accent-secondary`) avec un halo
 * subtil. Un seul composant pour tous les chargements en ligne : toute
 * évolution du look se fait ici, une fois, et s'adapte automatiquement à la
 * marque de chaque client.
 *
 * Pour un chargement de section (centré + libellé) : `LoadingSpinner`.
 * Pour un chargement plein écran de marque : `LoadingScreen`.
 */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Ton du spinner :
 * - `accent`   : couleurs de marque (défaut) — sur fonds neutres ;
 * - `onAccent` : blanc — à l'intérieur d'un bouton/fond plein accent ;
 * - `current`  : hérite de `currentColor` — pour s'aligner sur le texte.
 */
export type SpinnerTone = 'accent' | 'onAccent' | 'current';

/** Dimensions (px) et épaisseur d'anneau par taille. */
const DIMENSIONS: Record<SpinnerSize, { box: number; ring: number }> = {
  xs: { box: 16, ring: 2 },
  sm: { box: 24, ring: 3 },
  md: { box: 32, ring: 3 },
  lg: { box: 40, ring: 4 },
  xl: { box: 48, ring: 5 },
};

interface ToneStyle {
  gradient: string;
  glow?: string;
}

function toneStyle(tone: SpinnerTone): ToneStyle {
  switch (tone) {
    case 'onAccent':
      return {
        gradient: 'conic-gradient(from 90deg, transparent, rgba(255,255,255,0.55), #ffffff)',
      };
    case 'current':
      return {
        gradient: 'conic-gradient(from 90deg, transparent, currentColor)',
      };
    default:
      // Deux tons de marque : dégradé transparent → secondaire → primaire (tête).
      return {
        gradient:
          'conic-gradient(from 90deg, transparent, var(--accent-secondary), var(--accent-primary))',
        glow: 'var(--login-accent-glow)',
      };
  }
}

export interface SpinnerProps {
  /** Taille prédéfinie (défaut : md). */
  readonly size?: SpinnerSize;
  /** Ton de couleur (défaut : accent). */
  readonly tone?: SpinnerTone;
  /** Classes utilitaires additionnelles (marges, centrage…). */
  readonly className?: string;
  /** Libellé accessible (défaut : « Chargement »). */
  readonly label?: string;
}

/**
 * Anneau conique rotatif : dégradé de marque masqué en anneau, halo léger.
 * Le trou central est découpé par un masque radial (repli propre sans SVG).
 */
export function Spinner({ size = 'md', tone = 'accent', className = '', label = 'Chargement' }: SpinnerProps) {
  const { box, ring } = DIMENSIONS[size];
  const { gradient, glow } = toneStyle(tone);
  const hole = `radial-gradient(farthest-side, transparent calc(100% - ${ring}px), #000 calc(100% - ${ring}px))`;

  return (
    <output
      aria-label={label}
      className={`inline-block shrink-0 animate-spin ${className}`}
      style={{
        width: box,
        height: box,
        borderRadius: '50%',
        backgroundImage: gradient,
        WebkitMask: hole,
        mask: hole,
        filter: glow ? `drop-shadow(0 0 3px ${glow})` : undefined,
      }}
    />
  );
}

export default Spinner;
