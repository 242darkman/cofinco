import type { Client, InsertClient } from '@shared/schema';
import React, { useState, useEffect } from 'react';
import { Save, User, Mail, Phone, MapPin, Award, Upload, FileText, Trash2, Store, Video, Camera, Lock, KeyRound } from 'lucide-react';
import FaceLivenessCapture from '../security/FaceLivenessCapture';
import CameraCapture from '../shared/CameraCapture';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import Button from '../ui/Button';
import { useUserProfile } from '../../hooks/useUserProfile';
import { agenceApi } from '../../lib/api-client';

interface ClientFormProps {
  client?: Client | null;
  onClose: () => void;
  onSave: (client: InsertClient | Partial<Client>) => void;
}

export default function ClientForm({ client, onClose, onSave }: ClientFormProps) {
  // Camera State
  const [isLivenessOpen, setIsLivenessOpen] = useState(false);
  const [isDocCameraOpen, setIsDocCameraOpen] = useState(false);

  // User and Agency Data
  const { user } = useUserProfile();
  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const isAdmin = user?.role === 'admin' || user?.role === 'Administrateur';

  // Form State
  const [formData, setFormData] = useState<InsertClient>({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    adresse: '',
    adresseDomicile: '',
    lieuActivite: '',
    photoUrl: '', // Stores documents array JSON
    photoProfile: '',
    status: 'Actif',
    segment: 'Standard',
    score: 50,
    creditTotal: '0',
    epargneTotal: '0',
    tauxRemboursement: '0',
    pointsFidelite: 0,
    dateInscription: new Date(),
    typePiece: 'CNI',
    numeroPiece: '',
    typeMarcheId: null,
    agenceId: null, // Ensure agenceId is handled
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pieceIdentite, setPieceIdentite] = useState<string[]>([]);
  const [typesMarches, setTypesMarches] = useState<{id: string; nom: string}[]>([]);
  
  // Future client portal access (locked for now)
  const [portalAccessEnabled, setPortalAccessEnabled] = useState(false);
  const [generatedUsername, setGeneratedUsername] = useState('');

  // Helper function to generate username from name (format: p.nom)
  const generateClientUsername = (nom: string, prenom: string): string => {
    if (!nom) return '';
    // Remove accents and special characters
    const normalizedNom = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedPrenom = (prenom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    
    if (normalizedPrenom) {
      return `${normalizedPrenom.charAt(0)}.${normalizedNom}`;
    }
    return normalizedNom;
  };

  // Load Client Data
  useEffect(() => {
    if (client) {
      const c = client as any;
      const photoUrl = c.photoUrl || '';
      
      setFormData({
        nom: c.nom,
        prenom: c.prenom || '',
        email: c.email || '',
        telephone: c.telephone || '',
        adresse: c.adresse || '',
        adresseDomicile: c.adresseDomicile || '',
        lieuActivite: c.lieuActivite || '',
        photoUrl: photoUrl,
        photoProfile: c.photoProfile || '',
        status: c.status,
        segment: c.segment,
        score: c.score || 50,
        creditTotal: c.creditTotal || 0,
        epargneTotal: c.epargneTotal || 0,
        tauxRemboursement: c.tauxRemboursement || 0,
        pointsFidelite: c.pointsFidelite || 0,
        dateInscription: c.dateInscription,
        typePiece: c.typePiece || 'CNI',
        numeroPiece: c.numeroPiece || '',
        typeMarcheId: c.typeMarcheId || null,
        agenceId: c.agenceId || null,
      });

      // Parse documents from photoUrl
      if (photoUrl) {
        try {
          const pieces = JSON.parse(photoUrl);
          if (Array.isArray(pieces)) setPieceIdentite(pieces);
          else setPieceIdentite([photoUrl]);
        } catch {
          setPieceIdentite([photoUrl]);
        }
      }
    }
  }, [client]);

  // Load Markets
  useEffect(() => {
    const loadTypesMarches = async () => {
      try {
        const response = await fetch('/api/types-marches', { credentials: 'include' });
        if (response.ok) setTypesMarches(await response.json());
      } catch (error) {
        console.error('Erreur chargement types marchés:', error);
      }
    };
    loadTypesMarches();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const loadAgences = async () => {
        try {
          const data = await agenceApi.getAll();
          setAgences(data);
        } catch (error) {
          console.error('Erreur chargement agences:', error);
        }
      };
      loadAgences();
    }
  }, [isAdmin]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!(formData.nom || '').trim()) newErrors.nom = 'Le nom est requis';
    if (!formData.telephone) newErrors.telephone = 'Le téléphone est requis';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email invalide';
    if (isAdmin && !formData.agenceId && !client) newErrors.agenceId = "L'agence est requise pour les admins";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleChange = (field: keyof InsertClient, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // --- Photo Handling ---

  const handleProfileCapture = (imageDataUrl: string) => {
    handleChange('photoProfile', imageDataUrl);
  };

  const handleProfileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => handleChange('photoProfile', reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDocCapture = (imageDataUrl: string) => {
      setPieceIdentite(prev => {
        const newPieces = [...prev, imageDataUrl];
        handleChange('photoUrl', JSON.stringify(newPieces));
        return newPieces;
      });
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setPieceIdentite(prev => {
                const newPieces = [...prev, reader.result as string];
                handleChange('photoUrl', JSON.stringify(newPieces));
                return newPieces;
            });
        };
        reader.readAsDataURL(file);
      });
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={client ? 'Modifier le client' : 'Nouveau client'}
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identité */}
        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            label="Nom *"
            name="nom"
            error={errors.nom}
            icon={User}
            value={formData.nom || ''}
            onChange={(e) => handleChange('nom', e.target.value)}
            placeholder="Dupont"
            required
            className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
          />
          
          <FormField
            label="Prénom"
            name="prenom"
            icon={User}
            value={formData.prenom || ''}
            onChange={(e) => handleChange('prenom', e.target.value)}
            placeholder="Jean"
            className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
          />

          <FormField
            label="Email"
            name="email"
            error={errors.email}
            icon={Mail}
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="jean@example.com"
            className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
          />

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-300 mb-2">
              Téléphone *
              <span className="text-red-400 ml-1">*</span>
            </label>
            <div className="flex gap-2">
              <div className="px-3 py-2.5 sm:py-3 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center">
                +242
              </div>
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                <input
                  type="tel"
                  name="telephone-input"
                  value={(formData.telephone || '').replace('+242', '').trim()}
                  onChange={(e) => {
                    const num = e.target.value.replace(/[^\d]/g, '');
                    handleChange('telephone', '+242' + num);
                  }}
                  className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm sm:text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:border-cyan-500 focus:ring-cyan-500/30 transition-colors duration-200"
                  maxLength={9}
                  aria-invalid={errors.telephone ? 'true' : 'false'}
                />
              </div>
            </div>
            {errors.telephone && (
              <p className="mt-1.5 text-xs sm:text-sm text-red-400 flex items-center gap-1">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {errors.telephone}
              </p>
            )}
          </div>

           <FormField
            label="Adresse Domicile"
            name="adresseDomicile"
            icon={MapPin}
            value={(formData.adresseDomicile as string) || ''}
            onChange={(e) => handleChange('adresseDomicile', e.target.value)}
            className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
          />

          <FormField
            label="Lieu d'Activité"
            name="lieuActivite"
            icon={MapPin}
            value={formData.lieuActivite || ''}
            onChange={(e) => handleChange('lieuActivite', e.target.value)}
            className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
          />

          <SelectField
            label="Secteur d'activité"
            name="typeMarcheId"
            value={formData.typeMarcheId || ''}
            onChange={(e) => handleChange('typeMarcheId', e.target.value === '' ? null : e.target.value)}
            options={[
                { value: '', label: 'Sélectionner un secteur' },
                ...(typesMarches || []).map(tm => ({ value: tm.id, label: tm.nom }))
            ]}
          />

          {isAdmin && (
             <SelectField
               label="Agence *"
               name="agenceId"
               value={formData.agenceId || ''}
               onChange={(e) => handleChange('agenceId', e.target.value)}
               error={errors.agenceId}
               options={[
                   { value: '', label: "Sélectionner l'agence" },
                   ...agences.map(a => ({ value: a.id, label: a.nom }))
               ]}
               // icon={Store}  // Building isn't directly imported but Store is available
             />
          )}

          <SelectField
             label="Statut"
             name="status"
             value={formData.status}
             onChange={(e) => handleChange('status', e.target.value)}
             options={[
                 { value: 'Actif', label: 'Actif' },
                 { value: 'Suspendu', label: 'Suspendu' },
                 { value: 'Inactif', label: 'Inactif' }
             ]}
          />

          <SelectField
             label="Segment"
             name="segment"
             value={formData.segment}
             onChange={(e) => handleChange('segment', e.target.value)}
             options={[
                 { value: 'Nouveau', label: 'Nouveau' },
                 { value: 'Standard', label: 'Standard' },
                 { value: 'VIP', label: 'VIP' }
             ]}
          />
        </div>

        {/* Accès Portail Client - Section verrouillée */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="relative">
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-200 dark:bg-slate-700 rounded-lg">
                  <KeyRound size={20} className="text-slate-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Créer un accès Portail Client</span>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded-full border border-amber-500/30 flex items-center gap-1">
                      <Lock size={10} /> Bientôt disponible
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Permet au client de se connecter à son espace dédié
                  </p>
                  {formData.nom && formData.prenom && (
                    <p className="text-xs text-cyan-500 mt-1 font-mono">
                      Username prévu: {generateClientUsername(formData.nom, formData.prenom)}
                    </p>
                  )}
                </div>
              </div>
              <div className="relative">
                <div className="w-12 h-6 bg-slate-300 dark:bg-slate-600 rounded-full">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-slate-400 dark:bg-slate-500 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-700">
             <div className="space-y-4">
               <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                   <User className="w-5 h-5" /> Photo de Profil
               </h4>
               
               <div className="flex gap-4 items-start">
                  {formData.photoProfile ? (
                      <div className="relative group">
                          <img 
                              src={formData.photoProfile} 
                              className="w-32 h-32 object-cover rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-sm" 
                              alt="Profil" 
                          />
                          <button
                              type="button"
                              onClick={() => handleChange('photoProfile', '')}
                              className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition-transform hover:scale-110"
                          >
                              <Trash2 size={14} />
                          </button>
                      </div>
                  ) : (
                      <div className="flex gap-3 w-full">
                          <button 
                              type="button" 
                              onClick={() => setIsLivenessOpen(true)}
                              className="flex-1 h-32 rounded-xl flex flex-col items-center justify-center p-0 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-cyan-500 dark:hover:border-cyan-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all group"
                          >
                              <div className="p-3 bg-slate-200 dark:bg-slate-700 rounded-full mb-2 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/30 transition-colors">
                                <Video size={24} className="text-slate-500 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400" />
                              </div>
                              <span className="text-sm font-semibold">Caméra</span>
                          </button>
                          
                          <label className="flex-1 cursor-pointer h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-cyan-500 dark:hover:border-cyan-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all group">
                              <div className="p-3 bg-slate-200 dark:bg-slate-700 rounded-full mb-2 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/30 transition-colors">
                                <Upload size={24} className="text-slate-500 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400" />
                              </div>
                              <span className="text-sm font-semibold">Uploader</span>
                              <input type="file" accept="image/*" onChange={handleProfileUpload} className="hidden" />
                          </label>
                      </div>
                  )}
               </div>
             </div>

             <div className="space-y-4">
                <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5" /> Pièces d'identité
                </h4>
                
                <div className="grid grid-cols-12 gap-3 items-end">
                   <div className="col-span-4">
                        <SelectField
                            label="Type"
                            name="typePiece"
                            value={formData.typePiece || 'CNI'}
                            onChange={(e) => handleChange('typePiece', e.target.value)}
                            options={[
                                { value: 'CNI', label: 'CNI' },
                                { value: 'Passeport', label: 'Passeport' },
                                { value: 'Permis', label: 'Permis' },
                            ]}
                            className="mb-0"
                        />
                   </div>
                   <div className="col-span-8">
                       <FormField
                           label="Numéro"
                           name="numeroPiece"
                           value={formData.numeroPiece || ''}
                           onChange={(e) => handleChange('numeroPiece', e.target.value)}
                           placeholder="Numéro de pièce"
                           className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500 mb-0"
                           containerClassName="mb-0"
                       />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                     <Button 
                         type="button" 
                         variant="secondary"
                         onClick={() => setIsDocCameraOpen(true)} 
                         icon={Camera}
                         className="w-full justify-center"
                      >
                         Scanner
                     </Button>
                     <label className="cursor-pointer">
                         <div className="w-full h-10 px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm">
                            <Upload size={18} />
                            Importer
                         </div>
                         {/* ACCEPT PDF */}
                         <input type="file" multiple accept="image/*,application/pdf" onChange={handleDocUpload} className="hidden" />
                     </label>
                </div>

                {pieceIdentite.length > 0 && (
                     <div className="grid grid-cols-3 gap-2 mt-2">
                        {pieceIdentite.map((doc, idx) => {
                            const isPdf = doc.startsWith('data:application/pdf');
                            return (
                                <div key={idx} className="relative group">
                                    {isPdf ? (
                                        <div className="w-full h-20 bg-red-500/10 border border-red-500/30 rounded-lg flex flex-col items-center justify-center p-2">
                                            <FileText className="text-red-500 mb-1" size={24} />
                                            <span className="text-[10px] text-red-500 font-medium">PDF</span>
                                        </div>
                                    ) : (
                                        <img src={doc} className="w-full h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newPieces = pieceIdentite.filter((_, i) => i !== idx);
                                            setPieceIdentite(newPieces);
                                            handleChange('photoUrl', JSON.stringify(newPieces));
                                        }}
                                        className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        })}
                     </div>
                )}
             </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700 mt-6">
             <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
             <Button type="submit" variant="primary" icon={Save}>
                 {client ? 'Mettre à jour' : 'Enregistrer'}
             </Button>
        </div>
      </form>

      {/* Security Modals */}
      <FaceLivenessCapture
        isOpen={isLivenessOpen}
        onClose={() => setIsLivenessOpen(false)}
        onCapture={handleProfileCapture}
        title="Photo de Profil"
      />

      <CameraCapture
        isOpen={isDocCameraOpen}
        onClose={() => setIsDocCameraOpen(false)}
        onCapture={handleDocCapture}
        title="Scanner un document"
      />
    </Modal>
  );
}
