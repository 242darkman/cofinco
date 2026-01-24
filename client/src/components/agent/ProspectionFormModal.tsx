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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-sm bg-slate-900/95 backdrop-blur border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
              <UserPlus className="text-violet-400" size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none">Nouvelle Prospection</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Saisie rapide contact</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center transition-colors border border-transparent hover:border-slate-700"
          >
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Offline Indicator */}
        {!navigator.onLine && (
          <div className="mx-4 mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
            <WifiOff size={14} className="text-amber-400" />
            <span className="text-[10px] font-medium text-amber-400">Mode hors-ligne actif</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Row 1: Nom & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Nom du prospect</label>
                <input
                type="text"
                value={formData.nomProspect}
                onChange={(e) => setFormData(prev => ({ ...prev, nomProspect: e.target.value }))}
                placeholder="Ex: Jean Makaya"
                className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-all ${
                    errors.nomProspect ? 'border-red-500/50' : 'border-slate-700'
                }`}
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Téléphone</label>
                <input
                type="tel"
                value={formData.telephoneProspect}
                onChange={(e) => setFormData(prev => ({ ...prev, telephoneProspect: e.target.value }))}
                placeholder="06 XXX XX XX"
                className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 transition-all ${
                    errors.telephoneProspect ? 'border-red-500/50' : 'border-slate-700'
                }`}
                />
            </div>
          </div>

          {/* Row 2: Activité */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Type d'activité</label>
            <div className="relative">
                <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <select
                value={formData.typeActivite}
                onChange={(e) => setFormData(prev => ({ ...prev, typeActivite: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer hover:bg-slate-750 transition-all"
                >
                <option value="">Sélectionner une activité...</option>
                <option value="Commerce">Commerce</option>
                <option value="Artisanat">Artisanat</option>
                <option value="Agriculture">Agriculture</option>
                <option value="Services">Services</option>
                <option value="Transport">Transport</option>
                <option value="Restauration">Restauration</option>
                <option value="Autre">Autre</option>
                </select>
            </div>
          </div>

          {/* Row 3: Actions (GPS & Photo) */}
          <div className="grid grid-cols-2 gap-3">
            {/* GPS Button */}
            <button
                type="button"
                onClick={captureGPS}
                disabled={gpsLoading}
                className={`relative group overflow-hidden border rounded-xl p-3 flex flex-col items-center justify-center gap-1 transition-all ${
                    formData.latitude && formData.longitude 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:border-slate-600'
                }`}
            >
                {gpsLoading ? (
                    <Loader2 size={20} className="animate-spin text-violet-400" />
                ) : formData.latitude ? (
                    <CheckCircle size={20} className="text-emerald-400" />
                ) : (
                    <MapPin size={20} className="group-hover:text-violet-400 transition-colors" />
                )}
                <span className="text-[10px] font-medium">
                    {formData.latitude ? 'Position OK' : 'Localiser'}
                </span>
            </button>

            {/* Photo Button */}
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
                    className={`h-full cursor-pointer overflow-hidden border rounded-xl p-3 flex flex-col items-center justify-center gap-1 transition-all ${
                        photoPreview 
                        ? 'bg-slate-800 border-violet-500/50' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750 hover:border-slate-600'
                    }`}
                >
                    {photoPreview ? (
                        <>
                            <div className="absolute inset-0 opacity-40">
                                <img src={photoPreview} className="w-full h-full object-cover" alt="preview" />
                            </div>
                            <div className="absolute inset-0 bg-black/40" />
                            <CheckCircle size={20} className="text-white relative z-10" />
                            <span className="text-[10px] font-medium text-white relative z-10">Photo OK</span>
                        </>
                    ) : (
                        <>
                            <Camera size={20} className="group-hover:text-violet-400 transition-colors" />
                            <span className="text-[10px] font-medium">Prendre Photo</span>
                        </>
                    )}
                </label>
            </div>
          </div>

          {/* Observations */}
          <div className="space-y-1">
            <textarea
              value={formData.observations}
              onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Observations..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 rounded-xl text-white font-bold text-sm shadow-lg shadow-violet-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UserPlus size={16} />
            )}
            Valider la prospection
          </button>
        </form>
      </div>
    </div>
  );
}
