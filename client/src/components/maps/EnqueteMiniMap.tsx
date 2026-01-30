/**
 * EnqueteMiniMap - Mini carte pour afficher la localisation d'une enquête
 *
 * Affiche:
 * - Position de l'enquête (marker principal)
 * - Position déclarée du client (marker secondaire si disponible)
 * - Distance entre les deux points
 * - Rayon de précision GPS
 */

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, AlertTriangle, CheckCircle, Camera } from 'lucide-react';

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface GeotaggedPhoto {
  url: string;
  latitude?: number;
  longitude?: number;
  timestamp?: string;
  accuracy?: number;
}

interface EnqueteMiniMapProps {
  // Position de l'enquête
  enqueteLatitude: number;
  enqueteLongitude: number;
  enqueteAccuracy?: number;
  enqueteTimestamp?: string;

  // Position déclarée du client (optionnel)
  clientLatitude?: number;
  clientLongitude?: number;
  clientAddress?: string;

  // Photos géotaggées (optionnel)
  geotaggedPhotos?: GeotaggedPhoto[];

  // Options d'affichage
  height?: string;
  showAccuracyCircle?: boolean;
  showDistanceLine?: boolean;
  showPhotosMarkers?: boolean;
  interactive?: boolean;

  // Callbacks
  onPhotoClick?: (photo: GeotaggedPhoto) => void;
}

// Icône personnalisée pour l'enquête (vert)
const enqueteIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    width: 32px;
    height: 32px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <svg style="transform: rotate(45deg); width: 16px; height: 16px; color: white;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Icône pour le client (bleu)
const clientIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    width: 28px;
    height: 28px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <svg style="transform: rotate(45deg); width: 14px; height: 14px; color: white;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

// Icône pour les photos (orange)
const photoIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <svg style="width: 12px; height: 12px; color: white;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

// Calcul de distance Haversine
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Composant pour ajuster la vue
function MapBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [map, bounds]);
  return null;
}

export default function EnqueteMiniMap({
  enqueteLatitude,
  enqueteLongitude,
  enqueteAccuracy = 50,
  enqueteTimestamp,
  clientLatitude,
  clientLongitude,
  clientAddress,
  geotaggedPhotos = [],
  height = '250px',
  showAccuracyCircle = true,
  showDistanceLine = true,
  showPhotosMarkers = true,
  interactive = true,
  onPhotoClick,
}: EnqueteMiniMapProps) {
  const [distance, setDistance] = useState<number | null>(null);

  // Calculer la distance si les deux positions sont disponibles
  useEffect(() => {
    if (clientLatitude && clientLongitude) {
      const dist = haversineDistance(enqueteLatitude, enqueteLongitude, clientLatitude, clientLongitude);
      setDistance(dist);
    }
  }, [enqueteLatitude, enqueteLongitude, clientLatitude, clientLongitude]);

  // Calculer les bounds pour inclure tous les points
  const getBounds = (): L.LatLngBoundsExpression => {
    const points: [number, number][] = [[enqueteLatitude, enqueteLongitude]];

    if (clientLatitude && clientLongitude) {
      points.push([clientLatitude, clientLongitude]);
    }

    geotaggedPhotos.forEach(photo => {
      if (photo.latitude && photo.longitude) {
        points.push([photo.latitude, photo.longitude]);
      }
    });

    if (points.length === 1) {
      // Un seul point, créer un petit bounds autour
      const lat = points[0][0];
      const lng = points[0][1];
      return [[lat - 0.002, lng - 0.002], [lat + 0.002, lng + 0.002]];
    }

    return points as L.LatLngBoundsExpression;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const isDistanceWarning = distance !== null && distance > 200;

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-700/50" style={{ height }}>
      {/* Légende superposée */}
      <div className="absolute top-2 left-2 z-[1000] bg-slate-900/90 backdrop-blur-sm rounded-lg p-2 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-slate-300">Lieu enquête</span>
        </div>
        {clientLatitude && clientLongitude && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-slate-300">Adresse client</span>
          </div>
        )}
        {geotaggedPhotos.length > 0 && showPhotosMarkers && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-slate-300">Photos ({geotaggedPhotos.length})</span>
          </div>
        )}
      </div>

      {/* Indicateur de distance */}
      {distance !== null && (
        <div className={`absolute top-2 right-2 z-[1000] rounded-lg px-2 py-1 text-xs font-medium flex items-center gap-1.5 ${
          isDistanceWarning
            ? 'bg-red-500/90 text-white'
            : 'bg-emerald-500/90 text-white'
        }`}>
          {isDistanceWarning ? (
            <AlertTriangle size={12} />
          ) : (
            <CheckCircle size={12} />
          )}
          <span>{formatDistance(distance)}</span>
        </div>
      )}

      {/* Carte */}
      <MapContainer
        center={[enqueteLatitude, enqueteLongitude]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={interactive}
        dragging={interactive}
        touchZoom={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Ajuster les bounds */}
        <MapBounds bounds={getBounds()} />

        {/* Cercle de précision GPS */}
        {showAccuracyCircle && enqueteAccuracy > 0 && (
          <Circle
            center={[enqueteLatitude, enqueteLongitude]}
            radius={enqueteAccuracy}
            pathOptions={{
              color: '#10b981',
              fillColor: '#10b981',
              fillOpacity: 0.15,
              weight: 1,
              dashArray: '4',
            }}
          />
        )}

        {/* Ligne entre enquête et client */}
        {showDistanceLine && clientLatitude && clientLongitude && (
          <Polyline
            positions={[
              [enqueteLatitude, enqueteLongitude],
              [clientLatitude, clientLongitude]
            ]}
            pathOptions={{
              color: isDistanceWarning ? '#ef4444' : '#6b7280',
              weight: 2,
              dashArray: '8, 8',
              opacity: 0.7,
            }}
          />
        )}

        {/* Marker de l'enquête */}
        <Marker position={[enqueteLatitude, enqueteLongitude]} icon={enqueteIcon}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold text-emerald-600 mb-1 flex items-center gap-1">
                <MapPin size={14} />
                Lieu de l'enquête
              </div>
              <div className="text-gray-600 text-xs space-y-0.5">
                <div>Lat: {enqueteLatitude.toFixed(6)}</div>
                <div>Lng: {enqueteLongitude.toFixed(6)}</div>
                {enqueteAccuracy && <div>Précision: ±{Math.round(enqueteAccuracy)}m</div>}
                {enqueteTimestamp && (
                  <div>Capturé: {new Date(enqueteTimestamp).toLocaleString('fr-FR')}</div>
                )}
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Marker du client */}
        {clientLatitude && clientLongitude && (
          <Marker position={[clientLatitude, clientLongitude]} icon={clientIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-blue-600 mb-1 flex items-center gap-1">
                  <Navigation size={14} />
                  Adresse déclarée
                </div>
                <div className="text-gray-600 text-xs space-y-0.5">
                  {clientAddress && <div className="max-w-[200px]">{clientAddress}</div>}
                  <div>Lat: {clientLatitude.toFixed(6)}</div>
                  <div>Lng: {clientLongitude.toFixed(6)}</div>
                  {distance !== null && (
                    <div className={isDistanceWarning ? 'text-red-600 font-medium' : ''}>
                      Distance: {formatDistance(distance)}
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Markers des photos géotaggées */}
        {showPhotosMarkers && geotaggedPhotos.map((photo, index) => (
          photo.latitude && photo.longitude && (
            <Marker
              key={index}
              position={[photo.latitude, photo.longitude]}
              icon={photoIcon}
              eventHandlers={{
                click: () => onPhotoClick?.(photo),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold text-amber-600 mb-1 flex items-center gap-1">
                    <Camera size={14} />
                    Photo {index + 1}
                  </div>
                  <img
                    src={photo.url}
                    alt={`Photo ${index + 1}`}
                    className="w-32 h-24 object-cover rounded mb-1"
                  />
                  <div className="text-gray-600 text-xs">
                    {photo.timestamp && (
                      <div>{new Date(photo.timestamp).toLocaleString('fr-FR')}</div>
                    )}
                    {photo.accuracy && <div>Précision: ±{Math.round(photo.accuracy)}m</div>}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}

export type { GeotaggedPhoto };
