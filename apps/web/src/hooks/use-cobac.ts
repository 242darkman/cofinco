/**
 * COBAC Hooks — ratios prudentiels et seuils réglementaires (TanStack Query).
 *
 * Les ratios sont calculés par agence côté comptabilité (cron mensuel ou
 * déclenchement manuel). L'API résout l'agence de l'utilisateur non admin ;
 * un admin doit fournir l'agence explicitement.
 */
import { useQuery } from '@tanstack/react-query';
import type { CobacRatiosApi, CobacSeuilApi } from '@/components/kpi/kpi-cobac-utils';

const COBAC_STALE_TIME = 5 * 60 * 1000; // 5 min — recalcul mensuel côté serveur

export class CobacAccessError extends Error {
  constructor() {
    super('ACCESS_DENIED');
    this.name = 'CobacAccessError';
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 403) throw new CobacAccessError();
  if (!res.ok) throw new Error('Erreur chargement ratios COBAC');
  return res.json();
}

/**
 * Derniers ratios prudentiels d'une agence.
 * `enabled` seulement si une agence est résoluble (paramètre explicite pour
 * les admins, implicite côté serveur pour les autres).
 */
export function useCobacRatios(agencyId: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery<CobacRatiosApi | null>({
    queryKey: ['cobac', 'current', agencyId ?? 'self'],
    queryFn: () => {
      const params = agencyId ? `?agenceId=${encodeURIComponent(agencyId)}` : '';
      return fetchJson<CobacRatiosApi | null>(`/api/comptabilite/cobac/current${params}`);
    },
    staleTime: COBAC_STALE_TIME,
    enabled: options.enabled ?? true,
    retry: (failureCount, error) => !(error instanceof CobacAccessError) && failureCount < 2,
  });
}

/** Seuils réglementaires actifs (communs à toutes les agences). */
export function useCobacSeuils(options: { enabled?: boolean } = {}) {
  return useQuery<CobacSeuilApi[]>({
    queryKey: ['cobac', 'seuils'],
    queryFn: () => fetchJson<CobacSeuilApi[]>('/api/comptabilite/cobac/seuils'),
    staleTime: COBAC_STALE_TIME,
    enabled: options.enabled ?? true,
    retry: (failureCount, error) => !(error instanceof CobacAccessError) && failureCount < 2,
  });
}
