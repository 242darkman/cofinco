/**
 * Fragment de mappings permission → CASL — domaine « clients ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permClients: Record<string, PermissionMapping> = {
  // CLIENTS
  // =====================
  'clients.view': { action: Actions.VIEW, subject: Subjects.CLIENT },
  'clients.create': { action: Actions.CREATE, subject: Subjects.CLIENT },
  'clients.edit': { action: Actions.EDIT, subject: Subjects.CLIENT },
  'clients.delete': { action: Actions.DELETE, subject: Subjects.CLIENT },
  'clients.export': { action: Actions.EXPORT, subject: Subjects.CLIENT },
  'clients.import': { action: Actions.IMPORT, subject: Subjects.CLIENT },

  // =====================
};
