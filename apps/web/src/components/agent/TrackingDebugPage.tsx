import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Square,
  MapPin,
  Navigation,
  Clock,
  Gauge,
  Wifi,
  WifiOff,
  Activity,
  BarChart3,
  Crosshair,
  Zap,
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '../ui';
import { authService } from '@/lib/auth';
import { getTrackPointsByDay } from '@/lib/offline-db';
import {
  createWebGeoTracker,
  type WebGeoTrackerInstance,
} from '@/services/tracking/webGeoTracker';
import type { GeoPoint, GeoAddress, TrackerStats } from '@/services/tracking/types';

// ─── Leaflet icon fix ────────────────────────────────────────────

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/** Read the --accent CSS variable at runtime so the marker respects the theme. */
function getAccentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3b82f6';
}

function createCurrentIcon() {
  const accent = getAccentColor();
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background:${accent};width:24px;height:24px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);animation:pulse 2s infinite"><span style="color:white;font-size:10px;font-weight:900">●</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const OSM_TILE_URL =
  import.meta.env?.VITE_OSM_TILE_URL ||
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// ─── Map auto-pan ────────────────────────────────────────────────

function FlyToPoint({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [lat, lng, map]);
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

// ─── GPS Simulator ──────────────────────────────────────────────

/** Simulates GPS movement: random walk around a center point at ~walking speed */
function useGpsSimulator(
  trackerRef: React.MutableRefObject<WebGeoTrackerInstance | null>,
  isRunning: boolean,
) {
  const [simulating, setSimulating] = useState(false);
  const [simAccuracy, setSimAccuracy] = useState(10); // meters
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const posRef = useRef({ lat: -4.2634, lng: 15.2429 }); // Brazzaville center

  const startSim = useCallback(() => {
    if (!isRunning || !trackerRef.current || simRef.current) return;
    setSimulating(true);

    simRef.current = setInterval(() => {
      if (!trackerRef.current) return;

      // Random walk: ~1.5 m/s walking speed, 1s interval → ~1.5m per tick
      const bearing = Math.random() * 2 * Math.PI;
      const distDeg = (1.5 / 111_320); // ~1.5m in degrees
      posRef.current = {
        lat: posRef.current.lat + Math.cos(bearing) * distDeg,
        lng: posRef.current.lng + Math.sin(bearing) * (distDeg / Math.cos(posRef.current.lat * Math.PI / 180)),
      };

      // Add some accuracy noise
      const noise = (Math.random() - 0.5) * 0.2; // ±10% variation
      const accuracy = simAccuracy * (1 + noise);

      trackerRef.current.ingest(
        posRef.current.lat,
        posRef.current.lng,
        accuracy,
        1.2 + Math.random() * 0.6, // ~1.2-1.8 m/s walking
        bearing * (180 / Math.PI),
        280 + Math.random() * 10, // ~280-290m altitude
        Math.floor(70 + Math.random() * 30), // 70-100% battery
      );
    }, 1_000);
  }, [isRunning, simAccuracy]);

  const stopSim = useCallback(() => {
    if (simRef.current) {
      clearInterval(simRef.current);
      simRef.current = null;
    }
    setSimulating(false);
  }, []);

  // Cleanup on unmount or when tracking stops
  useEffect(() => {
    if (!isRunning) stopSim();
    return () => stopSim();
  }, [isRunning, stopSim]);

  return { simulating, simAccuracy, setSimAccuracy, startSim, stopSim };
}

// ─── Component ───────────────────────────────────────────────────

export default function TrackingDebugPage() {
  const user = authService.getCurrentUser();
  const agentId = String(user?.id || '');

  const currentIcon = useMemo(() => createCurrentIcon(), []);
  const accentColor = useMemo(() => getAccentColor(), []);
  const trackerRef = useRef<WebGeoTrackerInstance | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<TrackerStats>({
    pointCount: 0,
    totalDistanceM: 0,
    durationMs: 0,
    rejectedCount: 0,
    lastPoint: null,
    lastAddress: null,
    isTracking: false,
    sessionId: null,
  });

  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // GPS simulator
  const { simulating, simAccuracy, setSimAccuracy, startSim, stopSim } =
    useGpsSimulator(trackerRef, isRunning);

  // Load today's points from IndexedDB on mount
  useEffect(() => {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (agentId) {
      getTrackPointsByDay(agentId, dayKey).then((pts) => {
        setPoints(
          pts.map((p) => ({
            ...p,
            clientPointId: p.clientPointId || crypto.randomUUID(),
            speed: p.speed ?? null,
            heading: p.heading ?? null,
            altitude: p.altitude ?? null,
            agentId: p.agentId,
            sessionId: p.sessionId || '',
            dayKey: p.dayKey || dayKey,
            synced: p.synced,
          })),
        );
      });
    }
  }, [agentId]);

  const handleStart = useCallback(() => {
    if (isRunning || !agentId) return;

    const tracker = createWebGeoTracker({
      agentId,
      agencyId: user?.agenceId,
    });

    tracker.onPoint((pt) => {
      setPoints((prev) => [...prev, pt]);
    });

    tracker.onAddress((addr) => {
      setAddress(addr);
    });

    tracker.start();
    trackerRef.current = tracker;
    setIsRunning(true);

    // Refresh stats every 2s
    refreshInterval.current = setInterval(() => {
      if (trackerRef.current) {
        setStats(trackerRef.current.getStats());
      }
    }, 2_000);
  }, [isRunning, agentId, user]);

  const handleStop = useCallback(async () => {
    if (!isRunning) return;

    if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
      refreshInterval.current = null;
    }

    if (trackerRef.current) {
      await trackerRef.current.stop();
      setStats(trackerRef.current.getStats());
      trackerRef.current = null;
    }

    setIsRunning(false);
  }, [isRunning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
      trackerRef.current?.stop();
    };
  }, []);

  const routePositions = useMemo(
    () =>
      points
        .filter((p) => p.latitude && p.longitude)
        .map((p) => [p.latitude, p.longitude] as [number, number]),
    [points],
  );

  const lastPos = stats.lastPoint || (points.length > 0 ? points[points.length - 1] : null);
  const displayAddress = address || stats.lastAddress;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-content-primary">
            Tracking Debug
          </h2>
          <p className="text-sm text-content-muted">
            Test du systeme de geolocalisation
          </p>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 rounded-lg bg-btn-success px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              <Play className="h-4 w-4" />
              Demarrer
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 rounded-lg bg-btn-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              <Square className="h-4 w-4" />
              Arreter
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-card-border bg-card p-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isRunning
              ? 'bg-status-success-bg text-status-success'
              : 'bg-status-danger-bg text-status-danger'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${isRunning ? 'bg-status-success animate-pulse' : 'bg-status-danger'}`}
          />
          {isRunning ? 'Actif' : 'Inactif'}
        </span>

        {navigator.onLine ? (
          <span className="flex items-center gap-1 text-xs text-status-success">
            <Wifi className="h-3.5 w-3.5" /> En ligne
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-status-warning">
            <WifiOff className="h-3.5 w-3.5" /> Hors ligne
          </span>
        )}

        {stats.sessionId && (
          <span className="text-xs text-content-muted">
            Session: {stats.sessionId.slice(-8)}
          </span>
        )}
      </div>

      {/* GPS Simulator */}
      {isRunning && (
        <Card className="border border-card-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-content-primary">
              <Zap className="h-4 w-4" />
              Simulateur GPS
            </div>
            {!simulating ? (
              <button
                onClick={startSim}
                className="flex items-center gap-1.5 rounded-md bg-status-warning-bg px-3 py-1.5 text-xs font-medium text-status-warning transition-colors hover:opacity-80"
              >
                <Play className="h-3 w-3" />
                Simuler
              </button>
            ) : (
              <button
                onClick={stopSim}
                className="flex items-center gap-1.5 rounded-md bg-status-danger-bg px-3 py-1.5 text-xs font-medium text-status-danger transition-colors hover:opacity-80"
              >
                <Square className="h-3 w-3" />
                Stop sim
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-content-muted whitespace-nowrap">
              Precision: {simAccuracy}m
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={simAccuracy}
              onChange={(e) => setSimAccuracy(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-subtle accent-accent"
            />
          </div>
          <p className="mt-1.5 text-xs text-content-muted">
            Marche aleatoire ~1.5 m/s autour de Brazzaville.
            {simAccuracy > 30 && (
              <span className="text-status-warning"> Precision &gt;30m : points seront rejetes par le filtre.</span>
            )}
          </p>
        </Card>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border border-card-border bg-card p-3">
          <div className="flex items-center gap-2 text-content-muted">
            <MapPin className="h-4 w-4" />
            <span className="text-xs">Points</span>
          </div>
          <p className="mt-1 text-xl font-bold text-content-primary">
            {stats.pointCount || points.length}
          </p>
          {stats.rejectedCount > 0 && (
            <p className="text-xs text-status-warning">
              {stats.rejectedCount} rejetes
            </p>
          )}
        </Card>

        <Card className="border border-card-border bg-card p-3">
          <div className="flex items-center gap-2 text-content-muted">
            <Navigation className="h-4 w-4" />
            <span className="text-xs">Distance</span>
          </div>
          <p className="mt-1 text-xl font-bold text-content-primary">
            {formatDistance(stats.totalDistanceM)}
          </p>
        </Card>

        <Card className="border border-card-border bg-card p-3">
          <div className="flex items-center gap-2 text-content-muted">
            <Clock className="h-4 w-4" />
            <span className="text-xs">Duree</span>
          </div>
          <p className="mt-1 text-xl font-bold text-content-primary">
            {formatDuration(stats.durationMs)}
          </p>
        </Card>

        <Card className="border border-card-border bg-card p-3">
          <div className="flex items-center gap-2 text-content-muted">
            <Crosshair className="h-4 w-4" />
            <span className="text-xs">Precision</span>
          </div>
          <p className="mt-1 text-xl font-bold text-content-primary">
            {lastPos ? `${Math.round(lastPos.accuracy)} m` : '--'}
          </p>
        </Card>
      </div>

      {/* Last point details */}
      {lastPos && (
        <Card className="border border-card-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-content-primary">
            <Activity className="h-4 w-4" />
            Dernier point
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <span className="text-content-muted">Lat:</span>{' '}
              <span className="font-mono text-content-secondary">
                {lastPos.latitude.toFixed(6)}
              </span>
            </div>
            <div>
              <span className="text-content-muted">Lng:</span>{' '}
              <span className="font-mono text-content-secondary">
                {lastPos.longitude.toFixed(6)}
              </span>
            </div>
            <div>
              <span className="text-content-muted">Vitesse:</span>{' '}
              <span className="font-mono text-content-secondary">
                {lastPos.speed != null
                  ? `${(lastPos.speed * 3.6).toFixed(1)} km/h`
                  : '--'}
              </span>
            </div>
            <div>
              <span className="text-content-muted">Heure:</span>{' '}
              <span className="font-mono text-content-secondary">
                {new Date(lastPos.timestamp).toLocaleTimeString('fr-FR')}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Address */}
      {displayAddress && (
        <Card className="border border-card-border bg-card p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-content-primary">
            <MapPin className="h-4 w-4" />
            Adresse actuelle
          </div>
          <p className="text-sm text-content-secondary">{displayAddress.full}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-content-muted">
            {displayAddress.road && <span>Rue: {displayAddress.road}</span>}
            {displayAddress.suburb && <span>Quartier: {displayAddress.suburb}</span>}
            {displayAddress.city && <span>Ville: {displayAddress.city}</span>}
            {displayAddress.country && <span>Pays: {displayAddress.country}</span>}
          </div>
        </Card>
      )}

      {/* Map */}
      <Card className="overflow-hidden border border-card-border bg-card">
        <div className="p-2 text-xs font-medium text-content-muted">
          <BarChart3 className="mr-1 inline h-3.5 w-3.5" />
          Trace du jour ({points.length} points)
        </div>
        <div className="h-[350px] w-full sm:h-[450px]">
          <MapContainer
            center={
              lastPos
                ? [lastPos.latitude, lastPos.longitude]
                : [-4.2634, 15.2429] // Brazzaville default
            }
            zoom={14}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer
              url={OSM_TILE_URL}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {lastPos && (
              <FlyToPoint lat={lastPos.latitude} lng={lastPos.longitude} />
            )}

            {routePositions.length >= 2 && (
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: accentColor,
                  weight: 3,
                  opacity: 0.8,
                }}
              />
            )}

            {lastPos && (
              <Marker
                position={[lastPos.latitude, lastPos.longitude]}
                icon={currentIcon}
              >
                <Popup>
                  <div className="text-xs">
                    <strong>Position actuelle</strong>
                    <br />
                    {lastPos.latitude.toFixed(6)}, {lastPos.longitude.toFixed(6)}
                    <br />
                    Precision: {Math.round(lastPos.accuracy)} m
                    {displayAddress && (
                      <>
                        <br />
                        {displayAddress.full}
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </Card>

      {/* Technical info */}
      <Card className="border border-card-border bg-card p-3">
        <div className="mb-2 text-xs font-medium text-content-muted">
          Informations techniques
        </div>
        <div className="space-y-1 text-xs text-content-secondary">
          <div>
            Agent ID: <span className="font-mono">{agentId || '--'}</span>
          </div>
          <div>
            Mode:{' '}
            <span className="font-mono">
              Web (navigator.geolocation)
            </span>
          </div>
          <div>
            Nominatim:{' '}
            <span className="font-mono">
              {import.meta.env?.VITE_NOMINATIM_URL ||
                'https://nominatim.openstreetmap.org'}
            </span>
          </div>
          <div>
            IndexedDB: COFINOfflineDB v4 (gpsTrackPoints + geocodeCache + trackingSessions)
          </div>
          <div className="mt-2 rounded border border-edge-subtle bg-surface-subtle p-2 text-content-muted">
            <strong>Limites navigateur:</strong> En arriere-plan (onglet inactif),
            le navigateur reduit la frequence GPS. Pour un meilleur tracking,
            installez l'application via PWA ("Ajouter a l'ecran d'accueil").
          </div>
        </div>
      </Card>
    </div>
  );
}
