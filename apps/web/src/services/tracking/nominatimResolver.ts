/**
 * Nominatim Reverse Geocoding Service — standalone (not a hook).
 *
 * Features:
 * - Throttle: max 1 request per 2 seconds
 * - Distance threshold: only re-resolves if moved > 50m
 * - Cache: IndexedDB (coordKey rounded to 4 decimals, TTL 24h)
 * - Configurable URL via VITE_NOMINATIM_URL env var
 * - Fallback mode: auto-disables after consecutive errors (quota/network).
 *   When disabled, resolve() returns null immediately. The service re-enables
 *   itself after a cooldown period. Unresolved addresses can be batch-resolved
 *   server-side later.
 */

import { getCachedGeocode, setCachedGeocode } from '@/lib/offline-db';
import { haversineMeters } from './geoFilter';
import type { GeoAddress } from './types';

const NOMINATIM_URL =
  (import.meta as any).env?.VITE_NOMINATIM_URL ||
  'https://nominatim.openstreetmap.org';

const THROTTLE_MS = 2_000;
const DISTANCE_THRESHOLD_M = 50;
const COORD_DECIMALS = 4;

// Fallback: auto-disable after N consecutive errors, re-enable after cooldown
const MAX_CONSECUTIVE_ERRORS = 3;
const COOLDOWN_MS = 5 * 60_000; // 5 minutes

interface NominatimResponse {
  display_name: string;
  address: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    county?: string;
    postcode?: string;
    country?: string;
    [key: string]: string | undefined;
  };
  error?: string;
}

function roundCoord(n: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(n * factor) / factor;
}

function coordKey(lat: number, lng: number): string {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

function parseAddress(data: NominatimResponse, lat: number, lng: number): GeoAddress {
  const addr = data.address;
  const city = addr.city || addr.town || addr.village || '';
  const suburb = addr.suburb || addr.neighbourhood || '';
  const parts = [addr.road, suburb, city, addr.state || addr.county, addr.postcode, addr.country].filter(Boolean);

  return {
    full: parts.join(', '),
    road: addr.road,
    suburb: suburb || undefined,
    city: city || undefined,
    state: addr.state || addr.county,
    postcode: addr.postcode,
    country: addr.country,
    lat,
    lng,
    resolvedAt: Date.now(),
  };
}

export interface NominatimResolverInstance {
  /** Resolve coordinates to an address. Throttled + cached. Returns null if disabled. */
  resolve(lat: number, lng: number): Promise<GeoAddress | null>;
  /** Force resolve ignoring distance threshold (e.g. for debug). Returns null if disabled. */
  forceResolve(lat: number, lng: number): Promise<GeoAddress | null>;
  /** Last resolved address. */
  readonly lastAddress: GeoAddress | null;
  /** True when resolver is auto-disabled due to repeated errors. */
  readonly disabled: boolean;
  /** Number of consecutive errors (resets on success or cooldown). */
  readonly errorCount: number;
}

export function createNominatimResolver(): NominatimResolverInstance {
  let lastResolveTime = 0;
  let lastResolvedPos: { lat: number; lng: number } | null = null;
  let lastAddress: GeoAddress | null = null;
  let pendingResolve: Promise<GeoAddress | null> | null = null;

  // Fallback state
  let consecutiveErrors = 0;
  let disabledUntil = 0; // timestamp — 0 means enabled

  function isDisabled(): boolean {
    if (disabledUntil === 0) return false;
    if (Date.now() >= disabledUntil) {
      // Cooldown expired — re-enable
      disabledUntil = 0;
      consecutiveErrors = 0;
      return false;
    }
    return true;
  }

  function recordSuccess(): void {
    consecutiveErrors = 0;
    disabledUntil = 0;
  }

  function recordError(): void {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      disabledUntil = Date.now() + COOLDOWN_MS;
      console.warn(
        `[NominatimResolver] ${consecutiveErrors} consecutive errors — disabled for ${COOLDOWN_MS / 60_000}min`,
      );
    }
  }

  async function doResolve(lat: number, lng: number): Promise<GeoAddress | null> {
    const key = coordKey(lat, lng);

    // 1. Check IndexedDB cache (always, even when disabled)
    try {
      const cached = await getCachedGeocode(key);
      if (cached) {
        const addr = JSON.parse(cached.data) as GeoAddress;
        lastAddress = addr;
        lastResolvedPos = { lat, lng };
        return addr;
      }
    } catch {
      // Cache read failed, continue to network
    }

    // 2. If disabled, return null (address = "non resolue")
    if (isDisabled()) return null;

    // 3. Throttle
    const now = Date.now();
    const wait = THROTTLE_MS - (now - lastResolveTime);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    lastResolveTime = Date.now();

    // 4. Fetch from Nominatim
    try {
      const url = `${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        credentials: 'omit',
        headers: { 'Accept-Language': 'fr-FR' },
      });

      if (!res.ok) {
        recordError();
        return null;
      }

      const data: NominatimResponse = await res.json();
      if (data.error) {
        recordError();
        return null;
      }

      const address = parseAddress(data, lat, lng);
      lastAddress = address;
      lastResolvedPos = { lat, lng };
      recordSuccess();

      // 5. Persist to cache
      try {
        await setCachedGeocode({
          coordKey: key,
          data: JSON.stringify(address),
          resolvedAt: Date.now(),
        });
      } catch {
        // Cache write failed, non-critical
      }

      return address;
    } catch {
      // Network error (offline) — count as error
      recordError();
      return null;
    }
  }

  async function resolve(lat: number, lng: number): Promise<GeoAddress | null> {
    // Distance threshold: skip if not moved enough
    if (lastResolvedPos) {
      const dist = haversineMeters(lastResolvedPos.lat, lastResolvedPos.lng, lat, lng);
      if (dist < DISTANCE_THRESHOLD_M) {
        return lastAddress;
      }
    }

    // Avoid concurrent requests
    if (pendingResolve) {
      return pendingResolve;
    }

    pendingResolve = doResolve(lat, lng).finally(() => {
      pendingResolve = null;
    });

    return pendingResolve;
  }

  async function forceResolve(lat: number, lng: number): Promise<GeoAddress | null> {
    if (pendingResolve) {
      return pendingResolve;
    }
    pendingResolve = doResolve(lat, lng).finally(() => {
      pendingResolve = null;
    });
    return pendingResolve;
  }

  return {
    resolve,
    forceResolve,
    get lastAddress() {
      return lastAddress;
    },
    get disabled() {
      return isDisabled();
    },
    get errorCount() {
      return consecutiveErrors;
    },
  };
}
