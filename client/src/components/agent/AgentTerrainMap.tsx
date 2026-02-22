import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Users, Navigation, RefreshCw, Crosshair, Filter, Clock, Activity, Layers } from 'lucide-react';
import SatelliteMap from '../maps/SatelliteMap';
import useGeolocation from '../../hooks/useGeolocation';
import { requestAllPages } from '../../lib/api-client';
import { Card, Button, Badge } from '../ui';
import type { ClientWithIdentity } from '@shared/schema';
import { StatutUser } from '@shared/enum/status-constants';

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

export default function AgentTerrainMap() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [clients, setClients] = useState<ClientWithIdentity[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAgents, setShowAgents] = useState(true);
  const [showClients, setShowClients] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const { latitude, longitude, accuracy, getCurrentPosition, cancelCapture } = useGeolocation({
    desiredAccuracy: 30,
    maxWait: 30000,
  });

  // Toggle tracking with manual polling
  const toggleTracking = () => {
    if (trackingEnabled) {
      cancelCapture();
      setTrackingEnabled(false);
    } else {
      getCurrentPosition();
      setTrackingEnabled(true);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, clientsRes, visitesRes] = await Promise.all([
        fetch('/api/agent-locations/latest', { credentials: 'include' }),
        requestAllPages<ClientWithIdentity>('/clients/with-location'),
        fetch('/api/visites-terrain?per_page=200', { credentials: 'include' }),
      ]);

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(Array.isArray(agentsData) ? agentsData : []);
      }

      setClients(Array.isArray(clientsRes) ? clientsRes : []);

      if (visitesRes.ok) {
        const visitesData = await visitesRes.json();
        const rawVisites = Array.isArray(visitesData) ? visitesData : (visitesData.data || []);
        setVisits(rawVisites.filter((v: any) => v.latitude && v.longitude).map((v: any) => ({
          id: v.id,
          clientNom: v.clientNom || 'Client',
          latitude: Number(v.latitude),
          longitude: Number(v.longitude),
          statut: v.statut || v.status || 'Effectuée',
          dateVisite: v.dateVisite || v.createdAt || '',
        })));
      }

      setLastUpdate(new Date());
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLocationUpdate = useCallback(async (lat: number, lng: number) => {
    if (!trackingEnabled) return;
    
    try {
      await fetch('/api/agent-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          source: 'gps',
        }),
      });
    } catch (error) {
    }
  }, [trackingEnabled, accuracy]);



  return (
    <div className="h-[600px] flex flex-col space-y-4">
       <Card padding="none" className="bg-surface-base border-card-border overflow-hidden flex flex-col h-full">
        {/* Header Section */}
        <div className="p-4 border-b border-edge bg-surface-base">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-primary rounded-xl shadow-lg shadow-brand-primary/20 shrink-0">
                <Navigation className="w-6 h-6 text-content-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-content-primary leading-tight">Carte Satellite GPS</h2>
                <div className="flex items-center gap-2 mt-0.5">
                   <p className="text-xs text-content-muted">Suivi temps réel</p>
                   {lastUpdate && (
                      <span className="text-[10px] bg-surface-elevated px-1.5 py-0.5 rounded text-content-secondary flex items-center gap-1">
                         <Clock size={10} /> {lastUpdate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                      </span>
                   )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                onClick={toggleTracking}
                variant={trackingEnabled ? 'success' : 'secondary'}
                className={`flex-1 sm:flex-none ${trackingEnabled ? 'animate-pulse' : ''}`}
                icon={Activity}
              >
                {trackingEnabled ? 'Tracking actif' : 'Activer tracking'}
              </Button>

              <Button
                size="sm"
                onClick={fetchData}
                variant="secondary"
                icon={RefreshCw}
                isLoading={loading}
                className="shrink-0"
              >
                Act.
              </Button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-edge overflow-x-auto pb-1 no-scrollbar">
            <div className="flex items-center gap-1.5 text-xs text-content-muted shrink-0 mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtres:</span>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer bg-surface-elevated px-2.5 py-1.5 rounded-lg border border-edge hover:bg-surface-elevated/80 transition-colors shrink-0">
              <input
                type="checkbox"
                checked={showAgents}
                onChange={(e) => setShowAgents(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-edge-strong bg-surface-elevated text-status-success focus:ring-status-success focus:ring-offset-0"
              />
              <span className="w-2 h-2 rounded-full bg-status-success shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
              <span className="text-xs font-medium text-content-secondary">Agents ({agents.length})</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer bg-surface-elevated px-2.5 py-1.5 rounded-lg border border-edge hover:bg-surface-elevated/80 transition-colors shrink-0">
              <input
                type="checkbox"
                checked={showClients}
                onChange={(e) => setShowClients(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-edge-strong bg-surface-elevated text-brand-primary focus:ring-brand-primary focus:ring-offset-0"
              />
              <span className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span>
              <span className="text-xs font-medium text-content-secondary">Clients ({clients.length})</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer bg-surface-elevated px-2.5 py-1.5 rounded-lg border border-edge hover:bg-surface-elevated/80 transition-colors shrink-0">
              <input
                type="checkbox"
                checked={showVisits}
                onChange={(e) => setShowVisits(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-edge-strong bg-surface-elevated text-brand-secondary focus:ring-brand-secondary focus:ring-offset-0"
              />
              <span className="w-2 h-2 rounded-full bg-brand-secondary shadow-[0_0_8px_rgba(249,115,22,0.4)]"></span>
              <span className="text-xs font-medium text-content-secondary">Visites ({visits.length})</span>
            </label>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-surface-base overflow-hidden">
          <SatelliteMap
            agents={showAgents ? agents : []}
            clients={showClients ? clients : []}
            visits={showVisits ? visits : []}
            showMyLocation={true}
            onLocationUpdate={handleLocationUpdate}
            onAgentClick={(agent) => setSelectedAgent(agent)}
            className="h-full w-full"
          />

          {/* Info Overlay / Legend (Mobile Compact) */}
          <div className="absolute top-4 right-4 bg-surface-base/90 backdrop-blur-md p-2 rounded-lg border border-accent/30 shadow-lg z-[500] hidden sm:block">
             <div className="flex items-center gap-2 text-xs font-medium text-accent">
                <Layers size={14} />
                <span>Mode Satellite</span>
             </div>
          </div>

          {/* Selected Agent Popup */}
          {selectedAgent && (
            <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 z-[1000] animate-in slide-in-from-bottom duration-300">
              <Card padding="sm" className="bg-surface-base/95 backdrop-blur-md border-card-border shadow-xl">
                 <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-brand-primary to-accent rounded-full flex items-center justify-center shadow-lg shadow-brand-primary/20">
                      <Users className="w-5 h-5 text-content-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-content-primary">
                        {selectedAgent.prenom} {selectedAgent.nom}
                      </h4>
                      <Badge value={selectedAgent.statut || StatutUser.ACTIVE} size="sm" variant={(selectedAgent.statut === StatutUser.ACTIVE) ? 'success' : 'neutral'} />
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedAgent(null)}
                    className="p-1 -mr-2 -mt-2 text-content-muted hover:text-content-primary transition-colors"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-2 text-xs sm:text-sm mt-3 pt-3 border-t border-edge">
                  <div className="flex items-center justify-between">
                     <span className="text-content-muted flex items-center gap-1"><MapPin size={12}/> Position</span>
                     <span className="font-mono text-content-primary bg-surface-elevated px-1.5 py-0.5 rounded">
                        {selectedAgent.latitude.toFixed(4)}, {selectedAgent.longitude.toFixed(4)}
                     </span>
                  </div>
                  {selectedAgent.lastSeenAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-content-muted flex items-center gap-1"><Clock size={12}/> Vu à</span>
                      <span className="text-content-primary">
                        {new Date(selectedAgent.lastSeenAt).toLocaleTimeString('fr-FR')}
                      </span>
                    </div>
                  )}
                  <div className="pt-2">
                     <Button size="sm" variant="primary" fullWidth icon={Navigation}>
                        Itinéraire
                     </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
