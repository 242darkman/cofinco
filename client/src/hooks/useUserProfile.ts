import { useState, useEffect } from 'react';

export interface UserData {
  id: string;
  username: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  role: string;
  agence?: string;
  actif?: boolean;
  createdAt?: string;
}

export interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function useUserProfile() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    username: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          setUser(null);
          setLoading(false);
          return;
        }
        throw new Error('Erreur lors du chargement du profil');
      }
      const data = await response.json();
      setUser(data);
      setFormData({
        nom: data.nom || '',
        prenom: data.prenom || '',
        email: data.email || '',
        telephone: data.telephone || '',
        username: data.username || ''
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la mise à jour');
      }
      alert('Profil mis à jour avec succès');
      setEditing(false);
      loadUserProfile();
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
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
      alert('Mot de passe modifié avec succès');
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setPasswordError(err.message);
    }
  };

  const getFullName = () => {
    if (user?.prenom && user?.nom) return `${user.prenom} ${user.nom}`;
    return user?.nom || user?.username || 'Utilisateur';
  };

  const getRoleLabel = (role: string) => {
    // Roles are now standardized as full French names
    return role;
  };

  return {
    user, loading, editing, setEditing, saving,
    showPasswordModal, setShowPasswordModal,
    formData, setFormData,
    passwordData, setPasswordData,
    passwordError, setPasswordError,
    handleSaveProfile, handleChangePassword,
    getFullName, getRoleLabel
  };
}
