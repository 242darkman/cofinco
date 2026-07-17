/**
 * Fragment de mappings permission → CASL — domaine « divers ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permDivers: Record<string, PermissionMapping> = {
  // =====================
  // Configuration primes prospection
  'prospection.config.view': { action: Actions.VIEW, subject: Subjects.PROSPECTION_CONFIG },
  'prospection.config.edit': { action: Actions.EDIT, subject: Subjects.PROSPECTION_CONFIG },
  // MAINTENANCE
  // =====================
  'maintenance.view': { action: Actions.VIEW, subject: Subjects.MAINTENANCE },
  'maintenance.purge': { action: Actions.PURGE, subject: Subjects.MAINTENANCE },
  'maintenance.migrate': { action: Actions.MIGRATE, subject: Subjects.MAINTENANCE },
  'maintenance.seed': { action: Actions.SEED, subject: Subjects.MAINTENANCE },
  'maintenance.manage': { action: Actions.MANAGE, subject: Subjects.MAINTENANCE },

  // =====================
  // FIDÉLITÉ (LOYALTY)
  // =====================
  'loyalty.view': { action: Actions.VIEW, subject: Subjects.LOYALTY },
  'loyalty.create': { action: Actions.CREATE, subject: Subjects.LOYALTY },
  'loyalty.edit': { action: Actions.EDIT, subject: Subjects.LOYALTY },
  'loyalty.delete': { action: Actions.DELETE, subject: Subjects.LOYALTY },
  'loyalty.manage': { action: Actions.MANAGE, subject: Subjects.LOYALTY },
  'loyalty.redeem': { action: Actions.REDEEM, subject: Subjects.LOYALTY },
  'loyalty.award': { action: Actions.AWARD, subject: Subjects.LOYALTY },
  'loyalty.adjust': { action: Actions.ADJUST_POINTS, subject: Subjects.LOYALTY },
  'loyalty.expire': { action: Actions.EXPIRE_POINTS, subject: Subjects.LOYALTY },

  // =====================
  // RÉGULARISATION
  // =====================
  'regularisation.view': { action: Actions.VIEW, subject: Subjects.REGULARISATION },
  'regularisation.create': { action: Actions.CREATE, subject: Subjects.REGULARISATION },
  'regularisation.approve': { action: Actions.APPROVE, subject: Subjects.REGULARISATION },
  'regularisation.reject': { action: Actions.REJECT, subject: Subjects.REGULARISATION },
  'regularisation.manage': { action: Actions.MANAGE, subject: Subjects.REGULARISATION },

  // =====================
  // DÉPARTEMENTS
  // =====================
  'departments.view': { action: Actions.VIEW, subject: Subjects.DEPARTMENT },
  'departments.create': { action: Actions.CREATE, subject: Subjects.DEPARTMENT },
  'departments.edit': { action: Actions.EDIT, subject: Subjects.DEPARTMENT },
  'departments.delete': { action: Actions.DELETE, subject: Subjects.DEPARTMENT },
  'departments.manage': { action: Actions.MANAGE, subject: Subjects.DEPARTMENT },

  // =====================
  // PARAMÈTRES
  // =====================
  'parametres.view': { action: Actions.VIEW, subject: Subjects.SETTINGS },
  'parametres.edit': { action: Actions.EDIT, subject: Subjects.SETTINGS },

  // =====================
  // BOURSE
  // =====================
  'bourse.view': { action: Actions.VIEW, subject: Subjects.BOURSE },
  'bourse.trade': { action: Actions.TRADE, subject: Subjects.BOURSE },

  // =====================
  // LOGE (STOCKAGE)
  // =====================
  'loge.view': { action: Actions.VIEW, subject: Subjects.LOGE },
  'loge.upload': { action: Actions.UPLOAD, subject: Subjects.LOGE },
  'loge.delete': { action: Actions.DELETE, subject: Subjects.LOGE },

  // =====================
};
