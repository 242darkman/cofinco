import type { ClientWithIdentity } from '@shared/schema';
import { Spinner } from '@/components/ui/Spinner';
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
import { SystemRole } from '@shared/types/roles';
import { usePermissions } from '../auth/ProtectedFeature';
import { agenceApi, employeApi, villeApi, catalogApi } from '../../lib/api-client';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import { resolveStorageUrl, formatPhoneInput, stripPhoneFormat } from '../../lib/format';
import { StatutClient, StatutAgence, SegmentClient, SEGMENT_CLIENT_LABELS } from '@shared/enum/status-constants';
import { useCurrency } from '../../contexts/CurrencyContext';

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

  // Champs d'identité supplémentaires (envoyés à la table users)
  dateNaissance?: string | null;

  // Champs métier client (envoyés à la table clients)
  adresse?: string | null; // Alias pour adresseDomicile
  adresseDomicile?: string | null;
  lieuActivite?: string | null;
  villeId?: string | null;
  numeroPiece?: string | null;
  typePiece?: string | null;
  professionId?: string | null;
  professionAutreTexte?: string | null;
  employeur?: string | null;
  activityTypeId?: string | null;
  revenuMensuel?: string | null;
  revenuJournalier?: string | null;
  typeRevenu?: string | null;
  sectorId?: string | null;
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
  const { label } = useCurrency();
  // Camera State
  const [isLivenessOpen, setIsLivenessOpen] = useState(false);

  // User and Agency Data
  const { user } = useUserProfile();
  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const [agentsReferents, setAgentsReferents] = useState<{ id: string; nom: string; prenom: string }[]>([]);
  const { isAdmin } = usePermissions();

  // Form State
  const [formData, setFormData] = useState<ClientFormData>({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    sexe: null,
    adresse: '',
    adresseDomicile: '',
    lieuActivite: '',
    dateNaissance: '',
    professionId: null,
    professionAutreTexte: null,
    employeur: '',
    revenuMensuel: '',
    revenuJournalier: '',
    typeRevenu: 'Mensuel',
    photoUrl: '',
    photoProfile: '',
    statut: StatutClient.ACTIVE,
    segment: SegmentClient.STANDARD,
    score: 50,
    creditTotal: '0',
    epargneTotal: '0',
    tauxRemboursement: '0',
    pointsFidelite: 0,
    typePiece: 'CNI',
    numeroPiece: '',
    sectorId: null,
    agenceId: null,
    agentReferentId: null,
    documents: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [villesList, setVillesList] = useState<{ id: string; nom: string }[]>([]);
  const [catalogSectors, setCatalogSectors] = useState<{ id: string; nom: string; parentNom?: string | null }[]>([]);

  // Uploaded documents state (structured)
  const [uploadedDocs, setUploadedDocs] = useState<Record<DocumentType, UploadedDocument | null>>({
    ID_CARD_FRONT: null,
    ID_CARD_BACK: null,
    PASSPORT: null,
    DRIVING_LICENSE: null,
    RESIDENT_CARD: null,
    PROOF_OF_ADDRESS: null,
    CONTRACT: null,
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
      PASSPORT: null,
      DRIVING_LICENSE: null,
      RESIDENT_CARD: null,
      PROOF_OF_ADDRESS: null,
      CONTRACT: null,
      AVATAR: null,
      OTHER: null,
    };

    // Try to parse from documents JSONB first
    if (clientData.documents && Array.isArray(clientData.documents)) {
      clientData.documents.forEach((doc: any) => {
        const docType = doc.documentType;
        if (docType && docs.hasOwnProperty(docType)) {
          docs[docType as DocumentType] = {
            id: doc.id || crypto.randomUUID(),
            documentType: docType,
            documentName: doc.documentName || 'Document',
            documentUrl: doc.documentUrl || '',
            status: doc.status || 'pending',
            createdAt: doc.createdAt || new Date().toISOString(),
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
        villeId: c.villeId || '',
        lieuActivite: c.lieuActivite || '',
        dateNaissance: c.dateNaissance || '',
        professionId: c.professionId || null,
        professionAutreTexte: c.professionAutreTexte || null,
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
        typePiece: c.typePiece || 'CNI',
        numeroPiece: c.numeroPiece || '',
        sectorId: c.sectorId || null,
        activityTypeId: c.activityTypeId || null,
        agenceId: c.agenceId || null,
        agentReferentId: c.agentReferentId || null,
        documents: c.documents || [],
      });

      // Parse existing documents
      const parsedDocs = parseExistingDocuments(c);
      setUploadedDocs(parsedDocs);
    }
  }, [client, parseExistingDocuments]);

  useEffect(() => {
    villeApi.getAll({ actif: true }).then(setVillesList).catch(console.error);
    catalogApi.getOptions().then((data: any) => {
      setCatalogSectors((data.sectors || []).map((s: any) => ({ id: s.id, nom: s.parentNom ? `${s.nom} (${s.parentNom})` : s.nom })));
    }).catch(console.error);
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
            <label className="block text-[11px] font-semibold text-content-muted mb-1">Téléphone <span className="text-status-danger">*</span></label>
            <div className="relative">
              <Phone className="absolute left-2 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
              <input
                type="tel"
                name="telephone-input"
                value={formatPhoneInput(formData.telephone || '')}
                onChange={(e) => handleChange('telephone', stripPhoneFormat(e.target.value))}
                placeholder="+242 06 XXX XX XX"
                className="w-full pl-7 pr-2 py-1.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            {errors.telephone && <p className="mt-0.5 text-[10px] text-status-danger">{errors.telephone}</p>}
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
          <SelectField
            label="Ville"
            name="villeId"
            value={formData.villeId || ''}
            onChange={(e) => handleChange('villeId', e.target.value)}
            options={[
              { value: '', label: 'Sélectionner...' },
              ...villesList.map((v: any) => ({ value: v.id, label: v.nom })),
            ]}
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
            name="sectorId"
            value={formData.sectorId || ''}
            onChange={(e) => handleChange('sectorId', e.target.value === '' ? null : e.target.value)}
            options={[{ value: '', label: 'Sélectionner...' }, ...catalogSectors.map(s => ({ value: s.id, label: s.nom }))]}
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
          {/* Segment is auto-calculated by the scoring engine */}
          {client && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-content-secondary">Segment</label>
              <div className="flex items-center h-[38px]">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                  formData.segment === SegmentClient.VIP ? 'bg-status-warning-bg text-status-warning' :
                  formData.segment === SegmentClient.PREMIUM ? 'bg-status-info-bg text-status-info' :
                  formData.segment === SegmentClient.RISQUE ? 'bg-status-danger-bg text-status-danger' :
                  'bg-surface-subtle text-content-secondary'
                }`}>
                  {SEGMENT_CLIENT_LABELS[formData.segment as keyof typeof SEGMENT_CLIENT_LABELS] || formData.segment || 'Standard'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Section Profil Professionnel - Compact */}
        <div className="pt-3 border-t border-edge-subtle">
          <div className="flex items-center gap-1.5 mb-2">
            <Briefcase size={14} className="text-accent" />
            <h4 className="text-xs font-semibold text-content-primary uppercase tracking-wide">Profil Professionnel</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FormField
              label="Profession"
              name="professionAutreTexte"
              icon={Briefcase}
              value={formData.professionAutreTexte || ''}
              onChange={(e) => handleChange('professionAutreTexte', e.target.value)}
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
              <label className="block text-[11px] font-semibold text-content-muted mb-1">{label('Revenu')}</label>
              <div className="flex rounded-lg overflow-hidden border border-edge-strong mb-1">
                <button type="button" onClick={() => { handleChange('typeRevenu', 'Mensuel'); if (formData.revenuJournalier) { const d = parseFloat(formData.revenuJournalier); if (!isNaN(d) && d > 0) handleChange('revenuMensuel', Math.round(d * 26).toString()); }}}
                  className={`flex-1 py-1 text-[10px] font-medium ${formData.typeRevenu !== 'Journalier' ? 'bg-accent-secondary text-content-primary' : 'bg-surface-elevated text-content-muted'}`}>Mensuel</button>
                <button type="button" onClick={() => { handleChange('typeRevenu', 'Journalier'); if (formData.revenuMensuel && !formData.revenuJournalier) { const m = parseFloat(formData.revenuMensuel); if (!isNaN(m) && m > 0) handleChange('revenuJournalier', Math.round(m / 26).toString()); }}}
                  className={`flex-1 py-1 text-[10px] font-medium ${formData.typeRevenu === 'Journalier' ? 'bg-accent-secondary text-content-primary' : 'bg-surface-elevated text-content-muted'}`}>Journalier</button>
              </div>
              <div className="relative">
                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
                <input inputMode="numeric" pattern="[0-9]*" value={formData.typeRevenu === 'Journalier' ? formData.revenuJournalier || '' : formData.revenuMensuel || ''}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); if (formData.typeRevenu === 'Journalier') { handleChange('revenuJournalier', v); const p = parseFloat(v); handleChange('revenuMensuel', !isNaN(p) && p > 0 ? Math.round(p * 26).toString() : ''); } else { handleChange('revenuMensuel', v); }}}
                  placeholder={formData.typeRevenu === 'Journalier' ? '5000' : '150000'}
                  className="w-full pl-7 pr-2 py-1.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-accent" />
              </div>
              {formData.typeRevenu === 'Journalier' && formData.revenuJournalier && parseFloat(formData.revenuJournalier) > 0 && (
                <p className="text-[10px] text-content-muted mt-0.5">{parseFloat(formData.revenuJournalier).toLocaleString()} × 26j = <span className="text-accent">{Math.round(parseFloat(formData.revenuJournalier) * 26).toLocaleString()}</span> F/mois</p>
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
        <div className="flex items-center justify-between p-2.5 bg-surface/50 rounded-lg border border-edge opacity-60">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-content-muted" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-content-secondary">Accès Portail Client</span>
                <span className="px-1.5 py-0.5 bg-status-warning-bg text-status-warning text-[9px] font-bold rounded-full flex items-center gap-0.5"><Lock size={8} /> Bientôt</span>
              </div>
              {formData.nom && formData.prenom && <p className="text-[10px] text-accent font-mono">@{generateClientUsername(formData.nom, formData.prenom)}</p>}
            </div>
          </div>
          <div className="w-8 h-4 bg-surface-subtle rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-surface-muted0 rounded-full" /></div>
        </div>

        {/* Photo & Documents Section - Compact Side by Side */}
        <div className="pt-3 border-t border-edge-subtle">
          <div className="grid md:grid-cols-5 gap-4">
            {/* ========== AVATAR SECTION (Smaller) ========== */}
            <div className="md:col-span-2 flex flex-col">
              <div className="flex items-center gap-1.5 mb-2">
                <User size={14} className="text-accent" />
                <h4 className="text-xs font-semibold text-content-primary uppercase tracking-wide">Photo de Profil</h4>
              </div>
              <div className="flex items-start gap-3">
                <div className="relative">
                  {formData.photoProfile ? (
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-edge-strong shadow-lg">
                        <img src={getFileDisplayUrl(formData.photoProfile)} className="w-full h-full object-cover" alt="Profil"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(`${formData.prenom || ''} ${formData.nom || ''}`.trim() || 'Client')}&size=80&background=1e293b&color=94a3b8`; }} />
                      </div>
                      <button type="button" onClick={() => { handleChange('photoProfile', ''); handleDocumentChange('AVATAR', null); }}
                        className="absolute -top-1 -right-1 p-1 bg-status-danger text-white rounded-full hover:bg-status-danger shadow"><Trash2 size={10} /></button>
                      <button type="button" onClick={() => setIsLivenessOpen(true)}
                        className="absolute bottom-0 right-0 p-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-full shadow"><Camera size={12} /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <SmartDocumentUpload label="" documentType="AVATAR" variant="avatar" isPrivate={false} fileType="profile" entityType="client" entityId={clientEntityId}
                        onUploadComplete={handleAvatarUpload} onRemove={() => { handleChange('photoProfile', ''); handleDocumentChange('AVATAR', null); }} />
                      <button type="button" onClick={() => setIsLivenessOpen(true)} className="absolute -bottom-1 -left-1 p-1.5 bg-surface-elevated hover:bg-surface-subtle text-content-secondary rounded-full shadow border border-edge-strong" title="Caméra"><Video size={12} /></button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-content-muted flex-1 leading-tight mt-1">Photo visible sur la fiche client et les documents imprimés</p>
              </div>
            </div>

            {/* ========== IDENTITY DOCUMENTS - Compact ========== */}
            <div className="md:col-span-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={14} className="text-accent" />
                <h4 className="text-xs font-semibold text-content-primary uppercase tracking-wide">Pièces d'identité</h4>
              </div>

              {/* ID Type Selector - Compact */}
              <div className="flex gap-1.5 mb-2">
                {ID_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => handleChange('typePiece', value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${formData.typePiece === value ? 'bg-accent-secondary text-content-primary shadow' : 'bg-surface text-content-muted hover:bg-surface-elevated'}`}>
                    <Icon size={14} />{label}
                  </button>
                ))}
              </div>

              {/* ID Number - Compact */}
              <div className="mb-2">
                <input id="numeroPiece" type="text" value={formData.numeroPiece || ''} onChange={(e) => handleChange('numeroPiece', e.target.value)}
                  placeholder={formData.typePiece === 'CNI' ? 'N° CNI' : formData.typePiece === 'PASSPORT' ? 'N° Passeport' : 'Numéro de pièce'}
                  className={`w-full px-3 py-1.5 bg-surface border rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-accent ${errors.numeroPiece ? 'border-status-danger' : 'border-edge'}`} />
                {errors.numeroPiece && <p className="text-[10px] text-status-danger mt-0.5">{errors.numeroPiece}</p>}
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
        <div className="flex justify-end gap-2 pt-4 border-t border-edge mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} size="sm">Annuler</Button>
          <Button type="submit" variant="primary" icon={isSubmitting ? undefined : Save} disabled={isSubmitting} size="sm">
            {isSubmitting ? <span className="flex items-center gap-1.5"><Spinner size="xs" tone="onAccent" />Traitement...</span> : client ? 'Mettre à jour' : 'Enregistrer'}
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
