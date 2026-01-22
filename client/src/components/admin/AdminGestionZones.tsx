import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { MapPin, Save, X, Circle, Edit2, AlertCircle, CheckCircle, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Button, SearchInput, Badge, FormField, LoadingSpinner, IconButton } from '../ui';
import AdminGestionZonesMap from '../maps/AdminGestionZonesMap';
import { usePermissions } from '../auth/ProtectedFeature';
import { agentTerrainApi } from '../../lib/api-client';
import { StatutClient } from '@shared/enum/status-constants';

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  zoneAffectation: string;
  zoneLatitude: string | null;
  zoneLongitude: string | null;
  zoneRayon: string | null;
  statut: string;
}

interface ZoneFormData {
  latitude: string;
  longitude: string;
  rayon: string;
  zoneAffectation: string;
}

const zoneColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function AdminGestionZones() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canEditZones = hasPermission('terrain', 'edit') || hasPermission('terrain', 'manage');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyWithZone, setShowOnlyWithZone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5; // Fixed page size for agents list
  
  const [formData, setFormData] = useState<ZoneFormData>({
    latitude: '',
    longitude: '',
    rayon: '2',
    zoneAffectation: ''
  });

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await agentTerrainApi.getAllList();
      setAgents(data || []);
    } catch (error) {
      console.error('Erreur chargement agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (editingAgent) {
      setFormData(prev => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6)
      }));
    }
  };

  const startEditing = (agent: Agent) => {
    setEditingAgent(agent);
    setSelectedAgent(null);
    setFormData({
      latitude: agent.zoneLatitude || '',
      longitude: agent.zoneLongitude || '',
      rayon: agent.zoneRayon || '2',
      zoneAffectation: agent.zoneAffectation || ''
    });
  };

  const cancelEditing = () => {
    setEditingAgent(null);
    setFormData({ latitude: '', longitude: '', rayon: '2', zoneAffectation: '' });
  };

  const saveZone = async () => {
    if (!editingAgent) return;
    
    if (!formData.latitude || !formData.longitude) {
      setMessage({ type: 'error', text: 'Veuillez cliquer sur la carte pour définir la position' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/agents-terrain/${editingAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          zoneLatitude: formData.latitude,
          zoneLongitude: formData.longitude,
          zoneRayon: formData.rayon,
          zoneAffectation: formData.zoneAffectation
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Zone mise à jour avec succès' });
        await loadAgents();
        cancelEditing();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Erreur lors de la mise à jour' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur de connexion' });
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = agents.filter(agent => {
    const matchSearch = 
      agent.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.zoneAffectation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchZone = !showOnlyWithZone || (agent.zoneLatitude && agent.zoneLongitude);
    return matchSearch && matchZone && agent.statut === StatutClient.ACTIVE;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredAgents.length / pageSize);
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgents.slice(start, start + pageSize);
  }, [filteredAgents, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showOnlyWithZone]);

  const agentsWithZones = agents.filter(a => a.zoneLatitude && a.zoneLongitude && a.statut === StatutClient.ACTIVE);
  const activeAgentsCount = agents.filter(a => a.statut === StatutClient.ACTIVE).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Compact mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-blue-500/20 rounded-xl">
            <MapPin className="text-blue-400" size={22} />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-white">
              Gestion des Zones d'Affectation
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Définissez les zones géographiques d'intervention des agents terrain
            </p>
          </div>
        </div>
        <Card className="bg-slate-800 border-slate-700 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2">
          <Users size={16} className="text-slate-400" />
          <span className="text-xs sm:text-sm text-slate-400">Agents avec zone:</span>
          <span className="text-white font-bold text-sm sm:text-base">{agentsWithZones.length}/{activeAgentsCount}</span>
        </Card>
      </div>

      {/* Message Alert */}
      {message && (
        <Card className={`p-3 flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-500/20 border-green-500/30' : 'bg-red-500/20 border-red-500/30'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle size={18} className="text-green-400" />
          ) : (
            <AlertCircle size={18} className="text-red-400" />
          )}
          <span className={`text-sm flex-1 ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </Card>
      )}

      {/* Main Layout - Stack on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Agents List */}
        <div className="lg:col-span-1 space-y-3 sm:space-y-4">
          <Card className="bg-slate-900 border-slate-800 p-3 sm:p-4">
            {/* Search */}
            <SearchInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un agent..."
              className="mb-3"
              data-testid="input-search-agent"
            />

            {/* Filter Toggle */}
            <label className="flex items-center gap-2 text-slate-300 text-xs sm:text-sm mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyWithZone}
                onChange={(e) => setShowOnlyWithZone(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500"
              />
              Afficher uniquement les agents avec zone
            </label>

            {/* Agent List */}
            <div className="space-y-2">
              {paginatedAgents.map((agent, index) => {
                // Calculate actual index for consistent color mapping
                const actualIndex = filteredAgents.findIndex(a => a.id === agent.id);
                return (
                  <div
                    key={agent.id}
                    className={`p-2.5 sm:p-3 rounded-lg cursor-pointer transition-all ${
                      selectedAgent?.id === agent.id || editingAgent?.id === agent.id
                        ? 'bg-blue-600/30 border border-blue-500'
                        : 'bg-slate-800 hover:bg-slate-700 border border-transparent'
                    }`}
                    onClick={() => !editingAgent && setSelectedAgent(agent)}
                    data-testid={`agent-zone-item-${agent.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-medium text-sm truncate">
                          {agent.prenom} {agent.nom}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{agent.zoneAffectation}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {agent.zoneLatitude && agent.zoneLongitude ? (
                          <span 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: zoneColors[actualIndex % zoneColors.length] }}
                          />
                        ) : (
                          <AlertCircle size={14} className="text-amber-400" />
                        )}
                        {canEditZones && (
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditing(agent); }}
                            className="p-1 text-slate-400 hover:text-blue-400 transition"
                            data-testid={`button-edit-zone-${agent.id}`}
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {filteredAgents.length === 0 && (
                <div className="text-center py-4 text-slate-500 text-sm">
                  Aucun agent trouvé
                </div>
              )}
            </div>

            {/* Pagination Controls - Mobile First */}
            {totalPages > 1 && (
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredAgents.length)} / {filteredAgents.length}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    icon={ChevronLeft}
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-7 h-7 text-slate-400 disabled:opacity-30"
                    aria-label="Page précédente"
                  />
                  <span className="text-xs text-white font-medium px-2">
                    {currentPage}/{totalPages}
                  </span>
                  <IconButton
                    icon={ChevronRight}
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-7 h-7 text-slate-400 disabled:opacity-30"
                    aria-label="Page suivante"
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Edit Zone Form */}
          {editingAgent && (
            <Card className="bg-slate-900 border-blue-500 p-3 sm:p-4">
              <h3 className="font-bold text-white text-sm sm:text-base mb-3 flex items-center gap-2">
                <Circle size={16} className="text-blue-400" />
                Zone de {editingAgent.prenom} {editingAgent.nom}
              </h3>

              <div className="space-y-3">
                <FormField
                  label="Nom de la zone"
                  name="zoneAffectation"
                  value={formData.zoneAffectation}
                  onChange={(e) => setFormData(prev => ({ ...prev, zoneAffectation: e.target.value }))}
                  placeholder="Ex: Bacongo, Poto-Poto..."
                  data-testid="input-zone-name"
                />

                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    label="Latitude"
                    name="latitude"
                    value={formData.latitude}
                    onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                    placeholder="Cliquez sur la carte"
                    data-testid="input-latitude"
                  />
                  <FormField
                    label="Longitude"
                    name="longitude"
                    value={formData.longitude}
                    onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                    placeholder="Cliquez sur la carte"
                    data-testid="input-longitude"
                  />
                </div>

                <FormField
                  label="Rayon de la zone (km)"
                  name="rayon"
                  type="number"
                  value={formData.rayon}
                  onChange={(e) => setFormData(prev => ({ ...prev, rayon: e.target.value }))}
                  data-testid="input-rayon"
                />

                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <MapPin size={12} />
                  Cliquez sur la carte pour définir le centre de la zone
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    icon={X}
                    onClick={cancelEditing}
                    className="flex-1 justify-center"
                    data-testid="button-cancel-zone"
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    icon={Save}
                    onClick={saveZone}
                    isLoading={saving}
                    className="flex-1 justify-center"
                    data-testid="button-save-zone"
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Selected Agent Info */}
          {selectedAgent && !editingAgent && (
            <Card className="bg-slate-900 border-slate-800 p-3 sm:p-4">
              <h3 className="font-bold text-white text-sm sm:text-base mb-3">
                {selectedAgent.prenom} {selectedAgent.nom}
              </h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Zone:</span>
                  <span className="text-white">{selectedAgent.zoneAffectation || 'Non définie'}</span>
                </div>
                {selectedAgent.zoneLatitude && selectedAgent.zoneLongitude && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Position:</span>
                      <span className="text-white text-xs">
                        {parseFloat(selectedAgent.zoneLatitude).toFixed(4)}, {parseFloat(selectedAgent.zoneLongitude).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Rayon:</span>
                      <span className="text-white">{selectedAgent.zoneRayon || '2'} km</span>
                    </div>
                  </>
                )}
              </div>
              {canEditZones && (
                <Button
                  variant="primary"
                  icon={Edit2}
                  onClick={() => startEditing(selectedAgent)}
                  fullWidth
                  className="mt-3"
                  data-testid="button-modify-zone"
                >
                  Modifier la zone
                </Button>
              )}
            </Card>
          )}
        </div>

        {/* Map Section */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
            {/* Map Header - Minimal */}
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-white">Carte des Zones</span>
              {agentsWithZones.length > 0 && (
                <span className="text-[10px] sm:text-xs text-slate-400">
                  {agentsWithZones.length} zone{agentsWithZones.length > 1 ? 's' : ''} active{agentsWithZones.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            
            {/* Map Container */}
            <div className="h-[280px] sm:h-[400px] lg:h-[500px] relative">
              <Suspense fallback={
                <div className="h-full flex items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              }>
                <AdminGestionZonesMap
                  agentsWithZones={agentsWithZones}
                  selectedAgentId={selectedAgent?.id || null}
                  editingAgentId={editingAgent?.id || null}
                  editingPosition={editingAgent ? formData : null}
                  onMapClick={handleMapClick}
                />
              </Suspense>
              
              {/* Legend Overlay - Bottom of map */}
              {agentsWithZones.length > 0 && (
                <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur-sm rounded-lg p-2 border border-slate-700">
                  <div className="flex flex-wrap gap-1.5">
                    {agentsWithZones.slice(0, 6).map((agent, index) => (
                      <button 
                        key={agent.id}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition ${
                          selectedAgent?.id === agent.id 
                            ? 'bg-blue-500/30 text-white' 
                            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                        }`}
                        onClick={() => setSelectedAgent(agent)}
                      >
                        <span 
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: zoneColors[index % zoneColors.length] }}
                        />
                        <span className="truncate max-w-[60px]">{agent.prenom}</span>
                      </button>
                    ))}
                    {agentsWithZones.length > 6 && (
                      <span className="text-[10px] text-slate-400 px-1.5 py-0.5">
                        +{agentsWithZones.length - 6}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
