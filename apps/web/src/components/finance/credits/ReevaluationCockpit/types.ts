import { StatutReevaluation } from '@shared/enum/status-constants';

export interface Reevaluation {
  id: string;
  numeroReevaluation: string;
  numeroVersion: number;
  statut: string;
  demandeId: string;
  clientId: string;

  // Snapshot initial
  motifRejetInitial: string;
  dateRejetInitial: string;
  scoreRejetInitial: number;
  montantInitialDemande: string | number;

  // Nouveaux éléments
  elementsNouveaux: any[];
  justification: string;
  nouveauMontantDemande?: string | number;
  nouvelleDureeValeur?: number;
  nouvelleDureeUnite?: string;
  garantiesAdditionnelles?: GarantieAdditionnelle[];
  coEmprunteurDetails?: CoEmprunteur;
  documentsJoints?: string[];

  // Eligibilité
  eligibiliteValidee?: boolean;
  motifRefusEligibilite?: string;
  dateValidationEligibilite?: string;
  validePar?: string;

  // Scoring
  nouveauScore?: number;
  deltaScore?: number;

  // Comité
  membresComite?: string[];
  decisionComite?: string;
  montantApprouveComite?: string | number;
  conditionsSpeciales?: string;
  commentaireComite?: string;
  dateDecisionComite?: string;
  decidePar?: string;

  // Metadata
  verrouille?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface GarantieAdditionnelle {
  type: string;
  valeurEstimee: number | string;
  description?: string;
}

export interface CoEmprunteur {
  nom: string;
  prenom: string;
  relation: string;
  telephone: string;
  revenusMensuels: number | string;
}

export interface Actor {
  id: string;
  nom: string | null;
}

export interface Actors {
  createdBy: Actor | null;
  validePar: Actor | null;
  decidePar: Actor | null;
}

export interface AuditLog {
  id: string;
  action: string;
  statutAvant?: string;
  statutApres?: string;
  details?: { description?: string; [key: string]: any };
  timestamp: string;
  userId?: string;
  roleUtilisateur?: string;
  userName?: string;
}

export interface ActionContext {
  hasConflictOfInterest: boolean;
}

export interface StatutVisualConfig {
  color: string;
  bg: string;
  border: string;
}

export const STATUT_CONFIG: Record<string, StatutVisualConfig> = {
  [StatutReevaluation.REQUESTED]: { color: 'text-status-info', bg: 'bg-status-info-bg', border: 'border-status-info/50' },
  [StatutReevaluation.ELIGIBILITY_CHECK]: { color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/50' },
  [StatutReevaluation.AUTHORIZED]: { color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/50' },
  [StatutReevaluation.REFUSED]: { color: 'text-status-danger', bg: 'bg-status-danger-bg', border: 'border-status-danger/50' },
  [StatutReevaluation.ADDITIONAL_INVESTIGATION]: { color: 'text-status-info', bg: 'bg-status-info-bg', border: 'border-status-info/50' },
  [StatutReevaluation.IN_COMMITTEE]: { color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/50' },
  [StatutReevaluation.APPROVED]: { color: 'text-status-success', bg: 'bg-status-success-bg', border: 'border-status-success/50' },
  [StatutReevaluation.DEFINITIVELY_REJECTED]: { color: 'text-status-danger', bg: 'bg-status-danger-bg', border: 'border-status-danger/50' },
  [StatutReevaluation.CANCELLED]: { color: 'text-content-muted', bg: 'bg-surface-subtle/40', border: 'border-edge-strong/50' },
};

export const DEFAULT_STATUT_CONFIG: StatutVisualConfig = { color: 'text-content-muted', bg: 'bg-surface-subtle/40', border: 'border-edge-strong/50' };

/** Traduction des actions audit en français lisible */
export const ACTION_LABELS_FR: Record<string, string> = {
  REEVALUATION_CREEE: 'Réévaluation créée',
  ELIGIBILITE_VERIFIEE: 'Éligibilité vérifiée',
  ELIGIBILITE_REFUSEE: 'Éligibilité refusée',
  SOUMIS_COMITE: 'Soumis au comité',
  DECISION_COMITE: 'Décision du comité',
  DECISION_ENREGISTREE: 'Décision enregistrée',
  ENQUETE_LANCEE: 'Enquête lancée',
  ENQUETE_COMPLEMENTAIRE_DEMARREE: 'Enquête complémentaire démarrée',
  ANNULEE: 'Annulée',
};

export function translateAction(action: string): string {
  return ACTION_LABELS_FR[action] || action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}
