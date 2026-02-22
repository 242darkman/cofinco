/**
 * CASL Ability Context (Unified)
 * ==============================
 *
 * Source unique de vérité pour les permissions côté frontend.
 * Gère à la fois :
 * - La synchronisation en temps réel (WebSocket, polling, focus, kill switch)
 * - La construction et mise à disposition de l'ability CASL
 *
 * Usage:
 * ------
 * 1. Wrap your app with AbilityProvider (inside WebSocketProvider)
 *
 * 2. Use the useAbility hook in components:
 *    const ability = useAbility();
 *    if (ability.can('create', 'Credit')) { ... }
 *
 * 3. Or use the convenience hooks:
 *    const canCreate = useCan('create', 'Credit');
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import { toast } from 'sonner';
import { authService } from '@/lib/auth';
import { useWebSocketContext } from './WebSocketContext';
import { hardRedirectToLogin } from '@/lib/navigation';
import { StatutUser } from '@shared/enum/status-constants';
import type { RbacUpdatePayload } from '@shared/ability';
import {
  AppAbility,
  buildAbility,
  createEmptyAbility,
  createAdminAbility,
  Action,
  Subject,
  CaslRule,
} from '@/lib/casl';

// ============================================================================
// SYNC CONSTANTS
// ============================================================================

// Periodic sync interval (5 minutes as safety net)
const PERIODIC_SYNC_INTERVAL = 5 * 60 * 1000;
// Minimum time between focus-based refreshes (10 seconds debounce)
const FOCUS_DEBOUNCE_MS = 10 * 1000;
// Consider permissions stale after 10 minutes without sync
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface AbilityContextType {
  ability: AppAbility;
  isAdmin: boolean;
  roles: string[];
  lockedFeatures: string[];
  agenceIdActive?: string;
  agenceNom?: string;
  // Sync metadata
  permissionsVersion: number;
  refreshPermissions: () => Promise<void>;
  syncStatus: 'synced' | 'syncing' | 'stale';
}

const defaultAbilityState = {
  ability: createEmptyAbility(),
  isAdmin: false,
  roles: [] as string[],
  lockedFeatures: [] as string[],
};

const defaultValue: AbilityContextType = {
  ...defaultAbilityState,
  permissionsVersion: 0,
  refreshPermissions: async () => {},
  syncStatus: 'synced' as const,
};

const AbilityContext = createContext<AbilityContextType>(defaultValue);

// ============================================================================
// PROVIDER
// ============================================================================

/**
 * AbilityProvider - Unified permissions provider
 *
 * Handles real-time sync (WebSocket, polling, focus) AND CASL ability building.
 * Must be used inside WebSocketProvider.
 */
export function AbilityProvider({ children }: { children: ReactNode }) {
  // Ability state
  const [abilityState, setAbilityState] = useState(defaultAbilityState);

  // Sync state
  const [permissionsVersion, setPermissionsVersion] = useState(0);
  const [rbacServerVersion, setRbacServerVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'stale'>('synced');

  // Refs for debouncing and tracking
  const lastFocusRefreshRef = useRef<number>(0);
  const periodicSyncRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  const { isConnected } = useWebSocketContext();

  // ============================================================================
  // CORE: Load ability from API
  // ============================================================================

  const loadAbility = useCallback(async () => {
    // Use ref to prevent concurrent refreshes (state may be stale in closures)
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setSyncStatus('syncing');

    try {
      const user = authService.getCurrentUser();
      if (!user) {
        setAbilityState(defaultAbilityState);
        return;
      }

      // Fetch permissions with CASL rules from API
      const response = await fetch('/api/my-permissions', { credentials: 'include' });

      if (!response.ok) {
        console.error('[CASL] Failed to fetch permissions:', response.status);
        return;
      }

      const data = await response.json();

      // Update server version if returned
      if (data.permissionsVersion) {
        setRbacServerVersion(data.permissionsVersion);
      }

      // Build ability from CASL rules
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

        if (import.meta.env.DEV) {
          console.log('[CASL] Ability built from API rules:', {
            rulesCount: data.caslRules.length,
            isAdmin: data.isAdmin,
            roles: data.roles,
          });
        }
      } else {
        // Fallback: Admin gets full access, others get empty ability
        const ability = data.isAdmin ? createAdminAbility() : createEmptyAbility();

        setAbilityState({
          ability,
          isAdmin: data.isAdmin || false,
          roles: data.roles || [data.role],
          lockedFeatures: [],
        });

        console.warn('[CASL] No CASL rules in API response, using fallback');
      }

      // Bump version to notify subscribers
      setPermissionsVersion(prev => prev + 1);
      setLastSyncTime(Date.now());
      setSyncStatus('synced');
    } catch (error) {
      console.error('[CASL] Error loading ability:', error);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  // ============================================================================
  // KILL SWITCH: Force logout if user account is suspended/deactivated
  // ============================================================================

  const handleUserStatusChange = useCallback((payload: any) => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return;

    if (payload.userId === currentUser.id) {
      const newStatus = payload.status;

      if (newStatus !== StatutUser.ACTIVE) {
        console.warn('SECURITY: Account suspended/deactivated, forcing logout...');

        toast.error('Compte suspendu', {
          description: 'Votre compte a été désactivé par un administrateur. Vous allez être déconnecté.',
          duration: 3000,
        });

        setTimeout(async () => {
          await authService.logout();
          hardRedirectToLogin('Votre compte a été suspendu');
        }, 1500);
      }
    }
  }, []);

  // ============================================================================
  // WEBSOCKET RECONNECT
  // ============================================================================

  useEffect(() => {
    if (isConnected) {
      if (import.meta.env.DEV) console.log('[CASL] WebSocket Connected/Reconnected, syncing...');
      loadAbility();
    }
  }, [isConnected, loadAbility]);

  // ============================================================================
  // SOFT REVALIDATION (Fallback when WebSocket is unreliable)
  // ============================================================================

  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current > FOCUS_DEBOUNCE_MS) {
        if (import.meta.env.DEV) console.log('[CASL] Window focused, checking for permission updates...');
        lastFocusRefreshRef.current = now;
        loadAbility();
      }
    };

    const handleOnline = () => {
      if (import.meta.env.DEV) console.log('[CASL] Network reconnected, syncing...');
      loadAbility();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceSync = Date.now() - lastSyncTime;
        if (timeSinceSync > STALE_THRESHOLD_MS) {
          if (import.meta.env.DEV) console.log(`[CASL] Permissions stale (${Math.round(timeSinceSync / 1000)}s since last sync), refreshing...`);
          setSyncStatus('stale');
          loadAbility();
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadAbility, lastSyncTime]);

  // ============================================================================
  // PERIODIC SYNC (Safety net for missed WebSocket events)
  // ============================================================================

  useEffect(() => {
    periodicSyncRef.current = setInterval(() => {
      if (import.meta.env.DEV) console.log('[CASL] Periodic permissions sync (safety net)...');
      loadAbility();
    }, PERIODIC_SYNC_INTERVAL);

    return () => {
      if (periodicSyncRef.current) {
        clearInterval(periodicSyncRef.current);
      }
    };
  }, [loadAbility]);

  // ============================================================================
  // RBAC WEBSOCKET EVENTS
  // ============================================================================

  useEffect(() => {
    /**
     * Handle new rbac:update events with RbacUpdatePayload format
     */
    const handleRbacUpdate = async (event: CustomEvent<RbacUpdatePayload>) => {
      const payload = event.detail;
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      let shouldRefresh = false;

      switch (payload.scope) {
        case 'user':
          if (payload.userId === currentUser.id) {
            shouldRefresh = true;
          }
          break;
        case 'role': {
          const userRoles = (currentUser as any).roles || [currentUser.role];
          if (payload.role && userRoles.includes(payload.role)) {
            shouldRefresh = true;
          }
          break;
        }
        case 'global':
          shouldRefresh = true;
          break;
        default:
          shouldRefresh = true;
      }

      if (payload.version && payload.version > rbacServerVersion) {
        if (import.meta.env.DEV) console.log(`[CASL] Server version ${payload.version} > local ${rbacServerVersion}, syncing...`);
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        if (import.meta.env.DEV) console.log('[CASL] RBAC update received:', payload);
        await loadAbility();
        if (payload.version) {
          setRbacServerVersion(payload.version);
        }
      }
    };

    /**
     * Handle legacy RBAC_UPDATE events for backwards compatibility
     */
    const handleLegacyRBACUpdate = async (event: CustomEvent) => {
      const payload = event.detail;
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      // Kill Switch: Handle user status changes
      if (payload.entity === 'user_status') {
        handleUserStatusChange(payload);
        return;
      }

      let shouldRefresh = false;

      if (payload.entity === 'module') {
        shouldRefresh = true;
      } else if (payload.entity === 'role_permission') {
        const userRoles = (currentUser as any).roles || [currentUser.role];
        if (userRoles.includes(payload.role)) {
          shouldRefresh = true;
        }
      } else if (payload.entity === 'user_permission') {
        if (payload.userId === currentUser.id) {
          shouldRefresh = true;
        }
      } else if (payload.type === 'reseed') {
        shouldRefresh = true;
      } else {
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        if (import.meta.env.DEV) console.log('[CASL] Legacy RBAC update received, refreshing...');
        await loadAbility();
      }
    };

    // Listen to both new and legacy events
    window.addEventListener('rbac:update', handleRbacUpdate as unknown as EventListener);
    window.addEventListener('rbac-update', handleLegacyRBACUpdate as unknown as EventListener);

    // Initial load
    loadAbility();

    return () => {
      window.removeEventListener('rbac:update', handleRbacUpdate as unknown as EventListener);
      window.removeEventListener('rbac-update', handleLegacyRBACUpdate as unknown as EventListener);
    };
  }, [rbacServerVersion, loadAbility, handleUserStatusChange]);

  // Memoize context value
  const contextValue = useMemo<AbilityContextType>(() => ({
    ...abilityState,
    permissionsVersion,
    refreshPermissions: loadAbility,
    syncStatus,
  }), [abilityState, permissionsVersion, loadAbility, syncStatus]);

  return (
    <AbilityContext.Provider value={contextValue}>
      {children}
    </AbilityContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

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
 * Hook to access full ability context (includes metadata + sync info)
 */
export function useAbilityContext(): AbilityContextType {
  const context = useContext(AbilityContext);
  if (!context) {
    throw new Error('useAbilityContext must be used within an AbilityProvider');
  }
  return context;
}

/** Optional variant that returns null instead of throwing when outside provider */
export function useAbilityContextOptional(): AbilityContextType | null {
  return useContext(AbilityContext) ?? null;
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
