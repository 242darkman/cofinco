import React, { useState, useCallback } from 'react';
import {
  User, Shield, Building2, Key, KeyRound, PenLine, Check, X,
  Smartphone, Mail, MapPin, Calendar, Briefcase, CreditCard,
  Lock, Eye, EyeOff, AlertCircle, Info, UserCircle
} from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import LoadingSpinner from '../ui/LoadingSpinner';
import PasswordChangeModal from './profile/PasswordChangeModal';
import { authApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

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
    <div className="group flex items-center justify-between p-3 hover:bg-slate-800/50 rounded-xl transition-colors border border-transparent hover:border-slate-700/50">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-950 rounded-lg text-slate-400">
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-sm font-medium text-slate-200">{value || <span className="text-slate-500 italic">Non renseigné</span>}</div>
        </div>
      </div>
      {editable && (
        <button
          onClick={() => setIsEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
        >
          <PenLine size={16} />
        </button>
      )}
    </div>
  );
}

// ==================== READONLY FIELD COMPONENT ====================
interface ReadOnlyFieldProps {
  label: string;
  value?: string | number;
  highlight?: boolean;
}

function ReadOnlyField({ label, value, highlight }: ReadOnlyFieldProps) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-emerald-400' : 'text-slate-300'}`}>
        {value || <span className="text-slate-600 italic">—</span>}
      </div>
    </div>
  );
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
      toast.success('PIN caisse configuré avec succès');
      setFormData({ currentPassword: '', newPin: '', confirmPin: '' });
      setShowForm(false);
      onPinConfigured();
    } catch (err: any) {
      setError(handleApiError(err, 'Erreur lors de la configuration du PIN'));
    } finally {
      setLoading(false);
    }
  }, [formData, onPinConfigured]);

  // PIN non configuré - Alerte
  if (!hasPin) {
    return (
      <div className="bg-amber-900/10 border border-amber-500/30 rounded-2xl p-5">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3 text-amber-400">
          <CreditCard size={20} />
          PIN Caisse
        </h3>

        {!showForm ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-amber-200/80">
              Vous n'avez pas encore défini de code PIN. Ce code est indispensable pour autoriser les opérations de caisse.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors"
            >
              Configurer maintenant
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

  // PIN configuré
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-blue-400">
        <CreditCard size={20} />
        PIN Caisse
      </h3>

      {!showForm ? (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <Check size={16} /> Actif et sécurisé
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-700 transition"
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

// PIN Form Sub-component
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

function PinForm({ formData, setFormData, showPassword, setShowPassword, loading, error, onSubmit, onCancel }: PinFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">Mot de passe actuel</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none pr-10"
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nouveau PIN</label>
          <input
            type="password"
            value={formData.newPin}
            onChange={(e) => setFormData({ ...formData, newPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-center text-lg font-mono tracking-widest focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirmer PIN</label>
          <input
            type="password"
            value={formData.confirmPin}
            onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-center text-lg font-mono tracking-widest focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            required
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <LoadingSpinner size="sm" /> : <Check size={18} />}
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ==================== MAIN USER PROFILE COMPONENT ====================
export default function UserProfile() {
  const {
    user, loading,
    showPasswordModal, setShowPasswordModal,
    passwordData, setPasswordData,
    passwordError,
    updateField, handleChangePassword,
    getFullName, getRoleLabel, getInitials,
    canViewSalary, isCashier, reloadProfile
  } = useUserProfile();

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
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 pb-24">
      {/* HEADER : Résumé Rapide */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          {user.photoProfile ? (
            <img
              src={user.photoProfile}
              alt={getFullName()}
              className="w-16 h-16 rounded-full border-2 border-indigo-500 object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold border-2 border-indigo-400">
              {getInitials()}
            </div>
          )}
          <button className="absolute bottom-0 right-0 bg-slate-800 p-1.5 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors">
            <PenLine size={10} className="text-slate-300" />
          </button>
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{getFullName()}</h1>
          <div className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20 text-xs font-bold uppercase">
              {getRoleLabel(user.role)}
            </span>
            {user.agence && <span>• {user.agence}</span>}
          </div>
        </div>
      </div>

      {/* BENTO GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. CARTE IDENTITÉ (Editable) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 pb-3 border-b border-slate-800">
            <User size={20} className="text-indigo-400" />
            Informations Personnelles
          </h3>

          <div className="space-y-1">
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

          {/* Username (readonly) */}
          <div className="pt-3 border-t border-slate-800">
            <div className="flex items-center gap-3 p-3 bg-slate-950/50 rounded-xl">
              <div className="p-2 bg-slate-800 rounded-lg text-slate-500">
                <UserCircle size={18} />
              </div>
              <div>
                <div className="text-xs text-slate-500">Nom d'utilisateur</div>
                <div className="text-sm font-mono text-slate-300">@{user.username}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. CARTE RH (Locked par défaut) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 size={20} className="text-emerald-400" />
              Données RH
            </h3>
            <Lock size={14} className="text-slate-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ReadOnlyField label="Matricule" value={user.matricule} />
            <ReadOnlyField label="Date d'embauche" value={formatDate(user.dateEmbauche)} />
            <ReadOnlyField label="Département" value={user.departement} />
            <ReadOnlyField label="Poste" value={user.poste} />
            <ReadOnlyField label="Type de contrat" value={user.typeContrat} />
            <ReadOnlyField label="Membre depuis" value={formatDate(user.createdAt)} />
          </div>

          {/* Section Paie (Visible seulement si permission) */}
          {canViewSalary() && user.salaireBase !== undefined && (
            <div className="pt-4 border-t border-slate-800 mt-2">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1">
                <Lock size={10} /> Données Salariales
              </p>
              <ReadOnlyField label="Salaire Base" value={formatMoney(user.salaireBase)} highlight />
            </div>
          )}

          {/* Info si pas de données RH */}
          {!user.matricule && !user.poste && (
            <div className="bg-slate-800/30 rounded-xl p-4 flex items-start gap-3">
              <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500">
                Les données RH ne sont pas encore renseignées pour votre compte. Contactez l'administrateur si nécessaire.
              </p>
            </div>
          )}
        </div>

        {/* 3. CARTE SÉCURITÉ & PIN */}
        <div className="space-y-6">
          {/* Module Mot de Passe */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Shield size={20} className="text-rose-400" />
              Sécurité Compte
            </h3>
            <div className="flex justify-between items-center p-3 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <div className="text-sm font-medium text-white">Mot de passe</div>
                <div className="text-xs text-slate-500">Protégez votre compte</div>
              </div>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="text-sm text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1.5 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Changer
              </button>
            </div>
          </div>

          {/* Module PIN Caisse (Intelligent) */}
          {isCashier() && (
            <CaissePinManager
              hasPin={user.hasCaissePin}
              onPinConfigured={reloadProfile}
            />
          )}

          {/* Info si pas caissier */}
          {!isCashier() && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500">
                  Le PIN Caisse est réservé aux utilisateurs ayant des permissions de caisse (Caissiers, Superviseurs, Chefs d'Agence).
                </p>
              </div>
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
