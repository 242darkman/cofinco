import { useState, useEffect } from 'react';

export interface AdminUser {
  id: string;
  username: string;
  nom?: string;
  prenom?: string;
  name?: string;
  email?: string;
  role?: string;
  [key: string]: any;
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des utilisateurs');
      }
      const data = await response.json();
      setUsers(data.map(normalizeUser));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUserDisplayName = (user: any): string => {
    if (!user) {
      return 'Utilisateur';
    }
    const explicitName = typeof user.name === 'string' ? user.name.trim() : '';
    const composedName = [user.prenom, user.nom].filter(Boolean).join(' ').trim();
    return explicitName || composedName || user.username || user.email || 'Utilisateur';
  };

  const normalizeUser = (user: any): AdminUser => {
    const safeUser = user && typeof user === 'object' ? user : {};
    return {
      ...safeUser,
      name: getUserDisplayName(safeUser),
      username: safeUser?.username ?? safeUser?.email ?? '',
      role: safeUser?.role ?? 'Utilisateur'
    };
  };

  const getUserById = (userId: string): AdminUser | undefined => {
    return users.find(u => u.id === userId);
  };

  const getUsersByRole = (role: string): AdminUser[] => {
    return users.filter(u => u.role === role);
  };

  const searchUsers = (term: string): AdminUser[] => {
    const lowerTerm = term.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(lowerTerm) ||
      u.username?.toLowerCase().includes(lowerTerm) ||
      u.email?.toLowerCase().includes(lowerTerm) ||
      u.nom?.toLowerCase().includes(lowerTerm) ||
      u.prenom?.toLowerCase().includes(lowerTerm)
    );
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    loading,
    error,
    fetchUsers,
    getUserDisplayName,
    normalizeUser,
    getUserById,
    getUsersByRole,
    searchUsers
  };
}
