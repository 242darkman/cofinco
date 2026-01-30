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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 1. HEADER */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
           <div className="flex justify-between items-center mb-4">
              <div>
                 <h2 className="text-xl font-bold text-white">{tontine ? 'Modifier Tontine' : 'Nouvelle Tontine'}</h2>
                 <p className="text-xs text-slate-400">Création d'un cycle d'épargne rotatif</p>
              </div>
              <button onClick={onClose}><X className="text-slate-500 hover:text-white" /></button>
           </div>
           
           {/* Stepper Visuel */}
           <div className="flex items-center justify-between px-2 relative">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -z-0"></div>
              <StepDot step={1} current={step} icon={DollarSign} label="Finance" />
              <StepDot step={2} current={step} icon={Clock} label="Règles" />
              <StepDot step={3} current={step} icon={Users} label="Membres" />
           </div>
        </div>

        {/* 2. BODY (Hauteur Fixe) */}
        <div className="p-8 h-[480px] flex flex-col overflow-y-auto custom-scrollbar">
           
           {/* STEP 1: CONFIGURATION FINANCIÈRE */}
           {step === 1 && (
             <div className="space-y-6 animate-in slide-in-from-right fade-in">
                
                 {/* Quick Template Selector (Scalable & Guided) */}
                 {!tontine && tontinePlans.length > 0 && (
                    <div className="bg-indigo-500/5 rounded-xl p-4 border border-indigo-500/10 mb-2">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                                <TrendingUp size={16} className="text-indigo-400" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-white">Modèles de Configuration</h4>
                                <p className="text-[10px] text-slate-400">Sélectionnez un modèle pour pré-remplir instantanément le formulaire.</p>
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
                                    subLabel: `${p.montant_cotisation.toLocaleString()} FCFA • ${p.nombre_membres} membres`,
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

                <div className="space-y-2">
                   <div className="flex justify-between">
                       <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nom de la Tontine</label>
                       {errors.nom && <span className="text-xs text-red-400">{errors.nom}</span>}
                   </div>
                   <input 
                     placeholder="Ex: Tontine des Commerçants Marché Total" 
                     className={`w-full h-12 bg-slate-900 border ${errors.nom ? 'border-red-500/50' : 'border-slate-700'} rounded-xl px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none`}
                     value={formData.nom}
                     onChange={e => setFormData({...formData, nom: e.target.value})}
                   />
                </div>

                {/* Hero Amount */}
                <div className="space-y-2">
                   <div className="flex justify-between">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Montant Cotisation (FCFA)</label>
                        {errors.montantCotisation && <span className="text-xs text-red-400">{errors.montantCotisation}</span>}
                   </div>
                   <div className="relative group">
                      <input 
                        type="number" 
                        min="0"
                        className={`w-full h-20 bg-slate-900 border-2 ${errors.montantCotisation ? 'border-red-500/50' : 'border-slate-700'} rounded-xl pl-6 pr-6 text-4xl font-bold text-white placeholder-slate-800 outline-none focus:border-indigo-500 transition-all text-center`}
                        placeholder="0"
                        value={formData.montantCotisation || ''}
                        onChange={e => setFormData({...formData, montantCotisation: Number(e.target.value)})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Fréquence</label>
                      <select 
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white outline-none scrollbar-none"
                        value={formData.frequence}
                        onChange={e => setFormData({...formData, frequence: e.target.value})}
                      >
                         <option value={FrequenceTontine.DAILY}>Journalier</option>
                         <option value={FrequenceTontine.WEEKLY}>Hebdomadaire</option>
                         <option value={FrequenceTontine.BIWEEKLY}>Bi-mensuel (2 sem)</option>
                         <option value={FrequenceTontine.MONTHLY}>Mensuel</option>
                      </select>
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Taux Plateforme (%)</label>
                      <div className="relative">
                         <input 
                           type="number" 
                           min="0"
                           step="0.1"
                           className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white outline-none" 
                           value={formData.tauxPlateforme} 
                           onChange={e => setFormData({...formData, tauxPlateforme: Number(e.target.value)})}
                         />
                         <Shield size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      </div>
                   </div>
                </div>
             </div>
           )}

           {/* STEP 2: PLANNING & RÈGLES */}
           {step === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right fade-in">
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Date de Début</label>
                      <input 
                        type="date" 
                        required
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white text-sm outline-none" 
                        value={formData.dateDebut}
                        onChange={e => setFormData({...formData, dateDebut: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nb Membres (Slots)</label>
                      <input 
                        type="number" 
                        min="2"
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white outline-none"
                        value={formData.nombreMembres}
                        onChange={e => setFormData({...formData, nombreMembres: Number(e.target.value)})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Intervalle (Jours)</label>
                      <input 
                        type="number" 
                        min="1"
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white outline-none" 
                        value={formData.intervalleCotisation} 
                        onChange={e => setFormData({...formData, intervalleCotisation: Number(e.target.value)})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Délai Pénalité (Jours)</label>
                      <input 
                        type="number"
                        min="0" 
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white outline-none" 
                        value={formData.delaiPenalite} 
                        onChange={e => setFormData({...formData, delaiPenalite: Number(e.target.value)})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Date de Fin (Optionnel)</label>
                      <input 
                        type="date" 
                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white text-sm outline-none" 
                        value={formData.dateFin}
                        onChange={e => setFormData({...formData, dateFin: e.target.value})}
                      />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-500 uppercase ml-1">Description / Notes</label>
                   <textarea 
                     className="w-full h-24 bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-sm outline-none resize-none focus:border-indigo-500" 
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
                   <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">
                      Participants ({selectedMembers.length} / {formData.nombreMembres})
                   </label>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      {/* Active Members */}

                      {selectedClientObjects.map(client => {
                         const photoUrl = resolveStorageUrl(client.photoProfile || client.photoUrl);
                         return (
                            <div key={client.id} className="flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl animate-in zoom-in-95">
                                 <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden relative">
                                    {photoUrl ? (
                                        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span>{client.prenom?.charAt(0) || client.nom?.charAt(0)}</span>
                                    )}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-white truncate">{formatClientName(client.nom, client.prenom)}</div>
                                    <div className="text-[10px] text-indigo-300 truncate">{client.telephone}</div>
                                 </div>
                                 <button onClick={() => toggleMember(client.id)} className="text-slate-400 hover:text-white">
                                    <X size={16} />
                                 </button>
                             </div>
                         );
                      })}

                      {/* Empty Slots */}
                      {Array.from({ length: Math.max(0, formData.nombreMembres - selectedMembers.length) }).map((_, i) => (
                         <div key={`empty-${i}`} className="flex items-center gap-3 p-3 bg-slate-900/50 border border-dashed border-slate-800 rounded-xl opacity-60">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                               <Users size={14} />
                            </div>
                            <div className="text-xs font-medium text-slate-500">Place libre {selectedMembers.length + i + 1}</div>
                         </div>
                      ))}
                   </div>
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Summary & Nav) */}
        <div className="bg-slate-900 border-t border-slate-800 p-4">
           
           {/* Live Summary Bar */}
           <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800 mb-4">
              <div className="flex flex-col">
                 <span className="text-[10px] uppercase font-bold text-slate-500">Pot Total (Estimation)</span>
                 <span className="text-lg font-bold text-emerald-400">
                    {new Intl.NumberFormat('fr-FR').format(estimatedPot)} <span className="text-xs text-emerald-600">FCFA</span>
                 </span>
              </div>
              <div className="flex flex-col text-right border-l border-slate-800 pl-4">
                 <span className="text-[10px] uppercase font-bold text-slate-500">Durée Cycle (Est.)</span>
                 <span className="text-sm font-bold text-white">{dureeCycle} Jours</span>
              </div>
           </div>

           <div className="flex justify-between items-center">
              <button 
                onClick={() => step > 1 && setStep(step - 1)}
                className={`px-6 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white transition flex items-center gap-2 ${step === 1 ? 'invisible' : ''}`}
              >
                 <ChevronLeft size={18} /> Précédent
              </button>

              {step < 3 ? (
                <button onClick={() => setStep(step + 1)} className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-900/20">
                   Suivant <ChevronRight size={18} />
                </button>
              ) : (
                <button 
                    onClick={handleSubmit} 
                    disabled={loading}
                    className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                   {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div> : <CheckCircle size={18} />}
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
    <div className="relative z-10 flex flex-col items-center gap-1.5">
       <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-500 border border-slate-700'} ${isCurrent ? 'ring-4 ring-indigo-500/20 scale-110' : ''}`}>
          <Icon size={18} />
       </div>
       <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-white' : 'text-slate-600'}`}>{label}</span>
    </div>
  )
}
