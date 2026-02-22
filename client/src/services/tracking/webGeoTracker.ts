/**
 * Web Geo Tracker — pure orchestrator for GPS tracking.
 *
 * This module does NOT own a watchPosition. It is a processing pipeline:
 *   ingest(coords) → filter → record → resolve → sync
 *
 * The caller (LocationTracker or TrackingDebugPage) owns the GPS source
 * and feeds positions via ingest(). This prevents:
 *   - duplicate watchPosition (double battery drain)
 *   - double-counted points
 *   - inconsistent stats
 *
 * Visibility state (foreground / background / throttled) is tracked so that
 * consumers can display the current tracking quality to the user.
 *
 * NOTE: Web browsers throttle geolocation in background tabs. For reliable
 * background tracking, consider a native wrapper (Capacitor) or recommend
 * users "install" the PWA for better lifecycle support. A future
 * capGeoTracker.ts with the same API could use @capacitor/geolocation.
 */

import { createGeoFilter, type GeoFilterState } from './geoFilter';
import { createTrackRecorder, type TrackRecorderInstance } from './trackRecorder';
import { createNominatimResolver, type NominatimResolverInstance } from './nominatimResolver';
import { createTrackSync, type TrackSyncInstance } from './trackSync';
import type {
  FilterConfig,
  GeoPoint,
  GeoAddress,
  TrackerStats,
  PointCallback,
  AddressCallback,
} from './types';

// ─── Visibility state ────────────────────────────────────────────

export type VisibilityState = 'foreground' | 'background' | 'throttled';

// ─── Config ──────────────────────────────────────────────────────

export interface WebGeoTrackerConfig {
  agentId: string;
  agencyId?: string;
  filter?: Partial<FilterConfig>;
}

// ─── Instance interface ──────────────────────────────────────────

export interface WebGeoTrackerInstance {
  /** Initialise sub-services and start auto-sync. No watchPosition. */
  start(): void;
  /** Close session, final sync attempt, cleanup. */
  stop(): Promise<void>;
  /** Feed a GPS position from an external source. */
  ingest(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    heading: number | null | undefined,
    altitude: number | null | undefined,
    batteryLevel?: number,
  ): void;
  onPoint(cb: PointCallback): () => void;
  onAddress(cb: AddressCallback): () => void;
  getStats(): TrackerStats;
  readonly isTracking: boolean;
  readonly visibility: VisibilityState;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createWebGeoTracker(
  config: WebGeoTrackerConfig,
): WebGeoTrackerInstance {
  const { agentId, agencyId } = config;

  let filter: GeoFilterState;
  let recorder: TrackRecorderInstance;
  let resolver: NominatimResolverInstance;
  let syncer: TrackSyncInstance;

  let isTracking = false;
  let startTime = 0;
  let visibility: VisibilityState = 'foreground';
  let visibilityHandler: (() => void) | null = null;
  let hiddenSince = 0;

  const pointListeners = new Set<PointCallback>();
  const addressListeners = new Set<AddressCallback>();

  let lastPoint: GeoPoint | null = null;
  let lastAddress: GeoAddress | null = null;
  let rejectedCount = 0;

  function init() {
    filter = createGeoFilter(config.filter);
    recorder = createTrackRecorder(agentId, agencyId);
    resolver = createNominatimResolver();
    syncer = createTrackSync(agentId);
  }

  // ─── Visibility tracking ─────────────────────────────────────

  function startVisibilityTracking() {
    if (typeof document === 'undefined') return;
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        visibility = 'foreground';
        hiddenSince = 0;
      } else {
        hiddenSince = Date.now();
        visibility = 'background';
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  function stopVisibilityTracking() {
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  }

  function currentVisibility(): VisibilityState {
    if (visibility === 'background' && hiddenSince > 0) {
      // After 30s hidden, browsers heavily throttle GPS
      if (Date.now() - hiddenSince > 30_000) return 'throttled';
    }
    return visibility;
  }

  // ─── Core ingest pipeline ────────────────────────────────────

  async function handlePosition(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    heading: number | null | undefined,
    altitude: number | null | undefined,
    batteryLevel?: number,
  ): Promise<void> {
    const now = Date.now();
    const verdict = filter.evaluate(latitude, longitude, accuracy, speed, now);

    if (!verdict.valid) {
      rejectedCount++;
      return;
    }

    // Record the valid point
    const point = await recorder.record(
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      altitude,
      batteryLevel,
    );

    lastPoint = point;

    // Notify listeners
    for (const cb of pointListeners) {
      try {
        cb(point);
      } catch {
        // Listener error — don't break the loop
      }
    }

    // Resolve address (throttled, async, non-blocking)
    resolver.resolve(latitude, longitude).then((addr) => {
      if (addr) {
        lastAddress = addr;
        point.addressStatus = 'resolved';
        point.addressFull = addr.full;
        for (const cb of addressListeners) {
          try {
            cb(addr);
          } catch {
            // Listener error
          }
        }
      } else {
        point.addressStatus = resolver.disabled ? 'disabled' : 'pending';
      }
    });
  }

  // ─── Public API ──────────────────────────────────────────────

  function start(): void {
    if (isTracking) return;

    init();
    isTracking = true;
    startTime = Date.now();

    syncer.startAutoSync();
    startVisibilityTracking();
  }

  async function stop(): Promise<void> {
    if (!isTracking) return;
    isTracking = false;

    stopVisibilityTracking();

    if (recorder) {
      await recorder.close();
    }

    if (syncer) {
      syncer.stopAutoSync();
      try {
        await syncer.sync();
      } catch {
        // Best effort
      }
    }
  }

  function ingest(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    heading: number | null | undefined,
    altitude: number | null | undefined,
    batteryLevel?: number,
  ): void {
    if (!isTracking) return;
    handlePosition(latitude, longitude, accuracy, speed, heading, altitude, batteryLevel);
  }

  function onPoint(cb: PointCallback): () => void {
    pointListeners.add(cb);
    return () => pointListeners.delete(cb);
  }

  function onAddress(cb: AddressCallback): () => void {
    addressListeners.add(cb);
    return () => addressListeners.delete(cb);
  }

  function getStats(): TrackerStats {
    const session = recorder?.getSession();
    return {
      pointCount: session?.pointCount ?? 0,
      totalDistanceM: session?.totalDistanceM ?? 0,
      durationMs: isTracking ? Date.now() - startTime : 0,
      rejectedCount,
      lastPoint,
      lastAddress,
      isTracking,
      sessionId: recorder?.sessionId ?? null,
    };
  }

  return {
    start,
    stop,
    ingest,
    onPoint,
    onAddress,
    getStats,
    get isTracking() {
      return isTracking;
    },
    get visibility() {
      return currentVisibility();
    },
  };
}
