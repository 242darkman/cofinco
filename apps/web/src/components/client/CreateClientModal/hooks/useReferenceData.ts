import { useState, useEffect, useCallback, useRef } from 'react';
import { agenceApi, employeApi, villeApi, paysApi, localityApi } from '../../../../lib/api-client';
import { StatutAgence } from '@shared/enum/status-constants';
import { SystemRole } from '@shared/types/roles';
import type { ReferenceDataResult, LocalityItem } from '../types';

export function useReferenceData(isOpen: boolean, isAdmin: boolean): ReferenceDataResult {
  const [paysList, setPaysList] = useState<ReferenceDataResult['paysList']>([]);
  const [villesList, setVillesList] = useState<ReferenceDataResult['villesList']>([]);
  const [villesLoading, setVillesLoading] = useState(false);
  const [localitiesList, setLocalitiesList] = useState<LocalityItem[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(false);
  const [agences, setAgences] = useState<ReferenceDataResult['agences']>([]);
  const [agentsReferents, setAgentsReferents] = useState<ReferenceDataResult['agentsReferents']>([]);
  const [loading, setLoading] = useState(false);
  const villesCacheRef = useRef<Record<string, ReferenceDataResult['villesList']>>({});
  const localitiesCacheRef = useRef<Record<string, LocalityItem[]>>({});

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const paysData = await paysApi.getAll({ actif: true });

        if (cancelled) return;
        setPaysList(paysData || []);

        // Agences (admin only)
        if (isAdmin) {
          const agencesData = await agenceApi.getAll({ statut: StatutAgence.ACTIVE });
          if (!cancelled) setAgences(agencesData || []);
        }

        // Agents référents
        const allEmployees = await employeApi.getAll();
        if (!cancelled) {
          const agents = (allEmployees || []).filter((emp: any) => {
            const role = emp.roleSystem || emp.user?.role;
            return role === 'terrain' || role === 'chef_agence' ||
                   role === SystemRole.AGENT_TERRAIN || role === SystemRole.CHEF_AGENCE;
          }).map((emp: any) => ({
            id: emp.id,
            nom: emp.user?.nom || emp.nom || '',
            prenom: emp.user?.prenom || emp.prenom || '',
          }));
          setAgentsReferents(agents);
        }
      } catch (err) {
        console.error('Error loading reference data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen, isAdmin]);

  // Fetch cities on-demand by paysId (with simple cache)
  const fetchCitiesByPays = useCallback(async (paysId: string) => {
    if (!paysId) {
      setVillesList([]);
      return;
    }
    // Return cached results if available
    if (villesCacheRef.current[paysId]) {
      setVillesList(villesCacheRef.current[paysId]);
      return;
    }
    setVillesLoading(true);
    try {
      const data = await villeApi.getAll({ paysId, actif: true, limit: 200 });
      const cities = (data || []).map((v: any) => ({ id: v.id, nom: v.nom, paysId: v.paysId }));
      villesCacheRef.current[paysId] = cities;
      setVillesList(cities);
    } catch (err) {
      console.error('Error loading cities for paysId', paysId, err);
    } finally {
      setVillesLoading(false);
    }
  }, []);

  // Fetch localities (cities + districts merged) on-demand by paysId (with cache)
  const fetchLocalitiesByPays = useCallback(async (paysId: string) => {
    if (!paysId) {
      setLocalitiesList([]);
      return;
    }
    if (localitiesCacheRef.current[paysId]) {
      setLocalitiesList(localitiesCacheRef.current[paysId]);
      return;
    }
    setLocalitiesLoading(true);
    try {
      const data = await localityApi.getAll({ paysId, limit: 500 });
      const items: LocalityItem[] = (data || []).map((loc) => ({
        id: loc.id,
        type: loc.type,
        name: loc.name,
        regionName: loc.regionName,
        population: loc.population,
      }));
      localitiesCacheRef.current[paysId] = items;
      setLocalitiesList(items);
    } catch (err) {
      console.error('Error loading localities for paysId', paysId, err);
    } finally {
      setLocalitiesLoading(false);
    }
  }, []);

  // Clear cache when modal closes
  useEffect(() => {
    if (!isOpen) {
      villesCacheRef.current = {};
      localitiesCacheRef.current = {};
      setVillesList([]);
      setLocalitiesList([]);
    }
  }, [isOpen]);

  return {
    paysList, villesList, fetchCitiesByPays, villesLoading,
    localitiesList, fetchLocalitiesByPays, localitiesLoading,
    agences, agentsReferents, loading,
  };
}
