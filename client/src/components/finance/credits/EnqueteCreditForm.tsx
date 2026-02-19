import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, DollarSign, Briefcase, FileText, Camera, Upload, MapPin, TrendingUp, AlertCircle, User, Loader2, CheckCircle, Calendar, Video, WifiOff, Clock } from 'lucide-react';
import CameraCapture from '../../shared/CameraCapture';
import GpsCapture from '../../shared/GpsCapture';
import { GpsSignalQuality } from '../../../hooks/useGeolocation';
import { saveEnqueteOffline } from '../../../lib/offline-db';
import { toast } from 'sonner';
import { LocationDisplay } from '../../common/LocationDisplay';
import { formatClientName } from '../../../lib/format';
import { clientApi } from '../../../lib/api-client';
import { useEntityUpload } from '../../../hooks/useEntityUpload';
import { StatutClient } from '@shared/enum/status-constants';
interface Client {
  id: string;
  nom: string;
  photoUrl?: string;
  // Added GPS fields
  latitude?: string;
  longitude?: string;
}

interface EnqueteCreditFormProps {
  clientId?: string;
  clientNom?: string;
  initialData?: any;
  onClose: () => void;
  onSave: (enquete: any) => void;
  readOnly?: boolean; // When true, form is in view-only mode
}

// Haversine formula to calculate distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ1) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

interface GeoLocation {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  timestamp: Date | null;
  distanceFromClient?: number | null;
  signalQuality?: GpsSignalQuality;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    display_name?: string;
  };
}

export default function EnqueteCreditForm({ clientId, clientNom, initialData, onClose, onSave, readOnly = false }: EnqueteCreditFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const [geoLocation, setGeoLocation] = useState<GeoLocation>({
    latitude: null,
    longitude: null,
    accuracy: null,
    timestamp: null,
    distanceFromClient: null,
    signalQuality: undefined,
    address: undefined
  });
  
  // Seniority state (value + unit)
  const [seniorityValue, setSeniorityValue] = useState<string>('');
  const [seniorityUnit, setSeniorityUnit] = useState<'days' | 'months' | 'years'>('months');

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Calculate initial revenue values from demande
  const getInitialRevenuMensuel = () => {
    // Priority: revenus_mensuels > revenu_mensuel > calculated from journalier
    if (initialData?.revenus_mensuels) return initialData.revenus_mensuels.toString();
    if (initialData?.revenu_mensuel) return initialData.revenu_mensuel.toString();
    if (initialData?.revenu_journalier) {
      const journalier = parseFloat(initialData.revenu_journalier);
      return (journalier * 26).toString(); // Default 26 work days
    }
    return '';
  };

  const getInitialTypeRevenu = () => {
    if (initialData?.type_revenu) return initialData.type_revenu;
    if (initialData?.revenu_journalier && !initialData?.revenus_mensuels && !initialData?.revenu_mensuel) return 'Journalier';
    return 'Mensuel';
  };

  const [formData, setFormData] = useState({
    demandeId: initialData?.demandeId || initialData?.id || '',
    client_id: clientId || initialData?.client_id || '',
    montant_demande: initialData?.montant_demande || '',
    categorie_activite: initialData?.categorie_activite || '',
    type_activite: initialData?.type_activite || '',
    anciennete_activite: initialData?.anciennete_activite || '',
    description_activite: initialData?.objet_credit || initialData?.description_activite || '',
    revenu_journalier: initialData?.revenu_journalier?.toString() || '',
    jours_travail_mois: '26',
    // Pre-fill from demande credit request
    revenu_mensuel_declare: getInitialRevenuMensuel(),
    type_revenu: getInitialTypeRevenu(),
    charges_mensuelles: initialData?.charges_mensuelles?.toString() || '',
    autres_credits: [] as any[],
    garanties_proposees: [] as any[],
    photos_activite: [] as string[],
    photos_geotagged: [] as { url: string; latitude?: number; longitude?: number; accuracy?: number; timestamp?: string }[],
    documents_justificatifs: [] as string[],
  });

  const { uploadFile: uploadActivityPhoto, isUploading: isUploadingPhoto } = useEntityUpload({
    fileType: 'investigation',
    entityType: 'client',
    entityId: formData.client_id || clientId || '',
  });

  useEffect(() => {
    if (!clientId) {
      loadClients();
    }
  }, [clientId]);

  // Track if user manually changed revenu_journalier
  const userChangedJournalier = useRef(false);

  useEffect(() => {
    // Only recalculate if user manually changed the journalier field
    if (!userChangedJournalier.current) return;

    const revenuJournalier = parseFloat(formData.revenu_journalier) || 0;
    const joursTravail = parseInt(formData.jours_travail_mois) || 26;
    const revenuMensuel = revenuJournalier * joursTravail;
    if (revenuJournalier > 0) {
      setFormData(prev => ({ ...prev, revenu_mensuel_declare: revenuMensuel.toString() }));
    }
  }, [formData.revenu_journalier, formData.jours_travail_mois]);

  // Convert seniority to months
  const convertToMonths = (value: number, unit: 'days' | 'months' | 'years'): number => {
    if (unit === 'days') return Math.round(value / 30);
    if (unit === 'months') return value;
    if (unit === 'years') return value * 12;
    return value;
  };

  // Smart formatting for conversion display
  const formatConversion = (value: number, unit: 'days' | 'months' | 'years'): string => {
    const totalMonths = convertToMonths(value, unit);
    
    // If original is in years, show in months and years
    if (unit === 'years') {
      if (value === 1) return '1 an (12 mois)';
      return `${value} années (${totalMonths} mois)`;
    }
    
    // If original is in months
    if (unit === 'months') {
      if (value < 12) return `${value} mois`;
      const years = Math.floor(value / 12);
      const remainingMonths = value % 12;
      if (remainingMonths === 0) {
        return years === 1 ? '1 an' : `${years} ans`;
      }
      const yearText = years === 1 ? '1 an' : `${years} ans`;
      return `${yearText} et ${remainingMonths} mois`;
    }
    
    // If original is in days
    if (unit === 'days') {
      if (value < 30) {
        return totalMonths === 0 ? 'moins d\'1 mois' : '≈ 1 mois';
      }
      if (totalMonths < 12) {
        return `≈ ${totalMonths} mois`;
      }
      const years = Math.floor(totalMonths / 12);
      const remainingMonths = totalMonths % 12;
      if (remainingMonths === 0) {
        return years === 1 ? '≈ 1 an' : `≈ ${years} ans`;
      }
      const yearText = years === 1 ? '1 an' : `${years} ans`;
      return `≈ ${yearText} et ${remainingMonths} mois`;
    }
    
    return `${totalMonths} mois`;
  };

  // Update anciennete_activite when seniority value/unit changes
  useEffect(() => {
    if (seniorityValue) {
      const months = convertToMonths(parseFloat(seniorityValue), seniorityUnit);
      setFormData(prev => ({ ...prev, anciennete_activite: months.toString() }));
    } else {
      setFormData(prev => ({ ...prev, anciennete_activite: '' }));
    }
  }, [seniorityValue, seniorityUnit]);

  // Initialize seniority from formData if editing
  useEffect(() => {
    if (initialData?.anciennete_activite) {
      const months = parseInt(initialData.anciennete_activite);
      setSeniorityValue(months.toString());
      setSeniorityUnit('months');
    }
  }, [initialData]);

  const loadClients = async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data.filter((client: any) => client.statut === StatutClient.ACTIVE));
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const client = clients.find(c => c.id === id) || null;
    setSelectedClient(client);
    setFormData(prev => ({ ...prev, client_id: id }));
  };

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autreCredit, setAutreCredit] = useState({ organisme: '', montant: '', echeance: '' });
  const [garantie, setGarantie] = useState({ type: '', description: '', valeur: '' });

  const categoriesActivite: Record<string, string[]> = {
    'Commerce': [
      'Commerce général',
      'Commerce alimentaire',
      'Commerce vestimentaire',
      'Commerce électronique/téléphonie',
      'Commerce cosmétique',
      'Commerce matériaux construction',
      'Vente ambulante',
      'Quincaillerie'
    ],
    'Services': [
      'Salon de coiffure',
      'Salon de beauté',
      'Restaurant/Maquis',
      'Bar/Buvette',
      'Pressing/Laverie',
      'Cyber café',
      'Réparation téléphone',
      'Location véhicules',
      'Services divers'
    ],
    'Artisanat': [
      'Couture/Confection',
      'Menuiserie',
      'Soudure/Ferronnerie',
      'Maçonnerie',
      'Électricité',
      'Plomberie',
      'Mécanique auto/moto',
      'Artisanat d\'art'
    ],
    'Agriculture': [
      'Culture vivrière',
      'Culture maraîchère',
      'Culture de rente',
      'Transformation agricole',
      'Vente de produits agricoles'
    ],
    'Élevage': [
      'Élevage volaille',
      'Élevage porcin',
      'Élevage bovin',
      'Élevage ovin/caprin',
      'Pisciculture',
      'Apiculture'
    ],
    'Transport': [
      'Taxi/VTC',
      'Transport moto (Zemidjan)',
      'Transport marchandises',
      'Transport en commun'
    ],
    'Autre': [
      'Autre activité'
    ]
  };

  const typesGaranties = [
    'Terrain',
    'Maison',
    'Véhicule',
    'Équipement professionnel',
    'Stock de marchandises',
    'Caution solidaire',
    'Autre'
  ];

  /**
   * Callback quand le composant GpsCapture capture une position
   */
  const handleGpsCapture = useCallback((data: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: Date;
    signalQuality: GpsSignalQuality;
  }) => {
    // Calculer la distance depuis l'adresse du client si disponible
    let distance = null;
    if (selectedClient?.latitude && selectedClient?.longitude) {
      distance = haversineDistance(
        data.latitude,
        data.longitude,
        parseFloat(selectedClient.latitude),
        parseFloat(selectedClient.longitude)
      );
    }

    setGeoLocation(prev => ({
      ...prev,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      timestamp: data.timestamp,
      distanceFromClient: distance,
      signalQuality: data.signalQuality,
    }));

    toast.success(`Position GPS capturée! Précision: ±${Math.round(data.accuracy)}m`);
  }, [selectedClient]);

  /**
   * Callback quand l'adresse est résolue via reverse geocoding
   */
  const handleAddressResolved = useCallback((address: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    display_name?: string;
  }) => {
    setGeoLocation(prev => ({
      ...prev,
      address,
    }));
  }, []);

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reuse the same logic
    await handlePhotoUpload(e);
  };

  const removePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photos_activite: prev.photos_activite.filter((_, i) => i !== index)
    }));
  };

  // Convert storage key to display URL
  const getPhotoDisplayUrl = (keyOrUrl: string): string => {
    // If it's already a full URL (http/https or data URL), return as-is
    if (keyOrUrl.startsWith('http') || keyOrUrl.startsWith('data:')) {
      return keyOrUrl;
    }
    // Otherwise, it's a storage key - convert to API URL
    return `/api/storage/files/${encodeURIComponent(keyOrUrl)}`;
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleCategorieChange = (categorie: string) => {
    setFormData(prev => ({ 
      ...prev, 
      categorie_activite: categorie,
      type_activite: '' 
    }));
  };

  const ajouterAutreCredit = () => {
    if (autreCredit.organisme && autreCredit.montant) {
      setFormData(prev => ({
        ...prev,
        autres_credits: [...prev.autres_credits, { ...autreCredit }]
      }));
      setAutreCredit({ organisme: '', montant: '', echeance: '' });
    }
  };

  const ajouterGarantie = () => {
    if (garantie.type && garantie.description) {
      setFormData(prev => ({
        ...prev,
        garanties_proposees: [...prev.garanties_proposees, { ...garantie }]
      }));
      setGarantie({ type: '', description: '', valeur: '' });
    }
  };

  const retirerAutreCredit = (index: number) => {
    setFormData(prev => ({
      ...prev,
      autres_credits: prev.autres_credits.filter((_, i) => i !== index)
    }));
  };

  const retirerGarantie = (index: number) => {
    setFormData(prev => ({
      ...prev,
      garanties_proposees: prev.garanties_proposees.filter((_, i) => i !== index)
    }));
  };

  const MAX_PHOTOS = 5;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      let currentCount = formData.photos_activite.length;
      for (const file of Array.from(files)) {
        if (currentCount >= MAX_PHOTOS) {
          toast.warning(`Maximum ${MAX_PHOTOS} photos autorisées`);
          break;
        }
        try {
          const url = await uploadActivityPhoto(file);
          if (url) {
            setFormData(prev => ({
              ...prev,
              photos_activite: [...prev.photos_activite, url]
            }));
            currentCount++;
          }
        } catch (error) {
          console.error("Error uploading photo", error);
          toast.error("Erreur lors de l'upload de la photo");
        }
      }
    }
  };

  const handleLiveCameraCapture = async (imageDataUrl: string) => {
    if (formData.photos_activite.length >= MAX_PHOTOS) {
      toast.warning(`Maximum ${MAX_PHOTOS} photos autorisées`);
      setIsCameraOpen(false);
      return;
    }
    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadActivityPhoto(file);
      if (url) {
        // Ajouter l'URL à photos_activite pour la compatibilité
        setFormData(prev => ({
          ...prev,
          photos_activite: [...prev.photos_activite, url],
          // Ajouter aussi aux photos géotaggées si on a une position GPS
          photos_geotagged: geoLocation.latitude && geoLocation.longitude
            ? [...prev.photos_geotagged, {
                url,
                latitude: geoLocation.latitude,
                longitude: geoLocation.longitude,
                accuracy: geoLocation.accuracy || undefined,
                timestamp: new Date().toISOString(),
              }]
            : prev.photos_geotagged
        }));

        if (geoLocation.latitude && geoLocation.longitude) {
          toast.success('Photo géotaggée capturée!');
        }
      }
    } catch (e) {
      console.error("Upload capture failed", e);
      toast.error("Erreur upload capture");
    }
  };

  // Check if form is valid for enabling submit button (real-time validation)
  const MIN_DESC_LENGTH = 10;

  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    if (!formData.client_id) missing.push('Client');
    if (!formData.montant_demande || parseFloat(formData.montant_demande) <= 0) missing.push('Montant');
    if (!formData.categorie_activite) missing.push('Catégorie d\'activité');
    if (!formData.type_activite) missing.push('Type d\'activité');
    if (!formData.anciennete_activite && !seniorityValue) missing.push('Ancienneté');
    if (!formData.description_activite || formData.description_activite.trim().length < MIN_DESC_LENGTH) missing.push('Description');
    if (!formData.revenu_mensuel_declare || parseFloat(formData.revenu_mensuel_declare) <= 0) missing.push('Revenu mensuel');
    return missing;
  };

  const isFormValid = (): boolean => {
    return getMissingFields().length === 0;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) {
      newErrors.client_id = 'Veuillez sélectionner un client';
    }

    if (!formData.montant_demande || parseFloat(formData.montant_demande) <= 0) {
      newErrors.montant_demande = 'Le montant demandé est requis';
    }

    if (!formData.categorie_activite) {
      newErrors.categorie_activite = 'La catégorie d\'activité est requise';
    }

    if (!formData.type_activite) {
      newErrors.type_activite = 'Le type d\'activité est requis';
    }

    if (!formData.anciennete_activite) {
      newErrors.anciennete_activite = 'L\'ancienneté est requise';
    }

    if (!formData.description_activite || formData.description_activite.trim().length < MIN_DESC_LENGTH) {
      newErrors.description_activite = `Ajoutez quelques détails (minimum ${MIN_DESC_LENGTH} caractères)`;
    }

    if (!formData.revenu_mensuel_declare || parseFloat(formData.revenu_mensuel_declare) <= 0) {
      newErrors.revenu_mensuel_declare = 'Le revenu mensuel est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = validateForm();
    if (!isValid) {
      toast.error('Formulaire incomplet', { description: 'Veuillez remplir tous les champs obligatoires' });
      return;
    }
    if (isValid) {
      // Map French UI values to English enum values
      const typeRevenuMapping: Record<string, string> = {
        'Journalier': 'DAILY',
        'Mensuel': 'MONTHLY'
      };

      // Debug: log demandeId before sending
      console.log('[EnqueteCreditForm] formData.demandeId:', formData.demandeId);
      console.log('[EnqueteCreditForm] initialData:', initialData);

      const payload = {
        clientId: formData.client_id,
        demandeId: formData.demandeId && formData.demandeId.trim() !== '' ? formData.demandeId : undefined,
        // Montant et objet
        montantDemande: formData.montant_demande,
        objetCredit: formData.description_activite,
        // Activité professionnelle
        categorieActivite: formData.categorie_activite,
        typeActivite: formData.type_activite,
        ancienneteActivite: parseInt(formData.anciennete_activite) || 0,
        // Revenus - mapper vers les noms attendus par le backend
        typeRevenu: typeRevenuMapping[formData.type_revenu] || formData.type_revenu,
        revenuMensuel: formData.revenu_mensuel_declare || '0',
        revenuJournalier: formData.revenu_journalier || '0',
        joursTravailMois: parseInt(formData.jours_travail_mois) || 26,
        // Charges
        chargesMensuelles: formData.charges_mensuelles || '0',
        // Données supplémentaires (stockées en JSON si nécessaire)
        autresCredits: formData.autres_credits,
        garantiesProposees: formData.garanties_proposees,
        photosActivite: formData.photos_activite,
        photosGeotagged: formData.photos_geotagged,
        documentsJustificatifs: formData.documents_justificatifs,
        // Geo data
        geoLatitude: geoLocation.latitude,
        geoLongitude: geoLocation.longitude,
        geoAccuracy: geoLocation.accuracy,
        geoTimestamp: geoLocation.timestamp,
        statut: 'PENDING'
      };

      // Offline Check
      if (!navigator.onLine) {
         try {
             await saveEnqueteOffline(formData.client_id, payload, {
               demandeId: formData.demandeId || undefined,
               photos: formData.photos_activite,
               gpsCoordinates: geoLocation.latitude && geoLocation.longitude
                 ? { lat: geoLocation.latitude, lng: geoLocation.longitude }
                 : undefined,
             });
             toast.success('Enquête sauvegardée HORS-LIGNE. Elle sera synchronisée ultérieurement.', { icon: <WifiOff /> });
             onClose();
         } catch (err) {
             toast.error('Erreur sauvegarde locale');
             console.error(err);
         }
         return;
      }

      // Save online
      setIsSaving(true);
      try {
        await onSave(payload);
      } catch (err) {
        console.error('Erreur lors de la sauvegarde:', err);
        toast.error('Erreur lors de la sauvegarde', {
          description: err instanceof Error ? err.message : 'Une erreur est survenue'
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gradient-to-br from-surface-base to-surface border border-edge rounded-xl max-w-4xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-surface-base/95 backdrop-blur-sm border-b border-edge px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-content-primary">
              {readOnly ? 'Détails de l\'Enquête' : 'Enquête de Crédit'}
            </h2>
            <p className="text-content-muted text-xs">
              Client : {clientNom || (selectedClient ? formatClientName(selectedClient.nom, (selectedClient as any).prenom) : 'Non sélectionné')}
              {readOnly && <span className="ml-2 text-status-success">(Lecture seule)</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-elevated rounded-lg transition text-content-muted hover:text-content-primary"
            data-testid="button-close-enquete"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
          {!clientId && (
            <div className="bg-surface p-3 rounded-lg border border-edge">
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                <User size={14} className="inline mr-1.5" />
                Sélectionner le Client à Enquêter *
              </label>
              <select
                value={formData.client_id}
                onChange={handleClientChange}
                className={`w-full bg-surface-elevated border ${!formData.client_id ? 'border-edge-strong' : 'border-accent'} rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-accent`}
                data-testid="select-client"
              >
                <option value="">-- Choisir un client --</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{formatClientName(client.nom, (client as any).prenom)}</option>
                ))}
              </select>

              {selectedClient && (
                <div className="mt-2 flex items-center gap-3 p-2 bg-surface-elevated/50 rounded-lg">
                  <div className="w-10 h-10 bg-surface-subtle rounded-full flex items-center justify-center overflow-hidden border border-edge-strong">
                    {selectedClient.photoUrl ? (
                      <img src={selectedClient.photoUrl} alt={selectedClient.nom} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-content-primary">{selectedClient.nom.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-content-primary text-sm">{formatClientName(selectedClient.nom, (selectedClient as any).prenom)}</h3>
                    <p className="text-xs text-accent">Client sélectionné</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-status-info-bg border border-status-info/30 rounded-lg px-3 py-2 flex gap-2 items-center">
            <AlertCircle className="text-status-info flex-shrink-0" size={16} />
            <div className="text-xs text-status-info">
              Cette enquête sera évaluée par un agent terrain puis approuvée par le chef d'agence ou le responsable crédit.
            </div>
          </div>

          {/* Composant de capture GPS amélioré */}
          <GpsCapture
            onCapture={handleGpsCapture}
            onAddressResolved={handleAddressResolved}
            clientCoords={
              selectedClient?.latitude && selectedClient?.longitude
                ? { latitude: parseFloat(selectedClient.latitude), longitude: parseFloat(selectedClient.longitude) }
                : null
            }
          />

          {/* Affichage de l'adresse résolue via Hook */}
          {geoLocation.latitude && geoLocation.longitude && (
             <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">
                <div className="text-[10px] font-semibold text-accent mb-1">Adresse du site</div>
                <LocationDisplay
                  latitude={geoLocation.latitude}
                  longitude={geoLocation.longitude}
                  className="text-content-primary text-sm"
                />
             </div>
          )}

            {/* GPS Security Warning */}
            {geoLocation.distanceFromClient !== null && geoLocation.distanceFromClient !== undefined && geoLocation.distanceFromClient > 200 && (
              <div className="bg-status-danger-bg border border-status-danger/50 rounded-lg px-3 py-2 flex items-start gap-2 animate-pulse">
                 <AlertCircle className="text-status-danger flex-shrink-0 mt-0.5" size={16} />
                 <div>
                    <h4 className="text-status-danger font-bold text-xs">Alerte de Sécurité GPS</h4>
                    <p className="text-status-danger text-[11px] mt-0.5">
                      Position à <span className="font-bold">{Math.round(geoLocation.distanceFromClient)}m</span> de l'adresse connue du client.
                    </p>
                 </div>
              </div>
            )}

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">
              <DollarSign size={14} className="inline mr-1" />
              Montant du crédit demandé (FCFA) *
            </label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.montant_demande}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); handleChange('montant_demande', v); }}
              className={`w-full bg-surface text-content-primary px-3 py-2 rounded-lg border text-sm ${
                errors.montant_demande ? 'border-accent' : 'border-edge-strong'
              } focus:outline-none focus:ring-2 focus:ring-accent`}
              placeholder="500000"
              data-testid="input-montant-demande"
            />
            {errors.montant_demande && <p className="text-accent text-xs mt-0.5">{errors.montant_demande}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">
                <Briefcase size={14} className="inline mr-1" />
                Catégorie d'activité *
              </label>
              <select
                value={formData.categorie_activite}
                onChange={(e) => handleCategorieChange(e.target.value)}
                className="w-full bg-surface text-content-primary px-3 py-2 rounded-lg border border-edge-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                data-testid="select-categorie-activite"
              >
                <option value="">Sélectionner...</option>
                {Object.keys(categoriesActivite).map(categorie => (
                  <option key={categorie} value={categorie}>{categorie}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-secondary mb-1">
                <Briefcase size={14} className="inline mr-1" />
                Type d'activité *
              </label>
              <select
                value={formData.type_activite}
                onChange={(e) => handleChange('type_activite', e.target.value)}
                className={`w-full bg-surface text-content-primary px-3 py-2 rounded-lg border text-sm ${
                  errors.type_activite ? 'border-accent' : 'border-edge-strong'
                } focus:outline-none focus:ring-2 focus:ring-accent`}
                disabled={!formData.categorie_activite}
                data-testid="select-type-activite"
              >
                <option value="">{formData.categorie_activite ? 'Sélectionner...' : 'Catégorie d\'abord'}</option>
                {formData.categorie_activite && categoriesActivite[formData.categorie_activite]?.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.type_activite && <p className="text-accent text-xs mt-0.5">{errors.type_activite}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1">
              <Calendar size={14} className="inline mr-1" />
              Ancienneté dans l'activité *
            </label>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={seniorityValue}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setSeniorityValue(v); }}
                className={`flex-1 bg-surface text-content-primary px-3 py-2 rounded-lg border text-sm ${
                  errors.anciennete_activite ? 'border-accent' : 'border-edge-strong'
                } focus:outline-none focus:ring-2 focus:ring-accent`}
                placeholder={seniorityUnit === 'days' ? '90' : seniorityUnit === 'months' ? '6' : '2'}
              />
              <select
                value={seniorityUnit}
                onChange={(e) => setSeniorityUnit(e.target.value as 'days' | 'months' | 'years')}
                className="bg-surface text-content-primary px-3 py-2 rounded-lg border border-edge-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent min-w-[100px]"
              >
                <option value="days">Jours</option>
                <option value="months">Mois</option>
                <option value="years">Années</option>
              </select>
            </div>
            {seniorityValue && (
              <div className="mt-1 text-xs text-accent flex items-center gap-1">
                <CheckCircle size={10} />
                <span className="font-medium">{formatConversion(parseFloat(seniorityValue), seniorityUnit)}</span>
              </div>
            )}
            {errors.anciennete_activite && <p className="text-accent text-xs mt-0.5">{errors.anciennete_activite}</p>}
          </div>

          <div className="bg-surface p-3 rounded-lg border border-edge">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-content-secondary flex items-center gap-1">
                <TrendingUp size={14} />
                Calcul du Revenu Mensuel
              </label>
              {formData.revenu_mensuel_declare && initialData?.revenus_mensuels && (
                <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">Pré-rempli depuis demande</span>
              )}
            </div>

            <div className="flex bg-surface-elevated/50 p-0.5 rounded-lg w-fit mb-3">
              <button
                type="button"
                onClick={() => handleChange('type_revenu', 'Mensuel')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  formData.type_revenu === 'Mensuel'
                    ? 'bg-accent-secondary text-content-primary shadow'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Revenu Mensuel
              </button>
              <button
                type="button"
                onClick={() => handleChange('type_revenu', 'Journalier')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  formData.type_revenu === 'Journalier'
                    ? 'bg-accent-secondary text-content-primary shadow'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Revenu Journalier
              </button>
            </div>

            {formData.type_revenu === 'Journalier' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-content-muted mb-0.5">Revenu journalier (FCFA)</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.revenu_journalier}
                    onChange={(e) => {
                      const journalier = e.target.value.replace(/[^0-9]/g, '');
                      const mensuel = journalier ? (parseFloat(journalier) * 26).toString() : '';
                      setFormData(prev => ({
                        ...prev,
                        revenu_journalier: journalier,
                        revenu_mensuel_declare: mensuel
                      }));
                    }}
                    className="w-full bg-surface-elevated text-content-primary px-3 py-2 rounded-lg border border-edge-strong text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="10000"
                    data-testid="input-revenu-journalier"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-content-muted mb-0.5">Revenu mensuel calculé *</label>
                  <div className="relative">
                    <input
                      inputMode="numeric"
                      readOnly
                      value={formData.revenu_mensuel_declare}
                      className="w-full bg-surface text-content-primary px-3 py-2 rounded-lg border border-edge text-sm font-semibold cursor-not-allowed"
                      placeholder="260000"
                      data-testid="input-revenu-mensuel"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-accent">Auto</span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] text-content-muted mb-0.5">Revenu mensuel fixe (FCFA) *</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.revenu_mensuel_declare}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); handleChange('revenu_mensuel_declare', v); }}
                  className={`w-full bg-surface-elevated text-content-primary px-3 py-2 rounded-lg border text-sm font-semibold ${
                    errors.revenu_mensuel_declare ? 'border-accent' : 'border-accent/50'
                  } focus:outline-none focus:ring-2 focus:ring-accent`}
                  placeholder="260000"
                  data-testid="input-revenu-mensuel-fixe"
                />
                {errors.revenu_mensuel_declare && <p className="text-accent text-xs mt-0.5">{errors.revenu_mensuel_declare}</p>}
              </div>
            )}

            {formData.type_revenu === 'Journalier' && formData.revenu_journalier && (
              <div className="mt-2 text-xs text-content-muted bg-surface-elevated/30 px-2 py-1.5 rounded flex items-center gap-1.5">
                <TrendingUp size={12} className="text-accent" />
                <span>{parseFloat(formData.revenu_journalier).toLocaleString()} × 26j = <span className="text-accent font-semibold">{(parseFloat(formData.revenu_journalier) * 26).toLocaleString()} FCFA/mois</span></span>
              </div>
            )}

            {/* Live Scoring */}
            {formData.revenu_mensuel_declare && formData.montant_demande && (
               <div className="mt-3 p-2 bg-surface-elevated/30 rounded-lg border border-edge-strong">
                  {(() => {
                      const rev = parseFloat(formData.revenu_mensuel_declare) || 0;
                      const charges = parseFloat(formData.charges_mensuelles) || 0;
                      const montant = parseFloat(formData.montant_demande) || 0;
                      const revenuNet = rev - charges;
                      const echeance = montant / 6; // 6 mois estimation
                      const tauxEndettement = revenuNet > 0 ? (echeance / revenuNet) * 100 : 100;
                      let scoreColor = 'text-status-danger';
                      let scoreText = 'Risqué';
                      if (tauxEndettement < 33) { scoreColor = 'text-status-success'; scoreText = 'Bon'; }
                      else if (tauxEndettement < 45) { scoreColor = 'text-status-warning'; scoreText = 'Correct'; }

                      return (
                        <div className="flex justify-between items-center text-xs">
                           <span className="text-content-muted">Capacité nette: <span className="text-content-primary font-mono">{revenuNet.toLocaleString()}</span></span>
                           <span className={`font-bold ${scoreColor}`}>Endettement: {tauxEndettement.toFixed(0)}% ({scoreText})</span>
                        </div>
                      );
                  })()}
               </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-content-secondary flex items-center gap-1">
                  <FileText size={14} />
                  Description de l'activité *
                </label>
                <span className={`text-[10px] ${
                  formData.description_activite.length >= 10 ? 'text-status-success' :
                  formData.description_activite.length >= 5 ? 'text-status-warning' :
                  'text-content-muted'
                }`}>
                  {formData.description_activite.length}/10
                </span>
              </div>
              <textarea
                value={formData.description_activite}
                onChange={(e) => handleChange('description_activite', e.target.value)}
                rows={2}
                className={`w-full bg-surface text-content-primary px-3 py-2 rounded-lg border text-sm ${
                  errors.description_activite ? 'border-accent' : 'border-edge-strong'
                } focus:outline-none focus:ring-2 focus:ring-accent`}
                placeholder="Produits, emplacement, clientèle..."
                data-testid="textarea-description"
              />
              {errors.description_activite && <p className="text-accent text-xs mt-0.5">{errors.description_activite}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-content-secondary flex items-center gap-1">
                  <DollarSign size={14} />
                  Charges mensuelles
                </label>
                {initialData?.charges_mensuelles && (
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">Pré-rempli</span>
                )}
              </div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.charges_mensuelles}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); handleChange('charges_mensuelles', v); }}
                className={`w-full bg-surface text-content-primary px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-accent ${
                  initialData?.charges_mensuelles ? 'border-accent/50' : 'border-edge-strong'
                }`}
                placeholder="50000"
                data-testid="input-charges"
              />
            </div>
          </div>

          <div className="bg-surface p-3 rounded-lg border border-edge">
            <label className="block text-xs font-semibold text-content-secondary mb-2">
              <Camera size={14} className="inline mr-1" />
              Photos de l'activité
              {!readOnly && (
                <span className="ml-1.5 text-content-muted font-normal">
                  ({formData.photos_activite.length}/{MAX_PHOTOS})
                </span>
              )}
              {readOnly && formData.photos_activite.length > 0 && (
                <span className="ml-1.5 text-content-muted font-normal">
                  ({formData.photos_activite.length})
                </span>
              )}
            </label>

            <div className="flex flex-wrap gap-2">
              {!readOnly && formData.photos_activite.length < MAX_PHOTOS && (
                <>
                  <label className="flex flex-col items-center justify-center w-20 h-20 bg-surface-elevated/50 border-2 border-dashed border-edge-strong rounded-lg cursor-pointer hover:border-accent transition">
                    <Upload size={18} className="text-content-muted mb-1" />
                    <span className="text-[10px] text-content-muted">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="flex flex-col items-center justify-center w-20 h-20 bg-surface-elevated/50 border-2 border-dashed border-edge-strong rounded-lg cursor-pointer hover:border-accent transition"
                  >
                    <Camera size={18} className="text-content-muted mb-1" />
                    <span className="text-[10px] text-content-muted">Camera</span>
                  </button>
                </>
              )}

              {!readOnly && formData.photos_activite.length >= MAX_PHOTOS && (
                <div className="flex items-center justify-center w-20 h-20 bg-surface-elevated/30 border-2 border-dashed border-edge rounded-lg">
                  <span className="text-[10px] text-content-muted text-center px-1">Max {MAX_PHOTOS} photos</span>
                </div>
              )}

              {formData.photos_activite.map((photo, index) => (
                <div key={index} className="relative w-20 h-20">
                  <img
                    src={getPhotoDisplayUrl(photo)}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                    onError={(e) => {
                      // Show placeholder on error
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect fill="%23374151" width="80" height="80"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239CA3AF" font-size="10">Erreur</text></svg>';
                    }}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-status-danger rounded-full flex items-center justify-center text-white text-[10px]"
                    >×</button>
                  )}
                </div>
              ))}

              {readOnly && formData.photos_activite.length === 0 && (
                <p className="text-xs text-content-muted italic">Aucune photo d'activité</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Autres crédits */}
            <div className="bg-surface p-3 rounded-lg border border-edge">
              <label className="block text-xs font-semibold text-content-secondary mb-2">Autres crédits en cours</label>

              <div className="space-y-2 mb-2">
                <input
                  type="text"
                  value={autreCredit.organisme}
                  onChange={(e) => setAutreCredit({ ...autreCredit, organisme: e.target.value })}
                  placeholder="Nom de l'organisme"
                  className="w-full bg-surface-elevated text-content-primary px-2 py-1.5 rounded text-xs border border-edge-strong focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex gap-1.5">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={autreCredit.montant}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setAutreCredit({ ...autreCredit, montant: v }); }}
                    placeholder="Montant FCFA"
                    className="flex-1 min-w-0 bg-surface-elevated text-content-primary px-2 py-1.5 rounded text-xs border border-edge-strong focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={ajouterAutreCredit}
                    disabled={!autreCredit.organisme || !autreCredit.montant}
                    className="bg-accent-secondary hover:bg-accent-secondary-hover disabled:bg-surface-subtle disabled:cursor-not-allowed text-content-primary w-8 h-8 rounded text-sm font-bold flex items-center justify-center shrink-0 transition"
                  >+</button>
                </div>
              </div>

              {formData.autres_credits.length > 0 && (
                <div className="space-y-1">
                  {formData.autres_credits.map((credit, index) => (
                    <div key={index} className="flex items-center justify-between bg-surface-elevated/50 px-2 py-1.5 rounded text-xs gap-2">
                      <span className="text-content-primary truncate flex-1"><span className="text-status-warning font-medium">{credit.organisme}</span> - {parseInt(credit.montant).toLocaleString()} FCFA</span>
                      <button type="button" onClick={() => retirerAutreCredit(index)} className="text-status-danger hover:text-status-danger shrink-0 w-5 h-5 flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Garanties */}
            <div className="bg-surface p-3 rounded-lg border border-edge">
              <label className="block text-xs font-semibold text-content-secondary mb-2">Garanties proposées</label>

              <div className="space-y-2 mb-2">
                <select
                  value={garantie.type}
                  onChange={(e) => setGarantie({ ...garantie, type: e.target.value })}
                  className="w-full bg-surface-elevated text-content-primary px-2 py-1.5 rounded text-xs border border-edge-strong focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">-- Type de garantie --</option>
                  {typesGaranties.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={garantie.description}
                    onChange={(e) => setGarantie({ ...garantie, description: e.target.value })}
                    placeholder="Description de la garantie"
                    className="flex-1 min-w-0 bg-surface-elevated text-content-primary px-2 py-1.5 rounded text-xs border border-edge-strong focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={ajouterGarantie}
                    disabled={!garantie.type || !garantie.description}
                    className="bg-accent-secondary hover:bg-accent-secondary-hover disabled:bg-surface-subtle disabled:cursor-not-allowed text-content-primary w-8 h-8 rounded text-sm font-bold flex items-center justify-center shrink-0 transition"
                  >+</button>
                </div>
              </div>

              {formData.garanties_proposees.length > 0 && (
                <div className="space-y-1">
                  {formData.garanties_proposees.map((g, index) => (
                    <div key={index} className="flex items-center justify-between bg-surface-elevated/50 px-2 py-1.5 rounded text-xs gap-2">
                      <span className="text-content-primary truncate flex-1"><span className="text-accent font-medium">{g.type}</span> - {g.description}</span>
                      <button type="button" onClick={() => retirerGarantie(index)} className="text-status-danger hover:text-status-danger shrink-0 w-5 h-5 flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          </fieldset>

          {/* Missing fields indicator - only show in edit mode */}
          {!readOnly && !isFormValid() && getMissingFields().length > 0 && (
            <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg px-3 py-2">
              <p className="text-status-warning text-xs font-medium flex items-center gap-1.5">
                <AlertCircle size={14} />
                Champs obligatoires manquants :
              </p>
              <p className="text-status-warning/80 text-xs mt-1">
                {getMissingFields().join(' • ')}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {readOnly ? (
              // Read-only mode: only show close button
              <button
                type="button"
                onClick={onClose}
                className="w-full px-4 py-2.5 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-lg font-medium text-sm transition"
              >
                Fermer
              </button>
            ) : (
              // Edit mode: show cancel and save buttons
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-medium text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!isFormValid() || isSaving}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition flex items-center justify-center gap-1.5 ${
                    isFormValid() && !isSaving
                      ? 'bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary cursor-pointer'
                      : 'bg-surface-elevated text-content-muted cursor-not-allowed'
                  }`}
                  data-testid="button-submit-enquete"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
    
    {isCameraOpen && (
      <CameraCapture
        isOpen={isCameraOpen}
        onCapture={handleLiveCameraCapture}
        onClose={() => setIsCameraOpen(false)}
      />
    )}
    </>
  );
}
