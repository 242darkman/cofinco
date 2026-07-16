/**
 * Fragment de mappings permission → CASL — domaine « comptabilite ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permComptabilite: Record<string, PermissionMapping> = {
  // COMPTABILITÉ
  // =====================
  'comptabilite.view': { action: Actions.VIEW, subject: Subjects.COMPTABILITE },
  'comptabilite.create': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.edit': { action: Actions.EDIT, subject: Subjects.COMPTABILITE },
  'comptabilite.export': { action: Actions.EXPORT, subject: Subjects.COMPTABILITE },
  'comptabilite.close': { action: Actions.CLOSE, subject: Subjects.COMPTABILITE },
  'comptabilite.reconcile': { action: Actions.RECONCILE, subject: Subjects.COMPTABILITE },
  // Écritures
  'comptabilite.ecritures.view': { action: Actions.VIEW, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.create': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.edit': { action: Actions.EDIT, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.delete': { action: Actions.DELETE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.ecritures.approve': { action: Actions.APPROVE, subject: Subjects.ECRITURE_COMPTABLE },
  // Journaux
  'comptabilite.journaux.view': { action: Actions.VIEW, subject: Subjects.JOURNAL },
  'comptabilite.journaux.create': { action: Actions.CREATE, subject: Subjects.JOURNAL },
  'comptabilite.journaux.edit': { action: Actions.EDIT, subject: Subjects.JOURNAL },
  'comptabilite.write': { action: Actions.CREATE, subject: Subjects.ECRITURE_COMPTABLE },
  'comptabilite.reports': { action: Actions.VIEW, subject: Subjects.RAPPORTS },

  // =====================
};
