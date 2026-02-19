import React, { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle, Phone, AlertTriangle } from 'lucide-react';
import PasswordStrengthIndicator from '../auth/PasswordStrengthIndicator';
import { Modal, FormField, SelectField, Button } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { userApi, roleApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { SystemRole, getRoleOptions, normalizeRole } from '@shared/types/roles';

interface RoleOption {
  value: SystemRole;
  label: string;
}

interface AdminUserFormProps {
  user?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminUserForm({ user, onClose, onSuccess }: AdminUserFormProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canSaveUsers = user
    ? (hasPermission('users', 'edit') || hasPermission('admin', 'manage'))
    : (hasPermission('users', 'create') || hasPermission('admin', 'manage'));

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [formData, setFormData] = useState({
    email: user?.email || '',
    prenom: user?.prenom || '',
    nom: user?.nom || '',
    telephone: user?.telephone || '',
    role: normalizeRole(user?.role) || SystemRole.CLIENT,
    statut: user?.statut || 'actif',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordValidation, setPasswordValidation] = useState<any>(null);

  const fetchRoles = useCallback(async () => {
    try {
      const data = await roleApi.getAll();
      setRoles((data || []) as RoleOption[]);
    } catch (error) {
      // Silently fail - fallback options will be used
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (user) {
        await userApi.update(user.id, {
          email: formData.email,
          prenom: formData.prenom,
          nom: formData.nom,
          telephone: formData.telephone,
          role: formData.role,
          statut: formData.statut
        });

        toast.success('Utilisateur modifié');
      } else {
        if (!formData.password || formData.password.length < 8) {
          setError('Le mot de passe doit contenir au moins 8 caractères');
          setLoading(false);
          return;
        }

        if (passwordValidation && !passwordValidation.isValid) {
          setError('Le mot de passe ne respecte pas les exigences de sécurité');
          setLoading(false);
          return;
        }

        await userApi.create({
          email: formData.email,
          password: formData.password,
          prenom: formData.prenom,
          nom: formData.nom,
          telephone: formData.telephone,
          role: formData.role,
          statut: formData.statut
        });

        toast.success('Utilisateur créé');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      const message = handleApiError(error, 'Erreur lors de l\'enregistrement de l\'utilisateur');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user, formData, passwordValidation, onSuccess, onClose]);

  const roleOptions = roles.length > 0 ? roles : getRoleOptions();

  const statutOptions = [
    { value: 'actif', label: 'Actif' },
    { value: 'inactif', label: 'Inactif' },
    { value: 'bloque', label: 'Bloqué' }
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={user ? 'Modifier Utilisateur' : 'Nouvel Utilisateur'}
      size="xl"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
          >
            Annuler
          </Button>
          {canSaveUsers ? (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              icon={Save}
              variant="primary"
              className="bg-gradient-to-r from-status-success to-status-success hover:from-status-success hover:to-status-success"
            >
              {loading ? 'Sauvegarde...' : user ? 'Modifier' : 'Créer'}
            </Button>
          ) : (
            <div className="px-4 py-2 bg-status-warning-bg text-status-warning rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              Permission requise
            </div>
          )}
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-status-info-bg border border-status-info rounded-lg p-4 flex items-center gap-3 text-status-info">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={!!user}
          />


          <FormField
            label="Téléphone"
            name="telephone"
            type="tel"
            value={(formData.telephone || '').replace('+242', '').trim()}
            onChange={(e) => {
              const phoneNumber = e.target.value.replace(/[^\d]/g, '');
              setFormData({ ...formData, telephone: '+242' + phoneNumber });
            }}
            placeholder="05 123 4567"
            maxLength={11}
            icon={Phone}
          />

          <FormField
            label="Prénom"
            name="prenom"
            value={formData.prenom}
            onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
          />

          <FormField
            label="Nom"
            name="nom"
            value={formData.nom}
            onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
          />

          <SelectField
            label="Rôle"
            name="role"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as SystemRole })}
            options={roleOptions}
            required
          />

          <SelectField
            label="Statut"
            name="statut"
            value={formData.statut}
            onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
            options={statutOptions}
            required
          />

          {!user && (
            <div className="md:col-span-2 space-y-3">
              <FormField
                label="Mot de passe (min 8 caractères)"
                name="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!user}
                minLength={8}
                helperText="Au moins une majuscule, une minuscule, un chiffre et un caractère spécial."
              />
              {formData.password && (
                <PasswordStrengthIndicator
                  password={formData.password}
                  onChange={setPasswordValidation}
                />
              )}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
