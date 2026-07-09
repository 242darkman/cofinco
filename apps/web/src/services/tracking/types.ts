/**
 * Shared TypeScript interfaces for the field agent geolocation tracking system.
 *
 * These types are used by the filter, recorder, resolver, sync, and orchestrator
 * services, as well as the debug UI page.
 */

// ─── Tracked GPS Point ───────────────────────────────────────────

export interface GeoPoint {
  id?: number;
  /** Client-generated UUID for idempotent server sync. */
  clientPointId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
  agentId: string;
  agencyId?: string;
  sessionId: string;
  dayKey: string; // YYYY-MM-DD
  batteryLevel?: number;
  synced: boolean;
  activityType?: string;
  /** Status of reverse geocoding for this point. */
  addressStatus?: 'resolved' | 'pending' | 'disabled';
  /** Snapshot of the resolved address (if available). */
  addressFull?: string;
}

// ─── Structured Address (Nominatim result) ───────────────────────

export interface GeoAddress {
  full: string; // "Rue, Quartier, Ville, Etat, Code postal, Pays"
  road?: string;
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  lat: number;
  lng: number;
  resolvedAt: number;
}

// ─── Day Session ─────────────────────────────────────────────────

export interface GeoSession {
  id?: number;
  sessionId: string;
  agentId: string;
  agencyId?: string;
  dayKey: string;
  startedAt: number;
  endedAt?: number;
  pointCount: number;
  totalDistanceM: number;
  synced: boolean;
}

// ─── Batch Sync Payload ──────────────────────────────────────────

export interface SyncBatch {
  sessionId: string;
  agentId: string;
  agencyId?: string;
  dayKey: string;
  points: Omit<GeoPoint, 'id' | 'synced'>[];
}

export interface SyncResult {
  /** Total points received in the batch. */
  received: number;
  /** Points actually inserted (new). */
  inserted: number;
  /** Points skipped (already existed — deduped). */
  deduped: number;
  /** Legacy alias — equals `inserted`. */
  synced: number;
  errors?: string[];
}

// ─── Filter Configuration ────────────────────────────────────────

export interface FilterConfig {
  /** Reject points with accuracy worse than this (meters). Default 30 */
  maxAccuracyM: number;
  /** Minimum distance to accept a point (meters). Default 5 */
  minDistanceM: number;
  /** Below this speed + below minDistance = immobile (m/s). Default 0.5 */
  minSpeedMs: number;
  /** Max plausible speed (m/s). Default 45 (~162 km/h) */
  maxSpeedMs: number;
  /** If true, maxSpeed raised to 70 m/s (~252 km/h) */
  vehicleMode: boolean;
  /** How long before considering stale (ms). Default 10000 */
  staleTimeoutMs: number;
}

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  maxAccuracyM: 30,
  minDistanceM: 5,
  minSpeedMs: 0.5,
  maxSpeedMs: 45,
  vehicleMode: false,
  staleTimeoutMs: 10_000,
};

// ─── Filter Verdict ──────────────────────────────────────────────

export interface FilterVerdict {
  valid: boolean;
  reason?: 'accuracy' | 'immobile' | 'speed' | 'duplicate';
}

// ─── Tracker Stats ───────────────────────────────────────────────

export interface TrackerStats {
  pointCount: number;
  totalDistanceM: number;
  durationMs: number;
  rejectedCount: number;
  lastPoint: GeoPoint | null;
  lastAddress: GeoAddress | null;
  isTracking: boolean;
  sessionId: string | null;
}

// ─── Tracker Event Callbacks ─────────────────────────────────────

export type PointCallback = (point: GeoPoint) => void;
export type AddressCallback = (address: GeoAddress) => void;
