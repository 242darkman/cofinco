import type { MouvementFinancier } from "@shared/schema";

/**
 * Charge utile (Payload) définissant tous les paramètres nécessaires
 * pour exécuter une transaction globale.
 */
export interface GlobalTransactionPayload {
  clientId: string;
  amount: number;
  paymentMethod: string; // "CASH" | "MOMO" | "TRANSFER"
  natureOperation: string; // Enum TypeOperationCaisse
  targetId?: string; // TontineId, CompteId, CreditId
  description?: string;

  // Specific fields
  tontineId?: string;
  membreId?: string;
  compteId?: string;
  creditId?: string;

  // Agence (required for GL posting)
  agenceId?: string;

  // Metadata for external refs
  referenceExterne?: string;
  numeroTransaction?: string;
  numeroTelephone?: string;
}

/**
 * Contexte fourni aux gestionnaires (handlers) de transactions spécifiques.
 */
export interface TransactionHandlerContext {
  tx: any; // Drizzle database transaction
  mouvement: MouvementFinancier;
  payload: GlobalTransactionPayload;
  sessionCaisseId?: string;
  userId?: string;
}

/**
 * Résultat standardisé retourné par un gestionnaire de transaction.
 */
export interface TransactionHandlerResult {
  result: any;
  additionalEventData: any;
}
