/**
 * Presets Skeleton métier : tontines (membre, cotisation), clients, crédits,
 * transactions et carte bancaire.
 */

import { Skeleton } from './Skeleton';
import { SkeletonAvatar } from './generic-presets';

// Carte membre (tontine)
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

// Carte cotisation
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

// Élément de liste client
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

// Élément de liste crédit
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
