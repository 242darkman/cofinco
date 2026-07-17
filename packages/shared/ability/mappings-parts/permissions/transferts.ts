/**
 * Fragment de mappings permission → CASL — domaine « transferts ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permTransferts: Record<string, PermissionMapping> = {
  // TRANSFERTS / VIREMENTS
  // =====================
  'transferts.view': { action: Actions.VIEW, subject: Subjects.TRANSFERT },
  'transferts.send': { action: Actions.CREATE, subject: Subjects.TRANSFERT },
  'transferts.receive': { action: Actions.APPROVE, subject: Subjects.TRANSFERT },
  'virements_programmes.view': { action: Actions.VIEW, subject: Subjects.VIREMENT },
  'virements_programmes.edit': { action: Actions.EDIT, subject: Subjects.VIREMENT },

  // =====================
};
