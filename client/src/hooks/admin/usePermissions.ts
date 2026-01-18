import { useState, useEffect } from 'react';
import { useServerHealth } from '../../contexts/ServerHealthContext';

export interface Permission {
  id: string;
  moduleId: string;
  name: string;
  code: string;
  description: string | null;
  moduleName?: string;
  moduleCategory?: string;
  createdAt?: string;
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isServerReachable } = useServerHealth();

  const fetchPermissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/permissions');
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des permissions');
      }
      const data = await response.json();
      // Deduplicate by code
      const uniqueData = (data || []).reduce((acc: Permission[], current: Permission) => {
        const x = acc.find(item => item.code === current.code);
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setPermissions(uniqueData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionsByModule = (moduleId: string) => {
    return permissions.filter(p => p.moduleId === moduleId);
  };

  const getPermissionByCode = (code: string) => {
    return permissions.find(p => p.code === code);
  };

  const searchPermissions = (term: string) => {
    const lowerTerm = term.toLowerCase();
    return permissions.filter(p =>
      p.name.toLowerCase().includes(lowerTerm) ||
      p.code.toLowerCase().includes(lowerTerm) ||
      p.description?.toLowerCase().includes(lowerTerm)
    );
  };

  useEffect(() => {
    if (!isServerReachable) return;
    fetchPermissions();
  }, [isServerReachable]);

  return {
    permissions,
    loading,
    error,
    fetchPermissions,
    getPermissionsByModule,
    getPermissionByCode,
    searchPermissions
  };
}
