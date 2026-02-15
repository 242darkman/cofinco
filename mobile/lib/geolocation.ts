import * as Location from 'expo-location';
import { mobileWs } from './websocket';

let watchSubscription: Location.LocationSubscription | null = null;
let isTracking = false;

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const granted = await requestLocationPermission();
  if (!granted) return null;

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch {
    return null;
  }
}

export async function startLocationTracking(agentId: string): Promise<boolean> {
  if (isTracking) return true;

  const granted = await requestLocationPermission();
  if (!granted) return false;

  try {
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60_000, // Every 60 seconds
        distanceInterval: 50, // Or every 50 meters
      },
      (location) => {
        const payload = {
          type: 'USER_LOCATION',
          agentId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          speed: location.coords.speed,
          heading: location.coords.heading,
          timestamp: new Date().toISOString(),
        };

        // Send via WebSocket
        mobileWs.send(payload);
      }
    );

    isTracking = true;
    return true;
  } catch {
    return false;
  }
}

export function stopLocationTracking() {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
  isTracking = false;
}

export function isLocationTracking(): boolean {
  return isTracking;
}
