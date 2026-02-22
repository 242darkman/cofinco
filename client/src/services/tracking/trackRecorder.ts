/**
 * Track Recorder — writes filtered GPS points into IndexedDB via Dexie.
 *
 * Manages daily sessions (dayKey YYYY-MM-DD + sessionId) and accumulates
 * distance / point count incrementally.
 *
 * Session persistence:
 * - sessionId is stored in sessionStorage so it survives page reloads
 *   within the same browser tab but starts fresh in a new tab.
 * - If agencyId changes mid-session the old session is closed and a new
 *   one is started (avoids mixing distance data across agencies).
 */

import {
  addGpsTrackPoint,
  upsertTrackingSession,
  type GpsTrackPoint,
  type TrackingSession,
} from '@/lib/offline-db';
import { haversineMeters, todayKey } from './geoFilter';
import type { GeoPoint, GeoSession } from './types';

// ─── Session key in sessionStorage ───────────────────────────────

const SESSION_STORAGE_KEY = 'cofinco_tracking_session';

interface PersistedSession {
  sessionId: string;
  agentId: string;
  agencyId?: string;
  dayKey: string;
  startedAt: number;
  pointCount: number;
  totalDistanceM: number;
  lastLat?: number;
  lastLng?: number;
}

function persistSession(data: PersistedSession): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage full or unavailable — non-critical
  }
}

function loadPersistedSession(agentId: string, agencyId?: string): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data: PersistedSession = JSON.parse(raw);
    // Must match current agent, agency, and day
    if (
      data.agentId !== agentId ||
      data.agencyId !== agencyId ||
      data.dayKey !== todayKey()
    ) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function generateSessionId(agentId: string, dayKey: string): string {
  return `${agentId}_${dayKey}_${Date.now().toString(36)}`;
}

// ─── Public interface ────────────────────────────────────────────

export interface TrackRecorderInstance {
  record(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed?: number | null,
    heading?: number | null,
    altitude?: number | null,
    batteryLevel?: number,
    activityType?: string,
  ): Promise<GeoPoint>;

  getSession(): GeoSession;
  close(): Promise<void>;

  readonly sessionId: string;
  readonly dayKey: string;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createTrackRecorder(
  agentId: string,
  agencyId?: string,
): TrackRecorderInstance {
  // Try to resume an existing session from sessionStorage
  const persisted = loadPersistedSession(agentId, agencyId);

  let dayKey = persisted?.dayKey ?? todayKey();
  let sessionId = persisted?.sessionId ?? generateSessionId(agentId, dayKey);
  let pointCount = persisted?.pointCount ?? 0;
  let totalDistanceM = persisted?.totalDistanceM ?? 0;
  let startedAt = persisted?.startedAt ?? Date.now();
  let lastRecorded: { lat: number; lng: number } | null =
    persisted?.lastLat != null && persisted?.lastLng != null
      ? { lat: persisted.lastLat, lng: persisted.lastLng }
      : null;

  // Persist initial session to IndexedDB
  upsertTrackingSession({
    sessionId,
    agentId,
    agencyId,
    dayKey,
    startedAt,
    pointCount,
    totalDistanceM,
    synced: false,
  });

  function saveToSessionStorage(): void {
    persistSession({
      sessionId,
      agentId,
      agencyId,
      dayKey,
      startedAt,
      pointCount,
      totalDistanceM,
      lastLat: lastRecorded?.lat,
      lastLng: lastRecorded?.lng,
    });
  }

  function ensureDaySession(): void {
    const currentDay = todayKey();
    if (currentDay !== dayKey) {
      // Day changed — close old session and start new one
      upsertTrackingSession({
        sessionId,
        agentId,
        agencyId,
        dayKey,
        startedAt,
        endedAt: Date.now(),
        pointCount,
        totalDistanceM,
        synced: false,
      });

      dayKey = currentDay;
      sessionId = generateSessionId(agentId, dayKey);
      pointCount = 0;
      totalDistanceM = 0;
      startedAt = Date.now();
      lastRecorded = null;

      upsertTrackingSession({
        sessionId,
        agentId,
        agencyId,
        dayKey,
        startedAt,
        pointCount: 0,
        totalDistanceM: 0,
        synced: false,
      });

      saveToSessionStorage();
    }
  }

  async function record(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed?: number | null,
    heading?: number | null,
    altitude?: number | null,
    batteryLevel?: number,
    activityType?: string,
  ): Promise<GeoPoint> {
    ensureDaySession();

    const now = Date.now();

    if (lastRecorded) {
      const dist = haversineMeters(
        lastRecorded.lat,
        lastRecorded.lng,
        latitude,
        longitude,
      );
      totalDistanceM += dist;
    }
    lastRecorded = { lat: latitude, lng: longitude };
    pointCount++;

    const clientPointId = crypto.randomUUID();

    const point: GeoPoint = {
      clientPointId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      altitude,
      timestamp: now,
      agentId,
      agencyId,
      sessionId,
      dayKey,
      batteryLevel,
      synced: false,
      activityType,
    };

    await addGpsTrackPoint({
      clientPointId,
      agentId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      altitude,
      timestamp: now,
      sessionId,
      dayKey,
      batteryLevel,
      activityType: activityType as GpsTrackPoint['activityType'],
    });

    // Update session in IndexedDB (fire-and-forget)
    upsertTrackingSession({
      sessionId,
      agentId,
      agencyId,
      dayKey,
      startedAt,
      pointCount,
      totalDistanceM,
      synced: false,
    });

    saveToSessionStorage();

    return point;
  }

  function getSessionSnapshot(): GeoSession {
    return {
      sessionId,
      agentId,
      agencyId,
      dayKey,
      startedAt,
      pointCount,
      totalDistanceM,
      synced: false,
    };
  }

  async function close(): Promise<void> {
    await upsertTrackingSession({
      sessionId,
      agentId,
      agencyId,
      dayKey,
      startedAt,
      endedAt: Date.now(),
      pointCount,
      totalDistanceM,
      synced: false,
    });
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  return {
    record,
    getSession: getSessionSnapshot,
    close,
    get sessionId() {
      return sessionId;
    },
    get dayKey() {
      return dayKey;
    },
  };
}
