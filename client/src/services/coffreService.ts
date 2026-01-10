import { api } from "./api"; // Assuming a generic api wrapper exists
import type { TransfertCoffreCaisse, TransfertCoffreAuditLog } from "@shared/schema";

export interface CreateTransfertParams {
  caisseId: string;
  typeTransfert: "COFFRE_VERS_CAISSE" | "CAISSE_VERS_COFFRE";
  montant: number;
  motif: string;
  commentaire?: string;
  idempotencyKey?: string;
  billetage?: Record<string, number>;
  agenceId: string;
}

export interface ListTransfertsParams {
  agenceId: string;
  statut?: string;
  typeTransfert?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export const coffreService = {
  // Créer une demande
  async createTransfert(params: CreateTransfertParams) {
    const { data } = await api.post("/coffre/transferts", params);
    return data;
  },

  // Valider une demande
  async validateTransfert(id: string, approved: boolean, reasonRejection?: string) {
    const { data } = await api.post(`/coffre/transferts/${id}/validate`, {
      approved,
      reasonRejection,
    });
    return data;
  },

  // Exécuter une demande
  async executeTransfert(id: string, sessionId?: string, billetage?: Record<string, number>) {
    const { data } = await api.post(`/coffre/transferts/${id}/execute`, {
      sessionId,
      billetage,
    });
    return data;
  },

  // Annuler une demande
  async cancelTransfert(id: string, reason: string) {
    const { data } = await api.post(`/coffre/transferts/${id}/cancel`, {
      reason,
    });
    return data;
  },

  // Lister les transferts
  async listTransferts(params: ListTransfertsParams) {
    const { data } = await api.get("/coffre/transferts", { params });
    return data;
  },

  // Détails
  async getTransfertDetails(id: string) {
    const { data } = await api.get(`/coffre/transferts/${id}`);
    return data;
  },
};
