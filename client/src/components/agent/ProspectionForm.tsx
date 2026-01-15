import React, { useState } from 'react';
import { X, Save, User, Phone, MapPin, Briefcase, DollarSign, FileText, Camera, Image, Video, AlertTriangle, TrendingUp } from 'lucide-react';
import { prospectionApi } from '../../lib/api-client';
import { toast } from 'sonner';
import FaceLivenessCapture from '../security/FaceLivenessCapture';
import { usePermissions } from '../auth/ProtectedFeature';
import { useMinIOUpload } from '../../hooks/useMinIOUpload';

interface ProspectionFormProps {
  agentId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProspectionForm({ agentId, onClose, onSuccess }: ProspectionFormProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateProspections = hasPermission('agent_terrain', 'create') || hasPermission('prospection', 'create');

  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom_prospect: '',
    prenom_prospect: '',
    telephone_prospect: '',
    adresse_prospect: '',
    localisation: '',
    type_activite: '',
    description_activite: '',
    type_revenu: 'Mensuel',
    revenu_journalier: '',
    jours_travail_mois: '26',
    revenu_estime: '',
    chiffre_affaires_mensuel: '',
    interet_credit: false,
    montant_souhaite: '',
    objet_credit: '',
    commentaires_agent: '',
    observations: '',
    priorite: 'normale',
    photo_url: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const typesActivite = [
    'Commerce général',
    'Commerce alimentaire',
    'Commerce vestimentaire',
    'Agriculture',
    'Élevage',
    'Artisanat',
    'Transport',
    'Services',
    'Restaurant/Bar',
    'Salon de coiffure',
    'Autre'
  ];

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom_prospect.trim()) {
      newErrors.nom_prospect = 'Le nom est requis';
    }

    if (!formData.telephone_prospect.trim()) {
      newErrors.telephone_prospect = 'Le téléphone est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    if (!agentId) {
      toast.error('Agent non spécifié');
      return;
    }
    
    setIsLoading(true);
    try {
      const prospectionData = {
        agentId,
        nomProspect: formData.nom_prospect,
        prenomProspect: formData.prenom_prospect,
        telephoneProspect: formData.telephone_prospect,
        adresseProspect: formData.adresse_prospect,
        localisation: formData.localisation,
        typeActivite: formData.type_activite,
        descriptionActivite: formData.description_activite,
        typeRevenu: formData.type_revenu,
        revenuJournalier: parseFloat(formData.revenu_journalier) || 0,
        joursTravailMois: parseInt(formData.jours_travail_mois) || 26,
        revenuEstime: parseFloat(formData.revenu_estime) || 0,
        chiffreAffairesMensuel: parseFloat(formData.chiffre_affaires_mensuel) || 0,
        interetCredit: formData.interet_credit,
        montantSouhaite: formData.montant_souhaite ? parseFloat(formData.montant_souhaite) : null,
        objetCredit: formData.objet_credit,
        commentairesAgent: formData.commentaires_agent,
        observations: formData.observations,
        priorite: formData.priorite,
        photoUrl: formData.photo_url,
        statut: 'nouveau'
      };
      
      await prospectionApi.create(prospectionData);
      toast.success('Prospection enregistrée avec succès');
      onSuccess();
    } catch (error: any) {
      console.error('Error saving prospection:', error);
      toast.error(error.error || 'Erreur lors de l\'enregistrement de la prospection');
    } finally {
      setIsLoading(false);
    }
  };

  const { uploadFile, isUploading: isUploadingPhoto } = useMinIOUpload({
    path: 'prospections',
    isPublic: false,
    onError: (err) => toast.error(`Erreur upload: ${err.message}`)
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = await uploadFile(file);
      if (url) {
        handleChange('photo_url', url);
        setShowPhotoOptions(false);
      }
    }
  };

  const handleLiveCameraCapture = async (imageDataUrl: string) => {
    try {
      const res = await fetch(imageDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `prospect_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadFile(file);
      if (url) {
        handleChange('photo_url', url);
        setShowPhotoOptions(false);
      }
    } catch (e) {
      console.error("Camera upload failed", e);
      toast.error("Erreur upload caméra");
    }
  };

  return (
    <>
      {showPhotoOptions && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-sm border border-slate-700 shadow-2xl transform transition-all scale-100">
            <h3 className="text-lg font-bold text-white mb-6 text-center">Ajouter une photo</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-4 w-full p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 rounded-xl cursor-pointer transition group">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition">
                  <Image size={20} className="text-blue-400 group-hover:text-blue-300" />
                </div>
                <div className="flex-1">
                  <span className="block text-white font-semibold">Importer depuis la galerie</span>
                  <span className="text-xs text-slate-400">Choisir une image existante</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              
              <button
                type="button"
                onClick={() => {
                  setShowPhotoOptions(false);
                  setIsCameraOpen(true);
                }}
                className="flex items-center gap-4 w-full p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500/50 rounded-xl cursor-pointer transition group"
                data-testid="button-open-live-camera-prospection"
              >
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition">
                  <Video size={20} className="text-cyan-400 group-hover:text-cyan-300" />
                </div>
                <div className="flex-1 text-left">
                  <span className="block text-white font-semibold">Caméra en direct</span>
                  <span className="text-xs text-slate-400">Activer la caméra pour capturer</span>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowPhotoOptions(false)}
              className="mt-6 w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition font-medium"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Nouvelle Prospection Client
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Enregistrez les informations d'un client potentiel
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center overflow-hidden shadow-xl">
                {formData.photo_url ? (
                  <img src={formData.photo_url} alt="Prospect" className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-slate-500" />
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoOptions(true)}
                className="absolute bottom-0 right-0 bg-cyan-500 p-2.5 rounded-full text-white cursor-pointer hover:bg-cyan-600 transition-all shadow-lg hover:scale-110 border-2 border-slate-800"
              >
                <Camera size={20} />
              </button>
            </div>
            <div className="mt-3 text-slate-400 text-sm font-medium">
              Ajouter une photo
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <User size={16} className="inline mr-2" />
                Nom *
              </label>
              <input
                type="text"
                value={formData.nom_prospect}
                onChange={(e) => handleChange('nom_prospect', e.target.value)}
                className={`w-full bg-slate-800 text-white px-4 py-3 rounded-lg border ${
                  errors.nom_prospect ? 'border-blue-500' : 'border-slate-600'
                } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                placeholder="Nom du prospect"
              />
              {errors.nom_prospect && <p className="text-blue-400 text-xs mt-1">{errors.nom_prospect}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <User size={16} className="inline mr-2" />
                Prénom
              </label>
              <input
                type="text"
                value={formData.prenom_prospect}
                onChange={(e) => handleChange('prenom_prospect', e.target.value)}
                className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Prénom du prospect"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Phone size={16} className="inline mr-2" />
                Téléphone *
              </label>
              <div className="flex gap-2">
                <div className="w-24 bg-slate-700 text-white px-4 py-3 rounded-lg border border-slate-600 flex items-center justify-center font-semibold">
                  +242
                </div>
                <input
                  type="tel"
                  value={(formData.telephone_prospect || '').replace('+242', '').trim()}
                  onChange={(e) => {
                    const phoneNumber = e.target.value.replace(/[^\d]/g, '');
                    handleChange('telephone_prospect', '+242' + phoneNumber);
                  }}
                  className={`flex-1 bg-slate-800 text-white px-4 py-3 rounded-lg border ${
                    errors.telephone_prospect ? 'border-blue-500' : 'border-slate-600'
                  } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                  placeholder="05 123 4567"
                  maxLength={11}
                />
              </div>
              {errors.telephone_prospect && <p className="text-blue-400 text-xs mt-1">{errors.telephone_prospect}</p>}
            </div>

            <div className="md:col-span-2 space-y-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
              <label className="block text-sm font-semibold text-slate-300">
                <TrendingUp size={16} className="inline mr-2" />
                Estimation des revenus *
              </label>
              
              <div className="flex bg-slate-700/50 p-1 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type_revenu: 'Mensuel' })}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    formData.type_revenu === 'Mensuel'
                      ? 'bg-cyan-500 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Estimation Mensuelle
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type_revenu: 'Journalier' })}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    formData.type_revenu === 'Journalier'
                      ? 'bg-cyan-500 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Estimation Journalière
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {formData.type_revenu === 'Journalier' ? (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1 font-medium">Revenu journalier (FCFA)</label>
                      <input
                        type="number"
                        value={formData.revenu_journalier}
                        onChange={(e) => {
                          const journalier = e.target.value;
                        const jours = '26';
                          const mensuel = journalier ? (parseFloat(journalier) * parseInt(jours)).toString() : '';
                          setFormData({ 
                            ...formData, 
                            revenu_journalier: journalier, 
                            revenu_estime: mensuel 
                          });
                        }}
                        className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="Ex: 5000"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1 font-medium">Revenu mensuel estimé (FCFA)</label>
                    <input
                      type="number"
                      value={formData.revenu_estime}
                      onChange={(e) => handleChange('revenu_estime', e.target.value)}
                      className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="Ex: 150000"
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1 font-medium">Chiffre d'affaires mensuel (FCFA)</label>
                  <input
                    type="number"
                    value={formData.chiffre_affaires_mensuel}
                    onChange={(e) => handleChange('chiffre_affaires_mensuel', e.target.value)}
                    className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
                    placeholder="Ex: 500000"
                  />
                </div>
              </div>

              {formData.type_revenu === 'Journalier' && formData.revenu_journalier && (
                <div className="bg-cyan-500/10 p-3 rounded-lg border border-cyan-500/20 text-sm text-cyan-400 flex items-center gap-2">
                  <TrendingUp size={14} />
                  <span>Calcul: {parseFloat(formData.revenu_journalier).toLocaleString()} × 26 jours = <span className="font-bold">{(parseFloat(formData.revenu_journalier) * 26).toLocaleString()} FCFA/mois</span></span>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <MapPin size={16} className="inline mr-2" />
                Localisation
              </label>
              <input
                type="text"
                value={formData.localisation}
                onChange={(e) => handleChange('localisation', e.target.value)}
                className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Quartier, ville"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
            >
              Annuler
            </button>
            {canCreateProspections ? (
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={20} />
                {isLoading ? 'Enregistrement...' : 'Enregistrer la Prospection'}
              </button>
            ) : (
              <div className="flex-1 px-6 py-3 bg-amber-500/20 text-amber-400 rounded-lg font-semibold flex items-center justify-center gap-2">
                <AlertTriangle size={20} />
                Permission requise
              </div>
            )}
          </div>
        </form>
      </div>
    </div>

      <FaceLivenessCapture
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleLiveCameraCapture}
        title="Photo du Prospect"
      />
    </>
  );
}
