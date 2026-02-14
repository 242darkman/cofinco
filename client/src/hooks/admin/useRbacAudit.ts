/**
 * RBAC Audit Hook
 * ===============
 *
 * Provides:
 * - Fetch RBAC audit history
 * - Permission explanation ("Why does this user have this permission?")
 * - Effective permissions with source
 * - Critical permission check
 */

import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

export type RbacAuditAction =
  | 'TOGGLE'
  | 'BULK_UPDATE'
  | 'RESET'
  | 'GRANT_TEMPORARY'
  | 'REVOKE_TEMPORARY'
  | 'EXPIRE_TEMPORARY';

export type PermissionScope = 'GLOBAL' | 'AGENCE';

export type PermissionSource = 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE' | 'NONE';

export interface RbacAuditEntry {
  id: string;
  createdAt: string;
  actorUserId: string;
  actorName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  targetRole: string | null;
  action: RbacAuditAction;
  permissionCode: string | null;
  oldValue: boolean | null;
  newValue: boolean | null;
  scope: PermissionScope;
  agenceId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface RbacAuditFilters {
  actorUserId?: string;
  targetUserId?: string;
  targetRole?: string;
  action?: RbacAuditAction;
  permissionCode?: string;
  scope?: PermissionScope;
  agenceId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface EffectivePermissionWithSource {
  permissionId: string;
  permissionCode: string;
  permissionName: string;
  granted: boolean;
  source: PermissionSource;
  sourceRole?: string;
  sourceAgenceId?: string | null;
  conditions?: Record<string, unknown>;
}

export interface PermissionExplanation {
  hasPermission: boolean;
  source: PermissionSource;
  explanation: string;
  details: Record<string, unknown>;
}

// ============================================================================
// RBAC AUDIT HISTORY HOOK
// ============================================================================

export function useRbacAuditHistory(initialFilters?: RbacAuditFilters) {
  const [history, setHistory] = useState<RbacAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RbacAuditFilters>(initialFilters || {
    limit: 50,
    offset: 0,
  });

  const fetchHistory = useCallback(async (customFilters?: RbacAuditFilters) => {
    setLoading(true);
    setError(null);

    const currentFilters = customFilters || filters;

    try {
      const params = new URLSearchParams();
      if (currentFilters.actorUserId) params.append('actorUserId', currentFilters.actorUserId);
      if (currentFilters.targetUserId) params.append('targetUserId', currentFilters.targetUserId);
      if (currentFilters.targetRole) params.append('targetRole', currentFilters.targetRole);
      if (currentFilters.action) params.append('action', currentFilters.action);
      if (currentFilters.permissionCode) params.append('permissionCode', currentFilters.permissionCode);
      if (currentFilters.scope) params.append('scope', currentFilters.scope);
      if (currentFilters.agenceId) params.append('agenceId', currentFilters.agenceId);
      if (currentFilters.startDate) params.append('startDate', currentFilters.startDate);
      if (currentFilters.endDate) params.append('endDate', currentFilters.endDate);
      if (currentFilters.limit) params.append('limit', currentFilters.limit.toString());
      if (currentFilters.offset) params.append('offset', currentFilters.offset.toString());

      const response = await fetch(`/api/rbac/audit?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération de l\'historique d\'audit');
      }

      const data = await response.json();
      setHistory(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
      console.error('Fetch RBAC audit history error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback((newFilters: Partial<RbacAuditFilters>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    fetchHistory(updated);
  }, [filters, fetchHistory]);

  const nextPage = useCallback(() => {
    updateFilters({ offset: (filters.offset || 0) + (filters.limit || 50) });
  }, [filters, updateFilters]);

  const prevPage = useCallback(() => {
    updateFilters({ offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) });
  }, [filters, updateFilters]);

  useEffect(() => {
    fetchHistory();
  }, []);

  return {
    history,
    total,
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
// USER RBAC AUDIT HISTORY HOOK
// ============================================================================

export function useUserRbacAuditHistory(userId: string, options?: { limit?: number }) {
  const [history, setHistory] = useState<RbacAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (options?.limit) params.append('limit', options.limit.toString());

      const response = await fetch(`/api/rbac/users/${userId}/audit?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération de l\'historique');
      }

      const data = await response.json();
      setHistory(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, options?.limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, total, loading, error, refresh: fetchHistory };
}

// ============================================================================
// EFFECTIVE PERMISSIONS HOOK
// ============================================================================

export function useEffectivePermissions(userId: string, agenceId?: string) {
  const [permissions, setPermissions] = useState<EffectivePermissionWithSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  const fetchPermissions = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (agenceId) params.append('agenceId', agenceId);

      const response = await fetch(`/api/rbac/users/${userId}/permissions/effective?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des permissions');
      }

      const data = await response.json();
      setPermissions(data.permissions || []);
      setVersion(data.version || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, agenceId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Group by source
  const groupedBySource = permissions.reduce((acc, p) => {
    if (!acc[p.source]) acc[p.source] = [];
    acc[p.source].push(p);
    return acc;
  }, {} as Record<PermissionSource, EffectivePermissionWithSource[]>);

  return {
    permissions,
    version,
    loading,
    error,
    refresh: fetchPermissions,
    grantedCount: permissions.filter(p => p.granted).length,
    deniedCount: permissions.filter(p => !p.granted).length,
    groupedBySource,
    fromRole: groupedBySource['ROLE'] || [],
    fromTemporary: groupedBySource['TEMPORARY'] || [],
    fromOverrideGlobal: groupedBySource['OVERRIDE_GLOBAL'] || [],
    fromOverrideAgence: groupedBySource['OVERRIDE_AGENCE'] || [],
  };
}

// ============================================================================
// PERMISSION EXPLANATION HOOK
// ============================================================================

export function usePermissionExplanation(userId: string, permissionCode: string, agenceId?: string) {
  const [explanation, setExplanation] = useState<PermissionExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExplanation = useCallback(async () => {
    if (!userId || !permissionCode) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('permissionCode', permissionCode);
      if (agenceId) params.append('agenceId', agenceId);

      const response = await fetch(`/api/rbac/users/${userId}/permissions/explain?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'explication');
      }

      const data = await response.json();
      setExplanation(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, permissionCode, agenceId]);

  useEffect(() => {
    fetchExplanation();
  }, [fetchExplanation]);

  return { explanation, loading, error, refresh: fetchExplanation };
}

// ============================================================================
// CRITICAL PERMISSION CHECK HOOK
// ============================================================================

export function useCriticalPermissionCheck(permissionCode: string) {
  const [isCritical, setIsCritical] = useState(false);
  const [requiresReason, setRequiresReason] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkCritical = useCallback(async () => {
    if (!permissionCode) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/rbac/permissions/${encodeURIComponent(permissionCode)}/critical`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setIsCritical(data.isCritical);
        setRequiresReason(data.requiresReason);
      }
    } catch (err) {
      console.error('Check critical permission error:', err);
    } finally {
      setLoading(false);
    }
  }, [permissionCode]);

  useEffect(() => {
    checkCritical();
  }, [checkCritical]);

  return { isCritical, requiresReason, loading };
}

// ============================================================================
// TOGGLE PERMISSION WITH REASON HOOK
// ============================================================================

export function useTogglePermissionWithReason() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const togglePermission = useCallback(async (
    userId: string,
    permissionCode: string,
    granted: boolean | null,
    options?: {
      reason?: string;
      scope?: PermissionScope;
      agenceId?: string;
    }
  ) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/rbac/users/${userId}/overrides`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          permissionCode,
          granted,
          reason: options?.reason,
          scope: options?.scope || 'GLOBAL',
          agenceId: options?.agenceId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.requiresReason) {
          throw new Error('Cette permission est critique et nécessite une justification');
        }
        throw new Error(error.message || 'Erreur lors de la modification');
      }

      const result = await response.json();

      toast({
        title: granted === null ? 'Override supprimé' : (granted ? 'Permission accordée' : 'Permission refusée'),
        description: `Permission ${permissionCode} ${granted === null ? 'hérite maintenant du rôle' : (granted ? 'accordée' : 'refusée')}`,
      });

      return result;
    } catch (err: any) {
      toast({
        title: 'Erreur',
        description: err.message,
        variant: 'destructive',
      });
      throw err;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { togglePermission, loading };
}

// ============================================================================
// AUDIT ACTION LABELS
// ============================================================================

export const AUDIT_ACTION_LABELS: Record<RbacAuditAction, string> = {
  TOGGLE: 'Modification',
  BULK_UPDATE: 'Mise à jour en masse',
  RESET: 'Réinitialisation',
  GRANT_TEMPORARY: 'Attribution temporaire',
  REVOKE_TEMPORARY: 'Révocation temporaire',
  EXPIRE_TEMPORARY: 'Expiration temporaire',
};

export const PERMISSION_SOURCE_LABELS: Record<PermissionSource, string> = {
  ROLE: 'Hérité du rôle',
  TEMPORARY: 'Permission temporaire',
  OVERRIDE_GLOBAL: 'Override global',
  OVERRIDE_AGENCE: 'Override agence',
  NONE: 'Non accordé',
};

export const PERMISSION_SOURCE_COLORS: Record<PermissionSource, string> = {
  ROLE: 'bg-status-info-bg text-status-info border-status-info/20',
  TEMPORARY: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  OVERRIDE_GLOBAL: 'bg-accent/10 text-accent border-accent/20',
  OVERRIDE_AGENCE: 'bg-status-info-bg text-status-info border-status-info/20',
  NONE: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20',
};
