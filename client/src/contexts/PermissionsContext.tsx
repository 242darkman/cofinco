import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { toast } from 'sonner';
import { useWebSocketContext } from './WebSocketContext';
import { authService } from '@/lib/auth';
import { hardRedirectToLogin } from '@/lib/navigation';
import { StatutUser } from '@shared/enum/status-constants';
import type { RbacUpdatePayload } from '@shared/ability';

interface PermissionsContextType {
  permissionsVersion: number;
  rbacServerVersion: number;
  refreshPermissions: () => Promise<void>;
  isRefreshing: boolean;
  lastSyncTime: number;
  syncStatus: 'synced' | 'syncing' | 'stale';
}

// Periodic sync interval (5 minutes as safety net)
const PERIODIC_SYNC_INTERVAL = 5 * 60 * 1000;
// Minimum time between focus-based refreshes (10 seconds debounce)
const FOCUS_DEBOUNCE_MS = 10 * 1000;
// Consider permissions stale after 10 minutes without sync
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissionsVersion, setPermissionsVersion] = useState(0);
  const [rbacServerVersion, setRbacServerVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'stale'>('synced');

  // Refs for debouncing and tracking
  const lastFocusRefreshRef = useRef<number>(0);
  const periodicSyncRef = useRef<NodeJS.Timeout | null>(null);

  const { isConnected } = useWebSocketContext();

  const refreshPermissions = useCallback(async () => {
    if (isRefreshing) return; // Prevent concurrent refreshes
    setIsRefreshing(true);
    setSyncStatus('syncing');
    try {
      const result = await authService.refreshPermissions() as { permissionsVersion?: number } | undefined;
      // Update server version if returned
      if (result?.permissionsVersion) {
        setRbacServerVersion(result.permissionsVersion);
      }
      setPermissionsVersion(prev => prev + 1);
      setLastSyncTime(Date.now());
      setSyncStatus('synced');
    } catch (error) {
      console.error('[RBAC] Failed to refresh permissions:', error);
      // Don't set to stale immediately, just log and keep last known state
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  /**
   * 🛡️ Kill Switch: Force logout if user account is suspended/deactivated
   */
  const handleUserStatusChange = (payload: any) => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return;

    // Check if this status change is for the current user
    if (payload.userId === currentUser.id) {
      const newStatus = payload.status;

      // If status is not ACTIVE, force immediate logout
      if (newStatus !== StatutUser.ACTIVE) {
        console.warn('🚨 SECURITY: Account suspended/deactivated, forcing logout...');

        // Show warning toast before logout
        toast.error('Compte suspendu', {
          description: 'Votre compte a été désactivé par un administrateur. Vous allez être déconnecté.',
          duration: 3000,
        });

        // Force logout after a short delay for toast visibility
        setTimeout(async () => {
          await authService.logout();
          hardRedirectToLogin('Votre compte a été suspendu');
        }, 1500);
      }
    }
  };

  // Refresh permissions when WebSocket reconnects to ensure we didn't miss updates
  useEffect(() => {
    if (isConnected) {
      console.log('🔄 WebSocket Connected/Reconnected, syncing permissions...');
      refreshPermissions();
    }
  }, [isConnected]);

  // ============================================================================
  // SOFT REVALIDATION (Fallback when WebSocket is unreliable)
  // ============================================================================

  // Revalidate on window focus (user returns to tab) - with debouncing
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      // Only refresh if we haven't refreshed recently (debounce)
      if (now - lastFocusRefreshRef.current > FOCUS_DEBOUNCE_MS) {
        console.log('🔄 Window focused, checking for permission updates...');
        lastFocusRefreshRef.current = now;
        refreshPermissions();
      } else {
        console.log('🔄 Window focused, but skipping refresh (debounced)');
      }
    };

    // Revalidate on network reconnect
    const handleOnline = () => {
      console.log('🔄 Network reconnected, syncing permissions...');
      refreshPermissions();
    };

    // Check if permissions are stale
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceSync = Date.now() - lastSyncTime;
        if (timeSinceSync > STALE_THRESHOLD_MS) {
          console.log(`🔄 Permissions stale (${Math.round(timeSinceSync / 1000)}s since last sync), refreshing...`);
          setSyncStatus('stale');
          refreshPermissions();
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
  }, [refreshPermissions, lastSyncTime]);

  // ============================================================================
  // PERIODIC SYNC (Safety net for missed WebSocket events)
  // ============================================================================

  useEffect(() => {
    // Set up periodic sync as a safety net
    periodicSyncRef.current = setInterval(() => {
      console.log('🔄 Periodic permissions sync (safety net)...');
      refreshPermissions();
    }, PERIODIC_SYNC_INTERVAL);

    return () => {
      if (periodicSyncRef.current) {
        clearInterval(periodicSyncRef.current);
      }
    };
  }, [refreshPermissions]);

  useEffect(() => {
    /**
     * Handle new rbac:update events with RbacUpdatePayload format
     * Supports scoped updates: 'user', 'role', 'global'
     */
    const handleRbacUpdate = async (event: CustomEvent<RbacUpdatePayload>) => {
      const payload = event.detail;
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      let shouldRefresh = false;
      let showPermissionToast = false;

      // Check if update is relevant for current user based on scope
      switch (payload.scope) {
        case 'user':
          // Only refresh if this update targets the current user
          if (payload.userId === currentUser.id) {
            shouldRefresh = true;
            showPermissionToast = true;
          }
          break;

        case 'role':
          // Refresh if user has the affected role
          // Note: currentUser.role is the primary role
          const userRoles = (currentUser as any).roles || [currentUser.role];
          if (payload.role && userRoles.includes(payload.role)) {
            shouldRefresh = true;
            showPermissionToast = true;
          }
          break;

        case 'global':
          // Global updates affect everyone
          shouldRefresh = true;
          showPermissionToast = true;
          break;

        default:
          // Unknown scope - refresh to be safe
          shouldRefresh = true;
      }

      // Check if server version is ahead (we missed updates)
      if (payload.version && payload.version > rbacServerVersion) {
        console.log(`[RBAC] Server version ${payload.version} > local ${rbacServerVersion}, syncing...`);
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        console.log('🔄 RBAC Update received:', payload);
        await refreshPermissions();

        // Update server version from payload
        if (payload.version) {
          setRbacServerVersion(payload.version);
        }

        // 🔔 UX Feedback: Notify user that their permissions changed
        if (showPermissionToast && payload.changed) {
          const action = payload.changed.granted ? 'accordée' : 'révoquée';
          toast.info('Droits mis à jour', {
            description: `Permission ${payload.changed.permissionCode} ${action}. L'interface s'est adaptée.`,
            duration: 5000,
          });
        } else if (showPermissionToast) {
          toast.info('Droits mis à jour', {
            description: "Vos permissions ont été modifiées par l'administrateur. L'interface s'est adaptée.",
            duration: 5000,
          });
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

      let shouldRefresh = false;
      let showPermissionToast = false;

      // 🛡️ Kill Switch: Handle user status changes (suspension/deactivation)
      if (payload.entity === 'user_status') {
        handleUserStatusChange(payload);
        return;
      }

      if (payload.entity === 'module') {
        shouldRefresh = true;
      } else if (payload.entity === 'role_permission') {
        const userRoles = (currentUser as any).roles || [currentUser.role];
        if (userRoles.includes(payload.role)) {
          shouldRefresh = true;
          showPermissionToast = true;
        }
      } else if (payload.entity === 'user_permission') {
        if (payload.userId === currentUser.id) {
          shouldRefresh = true;
          showPermissionToast = true;
        }
      } else if (payload.type === 'reseed') {
        shouldRefresh = true;
        showPermissionToast = true;
      } else {
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        console.log('🔄 Legacy RBAC Update received, refreshing permissions...');
        await refreshPermissions();

        if (showPermissionToast) {
          toast.info('Droits mis à jour', {
            description: "Vos permissions ont été modifiées par l'administrateur. L'interface s'est adaptée.",
            duration: 5000,
          });
        }
      }
    };

    // Listen to both new and legacy events
    window.addEventListener('rbac:update', handleRbacUpdate as unknown as EventListener);
    window.addEventListener('rbac-update', handleLegacyRBACUpdate as unknown as EventListener);

    // Initial load
    refreshPermissions();

    return () => {
      window.removeEventListener('rbac:update', handleRbacUpdate as unknown as EventListener);
      window.removeEventListener('rbac-update', handleLegacyRBACUpdate as unknown as EventListener);
    };
  }, [rbacServerVersion]); // Re-attach when server version changes

  return (
    <PermissionsContext.Provider value={{
      permissionsVersion,
      rbacServerVersion,
      refreshPermissions,
      isRefreshing,
      lastSyncTime,
      syncStatus
    }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissionsContext() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissionsContext must be used within a PermissionsProvider');
  }
  return context;
}

/** Optional variant that returns null instead of throwing when outside provider */
export function usePermissionsContextOptional() {
  return useContext(PermissionsContext) ?? null;
}
