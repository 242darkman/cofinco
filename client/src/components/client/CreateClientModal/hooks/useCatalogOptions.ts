import { useState, useEffect, useCallback, useRef } from 'react';

export interface CatalogOption {
  id: string;
  code: string;
  nom: string;
}

export interface SectorOption extends CatalogOption {
  parentId: string | null;
  parentNom: string | null;
}

export interface CatalogFilters {
  professionId?: string;
  sectorId?: string;
  activityTypeId?: string;
}

export interface CatalogOptionsResult {
  professions: CatalogOption[];
  sectors: SectorOption[];
  activityTypes: CatalogOption[];
  loading: boolean;
  fetchFiltered: (filters: CatalogFilters) => Promise<void>;
}

export function useCatalogOptions(isOpen: boolean): CatalogOptionsResult {
  const [professions, setProfessions] = useState<CatalogOption[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [activityTypes, setActivityTypes] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, { professions: CatalogOption[]; sectors: SectorOption[]; activityTypes: CatalogOption[] }>>(new Map());

  // Load all options when modal opens
  useEffect(() => {
    if (!isOpen) {
      cacheRef.current.clear();
      return;
    }
    fetchFiltered({});
  }, [isOpen]);

  const fetchFiltered = useCallback(async (filters: CatalogFilters) => {
    const cacheKey = JSON.stringify(filters);
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setProfessions(cached.professions);
      setSectors(cached.sectors);
      setActivityTypes(cached.activityTypes);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.professionId) params.set('profession_id', filters.professionId);
      if (filters.sectorId) params.set('sector_id', filters.sectorId);
      if (filters.activityTypeId) params.set('activity_type_id', filters.activityTypeId);

      const url = `/api/catalog/options${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch catalog options');

      const data = await res.json();
      const result = {
        professions: data.professions || [],
        sectors: data.sectors || [],
        activityTypes: data.activityTypes || [],
      };

      cacheRef.current.set(cacheKey, result);
      setProfessions(result.professions);
      setSectors(result.sectors);
      setActivityTypes(result.activityTypes);
    } catch (err) {
      console.error('Error fetching catalog options', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { professions, sectors, activityTypes, loading, fetchFiltered };
}
