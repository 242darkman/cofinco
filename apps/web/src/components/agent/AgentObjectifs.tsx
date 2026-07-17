import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Target, TrendingUp, Award, Plus, Check, DollarSign, RefreshCw, ChevronLeft, ChevronRight, Calendar, UserCheck, X, AlertTriangle } from 'lucide-react';
import { StatutObjectif } from '@shared/enum/status-constants';
import { ALL_STATUS_LABELS } from '@/lib/status-labels';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { authService } from '../../lib/auth';
import { useIsAdmin } from '../../contexts/AbilityContext';
import { currencySymbol, formatMoney } from '@shared/config/currency';
import { useAvantages, type Avantage } from '../../hooks/hr/useAvantages';
import { toast } from '../../lib/toast';
import type { Objectif } from './AgentObjectifs.types';

export default function AgentObjectifs({ agentId }: { agentId?: string }) {
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPeriode, setSelectedPeriode] = useState(new Date().toISOString().slice(0, 7));
  const [recalculating, setRecalculating] = useState<string | null>(null);

  const isAdmin = useIsAdmin();
  const isSupervisor = authService.hasRole?.('superviseur') || authService.hasRole?.('chef_agence') || false;
  const canManage = isAdmin || isSupervisor;

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 4;

  // Detail Sheet
  const [selectedObjectif, setSelectedObjectif] = useState<Objectif | null>(null);
  const [updateValue, setUpdateValue] = useState<string>('');

  // Load available PERFORMANCE prize configs
  const { avantagesList } = useAvantages();
  const primeConfigs = avantagesList.filter((a: Avantage) => a.categorie === 'PERFORMANCE');

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    periode: new Date().toISOString().slice(0, 7),
    type_objectif: 'Collecte',
    valeur_objectif: 0,
    unite: currencySymbol(),
    recompense: 0,
    avantageId: null as number | null,
  });

  // Sync agentId prop into form when supervisor selects a different agent
  useEffect(() => {
    if (agentId) {
      setFormData((prev: typeof formData) => ({ ...prev, agent_id: agentId }));
    }
  }, [agentId]);

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
      setObjectifs([]);
    } finally {
      setLoading(false);
    }
  };

  const effectiveAgentId = formData.agent_id || agentId;

  const handleSubmit = async (e: React.FormEvent) => {
    if (!canManage) return;
    e.preventDefault();

    if (!effectiveAgentId) {
      toast.warning('Veuillez sélectionner un agent avant d\'assigner un objectif.', {
        description: 'Utilisez le sélecteur d\'agent en haut à droite de la barre d\'onglets.',
      });
      return;
    }

    if (!formData.valeur_objectif || formData.valeur_objectif <= 0) {
      toast.warning('Veuillez définir une cible supérieure à 0.');
      return;
    }

    setLoading(true);
    try {
      const body = {
        agentId: effectiveAgentId,
        periode: formData.periode,
        typeObjectif: formData.type_objectif,
        valeurObjectif: String(formData.valeur_objectif),
        unite: formData.unite,
        recompense: String(formData.recompense || 0),
        avantageId: formData.avantageId,
      };
      const response = await fetch('/api/agent-objectifs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }
      toast.success('Objectif assigné', {
        description: `${formData.type_objectif} — ${formData.valeur_objectif.toLocaleString()} ${formData.unite}`,
      });
      setShowForm(false);
      loadObjectifs();
      setFormData({
        agent_id: agentId || '',
        periode: new Date().toISOString().slice(0, 7),
        type_objectif: 'Collecte',
        valeur_objectif: 0,
        unite: currencySymbol(),
        recompense: 0,
        avantageId: null,
      });
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la création de l\'objectif.');
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
      toast.success('Réalisation mise à jour.');
      loadObjectifs();
      setSelectedObjectif(null);
      setUpdateValue('');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour.');
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
      toast.success('Objectif recalculé.');
      await loadObjectifs();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du recalcul.');
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
      toast.success('Tous les objectifs ont été recalculés.');
      await loadObjectifs();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du recalcul global.');
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
        <StatCard icon={<DollarSign size={14} />} label={canManage ? "Primes" : "Mes Primes"} value={formatMoney(totalRecompenses, { compact: true })} color="emerald" />
        <StatCard icon={<TrendingUp size={14} />} label="Réussite" value={`${tauxReussite.toFixed(0)}%`} color="cyan" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Only Admin/Supervisor can create objectives */}
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-status-info hover:bg-status-info text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
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
            className="px-3 py-1.5 bg-accent hover:bg-accent-primary-hover disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
          >
            {recalculating === 'all' ? <Spinner size="xs" tone="current" /> : <RefreshCw size={14} />}
            Actualiser
          </button>
        )}
        
        <div className="ml-auto flex items-center gap-2">
           {!canManage && <span className="text-[10px] text-content-muted uppercase font-bold">Période:</span>}
           <div className="relative">
            <input type="month" value={selectedPeriode} onChange={(e) => setSelectedPeriode(e.target.value)} className="pl-8 pr-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs font-bold w-32" />
            <Calendar size={14} className="absolute left-2.5 top-2 text-content-muted" />
          </div>
        </div>
      </div>

      {/* Form Compact (Admin/Supervisor Only) */}
      {canManage && showForm && (
        <div className="bg-surface-base/50 rounded-xl p-4 border border-edge">
          {!effectiveAgentId && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-status-warning/10 border border-status-warning/30 text-status-warning text-xs font-medium">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Aucun agent sélectionné. Utilisez le sélecteur en haut à droite pour choisir un agent.</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <FormField label="Période">
                <input type="month" value={formData.periode} onChange={(e) => setFormData({ ...formData, periode: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" required />
              </FormField>
              <FormField label="Type">
                <select value={formData.type_objectif} onChange={(e) => setFormData({ ...formData, type_objectif: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs">
                  <option value="Collecte">Collecte</option><option value="Clients">Nouveaux Clients</option><option value="Visites">Visites</option><option value="Performance">Performance</option><option value="Prospection">Prospection</option>
                </select>
              </FormField>
              <FormField label="Cible">
                <input type="text" inputMode="numeric" value={formData.valeur_objectif || ''} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, valeur_objectif: v ? Number(v) : 0 }); }} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs" placeholder="0" required />
              </FormField>
              <FormField label="Unité">
                <select value={formData.unite} onChange={(e) => setFormData({ ...formData, unite: e.target.value })} className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs">
                  <option value={currencySymbol()}>{currencySymbol()}</option><option value="Clients">Clients</option><option value="Visites">Visites</option><option value="%">%</option><option value="Points">Points</option>
                </select>
              </FormField>
              <FormField label="Prime liée">
                <select
                  value={formData.avantageId ?? ''}
                  onChange={(e) => setFormData({ ...formData, avantageId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
                >
                  <option value="">Sans prime</option>
                  {primeConfigs.map((a: Avantage) => (
                    <option key={a.id} value={a.id}>
                      {a.nom} — {a.modeCalcul === 'POURCENTAGE' ? `${a.pourcentage}%` : `${Number(a.montantParDefaut).toLocaleString()} ${currencySymbol()}`}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <button type="submit" disabled={loading} className="w-full py-2 bg-status-info hover:bg-status-info text-white rounded-lg font-bold text-xs mt-2 flex items-center justify-center gap-2">
              <UserCheck size={14} /> Assigner l'Objectif
            </button>
          </form>
        </div>
      )}

      {/* Objectives List - Compact Cards */}
      <div className="grid sm:grid-cols-2 gap-3">
        {loading ? (
             Array(4).fill(0).map((_, i) => <div key={i} className="h-32 bg-surface/50 rounded-xl animate-pulse" />)
        ) : objectifs.length === 0 ? (
          <div className="col-span-full py-12 text-center text-content-muted bg-surface/30 rounded-xl border border-dashed border-edge">
            <Target size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun objectif pour {new Date(selectedPeriode).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
            {!canManage && <p className="text-xs mt-1 text-content-muted">Contactez votre superviseur pour définir vos objectifs.</p>}
          </div>
        ) : (
          paginatedObjectifs.map((obj) => {
            const pct = obj.valeurObjectif > 0 ? (Number(obj.valeurRealisee) / Number(obj.valeurObjectif)) * 100 : 0;
            const isRecalculating = recalculating === obj.id;
            
            return (
              <div 
                key={obj.id} 
                onClick={() => { setSelectedObjectif(obj); setUpdateValue(''); }}
                className={`bg-surface rounded-xl p-4 border transition hover:border-status-info/50 cursor-pointer group relative overflow-hidden ${
                  obj.statut === 'Atteint' || obj.statut === 'Depasse' ? 'border-status-success/30' : 'border-edge'
                }`}
              >
                {/* Progress Bar Background */}
                <div className="absolute bottom-0 left-0 h-1 bg-surface-elevated w-full">
                   <div className={`h-full transition-all duration-1000 ${
                     pct >= 100 ? 'bg-status-success' : pct >= 80 ? 'bg-accent-secondary' : 'bg-status-info'
                   }`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>

                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${
                        obj.statut === 'Atteint' || obj.statut === 'Depasse' ? 'bg-status-success-bg text-status-success' : 'bg-status-info-bg text-status-info'
                      }`}>
                        <Target size={14} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-content-primary">{obj.typeObjectif}</h4>
                        <span className="text-[10px] text-content-muted font-medium">{ALL_STATUS_LABELS[obj.statut] || obj.statut}</span>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className={`text-lg font-bold ${
                        pct >= 100 ? 'text-status-success' : 'text-content-primary'
                      }`}>{pct.toFixed(0)}%</div>
                   </div>
                </div>

                <div className="flex justify-between items-end text-xs">
                   <div className="text-content-muted">
                      <span className="text-content-primary font-bold">{Number(obj.valeurRealisee).toLocaleString()}</span>
                      <span className="mx-1">/</span>
                      <span>{Number(obj.valeurObjectif).toLocaleString()} {obj.unite}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                     {obj.primeStatut && obj.primeStatut !== 'NONE' && (
                       <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                         obj.primeStatut === 'PAID'
                           ? 'bg-status-success/10 text-status-success'
                           : obj.primeStatut === 'ELIGIBLE'
                             ? 'bg-status-warning/10 text-status-warning'
                             : 'bg-surface-elevated text-content-muted'
                       }`}>
                         <Award size={8} />
                         {obj.primeStatut === 'PAID' ? 'Versée'
                           : obj.primeStatut === 'ELIGIBLE' ? 'Éligible'
                           : 'En attente'}
                       </span>
                     )}
                     {Number(obj.recompense) > 0 && (
                       <div className="flex items-center gap-1 text-status-success font-bold bg-status-success-bg px-2 py-0.5 rounded">
                         <DollarSign size={10} /> {formatMoney(obj.recompense, { compact: true })}
                       </div>
                     )}
                   </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 bg-surface/50 rounded-lg border border-edge-subtle">
          <span className="text-[10px] text-content-muted">Page {currentPage} sur {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"><ChevronLeft size={12} /></button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"><ChevronRight size={12} /></button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedObjectif} onOpenChange={(open) => !open && setSelectedObjectif(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
          {selectedObjectif && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-content-primary flex items-center gap-2">
                  <Target size={16} className="text-status-info" />
                  Objectif {selectedObjectif.typeObjectif}
                </SheetTitle>
                <SheetDescription className="text-content-muted">
                  Période: {new Date(selectedObjectif.periode).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Circular Progress */}
                <div className="flex justify-center py-4">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-content-primary" />
                      <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={351.86} strokeDashoffset={351.86 - (351.86 * Math.min((selectedObjectif.valeurRealisee / selectedObjectif.valeurObjectif), 1))} className={
                        (selectedObjectif.valeurRealisee / selectedObjectif.valeurObjectif) >= 1 ? 'text-status-success' : 'text-status-info'
                      } />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-content-primary">{((selectedObjectif.valeurRealisee / selectedObjectif.valeurObjectif) * 100).toFixed(0)}%</span>
                      <span className="text-[10px] text-content-muted uppercase font-bold">{ALL_STATUS_LABELS[selectedObjectif.statut] || selectedObjectif.statut}</span>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Objectif" value={`${selectedObjectif.valeurObjectif.toLocaleString()} ${selectedObjectif.unite}`} />
                  <InfoItem label="Réalisé" value={`${selectedObjectif.valeurRealisee.toLocaleString()} ${selectedObjectif.unite}`} />
                  <InfoItem
                    label="Prime"
                    value={selectedObjectif.avantageId
                      ? `${formatMoney(selectedObjectif.recompense)} (${
                          selectedObjectif.primeStatut === 'PAID' ? 'Versée via salaire' :
                          selectedObjectif.primeStatut === 'ELIGIBLE' ? 'Prochaine paie' :
                          selectedObjectif.primeStatut === 'PENDING' ? 'Atteinte requise' : '—'
                        })`
                      : 'Aucune prime'
                    }
                  />
                  <InfoItem label="Reste à faire" value={`${Math.max(0, selectedObjectif.valeurObjectif - selectedObjectif.valeurRealisee).toLocaleString()} ${selectedObjectif.unite}`} />
                </div>

                {/* Update Actions */}
                <div className="pt-4 border-t border-edge space-y-4">
                  <div className="flex items-center justify-between">
                     <h4 className="text-xs font-bold text-content-muted uppercase">Mise à jour</h4>
                     <button
                       onClick={() => recalculateOne(selectedObjectif.id)}
                       disabled={recalculating !== null}
                       className="text-xs font-bold text-accent hover:text-accent flex items-center gap-1"
                     >
                       {recalculating === selectedObjectif.id ? <Spinner size="xs" tone="current" /> : <RefreshCw size={12} />}
                       Recalculer auto
                     </button>
                  </div>
                  
                  {/* Both roles can update progress manually if needed, or we can restrict it. 
                      Let's allow agents to update manual goals (like self-reported visits) but maybe warn/audit.
                      For now, keeping it open as "Mise à jour manuelle" implies correction. */}
                  {selectedObjectif.statut === StatutObjectif.IN_PROGRESS && (
                    <div className="flex gap-2">
                       <input
                         inputMode="numeric"
                         pattern="[0-9]*"
                         value={updateValue}
                         onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setUpdateValue(v); }}
                         placeholder="Nouvelle valeur..."
                         className="flex-1 px-3 py-2 bg-surface-base border border-edge rounded-lg text-content-primary text-sm"
                       />
                       <button
                         onClick={updateRealisation}
                         disabled={!updateValue}
                         className="px-4 py-2 bg-status-info hover:bg-status-info disabled:opacity-50 text-white rounded-lg font-bold text-xs"
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
    blue: 'from-status-info/20 to-status-info/5 border-status-info/20 text-status-info',
    green: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
    cyan: 'from-accent/20 to-accent/5 border-accent/20 text-accent',
    emerald: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
  };
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex justify-between items-start mb-1"><div className="p-1.5 rounded-lg bg-white/5">{icon}</div></div>
      <div className="text-lg font-bold text-content-primary truncate">{value}</div>
      <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] uppercase font-bold text-content-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium text-content-secondary truncate">{value}</div>
    </div>
  );
}
