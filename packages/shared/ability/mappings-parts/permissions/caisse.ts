/**
 * Fragment de mappings permission → CASL — domaine « caisse ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permCaisse: Record<string, PermissionMapping> = {
  // CAISSE
  // =====================
  'caisse.view': { action: Actions.VIEW, subject: Subjects.CAISSE },
  'caisse.create': { action: Actions.CREATE, subject: Subjects.CAISSE_OPERATION },
  'caisse.edit': { action: Actions.EDIT, subject: Subjects.CAISSE },
  'caisse.export': { action: Actions.EXPORT, subject: Subjects.CAISSE },
  'caisse.manage': { action: Actions.MANAGE, subject: Subjects.CAISSE },
  'caisse.deposit': { action: Actions.DEPOSIT, subject: Subjects.CAISSE },
  'caisse.withdraw': { action: Actions.WITHDRAW, subject: Subjects.CAISSE },
  'caisse.transfer': { action: Actions.TRANSFER, subject: Subjects.CAISSE },
  'caisse.paiement': { action: Actions.CREATE, subject: Subjects.PAIEMENT_TERRAIN },
  // Sessions caisse
  'caisse.sessions.view': { action: Actions.VIEW, subject: Subjects.CAISSE_SESSION },
  'caisse.sessions.create': { action: Actions.CREATE, subject: Subjects.CAISSE_SESSION },
  'caisse.sessions.open': { action: Actions.OPEN_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.sessions.close': { action: Actions.CLOSE_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.open': { action: Actions.OPEN_SESSION, subject: Subjects.CAISSE_SESSION },
  'caisse.close': { action: Actions.CLOSE_SESSION, subject: Subjects.CAISSE_SESSION },
  // Opérations caisse
  'caisse.operations.view': { action: Actions.VIEW, subject: Subjects.CAISSE_OPERATION },
  'caisse.operations.create': { action: Actions.CREATE, subject: Subjects.CAISSE_OPERATION },
  'caisse.operations.approve': { action: Actions.APPROVE, subject: Subjects.CAISSE_OPERATION },
  'caisse.operations.cancel': { action: Actions.CANCEL, subject: Subjects.CAISSE_OPERATION },

  // =====================
  // CAISSE AGENT (Terrain)
  // =====================
  'caisseagent.view': { action: Actions.VIEW, subject: Subjects.CAISSE_AGENT },
  'caisseagent.create': { action: Actions.CREATE, subject: Subjects.CAISSE_AGENT },
  'caisseagent.edit': { action: Actions.EDIT, subject: Subjects.CAISSE_AGENT },
  'caisseagent.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.CAISSE_AGENT },
  'caisseagent.reject': { action: Actions.REJECT_AGENT_OP, subject: Subjects.CAISSE_AGENT },
  'caisseagent.suspend': { action: Actions.SUSPEND_AGENT, subject: Subjects.CAISSE_AGENT },
  'caisseagent.manage': { action: Actions.MANAGE, subject: Subjects.CAISSE_AGENT },
  'caisseagent.operations.view': { action: Actions.VIEW, subject: Subjects.OPERATION_TERRAIN },
  'caisseagent.operations.create': { action: Actions.CREATE, subject: Subjects.OPERATION_TERRAIN },
  'caisseagent.operations.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.OPERATION_TERRAIN },
  // Sessions
  'sessions.view': { action: Actions.VIEW, subject: Subjects.SESSION },
  'sessions.terminate': { action: Actions.TERMINATE, subject: Subjects.SESSION },
};
