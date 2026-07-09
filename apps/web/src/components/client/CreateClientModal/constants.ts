import { User, MapPin, Briefcase, DollarSign, Users, FileText } from 'lucide-react';
import type { StepDefinition, CreateClientFormData, FileState, ReferencePersonne } from './types';

export const STEPS: StepDefinition[] = [
  {
    num: 1, key: 'identite', label: 'Identité', shortLabel: 'Identité',
    icon: User, requiredFields: ['nom', 'prenom', 'dateNaissance', 'paysNaissanceId', 'nationaliteId', 'lieuNaissanceLocalityId'],
  },
  {
    num: 2, key: 'contact', label: 'Contact & Adresse', shortLabel: 'Contact',
    icon: MapPin, requiredFields: ['telephoneRaw', 'adresseDomicile', 'paysResidenceId', 'villeId', 'statutLogement'],
  },
  {
    num: 3, key: 'profil', label: 'Profil Socio-Pro', shortLabel: 'Profil',
    icon: Briefcase, requiredFields: ['situationMatrimoniale', 'nombrePersonnesCharge'],
  },
  {
    num: 4, key: 'financier', label: 'Finances', shortLabel: 'Finances',
    icon: DollarSign, requiredFields: ['sourceFonds', 'sectorId'],
  },
  {
    num: 5, key: 'references', label: 'Référents', shortLabel: 'Référents',
    icon: Users, requiredFields: ['consentementDonnees'],
  },
  {
    num: 6, key: 'kyc', label: 'Documents KYC', shortLabel: 'Documents',
    icon: FileText, requiredFields: ['typePiece', 'numeroPiece', 'paysEmissionId'],
  },
];

export const TOTAL_STEPS = STEPS.length;

export const AUTO_SAVE_KEY = 'microflex_create_client_draft';

export const EMPTY_REFERENCE: ReferencePersonne = {
  nom: '', prenom: '', telephone: '', relation: '', adresse: '', profession: '',
};

export const DEFAULT_FORM_DATA: CreateClientFormData = {
  // Étape 1
  nom: '', prenom: '', sexe: 'M', dateNaissance: '', lieuNaissance: '',
  lieuNaissanceLocalityId: '', lieuNaissanceLocalityType: '',
  nationaliteId: '', paysNaissanceId: '',
  // Étape 2
  telephoneRaw: '', telephone: '', email: '', adresseDomicile: '',
  villeId: '', localityType: '', paysResidenceId: '', statutLogement: '',
  // Étape 3
  situationMatrimoniale: '', nombrePersonnesCharge: '', niveauEducation: '',
  typeClient: 'PARTICULIER', professionId: '', professionAutreTexte: '', employeur: '', activityTypeId: '',
  ancienneteActiviteMois: '',
  dateDebutActivite: '',
  // Étape 4
  sourceFonds: '', typeRevenu: 'Mensuel', revenuMensuel: '', revenuJournalier: '',
  sectorId: '', segment: 'Standard', agenceId: '', agentReferentId: '',  // segment kept in type but not editable (auto-calculated)
  clientOrigin: 'OTHER',
  // Étape 5
  referencesPersonnes: [], isPep: false, pepDetails: '', consentementDonnees: false,
  // Étape 6
  typePiece: 'CNI', numeroPiece: '', dateExpirationPiece: '', paysEmissionId: '',
};

export const DEFAULT_FILES: FileState = {
  photo: null, idFront: null, idBack: null, proofOfAddress: null,
};

/**
 * Poids des champs pour le calcul de complétude.
 * Obligatoire = 3, important = 2, optionnel = 1
 */
export const FIELD_WEIGHTS: Record<string, number> = {
  // Obligatoire (3)
  nom: 3, prenom: 3, telephoneRaw: 3,
  dateNaissance: 3, paysNaissanceId: 3, nationaliteId: 3, lieuNaissance: 3,
  adresseDomicile: 3, paysResidenceId: 3, villeId: 3, statutLogement: 3,
  situationMatrimoniale: 3, nombrePersonnesCharge: 3,
  sourceFonds: 3, sectorId: 3, revenuMensuel: 3,
  typePiece: 3, numeroPiece: 3, paysEmissionId: 3,
  consentementDonnees: 3,
  // Important (2)
  sexe: 2, professionId: 2, employeur: 2, typeClient: 2,
  dateExpirationPiece: 2,
  referencesPersonnes: 2,
  file_idFront: 2, file_photo: 1, file_proofOfAddress: 1,
  // Optionnel (1)
  email: 1, activityTypeId: 1, dateDebutActivite: 1,
  niveauEducation: 1, agentReferentId: 1,
  isPep: 0, pepDetails: 0, // pas comptés dans la complétude
};
