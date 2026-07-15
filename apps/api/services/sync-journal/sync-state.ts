/**
 * Sync State — suivi des opérations offline en attente par appareil.
 *
 * Le client déclare son nombre d'opérations en attente au handshake puis
 * après chaque lot uploadé. Ces déclarations sont agrégées pour l'écran
 * KPI : un total non nul signifie que les indicateurs temps réel sont
 * potentiellement incomplets.
 *
 * Les écritures sont volontairement non bloquantes pour la sync elle-même
 * (best effort journalisé) : perdre un rapport de compteur ne doit jamais
 * faire échouer un handshake ou un upload.
 */
import { db } from "../../db";
import { deviceSyncStates, users } from "@shared/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import type { PendingSyncSummary } from "@shared/types/offline-sync";
import { buildPendingSummary } from "./sync-state-summary";

const logger = createLogger('SyncState');

export interface UpsertSyncStateParams {
  deviceId: string;
  agentId: string;
  agenceId?: string | null;
  /** Compteur déclaré ; undefined = conserver la dernière valeur */
  pendingCount?: number;
  event: 'handshake' | 'upload';
}

/**
 * Enregistre le dernier état déclaré d'un appareil (best effort).
 * Ne lève jamais : un échec est journalisé sans impacter l'appelant.
 */
export async function recordDeviceSyncState(params: UpsertSyncStateParams): Promise<void> {
  const { deviceId, agentId, agenceId, pendingCount, event } = params;
  const now = new Date();
  try {
    const timestamps = event === 'handshake'
      ? { lastHandshakeAt: now }
      : { lastUploadAt: now };

    await db
      .insert(deviceSyncStates)
      .values({
        deviceId,
        agentId,
        agenceId: agenceId ?? null,
        reportedPendingCount: pendingCount ?? 0,
        ...timestamps,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: deviceSyncStates.deviceId,
        set: {
          agentId,
          ...(agenceId !== undefined ? { agenceId } : {}),
          ...(pendingCount !== undefined ? { reportedPendingCount: pendingCount } : {}),
          ...timestamps,
          updatedAt: now,
        },
      });
  } catch (err) {
    logger.warn({ err, deviceId, event }, "Échec d'enregistrement de l'état de sync (non bloquant)");
  }
}

/**
 * Agrégat des opérations en attente pour un scope.
 * `agenceId` null = consolidé (toutes agences).
 */
export async function getPendingSyncSummary(agenceId: string | null): Promise<PendingSyncSummary> {
  const conditions = [gt(deviceSyncStates.reportedPendingCount, 0)];
  if (agenceId) {
    conditions.push(eq(deviceSyncStates.agenceId, agenceId));
  }

  const rows = await db
    .select({
      deviceId: deviceSyncStates.deviceId,
      agentId: deviceSyncStates.agentId,
      agentNom: users.nom,
      agentPrenom: users.prenom,
      pendingCount: deviceSyncStates.reportedPendingCount,
      lastHandshakeAt: deviceSyncStates.lastHandshakeAt,
      lastUploadAt: deviceSyncStates.lastUploadAt,
    })
    .from(deviceSyncStates)
    .leftJoin(users, eq(deviceSyncStates.agentId, users.id))
    .where(and(...conditions))
    .orderBy(desc(deviceSyncStates.reportedPendingCount), sql`${deviceSyncStates.updatedAt} ASC`);

  return buildPendingSummary(rows);
}
