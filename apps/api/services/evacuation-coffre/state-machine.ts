import { StatutEvacuationCoffre, type StatutEvacuationCoffreType } from "@shared/enum/status-constants";

/**
 * Machine à états pour les évacuations de coffre-fort
 *
 * Workflow:
 * DRAFT -> SUBMITTED -> APPROVED -> PREPARED -> IN_TRANSIT -> DEPOSITED -> RECONCILED
 *   |         |           |                                      |
 *   +->CANCEL +->CANCEL   +->CANCEL                             +-> DISCREPANCY
 *             +->REJECT   +->REJECT
 */

export const EVACUATION_COFFRE_TRANSITIONS: Record<string, string[]> = {
  [StatutEvacuationCoffre.DRAFT]: [StatutEvacuationCoffre.SUBMITTED, StatutEvacuationCoffre.CANCELLED],
  [StatutEvacuationCoffre.SUBMITTED]: [StatutEvacuationCoffre.APPROVED, StatutEvacuationCoffre.REJECTED, StatutEvacuationCoffre.CANCELLED],
  [StatutEvacuationCoffre.APPROVED]: [StatutEvacuationCoffre.PREPARED, StatutEvacuationCoffre.REJECTED, StatutEvacuationCoffre.CANCELLED],
  [StatutEvacuationCoffre.PREPARED]: [StatutEvacuationCoffre.IN_TRANSIT],
  [StatutEvacuationCoffre.IN_TRANSIT]: [StatutEvacuationCoffre.DEPOSITED],
  [StatutEvacuationCoffre.DEPOSITED]: [StatutEvacuationCoffre.RECONCILED, StatutEvacuationCoffre.DISCREPANCY],
  [StatutEvacuationCoffre.RECONCILED]: [],
  [StatutEvacuationCoffre.DISCREPANCY]: [],
  [StatutEvacuationCoffre.CANCELLED]: [],
  [StatutEvacuationCoffre.REJECTED]: [],
};

export const TERMINAL_STATES: StatutEvacuationCoffreType[] = [
  StatutEvacuationCoffre.RECONCILED,
  StatutEvacuationCoffre.DISCREPANCY,
  StatutEvacuationCoffre.CANCELLED,
  StatutEvacuationCoffre.REJECTED,
];

export const CANCELLABLE_STATES: StatutEvacuationCoffreType[] = [
  StatutEvacuationCoffre.DRAFT,
  StatutEvacuationCoffre.SUBMITTED,
  StatutEvacuationCoffre.APPROVED,
];

/**
 * Vérifie si une transition de statut est valide
 */
export function isValidTransition(from: string, to: string): boolean {
  const allowed = EVACUATION_COFFRE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Vérifie si un statut est terminal (aucune transition possible)
 */
export function isTerminalState(statut: string): boolean {
  return TERMINAL_STATES.includes(statut as StatutEvacuationCoffreType);
}

/**
 * Vérifie si une évacuation peut être annulée depuis son statut actuel
 */
export function isCancellable(statut: string): boolean {
  return CANCELLABLE_STATES.includes(statut as StatutEvacuationCoffreType);
}

/**
 * Retourne les transitions possibles depuis un statut donné
 */
export function getAvailableTransitions(statut: string): string[] {
  return EVACUATION_COFFRE_TRANSITIONS[statut] || [];
}

/**
 * Mapping action -> nouveau statut attendu
 */
export const ACTION_TO_STATUS: Record<string, string> = {
  submit: StatutEvacuationCoffre.SUBMITTED,
  approve: StatutEvacuationCoffre.APPROVED,
  reject: StatutEvacuationCoffre.REJECTED,
  prepare: StatutEvacuationCoffre.PREPARED,
  dispatch: StatutEvacuationCoffre.IN_TRANSIT,
  deposit: StatutEvacuationCoffre.DEPOSITED,
  reconcile: StatutEvacuationCoffre.RECONCILED,
  flag_discrepancy: StatutEvacuationCoffre.DISCREPANCY,
  cancel: StatutEvacuationCoffre.CANCELLED,
};
