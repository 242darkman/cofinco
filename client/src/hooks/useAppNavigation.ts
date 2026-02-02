/**
 * Hook personnalisé pour la navigation dans l'application
 * Gère la synchronisation entre les URLs et les modules
 */

import { useLocation } from 'wouter';
import { useCallback, useMemo } from 'react';
import { getPathForModule, getModuleFromPath } from '../config/routes';

export interface NavigationState {
  currentModule: string;
  currentSubModule?: string;
  currentPath: string;
}

export function useAppNavigation() {
  const [location, setLocation] = useLocation();

  // Obtenir le module et sous-module actuel à partir de l'URL
  const currentState = useMemo((): NavigationState => {
    const moduleConfig = getModuleFromPath(location);

    return {
      currentModule: moduleConfig?.moduleKey || 'dashboard',
      currentSubModule: moduleConfig?.subModule,
      currentPath: location,
    };
  }, [location]);

  /**
   * Naviguer vers un module avec sous-module optionnel
   */
  const navigateToModule = useCallback((
    moduleKey: string,
    subModule?: string,
    data?: any
  ) => {
    const path = getPathForModule(moduleKey, subModule);

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

    // Méthodes de navigation
    navigateToModule,
    navigateToPath,
    goBack,
    isActive,
  };
}
