import React from 'react';

/**
 * Skeleton Loading Component for COFIN Platform
 * Production-ready loading placeholders with accessibility
 */

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
  animation = 'pulse',
}: SkeletonProps) {
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 bg-[length:200%_100%]',
    none: '',
  };

  const style: React.CSSProperties = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : undefined),
  };

  return (
    <div
      className={`
        bg-slate-700/50
        ${variantStyles[variant]}
        ${animationStyles[animation]}
        ${className}
      `}
      style={style}
      role="presentation"
      aria-hidden="true"
    />
  );
}

// Preset skeleton components
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Chargement...">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
          height="0.875rem"
        />
      ))}
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <Skeleton variant="circular" width={size} height={size} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 ${className}`}
      role="status"
      aria-label="Chargement de la carte..."
    >
      <div className="flex items-start gap-3">
        <SkeletonAvatar size={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" height="1rem" />
          <Skeleton variant="text" width="40%" height="0.75rem" />
        </div>
        <Skeleton variant="rounded" width={60} height={24} />
      </div>
      <div className="mt-4 pt-3 border-t border-slate-700/50">
        <div className="flex justify-between items-center">
          <Skeleton variant="text" width="30%" height="0.75rem" />
          <Skeleton variant="text" width="25%" height="0.875rem" />
        </div>
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-700/50">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton variant="text" width={i === 0 ? '80%' : '60%'} height="1rem" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 5,
  className = '',
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-700/50 ${className}`} role="status" aria-label="Chargement du tableau...">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton variant="text" width="70%" height="0.75rem" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-slate-800/30">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4" role="status">
      <div className="flex items-center justify-between mb-2">
        <Skeleton variant="text" width="40%" height="0.75rem" />
        <Skeleton variant="circular" width={32} height={32} />
      </div>
      <Skeleton variant="text" width="70%" height="1.5rem" className="mb-1" />
      <Skeleton variant="text" width="50%" height="0.625rem" />
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export function SkeletonList({
  items = 5,
  className = '',
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Chargement de la liste...">
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// Member card skeleton for tontine
export function SkeletonMemberCard() {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3" role="status">
      <div className="flex items-start gap-3">
        <Skeleton variant="rounded" width={40} height={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1">
              <Skeleton variant="text" width="60%" height="0.875rem" />
              <div className="flex items-center gap-2">
                <Skeleton variant="rounded" width={50} height={16} />
                <Skeleton variant="text" width={60} height="0.625rem" />
              </div>
            </div>
            <Skeleton variant="circular" width={24} height={24} />
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700/50 flex justify-between">
            <Skeleton variant="text" width="30%" height="0.75rem" />
            <Skeleton variant="text" width="25%" height="0.875rem" />
          </div>
        </div>
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// Contribution card skeleton
export function SkeletonContributionCard() {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3" role="status">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton variant="text" width="50%" height="0.875rem" />
            <Skeleton variant="rounded" width={60} height={18} />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton variant="text" width={80} height="0.75rem" />
            <Skeleton variant="text" width={70} height="0.75rem" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton variant="rounded" width={60} height={18} />
            <Skeleton variant="text" width={80} height="0.625rem" />
          </div>
        </div>
        <div className="text-right shrink-0">
          <Skeleton variant="text" width={100} height="1rem" />
        </div>
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export default Skeleton;
