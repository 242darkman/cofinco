/**
 * Fragment de mappings permission → CASL — domaine « credits ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permCredits: Record<string, PermissionMapping> = {
  // CREDITS
  // =====================
  'credits.view': { action: Actions.VIEW, subject: Subjects.CREDIT },
  'credits.create': { action: Actions.CREATE, subject: Subjects.CREDIT },
  'credits.edit': { action: Actions.EDIT, subject: Subjects.CREDIT },
  'credits.delete': { action: Actions.DELETE, subject: Subjects.CREDIT },
  'credits.approve': { action: Actions.APPROVE, subject: Subjects.CREDIT },
  'credits.reject': { action: Actions.REJECT, subject: Subjects.CREDIT },
  'credits.disburse': { action: Actions.DISBURSE, subject: Subjects.CREDIT },
  'credits.disburse_cash': { action: Actions.DISBURSE_CASH, subject: Subjects.CREDIT },
  'credits.disburse_account': { action: Actions.DISBURSE_ACCOUNT, subject: Subjects.CREDIT },
  'credits.disburse_momo': { action: Actions.DISBURSE_MOMO, subject: Subjects.CREDIT },
  'credits.collect': { action: Actions.COLLECT, subject: Subjects.CREDIT },
  'credits.export': { action: Actions.EXPORT, subject: Subjects.CREDIT },
  'credits.close': { action: Actions.CLOSE, subject: Subjects.CREDIT },
  // Demandes de crédit
  'demandes.view': { action: Actions.VIEW, subject: Subjects.DEMANDE_CREDIT },
  'demandes.create': { action: Actions.CREATE, subject: Subjects.DEMANDE_CREDIT },
  'demandes.edit': { action: Actions.EDIT, subject: Subjects.DEMANDE_CREDIT },
  'demandes.approve': { action: Actions.APPROVE, subject: Subjects.DEMANDE_CREDIT },
  'demandes.reject': { action: Actions.REJECT, subject: Subjects.DEMANDE_CREDIT },
  // Échéances
  'echeances.view': { action: Actions.VIEW, subject: Subjects.ECHEANCE },
  'echeances.edit': { action: Actions.EDIT, subject: Subjects.ECHEANCE },
  'echeances.export': { action: Actions.EXPORT, subject: Subjects.ECHEANCE },
  // Réévaluations
  'reevaluations.view': { action: Actions.VIEW, subject: Subjects.REEVALUATION },
  'reevaluations.create': { action: Actions.CREATE, subject: Subjects.REEVALUATION },
  'reevaluations.approve': { action: Actions.APPROVE, subject: Subjects.REEVALUATION },
  'credits.reevaluations.view': { action: Actions.VIEW, subject: Subjects.REEVALUATION },
  'credits.reevaluations.create': { action: Actions.CREATE, subject: Subjects.REEVALUATION },
  'credits.reevaluations.approve': { action: Actions.APPROVE, subject: Subjects.REEVALUATION },
  'credits.reevaluations.validate': { action: Actions.VALIDATE_REEVALUATION, subject: Subjects.REEVALUATION },
  'credits.reevaluations.decide': { action: Actions.DECIDE_REEVALUATION, subject: Subjects.REEVALUATION },

  // =====================
  // REMBOURSEMENTS
  // =====================
  'remboursements.view': { action: Actions.VIEW, subject: Subjects.REMBOURSEMENT },
  'remboursements.create': { action: Actions.CREATE, subject: Subjects.REMBOURSEMENT },

  // =====================
};
