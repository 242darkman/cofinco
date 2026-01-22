import { StatutTransfertCoffre } from "@shared/enum/status-constants";

export const TRANSFERT_COFFRE_TRANSITIONS: Record<string, string[]> = {
  [StatutTransfertCoffre.REQUESTED]: [StatutTransfertCoffre.VALIDATED, StatutTransfertCoffre.REJECTED, StatutTransfertCoffre.CANCELLED],
  [StatutTransfertCoffre.VALIDATED]: [StatutTransfertCoffre.EXECUTED],
  [StatutTransfertCoffre.EXECUTED]: [],  // Terminal
  [StatutTransfertCoffre.REJECTED]: [],   // Terminal
  [StatutTransfertCoffre.CANCELLED]: [],   // Terminal
};

export const TERMINAL_STATES = [StatutTransfertCoffre.EXECUTED, StatutTransfertCoffre.REJECTED, StatutTransfertCoffre.CANCELLED];

export function isTerminalState(statut: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(statut);
}

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSFERT_COFFRE_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function validateTransition(
  currentStatut: string,
  targetStatut: string
): { valid: boolean; error?: string } {
  if (isTerminalState(currentStatut)) {
    return {
      valid: false,
      error: `TRANSITION_FROM_TERMINAL: Le transfert est en état terminal '${currentStatut}' et ne peut plus être modifié`,
    };
  }

  if (!canTransition(currentStatut, targetStatut)) {
    return {
      valid: false,
      error: `INVALID_TRANSITION: Transition de '${currentStatut}' vers '${targetStatut}' non autorisée`,
    };
  }

  return { valid: true };
}
