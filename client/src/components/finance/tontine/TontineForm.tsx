import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Calendar, DollarSign, Clock, ChevronRight, ChevronLeft, 
  CheckCircle, Shield, X, Search, Plus, TrendingUp, AlertCircle
} from 'lucide-react';
import { tontineApi, clientApi, tontinePlanApi } from '../../../lib/api-client';
import { formatClientName, resolveStorageUrl } from '../../../lib/format';
import {
  StatutClient,
  FrequenceTontine,
  TypeDistributionTontine,
} from '@shared/enum/status-constants';
import SearchableSelect from '../../ui/SearchableSelect';

interface TontineFormProps {
  tontine: any | null;
  onClose: () => void;
  onSave: () => void;
}

export default function TontineForm({ tontine, onClose, onSave }: TontineFormProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Data State
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    montantCotisation: 0,
    tauxPlateforme: 0,
    intervalleCotisation: 1, 
    delaiPenalite: 2,
    nombreMembres: 10,
    frequence: 'hebdomadaire' as string, 
    dateDebut: new Date().toISOString().split('T')[0],
    dateFin: '',
  });

  // Auxiliary State
  const [clients, setClients] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [tontinePlans, setTontinePlans] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch Data
  useEffect(() => {
    const initData = async () => {
      try {
        const [clientsData, plansData] = await Promise.all([
          clientApi.getAllList(),
          tontinePlanApi.getAll()
        ]);
        setClients(clientsData || []);
        setTontinePlans(plansData?.filter((p: any) => p.actif) || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    initData();
  }, []);

  // Initialize for Edit Mode
  useEffect(() => {
    if (tontine) {
      setFormData({
        nom: tontine.nom,
        description: tontine.description || '',
        montantCotisation: Number(tontine.montantCotisation) || 0,
        tauxPlateforme: Number(tontine.tauxPlateforme) || 0,
        intervalleCotisation: tontine.intervalleCotisation || 1,
        delaiPenalite: tontine.delaiPenalite || 2,
        nombreMembres: tontine.nombreMembres || 10,
        frequence: tontine.frequence,
        dateDebut: tontine.dateDebut?.split('T')[0] || new Date().toISOString().split('T')[0],
        dateFin: tontine.dateFin ? tontine.dateFin.split('T')[0] : '',
      });
      
      const fetchMembers = async () => {
        try {
          const members = await tontineApi.getMembres(tontine.id);
          setSelectedMembers(members?.map((m: any) => m.clientId) || []);
        } catch (e) {
          console.error(e);
        }
      };
      fetchMembers();
    }
  }, [tontine]);

  // Derived Values
  const estimatedPot = (Number(formData.montantCotisation) || 0) * (Number(formData.nombreMembres) || 0);
  const dureeCycle = (Number(formData.nombreMembres) || 0) * (Number(formData.intervalleCotisation) || 0);

  const filteredClients = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return clients.filter(client => 
      client.nom?.toLowerCase().includes(search) ||
      client.prenom?.toLowerCase().includes(search) ||
      client.telephone?.toLowerCase().includes(search)
    );
  }, [clients, searchTerm]);

  const selectedClientObjects = useMemo(() => {
    return clients.filter(c => selectedMembers.includes(c.id));
  }, [clients, selectedMembers]);

  // Action Handlers
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
      frequence: plan.frequence,
    }));
  };

  const toggleMember = (clientId: string) => {
    setSelectedMembers(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.nom.trim()) newErrors.nom = "Nom requis";
    if (formData.montantCotisation <= 0) newErrors.montantCotisation = "Montant > 0";
    if (!formData.dateDebut) newErrors.dateDebut = "Date requise";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        montantCotisation: formData.montantCotisation.toString(),
        tauxPlateforme: formData.tauxPlateforme.toString(),
        typeDistribution: TypeDistributionTontine.ROTATING,
        dateDebut: new Date(formData.dateDebut).toISOString(),
        dateFin: formData.dateFin ? new Date(formData.dateFin).toISOString() : null,
      };

      let tontineId = tontine?.id;

      if (tontine) {
        await tontineApi.update(tontineId, dataToSave);
      } else {
        const newTontine = await tontineApi.create(dataToSave);
        tontineId = newTontine.id;
      }

      if (tontineId && selectedMembers.length > 0) {
        for (const clientId of selectedMembers) {
           try {
             await tontineApi.addMembre(tontineId, { clientId });
           } catch (e) {
             // Ignore
           }
        }
      }
      onSave(); 
    } catch (e) {
      console.error(e);
      setErrors({ general: "Erreur lors de la sauvegarde" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      
      <div className="w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] bg-surface-base border border-edge rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 1. HEADER */}
        <div className="bg-surface-base border-b border-edge px-4 py-3 sm:px-6 sm:py-4 flex-shrink-0">
           <div className="flex justify-between items-center mb-4">
              <div>
                 <h2 className="text-lg sm:text-xl font-bold text-content-primary">{tontine ? 'Modifier Tontine' : 'Nouvelle Tontine'}</h2>
                 <p className="text-[10px] sm:text-xs text-content-muted">Création d'un cycle d'épargne rotatif</p>
              </div>
              <button onClick={onClose}><X className="text-content-muted hover:text-content-primary w-5 h-5 sm:w-6 sm:h-6" /></button>
           </div>
           
           {/* Stepper Visuel */}
           <div className="flex items-center justify-between px-2 relative">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-surface -z-0"></div>
              <StepDot step={1} current={step} icon={DollarSign} label="Finance" />
              <StepDot step={2} current={step} icon={Clock} label="Règles" />
              <StepDot step={3} current={step} icon={Users} label="Membres" />
           </div>
        </div>

        {/* 2. BODY (Scrollable & Responsive) */}
        <div className="p-4 sm:p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar min-h-0">
           
           {/* STEP 1: CONFIGURATION FINANCIÈRE */}
           {step === 1 && (
             <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right fade-in">
                
                 {/* Quick Template Selector */}
                 {!tontine && tontinePlans.length > 0 && (
                    <div className="bg-accent/5 rounded-xl p-3 sm:p-4 border border-accent/10 mb-2">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-accent/10 rounded-lg">
                                <TrendingUp size={16} className="text-accent" />
                            </div>
                            <div>
                                <h4 className="text-xs sm:text-sm font-bold text-content-primary">Modèles de Configuration</h4>
                                <p className="text-[10px] text-content-muted">Sélectionnez un modèle pour pré-remplir instantanément le formulaire.</p>
                            </div>
                        </div>
                        
                        <div className="relative z-20">
                            <SearchableSelect
                                label=""
                                name="template_selection"
                                placeholder={`Rechercher un modèle parmi ${tontinePlans.length}...`}
                                options={tontinePlans.map(p => ({
                                    value: p.id,
                                    label: p.nom,
                                    subLabel: `${(Number(p.montant_cotisation) || 0).toLocaleString()} FCFA • ${p.nombre_membres ?? 0} membres`,
                                }))}
                                value=""
                                onChange={(val) => applyPlan(val as string)}
                                variant="dark"
                                showAvatarInTrigger={false}
                                className="w-full"
                            />
                        </div>
                    </div>
                 )}

                <div className="space-y-1.5 sm:space-y-2">
                   <div className="flex justify-between">
                       <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Nom de la Tontine</label>
                       {errors.nom && <span className="text-[10px] sm:text-xs text-status-danger">{errors.nom}</span>}
                   </div>
                   <input 
                     placeholder="Ex: Tontine des Commerçants Marché Total" 
                     className={`w-full h-10 sm:h-12 bg-surface-base border ${errors.nom ? 'border-status-danger/50' : 'border-edge'} rounded-xl px-3 sm:px-4 text-sm sm:text-base text-content-primary focus:ring-2 focus:ring-accent outline-none`}
                     value={formData.nom}
                     onChange={e => setFormData({...formData, nom: e.target.value})}
                   />
                </div>

                {/* Hero Amount */}
                <div className="space-y-1.5 sm:space-y-2">
                   <div className="flex justify-between">
                        <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Montant Cotisation (FCFA)</label>
                        {errors.montantCotisation && <span className="text-[10px] sm:text-xs text-status-danger">{errors.montantCotisation}</span>}
                   </div>
                   <div className="relative group">
                      <input 
                        type="number" 
                        min="0"
                        className={`w-full h-16 sm:h-20 bg-surface-base border-2 ${errors.montantCotisation ? 'border-status-danger/50' : 'border-edge'} rounded-xl px-4 sm:px-6 text-3xl sm:text-4xl font-bold text-content-primary placeholder-content-primary outline-none focus:border-accent transition-all text-center`}
                        placeholder="0"
                        value={formData.montantCotisation || ''}
                        onChange={e => setFormData({...formData, montantCotisation: Number(e.target.value)})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Fréquence</label>
                      <select 
                        className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-sm sm:text-base text-content-primary outline-none scrollbar-none"
                        value={formData.frequence}
                        onChange={e => setFormData({...formData, frequence: e.target.value})}
                      >
                         <option value={FrequenceTontine.DAILY}>Journalier</option>
                         <option value={FrequenceTontine.WEEKLY}>Hebdomadaire</option>
                         <option value={FrequenceTontine.BIWEEKLY}>Bi-mensuel (2 sem)</option>
                         <option value={FrequenceTontine.MONTHLY}>Mensuel</option>
                      </select>
                   </div>
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Taux Plateforme (%)</label>
                      <div className="relative">
                         <input 
                           type="number" 
                           min="0"
                           step="0.1"
                           className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-sm sm:text-base text-content-primary outline-none" 
                           value={formData.tauxPlateforme} 
                           onChange={e => setFormData({...formData, tauxPlateforme: Number(e.target.value)})}
                         />
                         <Shield size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted" />
                      </div>
                   </div>
                </div>
             </div>
           )}

           {/* STEP 2: PLANNING & RÈGLES */}
           {step === 2 && (
             <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right fade-in">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Date de Début</label>
                      <input 
                        type="date" 
                        required
                        className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-content-primary text-xs sm:text-sm outline-none" 
                        value={formData.dateDebut}
                        onChange={e => setFormData({...formData, dateDebut: e.target.value})}
                      />
                   </div>
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Nb Membres (Slots)</label>
                      <input 
                        type="number" 
                        min="2"
                        className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-sm sm:text-base text-content-primary outline-none"
                        value={formData.nombreMembres}
                        onChange={e => setFormData({...formData, nombreMembres: Number(e.target.value)})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Intervalle (Jours)</label>
                      <input 
                        type="number" 
                        min="1"
                        className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-sm sm:text-base text-content-primary outline-none" 
                        value={formData.intervalleCotisation} 
                        onChange={e => setFormData({...formData, intervalleCotisation: Number(e.target.value)})}
                      />
                   </div>
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Délai Pénalité (Jours)</label>
                      <input 
                        type="number"
                        min="0" 
                        className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-sm sm:text-base text-content-primary outline-none" 
                        value={formData.delaiPenalite} 
                        onChange={e => setFormData({...formData, delaiPenalite: Number(e.target.value)})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   <div className="space-y-1.5 sm:space-y-2">
                      <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Date de Fin (Optionnel)</label>
                      <input 
                        type="date" 
                        className="w-full h-10 sm:h-12 bg-surface-base border border-edge rounded-xl px-3 sm:px-4 text-content-primary text-xs sm:text-sm outline-none" 
                        value={formData.dateFin}
                        onChange={e => setFormData({...formData, dateFin: e.target.value})}
                      />
                   </div>
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                   <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase ml-1">Description / Notes</label>
                   <textarea 
                     className="w-full h-20 sm:h-24 bg-surface-base border border-edge rounded-xl p-3 sm:p-4 text-content-primary text-xs sm:text-sm outline-none resize-none focus:border-accent" 
                     placeholder="Détails du règlement intérieur..."
                     value={formData.description}
                     onChange={e => setFormData({...formData, description: e.target.value})}
                   />
                </div>
             </div>
           )}

           {/* STEP 3: MEMBRES (Compact Management) */}
           {step === 3 && (
             <div className="space-y-4 animate-in slide-in-from-right fade-in flex flex-col h-full">
                
                {/* Member Search (Dropdown) */}
                <div className="relative z-20">
                   <SearchableSelect
                        label=""
                        name="member_search"
                        placeholder="Rechercher un membre à ajouter..."
                        options={clients
                            .filter(c => !selectedMembers.includes(c.id))
                            .map(c => ({
                                value: c.id,
                                label: formatClientName(c.nom, c.prenom),
                                subLabel: `${c.telephone} • ${c.quartier || 'N/A'}`,
                                image: c.photoProfile || c.photoUrl // Avatar fix
                            }))
                        }
                        value=""
                        onChange={(val) => toggleMember(val as string)}
                        variant="dark"
                        className="w-full"
                   />
                </div>

                {/* Slots Grid */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                   <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase mb-2 block">
                      Participants ({selectedMembers.length} / {formData.nombreMembres})
                   </label>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-6">
                      {/* Active Members */}

                      {selectedClientObjects.map(client => {
                         const photoUrl = resolveStorageUrl(client.photoProfile || client.photoUrl);
                         return (
                            <div key={client.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-accent/10 border border-accent/30 rounded-xl animate-in zoom-in-95">
                                 <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden relative">
                                    {photoUrl ? (
                                        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{client.prenom?.charAt(0) || client.nom?.charAt(0)}</span>
                                    )}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-xs sm:text-sm font-bold text-content-primary truncate">{formatClientName(client.nom, client.prenom)}</div>
                                    <div className="text-[10px] text-accent truncate">{client.telephone}</div>
                                 </div>
                                 <button onClick={() => toggleMember(client.id)} className="text-content-muted hover:text-content-primary">
                                    <X size={16} />
                                 </button>
                             </div>
                         );
                      })}

                      {/* Empty Slots */}
                      {Array.from({ length: Math.max(0, formData.nombreMembres - selectedMembers.length) }).map((_, i) => (
                         <div key={`empty-${i}`} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-surface-base/50 border border-dashed border-edge rounded-xl opacity-60">
                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-content-muted shrink-0">
                               <Users size={14} />
                            </div>
                            <div className="text-[10px] sm:text-xs font-medium text-content-muted">Place libre {selectedMembers.length + i + 1}</div>
                         </div>
                      ))}
                   </div>
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Summary & Nav) */}
        <div className="bg-surface-base border-t border-edge p-3 sm:p-4 flex-shrink-0">
           
           {/* Live Summary Bar */}
           <div className="flex justify-between items-center bg-surface-base p-2 sm:p-3 rounded-xl border border-edge mb-3 sm:mb-4">
              <div className="flex flex-col">
                 <span className="text-[9px] sm:text-[10px] uppercase font-bold text-content-muted">Pot Total (Estimation)</span>
                 <span className="text-base sm:text-lg font-bold text-status-success">
                    {new Intl.NumberFormat('fr-FR').format(estimatedPot)} <span className="text-[10px] sm:text-xs text-status-success/70">FCFA</span>
                 </span>
              </div>
              <div className="flex flex-col text-right border-l border-edge pl-3 sm:pl-4">
                 <span className="text-[9px] sm:text-[10px] uppercase font-bold text-content-muted">Durée Cycle (Est.)</span>
                 <span className="text-xs sm:text-sm font-bold text-content-primary">{dureeCycle} Jours</span>
              </div>
           </div>

           <div className="flex justify-between items-center gap-2 sm:gap-4">
              <button 
                onClick={() => step > 1 && setStep(step - 1)}
                className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl border border-edge text-content-secondary hover:text-content-primary transition flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base ${step === 1 ? 'invisible' : ''}`}
              >
                 <ChevronLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> <span className="hidden xs:inline">Précédent</span>
              </button>

              {step < 3 ? (
                <button onClick={() => setStep(step + 1)} className="px-5 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-accent hover:bg-accent-secondary text-white font-bold transition flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-accent/20 text-sm sm:text-base">
                   Suivant <ChevronRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                </button>
              ) : (
                <button 
                    onClick={handleSubmit} 
                    disabled={loading}
                    className="px-5 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-status-success hover:bg-status-success/90 text-white font-bold transition flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-status-success/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                   {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div> : <CheckCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
                   {tontine ? 'Mettre à jour' : 'Créer la Tontine'}
                </button>
              )}
           </div>
        </div>

      </div>
    </div>
  );
}

// --- Sub-Components ---

function StepDot({ step, current, icon: Icon, label }: any) {
  const active = current >= step;
  const isCurrent = current === step;
  return (
    <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-1.5 w-16 sm:w-20">
       <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-300 ${active ? 'bg-accent text-white shadow-lg' : 'bg-surface text-content-muted border border-edge'} ${isCurrent ? 'ring-2 sm:ring-4 ring-accent/20 scale-105 sm:scale-110' : ''}`}>
          <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
       </div>
       <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-center leading-tight ${active ? 'text-content-primary' : 'text-content-muted'}`}>{label}</span>
    </div>
  )
}
