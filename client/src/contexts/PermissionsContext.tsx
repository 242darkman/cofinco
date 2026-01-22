import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import { useWebSocketContext } from './WebSocketContext';
import { authService } from '@/lib/auth';
import { StatutUser } from '@shared/enum/status-constants';

interface PermissionsContextType {
  permissionsVersion: number;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissionsVersion, setPermissionsVersion] = useState(0);

  const { isConnected } = useWebSocketContext();

  const refreshPermissions = async () => {
    await authService.refreshPermissions();
    setPermissionsVersion(prev => prev + 1);
  };

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
          // Redirect with reason parameter for login page feedback
          window.location.href = '/auth/login?reason=suspended';
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

  useEffect(() => {
    const handleRBACUpdate = async (data: any) => {
      // Check if update is relevant for us (global update, or specific to our role/user)
      // data is a CustomEvent, so we need detail
      const eventWithDetail = data as CustomEvent;
      const payload = eventWithDetail.detail;

      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      let shouldRefresh = false;
      let showPermissionToast = false;

      // 🛡️ Kill Switch: Handle user status changes (suspension/deactivation)
      if (payload.entity === 'user_status') {
        handleUserStatusChange(payload);
        return; // Don't continue with permission refresh
      }

      if (payload.entity === 'module') {
        // Module updates affect everyone
        shouldRefresh = true;
      } else if (payload.entity === 'role_permission') {
        // Refresh only if it affects my role
        if (currentUser.role === payload.role) {
          shouldRefresh = true;
          showPermissionToast = true;
        }
      } else if (payload.entity === 'user_permission') {
        // Refresh only if it's for me
        if (payload.userId === currentUser.id) {
          shouldRefresh = true;
          showPermissionToast = true;
        }
      } else if (payload.type === 'reseed') {
        // Full RBAC reseed - everyone needs to refresh
        shouldRefresh = true;
        showPermissionToast = true;
      } else {
        // Fallback: refresh on any RBAC event to be safe
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        console.log('🔄 RBAC Update received, refreshing permissions...');
        await refreshPermissions();

        // 🔔 UX Feedback: Notify user that their permissions changed
        if (showPermissionToast) {
          toast.info('Droits mis à jour', {
            description: "Vos permissions ont été modifiées par l'administrateur. L'interface s'est adaptée.",
            duration: 5000,
          });
        }
      }
    };

    window.addEventListener('rbac-update', handleRBACUpdate as EventListener);

    // Initial load
    refreshPermissions();

    return () => {
      window.removeEventListener('rbac-update', handleRBACUpdate as EventListener);
    };
  }, []); // Depend only on mount

  return (
    <PermissionsContext.Provider value={{ permissionsVersion, refreshPermissions }}>
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
