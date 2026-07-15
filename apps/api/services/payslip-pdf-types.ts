/**
 * Ligne détaillée d'un bulletin de paie exporté en PDF.
 *
 * Le service PDF consomme des montants déjà calculés par le moteur de paie :
 * cette structure ne doit pas porter de règle de calcul salarial.
 */
export interface PayslipPdfLine {
  code: string;
  libelle: string;
  category: string;
  base: number | null;
  taux: string | number | null;
  montantGain: number;
  montantRetenue: number;
  montantPatronal: number;
  sortOrder: number;
}

/**
 * Données normalisées nécessaires à la génération serveur d'un bulletin de paie.
 *
 * Les champs financiers sont fournis sous forme de snapshots afin que le PDF
 * reste un rendu fidèle du bulletin validé, sans recalculer les montants.
 */
export interface PayslipPdfData {
  bulletin: {
    id: number;
    mois: string;
    salaireBrut: string;
    salaireNet: string;
    totalChargesSalariales: string;
    totalChargesPatronales: string;
    irpp: string;
    totalRetenues: string;
    salaireBaseSnapshot: number;
    version: number;
    statut: string;
    datePaiement: string | null;
    createdAt: string | Date;
  };
  lines: PayslipPdfLine[];
  employe: {
    matricule: string | null;
    nom: string;
    prenom: string | null;
    typeContrat: string | null;
    dateEmbauche: string | null;
    dateSortie: string | null;
    numeroCnss: string | null;
    categorie: string | null;
    coefficient: number | null;
    paymentMethod: string | null;
    jobTitle: string | null;
    anciennete: string | null;
    conventionCollective: string | null;
  } | null;
  company: {
    appName: string | null;
    adresse: string | null;
    telephone: string | null;
    niu: string | null;
    rccm: string | null;
  } | null;
  agence: {
    nom: string;
    adresse: string | null;
    telephone: string | null;
  } | null;
  leaves: {
    acquired: number;
    used: number;
    balance: number;
  } | null;
  heuresTravaillees: {
    joursTravailles: number;
    heuresNormales: number;
    heuresSupplementaires: number;
  } | null;
}
