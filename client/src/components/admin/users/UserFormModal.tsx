import React, { useState, useEffect, useRef } from 'react';
import { Camera, Eye, EyeOff, Key, Upload, X, Users, Shield, User as UserIcon, Mail, Phone } from 'lucide-react';
import { Button, Modal, FormField, SelectField, IconButton } from '../../ui';
import CameraCapture from '../../shared/CameraCapture';
import { toast } from '../../../lib/toast';

interface User {
  id?: string;
  username: string;
  password?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  photo_profile?: string;
}

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => Promise<void>;
  initialData?: User | null;
  loading?: boolean;
}

const roles = [
  'Administrateur',
  'Chef d\'Agence',
  'Agent Caisse',
  'Agent Terrain',
  'Comptable',
  'Gestionnaire Crédit',
  'Superviseur'
];

export default function UserFormModal({ isOpen, onClose, onSubmit, initialData, loading }: UserFormModalProps) {
  const [formData, setFormData] = useState<any>({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'Agent Caisse',
    status: 'Actif',
    photo_profile: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        username: initialData.username || '',
        password: '',
        name: initialData.name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        role: initialData.role || 'Agent Caisse',
        status: initialData.status || 'Actif',
        photo_profile: initialData.photo_profile || ''
      });
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      role: 'Agent Caisse',
      status: 'Actif',
      photo_profile: ''
    });
    setShowPassword(false);
  };

  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Helper function to generate username from name (format: p.nom) - fallback local
  const generateUsernameLocal = (fullName: string): string => {
    // Remove accents and special characters
    const normalized = fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const parts = normalized.trim().split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      // If only one word, use it as-is
      return parts[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
    }

    const prenom = parts[0];
    const nom = parts[parts.length - 1];
    return `${prenom.charAt(0).toLowerCase()}.${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  };

  // Generate unique username via backend API
  const generateUniqueUsername = async (fullName: string): Promise<string> => {
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
    } catch (error) {
      console.error('Erreur vérification username:', error);
    } finally {
      setUsernameChecking(false);
    }
    // Fallback to local generation
    return generateUsernameLocal(fullName);
  };

  // Auto-generate unique username when name changes (for new users only)
  useEffect(() => {
    if (!initialData && formData.name && formData.name.includes(' ')) {
      // Debounce the API call
      const timer = setTimeout(async () => {
        const suggested = await generateUniqueUsername(formData.name);
        if (suggested && suggested !== formData.username) {
          setFormData((prev: any) => ({ ...prev, username: suggested }));
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.name, initialData]);

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, password });
    setShowPassword(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.warning('La taille du fichier ne doit pas dépasser 5 Mo');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo_profile: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(formData);
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
                {formData.photo_profile ? (
                   <img
                     src={formData.photo_profile}
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
                 >
                   <Camera size={16} />
                 </button>
                 <button 
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                   className="text-white hover:text-primary transition-colors p-1"
                   title="Importer"
                 >
                   <Upload size={16} />
                 </button>
                 {formData.photo_profile && (
                    <button 
                     type="button"
                     onClick={() => setFormData({ ...formData, photo_profile: '' })}
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
                   label="Nom complet"
                   name="name"
                   value={formData.name}
                   onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                   required
                   className="bg-surface-base"
                 />
                 <div className="relative">
                   <FormField
                     label="Identifiant"
                     name="username"
                     value={formData.username}
                     onChange={(e) => {
                       setFormData({ ...formData, username: e.target.value });
                       setUsernameAvailable(null); // Reset on manual edit
                     }}
                     className="bg-surface-base font-mono"
                     required
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
                   onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                   className="bg-surface-base"
                   icon={Mail}
                 />
                  <FormField
                   label="Téléphone"
                   name="phone"
                   type="tel"
                   value={formData.phone}
                   onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    options={roles}
                    required
                    containerClassName="mt-0"
                    className="bg-slate-800 border-slate-700 text-white focus:border-primary focus:ring-primary/20"
                 />
                 <SelectField
                    label="Statut"
                    name="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    options={['Actif', 'Inactif', 'Suspendu']}
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
                       onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
        onCapture={(img) => {
           setFormData({ ...formData, photo_profile: img });
           setShowCamera(false);
        }}
      />
    </>
  );
}
