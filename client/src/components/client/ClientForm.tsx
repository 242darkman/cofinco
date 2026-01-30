import type { ClientWithIdentity } from '@shared/schema';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, User, Mail, Phone, MapPin, FileText, Video, Lock, KeyRound, Trash2, Camera, CreditCard, BookUser, FileQuestion, Briefcase, Calendar, DollarSign } from 'lucide-react';
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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section 1: Identité - Grid compact */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FormField
            label="Nom *"
            name="nom"
            error={errors.nom}
            icon={User}
            value={formData.nom || ''}
            onChange={(e) => handleChange('nom', e.target.value)}
            placeholder="Dupont"
            required
          />
          <FormField
            label="Prénom"
            name="prenom"
            icon={User}
            value={formData.prenom || ''}
            onChange={(e) => handleChange('prenom', e.target.value)}
            placeholder="Jean"
          />
          <FormField
            label="Email"
            name="email"
            error={errors.email}
            icon={Mail}
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="email@example.com"
          />
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Téléphone * <span className="text-red-400">*</span></label>
            <div className="flex gap-1">
              <div className="px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs font-semibold text-slate-300 flex items-center">+242</div>
              <div className="relative flex-1">
                <Phone className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="tel"
                  name="telephone-input"
                  value={(formData.telephone || '').replace('+242', '').trim()}
                  onChange={(e) => {
                    const num = e.target.value.replace(/[^\d]/g, '');
                    handleChange('telephone', '+242' + num);
                  }}
                  className="w-full pl-7 pr-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  maxLength={9}
                />
              </div>
            </div>
            {errors.telephone && <p className="mt-0.5 text-[10px] text-red-400">{errors.telephone}</p>}
          </div>
        </div>

        {/* Section 2: Adresse & Localisation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FormField
            label="Adresse Domicile"
            name="adresseDomicile"
            icon={MapPin}
            value={(formData.adresseDomicile as string) || ''}
            onChange={(e) => handleChange('adresseDomicile', e.target.value)}
          />
          <SelectField
            label="Sexe"
            name="sexe"
            value={formData.sexe || ''}
            onChange={(e) => handleChange('sexe', e.target.value as 'M' | 'F' || null)}
            options={[{ value: '', label: 'Sélectionner...' }, ...SEXE_OPTIONS.map(s => ({ value: s.value, label: s.label }))]}
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
          />
          <FormField
            label="Ville"
            name="ville"
            icon={MapPin}
            value={formData.ville || ''}
            onChange={(e) => handleChange('ville', e.target.value)}
            placeholder="Brazzaville"
          />
        </div>

        {/* Section 3: Activité & Rattachement */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FormField
            label="Lieu d'Activité"
            name="lieuActivite"
            icon={MapPin}
            value={formData.lieuActivite || ''}
            onChange={(e) => handleChange('lieuActivite', e.target.value)}
          />
          <SelectField
            label="Secteur d'activité"
            name="typeMarcheId"
            value={formData.typeMarcheId || ''}
            onChange={(e) => handleChange('typeMarcheId', e.target.value === '' ? null : e.target.value)}
            options={[{ value: '', label: 'Sélectionner...' }, ...(typesMarches || []).map(tm => ({ value: tm.id, label: tm.nom }))]}
          />
          {isAdmin ? (
            <SelectField
              label="Agence *"
              name="agenceId"
              value={formData.agenceId || ''}
              onChange={(e) => handleChange('agenceId', e.target.value)}
              error={errors.agenceId}
              options={[{ value: '', label: "Sélectionner..." }, ...agences.map(a => ({ value: a.id, label: a.nom }))]}
            />
          ) : (
            <div /> // Placeholder for grid alignment
          )}
          <SelectField
            label="Segment"
            name="segment"
            value={formData.segment ?? 'Standard'}
            onChange={(e) => handleChange('segment', e.target.value)}
            options={[{ value: 'Standard', label: 'Standard' }, { value: 'Premium', label: 'Premium' }, { value: 'VIP', label: 'VIP' }]}
          />
        </div>

        {/* Section Profil Professionnel - Compact */}
        <div className="pt-3 border-t border-slate-700/50">
          <div className="flex items-center gap-1.5 mb-2">
            <Briefcase size={14} className="text-cyan-400" />
            <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Profil Professionnel</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FormField
              label="Profession"
              name="profession"
              icon={Briefcase}
              value={formData.profession || ''}
              onChange={(e) => handleChange('profession', e.target.value)}
              placeholder="Ex: Commerçant"
            />
            <FormField
              label="Employeur"
              name="employeur"
              icon={Briefcase}
              value={formData.employeur || ''}
              onChange={(e) => handleChange('employeur', e.target.value)}
              placeholder="Entreprise (si salarié)"
            />
            {/* Revenu Compact */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Revenu (FCFA)</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-600 mb-1">
                <button type="button" onClick={() => { handleChange('typeRevenu', 'Mensuel'); if (formData.revenuJournalier) { const d = parseFloat(formData.revenuJournalier); if (!isNaN(d) && d > 0) handleChange('revenuMensuel', Math.round(d * 26).toString()); }}}
                  className={`flex-1 py-1 text-[10px] font-medium ${formData.typeRevenu !== 'Journalier' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'}`}>Mensuel</button>
                <button type="button" onClick={() => { handleChange('typeRevenu', 'Journalier'); if (formData.revenuMensuel && !formData.revenuJournalier) { const m = parseFloat(formData.revenuMensuel); if (!isNaN(m) && m > 0) handleChange('revenuJournalier', Math.round(m / 26).toString()); }}}
                  className={`flex-1 py-1 text-[10px] font-medium ${formData.typeRevenu === 'Journalier' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'}`}>Journalier</button>
              </div>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input type="number" value={formData.typeRevenu === 'Journalier' ? formData.revenuJournalier || '' : formData.revenuMensuel || ''}
                  onChange={(e) => { if (formData.typeRevenu === 'Journalier') { handleChange('revenuJournalier', e.target.value); const p = parseFloat(e.target.value); handleChange('revenuMensuel', !isNaN(p) && p > 0 ? Math.round(p * 26).toString() : ''); } else { handleChange('revenuMensuel', e.target.value); }}}
                  placeholder={formData.typeRevenu === 'Journalier' ? '5000' : '150000'} min="0"
                  className="w-full pl-7 pr-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500" />
              </div>
              {formData.typeRevenu === 'Journalier' && formData.revenuJournalier && parseFloat(formData.revenuJournalier) > 0 && (
                <p className="text-[10px] text-slate-500 mt-0.5">{parseFloat(formData.revenuJournalier).toLocaleString()} × 26j = <span className="text-cyan-400">{Math.round(parseFloat(formData.revenuJournalier) * 26).toLocaleString()}</span> F/mois</p>
              )}
            </div>
            <SelectField
              label="Agent Référent"
              name="agentReferentId"
              value={formData.agentReferentId || ''}
              onChange={(e) => handleChange('agentReferentId', e.target.value === '' ? null : e.target.value)}
              options={[{ value: '', label: 'Sélectionner...' }, ...agentsReferents.map(a => ({ value: a.id, label: `${a.prenom} ${a.nom}` }))]}
            />
          </div>
        </div>

        {/* Accès Portail Client - Compact */}
        <div className="flex items-center justify-between p-2.5 bg-slate-800/50 rounded-lg border border-slate-700 opacity-60">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-slate-500" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-300">Accès Portail Client</span>
                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[9px] font-bold rounded-full flex items-center gap-0.5"><Lock size={8} /> Bientôt</span>
              </div>
              {formData.nom && formData.prenom && <p className="text-[10px] text-cyan-500 font-mono">@{generateClientUsername(formData.nom, formData.prenom)}</p>}
            </div>
          </div>
          <div className="w-8 h-4 bg-slate-600 rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-slate-500 rounded-full" /></div>
        </div>

        {/* Photo & Documents Section - Compact Side by Side */}
        <div className="pt-3 border-t border-slate-700/50">
          <div className="grid md:grid-cols-5 gap-4">
            {/* ========== AVATAR SECTION (Smaller) ========== */}
            <div className="md:col-span-2 flex flex-col">
              <div className="flex items-center gap-1.5 mb-2">
                <User size={14} className="text-cyan-400" />
                <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Photo de Profil</h4>
              </div>
              <div className="flex items-start gap-3">
                <div className="relative">
                  {formData.photoProfile ? (
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-600 shadow-lg">
                        <img src={getFileDisplayUrl(formData.photoProfile)} className="w-full h-full object-cover" alt="Profil"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(`${formData.prenom || ''} ${formData.nom || ''}`.trim() || 'Client')}&size=80&background=1e293b&color=94a3b8`; }} />
                      </div>
                      <button type="button" onClick={() => { handleChange('photoProfile', ''); handleDocumentChange('AVATAR', null); }}
                        className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow"><Trash2 size={10} /></button>
                      <button type="button" onClick={() => setIsLivenessOpen(true)}
                        className="absolute bottom-0 right-0 p-1.5 bg-cyan-500 hover:bg-cyan-400 text-white rounded-full shadow"><Camera size={12} /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <SmartDocumentUpload label="" documentType="AVATAR" variant="avatar" isPrivate={false} fileType="profile" entityType="client" entityId={clientEntityId}
                        onUploadComplete={handleAvatarUpload} onRemove={() => { handleChange('photoProfile', ''); handleDocumentChange('AVATAR', null); }} />
                      <button type="button" onClick={() => setIsLivenessOpen(true)} className="absolute -bottom-1 -left-1 p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full shadow border border-slate-600" title="Caméra"><Video size={12} /></button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 flex-1 leading-tight mt-1">Photo visible sur la fiche client et les documents imprimés</p>
              </div>
            </div>

            {/* ========== IDENTITY DOCUMENTS - Compact ========== */}
            <div className="md:col-span-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={14} className="text-cyan-400" />
                <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Pièces d'identité</h4>
              </div>

              {/* ID Type Selector - Compact */}
              <div className="flex gap-1.5 mb-2">
                {ID_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => handleChange('typePiece', value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${formData.typePiece === value ? 'bg-cyan-500 text-white shadow' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    <Icon size={14} />{label}
                  </button>
                ))}
              </div>

              {/* ID Number - Compact */}
              <div className="mb-2">
                <input id="numeroPiece" type="text" value={formData.numeroPiece || ''} onChange={(e) => handleChange('numeroPiece', e.target.value)}
                  placeholder={formData.typePiece === 'CNI' ? 'N° CNI' : formData.typePiece === 'PASSPORT' ? 'N° Passeport' : 'Numéro de pièce'}
                  className={`w-full px-3 py-1.5 bg-slate-800 border rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 ${errors.numeroPiece ? 'border-red-500' : 'border-slate-700'}`} />
                {errors.numeroPiece && <p className="text-[10px] text-red-400 mt-0.5">{errors.numeroPiece}</p>}
              </div>

              {/* Document Upload Grid - Compact */}
              <div className="grid grid-cols-2 gap-2">
                <SmartDocumentUpload label={formData.typePiece === 'PASSPORT' ? 'Page Principale' : 'Recto'} documentType="ID_CARD_FRONT" existingDocument={uploadedDocs.ID_CARD_FRONT}
                  isPrivate={true} fileType="kyc" entityType="client" entityId={clientEntityId} aspectRatio="card" watermarkIcon="front" accept="image/png,image/jpeg,image/jpg,application/pdf"
                  ctaText={formData.typePiece === 'PASSPORT' ? 'Scanner' : 'Scanner le Recto'} onUploadComplete={(doc) => handleDocumentChange('ID_CARD_FRONT', doc)} onRemove={() => handleDocumentChange('ID_CARD_FRONT', null)} />
                <AnimatePresence mode="wait">
                  {showBackDocument ? (
                    <motion.div key="back" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                      <SmartDocumentUpload label="Verso" documentType="ID_CARD_BACK" existingDocument={uploadedDocs.ID_CARD_BACK} isPrivate={true} fileType="kyc" entityType="client" entityId={clientEntityId}
                        aspectRatio="card" watermarkIcon="back" accept="image/png,image/jpeg,image/jpg,application/pdf" ctaText="Scanner le Verso"
                        onUploadComplete={(doc) => handleDocumentChange('ID_CARD_BACK', doc)} onRemove={() => handleDocumentChange('ID_CARD_BACK', null)} />
                    </motion.div>
                  ) : (
                    <motion.div key="proof" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>
                      <SmartDocumentUpload label="Justificatif Domicile" documentType="PROOF_OF_ADDRESS" existingDocument={uploadedDocs.PROOF_OF_ADDRESS} isPrivate={true} fileType="kyc" entityType="client" entityId={clientEntityId}
                        aspectRatio="card" watermarkIcon="scan" accept="image/png,image/jpeg,image/jpg,application/pdf" ctaText="Ajouter"
                        onUploadComplete={(doc) => handleDocumentChange('PROOF_OF_ADDRESS', doc)} onRemove={() => handleDocumentChange('PROOF_OF_ADDRESS', null)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Proof of Address for CNI/Other */}
              <AnimatePresence>
                {showBackDocument && (
                  <motion.div className="mt-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                    <SmartDocumentUpload label="Justificatif de Domicile" documentType="PROOF_OF_ADDRESS" existingDocument={uploadedDocs.PROOF_OF_ADDRESS} isPrivate={true} fileType="kyc" entityType="client" entityId={clientEntityId}
                      aspectRatio="video" watermarkIcon="scan" accept="image/png,image/jpeg,image/jpg,application/pdf" ctaText="Ajouter un justificatif"
                      onUploadComplete={(doc) => handleDocumentChange('PROOF_OF_ADDRESS', doc)} onRemove={() => handleDocumentChange('PROOF_OF_ADDRESS', null)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-700 mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} size="sm">Annuler</Button>
          <Button type="submit" variant="primary" icon={isSubmitting ? undefined : Save} disabled={isSubmitting} size="sm">
            {isSubmitting ? <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Traitement...</span> : client ? 'Mettre à jour' : 'Enregistrer'}
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
