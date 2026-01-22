import { useState, useEffect, useCallback } from 'react';
import { ADMIN_ROLES } from '../../constants/admin-constants';

interface RolePermissionEntry {
  role: string;
  permissionCode: string;
  granted: boolean;
}

/**
 * Hook pour charger les permissions de TOUS les rôles en une seule fois
 * Utilisé par la Vue Globale des permissions
 */
export function useAllRolePermissions() {
  const [allRolePermissions, setAllRolePermissions] = useState<RolePermissionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllRolePermissions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Charger les permissions de tous les rôles en parallèle
      const results = await Promise.all(
        ADMIN_ROLES.map(async (role) => {
          const response = await fetch(`/api/role-permissions?role=${encodeURIComponent(role)}`);
          if (!response.ok) {
            console.warn(`Failed to fetch permissions for role ${role}`);
            return [];
          }
          const data = await response.json();
          return (data || []).map((rp: any) => ({
            role,
            permissionCode: rp.permissionCode,
            granted: rp.granted
          }));
        })
      );

      // Fusionner tous les résultats
      const merged = results.flat();
      setAllRolePermissions(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch all role permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger au montage
  useEffect(() => {
    fetchAllRolePermissions();
  }, [fetchAllRolePermissions]);

  /**
   * Vérifie si un rôle spécifique a une permission donnée
   */
  const roleHasPermission = useCallback((role: string, permCode: string): boolean => {
    return allRolePermissions.some(
      rp => rp.role === role && rp.permissionCode === permCode && rp.granted
    );
  }, [allRolePermissions]);

  /**
   * Compte le nombre de rôles qui ont une permission donnée
   */
  const countRolesWithPermission = useCallback((permCode: string): number => {
    return ADMIN_ROLES.filter(role => roleHasPermission(role, permCode)).length;
  }, [roleHasPermission]);

  /**
   * Retourne la liste des rôles qui ont une permission donnée
   */
  const getRolesWithPermission = useCallback((permCode: string): string[] => {
    return ADMIN_ROLES.filter(role => roleHasPermission(role, permCode));
  }, [roleHasPermission]);

  return {
    allRolePermissions,
    loading,
    error,
    fetchAllRolePermissions,
    roleHasPermission,
    countRolesWithPermission,
    getRolesWithPermission
  };
}
