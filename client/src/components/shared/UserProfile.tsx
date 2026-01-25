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

  // --- MODE ÉDITION (Compact) ---
  if (isEditing) {
    return (
      <div className="animate-in fade-in zoom-in-95 duration-200 bg-slate-900/50 p-1.5 -m-1.5 rounded-lg border border-indigo-500/20">
        <label className="block text-[10px] font-medium text-indigo-400 mb-1 ml-1">
          {label}
        </label>
        
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input 
              type={type}
              className="w-full h-8 bg-slate-950 border border-indigo-500 rounded-md pl-2 pr-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-all"
              value={tempValue}
              onChange={e => setTempValue(e.target.value)}
              autoFocus
              placeholder={placeholder || `...`}
            />
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="h-8 w-8 flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-md transition-colors shadow-sm disabled:opacity-50"
            title="Valider"
          >
            {saving ? <LoadingSpinner size="sm" /> : <Check size={14} strokeWidth={3} />}
          </button>
          
          <button 
            onClick={handleCancel}
            className="h-8 w-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md border border-slate-700 transition-colors"
            title="Annuler"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // --- MODE LECTURE (Compact) ---
  return (
    <div className="group flex items-center justify-between p-2 hover:bg-slate-800/50 rounded-lg transition-colors border border-transparent hover:border-slate-800/50 cursor-default -mx-2">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex-shrink-0 p-1.5 bg-slate-950 rounded-md text-slate-400 border border-slate-800 group-hover:border-slate-700 group-hover:text-indigo-400 transition-colors">
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500 font-medium leading-none mb-0.5">{label}</div>
          <div className="text-xs font-medium text-slate-200 truncate leading-tight">{value || 'Non renseigné'}</div>
        </div>
      </div>
      
      {editable && (
        <button 
          onClick={() => setIsEditing(true)} 
          className="opacity-0 group-hover:opacity-100 p-1.5 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 rounded transition-all transform scale-90 group-hover:scale-100"
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
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xs font-semibold truncate ${highlight ? 'text-emerald-400' : 'text-slate-300'}`}>
        {value || <span className="text-slate-700">—</span>}
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
  isCashier: boolean; 
}

function CaissePinManager({ hasPin, onPinConfigured, isCashier }: CaissePinManagerProps) {
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
  
  if (!isCashier) {
       return (
        <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded border border-slate-800">
          <Info size={12} className="shrink-0" />
          <span>PIN Caisse non requis pour ce rôle.</span>
        </div>
       );
  }

  if (showForm) {
      return (
        <div className="p-2 rounded-lg border bg-slate-950 border-slate-700">
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
    <div className={`flex items-center justify-between p-2 rounded-lg border ${!hasPin ? 'bg-amber-900/10 border-amber-500/20' : 'bg-slate-900 border-slate-800'}`}>
       <div className="flex items-center gap-2">
            <CreditCard size={14} className={hasPin ? "text-emerald-400" : "text-amber-400"} />
            <div className="flex flex-col">
                 <span className={`text-[10px] font-bold ${hasPin ? "text-emerald-400" : "text-amber-400"}`}>
                     {hasPin ? 'PIN Actif' : 'PIN Inactif'}
                 </span>
                 <span className="text-[9px] text-slate-500 leading-none">Accès caisse</span>
            </div>
       </div>
       <button
            onClick={() => setShowForm(true)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${hasPin 
                ? 'text-slate-400 border-slate-700 hover:bg-slate-800' 
                : 'text-amber-900 bg-amber-500 hover:bg-amber-400 border-amber-500 font-bold'}`}
       >
            {hasPin ? 'Modifier' : 'Créer'}
       </button>
    </div>
  );
}

function PinForm({ formData, setFormData, showPassword, setShowPassword, loading, error, onSubmit, onCancel }: PinFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div className="text-[9px] text-red-400 bg-red-900/20 p-1 rounded">
          {error}
        </div>
      )}

      <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:border-indigo-500 outline-none pr-7 h-7"
            placeholder="Mise de passe actuel"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            {showPassword ? <EyeOff size={10} /> : <Eye size={10} />}
          </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="password"
          value={formData.newPin}
          onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-center text-xs font-mono tracking-widest focus:border-indigo-500 outline-none h-7"
          placeholder="Nouveau"
          maxLength={6}
          inputMode="numeric"
          required
        />
        <input
          type="password"
          value={formData.confirmPin}
          onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-center text-xs font-mono tracking-widest focus:border-indigo-500 outline-none h-7"
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
          className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1 h-6"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Check size={10} />}
          OK
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded transition-colors h-6"
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [updateField, reloadProfile, onUserUpdate]);

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
        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={32} className="text-slate-500" />
        </div>
        <h3 className="font-bold text-white mb-1">Non connecté</h3>
        <p className="text-slate-400 text-xs text-center px-4">Reconnectez-vous.</p>
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
    <div className="text-white p-2 md:p-3 max-w-5xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* HEADER COMPACT */}
      <div className="flex items-center gap-3 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800/50">
        <div className="relative group shrink-0">
          {user.photoProfile ? (
            <img
              src={resolveStorageUrl(user.photoProfile)}
              alt={getFullName()}
              className="w-10 h-10 rounded-full border border-indigo-500 object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold border border-indigo-400">
              {getInitials()}
            </div>
          )}
          <button
            onClick={handlePhotoClick}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 bg-slate-800 p-1 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
             <Camera size={8} className="text-slate-300" />
          </button>
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate leading-tight">{getFullName()}</h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
             <span className="text-indigo-400 font-medium text-[10px] uppercase">
               {getRoleLabel(user.role)}
             </span>
             {user.agence && <span className="opacity-50">• {user.agence}</span>}
          </div>
        </div>
      </div>

      {/* BENTO GRID - DENSE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* 1. CARTE IDENTITÉ */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2 flex flex-col">
          <h3 className="text-xs font-semibold flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-300">
            <User size={14} className="text-indigo-400" />
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
            />
            <EditableField
              label="Email"
              value={user.email}
              icon={Mail}
              onSave={(val) => updateField('email', val)}
              type="email"
              placeholder="@..."
            />
            <EditableField
              label="Adresse"
              value={user.adresse}
              icon={MapPin}
              onSave={(val) => updateField('adresse', val)}
              placeholder="Ville, Quartier..."
            />
          </div>

          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800">
            <UserCircle size={12} className="text-slate-600" />
            <span className="text-[10px] text-slate-600">@{user.username}</span>
          </div>
        </div>

        {/* 2. CARTE RH */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-300">
              <Building2 size={14} className="text-emerald-400" />
              RH & Contrat
            </h3>
            <div className={user.matricule ? "text-emerald-500" : "text-amber-500"}>
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
            <div className="pt-2 border-t border-slate-800">
              <div className="flex justify-between items-end">
                   <span className="text-[9px] text-slate-500 uppercase tracking-wider">Salaire Base</span>
                   <span className="text-sm font-mono font-bold text-emerald-400">{formatMoney(user.salaireBase)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. CARTE SÉCURITÉ */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
          <h3 className="text-xs font-semibold flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-300">
            <Shield size={14} className="text-rose-400" />
            Sécurité
          </h3>

          <div className="space-y-3">
            {/* Mot de passe */}
            <div className="flex justify-between items-center p-2 bg-slate-950 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                <Key size={14} className="text-slate-500" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-medium text-slate-300">Mot de passe</span>
                </div>
                </div>
                <button
                onClick={() => setShowPasswordModal(true)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 border border-slate-700 rounded hover:bg-slate-800 transition-colors"
                >
                Modifier
                </button>
            </div>

            {/* PIN Caisse */}
            <CaissePinManager
                hasPin={user.hasCaissePin}
                onPinConfigured={reloadProfile}
                isCashier={isCashier()}
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
