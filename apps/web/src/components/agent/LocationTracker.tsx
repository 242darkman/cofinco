import { useEffect, useRef, useCallback, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { authService } from '@/lib/auth';
import { SystemRole } from '@shared/types/roles';
import { createWebGeoTracker, type WebGeoTrackerInstance } from '@/services/tracking/webGeoTracker';
import { isCapacitorNative } from '@/services/tracking/trackerFactory';
import { haversineMeters } from '@/services/tracking/geoFilter';

/**
 * Headless (almost) component — auto-tracks GPS for AGENT_TERRAIN.
 *
 * The tracking is MANDATORY and starts AUTOMATICALLY at login.
 * The agent has NO choice: no opt-in, no opt-out, no toggle.
 *
 * If the browser GPS permission is denied, the component:
 *   1. Shows a persistent banner explaining GPS is required
 *   2. Retries every 30s (some browsers re-prompt, others need manual settings)
 *
 * Architecture:
 *   watchPosition → WebSocket send (opportunistic) + tracker.ingest()
 *   tracker.ingest() → filter → record (IndexedDB) → resolve → sync
 *
 * Mounted globally in App.tsx.
 */

type GpsStatus = 'off' | 'starting' | 'active' | 'denied' | 'unavailable';

const GPS_RETRY_INTERVAL_MS = 30_000; // retry every 30s if denied

export default function LocationTracker() {
  const { sendMessage, isConnected } = useWebSocket();
  const user = authService.getCurrentUser();
  const isAgent = user?.role === SystemRole.AGENT_TERRAIN;

  const lastWsSentRef = useRef({ lat: 0, lng: 0, time: 0 });
  const batteryRef = useRef({ level: 1, charging: false });
  const trackerRef = useRef<WebGeoTrackerInstance | null>(null);
  const wsRef = useRef({ sendMessage, isConnected });
  const watchIdRef = useRef<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('off');

  // Keep WS refs current without re-triggering watchPosition
  useEffect(() => {
    wsRef.current = { sendMessage, isConnected };
  }, [sendMessage, isConnected]);

  // ─── Battery monitoring ─────────────────────────────────────
  useEffect(() => {
    if (!isAgent) return;
    let battery: { level: number; charging: boolean; addEventListener: EventTarget['addEventListener']; removeEventListener: EventTarget['removeEventListener'] } | null = null;

    const updateBattery = () => {
      if (battery) {
        batteryRef.current = { level: battery.level, charging: battery.charging };
      }
    };

    (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: EventTarget['addEventListener']; removeEventListener: EventTarget['removeEventListener'] }> }).getBattery?.()?.then?.((b) => {
      battery = b;
      updateBattery();
      b.addEventListener('levelchange', updateBattery);
      b.addEventListener('chargingchange', updateBattery);
    }).catch(() => { /* Battery API unavailable */ });

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', updateBattery);
        battery.removeEventListener('chargingchange', updateBattery);
      }
    };
  }, [isAgent]);

  const getMinWsInterval = useCallback(() => {
    const { level, charging } = batteryRef.current;
    if (charging) return 15_000;
    if (level < 0.15) return 120_000;
    if (level < 0.30) return 60_000;
    return 30_000;
  }, []);

  // ─── Tracker init (pure orchestrator — no watchPosition) ────
  useEffect(() => {
    if (!isAgent || !user?.id) return;

    const tracker = createWebGeoTracker({
      agentId: String(user.id),
      agencyId: user?.agenceId,
    });

    tracker.start();
    trackerRef.current = tracker;
    console.info('[LocationTracker] Tracker auto-started for AGENT_TERRAIN', user.id);

    return () => {
      tracker.stop();
      trackerRef.current = null;
    };
  }, [isAgent, user?.id]);

  // ─── GPS watchPosition — mandatory, auto-start, with retry ──
  useEffect(() => {
    if (!isAgent || isCapacitorNative()) return;

    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }

    function startWatch() {
      // Clear any previous watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      setGpsStatus('starting');

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          setGpsStatus('active');
          // Clear retry timer on success — GPS is working
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }

          const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
          const now = Date.now();
          const batteryLevel = Math.round(batteryRef.current.level * 100);

          // Always ingest into tracker (offline-first recording)
          trackerRef.current?.ingest(
            latitude, longitude, accuracy, speed, heading, altitude, batteryLevel,
          );

          // WebSocket: send only when connected + throttled
          const ws = wsRef.current;
          if (ws.isConnected) {
            const last = lastWsSentRef.current;
            const minInterval = getMinWsInterval();

            if (now - last.time >= minInterval) {
              const moved = last.lat === 0 || haversineMeters(last.lat, last.lng, latitude, longitude) >= 5;
              if (moved || now - last.time >= minInterval * 2) {
                lastWsSentRef.current = { lat: latitude, lng: longitude, time: now };
                ws.sendMessage('LOCATION_UPDATE', {
                  latitude, longitude, accuracy, altitude, speed, heading, batteryLevel,
                });
              }
            }
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setGpsStatus('denied');
          } else {
            setGpsStatus('unavailable');
          }

          // Schedule retry — GPS is mandatory for AGENT_TERRAIN
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              startWatch();
            }, GPS_RETRY_INTERVAL_MS);
          }
        },
        {
          enableHighAccuracy: batteryRef.current.level > 0.30,
          timeout: 30_000,
          maximumAge: 10_000,
        },
      );
    }

    startWatch();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setGpsStatus('off');
    };
  }, [isAgent, getMinWsInterval]);

  // ─── Render: tracking indicator ─────────────────────────────
  if (!isAgent) return null;

  // Active — small discreet green dot
  if (gpsStatus === 'active') {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-edge-subtle bg-surface-elevated px-2.5 py-1 shadow-lg"
        title="Tracking actif"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-status-success" />
        <span className="text-[10px] font-medium text-content-muted">Tracking actif</span>
      </div>
    );
  }

  // Starting — brief transient state
  if (gpsStatus === 'starting') {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-edge-subtle bg-surface-elevated px-2.5 py-1 shadow-lg"
        title="Demarrage GPS..."
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-status-warning" />
        <span className="text-[10px] font-medium text-content-muted">Demarrage GPS...</span>
      </div>
    );
  }

  // Denied or unavailable — persistent banner (GPS is mandatory)
  if (gpsStatus === 'denied' || gpsStatus === 'unavailable') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-status-danger/30 bg-status-danger-bg px-4 py-3">
        <div className="mx-auto flex max-w-lg items-start gap-3">
          <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-status-danger" />
          <div>
            <p className="text-sm font-medium text-status-danger">
              {gpsStatus === 'denied'
                ? 'Autorisation GPS requise'
                : 'GPS indisponible'}
            </p>
            <p className="mt-0.5 text-xs text-content-secondary">
              {gpsStatus === 'denied'
                ? 'Le suivi de position est obligatoire pour votre poste. Veuillez autoriser l\'acces a la localisation dans les parametres de votre navigateur.'
                : 'Votre appareil ne supporte pas la geolocalisation. Contactez votre superviseur.'}
            </p>
            <p className="mt-1 text-[10px] text-content-muted">
              Nouvelle tentative automatique toutes les 30s...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Off — nothing shown (brief moment before GPS starts)
  return null;
}
