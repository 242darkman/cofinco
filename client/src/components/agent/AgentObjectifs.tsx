import React, { useState, useEffect } from 'react';
import { Target, TrendingUp, Award, Plus, Check, BarChart3, DollarSign, RefreshCw, Loader2, Minus, ChevronLeft, ChevronRight, Eye, Calendar, UserCheck, X } from 'lucide-react';
import { StatutObjectif } from '@shared/enum/status-constants';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { authService } from '../../lib/auth';
import { currencySymbol } from '@shared/config/currency';

interface Objectif {
  id: string;
  agentId: string;
  periode: string;
  typeObjectif: string;
  valeurObjectif: number;
  valeurRealisee: number;
  unite: string;
  statut: string;
  recompense: number;
  createdAt: string;
  agent?: {
    nom: string;
    prenom: string;
  };
}

export default function AgentObjectifs({ agentId }: { agentId?: string }) {
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPeriode, setSelectedPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [recalculating, setRecalculating] = useState<string | null>(null);

  const isAdmin = authService.isAdmin();
  const isSupervisor = authService.hasRole?.('superviseur') || authService.hasRole?.('chef_agence') || false;
  const canManage = isAdmin || isSupervisor;

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 4;

  // Detail Sheet
  const [selectedObjectif, setSelectedObjectif] = useState<Objectif | null>(null);
  const [updateValue, setUpdateValue] = useState<string>('');

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    periode: new Date().toISOString().slice(0, 7),
    type_objectif: 'Collecte',
    valeur_objectif: 0,
    unite: currencySymbol(),
    recompense: 0
  });

  useEffect(() => {
    loadObjectifs();
  }, [agentId, selectedPeriode]);

  const loadObjectifs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (agentId) params.append('agentId', agentId);
      if (selectedPeriode) params.append('periode', selectedPeriode);
      
      const response = await fetch(`/api/agent-objectifs?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur');
      
      const data = await response.json();
      setObjectifs(data || []);
    } catch (error) {
      console.error('Erreur:', error);
      setObjectifs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canManage) return;
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/agent-objectifs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...formData, valeur_realisee: 0, statut: 'IN_PROGRESS' })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }
      setShowForm(false);
      loadObjectifs();
      setFormData({
        agent_id: agentId || '',
        periode: new Date().toISOString().slice(0, 7),
        type_objectif: 'Collecte',
        valeur_objectif: 0,
        unite: currencySymbol(),
        recompense: 0
      });
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateRealisation = async () => {
    if (!selectedObjectif || !updateValue) return;
    try {
      const val = Number(updateValue);
      const pourcentage = (val / selectedObjectif.valeurObjectif) * 100;
      let statut = 'IN_PROGRESS';
      if (pourcentage >= 110) statut = 'Depasse';
      else if (pourcentage >= 100) statut = 'Atteint';

      const response = await fetch(`/api/agent-objectifs/${selectedObjectif.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ valeur_realisee: val, statut })
      });
      if (!response.ok) throw new Error('Erreur mise à jour');
      loadObjectifs();
      setSelectedObjectif(null);
      setUpdateValue('');
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const recalculateOne = async (objectifId: string) => {
    try {
      setRecalculating(objectifId);
      const response = await fetch(`/api/agent-objectifs/${objectifId}/recalculate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Erreur recalcul');
      await loadObjectifs();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setRecalculating(null);
    }
  };

  const recalculateAll = async () => {
    if (!agentId) return;
    try {
      setRecalculating('all');
      const response = await fetch('/api/agent-objectifs/recalculate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agentId, periode: selectedPeriode }),
      });
      if (!response.ok) throw new Error('Erreur recalcul global');
      await loadObjectifs();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setRecalculating(null);
    }
  };

  const objectifsAtteints = objectifs.filter(o => o.statut === 'Atteint' || o.statut === 'Depasse').length;
  const totalRecompenses = objectifs.filter(o => o.statut === 'Atteint' || o.statut === 'Depasse').reduce((sum, o) => sum + Number(o.recompense || 0), 0);
  const tauxReussite = objectifs.length > 0 ? (objectifsAtteints / objectifs.length) * 100 : 0;

  // Pagination Logic
  const totalPages = Math.ceil(objectifs.length / ITEMS_PER_PAGE);
  const paginatedObjectifs = objectifs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-3">
      {/* Stats Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<Target size={14} />} label={canManage ? "Total Objectifs" : "Mes Objectifs"} value={objectifs.length.toString()} color="blue" />
        <StatCard icon={<Check size={14} />} label="Atteints" value={objectifsAtteints.toString()} color="green" />
        <StatCard icon={<DollarSign size={14} />} label={canManage ? "Primes" : "Mes Primes"} value={`${(totalRecompenses / 1000).toFixed(0)}k FCFA`} color="emerald" />
        <StatCard icon={<TrendingUp size={14} />} label="Réussite" value={`${tauxReussite.toFixed(0)}%`} color="cyan" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Only Admin/Supervisor can create objectives */}
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? 'Fermer' : 'Définir Objectif'}
          </button>
        )}

        {/* Both can recalculate, but maybe agent shouldn't? Keeping it for now as it syncs data */}
        {objectifs.length > 0 && agentId && (
          <button
            onClick={recalculateAll}
            disabled={recalculating !== null}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
          >
            {recalculating === 'all' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualiser
          </button>
        )}
        
        <div className="ml-auto flex items-center gap-2">
           {!canManage && <span className="text-[10px] text-slate-500 uppercase font-bold">Période:</span>}
           <div className="relative">
            <input type="month" value={selectedPeriode} onChange={(e) => setSelectedPeriode(e.target.value)} className="pl-8 pr-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-bold w-32" />
            <Calendar size={14} className="absolute left-2.5 top-2 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Form Compact (Admin/Supervisor Only) */}
      {canManage && showForm && (
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <FormField label="Période">
                <input type="month" value={formData.periode} onChange={(e) => setFormData({ ...formData, periode: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs" required />
              </FormField>
              <FormField label="Type">
                <select value={formData.type_objectif} onChange={(e) => setFormData({ ...formData, type_objectif: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs">
                  <option value="Collecte">Collecte</option><option value="Clients">Nouveaux Clients</option><option value="Visites">Visites</option><option value="Performance">Performance</option><option value="Prospection">Prospection</option>
                </select>
              </FormField>
              <FormField label="Cible">
                <input type="number" value={formData.valeur_objectif} onChange={(e) => setFormData({ ...formData, valeur_objectif: Number(e.target.value) })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs" required />
              </FormField>
              <FormField label="Unité">
                <select value={formData.unite} onChange={(e) => setFormData({ ...formData, unite: e.target.value })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs">
                  <option value={currencySymbol()}>{currencySymbol()}</option><option value="Clients">Clients</option><option value="Visites">Visites</option><option value="%">%</option><option value="Points">Points</option>
                </select>
              </FormField>
              <FormField label={`Prime (${currencySymbol()})`}>
                <input type="number" value={formData.recompense} onChange={(e) => setFormData({ ...formData, recompense: Number(e.target.value) })} className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs" />
              </FormField>
            </div>
            <button type="submit" disabled={loading} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs mt-2 flex items-center justify-center gap-2">
              <UserCheck size={14} /> Assigner l'Objectif
            </button>
          </form>
        </div>
      )}

      {/* Objectives List - Compact Cards */}
      <div className="grid sm:grid-cols-2 gap-3">
        {loading ? (
             Array(4).fill(0).map((_, i) => <div key={i} className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />)
        ) : objectifs.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
            <Target size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun objectif pour {new Date(selectedPeriode).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
            {!canManage && <p className="text-xs mt-1 text-slate-600">Contactez votre superviseur pour définir vos objectifs.</p>}
          </div>
        ) : (
          paginatedObjectifs.map((obj) => {
            const pct = obj.valeurObjectif > 0 ? (Number(obj.valeurRealisee) / Number(obj.valeurObjectif)) * 100 : 0;
            const isRecalculating = recalculating === obj.id;
            
            return (
              <div 
                key={obj.id} 
                onClick={() => { setSelectedObjectif(obj); setUpdateValue(''); }}
                className={`bg-slate-800 rounded-xl p-4 border transition hover:border-blue-500/50 cursor-pointer group relative overflow-hidden ${
                  obj.statut === 'Atteint' || obj.statut === 'Depasse' ? 'border-green-500/30' : 'border-slate-700'
                }`}
              >
                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 h-1 bg-slate-700 w-full">
                   <div className={`h-full transition-all duration-1000 ${
                     pct >= 100 ? 'bg-green-500' : pct >= 80 ? 'bg-cyan-500' : 'bg-blue-500'
                   }`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>

                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${
                        obj.statut === 'Atteint' || obj.statut === 'Depasse' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        <Target size={14} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{obj.typeObjectif}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">{ALL_STATUS_LABELS[obj.statut] || obj.statut}</span>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className={`text-lg font-bold ${
                        pct >= 100 ? 'text-green-400' : 'text-white'
                      }`}>{pct.toFixed(0)}%</div>
                   </div>
                </div>

                <div className="flex justify-between items-end text-xs">
                   <div className="text-slate-400">
                      <span className="text-white font-bold">{Number(obj.valeurRealisee).toLocaleString()}</span>
                      <span className="mx-1">/</span>
                      <span>{Number(obj.valeurObjectif).toLocaleString()} {obj.unite}</span>
                   </div>
                   {Number(obj.recompense) > 0 && (
                     <div className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                       <DollarSign size={10} /> {Number(obj.recompense / 1000).toFixed(0)}k
                     </div>
                   )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <span className="text-[10px] text-slate-500">Page {currentPage} sur {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"><ChevronLeft size={12} /></button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"><ChevronRight size={12} /></button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedObjectif} onOpenChange={(open) => !open && setSelectedObjectif(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
          {selectedObjectif && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-white flex items-center gap-2">
                  <Target size={16} className="text-blue-400" />
                  Objectif {selectedObjectif.typeObjectif}
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  Période: {new Date(selectedObjectif.periode).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Circular Progress */}
                <div className="flex justify-center py-4">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                      <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={351.86} strokeDashoffset={351.86 - (351.86 * Math.min((selectedObjectif.valeurRealisee / selectedObjectif.valeurObjectif), 1))} className={
                        (selectedObjectif.valeurRealisee / selectedObjectif.valeurObjectif) >= 1 ? 'text-green-500' : 'text-blue-500'
                      } />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white">{((selectedObjectif.valeurRealisee / selectedObjectif.valeurObjectif) * 100).toFixed(0)}%</span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold">{ALL_STATUS_LABELS[selectedObjectif.statut] || selectedObjectif.statut}</span>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Objectif" value={`${selectedObjectif.valeurObjectif.toLocaleString()} ${selectedObjectif.unite}`} />
                  <InfoItem label="Réalisé" value={`${selectedObjectif.valeurRealisee.toLocaleString()} ${selectedObjectif.unite}`} />
                  <InfoItem label="Récompense" value={`${selectedObjectif.recompense.toLocaleString()} FCFA`} />
                  <InfoItem label="Reste à faire" value={`${Math.max(0, selectedObjectif.valeurObjectif - selectedObjectif.valeurRealisee).toLocaleString()} ${selectedObjectif.unite}`} />
                </div>

                {/* Update Actions */}
                <div className="pt-4 border-t border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                     <h4 className="text-xs font-bold text-slate-500 uppercase">Mise à jour</h4>
                     <button
                       onClick={() => recalculateOne(selectedObjectif.id)}
                       disabled={recalculating !== null}
                       className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                     >
                       {recalculating === selectedObjectif.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                       Recalculer auto
                     </button>
                  </div>
                  
                  {/* Both roles can update progress manually if needed, or we can restrict it. 
                      Let's allow agents to update manual goals (like self-reported visits) but maybe warn/audit.
                      For now, keeping it open as "Mise à jour manuelle" implies correction. */}
                  {selectedObjectif.statut === StatutObjectif.IN_PROGRESS && (
                    <div className="flex gap-2">
                       <input
                         type="number"
                         value={updateValue}
                         onChange={(e) => setUpdateValue(e.target.value)}
                         placeholder="Nouvelle valeur..."
                         className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                       />
                       <button
                         onClick={updateRealisation}
                         disabled={!updateValue}
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs"
                       >
                         Mettre à jour
                       </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400',
    green: 'from-green-500/20 to-green-600/5 border-green-500/20 text-green-400',
    cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20 text-cyan-400',
    emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
  };
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1"><div className="p-1.5 rounded-lg bg-white/5">{icon}</div></div>
      <div className="text-lg font-bold text-white truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
      <div className="text-[10px] uppercase font-bold text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm font-medium text-slate-200 truncate">{value}</div>
    </div>
  );
}
