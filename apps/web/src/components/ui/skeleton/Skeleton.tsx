import React from 'react';

/**
 * Primitive Skeleton de la plateforme MicroFlex.
 * Placeholders de chargement prêts pour la production, avec accessibilité.
 *
 * Le mode `wave` (défaut) applique un véritable effet Shimmer premium : un
 * reflet argenté à cœur doré discret qui balaie le bloc (background-position
 * uniquement → 60 FPS, coût CPU minimal). Piloté par l'utilitaire
 * `.animate-skeleton` et les variables `--skeleton-sheen*` d'`index.css`.
 */

/** Reflet du shimmer : transparent → argent → cœur doré → argent → transparent. */
const SHEEN_GRADIENT =
  'linear-gradient(90deg, transparent 18%, var(--skeleton-sheen) 44%, var(--skeleton-sheen-gold) 50%, var(--skeleton-sheen) 56%, transparent 82%)';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'wave',
}: SkeletonProps) {
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };

  const isWave = animation === 'wave';
  const animationClass = animation === 'pulse' ? 'animate-pulse' : isWave ? 'animate-skeleton' : '';
  const baseBg = isWave ? 'bg-surface-muted' : 'bg-surface-elevated/50';

  const style: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : undefined),
    backgroundImage: isWave ? SHEEN_GRADIENT : undefined,
  };

  return (
    <div
      className={`
        ${baseBg}
        ${variantStyles[variant]}
        ${animationClass}
        ${className}
      `}
      style={style}
      role="presentation"
      aria-hidden="true"
    />
  );
}
