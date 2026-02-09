/**
 * Offline Map Service
 *
 * Provides offline map tile caching and management for Leaflet maps.
 * Supports:
 * - Pre-caching map tiles for specific areas
 * - Automatic tile caching during browsing
 * - Storage management with automatic cleanup
 * - GPS tracking in offline mode
 */

import {
  cacheMapTile,
  getCachedMapTile,
  clearOldMapTiles,
  getMapTilesCount,
  addGpsTrackPoint,
  getUnsyncedTrackPoints,
  markTrackPointsSynced
} from './offline-db';
import { isNetworkUsable } from './networkManager';

// ========== TYPES ==========

export interface TileBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface CacheProgress {
  total: number;
  cached: number;
  failed: number;
  percentage: number;
}

export interface MapCacheStats {
  tileCount: number;
  estimatedSize: number;
  oldestTile?: number;
}

export interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

type ProgressCallback = (progress: CacheProgress) => void;

// ========== CONSTANTS ==========

const TILE_URL_TEMPLATE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SUBDOMAINS = ['a', 'b', 'c'];
const MAX_CACHE_SIZE_MB = 100; // 100MB max cache
const TILE_SIZE_ESTIMATE = 15000; // ~15KB per tile
const DEFAULT_ZOOM_LEVELS = [12, 13, 14, 15]; // Zoom levels to cache
const CONGO_BOUNDS: TileBounds = {
  north: 3.7,
  south: -5.0,
  east: 18.6,
  west: 11.2
};

// ========== TILE MATH UTILITIES ==========

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

function getTileUrl(x: number, y: number, z: number, subdomain: string = 'a'): string {
  return TILE_URL_TEMPLATE.replace('{s}', subdomain)
    .replace('{z}', z.toString())
    .replace('{x}', x.toString())
    .replace('{y}', y.toString());
}

function getTilesForBounds(bounds: TileBounds, zoom: number): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];

  const minX = lon2tile(bounds.west, zoom);
  const maxX = lon2tile(bounds.east, zoom);
  const minY = lat2tile(bounds.north, zoom);
  const maxY = lat2tile(bounds.south, zoom);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

// ========== OFFLINE MAP SERVICE CLASS ==========

class OfflineMapService {
  private isCaching: boolean = false;
  private abortController: AbortController | null = null;
  private watchId: number | null = null;
  private gpsBuffer: GpsPosition[] = [];
  private gpsFlushInterval: number | null = null;

  constructor() {
    this.setupGpsFlush();
  }

  // ========== TILE CACHING ==========

  /**
   * Cache a single tile
   */
  public async cacheTile(x: number, y: number, z: number): Promise<boolean> {
    const subdomain = SUBDOMAINS[Math.abs(x + y) % SUBDOMAINS.length];
    const url = getTileUrl(x, y, z, subdomain);

    try {
      // Check if already cached
      const cached = await getCachedMapTile(url);
      if (cached) return true;

      const response = await fetch(url);
      if (!response.ok) return false;

      const blob = await response.blob();
      await cacheMapTile(url, blob, z, x, y);
      return true;
    } catch (error) {
      console.warn(`[OfflineMap] Failed to cache tile ${z}/${x}/${y}:`, error);
      return false;
    }
  }

  /**
   * Cache tiles for a specific area
   */
  public async cacheArea(
    bounds: TileBounds,
    zoomLevels: number[] = DEFAULT_ZOOM_LEVELS,
    onProgress?: ProgressCallback
  ): Promise<CacheProgress> {
    if (this.isCaching) {
      throw new Error('Caching already in progress');
    }

    this.isCaching = true;
    this.abortController = new AbortController();

    const progress: CacheProgress = {
      total: 0,
      cached: 0,
      failed: 0,
      percentage: 0
    };

    try {
      // Calculate all tiles to cache
      const allTiles: Array<{ x: number; y: number; z: number }> = [];
      for (const zoom of zoomLevels) {
        const tiles = getTilesForBounds(bounds, zoom);
        allTiles.push(...tiles);
      }

      progress.total = allTiles.length;
      console.log(`[OfflineMap] Starting cache of ${progress.total} tiles`);

      // Check storage limits
      const currentStats = await this.getCacheStats();
      const estimatedNewSize = (progress.total * TILE_SIZE_ESTIMATE) / 1024 / 1024;
      const totalEstimated = currentStats.estimatedSize / 1024 / 1024 + estimatedNewSize;

      if (totalEstimated > MAX_CACHE_SIZE_MB) {
        // Clear old tiles to make room
        await clearOldMapTiles(7 * 24 * 60 * 60 * 1000); // Clear tiles older than 7 days
      }

      // Cache tiles in batches
      const batchSize = 10;
      for (let i = 0; i < allTiles.length; i += batchSize) {
        if (this.abortController.signal.aborted) {
          console.log('[OfflineMap] Caching aborted');
          break;
        }

        const batch = allTiles.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map((tile) => this.cacheTile(tile.x, tile.y, tile.z)));

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            progress.cached++;
          } else {
            progress.failed++;
          }
        });

        progress.percentage = Math.round((progress.cached + progress.failed) / progress.total * 100);
        onProgress?.(progress);

        // Small delay to avoid overwhelming the network
        if (i + batchSize < allTiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`[OfflineMap] Caching complete: ${progress.cached} cached, ${progress.failed} failed`);
      return progress;
    } finally {
      this.isCaching = false;
      this.abortController = null;
    }
  }

  /**
   * Cache tiles around a specific point
   */
  public async cacheAroundPoint(
    lat: number,
    lon: number,
    radiusKm: number = 5,
    zoomLevels: number[] = DEFAULT_ZOOM_LEVELS,
    onProgress?: ProgressCallback
  ): Promise<CacheProgress> {
    // Convert radius to degrees (rough approximation)
    const latDelta = radiusKm / 111; // 1 degree latitude ≈ 111 km
    const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    const bounds: TileBounds = {
      north: lat + latDelta,
      south: lat - latDelta,
      east: lon + lonDelta,
      west: lon - lonDelta
    };

    return this.cacheArea(bounds, zoomLevels, onProgress);
  }

  /**
   * Cache tiles for all Congo agencies
   */
  public async cacheCongoAgencies(
    agencyCoords: Array<{ lat: number; lon: number; name: string }>,
    onProgress?: ProgressCallback
  ): Promise<CacheProgress> {
    const totalProgress: CacheProgress = {
      total: 0,
      cached: 0,
      failed: 0,
      percentage: 0
    };

    for (const agency of agencyCoords) {
      console.log(`[OfflineMap] Caching area around ${agency.name}`);
      const progress = await this.cacheAroundPoint(
        agency.lat,
        agency.lon,
        3, // 3km radius
        [13, 14, 15, 16],
        (p) => {
          totalProgress.total = p.total + (totalProgress.total - totalProgress.cached - totalProgress.failed);
          totalProgress.cached += p.cached - (totalProgress.cached - p.cached);
          totalProgress.failed += p.failed - (totalProgress.failed - p.failed);
          totalProgress.percentage = Math.round(
            ((totalProgress.cached + totalProgress.failed) / totalProgress.total) * 100
          );
          onProgress?.(totalProgress);
        }
      );
    }

    return totalProgress;
  }

  /**
   * Stop ongoing caching operation
   */
  public cancelCaching(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  // ========== TILE RETRIEVAL ==========

  /**
   * Get a tile, preferring cached version when offline
   */
  public async getTile(x: number, y: number, z: number): Promise<Blob | null> {
    const subdomain = SUBDOMAINS[Math.abs(x + y) % SUBDOMAINS.length];
    const url = getTileUrl(x, y, z, subdomain);

    // Check cache first when offline
    if (!isNetworkUsable()) {
      return getCachedMapTile(url);
    }

    // Online: try network first
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        // Cache for later
        cacheMapTile(url, blob, z, x, y).catch(() => {});
        return blob;
      }
    } catch {
      // Network failed, try cache
    }

    return getCachedMapTile(url);
  }

  /**
   * Create a custom tile layer for Leaflet that uses cached tiles
   */
  public createOfflineTileLayer(L: any): any {
    const self = this;

    return L.TileLayer.extend({
      getTileUrl: function (coords: { x: number; y: number; z: number }) {
        const subdomain = SUBDOMAINS[Math.abs(coords.x + coords.y) % SUBDOMAINS.length];
        return getTileUrl(coords.x, coords.y, coords.z, subdomain);
      },

      createTile: function (coords: { x: number; y: number; z: number }, done: (err: any, tile: HTMLElement) => void) {
        const tile = document.createElement('img');
        tile.crossOrigin = '';

        const subdomain = SUBDOMAINS[Math.abs(coords.x + coords.y) % SUBDOMAINS.length];
        const url = getTileUrl(coords.x, coords.y, coords.z, subdomain);

        // Check cache first
        getCachedMapTile(url).then((cachedBlob) => {
          if (cachedBlob) {
            tile.src = URL.createObjectURL(cachedBlob);
            done(null, tile);
          } else if (isNetworkUsable()) {
            // Try network
            tile.onload = () => {
              done(null, tile);
              // Cache the tile
              fetch(url)
                .then((r) => r.blob())
                .then((blob) => cacheMapTile(url, blob, coords.z, coords.x, coords.y))
                .catch(() => {});
            };
            tile.onerror = () => done(new Error('Tile load failed'), tile);
            tile.src = url;
          } else {
            // Offline and not cached
            tile.src = '/icons/offline-tile.png'; // Placeholder
            done(null, tile);
          }
        });

        return tile;
      }
    });
  }

  // ========== CACHE MANAGEMENT ==========

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<MapCacheStats> {
    const stats = await getMapTilesCount();
    return {
      tileCount: stats.count,
      estimatedSize: stats.sizeEstimate
    };
  }

  /**
   * Clear all cached tiles
   */
  public async clearCache(): Promise<void> {
    await clearOldMapTiles(0); // Clear all
  }

  /**
   * Clear old cached tiles
   */
  public async cleanupCache(maxAgeDays: number = 30): Promise<number> {
    return clearOldMapTiles(maxAgeDays * 24 * 60 * 60 * 1000);
  }

  // ========== GPS TRACKING ==========

  private setupGpsFlush(): void {
    // Flush GPS buffer every 30 seconds
    this.gpsFlushInterval = window.setInterval(() => {
      this.flushGpsBuffer();
    }, 30000);
  }

  private async flushGpsBuffer(): Promise<void> {
    if (this.gpsBuffer.length === 0) return;

    const pointsToFlush = [...this.gpsBuffer];
    this.gpsBuffer = [];

    for (const point of pointsToFlush) {
      await addGpsTrackPoint({
        agentId: localStorage.getItem('userId') || 'unknown',
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        timestamp: point.timestamp
      });
    }
  }

  /**
   * Start tracking GPS position
   */
  public startGpsTracking(activityType: 'collection' | 'visit' | 'delivery' | 'other' = 'other'): boolean {
    if (!('geolocation' in navigator)) {
      console.warn('[OfflineMap] Geolocation not supported');
      return false;
    }

    if (this.watchId !== null) {
      this.stopGpsTracking();
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.gpsBuffer.push({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        });

        // Flush if buffer is large
        if (this.gpsBuffer.length >= 10) {
          this.flushGpsBuffer();
        }
      },
      (error) => {
        console.warn('[OfflineMap] GPS error:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 60000
      }
    );

    console.log('[OfflineMap] GPS tracking started');
    return true;
  }

  /**
   * Stop tracking GPS position
   */
  public stopGpsTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.flushGpsBuffer();
      console.log('[OfflineMap] GPS tracking stopped');
    }
  }

  /**
   * Get current position (one-time)
   */
  public getCurrentPosition(): Promise<GpsPosition> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        }
      );
    });
  }

  /**
   * Sync GPS track points to server
   */
  public async syncGpsTrackPoints(): Promise<number> {
    const agentId = localStorage.getItem('userId');
    if (!agentId) return 0;

    const unsyncedPoints = await getUnsyncedTrackPoints(agentId);
    if (unsyncedPoints.length === 0) return 0;

    if (!isNetworkUsable()) {
      console.log('[OfflineMap] Offline, GPS sync deferred');
      return 0;
    }

    try {
      const response = await fetch('/api/agents/gps-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ points: unsyncedPoints })
      });

      if (response.ok) {
        const ids = unsyncedPoints.map((p) => p.id!);
        await markTrackPointsSynced(ids);
        console.log(`[OfflineMap] Synced ${ids.length} GPS points`);
        return ids.length;
      }
    } catch (error) {
      console.error('[OfflineMap] GPS sync error:', error);
    }

    return 0;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopGpsTracking();
    if (this.gpsFlushInterval) {
      clearInterval(this.gpsFlushInterval);
    }
  }
}

export const offlineMapService = new OfflineMapService();

export default offlineMapService;
