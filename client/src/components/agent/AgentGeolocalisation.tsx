import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Navigation, Clock, ChevronLeft, ChevronRight, Eye, Gauge } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { agentTerrainApi } from '../../lib/api-client';
import { StatutUser } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { useWebSocket } from '@/hooks/useWebSocket';

// Fix Leaflet/Vite default icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const startIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background:linear-gradient(135deg,#10b981,#059669);width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3)"><span style="color:white;font-weight:900;font-size:12px">D</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const endIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background:linear-gradient(135deg,#3b82f6,#2563eb);width:28px;height:28px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);animation:pulse 2s infinite"><span style="color:white;font-weight:900;font-size:10px">●</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface GeoLocation {
  id: string;
  agent_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
  activity_type: string;
}

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  zone_affectation: string;
  statut: string;
}

export default function AgentGeolocalisation({ agentId }: { agentId?: string }) {
  const [locations, setLocations] = useState<GeoLocation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>(agentId || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);

  const { socket } = useWebSocket();

  // Sync agentId prop
  useEffect(() => {
    if (agentId) setSelectedAgent(agentId);
  }, [agentId]);

  useEffect(() => { loadAgents(); }, []);

  useEffect(() => {
    if (selectedAgent) loadLocations();
  }, [selectedAgent, selectedDate]);

  // Real-time WebSocket listener: append live positions
  useEffect(() => {
    if (!socket || !selectedAgent) return;
    // Only append live data when viewing today
    const today = new Date().toISOString().slice(0, 10);
    if (selectedDate !== today) return;

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'USER_LOCATION' && msg.payload.userId === selectedAgent) {
          const newPoint: GeoLocation = {
            id: `live-${Date.now()}`,
            agent_id: selectedAgent,
            latitude: Number(msg.payload.latitude),
            longitude: Number(msg.payload.longitude),
            accuracy: Number(msg.payload.accuracy) || 0,
            speed: msg.payload.speed != null ? Number(msg.payload.speed) : null,
            heading: msg.payload.heading != null ? Number(msg.payload.heading) : null,
            timestamp: new Date().toISOString(),
            activity_type: 'Live',
          };
          setLocations(prev => [...prev, newPoint]);
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, [socket, selectedAgent, selectedDate]);

  const loadAgents = async () => {
    try {
      const data = await agentTerrainApi.getAllList();
      const actifs = (data || []).filter((agent: Agent) => agent.statut === StatutUser.ACTIVE);
      setAgents(actifs);
      if (actifs.length > 0 && !selectedAgent) {
        setSelectedAgent(actifs[0].id);
      }
    } catch (error) {
    }
  };

  const loadLocations = async () => {
    try {
      setLoading(true);
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const response = await fetch(
        `/api/agent-geolocations?agent_id=${selectedAgent}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`,
        { credentials: 'include' },
      );
      if (response.ok) {
        const data = await response.json();
        setLocations(data || []);
        setCurrentPage(1);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  // Compute stats
  const distance = useMemo(() => {
    if (locations.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < locations.length - 1; i++) {
      const lat1 = locations[i].latitude, lon1 = locations[i].longitude;
      const lat2 = locations[i + 1].latitude, lon2 = locations[i + 1].longitude;
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return total;
  }, [locations]);

  const avgSpeed = useMemo(() => {
    const withSpeed = locations.filter(l => l.speed != null && l.speed > 0);
    if (withSpeed.length === 0) return 0;
    return withSpeed.reduce((s, l) => s + (l.speed || 0), 0) / withSpeed.length * 3.6; // m/s → km/h
  }, [locations]);

  const routePositions = useMemo(() =>
    locations
      .filter(l => l.latitude && l.longitude)
      .map(l => [l.latitude, l.longitude] as [number, number]),
    [locations]
  );

  const totalPages = Math.ceil(locations.length / ITEMS_PER_PAGE);
  const paginatedLocations = locations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col w-full gap-3 min-h-[calc(100svh-180px)]">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        <StatCard icon={<Navigation size={14} />} label="Distance" value={`${distance.toFixed(1)} km`} color="blue" />
        <StatCard icon={<MapPin size={14} />} label="Points GPS" value={locations.length.toString()} color="green" />
        <StatCard icon={<Gauge size={14} />} label="Vitesse moy." value={avgSpeed > 0 ? `${avgSpeed.toFixed(1)} km/h` : '—'} color="emerald" />
        <StatCard icon={<Clock size={14} />} label="Durée" value={locations.length >= 2 ? formatDuration(locations[0].timestamp, locations[locations.length - 1].timestamp) : '—'} color="cyan" />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 p-2 bg-surface-base/50 rounded-xl border border-edge shrink-0">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs focus:ring-1 focus:ring-accent"
        >
          <option value="">Sélectionner un agent...</option>
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>
              {agent.nom} {agent.prenom}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
        />

        {isToday && locations.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-status-success/10 border border-status-success/20 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
            <span className="text-xs font-bold text-status-success">En direct</span>
          </div>
        )}
      </div>

      {/* Map + Table layout — fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        {/* Map */}
        <div className="w-full lg:flex-1 rounded-xl overflow-hidden border border-edge bg-surface" style={{ minHeight: 280 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
            </div>
          ) : routePositions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50 p-6">
              <MapPin size={40} className="text-content-muted mb-3" />
              <p className="text-sm text-content-muted text-center">Aucune position enregistrée</p>
              <p className="text-[10px] text-content-muted mt-1">Le suivi GPS est automatique pour les agents de terrain</p>
            </div>
          ) : (
            <MapContainer
              center={routePositions[routePositions.length - 1]}
              zoom={14}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />
              <Polyline
                positions={routePositions}
                pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.8 }}
              />
              {routePositions.length >= 1 && (
                <Marker position={routePositions[0]} icon={startIcon}>
                  <Popup>
                    <strong>Départ</strong><br />
                    {new Date(locations[0].timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Popup>
                </Marker>
              )}
              {routePositions.length >= 2 && (
                <Marker position={routePositions[routePositions.length - 1]} icon={endIcon}>
                  <Popup>
                    <strong>{isToday ? 'Position actuelle' : 'Dernière position'}</strong><br />
                    {new Date(locations[locations.length - 1].timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Popup>
                </Marker>
              )}
              <FitBoundsToRoute positions={routePositions} />
            </MapContainer>
          )}
        </div>

        {/* Positions table */}
        <div className="w-full lg:w-[380px] xl:w-[440px] flex flex-col bg-surface rounded-xl border border-edge overflow-hidden shrink-0">
          <div className="px-4 py-2.5 border-b border-edge flex items-center justify-between bg-surface-base/30 shrink-0">
            <h3 className="text-xs font-bold text-content-primary flex items-center gap-2">
              <Navigation size={14} className="text-status-info" />
              Historique
            </h3>
            <span className="text-[10px] text-content-muted font-medium">{locations.length} pts</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-edge/50">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent" />
              </div>
            ) : locations.length === 0 ? (
              <div className="text-center py-8 opacity-50">
                <p className="text-xs text-content-muted">Aucune position</p>
              </div>
            ) : (
              paginatedLocations.map((location) => (
                <div
                  key={location.id}
                  className="px-3 py-2 hover:bg-surface-elevated/30 transition cursor-pointer group flex items-center gap-3"
                  onClick={() => setSelectedLocation(location)}
                >
                  <div className="shrink-0">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      location.activity_type === 'Live'
                        ? 'bg-status-success/10 text-status-success'
                        : 'bg-surface-subtle/40 text-content-muted'
                    }`}>
                      {location.activity_type === 'Live' ? '● Live' : 'GPS'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-content-primary">
                      {new Date(location.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-[10px] text-content-muted font-mono truncate">
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {location.accuracy > 0 && (
                      <span className="text-[10px] text-content-muted">±{Math.round(location.accuracy)}m</span>
                    )}
                  </div>
                  <Eye size={12} className="text-content-muted group-hover:text-accent shrink-0" />
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-edge-subtle bg-surface-base/20 shrink-0">
              <span className="text-[10px] text-content-muted">{currentPage}/{totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedLocation} onOpenChange={(open) => !open && setSelectedLocation(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
          {selectedLocation && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-content-primary flex items-center gap-2">
                  <MapPin size={16} className="text-accent" />
                  Détail Position
                </SheetTitle>
                <SheetDescription className="text-content-muted">
                  {new Date(selectedLocation.timestamp).toLocaleString('fr-FR')}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                <div className="flex justify-center">
                  <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase ${
                    selectedLocation.activity_type === 'Live'
                      ? 'bg-status-success/10 text-status-success border border-status-success/30'
                      : 'bg-surface-subtle/40 text-content-muted border border-edge/30'
                  }`}>
                    {selectedLocation.activity_type}
                  </span>
                </div>

                <div className="bg-surface-base border border-edge rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                    <Navigation size={12} />
                    Coordonnées GPS
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Latitude" value={selectedLocation.latitude.toFixed(6)} />
                    <InfoItem label="Longitude" value={selectedLocation.longitude.toFixed(6)} />
                  </div>
                  <InfoItem label="Précision" value={selectedLocation.accuracy > 0 ? `± ${selectedLocation.accuracy.toFixed(1)} m` : '—'} />
                  {selectedLocation.speed != null && selectedLocation.speed > 0 && (
                    <InfoItem label="Vitesse" value={`${(selectedLocation.speed * 3.6).toFixed(1)} km/h`} />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Heure" value={new Date(selectedLocation.timestamp).toLocaleTimeString('fr-FR')} />
                  <InfoItem label="Date" value={new Date(selectedLocation.timestamp).toLocaleDateString('fr-FR')} />
                </div>

                <a
                  href={`https://www.google.com/maps?q=${selectedLocation.latitude},${selectedLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 bg-status-info hover:bg-status-info/90 text-white rounded-xl font-bold text-sm text-center transition shadow-lg shadow-status-info/20"
                >
                  Voir sur Google Maps
                </a>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function FitBoundsToRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [30, 30] });
    } else if (positions.length === 1) {
      map.setView(L.latLng(positions[0][0], positions[0][1]), 15);
    }
  }, [positions.length, map]);
  return null;
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h${minutes.toString().padStart(2, '0')}`;
  return `${minutes}min`;
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'from-status-info/20 to-status-info/5 border-status-info/20 text-status-info',
    green: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    emerald: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    cyan: 'from-accent/20 to-accent/5 border-accent/20 text-accent',
  };

  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1">
        <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
      </div>
      <div className="text-lg font-bold text-content-primary truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium text-content-secondary font-mono">{value}</div>
    </div>
  );
}
