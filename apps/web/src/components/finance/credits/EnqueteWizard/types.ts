import type { LucideIcon } from 'lucide-react';

export interface CreditPlanInfo {
  id: string;
  nom: string;
  montantMin: string | null;
  montantMax: string | null;
  tauxInteret: string;
  dureeValeur: number;
  dureeUnite: string;
  frequenceRemboursement: string;
  collateralRequired: boolean;
  collateralTypes: string[] | null;
  documentsRequis: string[] | null;
  maxDebtToIncomeRatio: string | null;
  guaranteeDepositPercent: string | null;
  interestMethod: string;
  amortizationType: string | null;
}

export interface ClientSituation {
  situationMatrimoniale: string | null;
  nombrePersonnesCharge: number | null;
  statutLogement: string | null;
}

export interface AutreCredit {
  organisme: string;
  montant: string;
  echeance: string;
}

export interface Garantie {
  type: string;
  description: string;
  valeur: string;
}

export interface GeotaggedPhoto {
  url: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp?: string;
}

export interface EnqueteFormData {
  // Meta
  demandeId: string;
  client_id: string;

  // Step 1: Client & Situation
  situationMatrimoniale: string;
  personnesCharge: string;
  typeHabitation: string;

  // Step 2: Géolocalisation & Terrain
  geoLatitude: number | null;
  geoLongitude: number | null;
  geoAccuracy: number | null;
  geoTimestamp: Date | null;
  photos_activite: string[];
  photos_geotagged: GeotaggedPhoto[];

  // Step 3: Activité & Revenus
  montant_demande: string;
  categorie_activite: string;
  type_activite: string;
  anciennete_activite: string;
  description_activite: string;
  type_revenu: string;
  revenu_journalier: string;
  revenu_mensuel_declare: string;
  jours_travail_mois: string;
  charges_mensuelles: string;
  autres_credits: AutreCredit[];

  // Step 4: Garanties & Documents
  garanties_proposees: Garantie[];
  documents_justificatifs: string[];

  // Step 5: Analyse & Recommandation
  agentRecommendation: string;
  recommendedAmount: string;
  riskLevel: string;
  riskFactors: string[];
  observations: string;
}

export interface EnqueteStepDefinition {
  num: number;
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  requiredFields: string[];
}

export interface EnqueteStepProps {
  formData: EnqueteFormData;
  updateField: (key: keyof EnqueteFormData, value: any) => void;
  readOnly: boolean;
  creditPlan: CreditPlanInfo | null;
  clientNom?: string;
}

export interface EnqueteWizardProps {
  clientId?: string;
  clientNom?: string;
  initialData?: any;
  onClose: () => void;
  onSave: (enquete: any) => void;
  readOnly?: boolean;
}
