/**
 * EnqueteDetailPanel - Panneau de détail compact pour une enquête de crédit
 *
 * Affiche:
 * - Carte mini avec localisation de l'enquête
 * - Informations clés de l'enquête
 * - Photos géotaggées
 * - Indicateurs de risque
 */

import React, { useState, Suspense } from 'react';
import {
  MapPin, Clock, User, DollarSign, TrendingUp, AlertTriangle,
  CheckCircle, Camera, X, ExternalLink, Navigation, Crosshair,
  Building, Calendar, FileText
} from 'lucide-react';
import { Badge } from '../../ui';
import { formatMoney } from '../../../lib/format';
import type { EnqueteCredit, GeotaggedPhoto } from '../../../hooks/credits/useEnquetes';

// Lazy load the map component
const EnqueteMiniMap = React.lazy(() => import('../../maps/EnqueteMiniMap'));

interface EnqueteDetailPanelProps {
  enquete: EnqueteCredit;
  onClose?: () => void;
  showMap?: boolean;
  compact?: boolean;
}

export default function EnqueteDetailPanel({
  enquete,
  onClose,
  showMap = true,
  compact = false
}: EnqueteDetailPanelProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<GeotaggedPhoto | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  // Parse GPS coordinates
  const hasGeoData = enquete.geo_latitude && enquete.geo_longitude;
  const latitude = hasGeoData ? parseFloat(String(enquete.geo_latitude)) : null;
  const longitude = hasGeoData ? parseFloat(String(enquete.geo_longitude)) : null;
  const accuracy = enquete.geo_accuracy ? parseFloat(String(enquete.geo_accuracy)) : undefined;

  // Client coordinates
  const clientLat = enquete.clients?.latitude ? parseFloat(String(enquete.clients.latitude)) : undefined;
  const clientLng = enquete.clients?.longitude ? parseFloat(String(enquete.clients.longitude)) : undefined;

  // Calculate distance if both positions available
  const distance = latitude && longitude && clientLat && clientLng
    ? haversineDistance(latitude, longitude, clientLat, clientLng)
    : null;

  const isDistanceWarning = distance !== null && distance > 200;

  // Combine regular photos with geotagged ones
  const allPhotos: GeotaggedPhoto[] = [
    ...(enquete.photos_geotagged || []),
    ...(enquete.photos_activite || []).map(url => ({ url }))
  ];

  const geotaggedPhotos = allPhotos.filter(p => p.latitude && p.longitude);

  return (
    <div className={`bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20">
            <FileText size={16} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Détail Enquête</h3>
            <p className="text-[10px] text-slate-400">
              {enquete.date_enquete
                ? new Date(enquete.date_enquete).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })
                : 'Date non disponible'
              }
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Mini Map */}
      {showMap && hasGeoData && latitude && longitude && (
        <div className="mb-3">
          <Suspense fallback={
            <div className="h-[180px] bg-slate-700/30 rounded-lg animate-pulse flex items-center justify-center">
              <MapPin className="text-slate-500" size={24} />
            </div>
          }>
            <EnqueteMiniMap
              enqueteLatitude={latitude}
              enqueteLongitude={longitude}
              enqueteAccuracy={accuracy}
              enqueteTimestamp={enquete.geo_timestamp}
              clientLatitude={clientLat}
              clientLongitude={clientLng}
              clientAddress={enquete.clients?.adresse_domicile}
              geotaggedPhotos={geotaggedPhotos}
              height="180px"
              interactive={false}
              showPhotosMarkers={geotaggedPhotos.length > 0}
              onPhotoClick={(photo) => {
                setSelectedPhoto(photo);
                setShowPhotoModal(true);
              }}
            />
          </Suspense>
        </div>
      )}

      {/* GPS Info Compact */}
      {hasGeoData && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-700/30 rounded-lg p-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
              <Crosshair size={10} />
              Précision GPS
            </div>
            <div className={`text-sm font-medium ${
              accuracy && accuracy < 30 ? 'text-emerald-400' :
              accuracy && accuracy < 100 ? 'text-amber-400' : 'text-red-400'
            }`}>
              ±{accuracy ? Math.round(accuracy) : '?'}m
            </div>
          </div>

          {distance !== null && (
            <div className={`rounded-lg p-2 ${isDistanceWarning ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
              <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Navigation size={10} />
                Distance client
              </div>
              <div className={`text-sm font-medium flex items-center gap-1 ${
                isDistanceWarning ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {isDistanceWarning && <AlertTriangle size={12} />}
                {distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key Info Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <InfoCard
          icon={<DollarSign size={12} />}
          label="Montant demandé"
          value={formatMoney(enquete.montant_demande)}
          color="blue"
        />
        <InfoCard
          icon={<TrendingUp size={12} />}
          label="Revenus mensuels"
          value={enquete.revenus_mensuels ? formatMoney(enquete.revenus_mensuels) : '-'}
          color="emerald"
        />
        <InfoCard
          icon={<Building size={12} />}
          label="Activité"
          value={enquete.type_activite || '-'}
          color="purple"
          truncate
        />
        <InfoCard
          icon={<User size={12} />}
          label="Enquêteur"
          value={enquete.enqueteur || '-'}
          color="slate"
          truncate
        />
      </div>

      {/* Photos Section */}
      {allPhotos.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-2">
            <Camera size={12} />
            Photos ({allPhotos.length})
            {geotaggedPhotos.length > 0 && (
              <span className="text-emerald-400">• {geotaggedPhotos.length} géotaggées</span>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {allPhotos.slice(0, 4).map((photo, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSelectedPhoto(photo);
                  setShowPhotoModal(true);
                }}
                className="relative flex-shrink-0 rounded-lg overflow-hidden border border-slate-600/50 hover:border-slate-500 transition-colors"
              >
                <img
                  src={photo.url}
                  alt={`Photo ${idx + 1}`}
                  className="w-16 h-16 object-cover"
                />
                {photo.latitude && photo.longitude && (
                  <div className="absolute bottom-0.5 right-0.5 bg-emerald-500 rounded-full p-0.5">
                    <MapPin size={8} className="text-white" />
                  </div>
                )}
              </button>
            ))}
            {allPhotos.length > 4 && (
              <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-slate-700/50 flex items-center justify-center text-xs text-slate-400">
                +{allPhotos.length - 4}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recommandation */}
      {enquete.recommandation && (
        <div className="bg-slate-700/30 rounded-lg p-2">
          <div className="text-[10px] text-slate-400 mb-1">Recommandation</div>
          <p className="text-xs text-slate-300 line-clamp-2">{enquete.recommandation}</p>
        </div>
      )}

      {/* Photo Modal */}
      {showPhotoModal && selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowPhotoModal(false)}
        >
          <div
            className="relative max-w-2xl max-h-[80vh] bg-slate-900 rounded-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={selectedPhoto.url}
              alt="Photo détail"
              className="max-w-full max-h-[70vh] object-contain"
            />
            <div className="absolute top-2 right-2">
              <button
                onClick={() => setShowPhotoModal(false)}
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {selectedPhoto.latitude && selectedPhoto.longitude && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <div className="flex items-center gap-2 text-sm text-white">
                  <MapPin size={14} className="text-emerald-400" />
                  <span>
                    {selectedPhoto.latitude.toFixed(5)}, {selectedPhoto.longitude.toFixed(5)}
                  </span>
                  {selectedPhoto.accuracy && (
                    <Badge value={`±${Math.round(selectedPhoto.accuracy)}m`} variant="neutral" size="sm" />
                  )}
                </div>
                {selectedPhoto.timestamp && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                    <Clock size={12} />
                    {new Date(selectedPhoto.timestamp).toLocaleString('fr-FR')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Info Card Component
function InfoCard({
  icon,
  label,
  value,
  color = 'slate',
  truncate = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: 'blue' | 'emerald' | 'purple' | 'slate' | 'amber';
  truncate?: boolean;
}) {
  const colorClasses = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    purple: 'text-purple-400',
    slate: 'text-slate-300',
    amber: 'text-amber-400',
  };

  return (
    <div className="bg-slate-700/30 rounded-lg p-2">
      <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
        {icon}
        {label}
      </div>
      <div className={`text-xs font-medium ${colorClasses[color]} ${truncate ? 'truncate' : ''}`}>
        {value}
      </div>
    </div>
  );
}

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export type { EnqueteDetailPanelProps };
