/**
 * Fragment de mappings permission → CASL — domaine « communications ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permCommunications: Record<string, PermissionMapping> = {
  // NOTIFICATIONS
  // =====================
  'notifications.view': { action: Actions.VIEW, subject: Subjects.NOTIFICATION },
  'notifications.create': { action: Actions.CREATE, subject: Subjects.NOTIFICATION },
  'notifications.edit': { action: Actions.EDIT, subject: Subjects.NOTIFICATION },
  'notifications.manage': { action: Actions.MANAGE, subject: Subjects.NOTIFICATION },

  // =====================
  // COMMUNICATIONS / MESSAGES
  // =====================
  'communications.view': { action: Actions.VIEW, subject: Subjects.COMMUNICATION },
  'communications.create': { action: Actions.CREATE, subject: Subjects.COMMUNICATION },
  'communications.edit': { action: Actions.EDIT, subject: Subjects.COMMUNICATION },
  'communications.delete': { action: Actions.DELETE, subject: Subjects.COMMUNICATION },
  'communications.send': { action: Actions.SEND, subject: Subjects.MESSAGE },
  'communications.broadcast': { action: Actions.BROADCAST, subject: Subjects.COMMUNICATION },
  'communications.schedule': { action: Actions.SCHEDULE, subject: Subjects.COMMUNICATION },
  'communications.archive': { action: Actions.ARCHIVE, subject: Subjects.COMMUNICATION },
  'messages.view': { action: Actions.VIEW, subject: Subjects.MESSAGE },
  'messages.send': { action: Actions.SEND, subject: Subjects.MESSAGE },

  // =====================
};
