import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, MapPin, Plus, Check, X, List, Grid3X3, ChevronLeft, ChevronRight, AlertTriangle, Repeat, Eye, Trash2, Edit } from 'lucide-react';
import { StatutPlanning, STATUT_PLANNING_LABELS } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

interface Planning {
  id: string;
  agentId: string;
  datePlanning: string;
  heureDebut: string;
  heureFin: string;
  typeActivite: string;
  zone: string;
  statut: string;
  notes: string;
}

type ViewMode = 'list' | 'calendar';

export default function AgentPlanning({ agentId }: { agentId?: string }) {
  const [plannings, setPlannings] = useState<Planning[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Week navigation for calendar view
  const [weekOffset, setWeekOffset] = useState(0);

  // Detail Sheet
  const [selectedPlanning, setSelectedPlanning] = useState<Planning | null>(null);

  const [formData, setFormData] = useState({
    agent_id: agentId || '',
    date_planning: selectedDate,
    heure_debut: '08:00',
    heure_fin: '17:00',
    type_activite: 'Visite',
    zone: '',
    notes: ''
  });

  // Recurrence state
  const [recurrence, setRecurrence] = useState<{
    type: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
    endDate: string;
    days: number[];
  }>({
    type: 'none',
    endDate: '',
    days: [],
  });

  // Conflict detection state
  const [conflicts, setConflicts] = useState<Array<{ date: string; conflicts: any[] }>>([]);
  const [forceCreate, setForceCreate] = useState(false);

  useEffect(() => {
    fetchPlannings();
  }, [agentId, selectedDate, viewMode, weekOffset]);

  const fetchPlannings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (agentId) params.append('agentId', agentId);

      if (viewMode === 'calendar') {
        const { start, end } = getWeekRange();
        params.append('dateStart', start);
        params.append('dateEnd', end);
      } else {
        if (selectedDate) params.append('date', selectedDate);
      }

      const url = `/api/agent-planning?${params.toString()}`;
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setPlannings(Array.isArray(data) ? data : []);
      } else {
        setPlannings([]);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setPlannings([]);
    } finally {
      setLoading(false);
    }
  };

  const getWeekRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset + (weekOffset * 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().slice(0, 10),
      end: sunday.toISOString().slice(0, 10),
      monday,
    };
  };

  const weekDays = useMemo(() => {
    const { monday } = getWeekRange();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        date: d.toISOString().slice(0, 10),
        dayName: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
      };
    });
  }, [weekOffset]);

  const planningsByDate = useMemo(() => {
    const map: Record<string, Planning[]> = {};
    plannings.forEach(p => {
      const dateKey = (p.datePlanning || '').slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(p);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)));
    return map;
  }, [plannings]);

  const handleSubmit = async (e: React.FormEvent, force = false) => {
    e.preventDefault();
    setLoading(true);
    setConflicts([]);

    try {
      const body: any = { ...formData, statut: 'PLANNED' };

      if (recurrence.type !== 'none' && recurrence.endDate) {
        body.recurrence = {
          type: recurrence.type,
          endDate: recurrence.endDate,
          ...(recurrence.type === 'weekly' && recurrence.days.length > 0 ? { days: recurrence.days } : {}),
        };
      }

      if (force || forceCreate) {
        body.force = true;
      }

      const response = await fetch('/api/agent-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (response.status === 409) {
        const conflictData = await response.json();
        setConflicts(conflictData.conflicts || []);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la creation');
      }

      setShowForm(false);
      setConflicts([]);
      setForceCreate(false);
      setRecurrence({ type: 'none', endDate: '', days: [] });
      fetchPlannings();
    } catch (error: any) {
      console.error('Erreur creation planning:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatut = async (id: string, statut: string) => {
    try {
      const response = await fetch(`/api/agent-planning/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ statut })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise a jour');
      }

      fetchPlannings();
      if (selectedPlanning && selectedPlanning.id === id) {
          setSelectedPlanning({ ...selectedPlanning, statut });
      }
    } catch (error: any) {
      console.error('Erreur update statut:', error);
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'Visite': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Collecte': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'Formation': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'Prospection': return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
      case 'Reunion': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'Conge': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const typeDot = (type: string) => {
    switch (type) {
      case 'Visite': return 'bg-blue-500';
      case 'Collecte': return 'bg-emerald-500';
      case 'Formation': return 'bg-amber-500';
      case 'Prospection': return 'bg-violet-500';
      case 'Reunion': return 'bg-cyan-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-3">
      {/* TOOLBAR COMPACT */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between bg-slate-900/50 p-2 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Vue liste"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Vue calendrier"
            >
              <Grid3X3 size={14} />
            </button>
          </div>

          {viewMode === 'list' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-auto"
            />
          )}

          {viewMode === 'calendar' && (
            <div className="flex items-center gap-1 w-full sm:w-auto justify-center sm:justify-start">
              <button
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-bold text-slate-300 hover:text-white transition uppercase tracking-wider"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full sm:w-auto px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-lg shadow-cyan-900/20"
        >
          <Plus size={14} />
          Nouveau
        </button>
      </div>

      {/* CREATION FORM COMPACT */}
      {showForm && (
        <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 animate-in slide-in-from-top-2 backdrop-blur-sm">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Clock size={16} className="text-cyan-400" />
            Nouveau Planning
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <FormInput label="Date" type="date" value={formData.date_planning} onChange={v => setFormData({...formData, date_planning: v})} required />
               
               <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Type</label>
                <select
                  value={formData.type_activite}
                  onChange={(e) => setFormData({ ...formData, type_activite: e.target.value })}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs"
                >
                  {['Visite', 'Collecte', 'Formation', 'Conge', 'Reunion', 'Prospection'].map(t => (
                      <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

               <FormInput label="Début" type="time" value={formData.heure_debut} onChange={v => setFormData({...formData, heure_debut: v})} />
               <FormInput label="Fin" type="time" value={formData.heure_fin} onChange={v => setFormData({...formData, heure_fin: v})} />
               
               <div className="col-span-2">
                   <FormInput label="Zone" type="text" value={formData.zone} onChange={v => setFormData({...formData, zone: v})} placeholder="Zone à couvrir" />
               </div>
               
               <div className="col-span-2">
                   <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Notes</label>
                   <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs" />
               </div>
            </div>

             {/* Recurrence Compact */}
             <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                        <Repeat size={14} />
                        Répétition
                    </div>
                    <select
                        value={recurrence.type}
                        onChange={(e) => setRecurrence({ ...recurrence, type: e.target.value as any })}
                        className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs"
                    >
                        <option value="none">Aucune</option>
                        <option value="daily">Quotidien</option>
                        <option value="weekly">Hebdo</option>
                        <option value="biweekly">Bimensuel</option>
                        <option value="monthly">Mensuel</option>
                    </select>
                    {recurrence.type !== 'none' && (
                        <input
                        type="date"
                        value={recurrence.endDate}
                        onChange={(e) => setRecurrence({ ...recurrence, endDate: e.target.value })}
                        className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs"
                        required
                        />
                    )}
                </div>
            </div>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs mb-1">
                        <AlertTriangle size={14} />
                        {conflicts.length} conflit(s) détecté(s)
                    </div>
                    <div className="text-[10px] text-slate-400">
                        {conflicts.slice(0, 2).map((c, i) => (
                             <span key={i} className="block">{c.date} - {c.conflicts.length} activités</span>
                        ))}
                    </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { setForceCreate(true); handleSubmit(e as any, true); }}
                  className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold transition"
                >
                  Forcer
                </button>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-700/50">
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-slate-400 hover:text-white text-xs font-medium">Annuler</button>
              <button type="submit" disabled={loading} className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs transition shadow-lg shadow-cyan-900/20">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {viewMode === 'list' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-h-[300px]">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/30">
             <div className="flex items-center gap-2">
                <Calendar size={16} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-white capitalize">
                {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
             </div>
             <span className="text-xs text-slate-500 font-medium">{plannings.length} activités</span>
          </div>
          <div className="p-3">
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500" /></div>
            ) : plannings.length === 0 ? (
              <div className="text-center py-12 opacity-50">
                <Calendar size={32} className="mx-auto mb-2 text-slate-500" />
                <p className="text-sm text-slate-400">Aucune activité planifiée</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {plannings.map((planning) => (
                  <PlanningCard
                    key={planning.id}
                    planning={planning}
                    typeColor={typeColor}
                    onClick={() => setSelectedPlanning(planning)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CALENDAR VIEW ═══ */}
      {viewMode === 'calendar' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {/* Week header */}
          <div className="grid grid-cols-7 border-b border-slate-700 bg-slate-900/30">
            {weekDays.map(day => (
              <div
                key={day.date}
                className={`text-center py-2 border-r border-slate-700/50 last:border-r-0 ${day.isToday ? 'bg-cyan-500/10' : ''}`}
              >
                <div className="text-[10px] font-bold text-slate-500 uppercase">{day.dayName}</div>
                <div className={`text-xs font-bold ${day.isToday ? 'text-cyan-400' : 'text-white'}`}>
                  {day.dayNum}
                </div>
              </div>
            ))}
          </div>

          {/* Week body */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" /></div>
          ) : (
            <div className="grid grid-cols-7 min-h-[300px]">
              {weekDays.map(day => {
                const dayPlannings = planningsByDate[day.date] || [];
                return (
                  <div
                    key={day.date}
                    className={`border-r border-slate-700/50 last:border-r-0 p-1 min-h-[150px] relative group ${
                      day.isToday ? 'bg-cyan-500/5' : ''
                    }`}
                    onClick={() => { setSelectedDate(day.date); setViewMode('list'); }}
                  >
                    {dayPlannings.length === 0 ? (
                       <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus size={16} className="text-slate-600" />
                       </div>
                    ) : (
                      <div className="space-y-1">
                        {dayPlannings.map(p => (
                          <button
                            key={p.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPlanning(p);
                            }}
                            className={`w-full text-left px-1.5 py-1 rounded border text-[9px] leading-tight transition-all hover:scale-[1.02] shadow-sm ${typeColor(p.typeActivite)}`}
                          >
                            <div className="font-bold truncate">{p.heureDebut}</div>
                            <div className="truncate opacity-80">{p.typeActivite}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DETAIL SHEET */}
      <Sheet open={!!selectedPlanning} onOpenChange={(open) => !open && setSelectedPlanning(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
            {selectedPlanning && (
                <>
                <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                    <SheetTitle className="text-white flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${typeDot(selectedPlanning.typeActivite)}`} />
                        Détail Activité
                    </SheetTitle>
                    <SheetDescription className="text-slate-400">
                        {new Date(selectedPlanning.datePlanning).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="p-6 space-y-6">
                    {/* Main Info */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4">
                        <div className="flex justify-between items-start">
                             <div>
                                <h3 className="text-lg font-bold text-white">{selectedPlanning.typeActivite}</h3>
                                <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                                    <Clock size={14} className="text-cyan-500" />
                                    {selectedPlanning.heureDebut} - {selectedPlanning.heureFin}
                                </div>
                             </div>
                             <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                                selectedPlanning.statut === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                selectedPlanning.statut === 'CANCELLED' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                             }`}>
                                 {STATUT_PLANNING_LABELS[selectedPlanning.statut as keyof typeof STATUT_PLANNING_LABELS] || selectedPlanning.statut}
                             </span>
                        </div>
                        
                        {selectedPlanning.zone && (
                             <div className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800/50 text-sm text-slate-300">
                                 <MapPin size={14} className="text-purple-500" />
                                 {selectedPlanning.zone}
                             </div>
                        )}
                    </div>

                    {/* Notes */}
                    {selectedPlanning.notes && (
                         <div className="space-y-2">
                             <h4 className="text-xs font-bold text-slate-500 uppercase">Notes</h4>
                             <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-300 italic">
                                 "{selectedPlanning.notes}"
                             </div>
                         </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 border-t border-slate-800 space-y-3">
                         <h4 className="text-xs font-bold text-slate-500 uppercase">Actions</h4>
                         {(selectedPlanning.statut === 'PLANNED' || selectedPlanning.statut === 'Planifie') && (
                             <div className="grid grid-cols-2 gap-3">
                                 <button
                                    onClick={() => updateStatut(selectedPlanning.id, 'COMPLETED')}
                                    className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition"
                                 >
                                     <Check size={16} />
                                     Terminer
                                 </button>
                                 <button
                                    onClick={() => updateStatut(selectedPlanning.id, 'CANCELLED')}
                                    className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition"
                                 >
                                     <X size={16} />
                                     Annuler
                                 </button>
                             </div>
                         )}
                         <button
                            onClick={() => {
                                // Logic to delete or edit could go here
                                updateStatut(selectedPlanning.id, 'CANCELLED'); // Keeping it simple for now as per instructions
                            }}
                            className="w-full py-3 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
                         >
                             <Trash2 size={14} />
                             Supprimer cette activité
                         </button>
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

interface PlanningCardProps {
  planning: Planning;
  typeColor: (type: string) => string;
  onClick: () => void;
}

function PlanningCard({ planning, typeColor, onClick }: PlanningCardProps) {
  return (
    <div 
        onClick={onClick}
        className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 hover:border-cyan-500/50 hover:bg-slate-800 transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${typeColor(planning.typeActivite)}`}>
              {planning.typeActivite}
            </span>
            <span className="text-slate-300 font-mono text-xs flex items-center gap-1">
              {planning.heureDebut}
            </span>
          </div>
          {planning.zone && (
            <p className="text-slate-400 text-xs flex items-center gap-1 truncate">
              <MapPin size={10} />
              {planning.zone}
            </p>
          )}
        </div>
        <div className={`w-2 h-2 rounded-full mt-1.5 ${
            planning.statut === 'COMPLETED' ? 'bg-emerald-500' :
            planning.statut === 'CANCELLED' ? 'bg-red-500' :
            'bg-cyan-500'
        }`} />
      </div>
    </div>
  );
}

interface FormInputProps { 
    label: string; 
    type: string; 
    value: string; 
    onChange: (v: string) => void; 
    required?: boolean 
    placeholder?: string
}

function FormInput({ label, type, value, onChange, required, placeholder }: FormInputProps) {
    return (
        <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                required={required}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:ring-1 focus:ring-cyan-500"
            />
        </div>
    );
}
