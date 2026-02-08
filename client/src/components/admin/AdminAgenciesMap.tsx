/**
 * Admin Agencies Map Component
 * Interactive map view for agency locations
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import {
  Building2,
  MapPin,
  Phone,
  Users,
  Loader2,
  AlertTriangle,
  Navigation,
  ZoomIn,
  ZoomOut,
  UserCheck,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import {
  TypeAgence,
  TypeAgenceType,
  StatutAgence,
  StatutAgenceType,
  STATUT_AGENCE_LABELS,
} from '@shared/enum/status-constants';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Type labels for French UI
const TYPE_AGENCE_LABELS: Record<TypeAgenceType, string> = {
  [TypeAgence.MAIN]: 'Principale',
  [TypeAgence.SECONDARY]: 'Secondaire',
  [TypeAgence.KIOSK]: 'Kiosque',
};

// Type colors matching the legend
const TYPE_COLORS: Record<TypeAgenceType, string> = {
  [TypeAgence.MAIN]: '#6366f1', // indigo
  [TypeAgence.SECONDARY]: '#10b981', // emerald
  [TypeAgence.KIOSK]: '#f59e0b', // amber
};

export interface Agency {
  id: string;
  nom: string;
  codeAgence: string;
  typeAgence: TypeAgenceType;
  adresse?: string;
  ville?: string;
  region?: string;
  telephone?: string;
  latitude?: number;
  longitude?: number;
  statut: StatutAgenceType;
  nombreEmployes?: number;
  nombreClients?: number;
}

export interface AdminAgenciesMapProps {
  agencies: Agency[];
  loading?: boolean;
  selectedAgencyId?: string;
  height?: string;
  showMissingGpsWarning?: boolean;
}

// Custom marker icon based on agency type
const getAgencyIcon = (typeAgence: TypeAgenceType, isSelected: boolean) => {
  const color = TYPE_COLORS[typeAgence] || '#6b7280';
  const size = isSelected ? 40 : 32;

  return L.divIcon({
    className: 'custom-agency-marker',
    html: `
      <div style="
        background: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        ${isSelected ? 'animation: pulse 1.5s infinite;' : ''}
      ">
        <svg
          style="transform: rotate(45deg); width: ${size * 0.5}px; height: ${size * 0.5}px; color: white;"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/>
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

// Map controls component
function MapControls() {
  const map = useMap();

  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <button
        onClick={() => map.zoomIn()}
        className="p-2 bg-white rounded-lg shadow hover:bg-slate-100 transition"
        title="Zoom avant"
      >
        <ZoomIn size={20} className="text-slate-700" />
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="p-2 bg-white rounded-lg shadow hover:bg-slate-100 transition"
        title="Zoom arrière"
      >
        <ZoomOut size={20} className="text-slate-700" />
      </button>
      <button
        onClick={() => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
              map.setView([pos.coords.latitude, pos.coords.longitude], 14);
            });
          }
        }}
        className="p-2 bg-white rounded-lg shadow hover:bg-slate-100 transition"
        title="Ma position"
      >
        <Navigation size={20} className="text-slate-700" />
      </button>
    </div>
  );
}

// Fit bounds to markers - only on initial load
function FitBounds({ agencies }: { agencies: Agency[] }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (hasFitted.current) return;

    const validAgencies = agencies.filter((a) => {
      const lat = Number(a.latitude);
      const lng = Number(a.longitude);
      return !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
    });

    if (validAgencies.length > 0) {
      const bounds = L.latLngBounds(
        validAgencies.map((a) => [Number(a.latitude), Number(a.longitude)] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
      hasFitted.current = true;
    }
  }, [agencies, map]);

  return null;
}

export default function AdminAgenciesMap({
  agencies,
  loading = false,
  selectedAgencyId,
  height = '500px',
  showMissingGpsWarning = true,
}: AdminAgenciesMapProps) {
  // Default center (Congo)
  const defaultCenter: [number, number] = [-4.2634, 15.2429];
  const defaultZoom = 6;

  // Filter agencies with valid GPS coordinates
  const validAgencies = useMemo(
    () =>
      agencies.filter((a) => {
        const lat = Number(a.latitude);
        const lng = Number(a.longitude);
        return !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng);
      }),
    [agencies]
  );

  const missingGpsCount = agencies.length - validAgencies.length;

  // Calculate center based on agencies
  const center = useMemo((): [number, number] => {
    if (validAgencies.length === 0) return defaultCenter;

    const avgLat =
      validAgencies.reduce((sum, a) => sum + Number(a.latitude), 0) / validAgencies.length;
    const avgLng =
      validAgencies.reduce((sum, a) => sum + Number(a.longitude), 0) / validAgencies.length;

    if (isNaN(avgLat) || isNaN(avgLng)) return defaultCenter;

    return [avgLat, avgLng];
  }, [validAgencies]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-slate-800 rounded-xl"
        style={{ height }}
      >
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-400 mx-auto mb-3" size={40} />
          <p className="text-slate-400">Chargement de la carte...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700">
      {/* Missing GPS Warning */}
      {showMissingGpsWarning && missingGpsCount > 0 && (
        <div className="absolute top-4 left-4 z-[1000] bg-amber-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
          <AlertTriangle size={18} />
          <span>{missingGpsCount} agence(s) sans coordonnées GPS</span>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-sm p-3 rounded-lg">
        <p className="text-xs text-slate-400 mb-2 font-medium">Type d'agence</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[TypeAgence.MAIN] }}
            />
            <span className="text-slate-300">{TYPE_AGENCE_LABELS[TypeAgence.MAIN]}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[TypeAgence.SECONDARY] }}
            />
            <span className="text-slate-300">{TYPE_AGENCE_LABELS[TypeAgence.SECONDARY]}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[TypeAgence.KIOSK] }}
            />
            <span className="text-slate-300">{TYPE_AGENCE_LABELS[TypeAgence.KIOSK]}</span>
          </div>
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={defaultZoom}
        style={{ height, width: '100%' }}
        className="rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapControls />
        <FitBounds agencies={validAgencies} />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          iconCreateFunction={(cluster: L.MarkerCluster) => {
            const count = cluster.getChildCount();
            return L.divIcon({
              html: `<div class="cluster-icon">${count}</div>`,
              className: 'custom-cluster-icon',
              iconSize: L.point(40, 40),
            });
          }}
        >
          {validAgencies.map((agency) => (
            <Marker
              key={agency.id}
              position={[Number(agency.latitude), Number(agency.longitude)]}
              icon={getAgencyIcon(agency.typeAgence, agency.id === selectedAgencyId)}
            >
              <Popup
                closeButton={true}
                autoPan={true}
                className="agency-popup"
              >
                <div className="min-w-[220px] p-1">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{
                        backgroundColor: `${TYPE_COLORS[agency.typeAgence]}20`,
                      }}
                    >
                      <Building2
                        size={20}
                        style={{ color: TYPE_COLORS[agency.typeAgence] }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-800 text-sm leading-tight">
                        {agency.nom}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono">{agency.codeAgence}</p>
                    </div>
                  </div>

                  {/* Status & Type badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        agency.statut === StatutAgence.ACTIVE
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {STATUT_AGENCE_LABELS[agency.statut] || agency.statut}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${TYPE_COLORS[agency.typeAgence]}20`,
                        color: TYPE_COLORS[agency.typeAgence],
                      }}
                    >
                      {TYPE_AGENCE_LABELS[agency.typeAgence] || agency.typeAgence}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-xs">
                    {(agency.ville || agency.adresse) && (
                      <div className="flex items-start gap-2 text-slate-600">
                        <MapPin size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
                        <span className="line-clamp-2">
                          {agency.ville}
                          {agency.region ? `, ${agency.region}` : ''}
                          {agency.adresse ? ` - ${agency.adresse}` : ''}
                        </span>
                      </div>
                    )}

                    {agency.telephone && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone size={14} className="text-slate-400 flex-shrink-0" />
                        <span>{agency.telephone}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <UserCheck size={14} className="text-slate-400" />
                      <span>{agency.nombreEmployes || 0} employé(s)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Users size={14} className="text-slate-400" />
                      <span>{agency.nombreClients || 0} client(s)</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Custom CSS for cluster icons and popups */}
      <style>{`
        .custom-cluster-icon {
          background: transparent;
        }
        .cluster-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
          border: 3px solid white;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .custom-agency-marker {
          background: transparent;
          border: none;
        }
        @keyframes pulse {
          0%, 100% { transform: rotate(-45deg) scale(1); }
          50% { transform: rotate(-45deg) scale(1.1); }
        }
        /* Popup styling fixes */
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 0;
          overflow: hidden;
        }
        .leaflet-popup-content {
          margin: 8px;
          min-width: 200px;
        }
        .leaflet-popup-tip {
          background: white;
        }
        .agency-popup .leaflet-popup-content-wrapper {
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  );
}
