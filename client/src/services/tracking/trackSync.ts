/**
 * Batch Sync Service — syncs locally stored GPS points to the server.
 *
 * Features:
 * - Batches of max 200 points per request
 * - Exponential backoff retry (1s → 2s → 4s → 8s, max 3 retries)
 * - Decimation if > 1000 pending points (keep 1 point per 5s minimum)
 * - Auto-sync every 60s when online
 * - Marks points as synced in IndexedDB after server ACK
 */

import {
  getUnsyncedTrackPoints,
  markTrackPointsSynced,
  type GpsTrackPoint,
} from '@/lib/offline-db';
import type { SyncBatch, SyncResult } from './types';

const BATCH_SIZE = 200;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const AUTO_SYNC_INTERVAL_MS = 60_000;
const DECIMATION_THRESHOLD = 1_000;
const DECIMATION_MIN_INTERVAL_MS = 5_000; // keep 1 point per 5s

function decimatePoints(points: GpsTrackPoint[]): GpsTrackPoint[] {
  if (points.length <= DECIMATION_THRESHOLD) return points;

  // Sort by timestamp, keep 1 point per 5s minimum
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const result: GpsTrackPoint[] = [sorted[0]];
  let lastKept = sorted[0].timestamp;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp - lastKept >= DECIMATION_MIN_INTERVAL_MS) {
      result.push(sorted[i]);
      lastKept = sorted[i].timestamp;
    }
  }

  // Always keep the last point
  const last = sorted[sorted.length - 1];
  if (result[result.length - 1] !== last) {
    result.push(last);
  }

  return result;
}

function groupBySession(
  points: GpsTrackPoint[],
): Map<string, GpsTrackPoint[]> {
  const groups = new Map<string, GpsTrackPoint[]>();
  for (const p of points) {
    const key = p.sessionId || 'unknown';
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }
  return groups;
}

async function sendBatch(batch: SyncBatch): Promise<SyncResult> {
  const res = await fetch('/api/tracking/batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Sync failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function sendWithRetry(batch: SyncBatch): Promise<SyncResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await sendBatch(batch);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

export interface TrackSyncInstance {
  /** Sync all pending points. Returns total synced count. */
  sync(): Promise<number>;
  /** Start auto-sync (every 60s). */
  startAutoSync(): void;
  /** Stop auto-sync. */
  stopAutoSync(): void;
  /** Whether a sync is currently in progress. */
  readonly isSyncing: boolean;
}

export function createTrackSync(agentId: string): TrackSyncInstance {
  let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  let isSyncing = false;

  async function sync(): Promise<number> {
    if (isSyncing) return 0;
    isSyncing = true;

    try {
      let allPoints = await getUnsyncedTrackPoints(agentId);
      if (allPoints.length === 0) return 0;

      // Decimate if too many
      allPoints = decimatePoints(allPoints);

      // Group by session
      const groups = groupBySession(allPoints);
      let totalSynced = 0;

      for (const [sessionKey, sessionPoints] of groups) {
        // Split into batches
        for (let i = 0; i < sessionPoints.length; i += BATCH_SIZE) {
          const chunk = sessionPoints.slice(i, i + BATCH_SIZE);
          const dayKey = chunk[0].dayKey || new Date(chunk[0].timestamp).toISOString().slice(0, 10);

          const batch: SyncBatch = {
            sessionId: sessionKey,
            agentId,
            agencyId: undefined,
            dayKey,
            points: chunk.map((p) => ({
              clientPointId: p.clientPointId || crypto.randomUUID(),
              latitude: p.latitude,
              longitude: p.longitude,
              accuracy: p.accuracy,
              speed: p.speed,
              heading: p.heading,
              altitude: p.altitude,
              timestamp: p.timestamp,
              agentId: p.agentId,
              agencyId: undefined,
              sessionId: sessionKey,
              dayKey,
              batteryLevel: p.batteryLevel,
              activityType: p.activityType,
            })),
          };

          try {
            const result = await sendWithRetry(batch);
            // Mark synced
            const ids = chunk.map((p) => p.id!).filter(Boolean);
            if (ids.length > 0) {
              await markTrackPointsSynced(ids);
            }
            totalSynced += result.synced;
          } catch {
            // Batch failed after retries — skip this batch, try next
            console.warn(`[TrackSync] Batch sync failed for session ${sessionKey}, skipping`);
          }
        }
      }

      return totalSynced;
    } finally {
      isSyncing = false;
    }
  }

  function startAutoSync(): void {
    if (autoSyncTimer) return;
    autoSyncTimer = setInterval(() => {
      if (navigator.onLine) {
        sync().catch(() => {});
      }
    }, AUTO_SYNC_INTERVAL_MS);
  }

  function stopAutoSync(): void {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  return {
    sync,
    startAutoSync,
    stopAutoSync,
    get isSyncing() {
      return isSyncing;
    },
  };
}
