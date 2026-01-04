import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authService } from '../lib/auth';
import { setCurrentAgenceId } from '../lib/api-client';

export interface Agence {
  id: string;
  codeAgence: string;
  nom: string;
  typeAgence: 'Principale' | 'Secondaire' | 'Kiosque';
  ville?: string;
  statut: 'Actif' | 'Suspendu' | 'Fermé';
}

export interface UserAgence {
  id: string;
  agenceId: string;
  isPrimary: boolean;
  role?: string;
  dateAffectation?: string;
  actif: boolean;
  agence: Agence;
}

interface AgenceContextType {
  // État
  agences: UserAgence[];
  selectedAgence: Agence | null;
  loading: boolean;
  error: string | null;

  // Actions
  selectAgence: (agenceId: string) => void;
  refreshAgences: () => Promise<void>;

  // Helpers
  hasMultipleAgences: boolean;
  isAdmin: boolean;
}

const STORAGE_KEY = 'cofin_selected_agence_id';

const AgenceContext = createContext<AgenceContextType | undefined>(undefined);

export function AgenceProvider({ children }: { children: ReactNode }) {
  const [agences, setAgences] = useState<UserAgence[]>([]);
  const [selectedAgence, setSelectedAgence] = useState<Agence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const user = authService.getCurrentUser();
  const isAdmin = user?.role === 'Administrateur';

  // Charger les agences de l'utilisateur
  const fetchUserAgences = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let data: UserAgence[] = [];
      
      if (isAdmin) {
        // Pour les admins, on charge TOUTES les agences du système
        const allAgencesRes = await fetch('/api/agences', { credentials: 'include' });
        if (allAgencesRes.ok) {
          const allAgences: Agence[] = await allAgencesRes.json();
          data = allAgences.map(a => ({
            id: `admin-${a.id}`,
            agenceId: a.id,
            isPrimary: a.typeAgence === 'Principale',
            actif: a.statut === 'Actif',
            agence: a
          }));

          // Ajouter l'option "Toutes les agences" au début pour les admins
          const allOption: UserAgence = {
            id: 'all',
            agenceId: 'all',
            isPrimary: false,
            actif: true,
            agence: {
              id: 'all',
              codeAgence: 'ALL',
              nom: 'Toutes les agences',
              typeAgence: 'Principale',
              statut: 'Actif'
            }
          };
          data = [allOption, ...data];
        }
      }

      // Si pas admin ou si l'appel admin a échoué, on charge les affectations spécifiques
      if (data.length === 0) {
        const response = await fetch('/api/me/agences', { credentials: 'include' });
        if (response.ok) {
          data = (await response.json()) || [];
        }
      }

      setAgences(data);

      // Restaurer l'agence sélectionnée depuis le localStorage
      const savedAgenceId = localStorage.getItem(STORAGE_KEY);
      let agenceToSelect: Agence | null = null;

      if (savedAgenceId) {
        const savedAgence = data.find(ua => ua.agence.id === savedAgenceId);
        if (savedAgence) {
          agenceToSelect = savedAgence.agence;
        } else if (data.length > 0) {
          // L'agence sauvegardée n'existe plus, sélectionner l'agence principale
          const primary = data.find(ua => ua.isPrimary);
          agenceToSelect = primary?.agence || data[0].agence;
        }
      } else if (data.length > 0) {
        // Pas d'agence sauvegardée, sélectionner l'agence principale
        const primary = data.find(ua => ua.isPrimary);
        agenceToSelect = primary?.agence || data[0].agence;
      }

      if (agenceToSelect) {
        setSelectedAgence(agenceToSelect);
        setCurrentAgenceId(agenceToSelect.id);
        localStorage.setItem(STORAGE_KEY, agenceToSelect.id);
      }
    } catch (err) {
      console.error('Erreur chargement agences:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  // Charger les agences au montage et quand l'utilisateur change
  useEffect(() => {
    fetchUserAgences();
  }, [fetchUserAgences]);

  // Sélectionner une agence
  const selectAgence = useCallback((agenceId: string) => {
    const userAgence = agences.find(ua => ua.agence.id === agenceId);
    if (userAgence) {
      setSelectedAgence(userAgence.agence);
      localStorage.setItem(STORAGE_KEY, agenceId);

      // Mettre à jour l'api-client pour injecter X-Agence-Id dans les requêtes
      setCurrentAgenceId(agenceId);

      // Émettre un événement pour que les autres composants puissent réagir
      window.dispatchEvent(new CustomEvent('agence-changed', {
        detail: { agenceId, agence: userAgence.agence }
      }));
    }
  }, [agences]);

  // Rafraîchir les agences
  const refreshAgences = useCallback(async () => {
    await fetchUserAgences();
  }, [fetchUserAgences]);

  const value: AgenceContextType = {
    agences,
    selectedAgence,
    loading,
    error,
    selectAgence,
    refreshAgences,
    hasMultipleAgences: agences.length > 1,
    isAdmin
  };

  return (
    <AgenceContext.Provider value={value}>
      {children}
    </AgenceContext.Provider>
  );
}

export function useAgence() {
  const context = useContext(AgenceContext);
  if (context === undefined) {
    throw new Error('useAgence must be used within an AgenceProvider');
  }
  return context;
}

// Hook pour écouter les changements d'agence
export function useAgenceChange(callback: (agenceId: string, agence: Agence) => void) {
  useEffect(() => {
    const handler = (event: CustomEvent<{ agenceId: string; agence: Agence }>) => {
      callback(event.detail.agenceId, event.detail.agence);
    };

    window.addEventListener('agence-changed', handler as EventListener);
    return () => window.removeEventListener('agence-changed', handler as EventListener);
  }, [callback]);
}
