import { logAudit } from "../../audit";
import type { Request } from "express";

export const CoffreLogger = {
  // Log création transfert
  async logCreate(req: Request, transfert: any) {
    await logAudit(
      req,
      "COFFRE_TRANSFERT_CREATE",
      "transfert_coffre",
      transfert.id,
      {
        typeTransfert: transfert.typeTransfert,
        montant: transfert.montant,
        caisseSourceId: transfert.caisseSourceId,
        caisseDestinationId: transfert.caisseDestinationId,
        reference: transfert.reference,
      },
      "success",
      "medium"
    );
  },

  // Log validation/rejet
  async logValidation(req: Request, transfertId: string, approved: boolean, details: any) {
    await logAudit(
      req,
      approved ? "COFFRE_TRANSFERT_VALIDATE" : "COFFRE_TRANSFERT_REJECT",
      "transfert_coffre",
      transfertId,
      details,
      "success",
      approved ? "medium" : "low"
    );
  },

  // Log exécution
  async logExecution(req: Request, transfertId: string, details: any) {
    await logAudit(
      req,
      "COFFRE_TRANSFERT_EXECUTE",
      "transfert_coffre",
      transfertId,
      details,
      "success",
      "high" // High car mouvement de fonds
    );
  },

  // Log erreur
  async logError(req: Request, action: string, transfertId: string, error: string) {
    await logAudit(
      req,
      `COFFRE_TRANSFERT_${action}_ERROR`,
      "transfert_coffre",
      transfertId,
      { error },
      "failure",
      "high"
    );
  },
};
