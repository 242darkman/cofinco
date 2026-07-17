import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { SkeletonTransactionList } from '@/components/ui/Skeleton';
import { ClearingRing } from '@/components/ui/ClearingRing';

/**
 * TransactionsPage — exemple d'orchestration du « Contextual Loading ».
 *
 * Trois états de chargement, trois traitements distincts :
 *
 *  1. PREMIER CHARGEMENT (aucune donnée) → Skeleton Screen plein.
 *     `isLoading` (react-query : en cours ET pas encore de donnée en cache).
 *
 *  2. RAFRAÎCHISSEMENT EN TÂCHE DE FOND (re-fetch / mutation) → la liste reste
 *     affichée et interactive, seule la `TopProgressBar` s'active en haut.
 *     Elle est pilotée automatiquement par l'activité globale react-query.
 *
 *  3. ACTION LOCALE (« Télécharger le RIB ») → le bouton passe en chargement et
 *     affiche le `ClearingRing` (size="sm", tone="onAccent").
 *
 * En production, `TopProgressBar` se monte une seule fois dans le layout racine
 * (elle écoute toute l'activité react-query). Elle est incluse ici pour rendre
 * l'exemple autonome.
 */

interface Transaction {
  readonly id: string;
  readonly label: string;
  readonly date: string;
  readonly amountCentimes: number;
  readonly direction: 'in' | 'out';
}

/** Simule un appel réseau (à remplacer par le vrai client API). */
function fetchTransactions(): Promise<Transaction[]> {
  return new Promise((resolve) =>
    setTimeout(
      () =>
        resolve([
          { id: '1', label: 'Dépôt agence Sepela', date: "Aujourd'hui, 09:12", amountCentimes: 4500000, direction: 'in' },
          { id: '2', label: 'Retrait guichet', date: 'Hier, 17:40', amountCentimes: 1200000, direction: 'out' },
          { id: '3', label: 'Virement reçu — MTN MoMo', date: '14 juil., 11:05', amountCentimes: 800000, direction: 'in' },
          { id: '4', label: 'Frais de tenue de compte', date: '01 juil., 08:00', amountCentimes: 50000, direction: 'out' },
        ]),
      1200,
    ),
  );
}

/** Simule la génération/téléchargement du RIB. */
function downloadRib(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1800));
}

function formatMontant(centimes: number): string {
  return `${(centimes / 100).toLocaleString('fr-FR')} FCFA`;
}

export function TransactionsPage() {
  const {
    data: transactions,
    isLoading, // premier chargement : aucune donnée encore
    isFetching, // toute activité, y compris re-fetch en arrière-plan
    refetch,
  } = useQuery({ queryKey: ['transactions'], queryFn: fetchTransactions });

  const ribMutation = useMutation({ mutationFn: downloadRib });

  return (
    <>
      {/* (2) Barre globale : s'active seule sur les re-fetch/mutations. */}
      <TopProgressBar />

      <div className="mx-auto max-w-xl px-4 py-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-content-primary">Historique</h1>
            <p className="text-sm text-content-muted">Vos dernières opérations</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Déclenche un rafraîchissement en tâche de fond (cas 2). */}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-xl border border-edge px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-muted disabled:opacity-50"
            >
              Actualiser
            </button>

            {/* (3) Action locale avec ClearingRing dans le bouton. */}
            <button
              type="button"
              onClick={() => ribMutation.mutate()}
              disabled={ribMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-primary-hover disabled:opacity-60"
            >
              {ribMutation.isPending ? (
                <>
                  <ClearingRing size="sm" tone="onAccent" />
                  Génération…
                </>
              ) : (
                'Télécharger le RIB'
              )}
            </button>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-elevated">
          {isLoading ? (
            /* (1) Premier chargement → Skeleton Screen. */
            <SkeletonTransactionList rows={6} />
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {transactions?.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      tx.direction === 'in'
                        ? 'bg-status-success-bg text-status-success'
                        : 'bg-surface-muted text-content-muted'
                    }`}
                  >
                    {tx.direction === 'in' ? '↓' : '↑'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content-primary">{tx.label}</p>
                    <p className="text-xs text-content-muted">{tx.date}</p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      tx.direction === 'in' ? 'text-status-success' : 'text-content-primary'
                    }`}
                  >
                    {tx.direction === 'in' ? '+' : '−'}
                    {formatMontant(tx.amountCentimes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default TransactionsPage;
