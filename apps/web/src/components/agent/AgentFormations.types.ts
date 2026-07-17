/**
 * Types du composant AgentFormations (modèle de données local).
 */

export interface Formation {
  id: number;
  titre: string;
  description: string | null;
  typeFormation: string | null;
  dureeHeures: number | null;
  contenuUrl: string | null;
  obligatoire: boolean | null;
  statut: string | null;
  formateur: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  lieu: string | null;
  programme: string | null;
  capaciteMax: number | null;
  participants: number;
  createdAt: string;
}

export interface FormationSuivi {
  id: string;
  agentId: string | null;
  formationId: number;
  dateDebut: string | null;
  dateFin: string | null;
  progression: number | null;
  statut: string | null;
  presence: string | null;
  createdAt: string | null;
  scoreEvaluation: number | null;
  evaluation: string | null;
  competencesAcquises: string | null;
  recommandation: string | null;
  evaluatedAt: string | null;
  formation?: {
    id: number;
    titre: string;
    description: string | null;
    typeFormation: string | null;
    dureeHeures: number | null;
    contenuUrl: string | null;
    obligatoire: boolean | null;
    statut: string | null;
    dateFin: string | null;
  };
  certificate: {
    id: string;
    numero: string;
    statut: string;
    fichierUrl: string | null;
    dateExpiration: string | null;
  } | null;
}

export interface ComplianceData {
  mandatoryNotEnrolled: Array<{ id: number; titre: string; dateDebut: string | null; dateFin: string | null }>;
  overdue: Array<{ id: number; titre: string; dateFin: string | null; progression: number }>;
  expiringCertificates: Array<{ id: string; titre: string; numero: string; dateExpiration: string | null }>;
  complianceScore: number;
}
