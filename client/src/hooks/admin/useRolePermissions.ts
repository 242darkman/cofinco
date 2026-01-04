import { useState } from 'react';

export interface RolePermission {
  id: string;
  role: string;
  permissionId: string;
  granted: boolean;
  permissionName?: string;
  permissionCode?: string;
  moduleName?: string;
  moduleId?: string;
}

export function useRolePermissions(selectedRole: string) {
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRolePermissions = async () => {
    if (!selectedRole) {
      setRolePermissions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/role-permissions?role=${encodeURIComponent(selectedRole)}`);
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des permissions');
      }
      const data = await response.json();
      setRolePermissions(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch role permissions:', err);
      setRolePermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRolePermission = async (permissionCode: string, currentStatus: boolean) => {
    try {
      const existing = rolePermissions.find(rp => rp.permissionCode === permissionCode);

      if (existing) {
        const response = await fetch(`/api/role-permissions/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ granted: !currentStatus })
        });
        if (!response.ok) throw new Error('Erreur modification permission');
      } else {
        // Use permission_code to create a new role permission
        const response = await fetch('/api/role-permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: selectedRole,
            permission_code: permissionCode,
            granted: true
          })
        });
        if (!response.ok) throw new Error('Erreur création permission');
      }

      await fetchRolePermissions();
      return true;
    } catch (err) {
      console.error('Erreur modification permission rôle:', err);
      setError(err instanceof Error ? err.message : 'Erreur modification');
      return false;
    }
  };

  const addPermissionToRole = async (permCode: string) => {
    try {
      const response = await fetch('/api/role-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          permission_code: permCode,
          granted: true
        })
      });
      if (!response.ok) throw new Error('Erreur ajout permission');

      await fetchRolePermissions();
      return true;
    } catch (err) {
      console.error('Erreur ajout permission:', err);
      return false;
    }
  };

  const removePermissionFromRole = async (permCode: string) => {
    try {
      const rolePermToDelete = rolePermissions.find(rp => rp.permissionCode === permCode);
      if (!rolePermToDelete) return true;

      const response = await fetch(`/api/role-permissions/${rolePermToDelete.id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Erreur suppression permission');

      await fetchRolePermissions();
      return true;
    } catch (err) {
      console.error('Erreur suppression permission:', err);
      return false;
    }
  };

  const roleHasPermission = (permCode: string): boolean => {
    return rolePermissions.some(rp =>
      rp.permissionCode === permCode && rp.granted
    );
  };

  return {
    rolePermissions,
    loading,
    error,
    fetchRolePermissions,
    toggleRolePermission,
    addPermissionToRole,
    removePermissionFromRole,
    roleHasPermission
  };
}
