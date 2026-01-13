import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function LocationTracker() {
  const { isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        // Success - Send position update
        fetch('/api/agent-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString()
          })
        }).catch(err => console.error('Location update failed:', err));
      },
      (error) => {
        // Erreur silencieuse - ne pas spammer la console pour les timeouts
        if (error.code === error.TIMEOUT) {
          // Timeout normal, on attend la prochaine tentative
          return;
        }
        // Seulement logger les erreurs critiques
        if (error.code === error.PERMISSION_DENIED) {
          console.warn('GPS permission denied');
        }
      },
      {
        enableHighAccuracy: false, // Changé de true → false pour éviter timeouts
        timeout: 45000, // Augmenté de défaut (probablement 10s) → 45s
        maximumAge: 300000 // Accepter positions de moins de 5 minutes
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isConnected]);

  return null; // Headless component
}
