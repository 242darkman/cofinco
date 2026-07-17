/**
 * Presets Skeleton génériques : texte, avatar, carte, tableau, statistiques,
 * liste, formulaire et tableau de bord.
 */

import { Skeleton } from './Skeleton';

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

// Grille de statistiques (tableau de bord et analytique)
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

// Formulaire
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

// Tableau de bord (premier chargement)
export function SkeletonDashboard() {
  return (
    <div className="space-y-6 p-4" role="status" aria-label="Chargement du tableau de bord...">
      {/* Grille de statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Rangée de graphiques */}
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

      {/* Activité récente */}
      <div className="bg-surface/50 border border-edge-subtle rounded-xl p-4">
        <Skeleton variant="text" width="30%" height="1rem" className="mb-4" />
        <SkeletonTable rows={5} columns={5} />
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}
