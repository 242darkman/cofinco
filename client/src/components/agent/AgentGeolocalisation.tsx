import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Map as MapIcon, Calendar, Clock, Activity, TrendingUp, Users } from 'lucide-react';

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
      const response = await fetch('/api/agents-terrain?statut=Actif');
      if (response.ok) {
        const data = await response.json();
        setAgents(data || []);
        if (data && data.length > 0 && !selectedAgent) {
          setSelectedAgent(data[0].id);
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const loadLocations = async () => {
    try {
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      const response = await fetch(`/api/agent-geolocations?agent_id=${selectedAgent}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`);
      if (response.ok) {
        const data = await response.json();
        setLocations(data || []);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTestLocation = async () => {
    if (!selectedAgent) return;

    const testLat = -4.3217 + (Math.random() - 0.5) * 0.1;
    const testLng = 15.3125 + (Math.random() - 0.5) * 0.1;

    try {
      const response = await fetch('/api/agent-geolocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgent,
          latitude: testLat,
          longitude: testLng,
          accuracy: Math.random() * 20 + 5,
          activity_type: ['Check-in', 'Visite', 'Déplacement', 'Check-out'][Math.floor(Math.random() * 4)],
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error('Erreur lors de l\'ajout');
      loadLocations();
    } catch (error: any) {
      alert('Erreur: ' + error.error);
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
  const lastLocation = locations[0];

  const agent = agents.find(a => a.id === selectedAgent);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Navigation size={24} />
            <Activity size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{distance.toFixed(1)} km</div>
          <div className="text-blue-100 text-sm">Distance Parcourue</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <MapPin size={24} />
            <TrendingUp size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{checkIns}</div>
          <div className="text-green-100 text-sm">Check-ins</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Users size={24} />
            <Calendar size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{visites}</div>
          <div className="text-emerald-100 text-sm">Visites</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock size={24} />
            <Activity size={20} />
          </div>
          <div className="text-3xl font-bold mb-1">{locations.length}</div>
          <div className="text-emerald-100 text-sm">Points GPS</div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-300 mb-2">Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            >
              <option value="">Sélectionner un agent</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.nom} {agent.prenom} - {agent.zone_affectation}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => setLiveTracking(!liveTracking)}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                liveTracking
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
            >
              {liveTracking ? 'Suivi En Direct' : 'Activer Suivi'}
            </button>

            <button
              onClick={addTestLocation}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Ajouter Point Test
            </button>
          </div>
        </div>

        {agent && lastLocation && (
          <div className="bg-slate-700/50 rounded-lg p-4 mb-6 border border-slate-600">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <MapPin size={18} className="text-blue-400" />
                  Dernière Position
                </h4>
                <p className="text-slate-300 text-sm mb-1">
                  <span className="text-slate-400">Latitude:</span> {lastLocation.latitude.toFixed(6)}
                </p>
                <p className="text-slate-300 text-sm mb-1">
                  <span className="text-slate-400">Longitude:</span> {lastLocation.longitude.toFixed(6)}
                </p>
                <p className="text-slate-300 text-sm">
                  <span className="text-slate-400">Précision:</span> ±{lastLocation.accuracy.toFixed(1)}m
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <Activity size={18} className="text-green-400" />
                  Activité Actuelle
                </h4>
                <p className="text-slate-300 text-sm mb-1">
                  <span className="text-slate-400">Type:</span>{' '}
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    lastLocation.activity_type === 'Check-in' ? 'bg-green-500/20 text-green-400' :
                    lastLocation.activity_type === 'Visite' ? 'bg-blue-500/20 text-blue-400' :
                    lastLocation.activity_type === 'Check-out' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {lastLocation.activity_type}
                  </span>
                </p>
                <p className="text-slate-300 text-sm">
                  <span className="text-slate-400">Horodatage:</span>{' '}
                  {new Date(lastLocation.timestamp).toLocaleString('fr-FR')}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-900/50 rounded-lg p-8 border border-slate-600 text-center">
          <MapIcon size={64} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Carte Interactive</h3>
          <p className="text-slate-400 mb-4">
            La carte interactive avec Leaflet/Mapbox sera intégrée ici
          </p>
          <div className="bg-slate-700/50 rounded p-3 text-sm text-slate-300 text-left max-w-md mx-auto">
            <p className="font-semibold mb-2">Fonctionnalités prévues :</p>
            <ul className="space-y-1">
              <li>• Carte interactive avec marqueurs</li>
              <li>• Traçage des itinéraires</li>
              <li>• Zones géographiques</li>
              <li>• Clusters de points</li>
              <li>• Export KML/GPX</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Navigation size={20} className="text-blue-400" />
            Historique des Positions ({locations.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Heure</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Latitude</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Longitude</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Précision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {locations.map((location) => (
                <tr key={location.id} className="hover:bg-slate-700/50 transition">
                  <td className="px-6 py-4 text-white">
                    {new Date(location.timestamp).toLocaleTimeString('fr-FR')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      location.activity_type === 'Check-in' ? 'bg-green-500/20 text-green-400' :
                      location.activity_type === 'Visite' ? 'bg-blue-500/20 text-blue-400' :
                      location.activity_type === 'Check-out' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {location.activity_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-mono text-sm">
                    {location.latitude.toFixed(6)}
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-mono text-sm">
                    {location.longitude.toFixed(6)}
                  </td>
                  <td className="px-6 py-4 text-slate-300">
                    ±{location.accuracy.toFixed(1)}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {locations.length === 0 && (
            <div className="text-center py-12">
              <MapPin size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400">Aucune position enregistrée pour cette date</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
