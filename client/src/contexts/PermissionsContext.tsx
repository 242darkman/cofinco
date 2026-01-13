import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useWebSocketContext } from './WebSocketContext';
import { authService } from '@/lib/auth';

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

      if (payload.entity === 'module') {
        // Module updates affect everyone
        shouldRefresh = true;
      } else if (payload.entity === 'role_permission') {
        // Refresh only if it affects my role
        shouldRefresh = true; 
      } else if (payload.entity === 'user_permission') {
        // Refresh only if it's for me
        if (payload.userId === currentUser.id) {
          shouldRefresh = true;
        }
      } else {
        // Fallback: refresh on any RBAC event to be safe
        shouldRefresh = true;
      }

      if (shouldRefresh) {
        console.log('🔄 RBAC Update received, refreshing permissions...');
        await refreshPermissions();
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
