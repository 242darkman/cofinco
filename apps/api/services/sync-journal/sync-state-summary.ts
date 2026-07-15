/**
 * Sync State Summary — façonnage pur de l'agrégat d'opérations en attente.
 *
 * Module sans dépendance DB : testable unitairement.
 */
import type { PendingSyncDevice, PendingSyncSummary } from "@shared/types/offline-sync";

/** Nombre maximal d'appareils détaillés dans l'agrégat. */
export const MAX_DEVICES_IN_SUMMARY = 10;

export interface PendingRow {
  deviceId: string;
  agentId: string;
  agentNom: string | null;
  agentPrenom: string | null;
  pendingCount: number;
  lastHandshakeAt: Date | null;
  lastUploadAt: Date | null;
}

/**
 * Total, nombre d'appareils, rapport le plus ancien, détail borné.
 * Le rapport d'un appareil est le plus RÉCENT de ses contacts
 * (handshake/upload) ; l'agrégat retient le plus ANCIEN de ces rapports
 * (l'appareil le plus silencieux détermine la fraîcheur globale).
 */
export function buildPendingSummary(rows: PendingRow[]): PendingSyncSummary {
  let totalPending = 0;
  let oldestReportAt: Date | null = null;
  const devices: PendingSyncDevice[] = [];

  for (const row of rows) {
    totalPending += row.pendingCount;

    const reportedAt = [row.lastHandshakeAt, row.lastUploadAt]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    if (reportedAt && (!oldestReportAt || reportedAt < oldestReportAt)) {
      oldestReportAt = reportedAt;
    }

    if (devices.length < MAX_DEVICES_IN_SUMMARY) {
      devices.push({
        deviceId: row.deviceId,
        agentId: row.agentId,
        agentNom: row.agentNom
          ? `${row.agentNom}${row.agentPrenom ? ` ${row.agentPrenom}` : ''}`
          : null,
        pendingCount: row.pendingCount,
        reportedAt: reportedAt ? reportedAt.toISOString() : null,
      });
    }
  }

  return {
    totalPending,
    deviceCount: rows.length,
    oldestReportAt: oldestReportAt ? oldestReportAt.toISOString() : null,
    devices,
  };
}
