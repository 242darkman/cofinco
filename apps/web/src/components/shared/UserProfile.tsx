import React, { useState, useCallback, useRef } from 'react';
import {
  User, Shield, Building2, Key, PenLine, Check, X,
  Smartphone, Mail, MapPin, CreditCard,
  Lock, Eye, EyeOff, AlertCircle, Info, UserCircle, Camera, Trash2
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useCanAny } from '../../contexts/AbilityContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import PasswordChangeModal from './profile/PasswordChangeModal';
import { toast, handleApiError } from '../../lib/toast';
import { resolveStorageUrl } from '../../lib/format';
import { EditableField } from './profile/EditableField';
import { ReadOnlyField } from './profile/ReadOnlyField';
import { CaissePinManager } from './profile/CaissePinManager';
import Button from '../ui/Button';

// ==================== MAIN USER PROFILE COMPONENT ====================
interface UserProfileProps {
  onUserUpdate?: () => void;
}

export default function UserProfile({ onUserUpdate }: UserProfileProps) {
  const {
    user, loading,
    showPasswordModal, setShowPasswordModal,
    passwordData, setPasswordData,
    passwordError,
    updateField, handleChangePassword,
    getFullName, getRoleLabel, getInitials,
    canViewSalary, isCashier, reloadProfile
  } = useUserProfile();

  // Vérifier les permissions CASL pour la caisse (en plus du rôle)
  const hasCaissePermission = useCanAny([
    { action: 'manage', subject: 'caisse' },
    { action: 'view', subject: 'caisse' },
  ]);

  // Un utilisateur peut configurer son PIN s'il a le rôle caissier OU s'il a des permissions caisse
  const canConfigureCaissePin = isCashier() || hasCaissePermission;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; file: File } | null>(null);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Fichier invalide');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max 2 Mo');
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview({ url: previewUrl, file });
  }, []);

  const handleConfirmPhoto = useCallback(async () => {
    if (!photoPreview || !user) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', photoPreview.file);
      formData.append('fileType', 'profile');
      formData.append('entityType', 'user');
      formData.append('entityId', user.id);

      const response = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) throw new Error('Échec upload');

      const { key } = await response.json();
      const success = await updateField('photoProfile', key);
      if (success) {
        toast.success('Photo mise à jour');
        reloadProfile();
        onUserUpdate?.();
      }
    } catch (err: any) {
      toast.error(handleApiError(err, 'Erreur upload'));
    } finally {
      setUploadingPhoto(false);
      handleCancelPreview();
    }
  }, [photoPreview, user, updateField, reloadProfile, onUserUpdate]);

  const handleCancelPreview = useCallback(() => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview.url);
    }
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [photoPreview]);

  const handleDeletePhoto = useCallback(async () => {
    if (!confirm('Supprimer votre photo ?')) return;

    setUploadingPhoto(true);
    try {
      const success = await updateField('photoProfile', '');
      if (success) {
        toast.success('Photo supprimée');
        reloadProfile();
        onUserUpdate?.();
      }
    } catch (err: any) {
      toast.error(handleApiError(err, 'Erreur suppression'));
    } finally {
      setUploadingPhoto(false);
    }
  }, [updateField, reloadProfile, onUserUpdate]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={32} className="text-content-muted" />
        </div>
        <h3 className="font-bold text-content-primary mb-1">Non connecté</h3>
        <p className="text-content-muted text-xs text-center px-4">Reconnectez-vous.</p>
      </div>
    );
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatMoney = (amount?: number) => {
    if (amount === undefined || amount === null) return null;
    return new Intl.NumberFormat('fr-FR').format(amount) + ' F';
  };

  return (
    <div className="text-content-primary p-3 md:p-4 lg:p-6 w-full max-w-7xl mx-auto space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* ==================== HERO HEADER CARD ==================== */}
      <div className="relative overflow-hidden bg-surface-base border border-edge rounded-2xl">
        {/* Decorative gradient band */}
        <div className="h-24 sm:h-28 bg-gradient-to-br from-accent/10 via-surface-base to-accent/5 relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-accent/5 rounded-full blur-3xl -mr-12 -mt-12 pointer-events-none" />
        </div>

        {/* Profile content overlapping the gradient */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-5 -mt-10 sm:-mt-12 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            {/* Avatar */}
            <div className="relative group shrink-0">
              {photoPreview ? (
                <div className="relative">
                  <img
                    src={photoPreview.url}
                    alt="Aperçu"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-accent object-cover ring-4 ring-surface-base"
                  />
                  <div className="absolute -bottom-1 -right-1 flex gap-0.5">
                    <button
                      onClick={handleConfirmPhoto}
                      disabled={uploadingPhoto}
                      className="bg-status-success hover:bg-status-success p-1 rounded-full transition-colors disabled:opacity-50"
                      title="Confirmer"
                    >
                      {uploadingPhoto ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Check size={12} className="text-white" strokeWidth={3} />
                      )}
                    </button>
                    <button
                      onClick={handleCancelPreview}
                      disabled={uploadingPhoto}
                      className="bg-surface-elevated hover:bg-surface-subtle p-1 rounded-full border border-edge transition-colors disabled:opacity-50"
                      title="Annuler"
                    >
                      <X size={12} className="text-content-secondary" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Avatar
                    photoUrl={user.photoProfile}
                    fullName={getFullName()}
                    size="xxl"
                    className="ring-4 ring-surface-base border-2 border-accent/30 shadow-sm"
                  />
                  <button
                    onClick={handlePhotoClick}
                    disabled={uploadingPhoto}
                    className="absolute -bottom-0.5 -right-0.5 bg-surface-base p-1.5 rounded-full border border-edge hover:bg-surface-elevated transition-colors disabled:opacity-50"
                  >
                    <Camera size={12} className="text-content-secondary" />
                  </button>
                </>
              )}
            </div>

            {/* Name + Role + Agency */}
            <div className="flex-1 min-w-0 pb-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-content-primary leading-tight">
                  {getFullName()}
                </h1>
                {photoPreview && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent rounded border border-accent/30">
                    Aperçu photo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-accent uppercase tracking-wide">
                  {getRoleLabel(user.role)}
                </span>
                {user.agence && (
                  <>
                    <span className="text-content-muted">|</span>
                    <span className="text-xs text-content-muted">{user.agence}</span>
                  </>
                )}
              </div>
            </div>

            {/* Username badge (desktop) */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-subtle rounded-lg border border-edge shrink-0">
              <UserCircle size={14} className="text-content-muted" />
              <span className="text-xs text-content-muted font-medium">@{user.username}</span>
            </div>
          </div>

          {/* Username (mobile) */}
          <div className="sm:hidden flex items-center gap-1.5 mt-2">
            <UserCircle size={12} className="text-content-muted" />
            <span className="text-[10px] text-content-muted">@{user.username}</span>
          </div>
        </div>
      </div>

      {/* ==================== BODY: 2-COLUMN ASYMMETRIC ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 lg:gap-4">
        {/* LEFT COLUMN (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Card: Coordonnees */}
          <div className="bg-surface-base border border-edge rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-2 pb-2.5 border-b border-edge mb-1">
              <div className="p-1.5 bg-accent/10 rounded-lg">
                <User size={15} className="text-accent" />
              </div>
              <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                Coordonnées
              </h3>
            </div>

            <EditableField
              label="Téléphone"
              value={user.telephone}
              icon={Smartphone}
              onSave={(val) => updateField('telephone', val)}
              type="tel"
              placeholder="+242..."
              validation="phone"
            />
            <EditableField
              label="Email"
              value={user.email}
              icon={Mail}
              onSave={(val) => updateField('email', val)}
              type="email"
              placeholder="@..."
              validation="email"
            />
            <EditableField
              label="Adresse"
              value={user.adresse}
              icon={MapPin}
              onSave={(val) => updateField('adresse', val)}
              placeholder="Ville, Quartier..."
            />
          </div>

          {/* Card: Informations Personnelles (conditional) */}
          {(user.sexe || user.dateNaissance || user.lieuNaissance) && (
            <div className="bg-surface-base border border-edge rounded-xl p-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-edge mb-3">
                <div className="p-1.5 bg-status-info/10 rounded-lg">
                  <Info size={15} className="text-status-info" />
                </div>
                <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Informations personnelles
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {user.sexe && (
                  <ReadOnlyField label="Sexe" value={user.sexe === 'M' ? 'Masculin' : 'Féminin'} />
                )}
                {user.dateNaissance && (
                  <ReadOnlyField label="Date de naissance" value={formatDate(user.dateNaissance)} />
                )}
                {user.lieuNaissance && (
                  <ReadOnlyField label="Lieu de naissance" value={user.lieuNaissance} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (2/5) */}
        <div className="lg:col-span-2 space-y-3">
          {/* Card: RH & Contrat */}
          <div className="bg-surface-base border border-edge rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-edge">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-status-success/10 rounded-lg">
                  <Building2 size={15} className="text-status-success" />
                </div>
                <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  RH & Contrat
                </h3>
              </div>
              <div className={user.matricule ? "text-status-success" : "text-status-warning"}>
                <div className="w-1.5 h-1.5 rounded-full bg-current" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ReadOnlyField label="Matricule" value={user.matricule} />
              <ReadOnlyField label="Poste" value={user.poste} />
              <ReadOnlyField label="Département" value={user.departement} />
              <ReadOnlyField label="Contrat" value={user.typeContrat} />
            </div>

            <ReadOnlyField label="Date d'embauche" value={formatDate(user.dateEmbauche)} />

            {canViewSalary() && user.salaireBase !== undefined && (
              <div className="pt-3 border-t border-edge">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-content-muted uppercase tracking-wider">Salaire Base</span>
                  <span className="text-base font-mono font-bold text-status-success">{formatMoney(user.salaireBase)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Card: Securite */}
          <div className="bg-surface-base border border-edge rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-edge">
              <div className="p-1.5 bg-status-danger/10 rounded-lg">
                <Shield size={15} className="text-status-danger" />
              </div>
              <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                Sécurité
              </h3>
            </div>

            <div className="space-y-2.5">
              {/* Mot de passe */}
              <div className="flex justify-between items-center p-2.5 bg-surface-subtle rounded-lg border border-edge">
                <div className="flex items-center gap-2.5">
                  <Key size={14} className="text-content-muted" />
                  <span className="text-xs font-medium text-content-secondary">Mot de passe</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowPasswordModal(true)}
                  className="text-xs"
                >
                  Modifier
                </Button>
              </div>

              {/* PIN Caisse */}
              <CaissePinManager
                hasPin={user.hasCaissePin}
                onPinConfigured={reloadProfile}
                canAccessCaisse={canConfigureCaissePin}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      <PasswordChangeModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        }}
        passwordData={passwordData}
        setPasswordData={setPasswordData}
        error={passwordError}
        onSubmit={handleChangePassword}
      />
    </div>
  );
}
