import React, { useState, useCallback } from 'react';
import { X, MapPin, Camera, Loader2, UserPlus, Phone, Briefcase, CheckCircle, WifiOff, AlertCircle } from 'lucide-react';
import { prospectionApi } from '../../lib/api-client';
import { useToast } from '@/hooks/use-toast';

interface ProspectionFormModalProps {
  isOpen: boolean;
  agentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  nomProspect: string;
  telephoneProspect: string;
  typeActivite: string;
  latitude: string;
  longitude: string;
  photoUrl: string;
  observations: string;
}

const OFFLINE_STORAGE_KEY = 'offline_prospections';

export default function ProspectionFormModal({ isOpen, agentId, onClose, onSuccess }: ProspectionFormModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    nomProspect: '',
    telephoneProspect: '',
    typeActivite: '',
    latitude: '',
    longitude: '',
    photoUrl: '',
    observations: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Validate phone number (Congo format: +242 or 06/05/04)
  const validatePhone = (phone: string): boolean => {
    const congoPhoneRegex = /^(\+242|0)[456]\d{7}$/;
    return congoPhoneRegex.test(phone.replace(/\s/g, ''));
  };

  // Capture GPS position
  const captureGPS = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: 'Erreur GPS',
        description: 'La géolocalisation n\'est pas supportée par ce navigateur.',
        variant: 'destructive',
      });
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
        toast({
          title: 'Position capturée',
          description: `Lat: ${position.coords.latitude.toFixed(4)}, Lng: ${position.coords.longitude.toFixed(4)}`,
        });
      },
      (error) => {
        setGpsLoading(false);
        let message = 'Impossible de capturer la position.';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Permission de géolocalisation refusée.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Position non disponible.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Délai d\'attente dépassé.';
        }
        toast({
          title: 'Erreur GPS',
          description: message,
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [toast]);

  // Handle photo capture
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 for preview and potential offline storage
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      setFormData(prev => ({ ...prev, photoUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  // Save to offline storage
  const saveOffline = (data: any) => {
    try {
      const existing = localStorage.getItem(OFFLINE_STORAGE_KEY);
      const offlineData = existing ? JSON.parse(existing) : [];
      offlineData.push({
        ...data,
        offlineId: Date.now(),
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(offlineData));
      return true;
    } catch {
      return false;
    }
  };

  // Validate form
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.nomProspect.trim()) {
      newErrors.nomProspect = 'Le nom est obligatoire';
    }

    if (!formData.telephoneProspect.trim()) {
      newErrors.telephoneProspect = 'Le téléphone est obligatoire';
    } else if (!validatePhone(formData.telephoneProspect)) {
      newErrors.telephoneProspect = 'Format invalide (ex: 06XXXXXXX ou +242XXXXXXXXX)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const payload = {
      agentId,
      nomProspect: formData.nomProspect.trim(),
      telephoneProspect: formData.telephoneProspect.replace(/\s/g, ''),
      typeActivite: formData.typeActivite.trim() || undefined,
      latitude: formData.latitude ? parseFloat(formData.latitude) : undefined,
      longitude: formData.longitude ? parseFloat(formData.longitude) : undefined,
      photoUrl: formData.photoUrl || undefined,
      observations: formData.observations.trim() || undefined,
      statut: 'NEW',
    };

    setLoading(true);

    // Check if online
    if (!navigator.onLine) {
      // Offline mode - save locally
      if (saveOffline(payload)) {
        toast({
          title: 'Enregistré hors-ligne',
          description: `Prospect "${formData.nomProspect}" sauvegardé. Synchronisation automatique au retour de connexion.`,
          variant: 'default',
        });
        onSuccess();
        onClose();
      } else {
        toast({
          title: 'Erreur',
          description: 'Impossible de sauvegarder hors-ligne.',
          variant: 'destructive',
        });
      }
      setLoading(false);
      return;
    }

    // Online mode - send to API
    try {
      await prospectionApi.create(payload);
      toast({
        title: 'Prospect enregistré !',
        description: `${formData.nomProspect} ajouté avec succès.`,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating prospection:', error);
      
      // If network error, save offline
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        if (saveOffline(payload)) {
          toast({
            title: 'Sauvegardé hors-ligne',
            description: 'Erreur réseau. Données sauvegardées localement.',
            variant: 'default',
          });
          onSuccess();
          onClose();
          return;
        }
      }
      
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible d\'enregistrer le prospect.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content - Mobile Drawer Style */}
      <div className="relative w-full sm:max-w-md bg-slate-900 border border-slate-700/50 rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
              <UserPlus className="text-violet-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nouvelle Prospection</h2>
              <p className="text-xs text-slate-400">Ajouter un prospect rapidement</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Offline Indicator */}
        {!navigator.onLine && (
          <div className="mx-5 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2">
            <WifiOff size={16} className="text-amber-400" />
            <span className="text-xs text-amber-400">Mode hors-ligne - Les données seront synchronisées</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Nom du prospect *
            </label>
            <input
              type="text"
              value={formData.nomProspect}
              onChange={(e) => setFormData(prev => ({ ...prev, nomProspect: e.target.value }))}
              placeholder="Ex: Jean Makaya"
              className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all ${
                errors.nomProspect ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.nomProspect && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.nomProspect}
              </p>
            )}
          </div>

          {/* Téléphone */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Phone size={14} className="inline mr-1" />
              Téléphone *
            </label>
            <input
              type="tel"
              value={formData.telephoneProspect}
              onChange={(e) => setFormData(prev => ({ ...prev, telephoneProspect: e.target.value }))}
              placeholder="06 XXX XX XX"
              className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all ${
                errors.telephoneProspect ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.telephoneProspect && (
              <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.telephoneProspect}
              </p>
            )}
          </div>

          {/* Type d'activité */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Briefcase size={14} className="inline mr-1" />
              Type d'activité
            </label>
            <select
              value={formData.typeActivite}
              onChange={(e) => setFormData(prev => ({ ...prev, typeActivite: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
            >
              <option value="">Sélectionner...</option>
              <option value="Commerce">Commerce</option>
              <option value="Artisanat">Artisanat</option>
              <option value="Agriculture">Agriculture</option>
              <option value="Services">Services</option>
              <option value="Transport">Transport</option>
              <option value="Restauration">Restauration</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          {/* GPS Capture */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <MapPin size={14} className="inline mr-1" />
              Position GPS
            </label>
            <button
              type="button"
              onClick={captureGPS}
              disabled={gpsLoading}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white hover:bg-slate-700/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {gpsLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Capture en cours...
                </>
              ) : formData.latitude && formData.longitude ? (
                <>
                  <CheckCircle size={18} className="text-emerald-400" />
                  <span className="text-emerald-400">
                    {formData.latitude}, {formData.longitude}
                  </span>
                </>
              ) : (
                <>
                  <MapPin size={18} />
                  Capturer ma position
                </>
              )}
            </button>
          </div>

          {/* Photo Capture */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              <Camera size={14} className="inline mr-1" />
              Photo
            </label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
                id="photo-capture"
              />
              <label
                htmlFor="photo-capture"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white hover:bg-slate-700/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {photoPreview ? (
                  <>
                    <CheckCircle size={18} className="text-emerald-400" />
                    <span className="text-emerald-400">Photo capturée</span>
                  </>
                ) : (
                  <>
                    <Camera size={18} />
                    Prendre une photo
                  </>
                )}
              </label>
              {photoPreview && (
                <div className="mt-2 rounded-xl overflow-hidden">
                  <img src={photoPreview} alt="Preview" className="w-full h-32 object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Observations
            </label>
            <textarea
              value={formData.observations}
              onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Notes additionnelles..."
              rows={2}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 active:scale-[0.98] rounded-xl text-white font-bold text-base shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <UserPlus size={20} />
                Enregistrer le prospect
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
