
export const TRANSFERT_COFFRE_TRANSITIONS: Record<string, string[]> = {
  "Demandé": ["Validé", "Rejeté", "Annulé"],
  "Validé": ["Exécuté"],
  "Exécuté": [],  // Terminal
  "Rejeté": [],   // Terminal
  "Annulé": [],   // Terminal
};

export const TERMINAL_STATES = ["Exécuté", "Rejeté", "Annulé"];

export function isTerminalState(statut: string): boolean {
  return TERMINAL_STATES.includes(statut);
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
