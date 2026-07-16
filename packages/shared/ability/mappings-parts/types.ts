/**
 * Contrat d'un mapping permission → capacité CASL.
 */
import type { Action } from "../actions";
import type { Subject } from "../subjects";

export interface PermissionMapping {
  action: Action;
  subject: Subject;
  conditions?: Record<string, any>;
}
