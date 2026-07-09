import { useState, useEffect, useRef } from 'react';

interface NominatimResponse {
  display_name: string;
  address: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    [key: string]: string | undefined;
  };
  error?: string;
}

interface ReverseGeocodeResult {
  displayName: string;
  address: NominatimResponse['address'] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Simple in-memory cache to avoid redundant requests during the session
const GEOCACHE = new Map<string, string>();

/**
 * Hook to convert GPS coordinates to a human-readable address.
 * Uses OpenStreetMap Nominatim API.
 * Includes caching, debouncing (implicit via useEffect dependencies), and cancellation.
 */
export function useReverseGeocode(
  latitude?: number | string | null,
  longitude?: number | string | null
): ReverseGeocodeResult {
  const [displayName, setDisplayName] = useState<string>('');
  const [address, setAddress] = useState<NominatimResponse['address'] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAddress = async () => {
    // Basic validation
    if (!latitude || !longitude) {
      setDisplayName('');
      setAddress(null);
      setError(null);
      return;
    }

    const lat = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
    const lon = typeof longitude === 'string' ? parseFloat(longitude) : longitude;

    if (isNaN(lat) || isNaN(lon)) {
      setError('Coordonnées invalides');
      return;
    }

    // Check cache first
    const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (GEOCACHE.has(cacheKey)) {
      try {
        const cachedData = JSON.parse(GEOCACHE.get(cacheKey)!);
        setDisplayName(cachedData.display_name);
        setAddress(cachedData.address);
        setLoading(false);
        return;
      } catch (e) {
        // Corrupt cache, ignore
        GEOCACHE.delete(cacheKey);
      }
    }

    // Setup cancellation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      // Nominatim usage policy requires User-Agent (browser sends it automatically)
      // and recommends 1 request per second max.
      // We rely on React useEffect's natural behavior + optional debounce if needed.
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        {
          signal: abortControllerRef.current.signal,
          credentials: 'omit', // Important: Bypass global fetch 'include' default which causes CORS errors on external APIs
          headers: {
            'Accept-Language': 'fr-FR', // Prefer French results
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status})`);
      }

      const data: NominatimResponse = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Format a shorter display name if possible, Nominatim's is very long
      // const shortName = [data.address.road, data.address.suburb, data.address.city].filter(Boolean).join(', ');

      setDisplayName(data.display_name);
      setAddress(data.address);

      // Update cache
      GEOCACHE.set(cacheKey, JSON.stringify(data));

    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request cancelled, do nothing
        return;
      }
      console.error('Reverse Geocoding Error:', err);
      // Don't show technical errors to user unless necessary, usually just "Unknown location" is enough in UI
      // but for hook state we expose it.
      setError(err.message || 'Impossible de récupérer l\'adresse');
      setDisplayName('Position inconnue');
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Small delay to debounce rapid updates (e.g. if user is dragging a marker)
    const timer = setTimeout(() => {
      fetchAddress();
    }, 1000); 

    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [latitude, longitude]);

  return {
    displayName,
    address,
    loading,
    error,
    refetch: fetchAddress
  };
}
