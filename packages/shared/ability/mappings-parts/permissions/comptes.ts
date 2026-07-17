/**
 * Fragment de mappings permission → CASL — domaine « comptes ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permComptes: Record<string, PermissionMapping> = {
  // COMPTES / ÉPARGNES
  // =====================
  'comptes.view': { action: Actions.VIEW, subject: Subjects.COMPTE },
  'comptes.create': { action: Actions.CREATE, subject: Subjects.COMPTE },
  'comptes.edit': { action: Actions.EDIT, subject: Subjects.COMPTE },
  'comptes.delete': { action: Actions.DELETE, subject: Subjects.COMPTE },
  'comptes.export': { action: Actions.EXPORT, subject: Subjects.COMPTE },
  'comptes.transfer': { action: Actions.TRANSFER, subject: Subjects.COMPTE },
  'comptes.suspend': { action: Actions.SUSPEND, subject: Subjects.COMPTE },
  'comptes.unsuspend': { action: Actions.UNSUSPEND, subject: Subjects.COMPTE },
  'comptes.close_initiate': { action: Actions.CLOSE_INITIATE, subject: Subjects.COMPTE },
  'comptes.close_approve': { action: Actions.CLOSE_APPROVE, subject: Subjects.COMPTE },
  'comptes.close_cancel': { action: Actions.CLOSE_CANCEL, subject: Subjects.COMPTE },

  'epargnes.view': { action: Actions.VIEW, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.create': { action: Actions.CREATE, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.edit': { action: Actions.EDIT, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.delete': { action: Actions.DELETE, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.export': { action: Actions.EXPORT, subject: Subjects.COMPTE_EPARGNE },
  'epargnes.deposit': { action: Actions.DEPOSIT, subject: Subjects.COMPTE },
  'epargnes.withdraw': { action: Actions.WITHDRAW, subject: Subjects.COMPTE },

  'comptes-bloques.view': { action: Actions.VIEW, subject: Subjects.COMPTE_BLOQUE },
  'comptes-bloques.create': { action: Actions.CREATE, subject: Subjects.COMPTE_BLOQUE },
  'comptes-bloques.edit': { action: Actions.EDIT, subject: Subjects.COMPTE_BLOQUE },

  // =====================
};
