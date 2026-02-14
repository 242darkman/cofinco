import React, { useState, useCallback, useRef } from 'react';
import {
  User, Shield, Building2, Key, PenLine, Check, X,
  Smartphone, Mail, MapPin, CreditCard,
  Lock, Eye, EyeOff, AlertCircle, Info, UserCircle, Camera, Trash2
} from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useCanAny } from '../../contexts/AbilityContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import PasswordChangeModal from './profile/PasswordChangeModal';
import { authApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { resolveStorageUrl } from '../../lib/format';

// ==================== VALIDATION HELPERS ====================
const validateEmail = (email: string): string | null => {
  if (!email) return null; // Empty is allowed
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Format email invalide';
  }
  return null;
};

const validatePhone = (phone: string): string | null => {
  if (!phone) return null;
  // Allow formats: +242 06 123 4567, 06 123 4567, 0612345678, +242612345678
  const phoneRegex = /^[+]?[\d\s-]{6,20}$/;
  if (!phoneRegex.test(phone)) {
    return 'Format téléphone invalide';
  }
  return null;
};

// ==================== EDITABLE FIELD COMPONENT ====================
interface EditableFieldProps {
  label: string;
  value?: string;
  icon: React.ElementType;
  onSave: (value: string) => Promise<boolean>;
  editable?: boolean;
  type?: string;
  placeholder?: string;
  validation?: 'email' | 'phone' | 'none';
}

function EditableField({ label, value, icon: Icon, onSave, editable = true, type = 'text', placeholder, validation = 'none' }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate on change
  const handleChange = (newValue: string) => {
    setTempValue(newValue);

    // Real-time validation
    let error: string | null = null;
    if (validation === 'email') {
      error = validateEmail(newValue);
    } else if (validation === 'phone') {
      error = validatePhone(newValue);
    }
    setValidationError(error);
  };

  const handleSave = async () => {
    // Final validation before save
    let error: string | null = null;
    if (validation === 'email') {
      error = validateEmail(tempValue);
    } else if (validation === 'phone') {
      error = validatePhone(tempValue);
    }

    if (error) {
      setValidationError(error);
      return;
    }

    setSaving(true);
    const success = await onSave(tempValue);
    setSaving(false);
    if (success) {
      setIsEditing(false);
      setValidationError(null);
    }
  };

  const handleCancel = () => {
    setTempValue(value || '');
    setIsEditing(false);
    setValidationError(null);
  };

  // --- MODE ÉDITION (Compact) ---
  if (isEditing) {
    return (
      <div className="animate-in fade-in zoom-in-95 duration-200 bg-surface-base/50 p-1.5 -m-1.5 rounded-lg border border-accent/20">
        <label className="block text-[10px] font-medium text-accent mb-1 ml-1">
          {label}
        </label>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type={type}
              className={`w-full h-8 bg-surface-base border rounded-md pl-2 pr-2 text-xs text-content-primary focus:outline-none focus:ring-1 transition-all ${
                validationError
                  ? 'border-status-danger focus:ring-status-danger/20'
                  : 'border-accent focus:ring-accent/20'
              }`}
              value={tempValue}
              onChange={e => handleChange(e.target.value)}
              autoFocus
              placeholder={placeholder || `...`}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !!validationError}
            className="h-8 w-8 flex items-center justify-center bg-status-success hover:bg-status-success text-white rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Valider"
          >
            {saving ? <LoadingSpinner size="sm" /> : <Check size={14} strokeWidth={3} />}
          </button>

          <button
            onClick={handleCancel}
            className="h-8 w-8 flex items-center justify-center bg-surface hover:bg-surface-elevated text-content-muted hover:text-content-primary rounded-md border border-edge transition-colors"
            title="Annuler"
          >
            <X size={14} />
          </button>
        </div>

        {/* Validation error message */}
        {validationError && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-status-danger">
            <AlertCircle size={10} />
            <span>{validationError}</span>
          </div>
        )}
      </div>
    );
  }

  // --- MODE LECTURE (Compact) ---
  return (
    <div className="group flex items-center justify-between p-2 hover:bg-surface/50 rounded-lg transition-colors border border-transparent hover:border-edge/50 cursor-default -mx-2">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex-shrink-0 p-1.5 bg-surface-base rounded-md text-content-muted border border-edge group-hover:border-edge group-hover:text-accent transition-colors">
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-content-muted font-medium leading-none mb-0.5">{label}</div>
          <div className="text-xs font-medium text-content-secondary truncate leading-tight">{value || 'Non renseigné'}</div>
        </div>
      </div>
      
      {editable && (
        <button 
          onClick={() => setIsEditing(true)} 
          className="opacity-0 group-hover:opacity-100 p-1.5 text-accent hover:bg-accent/10 hover:text-accent rounded transition-all transform scale-90 group-hover:scale-100"
        >
          <PenLine size={14} />
        </button>
      )}
    </div>
  );
}

// ==================== READONLY FIELD COMPONENT ====================
interface ReadOnlyFieldProps {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}

function ReadOnlyField({ label, value, highlight }: ReadOnlyFieldProps) {
  return (
    <div className="flex flex-col">
      <div className="text-[9px] text-content-muted uppercase tracking-wider">{label}</div>
      <div className={`text-xs font-semibold truncate ${highlight ? 'text-status-success' : 'text-content-secondary'}`}>
        {value || <span className="text-content-secondary">—</span>}
      </div>
    </div>
  );
}

// PIN Form Props Interface
interface PinFormProps {
  formData: { currentPassword: string; newPin: string; confirmPin: string };
  setFormData: (data: any) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  loading: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

// ==================== CAISSE PIN MANAGER ====================
interface CaissePinManagerProps {
  hasPin?: boolean;
  onPinConfigured: () => void;
  canAccessCaisse: boolean; // Peut accéder à la caisse (via rôle OU permissions)
}

function CaissePinManager({ hasPin, onPinConfigured, canAccessCaisse }: CaissePinManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ currentPassword: '', newPin: '', confirmPin: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.newPin !== formData.confirmPin) {
      setError('PINs différents');
      return;
    }
    if (!/^\d{6}$/.test(formData.newPin)) {
      setError('6 chiffres requis');
      return;
    }

    setLoading(true);
    try {
      await authApi.setCaissePin({
        currentPassword: formData.currentPassword,
        newPin: formData.newPin
      });
      toast.success('PIN configuré');
      setFormData({ currentPassword: '', newPin: '', confirmPin: '' });
      setShowForm(false);
      onPinConfigured();
    } catch (err: any) {
      setError(handleApiError(err, 'Erreur'));
    } finally {
      setLoading(false);
    }
  }, [formData, onPinConfigured]);
  
  if (!canAccessCaisse) {
       return (
        <div className="flex items-center gap-2 text-[10px] text-content-muted bg-surface-base/50 p-2 rounded border border-edge">
          <Info size={12} className="shrink-0" />
          <span>PIN Caisse non requis (aucune permission caisse).</span>
        </div>
       );
  }

  if (showForm) {
      return (
        <div className="p-2 rounded-lg border bg-surface-base border-edge">
           <PinForm
            formData={formData}
            setFormData={setFormData}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            loading={loading}
            error={error}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      );
  }

  return (
    <div className={`flex items-center justify-between p-2 rounded-lg border ${!hasPin ? 'bg-status-warning-bg border-status-warning/20' : 'bg-surface-base border-edge'}`}>
       <div className="flex items-center gap-2">
            <CreditCard size={14} className={hasPin ? "text-status-success" : "text-status-warning"} />
            <div className="flex flex-col">
                 <span className={`text-[10px] font-bold ${hasPin ? "text-status-success" : "text-status-warning"}`}>
                     {hasPin ? 'PIN Actif' : 'PIN Inactif'}
                 </span>
                 <span className="text-[9px] text-content-muted leading-none">Accès caisse</span>
            </div>
       </div>
       <button
            onClick={() => setShowForm(true)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${hasPin 
                ? 'text-content-muted border-edge hover:bg-surface' 
                : 'text-status-warning bg-status-warning hover:bg-status-warning border-status-warning font-bold'}`}
       >
            {hasPin ? 'Modifier' : 'Créer'}
       </button>
    </div>
  );
}

function PinForm({ formData, setFormData, showPassword, setShowPassword, loading, error, onSubmit, onCancel }: PinFormProps) {
  const [showPin, setShowPin] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div className="text-[9px] text-status-danger bg-status-danger-bg p-1 rounded">
          {error}
        </div>
      )}

      <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            className="w-full px-2 py-1 bg-surface-base border border-edge rounded text-content-primary text-xs focus:border-accent outline-none pr-7 h-7"
            placeholder="Mot de passe actuel"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
          >
            {showPassword ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            value={formData.newPin}
            onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className="w-full px-2 py-1 bg-surface-base border border-edge rounded text-content-primary text-center text-xs font-mono tracking-widest focus:border-accent outline-none pr-6 h-7"
            placeholder="Nouveau"
            maxLength={6}
            inputMode="numeric"
            required
          />
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
          >
            {showPin ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            value={formData.confirmPin}
            onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className="w-full px-2 py-1 bg-surface-base border border-edge rounded text-content-primary text-center text-xs font-mono tracking-widest focus:border-accent outline-none pr-6 h-7"
            placeholder="Confirmer"
            maxLength={6}
            inputMode="numeric"
            required
          />
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary"
          >
            {showPin ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>
        </div>
      </div>

      <p className="text-[9px] text-content-muted">6 chiffres minimum requis</p>

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-1 bg-accent hover:bg-accent-primary-hover text-white text-[10px] font-semibold rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1 h-6"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Check size={10} />}
          OK
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 bg-surface hover:bg-surface-elevated text-content-secondary text-[10px] rounded transition-colors h-6"
        >
          <X size={10} />
        </button>
      </div>
    </form>
  );
}

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
    <div className="text-content-primary p-2 md:p-3 max-w-5xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* HEADER COMPACT */}
      <div className="flex items-center gap-3 mb-4 bg-surface-base/50 p-2 rounded-xl border border-edge/50">
        <div className="relative group shrink-0">
          {/* Photo Preview Mode */}
          {photoPreview ? (
            <div className="relative">
              <img
                src={photoPreview.url}
                alt="Aperçu"
                className="w-10 h-10 rounded-full border-2 border-accent object-cover ring-2 ring-accent/30"
              />
              <div className="absolute -bottom-2 -right-2 flex gap-0.5">
                <button
                  onClick={handleConfirmPhoto}
                  disabled={uploadingPhoto}
                  className="bg-status-success hover:bg-status-success p-1 rounded-full transition-colors disabled:opacity-50"
                  title="Confirmer"
                >
                  {uploadingPhoto ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Check size={10} className="text-white" strokeWidth={3} />
                  )}
                </button>
                <button
                  onClick={handleCancelPreview}
                  disabled={uploadingPhoto}
                  className="bg-surface-elevated hover:bg-surface-subtle p-1 rounded-full border border-edge-strong transition-colors disabled:opacity-50"
                  title="Annuler"
                >
                  <X size={10} className="text-content-secondary" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {user.photoProfile ? (
                <img
                  src={resolveStorageUrl(user.photoProfile)}
                  alt={getFullName()}
                  className="w-10 h-10 rounded-full border border-accent object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-status-info flex items-center justify-center text-white text-sm font-bold border border-accent">
                  {getInitials()}
                </div>
              )}
              <button
                onClick={handlePhotoClick}
                disabled={uploadingPhoto}
                className="absolute -bottom-1 -right-1 bg-surface p-1 rounded-full border border-edge-strong hover:bg-surface-elevated transition-colors disabled:opacity-50"
              >
                <Camera size={8} className="text-content-secondary" />
              </button>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold truncate leading-tight">{getFullName()}</h1>
            {photoPreview && (
              <span className="text-[9px] px-1.5 py-0.5 bg-accent/10 text-accent rounded border border-accent/30">
                Aperçu photo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-content-muted mt-0.5">
             <span className="text-accent font-medium text-[10px] uppercase">
               {getRoleLabel(user.role)}
             </span>
             {user.agence && <span className="opacity-50">• {user.agence}</span>}
          </div>
        </div>
      </div>

      {/* BENTO GRID - DENSE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* 1. CARTE IDENTITÉ */}
        <div className="bg-surface-base border border-edge rounded-lg p-3 space-y-2 flex flex-col">
          <h3 className="text-xs font-semibold flex items-center gap-2 pb-2 border-b border-edge text-content-secondary">
            <User size={14} className="text-accent" />
            Identité
          </h3>

          <div className="flex-1 space-y-0.5">
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

          <div className="flex items-center gap-1.5 pt-2 border-t border-edge">
            <UserCircle size={12} className="text-content-muted" />
            <span className="text-[10px] text-content-muted">@{user.username}</span>
          </div>
        </div>

        {/* 2. CARTE RH */}
        <div className="bg-surface-base border border-edge rounded-lg p-3 space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-edge">
            <h3 className="text-xs font-semibold flex items-center gap-2 text-content-secondary">
              <Building2 size={14} className="text-status-success" />
              RH & Contrat
            </h3>
            <div className={user.matricule ? "text-status-success" : "text-status-warning"}>
                 <div className="w-1.5 h-1.5 rounded-full bg-current" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ReadOnlyField label="Matricule" value={user.matricule} />
            <ReadOnlyField label="Poste" value={user.poste} />
            <ReadOnlyField label="Département" value={user.departement} />
            <ReadOnlyField label="Contrat" value={user.typeContrat} />
            <div className="col-span-2">
               <ReadOnlyField label="Date d'embauche" value={formatDate(user.dateEmbauche)} />
            </div>
          </div>

          {canViewSalary() && user.salaireBase !== undefined && (
            <div className="pt-2 border-t border-edge">
              <div className="flex justify-between items-end">
                   <span className="text-[9px] text-content-muted uppercase tracking-wider">Salaire Base</span>
                   <span className="text-sm font-mono font-bold text-status-success">{formatMoney(user.salaireBase)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. CARTE SÉCURITÉ */}
        <div className="bg-surface-base border border-edge rounded-lg p-3 space-y-3">
          <h3 className="text-xs font-semibold flex items-center gap-2 pb-2 border-b border-edge text-content-secondary">
            <Shield size={14} className="text-status-danger" />
            Sécurité
          </h3>

          <div className="space-y-3">
            {/* Mot de passe */}
            <div className="flex justify-between items-center p-2 bg-surface-base rounded-lg border border-edge">
                <div className="flex items-center gap-2">
                <Key size={14} className="text-content-muted" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-medium text-content-secondary">Mot de passe</span>
                </div>
                </div>
                <button
                onClick={() => setShowPasswordModal(true)}
                className="text-[10px] text-accent hover:text-accent font-medium px-2 py-1 border border-edge rounded hover:bg-surface transition-colors"
                >
                Modifier
                </button>
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
