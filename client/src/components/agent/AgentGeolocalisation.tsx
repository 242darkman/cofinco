import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Calendar, Clock, Activity, TrendingUp, Users, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { agentTerrainApi } from '../../lib/api-client';
import { StatutUser } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

interface GeoLocation {
  id: string;
  agent_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  activity_type: string;
  visite_id?: string;
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
  const [liveTracking, setLiveTracking] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Detail Sheet
  const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadLocations();
    }
  }, [selectedAgent, selectedDate]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (liveTracking && selectedAgent) {
      interval = setInterval(() => {
        loadLocations();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [liveTracking, selectedAgent]);

  const loadAgents = async () => {
    try {
      const data = await agentTerrainApi.getAllList();
      const actifs = (data || []).filter((agent: Agent) => agent.statut === StatutUser.ACTIVE);
      setAgents(actifs);
      if (actifs.length > 0 && !selectedAgent) {
        setSelectedAgent(actifs[0].id);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const loadLocations = async () => {
    try {
      setLoading(true);
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const response = await fetch(`/api/agent-geolocations?agent_id=${selectedAgent}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
      if (response.ok) {
        const data = await response.json();
        setLocations(data || []);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDistance = (locations: GeoLocation[]) => {
    if (locations.length < 2) return 0;
    let totalDistance = 0;
    for (let i = 0; i < locations.length - 1; i++) {
      const lat1 = locations[i].latitude;
      const lon1 = locations[i].longitude;
      const lat2 = locations[i + 1].latitude;
      const lon2 = locations[i + 1].longitude;
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDistance += R * c;
    }
    return totalDistance;
  };

  const distance = calculateDistance(locations);
  const checkIns = locations.filter(l => l.activity_type === 'Check-in').length;
  const visites = locations.filter(l => l.activity_type === 'Visite').length;

  // Pagination Logic
  const totalPages = Math.ceil(locations.length / ITEMS_PER_PAGE);
  const paginatedLocations = locations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-3">
      {/* Stats Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<Navigation size={14} />} label="Distance" value={`${distance.toFixed(1)} km`} color="blue" />
        <StatCard icon={<MapPin size={14} />} label="Check-ins" value={checkIns.toString()} color="green" />
        <StatCard icon={<Users size={14} />} label="Visites" value={visites.toString()} color="emerald" />
        <StatCard icon={<Clock size={14} />} label="Points GPS" value={locations.length.toString()} color="cyan" />
      </div>

      {/* Controls Compact */}
      <div className="flex flex-col sm:flex-row gap-2 p-2 bg-surface-base/50 rounded-xl border border-edge">
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

        <button
          onClick={() => setLiveTracking(!liveTracking)}
          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            liveTracking
              ? 'bg-status-success hover:bg-status-success text-white shadow-lg shadow-status-success/30'
              : 'bg-surface hover:bg-surface-elevated text-content-secondary border border-edge'
          }`}
        >
          {liveTracking ? '● En Direct' : 'Activer Suivi'}
        </button>
      </div>

      {/* Locations List */}
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between bg-surface-base/30">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <Navigation size={16} className="text-status-info" />
            Historique des Positions
          </h3>
          <span className="text-[10px] text-content-muted font-medium">{locations.length} points</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" /></div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <MapPin size={32} className="mx-auto mb-2 text-content-muted" />
            <p className="text-sm text-content-muted">Aucune position enregistrée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-base/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase">Heure</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase hidden sm:table-cell">Lat</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase hidden sm:table-cell">Lng</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-content-muted uppercase hidden md:table-cell">Précision</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-content-muted uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/50">
                {paginatedLocations.map((location) => (
                  <tr 
                    key={location.id} 
                    className="hover:bg-surface-elevated/30 transition cursor-pointer group"
                    onClick={() => setSelectedLocation(location)}
                  >
                    <td className="px-3 py-2 text-xs text-content-primary font-medium">
                      {new Date(location.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        location.activity_type === 'Check-in' ? 'bg-status-success-bg text-status-success' :
                        location.activity_type === 'Visite' ? 'bg-status-info-bg text-status-info' :
                        location.activity_type === 'Check-out' ? 'bg-status-warning-bg text-status-warning' :
                        'bg-surface-subtle/40 text-content-muted'
                      }`}>
                        {location.activity_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-content-muted font-mono hidden sm:table-cell">{location.latitude.toFixed(4)}</td>
                    <td className="px-3 py-2 text-xs text-content-muted font-mono hidden sm:table-cell">{location.longitude.toFixed(4)}</td>
                    <td className="px-3 py-2 text-xs text-content-muted hidden md:table-cell">±{location.accuracy.toFixed(0)}m</td>
                    <td className="px-3 py-2 text-right">
                      <Eye size={14} className="text-content-muted group-hover:text-accent inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-edge-subtle bg-surface-base/20">
            <span className="text-[10px] text-content-muted">Page {currentPage} sur {totalPages}</span>
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
                {/* Type Badge */}
                <div className="flex justify-center">
                  <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase ${
                    selectedLocation.activity_type === 'Check-in' ? 'bg-status-success-bg text-status-success border border-status-success/30' :
                    selectedLocation.activity_type === 'Visite' ? 'bg-status-info-bg text-status-info border border-status-info/30' :
                    selectedLocation.activity_type === 'Check-out' ? 'bg-status-warning-bg text-status-warning border border-status-warning/30' :
                    'bg-surface-subtle/40 text-content-muted border border-edge-strong/30'
                  }`}>
                    {selectedLocation.activity_type}
                  </span>
                </div>

                {/* Coordinates Card */}
                <div className="bg-surface-base border border-edge rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                    <Navigation size={12} />
                    Coordonnées GPS
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Latitude" value={selectedLocation.latitude.toFixed(6)} />
                    <InfoItem label="Longitude" value={selectedLocation.longitude.toFixed(6)} />
                  </div>
                  <InfoItem label="Précision" value={`± ${selectedLocation.accuracy.toFixed(1)} mètres`} />
                </div>

                {/* Meta Info */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Heure" value={new Date(selectedLocation.timestamp).toLocaleTimeString('fr-FR')} />
                  <InfoItem label="Date" value={new Date(selectedLocation.timestamp).toLocaleDateString('fr-FR')} />
                </div>

                {/* Open in Maps */}
                <a
                  href={`https://www.google.com/maps?q=${selectedLocation.latitude},${selectedLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 bg-status-info hover:bg-status-info text-white rounded-xl font-bold text-sm text-center transition shadow-lg shadow-status-info/20"
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
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
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

function InfoItem({ label, value }: { label: string, value: string }) {
    return (
        <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
            <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5">{label}</div>
            <div className="text-sm font-medium text-content-secondary font-mono">{value}</div>
        </div>
    );
}
