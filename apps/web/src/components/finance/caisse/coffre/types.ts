/**
 * Types partagés du tableau de bord Coffre-Fort : lignes de transferts,
 * mouvements, demandes d'ouverture et libellés d'aide des onglets.
 */
import { coffreApi, sessionCaisseApi } from "@/lib/api-client";

export interface TransfertCoffreRow {
  id: string;
  statut: string;
  createdAt: string;
  montant: string | number;
  typeTransfert: string;
  caisseDestinationNom?: string;
  caisseSourceNom?: string;
  requestedByNom?: string;
  requestedByPrenom?: string;
  verrouille?: boolean;
  executedAt?: string;
  /** Present on mouvement-style rows rendered in the historique columns */
  dateOperation?: string;
  sens?: string;
  typePaiement?: string;
  metadata?: Record<string, any>;
  reference?: string;
  initiator?: { nom?: string; prenom?: string };
  sourceModule?: string;
  soldeApres?: string | number;
  caissierNom?: string;
  [key: string]: any;
}

/** Row returned by coffreApi.getMouvements */
export interface MouvementCoffreRow {
  id: string;
  dateOperation: string;
  sens: string;
  montant: string | number;
  typePaiement?: string;
  metadata?: Record<string, any>;
  reference?: string;
  initiator?: { nom?: string; prenom?: string };
  sourceModule?: string;
  soldeApres?: string | number;
  [key: string]: any;
}

/** Row returned by coffreApi.getPendingOpeningRequests */
export interface OpeningRequest {
  transfert?: {
    id: string;
    montant?: string | number;
    caisseDestinationNom?: string;
    requestedByNom?: string;
    [key: string]: any;
  };
  session?: { id: string; [key: string]: any };
  caissierNom?: string;
  caisseNom?: string;
  montantDemande?: string | number;
  soldeVeille?: number;
  fundsRequestedAt?: string;
  [key: string]: any;
}

// Types pour le dialogue de confirmation
export interface ConfirmAction {
  type: 'validate' | 'reject' | 'execute' | 'validate-opening' | 'reject-opening';
  transfert: TransfertCoffreRow;
}

export const TAB_HELP: Record<string, string> = {
  operations: 'Demandez, validez et exécutez les transferts entre le coffre et les caisses. Chaque transfert suit un workflow : Demande → Validation → Exécution.',
  intercoffres: 'Envoyez et recevez des fonds entre coffres de différentes agences. Idéal pour les rééquilibrages de trésorerie entre sites.',
  evacuation: 'Évacuez les fonds du coffre vers une banque, le coffre central ou un transporteur. Workflow complet avec billetage, transit et réconciliation.',
  historique: 'Consultez l\'historique complet de tous les mouvements du coffre : entrées, sorties, provisions et compensations.',
  supervision: 'Vue consolidée des soldes et mouvements de toutes les agences. Comparez les performances et exportez les rapports.',
  admin: 'Configurez les seuils d\'alerte, les plafonds de transfert et les règles de validation du coffre-fort.',
};
