import type { ClientWithIdentity } from '@shared/schema';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, User, Mail, Phone, MapPin, FileText, Video, Lock, KeyRound, Trash2, Camera, CreditCard, BookUser, FileQuestion, Briefcase, Calendar, DollarSign, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import FaceLivenessCapture from '../security/FaceLivenessCapture';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import SelectField from '../ui/SelectField';
import Button from '../ui/Button';
import SmartDocumentUpload, { type UploadedDocument, type DocumentType } from '../ui/SmartDocumentUpload';
import { useUserProfile } from '../../hooks/useUserProfile';
import { isAdminRole, SystemRole } from '@shared/types/roles';
import { agenceApi, employeApi } from '../../lib/api-client';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import { resolveStorageUrl } from '../../lib/format';
import { StatutClient, StatutAgence } from '@shared/enum/status-constants';

interface ClientFormProps {
  client?: ClientWithIdentity | null;
  onClose: () => void;
  onSave: (data: ClientFormData) => void;
}

/**
 * Interface pour les données du formulaire client.
 * Inclut les champs d'identité (users) et les champs métier (clients).
 */
interface ClientFormData {
  // Champs d'identité (envoyés à la table users)
  nom: string;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  sexe?: 'M' | 'F' | null;
  photoProfile?: string | null;

  // Champs métier client (envoyés à la table clients)
  adresse?: string | null; // Alias pour adresseDomicile
  adresseDomicile?: string | null;
  lieuActivite?: string | null;
  ville?: string | null;
  pays?: string | null;
  dateNaissance?: string | null;
  numeroPiece?: string | null;
  typePiece?: string | null;
  profession?: string | null;
  employeur?: string | null;
  typeActivite?: string | null;
  revenuMensuel?: string | null;
  revenuJournalier?: string | null;
  typeRevenu?: string | null;
  typeMarcheId?: string | null;
  segment?: string | null;
  frequenceCarte?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  score?: number | null;
  creditTotal?: string | null;
  epargneTotal?: string | null;
  tauxRemboursement?: string | null;
  limiteRetraitJournalier?: string | null;
  limiteRetraitHebdomadaire?: string | null;
  limiteRetraitMensuel?: string | null;
  pointsFidelite?: number | null;
  agenceId?: string | null;
  agentReferentId?: string | null;
  statut?: string | null;
  dateInscription?: Date | null;

  // Documents KYC (JSONB)
  documents?: UploadedDocument[];

  // Alias legacy
  photoUrl?: string | null;
}

// ID Type options with icons
const ID_TYPE_OPTIONS = [
  { value: 'CNI', label: 'CNI', icon: CreditCard },
  { value: 'PASSPORT', label: 'Passeport', icon: BookUser },
  { value: 'OTHER', label: 'Autre', icon: FileQuestion },
] as const;

// Sexe options
const SEXE_OPTIONS = [
  { value: 'M', label: 'Masculin' },
  { value: 'F', label: 'Féminin' },
] as const;

// Calcul de l'âge minimum (18 ans)
const MIN_AGE = 18;
const getMaxBirthDate = () => {
  const today = new Date();
  today.setFullYear(today.getFullYear() - MIN_AGE);
  return today.toISOString().split('T')[0];
};

export default function ClientForm({ client, onClose, onSave }: ClientFormProps) {
  // Camera State
  const [isLivenessOpen, setIsLivenessOpen] = useState(false);

  // User and Agency Data
  const { user } = useUserProfile();
  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const [agentsReferents, setAgentsReferents] = useState<{ id: string; nom: string; prenom: string }[]>([]);
  const isAdmin = isAdminRole(user?.role);

  // Form State
  const [formData, setFormData] = useState<ClientFormData>({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    sexe: null,
    adresse: '',
    adresseDomicile: '',
    ville: '',
    lieuActivite: '',
    dateNaissance: '',
    profession: '',
    employeur: '',
    revenuMensuel: '',
    revenuJournalier: '',
    typeRevenu: 'Mensuel',
    photoUrl: '',
    photoProfile: '',
    statut: StatutClient.ACTIVE,
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
    agenceId: null,
    agentReferentId: null,
    documents: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [typesMarches, setTypesMarches] = useState<{id: string; nom: string}[]>([]);

  // Uploaded documents state (structured)
  const [uploadedDocs, setUploadedDocs] = useState<Record<DocumentType, UploadedDocument | null>>({
    ID_CARD_FRONT: null,
    ID_CARD_BACK: null,
    PROOF_OF_ADDRESS: null,
    AVATAR: null,
    OTHER: null,
  });

  // Helper function to generate username from name (format: p.nom)
  const generateClientUsername = (nom: string, prenom: string): string => {
    if (!nom) return '';
    const normalizedNom = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedPrenom = (prenom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalizedPrenom) {
      return `${normalizedPrenom.charAt(0)}.${normalizedNom}`;
    }
    return normalizedNom;
  };

  // Helper to get display URL for uploaded files
  const getFileDisplayUrl = resolveStorageUrl;

  // Parse existing documents when editing
  const parseExistingDocuments = useCallback((clientData: any) => {
    const docs: Record<DocumentType, UploadedDocument | null> = {
      ID_CARD_FRONT: null,
      ID_CARD_BACK: null,
      PROOF_OF_ADDRESS: null,
      AVATAR: null,
      OTHER: null,
    };

    // Try to parse from documents JSONB first
    if (clientData.documents && Array.isArray(clientData.documents)) {
      clientData.documents.forEach((doc: any) => {
        const docType = doc.documentType || doc.document_type;
        if (docType && docs.hasOwnProperty(docType)) {
          docs[docType as DocumentType] = {
            id: doc.id || crypto.randomUUID(),
            documentType: docType,
            documentName: doc.documentName || doc.document_name || 'Document',
            documentUrl: doc.documentUrl || doc.document_url || '',
            status: doc.status || 'pending',
            createdAt: doc.createdAt || doc.created_at || new Date().toISOString(),
            isPrivate: doc.isPrivate !== false,
          };
        }
      });
    }

    // Fallback: parse legacy photoUrl (JSON array of URLs)
    if (!docs.ID_CARD_FRONT && clientData.photoUrl) {
      try {
        const pieces = JSON.parse(clientData.photoUrl);
        if (Array.isArray(pieces)) {
          pieces.forEach((url: string, index: number) => {
            const docType: DocumentType = index === 0 ? 'ID_CARD_FRONT' : index === 1 ? 'ID_CARD_BACK' : 'OTHER';
            if (!docs[docType]) {
              docs[docType] = {
                id: crypto.randomUUID(),
                documentType: docType,
                documentName: `Document ${index + 1}`,
                documentUrl: url,
                status: 'pending',
                createdAt: new Date().toISOString(),
                isPrivate: true,
              };
            }
          });
        }
      } catch {
        // Single URL
        if (clientData.photoUrl) {
          docs.ID_CARD_FRONT = {
            id: crypto.randomUUID(),
            documentType: 'ID_CARD_FRONT',
            documentName: 'Pièce d\'identité',
            documentUrl: clientData.photoUrl,
            status: 'pending',
            createdAt: new Date().toISOString(),
            isPrivate: true,
          };
        }
      }
    }

    return docs;
  }, []);

  // Load Client Data
  useEffect(() => {
    if (client) {
      const c = client as any;

      setFormData({
        nom: c.nom,
        prenom: c.prenom || '',
        email: c.email || '',
        telephone: c.telephone || '',
        sexe: c.sexe || null,
        adresse: c.adresse || '',
        adresseDomicile: c.adresseDomicile || '',
        ville: c.ville || '',
        lieuActivite: c.lieuActivite || '',
        dateNaissance: c.dateNaissance || '',
        profession: c.profession || '',
        employeur: c.employeur || '',
        revenuMensuel: c.revenuMensuel || '',
        revenuJournalier: c.revenuJournalier || '',
        typeRevenu: c.typeRevenu || 'Mensuel',
        photoUrl: c.photoUrl || '',
        photoProfile: c.photoProfile || '',
        statut: c.statut,
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
        agentReferentId: c.agentReferentId || null,
        documents: c.documents || [],
      });

      // Parse existing documents
      const parsedDocs = parseExistingDocuments(c);
      setUploadedDocs(parsedDocs);
    }
  }, [client, parseExistingDocuments]);

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
          const data = await agenceApi.getAll({ statut: StatutAgence.ACTIVE });
          setAgences(data);
        } catch (error) {
          console.error('Erreur chargement agences:', error);
        }
      };
      loadAgences();
    }
  }, [isAdmin]);

  // Charger les agents référents (AGENT_TERRAIN ou CHEF_AGENCE)
  useEffect(() => {
    const loadAgentsReferents = async () => {
      try {
        const data = await employeApi.getAll();
        // Filtrer pour ne garder que les agents terrain et chefs d'agence
        const agents = (data || []).filter((emp: any) => {
          const role = emp.roleSystem || emp.user?.role;
          return role === 'terrain' || role === 'chef_agence' ||
                 role === SystemRole.AGENT_TERRAIN || role === SystemRole.CHEF_AGENCE;
        }).map((emp: any) => ({
          id: emp.id,
          nom: emp.user?.nom || emp.nom || '',
          prenom: emp.user?.prenom || emp.prenom || '',
        }));
        setAgentsReferents(agents);
      } catch (error) {
        console.error('Erreur chargement agents référents:', error);
      }
    };
    loadAgentsReferents();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!(formData.nom || '').trim()) newErrors.nom = 'Le nom est requis';
    if (!formData.telephone) newErrors.telephone = 'Le téléphone est requis';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email invalide';
    if (isAdmin && !formData.agenceId && !client) newErrors.agenceId = "L'agence est requise pour les admins";

    // Require ID number for CNI and Passport
    if ((formData.typePiece === 'CNI' || formData.typePiece === 'PASSPORT') && !(formData.numeroPiece || '').trim()) {
      newErrors.numeroPiece = formData.typePiece === 'CNI' ? 'Le N° CNI est requis' : 'Le N° Passeport est requis';
    }

    // Validation date de naissance (majeur obligatoire)
    if (formData.dateNaissance) {
      const birthDate = new Date(formData.dateNaissance);
      const today = new Date();
      const age = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < MIN_AGE) {
        newErrors.dateNaissance = `Le client doit avoir au moins ${MIN_AGE} ans`;
      }
    }

    // Validation revenu (positif)
    if (formData.typeRevenu === 'Journalier') {
      if (formData.revenuJournalier) {
        const revenu = parseFloat(formData.revenuJournalier);
        if (isNaN(revenu) || revenu < 0) {
          newErrors.revenuJournalier = 'Le revenu doit être un nombre positif';
        }
      }
    } else {
      if (formData.revenuMensuel) {
        const revenu = parseFloat(formData.revenuMensuel);
        if (isNaN(revenu) || revenu < 0) {
          newErrors.revenuMensuel = 'Le revenu doit être un nombre positif';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkUniqueness = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/clients/check-uniqueness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telephone: formData.telephone,
          email: formData.email,
          numeroPiece: formData.numeroPiece,
          excludeClientId: client?.id
        })
      });
      const data = await res.json();
      if (!data.available) {
        setErrors(prev => ({ ...prev, [data.field]: data.message }));
        return false;
      }
      return true;
    } catch (err) {
      console.error("Check uniqueness failed", err);
      return true;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (validateForm()) {
      setIsSubmitting(true);

      const isUnique = await checkUniqueness();
      if (!isUnique) {
        setIsSubmitting(false);
        return;
      }

      try {
        // Build documents array from uploadedDocs
        const documentsArray = Object.values(uploadedDocs).filter((doc): doc is UploadedDocument => doc !== null);

        // Create final form data with structured documents
        const finalData: any = {
          ...formData,
          documents: documentsArray,
          // Also keep legacy photoUrl for backwards compatibility
          photoUrl: documentsArray.length > 0
            ? JSON.stringify(documentsArray.map(d => d.documentUrl))
            : '',
          // Send temp entity ID so the server can relocate uploaded files
          ...(client ? {} : { tempEntityId: tempClientIdRef.current }),
        };

        await onSave(finalData);
        setTimeout(() => setIsSubmitting(false), 2000);
      } catch (error) {
        console.error("Save failed", error);
        setIsSubmitting(false);
      }
    }
  };

  const handleChange = (field: keyof ClientFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // Handle document upload completion
  const handleDocumentChange = useCallback((type: DocumentType, doc: UploadedDocument | null) => {
    setUploadedDocs(prev => ({
      ...prev,
      [type]: doc,
    }));
  }, []);

  // Entity upload for profile photo
  const tempClientIdRef = useRef(crypto.randomUUID());
  const clientEntityId = client?.id || tempClientIdRef.current;
  const { uploadFile: uploadProfile } = useEntityUpload({
    fileType: 'profile',
    entityType: 'client',
    entityId: clientEntityId,
    onError: (err) => console.error("Profile upload error", err)
  });

  const handleProfileCapture = async (imageDataUrl: string) => {
    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadProfile(file);
      if (url) handleChange('photoProfile', url);
    } catch (e) {
      console.error("Capture upload failed", e);
    }
  };

  // Handle avatar upload via SmartDocumentUpload
  const handleAvatarUpload = useCallback((doc: UploadedDocument) => {
    // Store in photoProfile for quick access in lists
    handleChange('photoProfile', doc.documentUrl);
    // Also track in documents
    handleDocumentChange('AVATAR', doc);
  }, [handleDocumentChange]);

  // Check if showing back document (not for passport)
  const showBackDocument = formData.typePiece !== 'PASSPORT';

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

          <SelectField
            label="Sexe"
            name="sexe"
            value={formData.sexe || ''}
            onChange={(e) => handleChange('sexe', e.target.value as 'M' | 'F' || null)}
            options={[
              { value: '', label: 'Sélectionner' },
              ...SEXE_OPTIONS.map(s => ({ value: s.value, label: s.label }))
            ]}
          />

          <FormField
            label="Date de Naissance"
            name="dateNaissance"
            type="date"
            icon={Calendar}
            value={formData.dateNaissance || ''}
            onChange={(e) => handleChange('dateNaissance', e.target.value)}
            error={errors.dateNaissance}
            max={getMaxBirthDate()}
            className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
          />

          <FormField
            label="Ville"
            name="ville"
            icon={MapPin}
            value={formData.ville || ''}
            onChange={(e) => handleChange('ville', e.target.value)}
            placeholder="Brazzaville"
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
            />
          )}

          <SelectField
            label="Segment"
            name="segment"
            value={formData.segment ?? 'Standard'}
            onChange={(e) => handleChange('segment', e.target.value)}
            options={[
              { value: 'Standard', label: 'Standard' },
              { value: 'Premium', label: 'Premium' },
              { value: 'VIP', label: 'VIP' }
            ]}
          />
        </div>

        {/* Section Profil & Conformité */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-cyan-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Profil Professionnel & Conformité</h4>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <FormField
              label="Profession"
              name="profession"
              icon={Briefcase}
              value={formData.profession || ''}
              onChange={(e) => handleChange('profession', e.target.value)}
              placeholder="Ex: Commerçant, Enseignant..."
              className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
            />

            <FormField
              label="Employeur"
              name="employeur"
              icon={Briefcase}
              value={formData.employeur || ''}
              onChange={(e) => handleChange('employeur', e.target.value)}
              placeholder="Nom de l'entreprise (si salarié)"
              className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
            />

            <div className="space-y-2">
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                Revenu (FCFA)
              </label>
              {/* Toggle Mensuel / Journalier */}
              <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    handleChange('typeRevenu', 'Mensuel');
                    // Recalculate: if daily exists, compute monthly
                    if (formData.revenuJournalier) {
                      const daily = parseFloat(formData.revenuJournalier);
                      if (!isNaN(daily) && daily > 0) {
                        handleChange('revenuMensuel', Math.round(daily * 26).toString());
                      }
                    }
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    formData.typeRevenu !== 'Journalier'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Mensuel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleChange('typeRevenu', 'Journalier');
                    // Recalculate: if monthly exists and no daily, compute daily
                    if (formData.revenuMensuel && !formData.revenuJournalier) {
                      const monthly = parseFloat(formData.revenuMensuel);
                      if (!isNaN(monthly) && monthly > 0) {
                        handleChange('revenuJournalier', Math.round(monthly / 26).toString());
                      }
                    }
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    formData.typeRevenu === 'Journalier'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Journalier
                </button>
              </div>

              {formData.typeRevenu === 'Journalier' ? (
                <div className="space-y-2">
                  <FormField
                    label="Revenu Journalier"
                    name="revenuJournalier"
                    type="number"
                    icon={DollarSign}
                    value={formData.revenuJournalier || ''}
                    onChange={(e) => {
                      const daily = e.target.value;
                      handleChange('revenuJournalier', daily);
                      const parsed = parseFloat(daily);
                      handleChange('revenuMensuel', !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 26).toString() : '');
                    }}
                    error={errors.revenuJournalier}
                    placeholder="5000"
                    min="0"
                    className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
                  />
                  {formData.revenuJournalier && parseFloat(formData.revenuJournalier) > 0 && (
                    <p className="text-xs text-slate-400">
                      {parseFloat(formData.revenuJournalier).toLocaleString()} × 26j = <span className="text-cyan-400 font-semibold">{Math.round(parseFloat(formData.revenuJournalier) * 26).toLocaleString()} FCFA/mois</span>
                    </p>
                  )}
                </div>
              ) : (
                <FormField
                  label="Revenu Mensuel"
                  name="revenuMensuel"
                  type="number"
                  icon={DollarSign}
                  value={formData.revenuMensuel || ''}
                  onChange={(e) => handleChange('revenuMensuel', e.target.value)}
                  error={errors.revenuMensuel}
                  placeholder="150000"
                  min="0"
                  className="bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
                />
              )}
            </div>

            <SelectField
              label="Agent Référent"
              name="agentReferentId"
              value={formData.agentReferentId || ''}
              onChange={(e) => handleChange('agentReferentId', e.target.value === '' ? null : e.target.value)}
              options={[
                { value: '', label: 'Sélectionner un agent référent' },
                ...agentsReferents.map(a => ({ value: a.id, label: `${a.prenom} ${a.nom}` }))
              ]}
              helperText="Agent terrain ou chef d'agence responsable du client"
            />
          </div>
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

        {/* Photo & Identity Section - REDESIGNED */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="grid md:grid-cols-2 gap-8">

            {/* ========== AVATAR SECTION (Centered) ========== */}
            <div className="flex flex-col items-center space-y-4">
              <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 self-start">
                <User className="w-5 h-5" /> Photo de Profil
              </h4>

              <div className="relative">
                {formData.photoProfile ? (
                  // Has photo - Show avatar with edit/delete buttons
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-700 shadow-xl">
                      <img
                        src={getFileDisplayUrl(formData.photoProfile)}
                        className="w-full h-full object-cover"
                        alt="Profil"
                        onError={(e) => {
                          const nameFallback = `${formData.prenom || ''} ${formData.nom || ''}`.trim();
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameFallback || 'Client')}&size=128&background=1e293b&color=94a3b8`;
                        }}
                      />
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => {
                        handleChange('photoProfile', '');
                        handleDocumentChange('AVATAR', null);
                      }}
                      className="absolute -top-1 -right-1 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg transition-transform hover:scale-110"
                    >
                      <Trash2 size={14} />
                    </button>

                    {/* Camera edit button */}
                    <button
                      type="button"
                      onClick={() => setIsLivenessOpen(true)}
                      className="absolute bottom-0 right-0 p-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-full shadow-lg transition-all hover:scale-110"
                    >
                      <Camera size={18} />
                    </button>
                  </div>
                ) : (
                  // No photo - Show Avatar upload component
                  <div className="relative">
                    <SmartDocumentUpload
                      label="Photo"
                      documentType="AVATAR"
                      variant="avatar"
                      isPrivate={false}
                      fileType="profile"
                      entityType="client"
                      entityId={clientEntityId}
                      onUploadComplete={handleAvatarUpload}
                      onRemove={() => {
                        handleChange('photoProfile', '');
                        handleDocumentChange('AVATAR', null);
                      }}
                    />

                    {/* Alternative: Camera/Liveness capture button */}
                    <button
                      type="button"
                      onClick={() => setIsLivenessOpen(true)}
                      className="absolute -bottom-2 -left-2 p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full shadow-lg transition-all hover:scale-110 border-2 border-slate-800"
                      title="Prendre une photo"
                    >
                      <Video size={16} />
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500 text-center max-w-[200px]">
                Photo de profil visible sur la fiche client et les documents
              </p>
            </div>

            {/* ========== IDENTITY DOCUMENTS SECTION ========== */}
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5" /> Pièces d'identité
              </h4>

              {/* ID Type Selector - Radio Cards */}
              <div className="grid grid-cols-3 gap-2">
                {ID_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleChange('typePiece', value)}
                    className={`
                      flex flex-col items-center gap-1.5 p-3 rounded-xl font-medium transition-all duration-200
                      ${formData.typePiece === value
                        ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/25 scale-[1.02]'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>

              {/* ID Number - Floating Label Style */}
              <div className="relative mt-4">
                <input
                  id="numeroPiece"
                  type="text"
                  value={formData.numeroPiece || ''}
                  onChange={(e) => handleChange('numeroPiece', e.target.value)}
                  placeholder=" "
                  className={`
                    peer w-full pt-5 pb-2 px-4 
                    bg-slate-800 border-2 rounded-xl
                    text-white text-sm
                    placeholder-transparent
                    focus:outline-none focus:ring-0
                    transition-colors duration-200
                    ${errors.numeroPiece
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-slate-700 focus:border-cyan-500'
                    }
                  `}
                />
                <label
                  htmlFor="numeroPiece"
                  className={`
                    absolute left-4 transition-all duration-200 pointer-events-none
                    peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm
                    peer-focus:top-2 peer-focus:text-xs peer-focus:-translate-y-0
                    top-2 text-xs -translate-y-0
                    ${errors.numeroPiece ? 'text-red-400' : 'text-slate-400 peer-focus:text-cyan-400'}
                  `}
                >
                  {formData.typePiece === 'CNI' ? 'N° CNI' : formData.typePiece === 'PASSPORT' ? 'N° Passeport' : 'Numéro de pièce'}
                </label>
                {errors.numeroPiece && (
                  <p className="mt-1 text-xs text-red-400">{errors.numeroPiece}</p>
                )}
              </div>

              {/* Document Upload Grid - Layout changes based on ID type */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                {/* Front document - Always visible */}
                <SmartDocumentUpload
                  label={formData.typePiece === 'PASSPORT' ? 'Page Principale' : 'Recto'}
                  documentType="ID_CARD_FRONT"
                  existingDocument={uploadedDocs.ID_CARD_FRONT}
                  isPrivate={true}
                  fileType="kyc"
                  entityType="client"
                  entityId={clientEntityId}
                  aspectRatio="card"
                  watermarkIcon="front"
                  accept="image/png,image/jpeg,image/jpg,application/pdf"
                  ctaText={formData.typePiece === 'PASSPORT' ? 'Scanner la Page' : 'Scanner le Recto'}
                  onUploadComplete={(doc) => handleDocumentChange('ID_CARD_FRONT', doc)}
                  onRemove={() => handleDocumentChange('ID_CARD_FRONT', null)}
                />

                {/* Back document - Hidden for Passport, replaced by Proof of Address */}
                <AnimatePresence mode="wait">
                  {showBackDocument ? (
                    <motion.div
                      key="back-document"
                      initial={{ opacity: 0, scale: 0.9, x: 20 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      <SmartDocumentUpload
                        label="Verso"
                        documentType="ID_CARD_BACK"
                        existingDocument={uploadedDocs.ID_CARD_BACK}
                        isPrivate={true}
                        fileType="kyc"
                        entityType="client"
                        entityId={clientEntityId}
                        aspectRatio="card"
                        watermarkIcon="back"
                        accept="image/png,image/jpeg,image/jpg,application/pdf"
                        ctaText="Scanner le Verso"
                        onUploadComplete={(doc) => handleDocumentChange('ID_CARD_BACK', doc)}
                        onRemove={() => handleDocumentChange('ID_CARD_BACK', null)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="proof-address-inline"
                      initial={{ opacity: 0, scale: 0.9, x: 20 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      <SmartDocumentUpload
                        label="Justificatif de Domicile"
                        documentType="PROOF_OF_ADDRESS"
                        existingDocument={uploadedDocs.PROOF_OF_ADDRESS}
                        isPrivate={true}
                        fileType="kyc"
                        entityType="client"
                        entityId={clientEntityId}
                        aspectRatio="card"
                        watermarkIcon="scan"
                        accept="image/png,image/jpeg,image/jpg,application/pdf"
                        ctaText="Ajouter un justificatif"
                        onUploadComplete={(doc) => handleDocumentChange('PROOF_OF_ADDRESS', doc)}
                        onRemove={() => handleDocumentChange('PROOF_OF_ADDRESS', null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Proof of Address - Only shown below for CNI/Other */}
              <AnimatePresence>
                {showBackDocument && (
                  <motion.div 
                    className="mt-3"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <SmartDocumentUpload
                      label="Justificatif de Domicile"
                      documentType="PROOF_OF_ADDRESS"
                      existingDocument={uploadedDocs.PROOF_OF_ADDRESS}
                      isPrivate={true}
                      fileType="kyc"
                      entityType="client"
                      entityId={clientEntityId}
                      aspectRatio="video"
                      watermarkIcon="scan"
                      accept="image/png,image/jpeg,image/jpg,application/pdf"
                      ctaText="Ajouter un justificatif"
                      onUploadComplete={(doc) => handleDocumentChange('PROOF_OF_ADDRESS', doc)}
                      onRemove={() => handleDocumentChange('PROOF_OF_ADDRESS', null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700 mt-6">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
          <Button type="submit" variant="primary" icon={isSubmitting ? undefined : Save} disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Traitement...
              </span>
            ) : client ? 'Mettre à jour' : 'Enregistrer'}
          </Button>
        </div>
      </form>

      {/* Security Modal */}
      <FaceLivenessCapture
        isOpen={isLivenessOpen}
        onClose={() => setIsLivenessOpen(false)}
        onCapture={handleProfileCapture}
        title="Photo de Profil"
      />
    </Modal>
  );
}
