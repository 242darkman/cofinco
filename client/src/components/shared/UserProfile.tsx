import React, { useState, useCallback, useRef } from 'react';
import {
  User, Shield, Building2, Key, PenLine, Check, X,
  Smartphone, Mail, MapPin, CreditCard,
  Lock, Eye, EyeOff, AlertCircle, Info, UserCircle, Camera, Trash2
} from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import LoadingSpinner from '../ui/LoadingSpinner';
import PasswordChangeModal from './profile/PasswordChangeModal';
import { authApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { resolveStorageUrl } from '../../lib/format';

// ==================== EDITABLE FIELD COMPONENT ====================
interface EditableFieldProps {
  label: string;
  value?: string;
  icon: React.ElementType;
  onSave: (value: string) => Promise<boolean>;
  editable?: boolean;
  type?: string;
  placeholder?: string;
}

function EditableField({ label, value, icon: Icon, onSave, editable = true, type = 'text', placeholder }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave(tempValue);
    setSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setTempValue(value || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in duration-200">
        <div className="flex-1">
          <label className="text-xs text-indigo-400 ml-1 font-medium">{label}</label>
          <input
            type={type}
            className="w-full bg-slate-950 border border-indigo-500 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            value={tempValue}
            onChange={e => setTempValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
        >
          {saving ? <LoadingSpinner size="sm" /> : <Check size={18} />}
        </button>
        <button
          onClick={handleCancel}
          className="p-2.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between p-2 hover:bg-slate-800/50 rounded-lg transition-colors">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-slate-950 rounded-lg text-slate-500">
          <Icon size={14} />
        </div>
        <div>
          <div className="text-[10px] text-slate-500">{label}</div>
          <div className="text-xs font-medium text-slate-200">{value || <span className="text-slate-600 italic">Non renseigné</span>}</div>
        </div>
      </div>
      {editable && (
        <button
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded transition-all"
        >
          <PenLine size={12} />
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
    <div>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-xs font-medium ${highlight ? 'text-emerald-400' : 'text-slate-300'}`}>
        {value || <span className="text-slate-600">—</span>}
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
}

function CaissePinManager({ hasPin, onPinConfigured }: CaissePinManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ currentPassword: '', newPin: '', confirmPin: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.newPin !== formData.confirmPin) {
      setError('Les PIN ne correspondent pas');
      return;
    }
    if (!/^\d{6}$/.test(formData.newPin)) {
      setError('Le PIN doit contenir exactement 6 chiffres');
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
      setError(handleApiError(err, 'Erreur PIN'));
    } finally {
      setLoading(false);
    }
  }, [formData, onPinConfigured]);

  if (!hasPin) {
    return (
      <div className={`p-2.5 rounded-lg border ${showForm ? 'bg-slate-950 border-slate-700' : 'bg-amber-900/20 border-amber-500/30'}`}>
        {!showForm ? (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-amber-400" />
              <span className="text-xs text-amber-300">PIN Caisse non configuré</span>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="text-[10px] bg-amber-500 hover:bg-amber-400 text-black font-bold px-2 py-1 rounded transition-colors"
            >
              Configurer
            </button>
          </div>
        ) : (
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
        )}
      </div>
    );
  }

  return (
    <div className={`p-2.5 rounded-lg border ${showForm ? 'bg-slate-950 border-slate-700' : 'bg-slate-950 border-slate-800'}`}>
      {!showForm ? (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CreditCard size={14} className="text-emerald-400" />
            <span className="text-xs text-emerald-400">PIN Caisse actif</span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="text-[10px] text-slate-400 hover:text-white px-2 py-1 border border-slate-700 rounded hover:bg-slate-800 transition-colors"
          >
            Modifier
          </button>
        </div>
      ) : (
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
      )}
    </div>
  );
}

function PinForm({ formData, setFormData, showPassword, setShowPassword, loading, error, onSubmit, onCancel }: PinFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      <div>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:border-indigo-500 outline-none pr-7"
            placeholder="Mot de passe de connexion"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <p className="text-[9px] text-slate-500 mt-0.5 pl-1">Votre mot de passe de session COFIN&CO-M</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="password"
          value={formData.newPin}
          onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-center text-xs font-mono tracking-widest focus:border-indigo-500 outline-none"
          placeholder="Nouveau"
          maxLength={6}
          inputMode="numeric"
          required
        />
        <input
          type="password"
          value={formData.confirmPin}
          onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-center text-xs font-mono tracking-widest focus:border-indigo-500 outline-none"
          placeholder="Confirmer"
          maxLength={6}
          inputMode="numeric"
          required
        />
      </div>

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Check size={12} />}
          OK
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded transition-colors"
        >
          <X size={12} />
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation
    if (!file.type.startsWith('image/')) {
      toast.error('Fichier invalide. Sélectionnez une image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image trop volumineuse (max 2 Mo)');
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', 'profiles');
      formData.append('isPublic', 'true');

      const response = await fetch('/api/storage/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Échec upload');
      }

      const { key } = await response.json();

      // Mettre à jour le profil avec le chemin relatif (pas l'URL complète)
      const success = await updateField('photoProfile', key);
      if (success) {
        toast.success('Photo de profil mise à jour');
        reloadProfile();
        onUserUpdate?.(); // Rafraîchir les données dans App.tsx pour sync header
      }
    } catch (err: any) {
      toast.error(handleApiError(err, 'Erreur upload'));
    } finally {
      setUploadingPhoto(false);
      // Reset input pour permettre de re-sélectionner le même fichier
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [updateField, reloadProfile, onUserUpdate]);

  const handleDeletePhoto = useCallback(async () => {
    if (!confirm('Supprimer votre photo de profil ?')) return;

    setUploadingPhoto(true);
    try {
      const success = await updateField('photoProfile', '');
      if (success) {
        toast.success('Photo supprimée');
        reloadProfile();
        onUserUpdate?.(); // Rafraîchir les données dans App.tsx pour sync header
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
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <User size={40} className="text-slate-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Session expirée</h3>
        <p className="text-slate-400">Veuillez vous reconnecter pour accéder à votre profil.</p>
      </div>
    );
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatMoney = (amount?: number) => {
    if (amount === undefined || amount === null) return null;
    return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
  };

  return (
    <div className="text-white p-4 md:p-6">
      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* HEADER COMPACT */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative group">
          {user.photoProfile ? (
            <img
              src={resolveStorageUrl(user.photoProfile)}
              alt={getFullName()}
              className="w-14 h-14 rounded-full border-2 border-indigo-500 object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold border-2 border-indigo-400">
              {getInitials()}
            </div>
          )}
          {/* Bouton changer photo */}
          <button
            onClick={handlePhotoClick}
            disabled={uploadingPhoto}
            className="absolute -bottom-0.5 -right-0.5 bg-slate-800 p-1 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="Changer la photo"
          >
            {uploadingPhoto ? (
              <LoadingSpinner size="sm" />
            ) : (
              <Camera size={10} className="text-slate-300" />
            )}
          </button>
          {/* Bouton supprimer photo (visible au hover si photo existe) */}
          {user.photoProfile && !uploadingPhoto && (
            <button
              onClick={handleDeletePhoto}
              className="absolute -top-0.5 -right-0.5 bg-rose-600 p-1 rounded-full border border-rose-500 hover:bg-rose-500 transition-colors opacity-0 group-hover:opacity-100"
              title="Supprimer la photo"
            >
              <Trash2 size={10} className="text-white" />
            </button>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold">{getFullName()}</h1>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20 text-[10px] font-bold uppercase">
              {getRoleLabel(user.role)}
            </span>
            {user.agence && <span className="text-xs">• {user.agence}</span>}
          </div>
        </div>
      </div>

      {/* BENTO GRID - COMPACT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. CARTE IDENTITÉ */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-300">
            <User size={16} className="text-indigo-400" />
            Informations Personnelles
          </h3>

          <div className="space-y-0.5">
            <EditableField
              label="Téléphone"
              value={user.telephone}
              icon={Smartphone}
              onSave={(val) => updateField('telephone', val)}
              type="tel"
              placeholder="+242 06 000 0000"
            />
            <EditableField
              label="Email"
              value={user.email}
              icon={Mail}
              onSave={(val) => updateField('email', val)}
              type="email"
              placeholder="email@exemple.com"
            />
            <EditableField
              label="Adresse"
              value={user.adresse}
              icon={MapPin}
              onSave={(val) => updateField('adresse', val)}
              placeholder="Votre adresse"
            />
          </div>

          {/* Username inline */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <UserCircle size={14} className="text-slate-500" />
            <span className="text-xs text-slate-500">@{user.username}</span>
          </div>
        </div>

        {/* 2. CARTE RH */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-300">
              <Building2 size={16} className="text-emerald-400" />
              Données RH
            </h3>
            <Lock size={12} className="text-slate-600" />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <ReadOnlyField label="Matricule" value={user.matricule} />
            <ReadOnlyField label="Poste" value={user.poste} />
            <ReadOnlyField label="Département" value={user.departement} />
            <ReadOnlyField label="Contrat" value={user.typeContrat} />
            <ReadOnlyField label="Embauche" value={formatDate(user.dateEmbauche)} />
          </div>

          {/* Info si pas de données RH */}
          {!user.matricule && !user.poste && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-2">
              <Info size={12} className="shrink-0" />
              <span>Données RH non renseignées.</span>
            </div>
          )}

          {/* Section Paie */}
          {canViewSalary() && user.salaireBase !== undefined && (
            <div className="pt-2 border-t border-slate-800">
              <ReadOnlyField label="Salaire Base" value={formatMoney(user.salaireBase)} highlight />
            </div>
          )}
        </div>

        {/* 3. CARTE SÉCURITÉ (Fusionnée) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-300">
            <Shield size={16} className="text-rose-400" />
            Sécurité
          </h3>

          {/* Mot de passe */}
          <div className="flex justify-between items-center p-2.5 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <Key size={14} className="text-slate-500" />
              <span className="text-xs text-slate-300">Mot de passe</span>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 border border-slate-700 rounded hover:bg-slate-800 transition-colors"
            >
              Changer
            </button>
          </div>

          {/* PIN Caisse */}
          {isCashier() && (
            <CaissePinManager
              hasPin={user.hasCaissePin}
              onPinConfigured={reloadProfile}
            />
          )}

          {!isCashier() && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <Info size={12} className="shrink-0" />
              <span>PIN Caisse réservé aux caissiers.</span>
            </div>
          )}
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
