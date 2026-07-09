import { useCallback, useEffect, useRef, useState } from 'react';
import { referenceCityApi, type ReferenceCityOption } from '@/lib/api-client';

const DEBOUNCE_MS = 300;
const MIN_SEARCH_LEN = 2;
const RESULT_LIMIT = 30;

/**
 * Recherche serveur débouncée des villes de référence (lieu de naissance),
 * filtrée par pays. Charge le top des villes (par population) à la sélection du
 * pays, puis affine par préfixe au fil de la frappe. Résilient réseau : requêtes
 * concurrentes ignorées si obsolètes, échec silencieux → liste vide.
 */
export function useBirthCitySearch(paysId: string | null | undefined) {
  const [cities, setCities] = useState<ReferenceCityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  const runSearch = useCallback(
    async (search?: string) => {
      if (!paysId) {
        setCities([]);
        return;
      }
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const rows = await referenceCityApi.search({ paysId, search, limit: RESULT_LIMIT });
        if (reqId === reqIdRef.current) setCities(rows);
      } catch {
        if (reqId === reqIdRef.current) setCities([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [paysId],
  );

  // (Re)charge le top des villes quand le pays change ; annule tout debounce en cours.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (paysId) runSearch();
    else setCities([]);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paysId, runSearch]);

  const onSearch = useCallback(
    (query: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const q = query.trim();
      timerRef.current = setTimeout(() => {
        runSearch(q.length >= MIN_SEARCH_LEN ? q : undefined);
      }, DEBOUNCE_MS);
    },
    [runSearch],
  );

  return { cities, loading, onSearch };
}
