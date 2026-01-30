/**
 * Hook for managing temporary permissions
 * ========================================
 *
 * Provides:
 * - Fetch temporary permissions for a user or all users
 * - Grant new temporary permission
 * - Revoke temporary permission
 * - Real-time updates via WebSocket
 */

import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface TemporaryPermission {
  id: string;
  userId: string;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  grantedBy: string;
  granterName: string;
  grantedAt: string;
  expiresAt: string;
  reason: string;
  isActive: boolean;
  timeRemaining?: number;
}

export interface GrantTempPermissionParams {
  userId: string;
  permissionId?: string;
  permissionCode?: string;
  expiresAt: string;
  reason: string;
}

export function useTemporaryPermissions(userId?: string) {
  const [permissions, setPermissions] = useState<TemporaryPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch permissions
  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = userId
        ? `/api/rbac/users/${userId}/temp-permissions`
        : '/api/rbac/temp-permissions';

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des permissions temporaires');
      }

      const data = await response.json();
      setPermissions(data.temporaryPermissions || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Fetch temp permissions error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Grant temporary permission
  const grantPermission = useCallback(async (params: GrantTempPermissionParams) => {
    try {
      const response = await fetch('/api/rbac/temp-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erreur lors de l\'attribution');
      }

      const result = await response.json();

      toast({
        title: 'Permission temporaire accordée',
        description: `Permission ${result.permissionCode} accordée jusqu'au ${new Date(result.expiresAt).toLocaleString('fr-FR')}`,
      });

      // Refresh list
      await fetchPermissions();

      return result;
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err.message,
        variant: 'destructive',
      });
      throw err;
    }
  }, [fetchPermissions, toast]);

  // Revoke temporary permission
  const revokePermission = useCallback(async (permissionId: string, revokeReason?: string) => {
    try {
      const response = await fetch(`/api/rbac/temp-permissions/${permissionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ revokeReason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erreur lors de la révocation');
      }

      toast({
        title: 'Permission révoquée',
        description: 'La permission temporaire a été révoquée avec succès',
      });

      // Refresh list
      await fetchPermissions();
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err.message,
        variant: 'destructive',
      });
      throw err;
    }
  }, [fetchPermissions, toast]);

  // Initial fetch
  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Calculate remaining time for each permission
  const permissionsWithTime = permissions.map(p => ({
    ...p,
    timeRemaining: new Date(p.expiresAt).getTime() - Date.now(),
    isExpiringSoon: new Date(p.expiresAt).getTime() - Date.now() < 3600000, // < 1 hour
  }));

  return {
    permissions: permissionsWithTime,
    loading,
    error,
    refresh: fetchPermissions,
    grantPermission,
    revokePermission,
  };
}

// Preset durations for the UI
export const TEMP_PERMISSION_DURATIONS = [
  { label: '1 heure', value: 1 * 60 * 60 * 1000 },
  { label: '4 heures', value: 4 * 60 * 60 * 1000 },
  { label: '8 heures', value: 8 * 60 * 60 * 1000 },
  { label: '24 heures', value: 24 * 60 * 60 * 1000 },
  { label: '1 semaine', value: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Personnalisé', value: -1 },
] as const;

/**
 * Format remaining time for display
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expiré';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}j ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${minutes}min`;
}
