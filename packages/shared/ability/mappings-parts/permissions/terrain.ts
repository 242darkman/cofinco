/**
 * Fragment de mappings permission → CASL — domaine « terrain ».
 * Assemblé dans ../../mappings.ts (façade). Ne pas importer directement ailleurs.
 */
import { Actions } from "../../actions";
import { Subjects } from "../../subjects";
import type { PermissionMapping } from "../types";

export const permTerrain: Record<string, PermissionMapping> = {
  // AGENTS TERRAIN
  // =====================
  'terrain.view': { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
  'terrain.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },
  'terrain.edit': { action: Actions.EDIT, subject: Subjects.AGENT_TERRAIN },
  'terrain.delete': { action: Actions.DELETE, subject: Subjects.AGENT_TERRAIN },
  'terrain.export': { action: Actions.EXPORT, subject: Subjects.TERRAIN },
  'terrain.operations.view': { action: Actions.VIEW, subject: Subjects.OPERATION_TERRAIN },
  'terrain.operations.approve': { action: Actions.APPROVE_AGENT_OP, subject: Subjects.OPERATION_TERRAIN },
  // Agent (alias pour terrain)
  'agent.view': { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
  'agent.create': { action: Actions.CREATE, subject: Subjects.AGENT_TERRAIN },
  'agent.edit': { action: Actions.EDIT, subject: Subjects.AGENT_TERRAIN },
  'agent.collect': { action: Actions.COLLECT, subject: Subjects.AGENT_TERRAIN },
  'agent.manage': { action: Actions.MANAGE, subject: Subjects.AGENT_TERRAIN },
  // Incidents
  'incidents.view': { action: Actions.VIEW, subject: Subjects.INCIDENT },
  'incidents.create': { action: Actions.CREATE, subject: Subjects.INCIDENT },
  'incidents.edit': { action: Actions.EDIT, subject: Subjects.INCIDENT },
  'incidents.manage': { action: Actions.MANAGE, subject: Subjects.INCIDENT },
  // Visites
  'visites.view': { action: Actions.VIEW, subject: Subjects.VISITE },
  'visites.create': { action: Actions.CREATE, subject: Subjects.VISITE },
  // Prospection
  'prospection.view': { action: Actions.VIEW, subject: Subjects.PROSPECTION },
  'prospection.create': { action: Actions.CREATE, subject: Subjects.PROSPECTION },
  'prospection.edit': { action: Actions.EDIT, subject: Subjects.PROSPECTION },
  'prospection.delete': { action: Actions.DELETE, subject: Subjects.PROSPECTION },
  'prospection.convert': { action: Actions.CONVERT, subject: Subjects.PROSPECTION },
  'prospection.export': { action: Actions.EXPORT, subject: Subjects.PROSPECTION },
  // Primes de prospection
  'prospection.primes.view': { action: Actions.VIEW, subject: Subjects.PROSPECTION_PRIME },
  'prospection.primes.approve': { action: Actions.APPROVE, subject: Subjects.PROSPECTION_PRIME },
  'prospection.primes.reject': { action: Actions.REJECT, subject: Subjects.PROSPECTION_PRIME },
  'prospection.primes.pay': { action: Actions.VALIDATE, subject: Subjects.PROSPECTION_PRIME },
  // Supervision prospection
  'prospection.supervision.view': { action: Actions.VIEW, subject: Subjects.TERRAIN },
  // Zones commerciales (Arrondissements & Marchés)
  'zones.view': { action: Actions.VIEW, subject: Subjects.ARRONDISSEMENT },
  'zones.create': { action: Actions.CREATE, subject: Subjects.ARRONDISSEMENT },
  'zones.edit': { action: Actions.EDIT, subject: Subjects.ARRONDISSEMENT },
  'zones.delete': { action: Actions.DELETE, subject: Subjects.ARRONDISSEMENT },

  // =====================
};
