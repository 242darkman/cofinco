/**
 * Module Cartes de Pointage — page principale (dashboard des cartes).
 *
 * Orchestration uniquement : l'état serveur vit dans TanStack Query
 * (`use-cartes-pointage`), les règles de calcul dans `@shared/utils/carte-pointage`
 * et les appels réseau dans `cartePointageApi`. États représentés : chargement,
 * erreur, vide, succès et absence de permission (AGENTS.md §7).
 */

import React, { useMemo, useState } from 'react';
import { LayoutGrid, Plus, ShieldAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { useCan } from '@/contexts/AbilityContext';
import { Actions, Subjects } from '@shared/ability';
import type { CartePointageDto } from '@/lib/api-client';
import { useCartesPointage } from '@/hooks/use-cartes-pointage';
import CartePointageCard from './CartePointageCard';
import CreateCarteModal from './CreateCarteModal';
import DepositModal from './DepositModal';
import WithdrawModal from './WithdrawModal';
import CartePrintModal from './CartePrintModal';
import CarteDetailModal from './CarteDetailModal';

type FiltreStatut = 'ACTIVE' | 'WITHDRAWN' | 'TOUTES';

const FILTRES: Array<{ value: FiltreStatut; label: string }> = [
  { value: 'ACTIVE', label: 'Actives' },
  { value: 'WITHDRAWN', label: 'Clôturées' },
  { value: 'TOUTES', label: 'Toutes' },
];

export interface CartesPointageProps {
  /** Restreint la vue aux cartes d'un client (onglet de la fiche client). */
  clientId?: string;
  /** Masque le titre du module (rendu imbriqué dans la fiche client). */
  embedded?: boolean;
}

export const CartesPointage: React.FC<CartesPointageProps> = ({ clientId, embedded = false }) => {
  const canView = useCan(Actions.VIEW, Subjects.CARTE_POINTAGE);
  const canCreate = useCan(Actions.CREATE, Subjects.CARTE_POINTAGE);
  const canDeposit = useCan(Actions.DEPOSIT, Subjects.CARTE_POINTAGE);
  const canWithdraw = useCan(Actions.WITHDRAW, Subjects.CARTE_POINTAGE);

  const [filtre, setFiltre] = useState<FiltreStatut>('ACTIVE');
  const [createOpen, setCreateOpen] = useState(false);
  const [carteDepot, setCarteDepot] = useState<CartePointageDto | null>(null);
  const [carteRetrait, setCarteRetrait] = useState<CartePointageDto | null>(null);
  const [carteImpression, setCarteImpression] = useState<CartePointageDto | null>(null);
  const [carteDetail, setCarteDetail] = useState<CartePointageDto | null>(null);

  const query = useMemo(
    () => ({ clientId, status: filtre === 'TOUTES' ? undefined : filtre }),
    [clientId, filtre],
  );
  const { data: cartes, isLoading, isError, error, refetch } = useCartesPointage(query);

  // Absence de permission : état explicite plutôt qu'un écran vide.
  if (!canView) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Accès non autorisé"
        description="Vous n'avez pas la permission de consulter les cartes de pointage."
      />
    );
  }

  return (
    <div className={embedded ? '' : 'p-4 sm:p-6'}>
      {/* En-tête du module */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {!embedded && (
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-accent" />
            <div>
              <h1 className="text-xl font-bold text-content-primary">Cartes de Pointage</h1>
              <p className="text-sm text-content-muted">Épargne libre par cases — 31 slots par carte</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-edge p-0.5" role="tablist" aria-label="Filtrer par statut">
            {FILTRES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filtre === value}
                onClick={() => setFiltre(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filtre === value
                    ? 'bg-accent text-content-inverted shadow-sm'
                    : 'text-content-secondary hover:bg-surface-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {canCreate && (
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>
              Nouvelle carte
            </Button>
          )}
        </div>
      </div>

      {/* Corps : chargement / erreur / vide / grille */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={ShieldAlert}
          title="Erreur de chargement"
          description={error instanceof Error ? error.message : 'Impossible de charger les cartes.'}
          action={{ label: 'Réessayer', onClick: () => refetch() }}
        />
      ) : !cartes || cartes.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Aucune carte de pointage"
          description={
            filtre === 'WITHDRAWN'
              ? 'Aucune carte clôturée pour le moment.'
              : 'Ouvrez une première carte pour démarrer l\'épargne par cases.'
          }
          action={
            canCreate && filtre !== 'WITHDRAWN'
              ? { label: 'Nouvelle carte', onClick: () => setCreateOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cartes.map((carte) => (
            <CartePointageCard
              key={carte.id}
              carte={carte}
              canDeposit={canDeposit}
              canWithdraw={canWithdraw}
              onDeposit={setCarteDepot}
              onWithdraw={setCarteRetrait}
              onPrint={setCarteImpression}
              onDetail={setCarteDetail}
            />
          ))}
        </div>
      )}

      {/* Modales d'action */}
      <CreateCarteModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <DepositModal carte={carteDepot} isOpen={!!carteDepot} onClose={() => setCarteDepot(null)} />
      <WithdrawModal carte={carteRetrait} isOpen={!!carteRetrait} onClose={() => setCarteRetrait(null)} />
      <CartePrintModal carte={carteImpression} isOpen={!!carteImpression} onClose={() => setCarteImpression(null)} />
      <CarteDetailModal carte={carteDetail} isOpen={!!carteDetail} onClose={() => setCarteDetail(null)} />
    </div>
  );
};

export default CartesPointage;
