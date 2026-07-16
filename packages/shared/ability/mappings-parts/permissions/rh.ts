/**
 * Fragment de mappings permission → CASL — domaine « rh ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permRh: Record<string, PermissionMapping> = {
  // Paiements
  'paiements.view': { action: Actions.VIEW, subject: Subjects.PAIEMENT_TERRAIN },
  'paiements.create': { action: Actions.CREATE, subject: Subjects.PAIEMENT_TERRAIN },

  // =====================
  // RH
  // =====================
  'rh.view': { action: Actions.VIEW, subject: Subjects.RH },
  'rh.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'rh.edit': { action: Actions.EDIT, subject: Subjects.RH },
  'rh.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  'rh.export': { action: Actions.EXPORT, subject: Subjects.RH },
  'rh.approve': { action: Actions.APPROVE, subject: Subjects.RH },
  'rh.manage': { action: Actions.MANAGE, subject: Subjects.RH },
  // Employés
  'rh.employes.view': { action: Actions.VIEW, subject: Subjects.EMPLOYE },
  'rh.employes.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'rh.employes.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'rh.employes.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  // Paie
  'paie.view': { action: Actions.VIEW, subject: Subjects.PAIE },
  'paie.create': { action: Actions.CREATE, subject: Subjects.PAIE },
  'paie.edit': { action: Actions.EDIT, subject: Subjects.PAIE },
  'paie.approve': { action: Actions.APPROVE_PAIE, subject: Subjects.PAIE },

  // =====================
  // EMPLOYÉS (standalone)
  // =====================
  'employes.view': { action: Actions.VIEW, subject: Subjects.EMPLOYE },
  'employes.create': { action: Actions.CREATE, subject: Subjects.EMPLOYE },
  'employes.edit': { action: Actions.EDIT, subject: Subjects.EMPLOYE },
  'employes.delete': { action: Actions.DELETE, subject: Subjects.EMPLOYE },
  'employes.manage': { action: Actions.MANAGE, subject: Subjects.EMPLOYE },

  // =====================
};
