/**
 * Fragment de mappings permission → CASL — domaine « rapports ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permRapports: Record<string, PermissionMapping> = {
  // RAPPORTS
  // =====================
  'rapports.view': { action: Actions.VIEW, subject: Subjects.RAPPORTS },
  'rapports.create': { action: Actions.CREATE, subject: Subjects.RAPPORTS },
  'rapports.export': { action: Actions.EXPORT, subject: Subjects.RAPPORTS },
  'rapports.schedule': { action: Actions.SCHEDULE, subject: Subjects.RAPPORTS },

  // =====================
};
