/**
 * Constantes partagées pour le workflow d'ouverture de session de caisse
 */

export const TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;

export const DEFAULT_REQUEST_EXPIRY_HOURS = 4; // Expiration de la demande après 4h
export const DEFAULT_SESSION_TIMEOUT_HOURS = 12; // Timeout max d'une session de caisse
