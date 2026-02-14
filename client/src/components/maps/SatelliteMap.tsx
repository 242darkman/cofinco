import type { ClientWithIdentity } from '@shared/schema';
import { StatutUser } from '@shared/enum/status-constants';
import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Circle, Polyline } from 'react-leaflet';
import L, { DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, MapPin, Users, Crosshair, Layers, Satellite, Map as MapIcon, Mountain, RefreshCw, LocateFixed, X } from 'lucide-react';
import useGeolocation from '../../hooks/useGeolocation';
import { formatClientName } from '../../lib/format';
import { ALL_STATUS_LABELS } from '../../lib/status-labels';

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  latitude: number;
  longitude: number;
  lastSeenAt?: string;
  statut?: string;
}

interface Visit {
  id: string;
  clientNom: string;
  latitude: number;
  longitude: number;
  statut: string;
  dateVisite: string;
}

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

interface SatelliteMapProps {
  agents?: Agent[];
  clients?: ClientWithIdentity[];
  visits?: Visit[];
  route?: RoutePoint[];
  center?: [number, number];
  zoom?: number;
  showMyLocation?: boolean;
  showRoute?: boolean;
  onLocationUpdate?: (lat: number, lng: number) => void;
  onAgentClick?: (agent: Agent) => void;
  onClientClick?: (client: ClientWithIdentity) => void;
  className?: string;
}

interface AddressInfo {
  quartier: string;
  rue: string;
  numero: string;
  ville: string;
  fullAddress: string;
}

function LocationMarker({ onLocationUpdate, onAddressFound }: { 
  onLocationUpdate?: (lat: number, lng: number) => void;
  onAddressFound?: (address: AddressInfo) => void;
}) {
  const { latitude, longitude, accuracy, loading, error, getCurrentPosition } = useGeolocation({ 
    desiredAccuracy: 30, 
    maxWait: 10000 
  });
  const map = useMap();

  const lastFetchedRef = React.useRef<string>('');

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (lastFetchedRef.current === key) return;
    lastFetchedRef.current = key;
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`,
        { 
          headers: { 
            'Accept-Language': 'fr',
            'User-Agent': 'COFIN-Microfinance/1.0'
          } 
        }
      );
      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        const quartier = addr.suburb || addr.neighbourhood || addr.quarter || 
                        addr.city_district || addr.borough || addr.hamlet || 
                        addr.locality || addr.residential || '';
        const rue = addr.road || addr.street || addr.pedestrian || addr.path || 
                   addr.footway || addr.cycleway || addr.track || '';
        const numero = addr.house_number || addr.building || '';
        const ville = addr.city || addr.town || addr.village || addr.municipality || 
                     addr.county || addr.state || 'Congo';
        
        const addressInfo: AddressInfo = {
          quartier: quartier,
          rue: rue || (data.name || ''),
          numero: numero,
          ville: ville,
          fullAddress: data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        };
        
        if (onAddressFound) {
          onAddressFound(addressInfo);
        }
      } else if (onAddressFound) {
        onAddressFound({
          quartier: '',
          rue: 'Position GPS',
          numero: '',
          ville: 'Congo',
          fullAddress: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        });
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      if (onAddressFound) {
        onAddressFound({
          quartier: '',
          rue: 'Position GPS',
          numero: '',
          ville: 'Congo',
          fullAddress: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        });
      }
    }
  }, [onAddressFound]);

  useEffect(() => {
    if (latitude && longitude) {
      map.flyTo([latitude, longitude], 16);
      if (onLocationUpdate) {
        onLocationUpdate(latitude, longitude);
      }
      fetchAddress(latitude, longitude);
    }
  }, [latitude, longitude]);

  if (loading && !latitude) {
    return null;
  }

  if (!latitude || !longitude) {
    return null;
  }

  const myLocationIcon = new DivIcon({
    html: `<div class="relative">
      <div class="w-5 h-5 bg-status-info rounded-full border-3 border-white shadow-xl animate-pulse"></div>
      <div class="absolute -inset-3 bg-status-info/30 rounded-full animate-ping"></div>
    </div>`,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <>
      <Circle
        center={[latitude, longitude]}
        radius={accuracy || 50}
        pathOptions={{
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          weight: 2,
        }}
      />
      <Marker position={[latitude, longitude]} icon={myLocationIcon}>
        <Popup>
          <div className="text-center p-1">
            <strong className="text-status-info">Ma position GPS</strong>
            <br />
            <span className="text-xs text-content-muted">
              Précision: {accuracy?.toFixed(0)}m
            </span>
            <br />
            <span className="text-xs text-content-muted">
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </span>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

function RecenterButton({ position }: { position?: [number, number] }) {
  const map = useMap();
  
  const handleRecenter = () => {
    if (position) {
      map.flyTo(position, 16);
    }
  };

  return (
    <button
      onClick={handleRecenter}
      className="absolute bottom-4 right-4 z-[1000] bg-surface p-3 rounded-full shadow-xl hover:bg-status-info-bg transition-colors border-2 border-status-info"
      data-testid="button-recenter-map"
      title="Recentrer sur ma position"
    >
      <Crosshair className="w-6 h-6 text-status-info" />
    </button>
  );
}

function LocateButton({ onClick, isLoading }: { onClick: () => void; isLoading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="absolute bottom-20 right-4 z-[1000] bg-status-info p-3 rounded-full shadow-xl hover:bg-status-info transition-colors disabled:opacity-50"
      data-testid="button-locate-me"
      title="Me localiser"
    >
      <LocateFixed className={`w-6 h-6 text-white ${isLoading ? 'animate-spin' : ''}`} />
    </button>
  );
}

export default function SatelliteMap({
  agents = [],
  clients = [],
  visits = [],
  route = [],
  center = [-4.2634, 15.2429], // Brazzaville, Congo
  zoom = 16, // Good balance for satellite detail
  showMyLocation = true,
  showRoute = true,
  onLocationUpdate,
  onAgentClick,
  onClientClick,
  className = '',
}: SatelliteMapProps) {
  const [myPosition, setMyPosition] = useState<[number, number] | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<'satellite' | 'streets' | 'terrain'>('satellite');
  const [locationHistory, setLocationHistory] = useState<[number, number][]>([]);
  const [currentAddress, setCurrentAddress] = useState<AddressInfo | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  const handleLocationUpdate = (lat: number, lng: number) => {
    setMyPosition([lat, lng]);
    setLocationHistory(prev => {
      const newHistory = [...prev, [lat, lng] as [number, number]];
      return newHistory.slice(-50);
    });
    if (onLocationUpdate) {
      onLocationUpdate(lat, lng);
    }
  };

  const handleAddressFound = (address: AddressInfo) => {
    setCurrentAddress(address);
    setIsLocating(false);
  };

  const routePositions: [number, number][] = route.length > 0 
    ? route.map(p => [p.latitude, p.longitude] as [number, number])
    : locationHistory;

  const agentIcon = new DivIcon({
    html: `<div class="w-8 h-8 bg-status-success rounded-full border-3 border-white shadow-lg flex items-center justify-center">
      <svg class="w-4 h-4 text-content-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    </div>`,
    className: 'custom-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const clientIcon = new DivIcon({
    html: `<div class="w-6 h-6 bg-status-info rounded-full border-2 border-white shadow-lg flex items-center justify-center">
      <svg class="w-3 h-3 text-content-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    </div>`,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });

  const visitIcon = (statut: string) => new DivIcon({
    html: `<div class="w-6 h-6 ${(statut === 'COMPLETED') ? 'bg-status-success' : (statut === 'IN_PROGRESS') ? 'bg-status-warning' : 'bg-surface-subtle'} rounded-full border-2 border-white shadow-lg flex items-center justify-center">
      <svg class="w-3 h-3 text-content-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
      </svg>
    </div>`,
    className: 'custom-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', minHeight: '400px' }}
        className="z-0"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={selectedLayer === 'satellite'} name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={selectedLayer === 'streets'} name="Carte">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={selectedLayer === 'terrain'} name="Terrain">
            <TileLayer
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              maxZoom={17}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {showMyLocation && (
          <LocationMarker onLocationUpdate={handleLocationUpdate} onAddressFound={handleAddressFound} />
        )}

        {agents.map((agent) => (
          <Marker
            key={agent.id}
            position={[agent.latitude, agent.longitude]}
            icon={agentIcon}
            eventHandlers={{
              click: () => onAgentClick?.(agent),
            }}
          >
            <Popup>
              <div className="p-2">
                <div className="font-semibold text-status-success">
                  {agent.prenom} {agent.nom}
                </div>
                <div className="text-xs text-content-muted mt-1">
                  Agent Terrain
                </div>
                {agent.lastSeenAt && (
                  <div className="text-xs text-content-muted mt-1">
                    Dernière position: {new Date(agent.lastSeenAt).toLocaleString('fr-FR')}
                  </div>
                )}
                <div className={`text-xs mt-1 ${(agent.statut === StatutUser.ACTIVE) ? 'text-status-success' : 'text-content-muted'}`}>
                  {ALL_STATUS_LABELS[agent.statut || StatutUser.ACTIVE] || agent.statut || StatutUser.ACTIVE}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {clients.map((client) => (
          <Marker
            key={client.id}
            position={[parseFloat(client.latitude as any) || 0, parseFloat(client.longitude as any) || 0]}
            icon={clientIcon}
            eventHandlers={{
              click: () => onClientClick?.(client),
            }}
          >
            <Popup>
              <div className="p-2">
                <div className="font-semibold text-status-info">
                  {formatClientName(client.nom, client.prenom)}
                </div>
                {client.telephone && (
                  <div className="text-xs text-content-muted mt-1">
                    {client.telephone}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {visits.map((visit) => (
          <Marker
            key={visit.id}
            position={[visit.latitude, visit.longitude]}
            icon={visitIcon(visit.statut)}
          >
            <Popup>
              <div className="p-2">
                <div className="font-semibold">{visit.clientNom}</div>
                <div className="text-xs text-content-muted mt-1">
                  {new Date(visit.dateVisite).toLocaleDateString('fr-FR')}
                </div>
                <div className={`text-xs mt-1 font-medium ${
                  (visit.statut === 'COMPLETED') ? 'text-status-success' :
                  (visit.statut === 'IN_PROGRESS') ? 'text-status-warning' : 'text-content-muted'
                }`}>
                  {ALL_STATUS_LABELS[visit.statut] || visit.statut}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {showRoute && routePositions.length > 1 && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: '#22c55e',
              weight: 4,
              opacity: 0.8,
              dashArray: '10, 5',
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {showRoute && clients.length > 1 && (
          <Polyline
            positions={clients.map(c => [parseFloat(c.latitude as any) || 0, parseFloat(c.longitude as any) || 0] as [number, number])}
            pathOptions={{
              color: '#16a34a',
              weight: 3,
              opacity: 0.6,
              dashArray: '5, 10',
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {myPosition && <RecenterButton position={myPosition} />}
      </MapContainer>

      {showPanel ? (
        <div className="absolute top-4 left-4 z-[1000] bg-surface-base/95 backdrop-blur-sm rounded-xl p-4 shadow-2xl border border-edge max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="p-2 bg-status-info rounded-lg">
                <Satellite className="w-4 h-4 text-content-primary" />
              </div>
              <div>
                <span className="font-bold text-content-primary block">Carte Satellite GPS</span>
                <span className="text-xs text-content-muted">Zoom x16 - Haute résolution</span>
              </div>
            </div>
            <button
              onClick={() => setShowPanel(false)}
              className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors"
              data-testid="button-close-map-panel"
              title="Fermer le panneau"
            >
              <X className="w-5 h-5 text-content-muted hover:text-content-primary" />
            </button>
          </div>
          
          {currentAddress && (
            <div className="bg-surface rounded-lg p-3 mb-3 border border-edge-strong">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-status-success mt-0.5 flex-shrink-0" />
                <div className="text-sm flex-1">
                  <div className="font-semibold text-content-primary">
                    {currentAddress.numero && `N° ${currentAddress.numero}, `}
                    {currentAddress.rue || 'Position GPS'}
                  </div>
                  {currentAddress.quartier && (
                    <div className="text-status-success font-medium">
                      Quartier {currentAddress.quartier}
                    </div>
                  )}
                  <div className="text-content-muted text-xs mt-1">
                    {currentAddress.ville}
                  </div>
                  {currentAddress.fullAddress && currentAddress.fullAddress !== currentAddress.rue && (
                    <div className="text-content-muted text-xs mt-1 italic">
                      {currentAddress.fullAddress.length > 80 
                        ? currentAddress.fullAddress.substring(0, 80) + '...' 
                        : currentAddress.fullAddress}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {myPosition && (
            <div className="bg-status-info-bg rounded-lg p-2 mb-3 border border-status-info/30">
              <div className="flex items-center gap-2 text-xs text-status-info-text">
                <Navigation className="w-3 h-3" />
                <span>GPS: {myPosition[0].toFixed(6)}, {myPosition[1].toFixed(6)}</span>
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1 bg-surface px-2 py-1 rounded-full">
              <div className="w-2.5 h-2.5 bg-status-success rounded-full"></div>
              <span className="text-content-secondary">Agents ({agents.length})</span>
            </div>
            <div className="flex items-center gap-1 bg-surface px-2 py-1 rounded-full">
              <div className="w-2.5 h-2.5 bg-status-info rounded-full"></div>
              <span className="text-content-secondary">Clients ({clients.length})</span>
            </div>
            <div className="flex items-center gap-1 bg-surface px-2 py-1 rounded-full">
              <div className="w-2.5 h-2.5 bg-status-warning rounded-full"></div>
              <span className="text-content-secondary">Visites ({visits.length})</span>
            </div>
            <div className="flex items-center gap-1 bg-surface px-2 py-1 rounded-full">
              <div className="w-4 h-0.5 bg-status-success rounded"></div>
              <span className="text-content-secondary">Itinéraire</span>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowPanel(true)}
          className="absolute top-20 left-4 z-[1000] bg-surface-base/95 backdrop-blur-sm rounded-xl p-3 shadow-2xl border border-edge hover:bg-surface transition-colors"
          data-testid="button-open-map-panel"
          title="Afficher le panneau"
        >
          <Satellite className="w-5 h-5 text-status-info" />
        </button>
      )}
    </div>
  );
}
