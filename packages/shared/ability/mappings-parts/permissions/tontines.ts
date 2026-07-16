/**
 * Fragment de mappings permission → CASL — domaine « tontines ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permTontines: Record<string, PermissionMapping> = {
  // TONTINES
  // =====================
  'tontines.view': { action: Actions.VIEW, subject: Subjects.TONTINE },
  'tontines.create': { action: Actions.CREATE, subject: Subjects.TONTINE },
  'tontines.edit': { action: Actions.EDIT, subject: Subjects.TONTINE },
  'tontines.delete': { action: Actions.DELETE, subject: Subjects.TONTINE },
  'tontines.approve': { action: Actions.APPROVE, subject: Subjects.TONTINE },
  'tontines.distribute': { action: Actions.DISTRIBUTE, subject: Subjects.TONTINE },
  'tontines.export': { action: Actions.EXPORT, subject: Subjects.TONTINE },
  'tontines.close': { action: Actions.CLOSE, subject: Subjects.TONTINE },
  'tontines.manage': { action: Actions.MANAGE, subject: Subjects.TONTINE },
  // Membres tontine
  'tontines.membres.view': { action: Actions.VIEW, subject: Subjects.TONTINE_MEMBRE },
  'tontines.membres.create': { action: Actions.CREATE, subject: Subjects.TONTINE_MEMBRE },
  'tontines.membres.edit': { action: Actions.EDIT, subject: Subjects.TONTINE_MEMBRE },
  'tontines.membres.delete': { action: Actions.DELETE, subject: Subjects.TONTINE_MEMBRE },
  // Contributions tontine
  'tontines.contributions.view': { action: Actions.VIEW, subject: Subjects.TONTINE_CONTRIBUTION },
  'tontines.contributions.create': { action: Actions.CREATE, subject: Subjects.TONTINE_CONTRIBUTION },

  // =====================
};
