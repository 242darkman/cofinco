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
      <div className="flex flex-col sm:flex-row gap-2 p-2 bg-slate-900/50 rounded-xl border border-slate-800">
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:ring-1 focus:ring-cyan-500"
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
          className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
        />

        <button
          onClick={() => setLiveTracking(!liveTracking)}
          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
            liveTracking
              ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
        >
          {liveTracking ? '● En Direct' : 'Activer Suivi'}
        </button>
      </div>

      {/* Locations List */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/30">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Navigation size={16} className="text-blue-400" />
            Historique des Positions
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">{locations.length} points</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500" /></div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <MapPin size={32} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm text-slate-400">Aucune position enregistrée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Heure</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase hidden sm:table-cell">Lat</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase hidden sm:table-cell">Lng</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Précision</th>
                  <th className="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {paginatedLocations.map((location) => (
                  <tr 
                    key={location.id} 
                    className="hover:bg-slate-700/30 transition cursor-pointer group"
                    onClick={() => setSelectedLocation(location)}
                  >
                    <td className="px-3 py-2 text-xs text-white font-medium">
                      {new Date(location.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        location.activity_type === 'Check-in' ? 'bg-green-500/20 text-green-400' :
                        location.activity_type === 'Visite' ? 'bg-blue-500/20 text-blue-400' :
                        location.activity_type === 'Check-out' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {location.activity_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400 font-mono hidden sm:table-cell">{location.latitude.toFixed(4)}</td>
                    <td className="px-3 py-2 text-xs text-slate-400 font-mono hidden sm:table-cell">{location.longitude.toFixed(4)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 hidden md:table-cell">±{location.accuracy.toFixed(0)}m</td>
                    <td className="px-3 py-2 text-right">
                      <Eye size={14} className="text-slate-600 group-hover:text-cyan-400 inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50 bg-slate-900/20">
            <span className="text-[10px] text-slate-500">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedLocation} onOpenChange={(open) => !open && setSelectedLocation(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
          {selectedLocation && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-white flex items-center gap-2">
                  <MapPin size={16} className="text-cyan-400" />
                  Détail Position
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  {new Date(selectedLocation.timestamp).toLocaleString('fr-FR')}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Type Badge */}
                <div className="flex justify-center">
                  <span className={`px-4 py-2 rounded-full text-sm font-bold uppercase ${
                    selectedLocation.activity_type === 'Check-in' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    selectedLocation.activity_type === 'Visite' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    selectedLocation.activity_type === 'Check-out' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {selectedLocation.activity_type}
                  </span>
                </div>

                {/* Coordinates Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
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
                  className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm text-center transition shadow-lg shadow-blue-900/20"
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
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400',
        green: 'from-green-500/20 to-green-600/5 border-green-500/20 text-green-400',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
        cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20 text-cyan-400',
    };
    
    return (
        <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
            </div>
            <div className="text-lg font-bold text-white truncate">{value}</div>
            <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
        </div>
    );
}

function InfoItem({ label, value }: { label: string, value: string }) {
    return (
        <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{label}</div>
            <div className="text-sm font-medium text-slate-200 font-mono">{value}</div>
        </div>
    );
}
