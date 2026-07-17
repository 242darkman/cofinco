/**
 * Types du composant AgentCommissions (modèle de données local).
 */

export interface Commission {
  id: string;
  agentId: string;
  periode: string;
  montantCollecte: number;
  tauxCommission: number;
  montantCommission: number;
  primes: number;
  avances: number;
  montantNet: number;
  statutPaiement: string;
  datePaiement?: string;
  methodePaiement?: string;
  mouvementId?: string;
  notes: string;
  agent?: { nom: string; prenom: string };
}

export type PaymentMethod = 'CASH' | 'PAYROLL' | 'MOBILE_MONEY';
