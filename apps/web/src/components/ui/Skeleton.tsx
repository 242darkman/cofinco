import React from 'react';

/**
 * Skeleton Loading Component for MicroFlex Platform
 * Production-ready loading placeholders with accessibility.
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
      className={`bg-surface/50 border border-edge-subtle rounded-xl p-4 ${className}`}
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
      <div className="mt-4 pt-3 border-t border-edge-subtle">
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
    <tr className="border-b border-edge-subtle">
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
    <div className={`overflow-hidden rounded-xl border border-edge-subtle ${className}`} role="status" aria-label="Chargement du tableau...">
      <table className="w-full">
        <thead className="bg-surface/50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton variant="text" width="70%" height="0.75rem" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface/30">
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
    <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4" role="status">
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
    <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3" role="status">
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
          <div className="mt-2 pt-2 border-t border-edge-subtle flex justify-between">
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
    <div className="bg-surface/40 border border-edge-subtle rounded-lg p-3" role="status">
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

// P2.2: Dashboard skeleton for initial load
export function SkeletonDashboard() {
  return (
    <div className="space-y-6 p-4" role="status" aria-label="Chargement du tableau de bord...">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4">
          <Skeleton variant="text" width="40%" height="1rem" className="mb-4" />
          <Skeleton variant="rounded" width="100%" height={200} />
        </div>
        <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4">
          <Skeleton variant="text" width="35%" height="1rem" className="mb-4" />
          <Skeleton variant="rounded" width="100%" height={200} />
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4">
        <Skeleton variant="text" width="30%" height="1rem" className="mb-4" />
        <SkeletonTable rows={5} columns={5} />
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// P2.2: Client list item skeleton
export function SkeletonClientItem() {
  return (
    <div className="flex items-center gap-4 p-4 bg-surface/30 rounded-lg border border-edge-subtle" role="status">
      <SkeletonAvatar size={48} />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton variant="text" width="50%" height="1rem" />
        <div className="flex items-center gap-3">
          <Skeleton variant="text" width={100} height="0.75rem" />
          <Skeleton variant="rounded" width={60} height={20} />
        </div>
      </div>
      <div className="text-right space-y-1">
        <Skeleton variant="text" width={80} height="1rem" />
        <Skeleton variant="text" width={60} height="0.75rem" />
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// P2.2: Credit list item skeleton
export function SkeletonCreditItem() {
  return (
    <div className="flex items-center gap-4 p-4 bg-surface/30 rounded-lg border border-edge-subtle" role="status">
      <div className="w-12 h-12 flex items-center justify-center">
        <Skeleton variant="circular" width={40} height={40} />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="text" width="40%" height="1rem" />
          <Skeleton variant="rounded" width={70} height={20} />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton variant="text" width={80} height="0.75rem" />
          <Skeleton variant="text" width={100} height="0.75rem" />
        </div>
      </div>
      <div className="text-right space-y-1">
        <Skeleton variant="text" width={100} height="1.25rem" />
        <Skeleton variant="text" width={80} height="0.75rem" />
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// P2.2: Stats grid skeleton (for dashboard and analytics)
export function SkeletonStatsGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="status" aria-label="Chargement des statistiques...">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// P2.2: Form skeleton
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Chargement du formulaire...">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width="30%" height="0.75rem" />
          <Skeleton variant="rounded" width="100%" height={40} />
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-4">
        <Skeleton variant="rounded" width={80} height={36} />
        <Skeleton variant="rounded" width={100} height={36} />
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// Ligne d'historique de transaction : pastille ronde, 2 lignes, montant à droite.
export function SkeletonTransactionRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3" role="status">
      <SkeletonAvatar size={44} />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton variant="text" width="50%" height="0.875rem" />
        <Skeleton variant="text" width="33%" height="0.75rem" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton variant="text" width={64} height="0.875rem" />
        <Skeleton variant="text" width={40} height="0.75rem" />
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// Liste de transactions (premier chargement d'un historique).
export function SkeletonTransactionList({ rows = 7 }: { rows?: number }) {
  return (
    <div className="divide-y divide-edge-subtle" role="status" aria-label="Chargement des transactions...">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTransactionRow key={i} />
      ))}
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

// Carte bancaire au format CB (ratio ISO 85.6×54 ≈ 1.586) : puce, numéro, porteur.
export function SkeletonBankCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl ${className}`}
      style={{ aspectRatio: '1.586' }}
      role="status"
      aria-label="Chargement de la carte..."
    >
      <Skeleton variant="rounded" width="100%" height="100%" className="absolute inset-0 !rounded-2xl" />
      <div className="absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex items-start justify-between">
          <Skeleton variant="rounded" width={44} height={32} />
          <Skeleton variant="rounded" width={56} height={20} />
        </div>
        <Skeleton variant="text" width="66%" height="1rem" />
        <div className="flex items-end justify-between">
          <Skeleton variant="text" width="40%" height="0.75rem" />
          <Skeleton variant="rounded" width={40} height={24} />
        </div>
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

export default Skeleton;
