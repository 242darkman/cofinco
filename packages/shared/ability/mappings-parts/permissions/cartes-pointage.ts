/**
 * Fragment de mappings permission → CASL — domaine « cartes-pointage ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permCartesPointage: Record<string, PermissionMapping> = {
  // CARTES DE POINTAGE
  // =====================
  'cartespointage.view': { action: Actions.VIEW, subject: Subjects.CARTE_POINTAGE },
  'cartespointage.create': { action: Actions.CREATE, subject: Subjects.CARTE_POINTAGE },
  'cartespointage.deposit': { action: Actions.DEPOSIT, subject: Subjects.CARTE_POINTAGE },
  'cartespointage.withdraw': { action: Actions.WITHDRAW, subject: Subjects.CARTE_POINTAGE },
  'cartespointage.manage': { action: Actions.MANAGE, subject: Subjects.CARTE_POINTAGE },

  // =====================
};
