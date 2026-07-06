/**
 * Hook personnalisé pour la navigation dans l'application
 * Gère la synchronisation entre les URLs et les modules
 */

import { useLocation } from 'wouter';
import { useCallback, useMemo } from 'react';
import { getPathForModule, getModuleFromPath } from '../lib/routes-config';

export interface NavigationState {
  currentModule: string;
  currentSubModule?: string;
  currentPath: string;
  params?: Record<string, string>;
}

export function useAppNavigation() {
  const [location, setLocation] = useLocation();

  // Obtenir le module et sous-module actuel à partir de l'URL
  const currentState = useMemo((): NavigationState => {
    // /login est géré par App.tsx, pas par le router interne
    if (location === '/login' || location.startsWith('/login?')) {
      return { currentModule: 'dashboard', currentSubModule: undefined, currentPath: location };
    }

    const moduleConfig = getModuleFromPath(location);

    // URL inconnue → signaler 404 (au lieu de silencieusement afficher dashboard)
    if (!moduleConfig) {
      return { currentModule: '__not_found__', currentSubModule: undefined, currentPath: location };
    }

    return {
      currentModule: moduleConfig.moduleKey,
      currentSubModule: moduleConfig.subModule,
      currentPath: location,
      params: moduleConfig.params,
    };
  }, [location]);

  /**
   * Naviguer vers un module avec sous-module optionnel
   * params permet de remplir les segments dynamiques (ex: { id: 'abc123' })
   */
  const navigateToModule = useCallback((
    moduleKey: string,
    subModule?: string,
    data?: any,
    params?: Record<string, string>
  ) => {
    const path = getPathForModule(moduleKey, subModule, params);

    // Si on a des données à passer, on utilise l'événement custom pour la compatibilité
    if (data) {
      window.dispatchEvent(
        new CustomEvent('module-data-update', {
          detail: { moduleKey, subModule, data },
        })
      );
    }

    setLocation(path);
  }, [setLocation]);

  /**
   * Naviguer vers un chemin spécifique
   */
  const navigateToPath = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  /**
   * Retour en arrière
   */
  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  /**
   * Vérifier si on est sur un module/sous-module spécifique
   */
  const isActive = useCallback((
    moduleKey: string,
    subModule?: string
  ): boolean => {
    if (subModule) {
      return (
        currentState.currentModule === moduleKey &&
        currentState.currentSubModule === subModule
      );
    }
    return currentState.currentModule === moduleKey;
  }, [currentState]);

  return {
    // État actuel
    currentModule: currentState.currentModule,
    currentSubModule: currentState.currentSubModule,
    currentPath: currentState.currentPath,
    params: currentState.params,

    // Méthodes de navigation
    navigateToModule,
    navigateToPath,
    goBack,
    isActive,
  };
}
