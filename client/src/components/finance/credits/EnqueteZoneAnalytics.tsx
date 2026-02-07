/**
 * EnqueteZoneAnalytics - Dashboard d'analyse géographique des enquêtes
 *
 * Affiche:
 * - Carte avec toutes les enquêtes positionnées
 * - Clusters par densité
 * - Statistiques par zone/agence
 * - Filtres par période et statut
 */

import React, { useState, useMemo, Suspense } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin, Filter, Calendar, Building, Users, TrendingUp,
  AlertTriangle, CheckCircle, Clock, BarChart3, Activity,
  ChevronDown, RefreshCw
} from 'lucide-react';
import { Card, Badge, Button, StatCard } from '../../ui';
import { formatMoney } from '../../../lib/format';
import type { EnqueteCredit } from '../../../hooks/credits/useEnquetes';

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface EnqueteZoneAnalyticsProps {
  enquetes: EnqueteCredit[];
  loading?: boolean;
  onRefresh?: () => void;
}

interface ZoneStats {
  name: string;
  count: number;
  totalAmount: number;
  avgAmount: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  center?: [number, number];
}

// Icônes par statut
const getStatusIcon = (statut: string) => {
  const icons: Record<string, L.DivIcon> = {
    APPROVED: new L.DivIcon({
      className: 'custom-div-icon',
      html: `<div style="background: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    REJECTED: new L.DivIcon({
      className: 'custom-div-icon',
      html: `<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    PENDING: new L.DivIcon({
      className: 'custom-div-icon',
      html: `<div style="background: #f59e0b; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    IN_PROGRESS: new L.DivIcon({
      className: 'custom-div-icon',
      html: `<div style="background: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
  };
  return icons[statut] || icons.PENDING;
};

// Calculer les stats par zone (basé sur les coordonnées)
function calculateZoneStats(enquetes: EnqueteCredit[]): ZoneStats[] {
  // Grouper par "zone" approximative (arrondi des coordonnées)
  const zoneMap = new Map<string, EnqueteCredit[]>();

  enquetes.forEach(e => {
    if (e.geoLatitude && e.geoLongitude) {
      const lat = parseFloat(String(e.geoLatitude));
      const lng = parseFloat(String(e.geoLongitude));
      // Arrondir pour créer des zones (environ 1km²)
      const zoneKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
      if (!zoneMap.has(zoneKey)) {
        zoneMap.set(zoneKey, []);
      }
      zoneMap.get(zoneKey)!.push(e);
    }
  });

  return Array.from(zoneMap.entries())
    .map(([key, items]) => {
      const [latStr, lngStr] = key.split('_');
      const amounts = items.map(i => i.montantDemande || 0);
      const totalAmount = amounts.reduce((a, b) => a + b, 0);

      return {
        name: `Zone ${latStr}, ${lngStr}`,
        count: items.length,
        totalAmount,
        avgAmount: totalAmount / items.length,
        approvedCount: items.filter(i => i.statut === 'APPROVED').length,
        rejectedCount: items.filter(i => i.statut === 'REJECTED').length,
        pendingCount: items.filter(i => ['PENDING', 'IN_PROGRESS'].includes(i.statut)).length,
        center: [parseFloat(latStr), parseFloat(lngStr)] as [number, number],
      };
    })
    .sort((a, b) => b.count - a.count);
}

// Composant pour ajuster la vue
function MapAutoFit({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  React.useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [map, positions]);

  return null;
}

export default function EnqueteZoneAnalytics({
  enquetes,
  loading = false,
  onRefresh
}: EnqueteZoneAnalyticsProps) {
  const [dateFilter, setDateFilter] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filtrer les enquêtes
  const filteredEnquetes = useMemo(() => {
    let filtered = enquetes.filter(e => e.geoLatitude && e.geoLongitude);

    // Filtre par date
    if (dateFilter !== 'all') {
      const days = dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = filtered.filter(e =>
        e.dateEnquete && new Date(e.dateEnquete) >= cutoff
      );
    }

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.statut === statusFilter);
    }

    return filtered;
  }, [enquetes, dateFilter, statusFilter]);

  // Calculer les positions pour la carte
  const positions = useMemo(() => {
    return filteredEnquetes
      .filter(e => e.geoLatitude && e.geoLongitude)
      .map(e => [
        parseFloat(String(e.geoLatitude)),
        parseFloat(String(e.geoLongitude))
      ] as [number, number]);
  }, [filteredEnquetes]);

  // Statistiques par zone
  const zoneStats = useMemo(() => calculateZoneStats(filteredEnquetes), [filteredEnquetes]);

  // Stats globales
  const globalStats = useMemo(() => {
    const withGeo = filteredEnquetes.filter(e => e.geoLatitude && e.geoLongitude);
    const totalAmount = filteredEnquetes.reduce((sum, e) => sum + (e.montantDemande || 0), 0);

    return {
      total: filteredEnquetes.length,
      withGeo: withGeo.length,
      withoutGeo: filteredEnquetes.length - withGeo.length,
      totalAmount,
      approved: filteredEnquetes.filter(e => e.statut === 'APPROVED').length,
      rejected: filteredEnquetes.filter(e => e.statut === 'REJECTED').length,
      pending: filteredEnquetes.filter(e => ['PENDING', 'IN_PROGRESS'].includes(e.statut)).length,
      zones: zoneStats.length,
    };
  }, [filteredEnquetes, zoneStats]);

  // Centre par défaut (Congo-Brazzaville)
  const defaultCenter: [number, number] = [-4.2634, 15.2429];
  const mapCenter = positions.length > 0
    ? [
        positions.reduce((sum, p) => sum + p[0], 0) / positions.length,
        positions.reduce((sum, p) => sum + p[1], 0) / positions.length
      ] as [number, number]
    : defaultCenter;

  return (
    <div className="space-y-2 h-[calc(100vh-220px)] flex flex-col">
      {/* Header avec filtres */}
      <div className="flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/20">
            <BarChart3 size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Analyse Géographique</h3>
            <p className="text-[10px] text-slate-400">{globalStats.withGeo} enquêtes localisées</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Filter */}
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(['7d', '30d', '90d', 'all'] as const).map(period => (
              <button
                key={period}
                onClick={() => setDateFilter(period)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  dateFilter === period
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {period === 'all' ? 'Tout' : period}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          {onRefresh && (
            <Button
              size="xs"
              variant="ghost"
              onClick={onRefresh}
              icon={RefreshCw}
              className={loading ? 'animate-spin' : ''}
            />
          )}

          {/* More Filters */}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setShowFilters(!showFilters)}
            icon={Filter}
          >
            Filtres
          </Button>
        </div>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-2 py-1 flex-shrink-0">
          <label className="text-[10px] text-slate-400">Statut:</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-700 border-slate-600 rounded px-2 py-0.5 text-[10px] text-white"
          >
            <option value="all">Tous</option>
            <option value="APPROVED">Approuvé</option>
            <option value="REJECTED">Rejeté</option>
            <option value="PENDING">En attente</option>
            <option value="IN_PROGRESS">En cours</option>
          </select>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2 flex-shrink-0">
        <MiniStatCard
          icon={<MapPin size={14} />}
          label="Enquêtes localisées"
          value={globalStats.withGeo}
          color="blue"
        />
        <MiniStatCard
          icon={<Activity size={14} />}
          label="Zones actives"
          value={globalStats.zones}
          color="purple"
        />
        <MiniStatCard
          icon={<CheckCircle size={14} />}
          label="Taux approbation"
          value={`${globalStats.total > 0 ? Math.round((globalStats.approved / globalStats.total) * 100) : 0}%`}
          color="emerald"
        />
        <MiniStatCard
          icon={<TrendingUp size={14} />}
          label="Volume total"
          value={formatMoney(globalStats.totalAmount)}
          color="amber"
        />
      </div>

      {/* Map + Zone List */}
      <div className="grid lg:grid-cols-3 gap-3 flex-1 min-h-0">
        {/* Map */}
        <Card variant="default" padding="none" className="lg:col-span-2 overflow-hidden">
          {positions.length > 0 ? (
            <MapContainer
              center={mapCenter}
              zoom={10}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapAutoFit positions={positions} />

              <MarkerClusterGroup
                chunkedLoading
                iconCreateFunction={(cluster: { getChildCount: () => number }) => {
                  const count = cluster.getChildCount();
                  const size = count < 10 ? 30 : count < 50 ? 40 : 50;
                  return L.divIcon({
                    html: `<div style="
                      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                      width: ${size}px;
                      height: ${size}px;
                      border-radius: 50%;
                      border: 3px solid white;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: white;
                      font-weight: bold;
                      font-size: ${size > 40 ? 14 : 12}px;
                    ">${count}</div>`,
                    className: 'custom-cluster-icon',
                    iconSize: L.point(size, size),
                  });
                }}
              >
                {filteredEnquetes.map(enquete => {
                  if (!enquete.geoLatitude || !enquete.geoLongitude) return null;
                  const lat = parseFloat(String(enquete.geoLatitude));
                  const lng = parseFloat(String(enquete.geoLongitude));

                  return (
                    <Marker
                      key={enquete.id}
                      position={[lat, lng]}
                      icon={getStatusIcon(enquete.statut)}
                    >
                      <Popup>
                        <div className="text-sm min-w-[180px]">
                          <div className="font-semibold text-gray-800 mb-1">
                            {enquete.clients?.nom} {enquete.clients?.prenom}
                          </div>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <div>Activité: {enquete.typeActivite}</div>
                            <div>Montant: {formatMoney(enquete.montantDemande)}</div>
                            <div className="flex items-center gap-1">
                              Statut:
                              <span className={`font-medium ${
                                enquete.statut === 'APPROVED' ? 'text-emerald-600' :
                                enquete.statut === 'REJECTED' ? 'text-red-600' :
                                'text-amber-600'
                              }`}>
                                {enquete.statut}
                              </span>
                            </div>
                            {enquete.dateEnquete && (
                              <div>Date: {new Date(enquete.dateEnquete).toLocaleDateString('fr-FR')}</div>
                            )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MarkerClusterGroup>
            </MapContainer>
          ) : (
            <div className="h-full min-h-[200px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <MapPin size={24} className="mx-auto mb-1.5 opacity-50" />
                <p className="text-xs">Aucune enquête avec géolocalisation</p>
              </div>
            </div>
          )}
        </Card>

        {/* Zone List */}
        <Card variant="default" padding="sm" className="overflow-auto">
          <h4 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
            <Building size={12} />
            Zones ({zoneStats.length})
          </h4>
          <div className="space-y-1.5">
            {zoneStats.slice(0, 8).map((zone, idx) => (
              <div
                key={idx}
                className="bg-slate-700/30 rounded p-1.5 hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-medium text-white truncate">{zone.name}</span>
                  <Badge value={zone.count} variant="info" size="sm" />
                </div>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-emerald-400">{zone.approvedCount} ✓</span>
                  <span className="text-red-400">{zone.rejectedCount} ✗</span>
                  <span className="text-amber-400">{zone.pendingCount} ⏳</span>
                </div>
              </div>
            ))}
            {zoneStats.length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-2">
                Aucune zone avec données
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Légende */}
      <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 flex-shrink-0 py-1">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Approuvé</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Rejeté</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>En attente</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>En cours</span>
        </div>
      </div>
    </div>
  );
}

// Mini stat card component
function MiniStatCard({
  icon,
  label,
  value,
  color
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: 'blue' | 'purple' | 'emerald' | 'amber';
}) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400',
    purple: 'bg-purple-500/10 text-purple-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
      <div className={`inline-flex p-1 rounded-md ${colorClasses[color]} mb-1`}>
        {icon}
      </div>
      <div className="text-base font-bold text-white">{value}</div>
      <div className="text-[9px] text-slate-400">{label}</div>
    </div>
  );
}
