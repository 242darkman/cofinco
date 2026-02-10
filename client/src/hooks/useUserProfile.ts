import { useState, useEffect, useCallback } from 'react';
import { SystemRole, getRoleLabel as getSystemRoleLabel, normalizeRole } from '@shared/types/roles';
import { toast } from '../lib/toast';

export interface UserData {
  id: string;
  username: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  role: SystemRole;
  agence?: string;
  agenceId?: string;
  actif?: boolean;
  createdAt?: string;
  photoProfile?: string;
  // Données employé/RH
  employeId?: string;
  matricule?: string;
  poste?: string;
  departement?: string;
  dateEmbauche?: string;
  typeContrat?: string;
  salaireBase?: number;
  hasCaissePin?: boolean;
}

export interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function useUserProfile() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState<PasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');

  const loadUserProfile = useCallback(async () => {
    try {
      // Charger le profil utilisateur (inclut les données employé si disponibles)
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          setLoading(false);
          return;
        }
        throw new Error('Erreur lors du chargement du profil');
      }
      const userData = await response.json();
      const normalizedRole = normalizeRole(userData.role) || SystemRole.CLIENT;

      // Mapper les données imbriquées pour l'affichage
      setUser({
        ...userData,
        role: normalizedRole,
        // Extraire les noms depuis les objets imbriqués (jobPosition, department)
        poste: userData.poste || userData.jobPosition?.name || null,
        departement: userData.departement || userData.department?.name || null,
      });
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors du chargement du profil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  const updateField = useCallback(async (field: string, value: string) => {
    if (!user) return false;
    setSaving(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Erreur lors de la mise à jour');
      }
      setUser(prev => prev ? { ...prev, [field]: value } : null);
      toast.success('Profil mis à jour');
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [user]);

  const handleChangePassword = useCallback(async () => {
    if (!user) return;
    setPasswordError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setPasswordError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors du changement de mot de passe');
      }
      toast.success('Mot de passe modifié avec succès');
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setPasswordError(err.message);
    }
  }, [user, passwordData]);

  const getFullName = useCallback(() => {
    if (user?.prenom && user?.nom) return `${user.prenom} ${user.nom}`;
    return user?.nom || user?.username || 'Utilisateur';
  }, [user]);

  const getRoleLabel = useCallback((role: string) => {
    return getSystemRoleLabel(role);
  }, []);

  const getInitials = useCallback(() => {
    if (!user) return 'U';
    const prenom = user.prenom?.charAt(0) || '';
    const nom = user.nom?.charAt(0) || '';
    return (prenom + nom).toUpperCase() || user.username?.charAt(0)?.toUpperCase() || 'U';
  }, [user]);

  // Vérifier si l'utilisateur peut voir les données salariales (admin/RH)
  const canViewSalary = useCallback(() => {
    if (!user) return false;
    return [SystemRole.ADMIN, SystemRole.CHEF_AGENCE].includes(user.role);
  }, [user]);

  // Vérifier si l'utilisateur est un caissier (peut avoir un PIN)
  const isCashier = useCallback(() => {
    if (!user) return false;
    return [SystemRole.ADMIN, SystemRole.CHEF_AGENCE, SystemRole.CAISSIER, SystemRole.SUPERVISEUR].includes(user.role);
  }, [user]);

  return {
    user,
    loading,
    saving,
    showPasswordModal,
    setShowPasswordModal,
    passwordData,
    setPasswordData,
    passwordError,
    setPasswordError,
    updateField,
    handleChangePassword,
    getFullName,
    getRoleLabel,
    getInitials,
    canViewSalary,
    isCashier,
    reloadProfile: loadUserProfile
  };
}
