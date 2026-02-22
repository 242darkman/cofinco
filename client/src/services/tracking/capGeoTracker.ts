/**
 * Capacitor Geo Tracker — same API as webGeoTracker, but uses
 * @capacitor/geolocation for native GPS (background-capable).
 *
 * Unlike webGeoTracker (which is ingest-only), this tracker OWNS
 * the GPS source via Capacitor's watchPosition, because native
 * background tracking is only possible through the native plugin.
 *
 * Shared services (filter, recorder, resolver, sync) are reused —
 * no logic duplication.
 *
 * Prerequisites (NOT bundled — install when needed):
 *   npm i @capacitor/core @capacitor/geolocation
 *   npx cap sync
 *
 * Usage:
 *   import { createCapGeoTracker } from './capGeoTracker';
 *   const tracker = createCapGeoTracker({ agentId, agencyId });
 *   tracker.start();  // requests permission + starts native watch
 *   tracker.stop();   // clears watch + flushes sync
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
import type { VisibilityState, WebGeoTrackerConfig, WebGeoTrackerInstance } from './webGeoTracker';

// ─── Capacitor types (dynamic import to avoid hard dependency) ───

interface CapPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

interface CapGeolocationPlugin {
  watchPosition(
    options: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
    callback: (position: CapPosition | null, err?: any) => void,
  ): Promise<string>;
  clearWatch(options: { id: string }): Promise<void>;
  checkPermissions(): Promise<{ location: string; coarseLocation: string }>;
  requestPermissions(): Promise<{ location: string; coarseLocation: string }>;
}

// ─── Factory ─────────────────────────────────────────────────

export function createCapGeoTracker(
  config: WebGeoTrackerConfig,
): WebGeoTrackerInstance {
  const { agentId, agencyId } = config;

  let filter: GeoFilterState;
  let recorder: TrackRecorderInstance;
  let resolver: NominatimResolverInstance;
  let syncer: TrackSyncInstance;

  let isTracking = false;
  let startTime = 0;
  let watchId: string | null = null;

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

  async function getGeolocationPlugin(): Promise<CapGeolocationPlugin | null> {
    try {
      // Dynamic import with variable to prevent Rollup from resolving at build time.
      // @capacitor/geolocation is an optional peer dependency — only present
      // when the project has Capacitor installed (npx cap init + npm i @capacitor/geolocation).
      const moduleName = '@capacitor/geolocation';
      const mod = await (new Function('m', 'return import(m)') as (m: string) => Promise<any>)(moduleName);
      return mod.Geolocation as CapGeolocationPlugin;
    } catch {
      console.warn('[CapGeoTracker] @capacitor/geolocation not available');
      return null;
    }
  }

  async function ensurePermission(plugin: CapGeolocationPlugin): Promise<boolean> {
    const perm = await plugin.checkPermissions();
    if (perm.location === 'granted') return true;

    const requested = await plugin.requestPermissions();
    return requested.location === 'granted';
  }

  // ─── Core ingest pipeline (shared with webGeoTracker) ──────

  async function handlePosition(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    heading: number | null | undefined,
    altitude: number | null | undefined,
  ): Promise<void> {
    const now = Date.now();
    const verdict = filter.evaluate(latitude, longitude, accuracy, speed, now);

    if (!verdict.valid) {
      rejectedCount++;
      return;
    }

    const point = await recorder.record(
      latitude, longitude, accuracy, speed, heading, altitude,
    );

    lastPoint = point;

    for (const cb of pointListeners) {
      try { cb(point); } catch { /* listener error */ }
    }

    resolver.resolve(latitude, longitude).then((addr) => {
      if (addr) {
        lastAddress = addr;
        point.addressStatus = 'resolved';
        point.addressFull = addr.full;
        for (const cb of addressListeners) {
          try { cb(addr); } catch { /* */ }
        }
      } else {
        point.addressStatus = resolver.disabled ? 'disabled' : 'pending';
      }
    });
  }

  // ─── Public API (same interface as WebGeoTrackerInstance) ──

  async function start(): Promise<void> {
    if (isTracking) return;

    const plugin = await getGeolocationPlugin();
    if (!plugin) {
      console.error('[CapGeoTracker] Cannot start — plugin unavailable');
      return;
    }

    const hasPermission = await ensurePermission(plugin);
    if (!hasPermission) {
      console.warn('[CapGeoTracker] GPS permission denied');
      return;
    }

    init();
    isTracking = true;
    startTime = Date.now();
    syncer.startAutoSync();

    watchId = await plugin.watchPosition(
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 5_000 },
      (position, err) => {
        if (err || !position) return;
        const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
        handlePosition(latitude, longitude, accuracy, speed, heading, altitude);
      },
    );
  }

  async function stop(): Promise<void> {
    if (!isTracking) return;
    isTracking = false;

    if (watchId) {
      const plugin = await getGeolocationPlugin();
      if (plugin) {
        await plugin.clearWatch({ id: watchId });
      }
      watchId = null;
    }

    if (recorder) await recorder.close();
    if (syncer) {
      syncer.stopAutoSync();
      try { await syncer.sync(); } catch { /* best effort */ }
    }
  }

  function ingest(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    heading: number | null | undefined,
    altitude: number | null | undefined,
    _batteryLevel?: number,
  ): void {
    // In Capacitor mode, GPS comes from native watchPosition, not external ingest.
    // But we keep the same API for compatibility — just pipe through.
    if (!isTracking) return;
    handlePosition(latitude, longitude, accuracy, speed, heading, altitude);
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
    start: start as () => void, // cast — start is async but interface is sync
    stop,
    ingest,
    onPoint,
    onAddress,
    getStats,
    get isTracking() {
      return isTracking;
    },
    get visibility(): VisibilityState {
      // Native apps don't get throttled the same way — always "foreground"
      return 'foreground';
    },
  };
}
