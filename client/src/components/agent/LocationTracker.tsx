import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

export function LocationTracker() {
  const { sendMessage, isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        sendMessage("LOCATION_UPDATE", { latitude, longitude });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
            console.warn("Location permission denied");
        } else {
            console.error("Error getting location", error);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isConnected, sendMessage]);

  return null; // Headless component
}
