import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Eye, EyeOff, Key, Upload, X, Users, Shield, User as UserIcon, Mail, Phone, Loader2 } from 'lucide-react';
import { Button, Modal, FormField, SelectField } from '../../ui';
import CameraCapture from '../../shared/CameraCapture';
import { toast } from '../../../lib/toast';
import { useMinIOUpload } from '../../../hooks/useMinIOUpload';
import { SystemRole, getRoleOptions, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';
import PasswordStrengthIndicator from '../../auth/PasswordStrengthIndicator';
import { useSecuritySettings } from '../../../hooks/settings/useSecuritySettings';
import { resolveStorageUrl } from '../../../lib/format';

interface User {
  id?: string;
  nom?: string;
  prenom?: string;
  username: string;
  password?: string;
  name?: string;
  email?: string;
  telephone?: string;
  phone?: string;
  role: SystemRole | string;
  statut: string;
  photoProfile?: string;
  photo_profile?: string;
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => Promise<void>;
  initialData?: User | null;
  loading?: boolean;
}

const roles = getRoleOptions().filter((role) => role.value !== SystemRole.CLIENT);
const statusOptions = [
  { value: StatutUser.ACTIVE, label: 'Actif' },
  { value: StatutUser.INACTIVE, label: 'Inactif' },
  { value: StatutUser.SUSPENDED, label: 'Suspendu' }
];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[\d\s().-]{6,20}$/;
const DEFAULT_PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

const normalizeRoleValue = (role?: string) => {
  return normalizeRole(role) || SystemRole.CAISSIER;
};

export default function UserFormModal({ isOpen, onClose, onSubmit, initialData, loading }: UserFormModalProps) {
  const [formData, setFormData] = useState<any>({
    username: '',
    password: '',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    role: SystemRole.CAISSIER,
    statut: StatutUser.ACTIVE,
    photoProfile: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { settings: securitySettings } = useSecuritySettings();

  const passwordRequirements = useMemo(() => {
    if (!securitySettings) return DEFAULT_PASSWORD_RULES;
    return {
      minLength: securitySettings.password_min_length ?? DEFAULT_PASSWORD_RULES.minLength,
      requireUppercase: securitySettings.password_require_uppercase ?? DEFAULT_PASSWORD_RULES.requireUppercase,
      requireLowercase: securitySettings.password_require_lowercase ?? DEFAULT_PASSWORD_RULES.requireLowercase,
      requireNumbers: securitySettings.password_require_numbers ?? DEFAULT_PASSWORD_RULES.requireNumbers,
      requireSpecialChars: securitySettings.password_require_special ?? DEFAULT_PASSWORD_RULES.requireSpecialChars,
    };
  }, [securitySettings]);

  const { uploadFile, isUploading } = useMinIOUpload({
    path: 'profiles',
    isPublic: true,
    onError: (err: any) => toast.error(`Erreur upload: ${err.message}`)
  });

  const splitFullName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return { prenom: '', nom: '' };
    }
    if (parts.length === 1) {
      return { prenom: '', nom: parts[0] };
    }
    return {
      prenom: parts[0],
      nom: parts.slice(1).join(' ')
    };
  };

  const resolveInitialNames = (data?: User | null) => {
    const nom = data?.nom || '';
    const prenom = data?.prenom || '';
    if (nom || prenom) {
      return { nom, prenom };
    }
    if (data?.name) {
      return splitFullName(data.name);
    }
    return { nom: '', prenom: '' };
  };

  const resolveProfileUrl = resolveStorageUrl;

  useEffect(() => {
    if (initialData) {
      const resolvedNames = resolveInitialNames(initialData);
      setFormData({
        username: initialData.username || '',
        password: '',
        nom: resolvedNames.nom,
        prenom: resolvedNames.prenom,
        email: initialData.email || '',
        telephone: initialData.telephone || initialData.phone || '',
        role: normalizeRoleValue(initialData.role),
        statut: initialData.statut || StatutUser.ACTIVE,
        photoProfile: initialData.photoProfile || initialData.photo_profile || ''
      });
      setErrors({});
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      nom: '',
      prenom: '',
      email: '',
      telephone: '',
      role: SystemRole.CAISSIER,
      statut: StatutUser.ACTIVE,
      photoProfile: ''
    });
    setShowPassword(false);
    setErrors({});
  };

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const validatePasswordValue = (value: string) => {
    const validationErrors: string[] = [];
    if (value.length < passwordRequirements.minLength) {
      validationErrors.push(`Le mot de passe doit contenir au moins ${passwordRequirements.minLength} caractères`);
    }
    if (passwordRequirements.requireUppercase && !/[A-Z]/.test(value)) {
      validationErrors.push('Le mot de passe doit contenir au moins une majuscule');
    }
    if (passwordRequirements.requireLowercase && !/[a-z]/.test(value)) {
      validationErrors.push('Le mot de passe doit contenir au moins une minuscule');
    }
    if (passwordRequirements.requireNumbers && !/[0-9]/.test(value)) {
      validationErrors.push('Le mot de passe doit contenir au moins un chiffre');
    }
    if (passwordRequirements.requireSpecialChars && !/[@$!%*?&]/.test(value)) {
      validationErrors.push('Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&)');
    }
    return validationErrors;
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Helper function to generate username from name (format: p.nom) - fallback local
  const generateUsernameLocal = (nom: string, prenom: string): string => {
    // Remove accents and special characters
    const normalizedNom = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedPrenom = prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cleanNom = normalizedNom.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPrenom = normalizedPrenom.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanNom) return '';
    if (!cleanPrenom) return cleanNom;
    return `${cleanPrenom.charAt(0)}.${cleanNom}`;
  };

  // Generate unique username via backend API
  const generateUniqueUsername = async (fullName: string, fallbackNom: string, fallbackPrenom: string): Promise<string> => {
    try {
      setUsernameChecking(true);
      const response = await fetch(`/api/employes/check-username?fullName=${encodeURIComponent(fullName)}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setUsernameAvailable(data.available);
        return data.username;
      }
    } catch (err: any) {
      console.error('Erreur chargement user:', err);
    } finally {
      setUsernameChecking(false);
    }
    // Fallback to local generation
    return generateUsernameLocal(fallbackNom, fallbackPrenom);
  };

  // Auto-generate unique username when name changes (for new users only)
  useEffect(() => {
    if (!initialData && (formData.nom || formData.prenom)) {
      const fullName = `${formData.prenom || ''} ${formData.nom || ''}`.trim();
      if (!fullName) return;
      // Debounce the API call
      const timer = setTimeout(async () => {
        const suggested = await generateUniqueUsername(fullName, formData.nom, formData.prenom);
        if (suggested && suggested !== formData.username) {
          updateField('username', suggested);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.nom, formData.prenom, initialData]);

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    updateField('password', password);
    setShowPassword(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.warning('La taille du fichier ne doit pas dépasser 5 Mo');
      return;
    }

    try {
      const url = await uploadFile(file);
      if (url) {
        updateField('photoProfile', url);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  // Convert Base64 from camera to File and upload
  const handleCameraCapture = async (imgBase64: string) => {
    try {
      const res = await fetch(imgBase64);
      const blob = await res.blob();
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      const url = await uploadFile(file);
      if (url) {
        updateField('photoProfile', url);
        setShowCamera(false);
      }
    } catch (error) {
      console.error('Camera upload failed:', error);
      toast.error('Erreur lors de l\'upload de la photo');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const nextErrors: Record<string, string> = {};
    if (!formData.nom?.trim()) {
      nextErrors.nom = 'Le nom est requis';
    }
    if (!formData.username?.trim()) {
      nextErrors.username = 'L\'identifiant est requis';
    }
    if (formData.email && !EMAIL_REGEX.test(formData.email)) {
      nextErrors.email = 'Email invalide';
    }
    if (formData.telephone && !PHONE_REGEX.test(formData.telephone)) {
      nextErrors.telephone = 'Numero de telephone invalide';
    }
    if (!initialData && !formData.password) {
      nextErrors.password = 'Le mot de passe est requis';
    }
    if (formData.password) {
      const passwordErrors = validatePasswordValue(formData.password);
      if (passwordErrors.length > 0) {
        nextErrors.password = passwordErrors[0];
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error('Veuillez corriger les erreurs du formulaire');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        username: formData.username.trim(),
        nom: formData.nom.trim(),
        prenom: formData.prenom?.trim() || '',
        email: formData.email?.trim() || '',
        telephone: formData.telephone?.trim() || '',
        role: formData.role,
        statut: formData.statut,
        photoProfile: formData.photoProfile || ''
      };

      if (formData.password && formData.password.trim()) {
        payload.password = formData.password;
      }

      await onSubmit(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={initialData ? 'Modifier Profil' : 'Nouveau Compte'}
        size="lg"
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Photo Section - Centered & Compact */}
          <div className="flex flex-col items-center justify-center -mt-2 mb-6">
            <div className="relative group">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-surface-muted overflow-hidden shadow-lg bg-surface-muted flex items-center justify-center">
                {isUploading ? (
                  <Loader2 className="animate-spin text-primary" size={32} />
                ) : formData.photoProfile ? (
                   <img
                     src={resolveProfileUrl(formData.photoProfile)}
                     onError={(e) => {
                       // Fallback if URL fails (e.g. key only)
                       // If we stored just the key, we need to construct the public URL or use a proxy endpoint
                       // But the new service returns full URL if isPublic=true
                       const nameFallback = `${formData.prenom || ''} ${formData.nom || ''}`.trim();
                       (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameFallback || formData.username || 'User')}`;
                     }}
                     alt="Profil"
                     className="w-full h-full object-cover"
                   />
                ) : (
                  <Users size={40} className="text-content-muted" />
                )}
              </div>
              
              {/* Overlay Actions */}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1.5 flex justify-center gap-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200 rounded-b-full">
                 <button 
                   type="button"
                   onClick={() => setShowCamera(true)}
                   className="text-white hover:text-primary transition-colors p-1"
                   title="Prendre une photo"
                   disabled={isUploading}
                 >
                   <Camera size={16} />
                 </button>
                 <button 
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                   className="text-white hover:text-primary transition-colors p-1"
                   title="Importer"
                   disabled={isUploading}
                 >
                   <Upload size={16} />
                 </button>
                 {formData.photoProfile && !isUploading && (
                    <button 
                     type="button"
                     onClick={() => updateField('photoProfile', '')}
                     className="text-white hover:text-danger transition-colors p-1"
                     title="Supprimer"
                   >
                     <X size={16} />
                   </button>
                 )}
              </div>
               
               {/* Mobile visible edit button if hover not available */}
               <button
                 type="button"
                 onClick={() => fileInputRef.current?.click()}
                 className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full shadow-lg border-2 border-surface-base sm:hidden"
               >
                 <Camera size={14} />
               </button>
            </div>
            <input
               ref={fileInputRef}
               type="file"
               accept="image/*"
               onChange={handleFileUpload}
               className="hidden"
             />
          </div>

          <div className="space-y-4">
             {/* Identity Section */}
             <div className="bg-surface-muted/30 p-3 sm:p-4 rounded-xl border border-edge space-y-3">
               <div className="flex items-center gap-2 text-primary font-semibold text-xs uppercase tracking-wider mb-1">
                 <UserIcon size={14} /> <span>Identité</span>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <FormField
                   label="Prenom"
                   name="prenom"
                   value={formData.prenom}
                   onChange={(e) => updateField('prenom', e.target.value)}
                   className="bg-surface-base"
                 />
                 <FormField
                   label="Nom"
                   name="nom"
                   value={formData.nom}
                   onChange={(e) => updateField('nom', e.target.value)}
                   required
                   error={errors.nom}
                   className="bg-surface-base"
                 />
                 <div className="relative">
                   <FormField
                     label="Identifiant"
                   name="username"
                   value={formData.username}
                   onChange={(e) => {
                       updateField('username', e.target.value);
                       setUsernameAvailable(null); // Reset on manual edit
                    }}
                    className="bg-surface-base font-mono"
                    required
                    error={errors.username}
                  />
                   {usernameChecking && (
                     <div className="absolute right-2 top-8 text-xs text-slate-400">
                       Vérification...
                     </div>
                   )}
                   {!usernameChecking && usernameAvailable === true && formData.username && (
                     <div className="absolute right-2 top-8 text-xs text-green-400">
                       ✓ Disponible
                     </div>
                   )}
                 </div>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <FormField
                   label="Email"
                   name="email"
                   type="email"
                   value={formData.email}
                   onChange={(e) => updateField('email', e.target.value)}
                   error={errors.email}
                   className="bg-surface-base"
                   icon={Mail}
                 />
                  <FormField
                   label="Téléphone"
                   name="telephone"
                   type="tel"
                   value={formData.telephone}
                   onChange={(e) => updateField('telephone', e.target.value)}
                   error={errors.telephone}
                   className="bg-surface-base"
                   icon={Phone}
                 />
               </div>
             </div>

             {/* Security Section */}
             <div className="bg-surface-muted/30 p-3 sm:p-4 rounded-xl border border-edge space-y-3">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs uppercase tracking-wider mb-1">
                 <Shield size={14} /> <span>Sécurité & Accès</span>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <SelectField
                    label="Rôle"
                    name="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as SystemRole })}
                    options={roles}
                    required
                    containerClassName="mt-0"
                    className="bg-slate-800 border-slate-700 text-white focus:border-primary focus:ring-primary/20"
                 />
                 <SelectField
                    label="Statut"
                    name="statut"
                    value={formData.statut}
                    onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                    options={statusOptions}
                    containerClassName="mt-0"
                    className="bg-slate-800 border-slate-700 text-white focus:border-primary focus:ring-primary/20"
                 />
               </div>

                <div className="flex gap-2 items-end">
                   <div className="flex-1">
                     <FormField
                       label={!initialData ? 'Mot de passe' : 'Nouveau mot de passe'}
                       name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    error={errors.password}
                    containerClassName="mt-0"
                    rightIcon={showPassword ? EyeOff : Eye}
                    onRightIconClick={() => setShowPassword(!showPassword)}
                    required={!initialData}
                    className="bg-surface-base"
                  />
                   </div>
                   <Button 
                      variant="secondary" 
                      onClick={generatePassword} 
                      type="button" 
                      icon={Key} 
                      className="!py-2 sm:!py-2.5 mb-[1px]"
                      title="Générer un mot de passe fort"
                   >
                     Générer
                   </Button>
                </div>
                {formData.password && (
                  <div className="mt-3">
                    <PasswordStrengthIndicator
                      password={formData.password}
                      requirements={{
                        min_length: passwordRequirements.minLength,
                        require_uppercase: passwordRequirements.requireUppercase,
                        require_lowercase: passwordRequirements.requireLowercase,
                        require_numbers: passwordRequirements.requireNumbers,
                        require_special_chars: passwordRequirements.requireSpecialChars,
                      }}
                    />
                  </div>
                )}
             </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Annuler</Button>
            <Button variant="primary" type="submit" disabled={loading || saving} className="px-6">
              {loading || saving ? 'Enregistrement...' : (initialData ? 'Enregistrer' : 'Créer Compte')}
            </Button>
          </div>
        </form>
      </Modal>

      <CameraCapture
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />
    </>
  );
}
