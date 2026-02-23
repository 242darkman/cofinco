import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Camera, Eye, EyeOff, Key, Upload, X, Users, Shield, Info,
  User as UserIcon, Mail, Phone, Loader2, CheckCircle2, XCircle,
  AlertCircle, ChevronLeft, ChevronRight, Briefcase, Check, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraCapture from '../../shared/CameraCapture';
import { toast } from '../../../lib/toast';
import { useEntityUpload } from '../../../hooks/useEntityUpload';
import { SystemRole, getRoleOptions } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';
import PasswordStrengthIndicator from '../../auth/PasswordStrengthIndicator';
import { useSecuritySettings } from '../../../hooks/settings/useSecuritySettings';
import { resolveStorageUrl, formatPhoneInput, stripPhoneFormat } from '../../../lib/format';
import { getRoleBadgeStyle } from '../../../lib/role-utils';

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

interface ValidationState {
  checking: boolean;
  available: boolean | null;
  message?: string;
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

const resolveRoleValue = (role?: string) => {
  return (role as SystemRole) || SystemRole.CAISSIER;
};

const INPUT_CLASS = 'w-full h-10 sm:h-11 px-3 sm:px-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all';

const getStatusChipClass = (value: string, isSelected: boolean) => {
  if (!isSelected) return 'bg-surface-muted border-edge text-content-muted hover:border-content-muted';
  switch (value) {
    case StatutUser.ACTIVE: return 'bg-status-success/15 text-status-success border-status-success/30 ring-1 ring-status-success/20 shadow-sm';
    case StatutUser.INACTIVE: return 'bg-status-danger/15 text-status-danger border-status-danger/30 ring-1 ring-status-danger/20 shadow-sm';
    case StatutUser.SUSPENDED: return 'bg-status-warning/15 text-status-warning border-status-warning/30 ring-1 ring-status-warning/20 shadow-sm';
    default: return 'bg-surface-muted border-edge text-content-muted';
  }
};

const getStatusTextColor = (value: string) => {
  switch (value) {
    case StatutUser.ACTIVE: return 'text-status-success';
    case StatutUser.INACTIVE: return 'text-status-danger';
    case StatutUser.SUSPENDED: return 'text-status-warning';
    default: return 'text-content-primary';
  }
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

  // Stepper state
  const [step, setStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);

  // Role management for edit mode
  const [userCurrentRoles, setUserCurrentRoles] = useState<Array<{ id: string; role: string; agenceId: string | null; isPrimary: boolean }>>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const passwordRequirements = useMemo(() => {
    if (!securitySettings) return DEFAULT_PASSWORD_RULES;
    return {
      minLength: securitySettings.passwordMinLength ?? DEFAULT_PASSWORD_RULES.minLength,
      requireUppercase: securitySettings.passwordRequireUppercase ?? DEFAULT_PASSWORD_RULES.requireUppercase,
      requireLowercase: securitySettings.passwordRequireLowercase ?? DEFAULT_PASSWORD_RULES.requireLowercase,
      requireNumbers: securitySettings.passwordRequireNumbers ?? DEFAULT_PASSWORD_RULES.requireNumbers,
      requireSpecialChars: securitySettings.passwordRequireSpecial ?? DEFAULT_PASSWORD_RULES.requireSpecialChars,
    };
  }, [securitySettings]);

  const tempUserIdRef = useRef(crypto.randomUUID());
  const { uploadFile, isUploading } = useEntityUpload({
    fileType: 'profile',
    entityType: 'user',
    entityId: initialData?.id || tempUserIdRef.current,
    onError: (err: any) => toast.error(`Erreur upload: ${err.message}`)
  });

  const splitFullName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { prenom: '', nom: '' };
    if (parts.length === 1) return { prenom: '', nom: parts[0] };
    return { prenom: parts[0], nom: parts.slice(1).join(' ') };
  };

  const resolveInitialNames = (data?: User | null) => {
    const nom = data?.nom || '';
    const prenom = data?.prenom || '';
    if (nom || prenom) return { nom, prenom };
    if (data?.name) return splitFullName(data.name);
    return { nom: '', prenom: '' };
  };

  useEffect(() => {
    if (initialData) {
      const resolvedNames = resolveInitialNames(initialData);
      setFormData({
        username: initialData.username || '',
        password: '',
        nom: resolvedNames.nom,
        prenom: resolvedNames.prenom,
        email: initialData.email || '',
        telephone: initialData.telephone || '',
        role: resolveRoleValue(initialData.role),
        statut: initialData.statut || StatutUser.ACTIVE,
        photoProfile: initialData.photoProfile || ''
      });
      setErrors({});
      setStep(1);
      setShowSuccess(false);
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
    setStep(1);
    setShowSuccess(false);
  };

  const [usernameValidation, setUsernameValidation] = useState<ValidationState>({
    checking: false,
    available: null,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const generateUsernameLocal = (nom: string, prenom: string): string => {
    const normalizedNom = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedPrenom = prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cleanNom = normalizedNom.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPrenom = normalizedPrenom.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanNom) return '';
    if (!cleanPrenom) return cleanNom;
    return `${cleanPrenom.charAt(0)}.${cleanNom}`;
  };

  const generateUniqueUsername = async (fullName: string, fallbackNom: string, fallbackPrenom: string): Promise<string> => {
    try {
      setUsernameValidation(prev => ({ ...prev, checking: true }));
      const response = await fetch(`/api/employes/check-username?fullName=${encodeURIComponent(fullName)}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setUsernameValidation({
          checking: false,
          available: data.available,
          message: data.available ? undefined : data.message,
        });
        return data.username;
      }
    } catch (err: any) {
      console.error('Erreur chargement user:', err);
    } finally {
      setUsernameValidation(prev => ({ ...prev, checking: false }));
    }
    return generateUsernameLocal(fallbackNom, fallbackPrenom);
  };

  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (!username || username.length < 2) {
      setUsernameValidation({ checking: false, available: null });
      return;
    }
    if (usernameCheckRef.current) {
      clearTimeout(usernameCheckRef.current);
    }
    setUsernameValidation(prev => ({ ...prev, checking: true }));
    usernameCheckRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/employes/check-username?username=${encodeURIComponent(username)}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          const isOwnUsername = initialData?.id && !data.available;
          setUsernameValidation({
            checking: false,
            available: data.available || isOwnUsername,
            message: data.available ? undefined : (isOwnUsername ? undefined : data.message),
          });
        } else {
          setUsernameValidation({ checking: false, available: null });
        }
      } catch {
        setUsernameValidation({ checking: false, available: null });
      }
    }, 400);
  }, [initialData?.id]);

  // Auto-generate unique username when name changes (new users only)
  useEffect(() => {
    if (!initialData && (formData.nom || formData.prenom)) {
      const fullName = `${formData.prenom || ''} ${formData.nom || ''}`.trim();
      if (!fullName) return;
      const timer = setTimeout(async () => {
        const suggested = await generateUniqueUsername(fullName, formData.nom, formData.prenom);
        if (suggested && suggested !== formData.username) {
          updateField('username', suggested);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.nom, formData.prenom, initialData]);

  useEffect(() => {
    return () => {
      if (usernameCheckRef.current) {
        clearTimeout(usernameCheckRef.current);
      }
    };
  }, []);

  const generatePassword = () => {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '@$!%*?&';
    const minLength = Math.max(passwordRequirements.minLength, 12);
    const allChars = lowercase + uppercase + numbers + special;
    const secureChar = (chars: string) => {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return chars.charAt(array[0] % chars.length);
    };
    const chars: string[] = [];
    if (passwordRequirements.requireLowercase) chars.push(secureChar(lowercase));
    if (passwordRequirements.requireUppercase) chars.push(secureChar(uppercase));
    if (passwordRequirements.requireNumbers) chars.push(secureChar(numbers));
    if (passwordRequirements.requireSpecialChars) chars.push(secureChar(special));
    while (chars.length < minLength) chars.push(secureChar(allChars));
    for (let i = chars.length - 1; i > 0; i--) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const j = array[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    updateField('password', chars.join(''));
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
      if (url) updateField('photoProfile', url);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

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

  // ─── Role management (edit mode) ─────────────────────

  const fetchUserRoles = useCallback(async (userId: string) => {
    setLoadingRoles(true);
    try {
      const res = await fetch(`/api/users/${userId}/roles`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUserCurrentRoles(data);
      }
    } catch (err) {
      console.error('Erreur chargement rôles:', err);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && initialData?.id) {
      fetchUserRoles(initialData.id);
    } else {
      setUserCurrentRoles([]);
    }
  }, [isOpen, initialData?.id, fetchUserRoles]);

  const addRoleToUser = useCallback(async (role: SystemRole) => {
    if (!initialData?.id) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/users/${initialData.id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, isPrimary: userCurrentRoles.length === 0 }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erreur ajout rôle');
      } else {
        toast.success('Rôle ajouté');
        await fetchUserRoles(initialData.id);
      }
    } catch {
      toast.error('Erreur ajout rôle');
    } finally {
      setSavingRole(false);
    }
  }, [initialData?.id, userCurrentRoles.length, fetchUserRoles]);

  const removeRoleFromUser = useCallback(async (roleId: string) => {
    if (!initialData?.id) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/users/${initialData.id}/roles/${roleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erreur retrait rôle');
      } else {
        toast.success('Rôle retiré');
        await fetchUserRoles(initialData.id);
      }
    } catch {
      toast.error('Erreur retrait rôle');
    } finally {
      setSavingRole(false);
    }
  }, [initialData?.id, fetchUserRoles]);

  // ─── Step validation ─────────────────────────────────

  const isStepValid = (s: number): boolean => {
    switch (s) {
      case 1:
        return formData.nom?.trim().length > 0;
      case 2:
        // Pure client → read-only, always valid
        // Client+employee → roles managed via API, always valid
        // Single role select → require a role
        if (initialData && userCurrentRoles.length > 0) {
          const clientOnly = userCurrentRoles.every(ur => ur.role === SystemRole.CLIENT || ur.role === 'client');
          const hasEmployeeRole = userCurrentRoles.some(ur => ur.role !== SystemRole.CLIENT && ur.role !== 'client');
          if (clientOnly || hasEmployeeRole) return true;
        }
        return !!formData.role;
      case 3:
        if (initialData) return true; // password optional in edit mode
        if (!formData.password) return false;
        return validatePasswordValue(formData.password).length === 0;
      default:
        return true;
    }
  };

  const isAllValid = isStepValid(1) && isStepValid(2) && isStepValid(3);

  // ─── Submit ──────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitError(null);
    const nextErrors: Record<string, string> = {};
    const trimmedNom = formData.nom?.trim() || '';
    const trimmedUsername = formData.username?.trim().toLowerCase() || '';
    const trimmedEmail = formData.email?.trim().toLowerCase() || '';
    const trimmedTelephone = formData.telephone?.trim().replace(/\s+/g, '') || '';
    const trimmedPrenom = formData.prenom?.trim() || '';

    if (!trimmedNom) nextErrors.nom = 'Le nom est requis';
    if (!trimmedUsername) {
      nextErrors.username = 'L\'identifiant est requis';
    } else if (trimmedUsername.length < 3) {
      nextErrors.username = 'L\'identifiant doit contenir au moins 3 caractères';
    } else if (!/^[a-z0-9._-]+$/.test(trimmedUsername)) {
      nextErrors.username = 'L\'identifiant ne peut contenir que des lettres, chiffres, points, tirets et underscores';
    }
    if (usernameValidation.available === false && !usernameValidation.checking) {
      const isOwnUsername = initialData?.username?.toLowerCase() === trimmedUsername;
      if (!isOwnUsername) nextErrors.username = 'Cet identifiant est déjà utilisé';
    }
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) nextErrors.email = 'Email invalide';
    if (trimmedTelephone && !PHONE_REGEX.test(trimmedTelephone)) nextErrors.telephone = 'Numéro de téléphone invalide';
    if (!initialData && !formData.password) nextErrors.password = 'Le mot de passe est requis';
    if (formData.password) {
      const passwordErrors = validatePasswordValue(formData.password);
      if (passwordErrors.length > 0) nextErrors.password = passwordErrors[0];
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (nextErrors.nom || nextErrors.username || nextErrors.email || nextErrors.telephone) setStep(1);
      else if (nextErrors.password) setStep(3);
      toast.error('Veuillez corriger les erreurs du formulaire');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        username: trimmedUsername,
        nom: trimmedNom,
        prenom: trimmedPrenom,
        email: trimmedEmail || null,
        telephone: trimmedTelephone || null,
        role: formData.role,
        statut: formData.statut,
        photoProfile: formData.photoProfile || null,
        ...(initialData ? {} : { tempEntityId: tempUserIdRef.current }),
      };
      if (formData.password && formData.password.trim()) {
        payload.password = formData.password;
      }

      await onSubmit(payload);

      // Show success animation
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setStep(1);
        resetForm();
        onClose();
      }, 2000);
    } catch (error: any) {
      const message = error?.message || error?.error || 'Une erreur est survenue';
      if (message.toLowerCase().includes('username') || message.toLowerCase().includes('identifiant')) {
        setErrors(prev => ({ ...prev, username: message }));
        setStep(1);
      } else if (message.toLowerCase().includes('email')) {
        setErrors(prev => ({ ...prev, email: message }));
        setStep(1);
      } else if (message.toLowerCase().includes('password') || message.toLowerCase().includes('mot de passe')) {
        setErrors(prev => ({ ...prev, password: message }));
        setStep(3);
      } else {
        setSubmitError(message);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setShowSuccess(false);
    setErrors({});
    setSubmitError(null);
    onClose();
  };

  // ─── Computed values ─────────────────────────────────

  // Role display logic:
  // - Pure client (only CLIENT role) → read-only, must become employee first
  // - Client + employee (CLIENT + other roles) → multi-role toggle via API
  // - Pure employee or create mode → single role select
  const isClientOnly = !!initialData && userCurrentRoles.length > 0 && userCurrentRoles.every(ur => ur.role === SystemRole.CLIENT || ur.role === 'client');
  const isClientAndEmployee = !!initialData && userCurrentRoles.some(ur => ur.role === SystemRole.CLIENT || ur.role === 'client') && userCurrentRoles.some(ur => ur.role !== SystemRole.CLIENT && ur.role !== 'client');
  const showMultiRoleToggle = isClientAndEmployee;

  const displayRoles = showMultiRoleToggle
    ? userCurrentRoles.map(r => r.role)
    : isClientOnly
      ? [SystemRole.CLIENT]
      : [formData.role].filter(Boolean);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
        <div className="bg-surface-base rounded-xl sm:rounded-2xl border border-edge w-full max-w-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">

          {/* HEADER — Title + Stepper */}
          <div className="bg-surface-base border-b border-edge px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
            <div className="flex justify-between items-center mb-4 sm:mb-5">
              <h2 className="text-lg sm:text-xl font-bold text-content-primary">
                {initialData ? 'Modifier Profil' : 'Nouveau Compte'}
              </h2>
              <button
                onClick={handleClose}
                className="p-1 text-content-muted hover:text-content-primary transition-colors"
              >
                <XCircle className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="flex justify-between relative px-2 sm:px-8">
              <div className="absolute top-1/2 left-2 right-2 sm:left-8 sm:right-8 h-0.5 bg-surface -z-0" />
              <FormStepItem num={1} icon={UserIcon} label="Identité" current={step} />
              <FormStepItem num={2} icon={Briefcase} label="Accès" current={step} />
              <FormStepItem num={3} icon={Shield} label="Sécurité" current={step} />
            </div>
          </div>

          {/* BODY */}
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
            <AnimatePresence mode="wait">
              {showSuccess ? (
                <motion.div
                  key="success"
                  className="py-12 sm:py-16 flex flex-col items-center justify-center relative"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <FormSuccessParticles />
                  <FormAnimatedCheckmark />
                  <motion.p
                    className="mt-6 text-lg font-bold text-status-success"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    {initialData ? 'Profil modifié !' : 'Compte créé'}
                  </motion.p>
                  <motion.p
                    className="mt-1.5 text-sm text-content-muted text-center px-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                  >
                    {initialData
                      ? 'Les modifications ont été enregistrées'
                      : `${formData.prenom} ${formData.nom} peut maintenant se connecter`
                    }
                  </motion.p>
                </motion.div>
              ) : (
                <motion.div
                  key={`step-${step}`}
                  className="p-4 sm:p-6 space-y-5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  {/* STEP 1 — Identité */}
                  {step === 1 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                          <UserIcon size={14} className="text-accent" />
                        </div>
                        <h4 className="text-sm font-bold text-content-primary">Informations Personnelles</h4>
                      </div>

                      {/* Photo */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="relative group">
                          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-surface-muted overflow-hidden shadow-lg bg-surface-muted flex items-center justify-center relative">
                            {isUploading && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                                <Loader2 className="w-6 h-6 text-accent animate-spin" />
                              </div>
                            )}
                            {formData.photoProfile ? (
                              <img
                                src={resolveStorageUrl(formData.photoProfile)}
                                onError={(e) => {
                                  const name = `${formData.prenom || ''} ${formData.nom || ''}`.trim();
                                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || formData.username || 'User')}`;
                                }}
                                alt="Profil"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Users size={32} className="text-content-muted opacity-50" />
                            )}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1.5 flex justify-center gap-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200 rounded-b-full z-20">
                            <button type="button" onClick={() => setShowCamera(true)} className="text-content-primary hover:text-accent transition-colors p-1" title="Prendre une photo" disabled={isUploading}>
                              <Camera size={14} />
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-content-primary hover:text-accent transition-colors p-1" title="Importer" disabled={isUploading}>
                              <Upload size={14} />
                            </button>
                            {formData.photoProfile && !isUploading && (
                              <button type="button" onClick={() => updateField('photoProfile', '')} className="text-content-primary hover:text-status-danger transition-colors p-1" title="Supprimer">
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          {/* Mobile edit button */}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-0 right-0 bg-accent text-white p-1.5 rounded-full shadow-lg border-2 border-surface-base sm:hidden"
                          >
                            <Camera size={14} />
                          </button>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                        <p className="text-[10px] text-content-muted mt-2">Photo optionnelle (max 5Mo)</p>
                      </div>

                      {/* Prénom / Nom */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">
                            Prénom <span className="text-status-danger">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.prenom}
                            onChange={(e) => updateField('prenom', e.target.value)}
                            placeholder="Ex: Patrick"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">
                            Nom <span className="text-status-danger">*</span>
                          </label>
                          <input
                            type="text"
                            value={formData.nom}
                            onChange={(e) => updateField('nom', e.target.value)}
                            placeholder="Ex: Mbemba"
                            className={`${INPUT_CLASS} ${errors.nom ? 'border-status-danger focus:ring-status-danger' : ''}`}
                          />
                          {errors.nom && <p className="text-[10px] text-status-danger">{errors.nom}</p>}
                        </div>
                      </div>

                      {/* Identifiant */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">
                          Identifiant
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.username}
                            onChange={(e) => {
                              const value = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
                              updateField('username', value);
                              checkUsernameAvailability(value);
                            }}
                            placeholder="ex: p.nom"
                            className={`${INPUT_CLASS} font-mono pr-28 ${errors.username ? 'border-status-danger focus:ring-status-danger' : ''}`}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {usernameValidation.checking && (
                              <span className="text-[10px] text-content-muted flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" /> Vérification...
                              </span>
                            )}
                            {!usernameValidation.checking && usernameValidation.available === true && formData.username && (
                              <span className="text-[10px] text-status-success flex items-center gap-1">
                                <CheckCircle2 size={12} /> Disponible
                              </span>
                            )}
                            {!usernameValidation.checking && usernameValidation.available === false && formData.username && (
                              <span className="text-[10px] text-status-danger flex items-center gap-1">
                                <XCircle size={12} /> Déjà utilisé
                              </span>
                            )}
                          </div>
                        </div>
                        {errors.username && <p className="text-[10px] text-status-danger">{errors.username}</p>}
                        {!initialData && <p className="text-[10px] text-content-muted">Généré automatiquement à partir du nom</p>}
                      </div>

                      {/* Email / Téléphone */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Email</label>
                          <div className="relative">
                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                            <input
                              type="email"
                              value={formData.email}
                              onChange={(e) => updateField('email', e.target.value)}
                              placeholder="email@exemple.com"
                              className={`${INPUT_CLASS} pl-9 ${errors.email ? 'border-status-danger focus:ring-status-danger' : ''}`}
                            />
                          </div>
                          {errors.email && <p className="text-[10px] text-status-danger">{errors.email}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Téléphone</label>
                          <div className="relative">
                            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                            <input
                              type="tel"
                              value={formatPhoneInput(formData.telephone || '')}
                              onChange={(e) => updateField('telephone', stripPhoneFormat(e.target.value))}
                              placeholder="+242 06 XXX XX XX"
                              className={`${INPUT_CLASS} pl-9 ${errors.telephone ? 'border-status-danger focus:ring-status-danger' : ''}`}
                            />
                          </div>
                          {errors.telephone && <p className="text-[10px] text-status-danger">{errors.telephone}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 — Accès */}
                  {step === 2 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Briefcase size={14} className="text-accent" />
                        </div>
                        <h4 className="text-sm font-bold text-content-primary">Rôle & Accès</h4>
                      </div>

                      {/* Roles */}
                      <div className="space-y-2">
                        <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">
                          {showMultiRoleToggle ? (
                            <>
                              Rôles{' '}
                              {!loadingRoles && (
                                <span className="text-[10px] font-normal text-accent normal-case ml-1">
                                  {userCurrentRoles.length} actif{userCurrentRoles.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </>
                          ) : isClientOnly ? (
                            <>Rôle</>
                          ) : (
                            <>Rôle <span className="text-status-danger">*</span></>
                          )}
                        </label>

                        {loadingRoles && initialData ? (
                          <div className="flex items-center gap-2 py-4">
                            <Loader2 size={14} className="animate-spin text-accent" />
                            <span className="text-xs text-content-muted">Chargement des rôles...</span>
                          </div>
                        ) : isClientOnly ? (
                          /* Pure client — read-only badge + info */
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              {(() => {
                                const badge = getRoleBadgeStyle(SystemRole.CLIENT);
                                return (
                                  <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border ${badge.classes}`}>
                                    <CheckCircle2 size={13} />
                                    {badge.label}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-status-info-bg/40 border border-status-info/15">
                              <Info size={14} className="text-status-info shrink-0 mt-0.5" />
                              <p className="text-[11px] text-content-secondary leading-relaxed">
                                Ce compte est uniquement client. Pour modifier les rôles, l'utilisateur doit d'abord être rattaché comme employé dans le module RH.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {roles.map((role) => {
                              const isSelected = showMultiRoleToggle
                                ? !!userCurrentRoles.find(ur => ur.role === role.value)
                                : formData.role === role.value;
                              const existing = showMultiRoleToggle ? userCurrentRoles.find(ur => ur.role === role.value) : null;
                              const badge = getRoleBadgeStyle(role.value);
                              return (
                                <button
                                  key={role.value}
                                  type="button"
                                  disabled={savingRole}
                                  onClick={() => {
                                    if (showMultiRoleToggle) {
                                      if (isSelected && existing) {
                                        removeRoleFromUser(existing.id);
                                      } else {
                                        addRoleToUser(role.value as SystemRole);
                                      }
                                    } else {
                                      updateField('role', role.value);
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all disabled:opacity-50 ${
                                    isSelected
                                      ? `${badge.classes} ring-1 ring-current/20 shadow-sm scale-[1.02]`
                                      : 'bg-surface-muted border-edge text-content-muted hover:border-content-muted hover:text-content-secondary'
                                  }`}
                                >
                                  {isSelected && <CheckCircle2 size={13} />}
                                  {role.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {showMultiRoleToggle && (
                          <p className="text-[10px] text-content-muted">Cliquez pour activer ou retirer un rôle. Les modifications sont appliquées immédiatement.</p>
                        )}
                        {!showMultiRoleToggle && !isClientOnly && !formData.role && (
                          <p className="text-[10px] text-status-danger">Sélectionnez un rôle</p>
                        )}
                      </div>

                      {/* Status - edit mode only */}
                      {initialData && (
                        <>
                          <div className="border-t border-edge/50" />
                          <div className="space-y-2">
                            <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">Statut du compte</label>
                            <div className="flex flex-wrap gap-2">
                              {statusOptions.map((s) => {
                                const isSelected = formData.statut === s.value;
                                return (
                                  <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => updateField('statut', s.value)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${getStatusChipClass(s.value, isSelected)}`}
                                  >
                                    {isSelected && <CheckCircle2 size={13} />}
                                    {s.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* STEP 3 — Sécurité */}
                  {step === 3 && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Shield size={14} className="text-accent" />
                        </div>
                        <h4 className="text-sm font-bold text-content-primary">
                          {initialData ? 'Modifier le mot de passe' : 'Mot de Passe'}
                        </h4>
                      </div>

                      {initialData && (
                        <div className="p-3 bg-status-info-bg/40 border border-status-info/15 rounded-xl">
                          <p className="text-xs text-status-info flex items-center gap-2">
                            <AlertCircle size={14} className="shrink-0" />
                            Laissez vide pour conserver le mot de passe actuel
                          </p>
                        </div>
                      )}

                      {/* Password field */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] sm:text-xs font-bold text-content-muted uppercase">
                          {initialData ? 'Nouveau mot de passe' : 'Mot de passe'}{' '}
                          {!initialData && <span className="text-status-danger">*</span>}
                        </label>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={formData.password}
                              onChange={(e) => updateField('password', e.target.value)}
                              placeholder={initialData ? 'Nouveau mot de passe...' : 'Min. 8 caractères'}
                              className={`${INPUT_CLASS} pr-10 ${errors.password ? 'border-status-danger focus:ring-status-danger' : ''}`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary transition-colors"
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={generatePassword}
                            className="px-3 py-2 rounded-xl border border-edge bg-surface-muted text-content-secondary hover:bg-surface hover:text-content-primary transition-colors flex items-center gap-1.5 text-xs font-medium shrink-0"
                            title="Générer un mot de passe fort"
                          >
                            <Key size={14} />
                            <span className="hidden sm:inline">Générer</span>
                          </button>
                        </div>
                        {errors.password && <p className="text-[10px] text-status-danger">{errors.password}</p>}
                      </div>

                      {/* Password strength */}
                      {formData.password && (
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
                      )}

                      {/* Submit error */}
                      {submitError && (
                        <div className="flex items-center gap-2 p-3 bg-status-danger-bg border border-status-danger/30 rounded-xl text-status-danger text-sm">
                          <AlertCircle size={16} />
                          <span>{submitError}</span>
                        </div>
                      )}

                      {/* Recap Card */}
                      <div className="bg-surface-muted/30 border border-edge/50 rounded-xl p-3 sm:p-4 space-y-2.5">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-content-muted">Récapitulatif</p>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-content-muted">Nom complet</span>
                            <span className="text-content-primary font-medium">{formData.prenom} {formData.nom}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-content-muted">Identifiant</span>
                            <span className="text-content-primary font-mono text-[11px]">@{formData.username}</span>
                          </div>
                          {formData.email && (
                            <div className="flex justify-between items-center">
                              <span className="text-content-muted">Email</span>
                              <span className="text-content-primary font-medium truncate ml-4">{formData.email}</span>
                            </div>
                          )}
                          {formData.telephone && (
                            <div className="flex justify-between items-center">
                              <span className="text-content-muted">Téléphone</span>
                              <span className="text-content-primary">{formData.telephone}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-start">
                            <span className="text-content-muted mt-0.5">Rôle{displayRoles.length > 1 ? 's' : ''}</span>
                            <div className="flex flex-wrap justify-end gap-1 ml-4">
                              {displayRoles.map(r => {
                                const badge = getRoleBadgeStyle(r);
                                return <span key={r} className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${badge.classes}`}>{badge.label}</span>;
                              })}
                            </div>
                          </div>
                          {initialData && (
                            <div className="flex justify-between items-center">
                              <span className="text-content-muted">Statut</span>
                              <span className={`font-medium ${getStatusTextColor(formData.statut)}`}>
                                {statusOptions.find(s => s.value === formData.statut)?.label}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* FOOTER */}
          {!showSuccess && (
            <div className="p-3 sm:p-4 bg-surface-base border-t border-edge flex justify-between items-center flex-shrink-0">
              {/* Previous */}
              <button
                type="button"
                onClick={() => step > 1 && setStep(step - 1)}
                className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl border border-edge text-content-secondary hover:text-content-primary hover:bg-surface transition-colors flex items-center gap-1.5 text-sm ${
                  step === 1 ? 'invisible' : ''
                }`}
              >
                <ChevronLeft size={16} /> <span className="hidden sm:inline">Précédent</span><span className="sm:hidden">Retour</span>
              </button>

              {/* Right side: Cancel + Next/Save */}
              <div className="flex gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-content-muted hover:text-content-primary hover:bg-surface transition-colors text-sm font-medium"
                >
                  Annuler
                </button>

                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => isStepValid(step) && setStep(step + 1)}
                    disabled={!isStepValid(step)}
                    className={`px-5 sm:px-7 py-2 sm:py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-lg text-sm ${
                      isStepValid(step)
                        ? 'bg-accent text-white shadow-accent/20 hover:shadow-accent/30'
                        : 'bg-surface-elevated text-content-muted cursor-not-allowed shadow-none'
                    }`}
                  >
                    Suivant <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving || !isAllValid || isUploading || usernameValidation.checking}
                    className={`px-5 sm:px-7 py-2 sm:py-2.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-lg text-sm ${
                      isAllValid && !saving
                        ? 'bg-status-success text-white shadow-status-success/20 hover:shadow-status-success/30'
                        : 'bg-surface-elevated text-content-muted cursor-not-allowed shadow-none'
                    } ${saving ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    {saving ? (
                      <><Loader2 size={16} className="animate-spin" /> Enregistrement...</>
                    ) : (
                      <><Save size={16} /> {initialData ? 'Enregistrer' : 'Créer Compte'}</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      <CameraCapture
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />
    </>
  );
}

// ─── Sub-components ────────────────────────────────────

function FormStepItem({ num, icon: Icon, label, current }: { num: number; icon: React.ElementType; label: string; current: number }) {
  const active = current >= num;
  const isCurrent = current === num;
  return (
    <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-2 w-14 sm:w-20">
      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
        active
          ? 'bg-accent text-white shadow-lg shadow-accent/30'
          : 'bg-surface text-content-muted border border-edge'
      } ${isCurrent ? 'ring-2 sm:ring-4 ring-accent/20 scale-105 sm:scale-110' : ''}`}>
        <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
      </div>
      <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-center leading-tight ${
        active ? 'text-content-primary' : 'text-content-muted'
      }`}>{label}</span>
    </div>
  );
}

function FormSuccessParticles() {
  const particles = React.useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.4,
      size: 4 + Math.random() * 8,
      color: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#14b8a6', '#5eead4'][Math.floor(Math.random() * 6)],
    }))
  , []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, bottom: '50%', width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ y: 0, opacity: 1, scale: 0 }}
          animate={{ y: [-20, -150 - Math.random() * 100], x: [0, (Math.random() - 0.5) * 100], opacity: [1, 1, 0], scale: [0, 1, 0.5], rotate: [0, 360] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function FormAnimatedCheckmark() {
  return (
    <motion.div className="relative flex items-center justify-center" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
      <motion.div className="absolute w-24 h-24 rounded-full bg-status-success-bg" initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 1] }} transition={{ duration: 0.6 }} />
      <motion.div className="absolute w-20 h-20 rounded-full bg-status-success/30" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.5, delay: 0.1 }} />
      <motion.div
        className="w-16 h-16 rounded-full bg-gradient-to-br from-status-success to-status-success flex items-center justify-center shadow-lg shadow-status-success/50"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
      >
        <motion.div initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <Check className="w-8 h-8 text-white" strokeWidth={3} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
