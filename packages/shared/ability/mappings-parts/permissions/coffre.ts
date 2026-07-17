/**
 * Fragment de mappings permission → CASL — domaine « coffre ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permCoffre: Record<string, PermissionMapping> = {
  // COFFRE-FORT
  // =====================
  'coffre.view': { action: Actions.VIEW, subject: Subjects.COFFRE },
  'coffre.create': { action: Actions.CREATE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.edit': { action: Actions.EDIT, subject: Subjects.COFFRE },
  'coffre.approve': { action: Actions.APPROVE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transfer': { action: Actions.TRANSFER, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transferts.view': { action: Actions.VIEW, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transferts.create': { action: Actions.CREATE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transferts.approve': { action: Actions.APPROVE, subject: Subjects.COFFRE_TRANSFERT },
  'coffre.transfert.init': { action: Actions.INIT_TRANSFER, subject: Subjects.COFFRE },
  'coffre.transfert.validate': { action: Actions.VALIDATE_TRANSFER, subject: Subjects.COFFRE },
  'coffre.transfert.execute': { action: Actions.EXECUTE_TRANSFER, subject: Subjects.COFFRE },
  'coffre.config.view': { action: Actions.VIEW, subject: Subjects.SETTINGS },
  'coffre.config.edit': { action: Actions.EDIT, subject: Subjects.SETTINGS },
  'coffre.supervision.view': { action: Actions.VIEW, subject: Subjects.COFFRE },
  // Evacuation de cash (vide de coffre)
  'coffre.evacuation.view': { action: Actions.VIEW, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.create': { action: Actions.CREATE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.approve': { action: Actions.APPROVE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.prepare': { action: Actions.PREPARE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.dispatch': { action: Actions.DISPATCH, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.deposit': { action: Actions.DEPOSIT, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.reconcile': { action: Actions.RECONCILE, subject: Subjects.EVACUATION_COFFRE },
  'coffre.evacuation.config': { action: Actions.EDIT, subject: Subjects.SETTINGS },

  // =====================
};
