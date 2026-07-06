import { useState, useCallback } from 'react';

export interface ModuleData {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  isActive: boolean;
  orderIndex: number;
  createdAt: string;
}

export interface PermissionData {
  id: string;
  moduleId: string;
  name: string;
  code: string;
  description: string | null;
  createdAt: string;
}

export function useModulePermissionCrud() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createModule = useCallback(async (data: {
    name: string;
    description?: string;
    icon?: string;
    category: string;
    isActive?: boolean;
    orderIndex?: number;
  }): Promise<ModuleData> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rbac/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Erreur lors de la création du module');
      }
      return await response.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateModule = useCallback(async (id: string, data: Partial<{
    name: string;
    description: string | null;
    icon: string;
    category: string;
    isActive: boolean;
    orderIndex: number;
  }>): Promise<ModuleData> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rbac/modules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Erreur lors de la mise à jour du module');
      }
      return await response.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteModule = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rbac/modules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok && response.status !== 204) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).message || 'Erreur lors de la suppression du module');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPermission = useCallback(async (data: {
    moduleId: string;
    name: string;
    code: string;
    description?: string;
  }): Promise<PermissionData> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rbac/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Erreur lors de la création de la permission');
      }
      return await response.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePermission = useCallback(async (id: string, data: Partial<{
    name: string;
    code: string;
    description: string | null;
  }>): Promise<PermissionData> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rbac/permissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Erreur lors de la mise à jour de la permission');
      }
      return await response.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePermission = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rbac/permissions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok && response.status !== 204) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).message || 'Erreur lors de la suppression de la permission');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createModule,
    updateModule,
    deleteModule,
    createPermission,
    updatePermission,
    deletePermission,
  };
}
