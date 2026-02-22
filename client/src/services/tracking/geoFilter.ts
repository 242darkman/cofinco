/**
 * Noise-filtering engine for GPS tracking.
 *
 * Applies accuracy gate, deltaT minimum, computed-speed priority,
 * speed sanity, accuracy-trend detection, and immobility detection
 * so only meaningful points are recorded to IndexedDB.
 */

import type { FilterConfig, FilterVerdict } from './types';
import { DEFAULT_FILTER_CONFIG } from './types';

// ─── Haversine ───────────────────────────────────────────────────

/** Haversine distance in metres between two lat/lng pairs. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Day key helper ──────────────────────────────────────────────

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Constants ───────────────────────────────────────────────────

/** Ignore points arriving less than 500ms apart (device noise burst / redundant). */
const MIN_DELTA_T_MS = 500;
/** Accuracy that degraded by this factor vs. previous is suspicious. */
const ACCURACY_DEGRADATION_FACTOR = 10;

// ─── Stateful filter factory ─────────────────────────────────────

export interface GeoFilterState {
  /** Evaluate a raw position. Returns verdict (valid or rejected + reason). */
  evaluate(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    timestamp: number,
  ): FilterVerdict;

  /** Last accepted point (if any). */
  lastAccepted: { lat: number; lng: number; time: number; accuracy: number } | null;
  /** Cumulative count of rejected points. */
  rejectedCount: number;
}

export function createGeoFilter(
  config: Partial<FilterConfig> = {},
): GeoFilterState {
  const cfg: FilterConfig = { ...DEFAULT_FILTER_CONFIG, ...config };
  const effectiveMaxSpeed = cfg.vehicleMode ? 70 : cfg.maxSpeedMs;

  let lastAccepted: { lat: number; lng: number; time: number; accuracy: number } | null = null;
  let rejectedCount = 0;

  function evaluate(
    latitude: number,
    longitude: number,
    accuracy: number,
    speed: number | null | undefined,
    timestamp: number,
  ): FilterVerdict {
    // 1. Accuracy gate
    if (accuracy > cfg.maxAccuracyM) {
      rejectedCount++;
      return { valid: false, reason: 'accuracy' };
    }

    if (lastAccepted) {
      const dtMs = timestamp - lastAccepted.time;

      // 2. Delta-T minimum: ignore bursts < 100ms apart
      if (dtMs < MIN_DELTA_T_MS) {
        rejectedCount++;
        return { valid: false, reason: 'duplicate' };
      }

      // 3. Accuracy trend: if accuracy suddenly degrades by 10x, likely a
      //    cell-tower fallback — reject as unreliable.
      if (
        lastAccepted.accuracy > 0 &&
        accuracy > lastAccepted.accuracy * ACCURACY_DEGRADATION_FACTOR
      ) {
        rejectedCount++;
        return { valid: false, reason: 'accuracy' };
      }

      const dist = haversineMeters(
        lastAccepted.lat,
        lastAccepted.lng,
        latitude,
        longitude,
      );
      const dtSec = dtMs / 1000;

      // 4. Computed speed takes priority over device speed.
      //    coords.speed is often null or unreliable depending on device.
      const computedSpeed = dtSec > 0 ? dist / dtSec : 0;

      // 5. Speed sanity check (based on computed speed, not device speed)
      if (computedSpeed > effectiveMaxSpeed) {
        rejectedCount++;
        return { valid: false, reason: 'speed' };
      }

      // 6. Immobility detection: small distance + low speed
      if (dist < cfg.minDistanceM && computedSpeed < cfg.minSpeedMs) {
        rejectedCount++;
        return { valid: false, reason: 'immobile' };
      }
    }

    // Accept
    lastAccepted = { lat: latitude, lng: longitude, time: timestamp, accuracy };
    return { valid: true };
  }

  return {
    evaluate,
    get lastAccepted() {
      return lastAccepted;
    },
    get rejectedCount() {
      return rejectedCount;
    },
  };
}
