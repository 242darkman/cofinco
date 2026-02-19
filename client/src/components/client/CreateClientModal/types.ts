import type { LucideIcon } from 'lucide-react';

export interface EmployeeConversionData {
  userId: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  sexe: 'M' | 'F' | null;
  dateNaissance: string | null;
  adresse: string | null;
  agenceId: string | null;
}

export interface ReferencePersonne {
  nom: string;
  prenom: string;
  telephone: string;
  relation: string;
  adresse: string;
  profession: string;
}

export interface CreateClientFormData {
  // Étape 1 : Identité
  nom: string;
  prenom: string;
  sexe: string;
  dateNaissance: string;
  lieuNaissance: string;
  lieuNaissanceLocalityId: string;
  lieuNaissanceLocalityType: string;
  nationaliteId: string;
  paysNaissanceId: string;

  // Étape 2 : Contact & Adresse
  telephoneRaw: string;
  telephone: string;
  email: string;
  adresseDomicile: string;
  villeId: string;
  localityType: string;
  paysResidenceId: string;
  statutLogement: string;

  // Étape 3 : Profil socio-professionnel
  situationMatrimoniale: string;
  nombrePersonnesCharge: string;
  niveauEducation: string;
  typeClient: string;
  professionId: string;
  professionAutreTexte: string;
  employeur: string;
  activityTypeId: string;
  ancienneteActiviteMois: string;
  dateDebutActivite: string;

  // Étape 4 : Informations financières
  sourceFonds: string;
  typeRevenu: 'Mensuel' | 'Journalier';
  revenuMensuel: string;
  revenuJournalier: string;
  sectorId: string;
  segment: string;
  agenceId: string;
  agentReferentId: string;
  clientOrigin: string;

  // Étape 5 : Références & Conformité
  referencesPersonnes: ReferencePersonne[];
  isPep: boolean;
  pepDetails: string;
  consentementDonnees: boolean;

  // Étape 6 : KYC & Documents
  typePiece: string;
  numeroPiece: string;
  dateExpirationPiece: string;
  paysEmissionId: string;
}

export interface FileState {
  photo: File | null;
  idFront: File | null;
  idBack: File | null;
  proofOfAddress: File | null;
}

export interface StepDefinition {
  num: number;
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  requiredFields: string[];
}

export interface StepComponentProps {
  formData: CreateClientFormData;
  updateField: (key: string, value: any) => void;
  errors: Record<string, string>;
  markTouched: (field: string) => void;
  isConversion: boolean;
  isAdmin: boolean;
  referenceData: ReferenceDataResult;
  files?: FileState;
  setFiles?: (fn: (prev: FileState) => FileState) => void;

  // Catalog options (from useCatalogOptions)
  catalogProfessions?: { id: string; code: string; nom: string }[];
  catalogSectors?: { id: string; code: string; nom: string; parentId: string | null; parentNom: string | null }[];
  catalogActivityTypes?: { id: string; code: string; nom: string }[];
  catalogLoading?: boolean;
  onCatalogFilter?: (filters: { professionId?: string; sectorId?: string; activityTypeId?: string }) => Promise<void>;
}

export interface LocalityItem {
  id: string;
  type: 'CITY' | 'DISTRICT';
  name: string;
  regionName?: string | null;
  population?: number | null;
}

export interface ReferenceDataResult {
  paysList: PaysOption[];
  villesList: { id: string; nom: string; paysId?: string | null }[];
  fetchCitiesByPays: (paysId: string) => void;
  villesLoading: boolean;
  localitiesList: LocalityItem[];
  fetchLocalitiesByPays: (paysId: string) => void;
  localitiesLoading: boolean;
  agences: { id: string; nom: string }[];
  agentsReferents: { id: string; nom: string; prenom: string }[];
  loading: boolean;
}

export interface PaysOption {
  id: string;
  nomFr: string;
  nomEn: string;
  iso2: string;
  iso3: string;
  indicatifTel: string | null;
  isHighRiskAml: boolean;
}
