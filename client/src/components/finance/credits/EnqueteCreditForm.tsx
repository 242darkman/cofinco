import React, { useState, useEffect, useRef } from 'react';
import { X, Save, DollarSign, Briefcase, FileText, Camera, Upload, MapPin, TrendingUp, AlertCircle, User, Loader2, CheckCircle, Calendar, Video, WifiOff, Clock } from 'lucide-react';
import CameraCapture from '../../shared/CameraCapture';
import { db } from '../../../lib/offline-db';
import { toast } from 'sonner';

interface Client {
  id: string;
  nom: string;
  photo_url?: string;
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
  distanceFromClient?: number | null; // Distance from client's declared address
}

export default function EnqueteCreditForm({ clientId, clientNom, initialData, onClose, onSave }: EnqueteCreditFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const [geoLocation, setGeoLocation] = useState<GeoLocation>({
    latitude: null,
    longitude: null,
    accuracy: null,
    timestamp: null,
    distanceFromClient: null
  });
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    client_id: clientId || initialData?.client_id || '',
    montant_demande: initialData?.montant_demande || '',
    categorie_activite: initialData?.categorie_activite || '',
    type_activite: initialData?.type_activite || '',
    anciennete_activite: initialData?.anciennete_activite || '',
    description_activite: initialData?.objet_credit || '', 
    revenu_journalier: '',
    jours_travail_mois: '26',
    revenu_mensuel_declare: '',
    type_revenu: 'Mensuel', // 'Mensuel' or 'Journalier'
    charges_mensuelles: '',
    autres_credits: [] as any[],
    garanties_proposees: [] as any[],
    photos_activite: [] as string[],
    documents_justificatifs: [] as string[],
  });

  useEffect(() => {
    if (!clientId) {
      loadClients();
    }
  }, [clientId]);

  useEffect(() => {
    const revenuJournalier = parseFloat(formData.revenu_journalier) || 0;
    const joursTravail = parseInt(formData.jours_travail_mois) || 26;
    const revenuMensuel = revenuJournalier * joursTravail;
    if (revenuJournalier > 0) {
      setFormData(prev => ({ ...prev, revenu_mensuel_declare: revenuMensuel.toString() }));
    }
  }, [formData.revenu_journalier, formData.jours_travail_mois]);

  const loadClients = async () => {
    try {
      const res = await fetch('/api/clients?status=Actif', {
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Erreur chargement clients');

      const data = await res.json();
      setClients(data);
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

  const captureGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        let distance = null;
        if (selectedClient && selectedClient.latitude && selectedClient.longitude) {
            distance = haversineDistance(
                position.coords.latitude,
                position.coords.longitude,
                parseFloat(selectedClient.latitude),
                parseFloat(selectedClient.longitude)
            );
        }

        setGeoLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(),
          distanceFromClient: distance
        });
        setGeoLoading(false);
      },
      (error) => {
        let errorMessage = 'Erreur lors de la capture de la position';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Permission de géolocalisation refusée';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Position non disponible';
            break;
          case error.TIMEOUT:
            errorMessage = 'Délai de géolocalisation dépassé';
            break;
        }
        setGeoError(errorMessage);
        setGeoLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({
            ...prev,
            photos_activite: [...prev.photos_activite, reader.result as string]
          }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photos_activite: prev.photos_activite.filter((_, i) => i !== index)
    }));
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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({
            ...prev,
            photos_activite: [...prev.photos_activite, reader.result as string]
          }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleLiveCameraCapture = (imageDataUrl: string) => {
    setFormData(prev => ({
      ...prev,
      photos_activite: [...prev.photos_activite, imageDataUrl]
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) {
      newErrors.client_id = 'Veuillez sélectionner un client';
    }

    if (!formData.montant_demande || parseFloat(formData.montant_demande) <= 0) {
      newErrors.montant_demande = 'Le montant demandé est requis';
    }

    if (!formData.type_activite) {
      newErrors.type_activite = 'Le type d\'activité est requis';
    }

    if (!formData.anciennete_activite) {
      newErrors.anciennete_activite = 'L\'ancienneté est requise';
    }

    if (!formData.description_activite || formData.description_activite.length < 20) {
      newErrors.description_activite = 'Description détaillée requise (min. 20 caractères)';
    }

    if (!formData.revenu_mensuel_declare || parseFloat(formData.revenu_mensuel_declare) <= 0) {
      newErrors.revenu_mensuel_declare = 'Le revenu mensuel est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      const payload = {
        ...formData,
        montant_demande: parseFloat(formData.montant_demande),
        revenu_journalier: parseFloat(formData.revenu_journalier) || 0,
        jours_travail_mois: parseInt(formData.jours_travail_mois) || 26,
        revenu_mensuel_declare: parseFloat(formData.revenu_mensuel_declare),
        type_revenu: formData.type_revenu,
        charges_mensuelles: parseFloat(formData.charges_mensuelles) || 0,
        geo_latitude: geoLocation.latitude,
        geo_longitude: geoLocation.longitude,
        geo_accuracy: geoLocation.accuracy,
        geo_timestamp: geoLocation.timestamp,
        statut: 'en_attente'
      };

      // Offline Check
      if (!navigator.onLine) {
         try {
             await db.enquetes_offline.add({
                 clientId: formData.client_id,
                 data: payload,
                 timestamp: new Date(),
                 synced: 0
             });
             toast.success('Enquête sauvegardée HORS-LIGNE. Elle sera synchronisée ultérieurement.', { icon: <WifiOff /> });
             onClose();
         } catch (err) {
             toast.error('Erreur sauvegarde locale');
             console.error(err);
         }
         return;
      }

      onSave(payload);
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Enquête de Crédit
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Client : {clientNom || selectedClient?.nom || 'Non sélectionné'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
            data-testid="button-close-enquete"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {!clientId && (
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 mb-4">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <User size={16} className="inline mr-2" />
                Sélectionner le Client à Enquêter *
              </label>
              <select
                value={formData.client_id}
                onChange={handleClientChange}
                className={`w-full bg-slate-700 border ${!formData.client_id ? 'border-slate-600' : 'border-blue-500'} rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                data-testid="select-client"
              >
                <option value="">-- Choisir un client --</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.nom}</option>
                ))}
              </select>

              {selectedClient && (
                <div className="mt-4 flex items-center gap-4 p-3 bg-slate-700/50 rounded-lg">
                  <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-slate-500">
                    {selectedClient.photo_url ? (
                      <img src={selectedClient.photo_url} alt={selectedClient.nom} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-white">{selectedClient.nom.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{selectedClient.nom}</h3>
                    <p className="text-sm text-cyan-400">Client sélectionné pour enquête</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex gap-3">
            <AlertCircle className="text-blue-400 flex-shrink-0" size={20} />
            <div className="text-sm text-blue-300">
              Cette enquête sera évaluée par un agent terrain puis approuvée par le chef d'agence ou le responsable crédit.
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              <MapPin size={16} className="inline mr-2" />
              Géolocalisation du site d'activité
            </label>
            
            <div className="flex flex-wrap gap-4 items-center">
              <button
                type="button"
                onClick={captureGeolocation}
                disabled={geoLoading}
                className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition flex items-center gap-2 disabled:opacity-50"
                data-testid="button-capture-gps"
              >
                {geoLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Capture en cours...
                  </>
                ) : (
                  <>
                    <MapPin size={18} />
                    Capturer la position GPS
                  </>
                )}
              </button>

              {geoLocation.latitude && geoLocation.longitude && (
                <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                  <CheckCircle size={18} />
                  <span className="text-sm">
                    Position capturée ({geoLocation.latitude.toFixed(6)}, {geoLocation.longitude.toFixed(6)})
                  </span>
                </div>
              )}
            </div>

            {geoLocation.latitude && (
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div className="bg-slate-700/50 p-2 rounded">
                  <span className="text-slate-400">Latitude:</span>
                  <span className="text-white ml-2" data-testid="text-latitude">{geoLocation.latitude.toFixed(6)}</span>
                </div>
                <div className="bg-slate-700/50 p-2 rounded">
                  <span className="text-slate-400">Longitude:</span>
                  <span className="text-white ml-2" data-testid="text-longitude">{geoLocation.longitude?.toFixed(6)}</span>
                </div>
                <div className="bg-slate-700/50 p-2 rounded">
                  <span className="text-slate-400">Précision:</span>
                  <span className="text-white ml-2" data-testid="text-accuracy">{geoLocation.accuracy?.toFixed(0)}m</span>
                </div>
              </div>
            )}

            {geoError && (
              <div className="mt-2 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {geoError}
              </div>
            )}
          </div>

            {/* GPS Security Warning */}
            {geoLocation.distanceFromClient !== null && geoLocation.distanceFromClient !== undefined && geoLocation.distanceFromClient > 200 && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 flex items-start gap-3 animate-pulse">
                 <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                 <div>
                    <h4 className="text-red-400 font-bold text-sm">Alerte de Sécurité GPS</h4>
                    <p className="text-red-300 text-xs mt-1">
                      La position capturée est à <span className="font-bold">{Math.round(geoLocation.distanceFromClient)}m</span> de l'adresse connue du client. 
                      Veuillez vérifier qu'il ne s'agit pas d'une tentative de fraude.
                    </p>
                 </div>
              </div>
            )}

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <DollarSign size={16} className="inline mr-2" />
              Montant du crédit demandé (FCFA) *
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={formData.montant_demande}
              onChange={(e) => handleChange('montant_demande', e.target.value)}
              className={`w-full bg-slate-800 text-white px-4 py-3 rounded-lg border ${
                errors.montant_demande ? 'border-blue-500' : 'border-slate-600'
              } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              placeholder="500000"
              data-testid="input-montant-demande"
            />
            {errors.montant_demande && <p className="text-blue-400 text-xs mt-1">{errors.montant_demande}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Briefcase size={16} className="inline mr-2" />
                Catégorie d'activité *
              </label>
              <select
                value={formData.categorie_activite}
                onChange={(e) => handleCategorieChange(e.target.value)}
                className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                data-testid="select-categorie-activite"
              >
                <option value="">Sélectionner une catégorie...</option>
                {Object.keys(categoriesActivite).map(categorie => (
                  <option key={categorie} value={categorie}>{categorie}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Briefcase size={16} className="inline mr-2" />
                Type d'activité *
              </label>
              <select
                value={formData.type_activite}
                onChange={(e) => handleChange('type_activite', e.target.value)}
                className={`w-full bg-slate-800 text-white px-4 py-3 rounded-lg border ${
                  errors.type_activite ? 'border-blue-500' : 'border-slate-600'
                } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                disabled={!formData.categorie_activite}
                data-testid="select-type-activite"
              >
                <option value="">
                  {formData.categorie_activite ? 'Sélectionner un type...' : 'Choisir d\'abord une catégorie'}
                </option>
                {formData.categorie_activite && categoriesActivite[formData.categorie_activite]?.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.type_activite && <p className="text-blue-400 text-xs mt-1">{errors.type_activite}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Clock size={16} className="inline mr-2" />
                Ancienneté (mois) *
              </label>
              <input
                type="number"
                min="0"
                value={formData.anciennete_activite}
                onChange={(e) => handleChange('anciennete_activite', e.target.value)}
                className={`w-full bg-slate-800 text-white px-4 py-3 rounded-lg border ${
                  errors.anciennete_activite ? 'border-blue-500' : 'border-slate-600'
                } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                placeholder="Ex: 30"
              />
              {errors.anciennete_activite && <p className="text-blue-400 text-xs mt-1">{errors.anciennete_activite}</p>}
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              <TrendingUp size={16} className="inline mr-2" />
              Calcul du Revenu Mensuel
            </label>
            
            <div className="flex bg-slate-700/50 p-1 rounded-lg w-fit mb-4">
              <button
                type="button"
                onClick={() => handleChange('type_revenu', 'Mensuel')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  formData.type_revenu === 'Mensuel'
                    ? 'bg-cyan-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Revenu Mensuel
              </button>
              <button
                type="button"
                onClick={() => handleChange('type_revenu', 'Journalier')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  formData.type_revenu === 'Journalier'
                    ? 'bg-cyan-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Revenu Journalier
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {formData.type_revenu === 'Journalier' ? (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Revenu journalier (FCFA)</label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={formData.revenu_journalier}
                      onChange={(e) => {
                        const journalier = e.target.value;
                        const jours = '26';
                        const mensuel = journalier ? (parseFloat(journalier) * parseInt(jours)).toString() : '';
                        setFormData(prev => ({
                          ...prev,
                          revenu_journalier: journalier,
                          revenu_mensuel_declare: mensuel
                        }));
                      }}
                      className="w-full bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="10000"
                      data-testid="input-revenu-journalier"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Revenu mensuel calculé (FCFA) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        readOnly
                        value={formData.revenu_mensuel_declare}
                        className={`w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:outline-none font-semibold cursor-not-allowed`}
                        placeholder="260000"
                        data-testid="input-revenu-mensuel"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyan-400">
                        Auto
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="md:col-span-3">
                  <label className="block text-xs text-slate-400 mb-1">Revenu mensuel fixe (FCFA) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.revenu_mensuel_declare}
                    onChange={(e) => handleChange('revenu_mensuel_declare', e.target.value)}
                    className={`w-full bg-slate-700 text-white px-4 py-3 rounded-lg border ${
                      errors.revenu_mensuel_declare ? 'border-blue-500' : 'border-cyan-500'
                    } focus:outline-none focus:ring-2 focus:ring-cyan-500 font-semibold`}
                    placeholder="260000"
                    data-testid="input-revenu-mensuel-fixe"
                  />
                  {errors.revenu_mensuel_declare && <p className="text-blue-400 text-xs mt-1">{errors.revenu_mensuel_declare}</p>}
                </div>
              )}
            </div>
            
            {formData.type_revenu === 'Journalier' && formData.revenu_journalier && (
              <div className="mt-3 text-sm text-slate-400 bg-slate-700/30 p-2 rounded flex items-center gap-2">
                <TrendingUp size={14} className="text-cyan-400" />
                <span>Calcul: {parseFloat(formData.revenu_journalier).toLocaleString()} FCFA × {formData.jours_travail_mois} jours = <span className="text-cyan-400 font-semibold">{(parseFloat(formData.revenu_journalier) * parseInt(formData.jours_travail_mois)).toLocaleString()} FCFA/mois</span></span>
              </div>
            )}
            {/* Live Scoring Visualization (Simplified) */}
            {formData.revenu_mensuel_declare && formData.montant_demande && (
               <div className="mt-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                  <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                    <TrendingUp size={16} className="text-cyan-400" />
                    Analyse Préliminaire (Simulation)
                  </h4>
                  
                  {(() => {
                      const rev = parseFloat(formData.revenu_mensuel_declare) || 0;
                      const charges = parseFloat(formData.charges_mensuelles) || 0; 
                      const montant = parseFloat(formData.montant_demande) || 0;
                      const revenuNet = rev - charges;
                      
                      const echeance = montant / 30; // Estimation journalière sur 30 jours
                      const tauxEndettement = revenuNet > 0 ? (echeance / revenuNet) * 100 : 100;
                      
                      let scoreColor = 'text-red-400';
                      let scoreText = 'Risqué';
                      
                      if (tauxEndettement < 33) { scoreColor = 'text-green-400'; scoreText = 'Excellent'; }
                      else if (tauxEndettement < 45) { scoreColor = 'text-amber-400'; scoreText = 'Correct'; }
                      
                      return (
                        <div className="grid grid-cols-2 gap-4 text-xs">
                           <div>
                             <span className="text-slate-400 block">Capacité mensuelle:</span>
                             <span className="text-white font-mono">{revenuNet.toLocaleString()} FCFA</span>
                           </div>
                           <div>
                             <span className="text-slate-400 block">Taux d'endettement (est. 6 mois):</span>
                             <span className={`font-bold ${scoreColor}`}>{tauxEndettement.toFixed(1)}% ({scoreText})</span>
                           </div>
                        </div>
                      );
                  })()}
               </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <FileText size={16} className="inline mr-2" />
              Description détaillée de l'activité *
            </label>
            <textarea
              value={formData.description_activite}
              onChange={(e) => handleChange('description_activite', e.target.value)}
              rows={4}
              className={`w-full bg-slate-800 text-white px-4 py-3 rounded-lg border ${
                errors.description_activite ? 'border-blue-500' : 'border-slate-600'
              } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
              placeholder="Décrivez en détail l'activité du client, ses produits/services, sa clientèle, son local..."
              data-testid="textarea-description"
            />
            {errors.description_activite && <p className="text-blue-400 text-xs mt-1">{errors.description_activite}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              <DollarSign size={16} className="inline mr-2" />
              Charges mensuelles (FCFA)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              value={formData.charges_mensuelles}
              onChange={(e) => handleChange('charges_mensuelles', e.target.value)}
              className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="50000"
              data-testid="input-charges"
            />
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              <Camera size={16} className="inline mr-2" />
              Photos de l'activité
            </label>
            
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col items-center justify-center w-32 h-32 bg-slate-700/50 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 transition">
                <Upload size={24} className="text-slate-400 mb-2" />
                <span className="text-xs text-slate-400">Télécharger</span>
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
                className="flex flex-col items-center justify-center w-32 h-32 bg-slate-700/50 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 transition"
              >
                <Camera size={24} className="text-slate-400 mb-2" />
                <span className="text-xs text-slate-400">Prendre photo</span>
              </button>
              
              {formData.photos_activite.map((photo, index) => (
                <div key={index} className="relative w-32 h-32">
                  <img
                    src={photo}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Autres crédits en cours
            </label>
            
            <div className="grid md:grid-cols-4 gap-2 mb-3">
              <input
                type="text"
                value={autreCredit.organisme}
                onChange={(e) => setAutreCredit({ ...autreCredit, organisme: e.target.value })}
                placeholder="Organisme"
                className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600"
              />
              <input
                type="number"
                value={autreCredit.montant}
                onChange={(e) => setAutreCredit({ ...autreCredit, montant: e.target.value })}
                placeholder="Montant"
                className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600"
              />
              <input
                type="text"
                value={autreCredit.echeance}
                onChange={(e) => setAutreCredit({ ...autreCredit, echeance: e.target.value })}
                placeholder="Échéance mensuelle"
                className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600"
              />
              <button
                type="button"
                onClick={ajouterAutreCredit}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg transition"
              >
                Ajouter
              </button>
            </div>
            
            {formData.autres_credits.length > 0 && (
              <div className="space-y-2">
                {formData.autres_credits.map((credit, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-700/50 p-2 rounded-lg">
                    <span className="text-white text-sm">
                      {credit.organisme} - {parseInt(credit.montant).toLocaleString()} FCFA ({credit.echeance}/mois)
                    </span>
                    <button
                      type="button"
                      onClick={() => retirerAutreCredit(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Garanties proposées
            </label>
            
            <div className="grid md:grid-cols-4 gap-2 mb-3">
              <select
                value={garantie.type}
                onChange={(e) => setGarantie({ ...garantie, type: e.target.value })}
                className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600"
              >
                <option value="">Type de garantie</option>
                {typesGaranties.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                type="text"
                value={garantie.description}
                onChange={(e) => setGarantie({ ...garantie, description: e.target.value })}
                placeholder="Description"
                className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600"
              />
              <input
                type="number"
                value={garantie.valeur}
                onChange={(e) => setGarantie({ ...garantie, valeur: e.target.value })}
                placeholder="Valeur estimée"
                className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600"
              />
              <button
                type="button"
                onClick={ajouterGarantie}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg transition"
              >
                Ajouter
              </button>
            </div>
            
            {formData.garanties_proposees.length > 0 && (
              <div className="space-y-2">
                {formData.garanties_proposees.map((g, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-700/50 p-2 rounded-lg">
                    <span className="text-white text-sm">
                      {g.type} - {g.description} ({parseInt(g.valeur || '0').toLocaleString()} FCFA)
                    </span>
                    <button
                      type="button"
                      onClick={() => retirerGarantie(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
              data-testid="button-submit-enquete"
            >
              <Save size={20} />
              Enregistrer l'Enquête
            </button>
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
