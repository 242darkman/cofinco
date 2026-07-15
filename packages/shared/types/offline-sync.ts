/**
 * Contrats partagés — synchronisation offline.
 *
 * Consommés par l'API (agrégation) et le web (bannière « données
 * incomplètes » de l'écran KPI).
 */

/** Un appareil ayant déclaré des opérations en attente. */
export interface PendingSyncDevice {
  deviceId: string;
  agentId: string;
  /** Nom lisible de l'agent (jointure users), si résoluble */
  agentNom: string | null;
  pendingCount: number;
  /** Dernier rapport de l'appareil (handshake ou upload), ISO 8601 */
  reportedAt: string | null;
}

/** Agrégat des opérations offline en attente pour un scope donné. */
export interface PendingSyncSummary {
  /** Somme des opérations en attente déclarées */
  totalPending: number;
  /** Nombre d'appareils avec au moins une opération en attente */
  deviceCount: number;
  /** Plus ancien rapport parmi les appareils en attente, ISO 8601 */
  oldestReportAt: string | null;
  /** Détail des appareils (borné côté serveur) */
  devices: PendingSyncDevice[];
}
