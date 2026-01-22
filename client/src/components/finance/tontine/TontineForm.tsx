import React, { useState, useEffect } from 'react';
import { X, Check, Calendar, DollarSign, Users, FileText, UserPlus, Search, Info, TrendingUp } from 'lucide-react';
import { tontineApi, clientApi, tontinePlanApi } from '../../../lib/api-client';
import { Modal, FormField, SelectField, Button, Card, Badge, IconButton, TextareaField, LoadingSpinner } from '../../ui';
import { formatClientName } from '../../../lib/format';
import {
  StatutClient,
  StatutTontine,
  FrequenceTontine,
  TypeDistributionTontine,
  FREQUENCE_TONTINE_LABELS,
  FREQUENCE_TONTINE_OPTIONS,
} from '@shared/enum/status-constants';

type FrequenceTontineValue = typeof FrequenceTontine[keyof typeof FrequenceTontine];
type StatutTontineValue = typeof StatutTontine[keyof typeof StatutTontine];

interface Tontine {
  id: string;
  nom: string;
  description: string;
  montantCotisation: number;
  tauxPlateforme: number;
  intervalleCotisation: number;
  delaiPenalite: number;
  frequence: FrequenceTontineValue | string; // Support legacy FR values
  dateDebut: string;
  dateFin: string | null;
  statut: StatutTontineValue | string; // Support legacy FR values
  nombreMembres?: number;
}

interface TontineFormProps {
  tontine: Tontine | null;
  onClose: () => void;
  onSave: () => void;
}

export default function TontineForm({ tontine, onClose, onSave }: TontineFormProps) {
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    montantCotisation: 0,
    tauxPlateforme: 0,
    intervalleCotisation: 1,
    delaiPenalite: 2,
    nombreMembres: 10,
    frequence: FrequenceTontine.DAILY as FrequenceTontineValue,
    dateDebut: new Date().toISOString().split('T')[0],
    dateFin: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMemberSelection, setShowMemberSelection] = useState(false);
  const [tontinePlans, setTontinePlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const fetchPlans = async () => {
    setLoadingPlans(true);
    try {
      const data = await tontinePlanApi.getAll();
      setTontinePlans(data?.filter((p: any) => p.actif) || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoadingPlans(false);
    }
  };

  const applyPlan = (planId: string) => {
    const plan = tontinePlans.find(p => p.id === planId);
    if (!plan) return;

    setFormData(prev => ({
      ...prev,
      nom: prev.nom || plan.nom,
      description: prev.description || plan.description || '',
      montantCotisation: plan.montant_cotisation,
      nombreMembres: plan.nombre_membres,
      tauxPlateforme: plan.taux_plateforme,
      frequence: plan.frequence as FrequenceTontineValue,
    }));
  };

  useEffect(() => {
    fetchClients();
    fetchPlans();
    if (tontine) {
      setFormData({
        nom: tontine.nom,
        description: tontine.description || '',
        montantCotisation: Number(tontine.montantCotisation) || 0,
        tauxPlateforme: Number(tontine.tauxPlateforme) || 0,
        intervalleCotisation: tontine.intervalleCotisation || 1,
        delaiPenalite: tontine.delaiPenalite || 2,
        nombreMembres: tontine.nombreMembres || 10,
        frequence: tontine.frequence as FrequenceTontineValue,
        dateDebut: tontine.dateDebut?.split('T')[0] || new Date().toISOString().split('T')[0],
        dateFin: tontine.dateFin ? tontine.dateFin.split('T')[0] : '',
      });
      fetchExistingMembers();
    }
  }, [tontine]);

  const fetchClients = async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const fetchExistingMembers = async () => {
    if (!tontine) return;
    try {
      const data = await tontineApi.getMembres(tontine.id);
      setSelectedMembers(data?.map((m: any) => m.clientId) || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const calculerMontantFinal = () => {
    const cotisationTotale = formData.montantCotisation * formData.nombreMembres;
    const fraisPlateforme = cotisationTotale * (formData.tauxPlateforme / 100);
    return cotisationTotale - fraisPlateforme;
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom.trim()) newErrors.nom = 'Le nom est requis';
    if (formData.montantCotisation <= 0) newErrors.montantCotisation = 'Le montant doit être supérieur à 0';
    if (!formData.dateDebut) newErrors.dateDebut = 'La date de début est requise';
    if (formData.dateFin && formData.dateFin < formData.dateDebut) {
      newErrors.dateFin = 'La date de fin doit être après la date de début';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const dataToSave = {
        nom: formData.nom,
        description: formData.description,
        montantCotisation: formData.montantCotisation.toString(),
        tauxPlateforme: formData.tauxPlateforme.toString(),
        intervalleCotisation: formData.intervalleCotisation,
        delaiPenalite: formData.delaiPenalite,
        nombreMembres: formData.nombreMembres,
        typeDistribution: TypeDistributionTontine.ROTATING,
        frequence: formData.frequence,
        dateDebut: new Date(formData.dateDebut).toISOString(),
        dateFin: formData.dateFin ? new Date(formData.dateFin).toISOString() : null,
      };

      let tontineId = tontine?.id;

      if (tontine) {
        await tontineApi.update(tontine.id, dataToSave);
      } else {
        const newTontine = await tontineApi.create(dataToSave);
        tontineId = newTontine.id;
      }

      if (tontineId && selectedMembers.length > 0) {
        for (const clientId of selectedMembers) {
          try {
            await tontineApi.addMembre(tontineId, { clientId });
          } catch (e) {
            console.log('Membre peut-être déjà ajouté/ignoré:', e);
          }
        }
      }

      onSave();
    } catch (error) {
      console.error('Erreur sauvegarde tontine:', error);
      setErrors({ general: 'Erreur lors de la sauvegarde' });
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (clientId: string) => {
    setSelectedMembers(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const filteredClients = clients.filter(client => {
    const search = searchTerm.toLowerCase();
    return (
      client.nom?.toLowerCase().includes(search) ||
      client.prenom?.toLowerCase().includes(search) ||
      client.telephone?.toLowerCase().includes(search)
    );
  });

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={tontine ? 'Modifier la tontine' : 'Nouvelle tontine'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit} 
            isLoading={loading}
            icon={Check}
          >
            {tontine ? 'Mettre à jour' : 'Créer la tontine'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {errors.general && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {errors.general}
          </div>
        )}

        {/* Section: Modèles (Uniquement lors de la création) */}
        {!tontine && tontinePlans.length > 0 && (
          <div className="bg-cyan-500/10 p-4 rounded-xl border border-cyan-500/20 mb-2">
            <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                    <TrendingUp size={16} className="text-cyan-400" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-white">Démarrage Rapide</h4>
                    <p className="text-[10px] text-slate-400">Appliquez un modèle pour gagner du temps</p>
                </div>
            </div>
            <SelectField
                label=""
                name="plan_selection"
                value=""
                onChange={(e) => applyPlan(e.target.value)}
                options={[
                  { value: '', label: '-- Sélectionner un modèle --' },
                  ...tontinePlans.map(p => ({ value: p.id, label: `${p.nom} (${p.montant_cotisation.toLocaleString()} FCFA)` }))
                ]}
            />
          </div>
        )}

        {/* Section 1: Informations Générales */}
        <div className="space-y-4">
            <h3 className="text-sm uppercase tracking-wider font-bold text-slate-500 flex items-center gap-2 border-b border-slate-700/50 pb-2">
                <FileText size={14} /> Informations Générales
            </h3>
            
            <FormField
                label="Nom de la tontine"
                name="nom"
                value={formData.nom}
                onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                error={errors.nom}
                placeholder="Ex: Tontine des Commerçants"
                required
            />

            <TextareaField
                label="Description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder="Description de la tontine..."
            />
        </div>

        {/* Section 2: Configuration Financière */}
        <div className="space-y-4">
             <h3 className="text-sm uppercase tracking-wider font-bold text-slate-500 flex items-center gap-2 border-b border-slate-700/50 pb-2">
                <DollarSign size={14} /> Configuration Financière
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    label="Montant cotisation (FCFA)"
                    name="montantCotisation"
                    type="number"
                    min="0"
                    value={formData.montantCotisation}
                    onChange={(e) => setFormData(prev => ({ ...prev, montantCotisation: Number(e.target.value) }))}
                    error={errors.montantCotisation}
                    required
                />
                
                <FormField
                    label="Nombre de membres"
                    name="nombreMembres"
                    type="number"
                    min="2"
                    value={formData.nombreMembres}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombreMembres: Number(e.target.value) }))}
                    required
                />

                <FormField
                    label="Taux plateforme (%)"
                    name="tauxPlateforme"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.tauxPlateforme}
                    onChange={(e) => setFormData(prev => ({ ...prev, tauxPlateforme: Number(e.target.value) }))}
                    helperText="Commission retenue par la plateforme"
                    required
                />

                 <SelectField
                    label="Fréquence"
                    name="frequence"
                    value={formData.frequence}
                    onChange={(e) => setFormData(prev => ({ ...prev, frequence: e.target.value as FrequenceTontineValue }))}
                    options={[
                        { value: FrequenceTontine.DAILY, label: FREQUENCE_TONTINE_LABELS[FrequenceTontine.DAILY] },
                        { value: FrequenceTontine.WEEKLY, label: FREQUENCE_TONTINE_LABELS[FrequenceTontine.WEEKLY] },
                        { value: FrequenceTontine.BIWEEKLY, label: `${FREQUENCE_TONTINE_LABELS[FrequenceTontine.BIWEEKLY]} (2 semaines)` },
                        { value: FrequenceTontine.MONTHLY, label: FREQUENCE_TONTINE_LABELS[FrequenceTontine.MONTHLY] },
                    ]}
                />
            </div>

             {formData.montantCotisation > 0 && formData.nombreMembres > 0 && (
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="text-slate-400 block text-xs">Total par tour</span>
                            <span className="text-lg font-bold text-white">{(formData.montantCotisation * formData.nombreMembres).toLocaleString()} FCFA</span>
                        </div>
                         <div>
                            <span className="text-slate-400 block text-xs">À percevoir</span>
                             <span className="text-lg font-bold text-emerald-400">{calculerMontantFinal().toLocaleString()} FCFA</span>
                        </div>
                         <div>
                            <span className="text-slate-400 block text-xs">Frais plateforme</span>
                             <span className="text-lg font-bold text-amber-500/80">{((formData.montantCotisation * formData.nombreMembres) * (formData.tauxPlateforme / 100)).toLocaleString()} FCFA</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Section 3: Planning & Règles */}
        <div className="space-y-4">
             <h3 className="text-sm uppercase tracking-wider font-bold text-slate-500 flex items-center gap-2 border-b border-slate-700/50 pb-2">
                <Calendar size={14} /> Planning & Règles
            </h3>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField
                    label="Date de début"
                    name="dateDebut"
                    type="date"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData(prev => ({ ...prev, dateDebut: e.target.value }))}
                    error={errors.dateDebut}
                    required
                />
                 <FormField
                    label="Date de fin (Optionnel)"
                    name="dateFin"
                    type="date"
                    value={formData.dateFin}
                    onChange={(e) => setFormData(prev => ({ ...prev, dateFin: e.target.value }))}
                />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    label="Intervalle (en jours)"
                    name="intervalleCotisation"
                    type="number"
                    min="1"
                    value={formData.intervalleCotisation}
                    onChange={(e) => setFormData(prev => ({ ...prev, intervalleCotisation: Number(e.target.value) }))}
                    helperText="Durée d'un cycle de cotisation"
                />
                 <FormField
                    label="Délai pénalité (jours)"
                    name="delaiPenalite"
                    type="number"
                    min="1"
                    value={formData.delaiPenalite}
                    onChange={(e) => setFormData(prev => ({ ...prev, delaiPenalite: Number(e.target.value) }))}
                    helperText="Jours avant application des pénalités"
                />
             </div>
        </div>

         {/* Section 4: Membres */}
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                 <h3 className="text-sm uppercase tracking-wider font-bold text-slate-500 flex items-center gap-2">
                    <Users size={14} /> Membres ({selectedMembers.length})
                </h3>
                 <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowMemberSelection(!showMemberSelection)}
                    icon={showMemberSelection ? X : UserPlus}
                >
                    {showMemberSelection ? 'Fermer' : 'Gérer'}
                </Button>
            </div>

            {showMemberSelection ? (
                 <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                    <div className="p-3 border-b border-slate-700">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                                placeholder="Rechercher un membre..."
                            />
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                        {filteredClients.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <Users size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Aucun client trouvé</p>
                            </div>
                        ) : (
                            filteredClients.map(client => (
                                <div 
                                    key={client.id}
                                    onClick={() => toggleMember(client.id)}
                                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                                        selectedMembers.includes(client.id) 
                                            ? 'bg-cyan-500/10 border border-cyan-500/20' 
                                            : 'hover:bg-slate-700/50 border border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                            selectedMembers.includes(client.id)
                                                ? 'bg-cyan-500 border-cyan-500'
                                                : 'border-slate-500'
                                        }`}>
                                            {selectedMembers.includes(client.id) && <Check size={12} className="text-white" />}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-white">{formatClientName(client.nom, client.prenom)}</div>
                                            <div className="text-xs text-slate-400">{client.telephone} • {client.quartier}</div>
                                        </div>
                                    </div>
                                    <Badge value={client.statut} variant={client.statut === StatutClient.ACTIVE ? 'success' : 'neutral'} />
                                </div>
                            ))
                        )}
                    </div>
                 </div>
            ) : (
                <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700 border-dashed text-center">
                    <p className="text-slate-400 text-sm">
                        {selectedMembers.length === 0 
                            ? "Aucun membre sélectionné. Cliquez sur 'Gérer' pour ajouter des participants."
                            : `${selectedMembers.length} participant(s) sélectionné(s).`}
                    </p>
                </div>
            )}
        </div>
      </div>
    </Modal>
  );
}
