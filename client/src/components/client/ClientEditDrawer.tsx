import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { Save, User, Mail, Phone, MapPin, Briefcase, Calendar, DollarSign, Camera, Trash2, Video, FileText, Users, Plus, X } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '../ui/sheet';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import { FormField, SelectField, Button } from '../ui';
import SmartDocumentUpload, { type UploadedDocument, type DocumentType } from '../ui/SmartDocumentUpload';
import FaceLivenessCapture from '../security/FaceLivenessCapture';
import { useUserProfile } from '../../hooks/useUserProfile';
import { SystemRole } from '@shared/types/roles';
import { usePermissions } from '../auth/ProtectedFeature';
import { agenceApi, employeApi, villeApi, catalogApi } from '../../lib/api-client';
import { useEntityUpload } from '../../hooks/useEntityUpload';
import { resolveStorageUrl } from '../../lib/format';
import {
  StatutClient, StatutAgence, SegmentClient, SEGMENT_CLIENT_LABELS,
  SITUATION_MATRIMONIALE_OPTIONS, NIVEAU_EDUCATION_OPTIONS, STATUT_LOGEMENT_OPTIONS,
  SOURCE_FONDS_OPTIONS, RELATION_REFERENCE_OPTIONS,
} from '@shared/enum/status-constants';
import { useCurrency } from '../../contexts/CurrencyContext';

interface ClientEditDrawerProps {
  client: ClientWithIdentity;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

interface ReferencePersonne {
  nom: string;
  prenom?: string;
  telephone: string;
  relation: string;
  adresse?: string;
  profession?: string;
}

const MIN_AGE = 18;
const getMaxBirthDate = () => {
  const today = new Date();
  today.setFullYear(today.getFullYear() - MIN_AGE);
  return today.toISOString().split('T')[0];
};

const ID_TYPE_OPTIONS = [
  { value: 'CNI', label: 'CNI' },
  { value: 'PASSPORT', label: 'Passeport' },
  { value: 'PERMIS_CONDUIRE', label: 'Permis de conduire' },
  { value: 'CARTE_RESIDENT', label: 'Carte de resident' },
  { value: 'OTHER', label: 'Autre' },
];

const SEXE_OPTIONS = [
  { value: 'M', label: 'Masculin' },
  { value: 'F', label: 'Feminin' },
];

export default function ClientEditDrawer({ client, isOpen, onClose, onSave }: ClientEditDrawerProps) {
  const { label: currencyLabel } = useCurrency();
  const { user } = useUserProfile();
  const { isAdmin } = usePermissions();

  const [isLivenessOpen, setIsLivenessOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reference data
  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const [agentsReferents, setAgentsReferents] = useState<{ id: string; nom: string; prenom: string }[]>([]);
  const [villesList, setVillesList] = useState<{ id: string; nom: string }[]>([]);
  const [catalogSectors, setCatalogSectors] = useState<{ id: string; nom: string }[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [references, setReferences] = useState<ReferencePersonne[]>([]);

  // Load client data into form
  useEffect(() => {
    if (client && isOpen) {
      const c = client as any;
      setFormData({
        nom: c.nom || '',
        prenom: c.prenom || '',
        email: c.email || '',
        telephone: c.telephone || '',
        sexe: c.sexe || '',
        dateNaissance: c.dateNaissance ? (typeof c.dateNaissance === 'string' ? c.dateNaissance.split('T')[0] : new Date(c.dateNaissance).toISOString().split('T')[0]) : '',
        adresseDomicile: c.adresseDomicile || '',
        lieuActivite: c.lieuActivite || '',
        villeId: c.villeId || '',
        statutLogement: c.statutLogement || '',
        professionId: c.professionId || '',
        professionAutreTexte: c.professionAutreTexte || '',
        employeur: c.employeur || '',
        activityTypeId: c.activityTypeId || '',
        sectorId: c.sectorId || '',
        ancienneteActiviteMois: c.ancienneteActiviteMois ?? '',
        sourceFonds: c.sourceFonds || '',
        revenuMensuel: c.revenuMensuel || '',
        revenuJournalier: c.revenuJournalier || '',
        typeRevenu: c.typeRevenu || 'Mensuel',
        segment: c.segment || SegmentClient.STANDARD,
        agenceId: c.agenceId || '',
        agentReferentId: c.agentReferentId || '',
        typePiece: c.typePiece || 'CNI',
        numeroPiece: c.numeroPiece || '',
        photoProfile: c.photoProfile || '',
        statut: c.statut || StatutClient.ACTIVE,
        situationMatrimoniale: c.situationMatrimoniale || '',
        nombrePersonnesCharge: c.nombrePersonnesCharge ?? '',
        niveauEducation: c.niveauEducation || '',
      });
      setReferences(c.referencesPersonnes || []);
      setErrors({});
    }
  }, [client, isOpen]);

  // Load reference data
  useEffect(() => {
    if (!isOpen) return;
    villeApi.getAll({ actif: true }).then(setVillesList).catch(console.error);
    catalogApi.getOptions().then((data: any) => {
      setCatalogSectors((data.sectors || []).map((s: any) => ({ id: s.id, nom: s.parentNom ? `${s.nom} (${s.parentNom})` : s.nom })));
    }).catch(console.error);

    employeApi.getAll().then((data: any) => {
      const agents = (data || []).filter((emp: any) => {
        const role = emp.roleSystem || emp.user?.role;
        return role === 'terrain' || role === 'chef_agence' || role === SystemRole.AGENT_TERRAIN || role === SystemRole.CHEF_AGENCE;
      }).map((emp: any) => ({
        id: emp.id,
        nom: emp.user?.nom || emp.nom || '',
        prenom: emp.user?.prenom || emp.prenom || '',
      }));
      setAgentsReferents(agents);
    }).catch(console.error);

    if (isAdmin) {
      agenceApi.getAll({ statut: StatutAgence.ACTIVE }).then(setAgences).catch(console.error);
    }
  }, [isOpen, isAdmin]);

  // Entity upload for profile photo
  const { uploadFile: uploadProfile } = useEntityUpload({
    fileType: 'profile',
    entityType: 'client',
    entityId: client?.id || '',
    onError: (err) => console.error('Profile upload error', err),
  });

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleProfileCapture = async (imageDataUrl: string) => {
    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadProfile(file);
      if (url) handleChange('photoProfile', url);
    } catch (e) {
      console.error('Capture upload failed', e);
    }
  };

  const handleAvatarUpload = useCallback((doc: UploadedDocument) => {
    handleChange('photoProfile', doc.documentUrl);
  }, []);

  // Reference persons management
  const addReference = () => {
    if (references.length >= 3) return;
    setReferences(prev => [...prev, { nom: '', telephone: '', relation: 'AUTRE' }]);
  };

  const updateReference = (idx: number, field: keyof ReferencePersonne, value: string) => {
    setReferences(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeReference = (idx: number) => {
    setReferences(prev => prev.filter((_, i) => i !== idx));
  };

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.nom?.trim()) newErrors.nom = 'Le nom est requis';
    if (!formData.telephone) newErrors.telephone = 'Le telephone est requis';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email invalide';
    if (isAdmin && !formData.agenceId) newErrors.agenceId = "L'agence est requise pour les admins";

    if ((formData.typePiece === 'CNI' || formData.typePiece === 'PASSPORT') && !formData.numeroPiece?.trim()) {
      newErrors.numeroPiece = formData.typePiece === 'CNI' ? 'Le N CNI est requis' : 'Le N Passeport est requis';
    }

    if (formData.dateNaissance) {
      const birthDate = new Date(formData.dateNaissance);
      const today = new Date();
      const age = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < MIN_AGE) {
        newErrors.dateNaissance = `Le client doit avoir au moins ${MIN_AGE} ans`;
      }
    }

    if (formData.typeRevenu === 'Journalier' && formData.revenuJournalier) {
      const revenu = parseFloat(formData.revenuJournalier);
      if (isNaN(revenu) || revenu < 0) newErrors.revenuJournalier = 'Le revenu doit etre un nombre positif';
    } else if (formData.revenuMensuel) {
      const revenu = parseFloat(formData.revenuMensuel);
      if (isNaN(revenu) || revenu < 0) newErrors.revenuMensuel = 'Le revenu doit etre un nombre positif';
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
          excludeClientId: client?.id,
        }),
      });
      const data = await res.json();
      if (!data.available) {
        setErrors(prev => ({ ...prev, [data.field]: data.message }));
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    const isUnique = await checkUniqueness();
    if (!isUnique) {
      setIsSubmitting(false);
      return;
    }

    try {
      const finalData = {
        ...formData,
        referencesPersonnes: references.filter(r => r.nom && r.telephone),
        nombrePersonnesCharge: formData.nombrePersonnesCharge !== '' ? parseInt(formData.nombrePersonnesCharge) : null,
        ancienneteActiviteMois: formData.ancienneteActiviteMois !== '' ? parseInt(formData.ancienneteActiviteMois) : null,
        agenceId: formData.agenceId || null,
        agentReferentId: formData.agentReferentId || null,
        professionId: formData.professionId || null,
        sectorId: formData.sectorId || null,
        activityTypeId: formData.activityTypeId || null,
        villeId: formData.villeId || null,
      };
      await onSave(finalData);
      setIsSubmitting(false);
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-surface">
          {/* Header */}
          <div className="px-6 py-4 border-b border-edge-subtle shrink-0">
            <SheetHeader>
              <SheetTitle className="text-content-primary">Modifier le client</SheetTitle>
              <SheetDescription className="text-content-muted text-xs">
                Modifiez les informations du client. Les documents KYC se gerent dans l'onglet dedie.
              </SheetDescription>
            </SheetHeader>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 pro-scrollbar">
            <Accordion type="multiple" defaultValue={['identite']} className="space-y-0">

              {/* 1. Identite */}
              <AccordionItem value="identite">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-accent" />
                    <span>Identite</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Nom *" name="nom" error={errors.nom} icon={User} value={formData.nom || ''} onChange={(e) => handleChange('nom', e.target.value)} required />
                    <FormField label="Prenom" name="prenom" icon={User} value={formData.prenom || ''} onChange={(e) => handleChange('prenom', e.target.value)} />
                    <FormField label="Email" name="email" error={errors.email} icon={Mail} type="email" value={formData.email || ''} onChange={(e) => handleChange('email', e.target.value)} />
                    <div>
                      <label className="block text-[11px] font-semibold text-content-muted mb-1">Telephone *</label>
                      <div className="flex gap-1">
                        <div className="px-2 py-1.5 bg-surface border border-edge-strong rounded-lg text-xs font-semibold text-content-secondary flex items-center">+242</div>
                        <div className="relative flex-1">
                          <Phone className="absolute left-2 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
                          <input
                            type="tel"
                            value={(formData.telephone || '').replace('+242', '').trim()}
                            onChange={(e) => {
                              const num = e.target.value.replace(/[^\d]/g, '');
                              handleChange('telephone', '+242' + num);
                            }}
                            className="w-full pl-7 pr-2 py-1.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-accent transition-colors"
                            maxLength={9}
                          />
                        </div>
                      </div>
                      {errors.telephone && <p className="mt-0.5 text-[10px] text-status-danger">{errors.telephone}</p>}
                    </div>
                    <SelectField label="Sexe" name="sexe" value={formData.sexe || ''} onChange={(e) => handleChange('sexe', e.target.value || null)} options={[{ value: '', label: 'Selectionner...' }, ...SEXE_OPTIONS]} />
                    <FormField label="Date de naissance" name="dateNaissance" type="date" icon={Calendar} value={formData.dateNaissance || ''} onChange={(e) => handleChange('dateNaissance', e.target.value)} error={errors.dateNaissance} max={getMaxBirthDate()} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 2. Adresse & Localisation */}
              <AccordionItem value="adresse">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-status-info" />
                    <span>Adresse & Localisation</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Adresse domicile" name="adresseDomicile" icon={MapPin} value={formData.adresseDomicile || ''} onChange={(e) => handleChange('adresseDomicile', e.target.value)} />
                    <FormField label="Lieu d'activite" name="lieuActivite" icon={MapPin} value={formData.lieuActivite || ''} onChange={(e) => handleChange('lieuActivite', e.target.value)} />
                    <SelectField label="Ville" name="villeId" value={formData.villeId || ''} onChange={(e) => handleChange('villeId', e.target.value || null)} options={[{ value: '', label: 'Selectionner...' }, ...villesList.map(v => ({ value: v.id, label: v.nom }))]} />
                    <SelectField label="Logement" name="statutLogement" value={formData.statutLogement || ''} onChange={(e) => handleChange('statutLogement', e.target.value || null)} options={[{ value: '', label: 'Selectionner...' }, ...STATUT_LOGEMENT_OPTIONS]} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 3. Professionnel */}
              <AccordionItem value="professionnel">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-status-success" />
                    <span>Professionnel</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Profession" name="professionAutreTexte" icon={Briefcase} value={formData.professionAutreTexte || ''} onChange={(e) => handleChange('professionAutreTexte', e.target.value)} />
                    <FormField label="Employeur" name="employeur" icon={Briefcase} value={formData.employeur || ''} onChange={(e) => handleChange('employeur', e.target.value)} />
                    <SelectField label="Secteur d'activite" name="sectorId" value={formData.sectorId || ''} onChange={(e) => handleChange('sectorId', e.target.value || null)} options={[{ value: '', label: 'Selectionner...' }, ...catalogSectors.map(s => ({ value: s.id, label: s.nom }))]} />
                    <FormField label="Anciennete (mois)" name="ancienneteActiviteMois" type="number" value={formData.ancienneteActiviteMois ?? ''} onChange={(e) => handleChange('ancienneteActiviteMois', e.target.value)} />
                    <SelectField label="Source des fonds" name="sourceFonds" value={formData.sourceFonds || ''} onChange={(e) => handleChange('sourceFonds', e.target.value || null)} options={[{ value: '', label: 'Selectionner...' }, ...SOURCE_FONDS_OPTIONS]} />
                    <div>
                      <label className="block text-[11px] font-semibold text-content-muted mb-1">Revenu ({formData.typeRevenu === 'Journalier' ? 'journalier' : 'mensuel'})</label>
                      <div className="flex rounded-lg overflow-hidden border border-edge-strong mb-1">
                        <button type="button" onClick={() => handleChange('typeRevenu', 'Mensuel')}
                          className={`flex-1 py-1 text-[10px] font-medium transition-colors ${formData.typeRevenu !== 'Journalier' ? 'bg-accent-secondary text-content-primary' : 'bg-surface-elevated text-content-muted'}`}>Mensuel</button>
                        <button type="button" onClick={() => handleChange('typeRevenu', 'Journalier')}
                          className={`flex-1 py-1 text-[10px] font-medium transition-colors ${formData.typeRevenu === 'Journalier' ? 'bg-accent-secondary text-content-primary' : 'bg-surface-elevated text-content-muted'}`}>Journalier</button>
                      </div>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-content-muted" size={14} />
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={formData.typeRevenu === 'Journalier' ? formData.revenuJournalier || '' : formData.revenuMensuel || ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            if (formData.typeRevenu === 'Journalier') {
                              handleChange('revenuJournalier', v);
                              const p = parseFloat(v);
                              handleChange('revenuMensuel', !isNaN(p) && p > 0 ? Math.round(p * 26).toString() : '');
                            } else {
                              handleChange('revenuMensuel', v);
                            }
                          }}
                          className="w-full pl-7 pr-2 py-1.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary text-sm placeholder:text-content-muted focus:outline-none focus:border-accent"
                        />
                      </div>
                      {errors.revenuMensuel && <p className="text-[10px] text-status-danger mt-0.5">{errors.revenuMensuel}</p>}
                      {errors.revenuJournalier && <p className="text-[10px] text-status-danger mt-0.5">{errors.revenuJournalier}</p>}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 4. Classification & Organisation */}
              <AccordionItem value="classification">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-status-warning" />
                    <span>Classification</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-3">
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
                    {isAdmin && (
                      <SelectField label="Agence *" name="agenceId" value={formData.agenceId || ''} error={errors.agenceId}
                        onChange={(e) => handleChange('agenceId', e.target.value || null)}
                        options={[{ value: '', label: 'Selectionner...' }, ...agences.map(a => ({ value: a.id, label: a.nom }))]}
                      />
                    )}
                    <SelectField label="Agent referent" name="agentReferentId" value={formData.agentReferentId || ''}
                      onChange={(e) => handleChange('agentReferentId', e.target.value || null)}
                      options={[{ value: '', label: 'Selectionner...' }, ...agentsReferents.map(a => ({ value: a.id, label: `${a.prenom} ${a.nom}` }))]}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 5. Photo de profil */}
              <AccordionItem value="photo">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <Camera size={16} className="text-accent" />
                    <span>Photo de profil</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      {formData.photoProfile ? (
                        <div className="relative">
                          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-edge-strong shadow-lg">
                            <img src={resolveStorageUrl(formData.photoProfile)} className="w-full h-full object-cover" alt="Profil"
                              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(`${formData.prenom || ''} ${formData.nom || ''}`.trim() || 'Client')}&size=80&background=1e293b&color=94a3b8`; }} />
                          </div>
                          <button type="button" onClick={() => handleChange('photoProfile', '')}
                            className="absolute -top-1 -right-1 p-1 bg-status-danger text-white rounded-full hover:bg-status-danger shadow"><Trash2 size={10} /></button>
                          <button type="button" onClick={() => setIsLivenessOpen(true)}
                            className="absolute bottom-0 right-0 p-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-full shadow"><Camera size={12} /></button>
                        </div>
                      ) : (
                        <div className="relative">
                          <SmartDocumentUpload label="" documentType="AVATAR" variant="avatar" isPrivate={false} fileType="profile" entityType="client" entityId={client?.id || ''}
                            onUploadComplete={handleAvatarUpload} onRemove={() => handleChange('photoProfile', '')} />
                          <button type="button" onClick={() => setIsLivenessOpen(true)}
                            className="absolute -bottom-1 -left-1 p-1.5 bg-surface-elevated hover:bg-surface-subtle text-content-secondary rounded-full shadow border border-edge-strong" title="Camera"><Video size={12} /></button>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-content-muted leading-tight mt-2">Photo visible sur la fiche client et les documents imprimes.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 6. Piece d'identite */}
              <AccordionItem value="piece">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-status-warning" />
                    <span>Piece d'identite</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    <SelectField label="Type de piece" name="typePiece" value={formData.typePiece || 'CNI'}
                      onChange={(e) => handleChange('typePiece', e.target.value)}
                      options={ID_TYPE_OPTIONS}
                    />
                    <FormField label="Numero de piece" name="numeroPiece" error={errors.numeroPiece}
                      value={formData.numeroPiece || ''}
                      onChange={(e) => handleChange('numeroPiece', e.target.value)}
                      placeholder={formData.typePiece === 'CNI' ? 'N CNI' : 'N Piece'}
                    />
                    <p className="text-[10px] text-content-muted">Les documents KYC (scans, justificatifs) se gerent dans l'onglet Documents KYC.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 7. Situation personnelle */}
              <AccordionItem value="situation">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-accent" />
                    <span>Situation personnelle</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="Situation matrimoniale" name="situationMatrimoniale" value={formData.situationMatrimoniale || ''}
                      onChange={(e) => handleChange('situationMatrimoniale', e.target.value || null)}
                      options={[{ value: '', label: 'Selectionner...' }, ...SITUATION_MATRIMONIALE_OPTIONS]}
                    />
                    <FormField label="Personnes a charge" name="nombrePersonnesCharge" type="number"
                      value={formData.nombrePersonnesCharge ?? ''}
                      onChange={(e) => handleChange('nombrePersonnesCharge', e.target.value)}
                    />
                    <SelectField label="Niveau d'education" name="niveauEducation" value={formData.niveauEducation || ''}
                      onChange={(e) => handleChange('niveauEducation', e.target.value || null)}
                      options={[{ value: '', label: 'Selectionner...' }, ...NIVEAU_EDUCATION_OPTIONS]}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 8. References personnelles */}
              <AccordionItem value="references">
                <AccordionTrigger className="gap-3">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-status-info" />
                    <span>References personnelles ({references.length}/3)</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {references.map((ref, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-edge-subtle bg-surface-subtle/20 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-content-primary">Reference {idx + 1}</span>
                          <button type="button" onClick={() => removeReference(idx)} className="p-1 rounded hover:bg-status-danger-bg transition-colors">
                            <X size={14} className="text-status-danger" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <FormField label="Nom *" name={`ref-nom-${idx}`} value={ref.nom} onChange={(e) => updateReference(idx, 'nom', e.target.value)} />
                          <FormField label="Prenom" name={`ref-prenom-${idx}`} value={ref.prenom || ''} onChange={(e) => updateReference(idx, 'prenom', e.target.value)} />
                          <FormField label="Telephone *" name={`ref-tel-${idx}`} value={ref.telephone} onChange={(e) => updateReference(idx, 'telephone', e.target.value)} />
                          <SelectField label="Relation" name={`ref-rel-${idx}`} value={ref.relation} onChange={(e) => updateReference(idx, 'relation', e.target.value)} options={RELATION_REFERENCE_OPTIONS} />
                          <FormField label="Adresse" name={`ref-adr-${idx}`} value={ref.adresse || ''} onChange={(e) => updateReference(idx, 'adresse', e.target.value)} />
                          <FormField label="Profession" name={`ref-prof-${idx}`} value={ref.profession || ''} onChange={(e) => updateReference(idx, 'profession', e.target.value)} />
                        </div>
                      </div>
                    ))}

                    {references.length < 3 && (
                      <button
                        type="button"
                        onClick={addReference}
                        className="flex items-center gap-2 w-full p-3 rounded-lg border-2 border-dashed border-edge-subtle text-content-muted hover:border-accent hover:text-accent transition-colors text-sm"
                      >
                        <Plus size={16} />
                        Ajouter une reference
                      </button>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          </div>

          {/* Footer - Sticky */}
          <div className="px-6 py-4 border-t border-edge-subtle shrink-0 flex items-center justify-end gap-3 bg-surface">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
            <Button type="button" variant="primary" icon={isSubmitting ? undefined : Save} disabled={isSubmitting} onClick={handleSubmit}>
              {isSubmitting ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Traitement...
                </span>
              ) : 'Enregistrer'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Liveness Camera */}
      <FaceLivenessCapture
        isOpen={isLivenessOpen}
        onClose={() => setIsLivenessOpen(false)}
        onCapture={handleProfileCapture}
        title="Photo de Profil"
      />
    </>
  );
}
