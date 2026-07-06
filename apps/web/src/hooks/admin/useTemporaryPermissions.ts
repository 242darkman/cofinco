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
        description: 'La permission temporaire a été révoquée',
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

// ============================================================================
// HISTORY TYPES & HOOK
// ============================================================================

export interface TempPermissionHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  moduleName: string | null;
  grantedBy: string;
  granterName: string;
  grantedAt: string;
  expiresAt: string;
  reason: string;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokerName: string | null;
  revokeReason: string | null;
  status: 'active' | 'expired' | 'revoked';
  duration: number;
}

export interface TempPermissionHistoryStats {
  totalGranted: number;
  totalActive: number;
  totalExpired: number;
  totalRevoked: number;
  avgDurationHours: number;
}

export interface TempPermissionHistoryFilters {
  userId?: string;
  permissionCode?: string;
  status?: 'active' | 'expired' | 'revoked' | 'all';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function useTemporaryPermissionsHistory(initialFilters?: TempPermissionHistoryFilters) {
  const [history, setHistory] = useState<TempPermissionHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TempPermissionHistoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TempPermissionHistoryFilters>(initialFilters || {
    status: 'all',
    limit: 50,
    offset: 0,
  });

  const fetchHistory = useCallback(async (customFilters?: TempPermissionHistoryFilters) => {
    setLoading(true);
    setError(null);

    const currentFilters = customFilters || filters;

    try {
      const params = new URLSearchParams();
      if (currentFilters.userId) params.append('userId', currentFilters.userId);
      if (currentFilters.permissionCode) params.append('permissionCode', currentFilters.permissionCode);
      if (currentFilters.status) params.append('status', currentFilters.status);
      if (currentFilters.startDate) params.append('startDate', currentFilters.startDate);
      if (currentFilters.endDate) params.append('endDate', currentFilters.endDate);
      if (currentFilters.limit) params.append('limit', currentFilters.limit.toString());
      if (currentFilters.offset) params.append('offset', currentFilters.offset.toString());

      const response = await fetch(`/api/rbac/temp-permissions/history?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération de l\'historique');
      }

      const data = await response.json();
      setHistory(data.data || []);
      setTotal(data.total || 0);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message);
      console.error('Fetch history error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Update filters and refetch
  const updateFilters = useCallback((newFilters: Partial<TempPermissionHistoryFilters>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    fetchHistory(updated);
  }, [filters, fetchHistory]);

  // Pagination helpers
  const nextPage = useCallback(() => {
    updateFilters({ offset: (filters.offset || 0) + (filters.limit || 50) });
  }, [filters, updateFilters]);

  const prevPage = useCallback(() => {
    updateFilters({ offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) });
  }, [filters, updateFilters]);

  // Initial fetch
  useEffect(() => {
    fetchHistory();
  }, []);

  return {
    history,
    total,
    stats,
    loading,
    error,
    filters,
    updateFilters,
    refresh: fetchHistory,
    nextPage,
    prevPage,
    hasNextPage: (filters.offset || 0) + history.length < total,
    hasPrevPage: (filters.offset || 0) > 0,
    currentPage: Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1,
    totalPages: Math.ceil(total / (filters.limit || 50)),
  };
}

// ============================================================================
// EXPIRING PERMISSIONS HOOK
// ============================================================================

export interface ExpiringPermission {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string;
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  expiresAt: string;
  timeRemaining: number;
}

export function useExpiringPermissions(thresholdHours: number = 24) {
  const [permissions, setPermissions] = useState<ExpiringPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await window.fetch(
        `/api/rbac/temp-permissions/expiring?thresholdHours=${thresholdHours}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération');
      }

      const data = await response.json();
      setPermissions(data.expiringPermissions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [thresholdHours]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { permissions, loading, error, refresh: fetch };
}
