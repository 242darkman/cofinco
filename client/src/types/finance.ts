/**
 * Types financiers partagés pour le module Caisse
 */

export interface SessionCaisse {
  id: string;
  caissier_id?: string;
  caissierId?: string;
  
  // Timestamps (multi-format for retro-compatibility)
  openedAt?: string;
  opened_at?: string;
  closedAt?: string;
  closed_at?: string;
  timeoutAt?: string;
  timeout_at?: string;
  
  // Balances
  solde_initial?: number;
  soldeInitial?: number;
  montant_ouverture?: number;
  montantOuverture?: number;
  
  solde_theorique: number;
  soldeTheorique?: number;
  montant_fermeture_theorique?: number;
  montantFermetureTheorique?: number;
  
  solde_reel?: number;
  soldeReel?: number;
  montant_fermeture_declare?: number;
  
  ecart?: number;
  
  // Statuses
  statut?: 'REQUESTING_FUNDS' | 'FUNDS_DISPATCHED' | 'OPEN' | 'CLOSING_COUNT' | 'CLOSING_VALIDATION' | 'CLOSED' | string;
  computedStatus?: string;
  
  // Metadata
  observations: string;
  caissier_nom?: string;
  caisse_nom?: string;
  caisse_id?: string;
  caisseId?: string;
  agence_id?: string;
  agenceId?: string;

  // Opening workflow fields
  montant_demande?: number;
  montantDemande?: number;
  solde_veille?: number;
  soldeVeille?: number;
  funds_requested_at?: string;
  fundsRequestedAt?: string;
  funds_dispatched_at?: string;
  fundsDispatchedAt?: string;
  opening_transfert_id?: string;
  openingTransfertId?: string;

  // Closing workflow fields
  closing_initiated_at?: string;
  closingInitiatedAt?: string;
  count_submitted_at?: string;
  countSubmittedAt?: string;
  closing_finalized_at?: string;
  closingFinalizedAt?: string;
  
  montant_physique?: number;
  montantPhysique?: number;
  ecart_justification?: string;
  ecartJustification?: string;
  
  montant_vers_coffre?: number;
  montantVersCoffre?: number;
  montant_reporte?: number;
  montantReporte?: number;
  
  closing_transfert_id?: string;
  closingTransfertId?: string;
  coffre_validation_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  coffreValidationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface CaisseTransaction {
  id: string;
  session_id: string;
  sessionId?: string;
  type_operation: string;
  typeOperation?: string;
  montant: number;
  mode_paiement: string;
  modePaiement?: string;
  reference: string;
  description: string;
  created_at: string;
  createdAt?: string;
  client_nom?: string;
  client_prenom?: string;
  client_telephone?: string;
}
