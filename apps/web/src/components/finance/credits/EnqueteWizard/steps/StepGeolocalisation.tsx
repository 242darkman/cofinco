import React, { useState, useCallback } from 'react';
import { MapPin, Camera, Upload, AlertTriangle, CheckCircle, Image, X } from 'lucide-react';
import GpsCapture from '../../../../shared/GpsCapture';
import CameraCapture from '../../../../shared/CameraCapture';
import { LocationDisplay } from '../../../../common/LocationDisplay';
import { useEntityUpload } from '../../../../../hooks/useEntityUpload';
import { GpsSignalQuality } from '../../../../../hooks/useGeolocation';
import type { EnqueteFormData, CreditPlanInfo } from '../types';

// Haversine formula to calculate distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface StepGeolocalisationProps {
  formData: EnqueteFormData;
  updateField: (key: keyof EnqueteFormData, value: any) => void;
  readOnly: boolean;
  creditPlan: CreditPlanInfo | null;
  initialData?: any;
  markTouched: (field: string) => void;
  getFieldError: (field: string) => string | null;
}

export default function StepGeolocalisation({
  formData, updateField, readOnly, creditPlan, initialData, markTouched, getFieldError,
}: StepGeolocalisationProps) {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [geoAddress, setGeoAddress] = useState<any>(null);
  const [distanceFromClient, setDistanceFromClient] = useState<number | null>(null);

  const { uploadFile, isUploading } = useEntityUpload({
    fileType: 'investigation',
    entityType: 'client',
    entityId: formData.client_id || '',
  });

  const clientCoords = initialData?.client?.latitude && initialData?.client?.longitude
    ? { latitude: parseFloat(initialData.client.latitude), longitude: parseFloat(initialData.client.longitude) }
    : null;

  const handleGpsCapture = useCallback((data: { latitude: number; longitude: number; accuracy: number; timestamp: Date; signalQuality: GpsSignalQuality }) => {
    updateField('geoLatitude', data.latitude);
    updateField('geoLongitude', data.longitude);
    updateField('geoAccuracy', data.accuracy);
    updateField('geoTimestamp', data.timestamp);

    if (clientCoords) {
      const dist = haversineDistance(data.latitude, data.longitude, clientCoords.latitude, clientCoords.longitude);
      setDistanceFromClient(dist);
    }
  }, [updateField, clientCoords]);

  const handlePhotoCapture = useCallback(async (imageDataUrl: string) => {
    setIsCameraOpen(false);
    if (!imageDataUrl) return;
    try {
      const blob = await fetch(imageDataUrl).then(r => r.blob());
      const file = new File([blob], `enquete-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const result = await uploadFile(file);
      if (result) {
        const newPhoto = {
          url: result,
          latitude: formData.geoLatitude ?? undefined,
          longitude: formData.geoLongitude ?? undefined,
          accuracy: formData.geoAccuracy ?? undefined,
          timestamp: new Date().toISOString(),
        };
        updateField('photos_activite', [...formData.photos_activite, result]);
        updateField('photos_geotagged', [...formData.photos_geotagged, newPhoto]);
      }
    } catch { /* handled by upload hook */ }
  }, [uploadFile, formData, updateField]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadFile(file);
      if (result) {
        updateField('photos_activite', [...formData.photos_activite, result]);
      }
    } catch { /* handled by upload hook */ }
    e.target.value = '';
  }, [uploadFile, formData, updateField]);

  const removePhoto = (index: number) => {
    updateField('photos_activite', formData.photos_activite.filter((_, i) => i !== index));
    updateField('photos_geotagged', formData.photos_geotagged.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* GPS Capture */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          <MapPin size={14} className="inline mr-1.5" />
          Position GPS
        </label>

        {formData.geoLatitude && formData.geoLongitude ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-status-success">
              <CheckCircle size={14} />
              Position capturée ({formData.geoLatitude.toFixed(6)}, {formData.geoLongitude.toFixed(6)})
              {formData.geoAccuracy && <span className="text-content-muted">± {Math.round(formData.geoAccuracy)}m</span>}
            </div>
            {distanceFromClient !== null && (
              <div className={`flex items-center gap-2 text-xs ${distanceFromClient > 200 ? 'text-status-danger' : 'text-status-success'}`}>
                {distanceFromClient > 200 ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                Distance du client : {Math.round(distanceFromClient)}m
                {distanceFromClient > 200 && ' — Alerte : vous êtes loin de l\'adresse du client'}
              </div>
            )}
            {geoAddress && <LocationDisplay latitude={formData.geoLatitude} longitude={formData.geoLongitude} />}
          </div>
        ) : (
          !readOnly && (
            <GpsCapture
              onCapture={handleGpsCapture}
              onAddressResolved={setGeoAddress}
              clientCoords={clientCoords}
              className="mt-1"
            />
          )
        )}
      </div>

      {/* Plan amount range */}
      {creditPlan && formData.montant_demande && (
        <div className="bg-surface p-3 rounded-lg border border-edge">
          <div className="text-xs text-content-secondary mb-1">Montant demandé</div>
          <div className="text-lg font-bold text-content-primary">
            {Number(formData.montant_demande).toLocaleString('fr-FR')}
          </div>
          <div className="text-xs text-content-muted mt-1">
            Plage du plan : {Number(creditPlan.montantMin || 0).toLocaleString('fr-FR')} - {Number(creditPlan.montantMax || 0).toLocaleString('fr-FR')}
          </div>
        </div>
      )}

      {/* Photos activité */}
      <div className="bg-surface p-3 rounded-lg border border-edge">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          <Image size={14} className="inline mr-1.5" />
          Photos de l'Activité ({formData.photos_activite.length}/5)
        </label>

        {formData.photos_activite.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
            {formData.photos_activite.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-edge">
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && formData.photos_activite.length < 5 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent/10 text-accent rounded-lg text-xs font-medium hover:bg-accent/20 transition"
            >
              <Camera size={14} /> Caméra
            </button>
            <label className="flex items-center gap-1.5 px-3 py-2 bg-surface-elevated text-content-secondary rounded-lg text-xs font-medium hover:bg-surface-subtle transition cursor-pointer">
              <Upload size={14} /> Galerie
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        )}
      </div>

      <CameraCapture
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handlePhotoCapture}
        title="Photo d'enquête"
        subtitle="Prenez une photo de l'activité du client"
        facingMode="environment"
      />
    </div>
  );
}
