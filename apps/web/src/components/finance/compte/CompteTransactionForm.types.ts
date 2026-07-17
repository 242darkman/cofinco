/**
 * Types du composant CompteTransactionForm (modèle de données local).
 */

export interface Compte {
  id: string;
  numeroCompte?: string;
  numero_compte?: string;
  typeCompte?: string;
  type_compte?: string;
  solde: number;
  statut?: string;
  clients: {
    nom: string;
    id: string;
  };
}

export type ModePaiement = 'CASH' | 'MOBILE_MONEY' | 'CHECK' | 'TRANSFER';
