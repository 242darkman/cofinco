import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, type AppStateStatus } from 'react-native';
import { mobileWs } from './websocket';

// ─── Constants ──────────────────────────────────────────────────────────────

const BACKGROUND_TASK_NAME = 'COFINCO_BACKGROUND_LOCATION';
const MAX_BUFFER_SIZE = 500;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  agentId: string;
  source: 'foreground' | 'background';
}

// ─── State ──────────────────────────────────────────────────────────────────

let foregroundSubscription: Location.LocationSubscription | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let _isTracking = false;
let _agentId: string | null = null;
let _offlineBuffer: LocationPoint[] = [];

// ─── Permission helpers ─────────────────────────────────────────────────────

export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function requestBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === 'granted';
}

export async function requestAllPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const foreground = await requestForegroundPermission();
  if (!foreground) return { foreground: false, background: false };
  const background = await requestBackgroundPermission();
  return { foreground, background };
}

// ─── Get current position (one-shot, highest accuracy) ──────────────────────

export async function getCurrentPosition(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number | null;
} | null> {
  const granted = await requestForegroundPermission();
  if (!granted) return null;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };
  } catch {
    return null;
  }
}

// ─── Send position via WebSocket (with offline buffer) ──────────────────────

function sendPosition(point: LocationPoint) {
  const payload = { type: 'USER_LOCATION', ...point };

  if (mobileWs.isConnected()) {
    flushOfflineBuffer();
    mobileWs.send(payload);
  } else {
    _offlineBuffer.push(point);
    if (_offlineBuffer.length > MAX_BUFFER_SIZE) {
      _offlineBuffer = _offlineBuffer.slice(-MAX_BUFFER_SIZE);
    }
  }
}

function flushOfflineBuffer() {
  if (_offlineBuffer.length === 0) return;
  const toSend = [..._offlineBuffer];
  _offlineBuffer = [];
  mobileWs.send({ type: 'USER_LOCATION_BATCH', positions: toSend });
}

// ─── Build a LocationPoint from raw coords ──────────────────────────────────

function toLocationPoint(
  coords: Location.LocationObjectCoords,
  timestamp: number,
  source: 'foreground' | 'background'
): LocationPoint {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    speed: coords.speed,
    heading: coords.heading,
    timestamp: new Date(timestamp).toISOString(),
    agentId: _agentId || '',
    source,
  };
}

// ─── Foreground tracking (high accuracy, frequent) ──────────────────────────

async function startForegroundTracking() {
  if (foregroundSubscription) return;

  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 30_000, // Every 30 seconds
      distanceInterval: 20, // Or every 20 meters
    },
    (location) => {
      sendPosition(toLocationPoint(location.coords, location.timestamp, 'foreground'));
    }
  );
}

function stopForegroundTracking() {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
}

// ─── Background tracking (battery-aware, continuous) ────────────────────────

async function startBackgroundTracking() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (isRegistered) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 60_000,
    distanceInterval: 30,
    deferredUpdatesInterval: 60_000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'COFINCO Agent Terrain',
      notificationBody: 'Suivi GPS actif',
      notificationColor: '#0284c7',
    },
  });
}

async function stopBackgroundTracking() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  }
}

// ─── Background task definition ─────────────────────────────────────────────

TaskManager.defineTask(BACKGROUND_TASK_NAME, ({ data, error }) => {
  if (error || !data || !_agentId) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  for (const loc of locations) {
    sendPosition(toLocationPoint(loc.coords, loc.timestamp, 'background'));
  }
});

// ─── App state listener ─────────────────────────────────────────────────────

function handleAppStateChange(state: AppStateStatus) {
  if (!_isTracking || !_agentId) return;

  if (state === 'active') {
    startForegroundTracking();
    flushOfflineBuffer();
  } else if (state === 'background' || state === 'inactive') {
    stopForegroundTracking();
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function startLocationTracking(agentId: string): Promise<boolean> {
  if (_isTracking) return true;

  const { foreground, background } = await requestAllPermissions();
  if (!foreground) return false;

  _agentId = agentId;
  _isTracking = true;

  await startForegroundTracking();

  if (background) {
    await startBackgroundTracking();
  }

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  // Send initial high-accuracy position immediately
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    sendPosition(toLocationPoint(location.coords, location.timestamp, 'foreground'));
  } catch {
    // Non-blocking
  }

  return true;
}

export async function stopLocationTracking() {
  _isTracking = false;
  _agentId = null;

  stopForegroundTracking();
  await stopBackgroundTracking();

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  flushOfflineBuffer();
}

export function isLocationTracking(): boolean {
  return _isTracking;
}

export function getOfflineBufferCount(): number {
  return _offlineBuffer.length;
}
