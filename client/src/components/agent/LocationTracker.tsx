import { useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { authService } from '@/lib/auth';
import { SystemRole, normalizeRole } from '@shared/types/roles';

/** Haversine distance in meters between two lat/lng pairs */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Headless component that auto-tracks GPS position for AGENT_TERRAIN users.
 * Sends positions via WebSocket with adaptive intervals and battery awareness.
 * Mounted globally in App.tsx.
 */
export default function LocationTracker() {
  const { sendMessage, isConnected } = useWebSocket();
  const user = authService.getCurrentUser();
  const role = normalizeRole(user?.role);
  const isAgent = role === SystemRole.AGENT_TERRAIN;

  const lastSentRef = useRef({ lat: 0, lng: 0, time: 0 });
  const batteryRef = useRef({ level: 1, charging: false });

  // Monitor battery level for adaptive intervals
  useEffect(() => {
    if (!isAgent) return;
    let battery: any = null;

    const updateBattery = () => {
      if (battery) {
        batteryRef.current = { level: battery.level, charging: battery.charging };
      }
    };

    (navigator as any).getBattery?.()?.then?.((b: any) => {
      battery = b;
      updateBattery();
      b.addEventListener('levelchange', updateBattery);
      b.addEventListener('chargingchange', updateBattery);
    }).catch(() => { /* Battery API not available — use defaults */ });

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', updateBattery);
        battery.removeEventListener('chargingchange', updateBattery);
      }
    };
  }, [isAgent]);

  const getMinInterval = useCallback(() => {
    const { level, charging } = batteryRef.current;
    if (charging) return 15_000;      // 15s when charging
    if (level < 0.15) return 120_000; // 2min when critical
    if (level < 0.30) return 60_000;  // 1min when low
    return 30_000;                     // 30s normal
  }, []);

  useEffect(() => {
    if (!isAgent || !isConnected || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
        const now = Date.now();
        const last = lastSentRef.current;
        const minInterval = getMinInterval();

        // Throttle: don't send more often than minInterval
        if (now - last.time < minInterval) return;

        // Distance filter: skip if moved less than 5m (GPS jitter)
        if (last.lat !== 0) {
          const dist = distanceMeters(last.lat, last.lng, latitude, longitude);
          if (dist < 5 && now - last.time < minInterval * 2) return;
        }

        lastSentRef.current = { lat: latitude, lng: longitude, time: now };

        sendMessage('LOCATION_UPDATE', {
          latitude,
          longitude,
          accuracy,
          altitude,
          speed,
          heading,
          batteryLevel: Math.round(batteryRef.current.level * 100),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          console.warn('[LocationTracker] GPS permission denied');
        }
        // Silently ignore timeouts and unavailable positions
      },
      {
        enableHighAccuracy: batteryRef.current.level > 0.30,
        timeout: 30000,
        maximumAge: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isAgent, isConnected, sendMessage, getMinInterval]);

  return null;
}
