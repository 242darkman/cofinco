import { type CaisseHandover } from "@shared/schema";

export interface InitiateHandoverParams {
  sessionId: string;
  fromCaissierId: string;
  toCaissierId: string;
  montantCompte: number;
  billetage?: Record<string, number>;
  motif?: string;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitiateHandoverResult {
  success: boolean;
  handover?: CaisseHandover;
  error?: string;
  errorCode?: string;
}

export interface ConfirmHandoverParams {
  handoverId: string;
  toCaissierId: string;
  montantVerifie: number;
  billetage?: Record<string, number>;
  observations?: string;
  ecartJustification?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConfirmHandoverResult {
  success: boolean;
  handover?: CaisseHandover;
  requiresApproval?: boolean;
  error?: string;
  errorCode?: string;
}

export interface CancelHandoverParams {
  handoverId: string;
  cancelledBy: string;
  reason: string;
  ipAddress?: string;
}

export interface CancelHandoverResult {
  success: boolean;
  handover?: CaisseHandover;
  error?: string;
}

export interface PendingHandover {
  id: string;
  sessionId: string;
  caisseId: string;
  caisseNom: string;
  fromCaissierNom: string;
  toCaissierNom: string;
  montantTheorique: number;
  statut: string;
  initiatedAt: Date;
}

// Seuil d'écart nécessitant une approbation (en XOF)
export const ECART_APPROVAL_THRESHOLD = 5000;
