/**
 * Tracker Factory — runtime switch between web and Capacitor GPS trackers.
 *
 * Both trackers expose the exact same WebGeoTrackerInstance interface.
 *
 * Detection logic:
 *   1. If `window.Capacitor?.isNativePlatform()` → capGeoTracker
 *      (uses @capacitor/geolocation, owns watchPosition, background-capable)
 *   2. Otherwise → webGeoTracker
 *      (pure ingest-only pipeline, caller provides GPS via ingest())
 *
 * This allows the rest of the app (LocationTracker, debug page) to use
 * a single tracker interface regardless of runtime.
 */

import { createWebGeoTracker, type WebGeoTrackerConfig, type WebGeoTrackerInstance } from './webGeoTracker';

// ─── Runtime detection ──────────────────────────────────────

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform(): boolean;
      getPlatform(): string;
    };
  }
}

export function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform();
}

// ─── Factory ────────────────────────────────────────────────

/**
 * Create the appropriate tracker for the current runtime.
 *
 * - **Web/PWA**: returns webGeoTracker (ingest-only, no watchPosition).
 *   The caller must provide GPS via tracker.ingest().
 * - **Capacitor native**: returns capGeoTracker (owns watchPosition).
 *   The caller can still call ingest() but the tracker also receives
 *   positions from the native plugin.
 */
export async function createTracker(
  config: WebGeoTrackerConfig,
): Promise<WebGeoTrackerInstance> {
  if (isCapacitorNative()) {
    try {
      const { createCapGeoTracker } = await import('./capGeoTracker');
      return createCapGeoTracker(config);
    } catch {
      console.warn('[TrackerFactory] capGeoTracker import failed — falling back to web');
    }
  }

  return createWebGeoTracker(config);
}

/**
 * Synchronous version: always returns webGeoTracker.
 * Use this when you need the tracker immediately (e.g. in a useEffect)
 * and know you're running in a browser context.
 */
export function createTrackerSync(
  config: WebGeoTrackerConfig,
): WebGeoTrackerInstance {
  // In Capacitor, use createTracker() (async) instead
  return createWebGeoTracker(config);
}
