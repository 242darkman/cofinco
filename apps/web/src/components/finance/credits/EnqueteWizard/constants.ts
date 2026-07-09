import { User, MapPin, Briefcase, Shield, BarChart3 } from 'lucide-react';
import type { EnqueteStepDefinition, EnqueteFormData } from './types';

export const ENQUETE_STEPS: EnqueteStepDefinition[] = [
  {
    num: 1,
    key: 'situation',
    label: 'Client & Situation',
    shortLabel: 'Situation',
    icon: User,
    requiredFields: ['client_id', 'situationMatrimoniale', 'personnesCharge', 'typeHabitation'],
  },
  {
    num: 2,
    key: 'geo',
    label: 'Géolocalisation & Terrain',
    shortLabel: 'GPS',
    icon: MapPin,
    requiredFields: [],
  },
  {
    num: 3,
    key: 'activite',
    label: 'Activité & Revenus',
    shortLabel: 'Revenus',
    icon: Briefcase,
    requiredFields: ['categorie_activite', 'type_activite', 'anciennete_activite', 'description_activite', 'revenu_mensuel_declare'],
  },
  {
    num: 4,
    key: 'garanties',
    label: 'Garanties & Documents',
    shortLabel: 'Garanties',
    icon: Shield,
    requiredFields: [],
  },
  {
    num: 5,
    key: 'analyse',
    label: 'Analyse & Recommandation',
    shortLabel: 'Analyse',
    icon: BarChart3,
    requiredFields: ['agentRecommendation', 'recommendedAmount', 'riskLevel'],
  },
];

export const TOTAL_ENQUETE_STEPS = ENQUETE_STEPS.length;

export const ENQUETE_AUTO_SAVE_KEY = 'microflex_enquete_credit_draft';

export const DEFAULT_ENQUETE_FORM: EnqueteFormData = {
  demandeId: '',
  client_id: '',
  situationMatrimoniale: '',
  personnesCharge: '',
  typeHabitation: '',
  geoLatitude: null,
  geoLongitude: null,
  geoAccuracy: null,
  geoTimestamp: null,
  photos_activite: [],
  photos_geotagged: [],
  montant_demande: '',
  categorie_activite: '',
  type_activite: '',
  anciennete_activite: '',
  description_activite: '',
  type_revenu: 'Mensuel',
  revenu_journalier: '',
  revenu_mensuel_declare: '',
  jours_travail_mois: '26',
  charges_mensuelles: '',
  autres_credits: [],
  garanties_proposees: [],
  documents_justificatifs: [],
  agentRecommendation: '',
  recommendedAmount: '',
  riskLevel: '',
  riskFactors: [],
  observations: '',
};

export const CATEGORIES_ACTIVITE: Record<string, string[]> = {
  'Commerce': [
    'Commerce général', 'Commerce alimentaire', 'Commerce vestimentaire',
    'Commerce électronique/téléphonie', 'Commerce cosmétique',
    'Commerce matériaux construction', 'Vente ambulante', 'Quincaillerie',
  ],
  'Services': [
    'Salon de coiffure', 'Salon de beauté', 'Restaurant/Maquis',
    'Bar/Buvette', 'Pressing/Laverie', 'Cyber café',
    'Réparation téléphone', 'Location véhicules', 'Services divers',
  ],
  'Artisanat': [
    'Couture/Confection', 'Menuiserie', 'Soudure/Ferronnerie',
    'Maçonnerie', 'Électricité', 'Plomberie',
    'Mécanique auto/moto', 'Artisanat d\'art',
  ],
  'Agriculture': [
    'Culture vivrière', 'Culture maraîchère', 'Culture de rente',
    'Transformation agricole', 'Vente de produits agricoles',
  ],
  'Élevage': [
    'Élevage volaille', 'Élevage porcin', 'Élevage bovin',
    'Élevage ovin/caprin', 'Pisciculture', 'Apiculture',
  ],
  'Transport': [
    'Taxi/VTC', 'Transport moto (Zemidjan)',
    'Transport marchandises', 'Transport en commun',
  ],
  'Autre': ['Autre activité'],
};

export const TYPES_GARANTIES = [
  'Terrain', 'Maison', 'Véhicule', 'Équipement professionnel',
  'Stock de marchandises', 'Caution solidaire', 'Autre',
];

export const SITUATIONS_MATRIMONIALES = [
  { value: 'CELIBATAIRE', label: 'Célibataire' },
  { value: 'MARIE', label: 'Marié(e)' },
  { value: 'DIVORCE', label: 'Divorcé(e)' },
  { value: 'VEUF', label: 'Veuf/Veuve' },
  { value: 'UNION_LIBRE', label: 'Union libre' },
];

export const TYPES_HABITATION = [
  { value: 'PROPRIETAIRE', label: 'Propriétaire' },
  { value: 'LOCATAIRE', label: 'Locataire' },
  { value: 'HEBERGE', label: 'Hébergé(e)' },
  { value: 'AUTRE', label: 'Autre' },
];
