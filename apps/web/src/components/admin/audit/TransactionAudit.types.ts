/**
 * Types du composant TransactionAudit (modèle de données local).
 */

export interface TransactionLog {
  id: string;
  timestamp: string;
  transaction_type: string;
  user_id: string;
  client_id: string;
  montant: number;
  devise: string;
  compte_source: string;
  compte_destination: string;
  statut_avant: string;
  statut_apres: string;
  reference: string;
  description: string;
}
