/**
 * CASL Ability Context
 * ====================
 *
 * Provides CASL ability to the React component tree.
 * Works alongside the existing PermissionsContext for backwards compatibility.
 *
 * Usage:
 * ------
 *
 * 1. Wrap your app with AbilityProvider (inside PermissionsProvider)
 *
 * 2. Use the useAbility hook in components:
 *    const ability = useAbility();
 *    if (ability.can('create', 'Credit')) { ... }
 *
 * 3. Or use the convenience hooks:
 *    const canCreate = useCan('create', 'Credit');
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { authService } from '@/lib/auth';
import { usePermissionsContext } from './PermissionsContext';
import {
  AppAbility,
  buildAbility,
  createEmptyAbility,
  createAdminAbility,
  Action,
  Subject,
  CaslRule,
} from '@/lib/casl';

/**
 * Context value type
 */
interface AbilityContextType {
  ability: AppAbility;
  isAdmin: boolean;
  roles: string[];
  lockedFeatures: string[];
  agenceIdActive?: string;
  agenceNom?: string;
}

/**
 * Default context value (empty ability)
 */
const defaultValue: AbilityContextType = {
  ability: createEmptyAbility(),
  isAdmin: false,
  roles: [],
  lockedFeatures: [],
};

const AbilityContext = createContext<AbilityContextType>(defaultValue);

/**
 * AbilityProvider - Provides CASL ability to the component tree
 *
 * IMPORTANT: Must be used inside PermissionsProvider to react to permission updates.
 */
export function AbilityProvider({ children }: { children: ReactNode }) {
  const [abilityState, setAbilityState] = useState<AbilityContextType>(defaultValue);

  // Subscribe to permission updates from PermissionsContext
  const { permissionsVersion } = usePermissionsContext();

  // Build ability when permissions change
  useEffect(() => {
    async function loadAbility() {
      try {
        const user = authService.getCurrentUser();
        if (!user) {
          setAbilityState(defaultValue);
          return;
        }

        // Fetch permissions with CASL rules from API
        const response = await fetch('/api/my-permissions', { credentials: 'include' });

        if (!response.ok) {
          console.error('[CASL] Failed to fetch permissions:', response.status);
          setAbilityState(defaultValue);
          return;
        }

        const data = await response.json();

        // Check if response includes CASL rules
        if (data.caslRules && Array.isArray(data.caslRules)) {
          const ability = buildAbility(data.caslRules as CaslRule[]);

          setAbilityState({
            ability,
            isAdmin: data.isAdmin || false,
            roles: data.roles || [data.role],
            lockedFeatures: data.lockedFeatures || [],
            agenceIdActive: data.agenceIdActive,
            agenceNom: data.agenceNom,
          });

          console.log('[CASL] Ability built from API rules:', {
            rulesCount: data.caslRules.length,
            isAdmin: data.isAdmin,
            roles: data.roles,
          });
        } else {
          // Fallback: Admin gets full access, others get empty ability
          // This handles the transition period before all permissions include CASL rules
          const ability = data.isAdmin ? createAdminAbility() : createEmptyAbility();

          setAbilityState({
            ability,
            isAdmin: data.isAdmin || false,
            roles: data.roles || [data.role],
            lockedFeatures: [],
          });

          console.warn('[CASL] No CASL rules in API response, using fallback');
        }
      } catch (error) {
        console.error('[CASL] Error loading ability:', error);
        setAbilityState(defaultValue);
      }
    }

    loadAbility();
  }, [permissionsVersion]); // Rebuild when permissions update

  // Memoize context value
  const contextValue = useMemo(() => abilityState, [abilityState]);

  return (
    <AbilityContext.Provider value={contextValue}>
      {children}
    </AbilityContext.Provider>
  );
}

/**
 * Hook to access the CASL ability
 */
export function useAbility(): AppAbility {
  const context = useContext(AbilityContext);
  if (!context) {
    throw new Error('useAbility must be used within an AbilityProvider');
  }
  return context.ability;
}

/**
 * Hook to access full ability context (includes metadata)
 */
export function useAbilityContext(): AbilityContextType {
  const context = useContext(AbilityContext);
  if (!context) {
    throw new Error('useAbilityContext must be used within an AbilityProvider');
  }
  return context;
}

/**
 * Hook to check a single permission
 *
 * @example
 * const canCreate = useCan('create', 'Credit');
 * if (canCreate) { ... }
 */
export function useCan(action: Action, subject: Subject): boolean {
  const ability = useAbility();
  return ability.can(action, subject);
}

/**
 * Hook to check if user cannot perform an action
 */
export function useCannot(action: Action, subject: Subject): boolean {
  const ability = useAbility();
  return ability.cannot(action, subject);
}

/**
 * Hook to check if any of the permissions are allowed
 */
export function useCanAny(checks: Array<{ action: Action; subject: Subject }>): boolean {
  const ability = useAbility();
  return checks.some(({ action, subject }) => ability.can(action, subject));
}

/**
 * Hook to check if all permissions are allowed
 */
export function useCanAll(checks: Array<{ action: Action; subject: Subject }>): boolean {
  const ability = useAbility();
  return checks.every(({ action, subject }) => ability.can(action, subject));
}

/**
 * Hook to check if a feature is locked for the current agency
 */
export function useIsFeatureLocked(featureKey: string): boolean {
  const { lockedFeatures } = useAbilityContext();
  return lockedFeatures.includes(featureKey.toLowerCase());
}

/**
 * Hook to get all user roles
 */
export function useUserRoles(): string[] {
  const { roles } = useAbilityContext();
  return roles;
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin(): boolean {
  const { isAdmin } = useAbilityContext();
  return isAdmin;
}
