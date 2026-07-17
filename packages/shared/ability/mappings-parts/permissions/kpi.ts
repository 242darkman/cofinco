/**
 * Fragment de mappings permission → CASL — domaine « kpi ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permKpi: Record<string, PermissionMapping> = {
  // KPI
  // =====================
  'kpi.view': { action: Actions.VIEW, subject: Subjects.KPI },
  'kpi.export': { action: Actions.EXPORT, subject: Subjects.KPI },
  'kpi.manage': { action: Actions.MANAGE, subject: Subjects.KPI },
};
