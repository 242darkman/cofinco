/**
 * Types du composant AccountActivationModal (modèle de données local).
 */

export interface AccountInfo {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  montantInitial: number;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoUrl?: string;
  };
}

export interface FeeEstimate {
  feeAmount: number;
  feeRate: number;
  feeFixed: number;
  montantBrut: number;
  montantNet: number;
  feeOption: string;
}

export type ModePaiement = 'CASH' | 'MTN' | 'AIRTEL' | 'TRANSFER';

export type MmStep = 'idle' | 'pending' | 'success' | 'failed' | 'expired';
