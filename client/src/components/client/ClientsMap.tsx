import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Users, MapPin, CreditCard, PiggyBank } from 'lucide-react';
import { formatClientName } from '../../lib/format';
import { requestAllPages } from '../../lib/api-client';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ClientLocation {
  id: string;
  nom: string;
  prenom?: string;
  telephone: string;
  ville?: string;
  segment: string;
  latitude: number;
  longitude: number;
  creditTotal?: number;
  epargneTotal?: number;
}

interface ClientsMapProps {
  clients?: ClientLocation[];
  height?: string;
  showStats?: boolean;
}

const getMarkerIcon = (segment: string) => {
  const colors: Record<string, string> = {
    'Premium': '#f59e0b',
    'Gold': '#eab308',
    'Standard': '#22c55e',
    'Nouveau': '#3b82f6',
  };
  const color = colors[segment] || '#6b7280';

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });
};

const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  let size = 'small';
  let bgColor = '#22c55e';
  if (count >= 50) { size = 'large'; bgColor = '#ef4444'; }
  else if (count >= 20) { size = 'medium'; bgColor = '#f59e0b'; }

  const dim = size === 'large' ? 50 : size === 'medium' ? 40 : 30;

  return L.divIcon({
    html: `<div style="background-color: ${bgColor}; width: ${dim}px; height: ${dim}px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${size === 'large' ? '16' : size === 'medium' ? '14' : '12'}px;">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(dim, dim),
    iconAnchor: [dim / 2, dim / 2],
  });
};

function MapController({ clients }: { clients: ClientLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (clients.length > 0) {
      const bounds = L.latLngBounds(clients.map(c => [c.latitude, c.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [clients, map]);

  return null;
}

export default function ClientsMap({ clients: propClients, height = '500px', showStats = true }: ClientsMapProps) {
  const [clients, setClients] = useState<ClientLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const defaultCenter: [number, number] = [-4.2634, 15.2429];

  useEffect(() => {
    if (propClients) {
      setClients(propClients);
      setLoading(false);
    } else {
      fetchClients();
    }
  }, [propClients]);

  const fetchClients = async () => {
    try {
      const data = await requestAllPages<any>('/clients/with-location');
      const clientsWithLocation = (data || [])
        .filter((c: any) => c.latitude && c.longitude)
        .map((c: any) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          telephone: c.telephone,
          ville: c.ville,
          segment: c.segment || 'Standard',
          latitude: parseFloat(c.latitude),
          longitude: parseFloat(c.longitude),
          creditTotal: parseFloat(c.creditTotal || '0'),
          epargneTotal: parseFloat(c.epargneTotal || '0'),
        }));
      setClients(clientsWithLocation);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = filter === 'all'
    ? clients
    : clients.filter(c => c.segment === filter);

  const segments = ['all', ...Array.from(new Set(clients.map(c => c.segment)))];

  const stats = {
    total: clients.length,
    withLocation: clients.length,
    segments: segments.filter(s => s !== 'all').reduce((acc, seg) => {
      acc[seg] = clients.filter(c => c.segment === seg).length;
      return acc;
    }, {} as Record<string, number>),
  };

  const segmentColors: Record<string, string> = {
    'Premium': 'bg-status-warning',
    'Gold': 'bg-status-warning',
    'Standard': 'bg-status-success',
    'Nouveau': 'bg-status-info',
    'all': 'bg-accent'
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-xl p-8 flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-content-muted">Chargement de la carte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl overflow-hidden border border-edge flex flex-col h-full">
      {showStats && (
        <div className="px-3 py-2 sm:px-4 sm:py-3 border-b border-edge bg-surface shrink-0">
          <div className="flex flex-col gap-2">

            {/* Header Top: Title & Count */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-content-primary">
                <MapPin className="text-accent" size={18} />
                <span className="font-bold text-sm sm:text-base">{stats.total} clients localisés</span>
              </div>
            </div>

            {/* Scrollable Filters (Acts as Legend) */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 mask-linear-fade">
               {segments.map(seg => (
                  <button
                    key={seg}
                    onClick={() => setFilter(seg)}
                    className={`
                      whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                      ${filter === seg
                        ? 'bg-accent-bg border-accent/50 text-accent'
                        : 'bg-surface-elevated/50 border-edge-strong text-content-muted hover:bg-surface-elevated hover:border-edge-strong'
                      }
                    `}
                  >
                    <span className={`w-2 h-2 rounded-full ${segmentColors[seg] || 'bg-surface-subtle'}`} />
                    <span>{seg === 'all' ? 'Tous' : seg}</span>
                    <span className="opacity-60 ml-0.5 text-[10px] bg-black/20 px-1 py-0.5 rounded-full">
                      {seg === 'all' ? stats.total : (stats.segments[seg] || 0)}
                    </span>
                  </button>
                ))}
            </div>

          </div>
        </div>
      )}

      <div style={{ height }} className="relative">
        <MapContainer
          center={defaultCenter}
          zoom={12}
          style={{ height: '100%', width: '100%', zIndex: 1 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredClients.length > 0 && <MapController clients={filteredClients} />}

          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterIcon}
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            disableClusteringAtZoom={17}
          >
            {filteredClients.map((client) => (
              <Marker
                key={client.id}
                position={[client.latitude, client.longitude]}
                icon={getMarkerIcon(client.segment)}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <div className="font-bold text-lg text-content-primary mb-2">
                      {formatClientName(client.nom, client.prenom)}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-content-muted">
                        <MapPin size={14} />
                        <span>{client.ville || 'Non spécifié'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-content-muted">
                        <span className="font-medium">Segment:</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          client.segment === 'Premium' ? 'bg-status-warning-bg text-status-warning' :
                          client.segment === 'Gold' ? 'bg-status-warning-bg text-status-warning' :
                          client.segment === 'Standard' ? 'bg-status-success-bg text-status-success' :
                          'bg-status-info-bg text-status-info'
                        }`}>
                          {client.segment}
                        </span>
                      </div>
                      {client.creditTotal !== undefined && client.creditTotal > 0 && (
                        <div className="flex items-center gap-2 text-content-muted">
                          <CreditCard size={14} />
                          <span>Crédit: {client.creditTotal.toLocaleString()} FCFA</span>
                        </div>
                      )}
                      {client.epargneTotal !== undefined && client.epargneTotal > 0 && (
                        <div className="flex items-center gap-2 text-content-muted">
                          <PiggyBank size={14} />
                          <span>Épargne: {client.epargneTotal.toLocaleString()} FCFA</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

    </div>
  );
}
