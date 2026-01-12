import { useState } from 'react';

export interface UserPermission {
  module_name: string;
  permission_name: string;
  permission_code: string;
  granted: boolean;
  source: string; // 'role' ou 'custom'
}

export function useUserPermissions(selectedUserId?: string) {
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [customOverrides, setCustomOverrides] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserPermissions = async (userId: string) => {
    if (!userId) {
      setUserPermissions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/user-permissions/${userId}`);
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des permissions');
      }
      const data = await response.json();
      // Deduplicate permissions based on permission_code
      const uniqueData = (data || []).reduce((acc: UserPermission[], current: UserPermission) => {
        const x = acc.find(item => item.permission_code === current.permission_code);
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setUserPermissions(uniqueData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch user permissions:', err);
      setUserPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserPermission = async (userId: string, permissionId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/user-permissions/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permission_id: permissionId,
          granted: !currentStatus
        })
      });

      if (!response.ok) throw new Error('Erreur modification permission');

      await fetchUserPermissions(userId);
      return true;
    } catch (err) {
      console.error('Erreur modification permission utilisateur:', err);
      setError(err instanceof Error ? err.message : 'Erreur modification');
      return false;
    }
  };

  const activateAllPermissions = async (userId: string, allPermissions: any[]) => {
    try {
      const promises = allPermissions.map(perm =>
        fetch(`/api/user-permissions/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permission_id: perm.id,
            granted: true
          })
        })
      );

      await Promise.all(promises);
      await fetchUserPermissions(userId);
      return true;
    } catch (err) {
      console.error('Erreur activation toutes permissions:', err);
      return false;
    }
  };

  const blockAllPermissions = async (userId: string, allPermissions: any[]) => {
    try {
      const promises = allPermissions.map(perm =>
        fetch(`/api/user-permissions/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permission_id: perm.id,
            granted: false
          })
        })
      );

      await Promise.all(promises);
      await fetchUserPermissions(userId);
      return true;
    } catch (err) {
      console.error('Erreur blocage toutes permissions:', err);
      return false;
    }
  };

  const resetPermissions = async (userId: string) => {
    try {
      const response = await fetch(`/api/user-permissions/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Erreur réinitialisation permissions');

      await fetchUserPermissions(userId);
      return true;
    } catch (err) {
      console.error('Erreur réinitialisation permissions:', err);
      return false;
    }
  };

  const getUserPermissionStatus = (permCode: string): { granted: boolean; source: string } => {
    const perm = userPermissions.find(p => p.permission_code === permCode);
    if (!perm) {
      return { granted: false, source: 'none' };
    }
    return { granted: perm.granted, source: perm.source };
  };

  const countActivePermissions = (): number => {
    return userPermissions.filter(p => p.granted).length;
  };

  const getAvailablePermissionsToAdd = (allPermissions: any[]): any[] => {
    return (allPermissions || []).filter(p => {
      const status = getUserPermissionStatus(p.code);
      return !status.granted;
    });
  };

  const getAvailablePermissionsToRemove = (allPermissions: any[]): any[] => {
    return (allPermissions || []).filter(p => {
      const status = getUserPermissionStatus(p.code);
      return status.granted;
    });
  };

  return {
    userPermissions,
    customOverrides,
    loading,
    error,
    fetchUserPermissions,
    toggleUserPermission,
    activateAllPermissions,
    blockAllPermissions,
    resetPermissions,
    getUserPermissionStatus,
    countActivePermissions,
    getAvailablePermissionsToAdd,
    getAvailablePermissionsToRemove
  };
}
