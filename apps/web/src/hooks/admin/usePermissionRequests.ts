import { useState, useCallback, useEffect } from 'react';

export interface PermissionRequestData {
  id: string;
  requesterId: string;
  requesterNom?: string;
  requesterPrenom?: string;
  permissionId: string;
  permissionCode: string;
  permissionName?: string;
  requestType: 'GRANT' | 'DENY' | 'TEMPORARY';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  expiresAt: string | null;
  reviewerId: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/**
 * Hook for admins — manage all permission requests
 */
export function usePermissionRequests() {
  const [requests, setRequests] = useState<PermissionRequestData[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const response = await fetch(
        `/api/rbac/permission-requests${params.toString() ? `?${params}` : ''}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Erreur lors de la récupération des demandes');
      const data = await response.json();
      setRequests(data.data || []);
      setPendingCount(data.pendingCount || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (id: string, reviewReason?: string) => {
    const response = await fetch(`/api/rbac/permission-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ decision: 'APPROVED', reviewReason }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de l\'approbation');
    }
    const updated = await response.json();
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
    setPendingCount(prev => Math.max(0, prev - 1));
    return updated;
  }, []);

  const reject = useCallback(async (id: string, reviewReason: string) => {
    const response = await fetch(`/api/rbac/permission-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ decision: 'REJECTED', reviewReason }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors du rejet');
    }
    const updated = await response.json();
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
    setPendingCount(prev => Math.max(0, prev - 1));
    return updated;
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return {
    requests,
    pendingCount,
    loading,
    error,
    fetchRequests,
    approve,
    reject,
  };
}

/**
 * Hook for regular users — my own requests
 */
export function useMyPermissionRequests() {
  const [requests, setRequests] = useState<PermissionRequestData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rbac/permission-requests/my', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erreur lors de la récupération des demandes');
      const data = await response.json();
      setRequests(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRequest = useCallback(async (data: {
    permissionId: string;
    permissionCode: string;
    requestType: 'GRANT' | 'DENY' | 'TEMPORARY';
    reason: string;
    expiresAt?: string;
  }) => {
    const response = await fetch('/api/rbac/permission-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la création de la demande');
    }
    const created = await response.json();
    setRequests(prev => [created, ...prev]);
    return created;
  }, []);

  const cancelRequest = useCallback(async (id: string) => {
    const response = await fetch(`/api/rbac/permission-requests/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok && response.status !== 204) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).message || 'Erreur lors de l\'annulation');
    }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'CANCELLED' as const } : r));
  }, []);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  return {
    requests,
    loading,
    error,
    fetchMyRequests,
    createRequest,
    cancelRequest,
  };
}
