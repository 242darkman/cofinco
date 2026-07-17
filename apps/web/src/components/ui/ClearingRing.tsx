import React from 'react';

/**
 * ClearingRing — loader financier premium « double anneau » (web).
 *
 * Un anneau de fond fixe (canal sécurisé établi) + un segment actif en rotation
 * (vérification / calcul de registres). Rendu par masque radial (pas de SVG) et
 * `transform` seul en rotation → 60 FPS, coût CPU minimal. Les couleurs suivent
 * l'accent tenant (`--accent-primary`) et le ton demandé.
 */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerTone = 'accent' | 'onAccent' | 'current';

const DIMENSIONS: Record<SpinnerSize, { box: number; ring: number }> = {
  xs: { box: 16, ring: 2 },
  sm: { box: 24, ring: 2.5 },
  md: { box: 32, ring: 3 },
  lg: { box: 40, ring: 3.5 },
  xl: { box: 48, ring: 4 },
};

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  readonly tone?: SpinnerTone;
  readonly className?: string;
  readonly label?: string;
}

export function ClearingRing({
  size = 'md',
  tone = 'accent',
  className = '',
  label = 'Vérification sécurisée en cours',
}: SpinnerProps) {
  const { box, ring } = DIMENSIONS[size];

  // Masque radial : évide le centre pour ne garder qu'un anneau net.
  const maskHole = `radial-gradient(farthest-side, transparent calc(100% - ${ring}px), #000 calc(100% - ${ring}px))`;

  const ringColors: Record<SpinnerTone, { bg: string; active: string; glow?: string }> = {
    accent: {
      // Structures de fond dérivées de l'accent tenant via son triplet RGB
      // (injecté par tenant-theme). Anneau fixe subtil + halo premium.
      bg: 'rgba(var(--accent-primary-rgb), 0.1)',
      active: 'conic-gradient(from 0deg, transparent 30%, var(--accent-primary))',
      glow: 'drop-shadow(0 0 4px rgba(var(--accent-primary-rgb), 0.35))',
    },
    onAccent: {
      bg: 'rgba(255, 255, 255, 0.15)',
      active: 'conic-gradient(from 0deg, transparent 40%, #ffffff)',
      glow: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.3))',
    },
    current: {
      bg: 'rgba(0, 0, 0, 0.05)',
      active: 'conic-gradient(from 0deg, transparent 40%, currentColor)',
      glow: undefined,
    },
  };
  const currentTone = ringColors[tone];

  return (
    <output
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: box, height: box }}
      aria-label={label}
    >
      {/* Anneau de fond fixe — canal sécurisé établi. */}
      <span
        className="absolute inset-0 rounded-full"
        style={{ border: `${ring}px solid ${currentTone.bg}` }}
      />
      {/* Segment actif en rotation — vérification en cours. */}
      <span
        className="absolute inset-0 rounded-full animate-[spin_0.8s_linear_infinite]"
        style={{
          backgroundImage: currentTone.active,
          WebkitMask: maskHole,
          mask: maskHole,
          filter: currentTone.glow,
        }}
      />
    </output>
  );
}

export default ClearingRing;
