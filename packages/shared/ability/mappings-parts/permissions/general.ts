/**
 * Fragment de mappings permission → CASL — domaine « general ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permGeneral: Record<string, PermissionMapping> = {
  // DASHBOARD
  // =====================
  'dashboard.view': { action: Actions.VIEW, subject: Subjects.DASHBOARD },
  'dashboard.export': { action: Actions.EXPORT, subject: Subjects.DASHBOARD },

  // =====================
};
