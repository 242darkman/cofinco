import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Clock, MapPin, Plus, Check, X, List, Grid3X3, ChevronLeft, ChevronRight, AlertTriangle, Repeat, Eye, Trash2, Edit, ClipboardCheck, Play, Loader2, Banknote } from 'lucide-react';
import { toast } from 'sonner';
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

interface AgentPlanningProps {
  agentId?: string;
  enquetes?: any[];
  onStartEnquete?: (id: string) => void;
  startingEnquete?: string | null;
}

export default function AgentPlanning({ agentId, enquetes = [], onStartEnquete, startingEnquete }: AgentPlanningProps) {
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

  // Group enquêtes by date for calendar view
  // Active enquêtes appear on today (so agents always see them in the current week)
  // + on their due date if different from today
  const enquetesByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    const today = new Date().toISOString().slice(0, 10);
    enquetes.forEach(enq => {
      const dueDateKey = enq.dueDate ? new Date(enq.dueDate).toISOString().slice(0, 10) : null;

      // Always place active enquêtes on today
      if (!map[today]) map[today] = [];
      if (dueDateKey !== today) {
        map[today].push(enq);
      }

      // Also place on due date
      if (dueDateKey) {
        if (!map[dueDateKey]) map[dueDateKey] = [];
        map[dueDateKey].push(enq);
      }
    });
    return map;
  }, [enquetes]);

  // Active enquêtes always shown in list view (they are ongoing tasks, not tied to a specific planning day)
  const activeEnquetes = useMemo(() => enquetes, [enquetes]);

  // Responsive: compact calendar on small screens
  const [calendarCompact, setCalendarCompact] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  // List view pagination
  const [listPage, setListPage] = useState(0);
  const [listPageSize, setListPageSize] = useState(6);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setListPageSize(w < 400 ? 3 : w < 768 ? 4 : w < 1280 ? 6 : 9);
      setCalendarCompact(w < 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const allListItems = useMemo(() => {
    const items: Array<{ type: 'enquete'; data: any } | { type: 'planning'; data: Planning }> = [];
    activeEnquetes.forEach(enq => items.push({ type: 'enquete', data: enq }));
    plannings.forEach(p => items.push({ type: 'planning', data: p }));
    return items;
  }, [activeEnquetes, plannings]);

  const totalListPages = Math.max(1, Math.ceil(allListItems.length / listPageSize));
  const safeListPage = Math.min(listPage, totalListPages - 1);
  const paginatedListItems = allListItems.slice(
    safeListPage * listPageSize,
    (safeListPage + 1) * listPageSize
  );

  const pageEnquetes = paginatedListItems.filter(i => i.type === 'enquete');
  const pagePlannings = paginatedListItems.filter(i => i.type === 'planning');

  // Reset page when data changes
  useEffect(() => { setListPage(0); }, [activeEnquetes.length, plannings.length, selectedDate]);

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent, force = false) => {
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
    } catch {
      toast.error('Erreur lors de la création');
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
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'Visite': return 'bg-status-info-bg text-status-info border-status-info/30';
      case 'Collecte': return 'bg-status-success-bg text-status-success border-status-success/30';
      case 'Formation': return 'bg-status-warning-bg text-status-warning border-status-warning/30';
      case 'Prospection': return 'bg-accent/10 text-accent border-accent/30';
      case 'Reunion': return 'bg-accent/10 text-accent border-accent/30';
      case 'Conge': return 'bg-surface-subtle/40 text-content-muted border-edge-strong/30';
      default: return 'bg-surface-subtle/40 text-content-muted border-edge-strong/30';
    }
  };

  const typeDot = (type: string) => {
    switch (type) {
      case 'Visite': return 'bg-status-info';
      case 'Collecte': return 'bg-status-success';
      case 'Formation': return 'bg-status-warning';
      case 'Prospection': return 'bg-accent';
      case 'Reunion': return 'bg-accent';
      default: return 'bg-surface-subtle';
    }
  };

  return (
    <div className="space-y-3">
      {/* TOOLBAR COMPACT */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between bg-surface-base/50 p-2 rounded-xl border border-edge">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View toggle */}
          <div className="flex bg-surface rounded-lg p-0.5 border border-edge shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-accent-secondary text-content-primary shadow' : 'text-content-muted hover:text-content-primary'}`}
              title="Vue liste"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-accent-secondary text-content-primary shadow' : 'text-content-muted hover:text-content-primary'}`}
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
              className="px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent w-full sm:w-auto"
            />
          )}

          {viewMode === 'calendar' && (
            <div className="flex items-center gap-1 w-full sm:w-auto justify-center sm:justify-start">
              <button
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-1.5 bg-surface border border-edge rounded-lg text-content-muted hover:text-content-primary transition"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1.5 bg-surface border border-edge rounded-lg text-[10px] font-bold text-content-secondary hover:text-content-primary transition uppercase tracking-wider"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-1.5 bg-surface border border-edge rounded-lg text-content-muted hover:text-content-primary transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full sm:w-auto px-3 py-1.5 bg-accent hover:bg-accent-primary-hover text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-lg shadow-accent/20"
        >
          <Plus size={14} />
          Nouveau
        </button>
      </div>

      {/* CREATION FORM COMPACT */}
      {showForm && (
        <div className="bg-surface/80 rounded-xl p-4 border border-edge animate-in slide-in-from-top-2 backdrop-blur-sm">
          <h3 className="text-sm font-bold text-content-primary mb-3 flex items-center gap-2">
            <Clock size={16} className="text-accent" />
            Nouveau Planning
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               <FormInput label="Date" type="date" value={formData.date_planning} onChange={v => setFormData({...formData, date_planning: v})} required />
               
               <div>
                <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">Type</label>
                <select
                  value={formData.type_activite}
                  onChange={(e) => setFormData({ ...formData, type_activite: e.target.value })}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary text-xs"
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
                   <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">Notes</label>
                   <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary text-xs" />
               </div>
            </div>

             {/* Recurrence Compact */}
             <div className="bg-surface-base/50 border border-edge rounded-lg p-3">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-content-muted">
                        <Repeat size={14} />
                        Répétition
                    </div>
                    <select
                        value={recurrence.type}
                        onChange={(e) => setRecurrence({ ...recurrence, type: e.target.value as typeof recurrence.type })}
                        className="px-2 py-1 bg-surface border border-edge rounded text-content-primary text-xs"
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
                        className="px-2 py-1 bg-surface border border-edge rounded text-content-primary text-xs"
                        required
                        />
                    )}
                </div>
            </div>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-status-warning font-bold text-xs mb-1">
                        <AlertTriangle size={14} />
                        {conflicts.length} conflit(s) détecté(s)
                    </div>
                    <div className="text-[10px] text-content-muted">
                        {conflicts.slice(0, 2).map((c, i) => (
                             <span key={i} className="block">{c.date} - {c.conflicts.length} activités</span>
                        ))}
                    </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { setForceCreate(true); handleSubmit(e, true); }}
                  className="px-2 py-1 bg-status-warning hover:bg-status-warning text-white rounded text-[10px] font-bold transition"
                >
                  Forcer
                </button>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-edge-subtle">
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-content-muted hover:text-content-primary text-xs font-medium">Annuler</button>
              <button type="submit" disabled={loading} className="px-4 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-content-primary rounded-lg font-bold text-xs transition shadow-lg shadow-accent/20">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {viewMode === 'list' && (
        <div className="bg-surface rounded-xl border border-edge overflow-hidden min-h-[300px]">
          <div className="px-4 py-3 border-b border-edge flex items-center justify-between bg-surface-base/30">
             <div className="flex items-center gap-2">
                <Calendar size={16} className="text-accent" />
                <h3 className="text-sm font-bold text-content-primary capitalize">
                {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
             </div>
             <span className="text-xs text-content-muted font-medium">
               {allListItems.length} activité{allListItems.length > 1 ? 's' : ''}
             </span>
          </div>
          <div className="p-3 space-y-3">
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" /></div>
            ) : allListItems.length === 0 ? (
              <div className="text-center py-12 opacity-50">
                <Calendar size={32} className="mx-auto mb-2 text-content-muted" />
                <p className="text-sm text-content-muted">Aucune activité planifiée</p>
              </div>
            ) : (
              <>
                {/* Enquêtes on current page */}
                {pageEnquetes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-status-warning uppercase tracking-wider px-1">
                      <ClipboardCheck size={11} />
                      Enquêtes crédit ({activeEnquetes.length})
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {pageEnquetes.map((item) => (
                        <EnqueteCard
                          key={item.data.id}
                          enquete={item.data}
                          onStart={onStartEnquete}
                          starting={startingEnquete === item.data.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Plannings on current page */}
                {pagePlannings.length > 0 && (
                  <div className="space-y-2">
                    {pageEnquetes.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-content-muted uppercase tracking-wider px-1">
                        <Calendar size={11} />
                        Planning ({plannings.length})
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {pagePlannings.map((item) => (
                        <PlanningCard
                          key={item.data.id}
                          planning={item.data}
                          typeColor={typeColor}
                          onClick={() => setSelectedPlanning(item.data)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pagination controls */}
          {totalListPages > 1 && (
            <div className="px-4 py-2 border-t border-edge flex items-center justify-between bg-surface-base/30">
              <button
                onClick={() => setListPage(p => Math.max(0, p - 1))}
                disabled={safeListPage === 0}
                className="p-1.5 rounded-lg disabled:opacity-20 text-content-muted hover:text-content-primary hover:bg-surface-elevated active:bg-surface-subtle transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-content-muted font-medium tabular-nums">
                {safeListPage + 1} / {totalListPages}
              </span>
              <button
                onClick={() => setListPage(p => Math.min(totalListPages - 1, p + 1))}
                disabled={safeListPage >= totalListPages - 1}
                className="p-1.5 rounded-lg disabled:opacity-20 text-content-muted hover:text-content-primary hover:bg-surface-elevated active:bg-surface-subtle transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ CALENDAR VIEW ═══ */}
      {viewMode === 'calendar' && (
        <div className="bg-surface rounded-xl border border-edge overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
          ) : calendarCompact ? (
            /* ── COMPACT: vertical day list (POS / mobile) ── */
            <div className="divide-y divide-edge/50">
              {weekDays.map(day => {
                const dayPlannings = planningsByDate[day.date] || [];
                const dayEnquetes = enquetesByDate[day.date] || [];
                const allDayItems = [
                  ...dayEnquetes.map(e => ({ type: 'enquete' as const, data: e })),
                  ...dayPlannings.map(p => ({ type: 'planning' as const, data: p })),
                ];
                const MAX_PILLS = 3;

                return (
                  <div
                    key={day.date}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-surface-elevated/30 active:bg-surface-elevated/50 ${
                      day.isToday ? 'bg-accent/5' : ''
                    }`}
                    onClick={() => { setSelectedDate(day.date); setViewMode('list'); }}
                  >
                    {/* Date badge */}
                    <div
                      className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                        day.isToday
                          ? 'bg-accent-secondary text-content-primary'
                          : 'bg-surface-base text-content-muted border border-edge'
                      }`}
                    >
                      <div className="text-[8px] font-bold uppercase leading-none">{day.dayName}</div>
                      <div className="text-sm font-bold leading-tight">{day.dayNum}</div>
                    </div>

                    {/* Events */}
                    <div className="flex-1 min-w-0">
                      {allDayItems.length === 0 ? (
                        <p className="text-[11px] text-content-muted italic">Aucune activité</p>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap">
                          {allDayItems.slice(0, MAX_PILLS).map((item) => {
                            if (item.type === 'enquete') {
                              const enq = item.data;
                              const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
                              const clientName = enq.client
                                ? `${enq.client.prenom || ''} ${enq.client.nom || ''}`.trim()
                                : '';
                              return (
                                <span
                                  key={`enq-${enq.id}`}
                                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold border ${
                                    isOverdue
                                      ? 'bg-status-danger-bg text-status-danger border-status-danger/30'
                                      : 'bg-status-warning-bg text-status-warning border-status-warning/30'
                                  }`}
                                >
                                  <ClipboardCheck size={8} />
                                  {clientName ? clientName.split(' ')[0] : 'Enquête'}
                                </span>
                              );
                            } else {
                              const p = item.data;
                              return (
                                <span
                                  key={p.id}
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold border ${typeColor(p.typeActivite)}`}
                                  onClick={(e) => { e.stopPropagation(); setSelectedPlanning(p); }}
                                >
                                  {p.heureDebut} {p.typeActivite}
                                </span>
                              );
                            }
                          })}
                          {allDayItems.length > MAX_PILLS && (
                            <span className="text-[9px] font-bold text-accent self-center">
                              +{allDayItems.length - MAX_PILLS}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Arrow indicator */}
                    <ChevronRight size={14} className="text-content-muted shrink-0" />
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── FULL: 7-column grid (tablet / desktop) ── */
            <>
              {/* Week header */}
              <div className="grid grid-cols-7 border-b border-edge bg-surface-base/30">
                {weekDays.map(day => (
                  <div
                    key={day.date}
                    className={`text-center py-2 border-r border-edge-subtle last:border-r-0 ${day.isToday ? 'bg-accent/10' : ''}`}
                  >
                    <div className="text-[10px] font-bold text-content-muted uppercase">{day.dayName}</div>
                    <div className={`text-xs font-bold ${day.isToday ? 'text-accent' : 'text-content-primary'}`}>
                      {day.dayNum}
                    </div>
                  </div>
                ))}
              </div>

              {/* Week body */}
              <div className="grid grid-cols-7 min-h-[300px]">
                {weekDays.map(day => {
                  const dayPlannings = planningsByDate[day.date] || [];
                  const dayEnquetes = enquetesByDate[day.date] || [];
                  const allDayItems = [...dayEnquetes.map(e => ({ type: 'enquete' as const, data: e })), ...dayPlannings.map(p => ({ type: 'planning' as const, data: p }))];
                  const MAX_VISIBLE = 3;
                  const visibleItems = allDayItems.slice(0, MAX_VISIBLE);
                  const overflowCount = allDayItems.length - MAX_VISIBLE;
                  const hasItems = allDayItems.length > 0;
                  return (
                    <div
                      key={day.date}
                      className={`border-r border-edge-subtle last:border-r-0 p-1 min-h-[150px] relative group cursor-pointer ${
                        day.isToday ? 'bg-accent/5' : ''
                      }`}
                      onClick={() => { setSelectedDate(day.date); setViewMode('list'); }}
                    >
                      {!hasItems ? (
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus size={16} className="text-content-muted" />
                         </div>
                      ) : (
                        <div className="space-y-1">
                          {visibleItems.map((item) => {
                            if (item.type === 'enquete') {
                              const enq = item.data;
                              const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
                              const clientName = enq.client
                                ? `${enq.client.prenom || ''} ${enq.client.nom || ''}`.trim()
                                : '';
                              return (
                                <div
                                  key={`enq-${enq.id}`}
                                  className={`w-full text-left px-1.5 py-1 rounded border text-[9px] leading-tight shadow-sm ${
                                    isOverdue
                                      ? 'bg-status-danger-bg text-status-danger border-status-danger/30'
                                      : 'bg-status-warning-bg text-status-warning border-status-warning/30'
                                  }`}
                                >
                                  <div className="font-bold truncate flex items-center gap-0.5">
                                    <ClipboardCheck size={8} />
                                    Enquête
                                  </div>
                                  {clientName && (
                                    <div className="truncate opacity-80">{clientName}</div>
                                  )}
                                </div>
                              );
                            } else {
                              const p = item.data;
                              return (
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
                              );
                            }
                          })}
                          {overflowCount > 0 && (
                            <div className="text-[9px] font-bold text-accent text-center py-0.5 bg-accent/10 rounded border border-accent/20">
                              +{overflowCount} autre{overflowCount > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* DETAIL SHEET */}
      <Sheet open={!!selectedPlanning} onOpenChange={(open) => !open && setSelectedPlanning(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
            {selectedPlanning && (
                <>
                <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                    <SheetTitle className="text-content-primary flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${typeDot(selectedPlanning.typeActivite)}`} />
                        Détail Activité
                    </SheetTitle>
                    <SheetDescription className="text-content-muted">
                        {new Date(selectedPlanning.datePlanning).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </SheetDescription>
                </SheetHeader>
                
                <div className="p-6 space-y-6">
                    {/* Main Info */}
                    <div className="bg-surface-base/50 border border-edge rounded-xl p-4 space-y-4">
                        <div className="flex justify-between items-start">
                             <div>
                                <h3 className="text-lg font-bold text-content-primary">{selectedPlanning.typeActivite}</h3>
                                <div className="flex items-center gap-2 text-content-muted text-sm mt-1">
                                    <Clock size={14} className="text-accent" />
                                    {selectedPlanning.heureDebut} - {selectedPlanning.heureFin}
                                </div>
                             </div>
                             <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                                selectedPlanning.statut === 'COMPLETED' ? 'bg-status-success-bg text-status-success border-status-success/30' :
                                selectedPlanning.statut === 'CANCELLED' ? 'bg-status-danger-bg text-status-danger border-status-danger/30' :
                                'bg-accent/10 text-accent border-accent/30'
                             }`}>
                                 {STATUT_PLANNING_LABELS[selectedPlanning.statut as keyof typeof STATUT_PLANNING_LABELS] || selectedPlanning.statut}
                             </span>
                        </div>
                        
                        {selectedPlanning.zone && (
                             <div className="flex items-center gap-2 p-2 bg-surface-base rounded-lg border border-edge/50 text-sm text-content-secondary">
                                 <MapPin size={14} className="text-status-info" />
                                 {selectedPlanning.zone}
                             </div>
                        )}
                    </div>

                    {/* Notes */}
                    {selectedPlanning.notes && (
                         <div className="space-y-2">
                             <h4 className="text-xs font-bold text-content-muted uppercase">Notes</h4>
                             <div className="p-3 bg-surface-base border border-edge rounded-lg text-sm text-content-secondary italic">
                                 "{selectedPlanning.notes}"
                             </div>
                         </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 border-t border-edge space-y-3">
                         <h4 className="text-xs font-bold text-content-muted uppercase">Actions</h4>
                         {(selectedPlanning.statut === 'PLANNED' || selectedPlanning.statut === 'Planifie') && (
                             <div className="grid grid-cols-2 gap-3">
                                 <button
                                    onClick={() => updateStatut(selectedPlanning.id, 'COMPLETED')}
                                    className="py-3 bg-status-success hover:bg-status-success text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition"
                                 >
                                     <Check size={16} />
                                     Terminer
                                 </button>
                                 <button
                                    onClick={() => updateStatut(selectedPlanning.id, 'CANCELLED')}
                                    className="py-3 bg-surface hover:bg-surface-elevated text-content-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition"
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
                            className="w-full py-3 border border-edge hover:bg-surface text-content-muted hover:text-content-primary rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
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
        className="bg-surface-base/50 rounded-xl p-3 border border-edge-subtle hover:border-accent/50 hover:bg-surface transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${typeColor(planning.typeActivite)}`}>
              {planning.typeActivite}
            </span>
            <span className="text-content-secondary font-mono text-xs flex items-center gap-1">
              {planning.heureDebut}
            </span>
          </div>
          {planning.zone && (
            <p className="text-content-muted text-xs flex items-center gap-1 truncate">
              <MapPin size={10} />
              {planning.zone}
            </p>
          )}
        </div>
        <div className={`w-2 h-2 rounded-full mt-1.5 ${
            planning.statut === 'COMPLETED' ? 'bg-status-success' :
            planning.statut === 'CANCELLED' ? 'bg-status-danger' :
            'bg-accent'
        }`} />
      </div>
    </div>
  );
}

// Enquête card for list view
function EnqueteCard({ enquete, onStart, starting }: { enquete: any; onStart?: (id: string) => void; starting: boolean }) {
  const isOverdue = enquete.dueDate && new Date(enquete.dueDate) < new Date();
  const isAssigned = enquete.statut === 'ASSIGNED';
  const priorityConf: Record<string, { label: string; color: string }> = {
    LOW: { label: 'Basse', color: 'bg-surface-subtle/35 text-content-muted border-edge-strong/30' },
    MEDIUM: { label: 'Normale', color: 'bg-status-info-bg text-status-info border-status-info/30' },
    HIGH: { label: 'Haute', color: 'bg-status-warning-bg text-status-warning border-status-warning/30' },
    URGENT: { label: 'Urgente', color: 'bg-status-danger-bg text-status-danger border-status-danger/30' },
  };
  const pConf = priorityConf[enquete.priority || 'MEDIUM'] || priorityConf.MEDIUM;

  return (
    <div className={`bg-surface-base/50 rounded-xl p-3 border ${isOverdue ? 'border-status-danger/40' : 'border-status-warning/30'} space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border bg-status-warning-bg text-status-warning border-status-warning/30`}>
              Enquête
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${pConf.color}`}>
              {pConf.label}
            </span>
          </div>
          <p className="text-xs font-semibold text-content-primary truncate">
            {enquete.client ? `${enquete.client.nom || ''} ${enquete.client.prenom || ''}`.trim() : 'Client'}
          </p>
          {enquete.objetCredit && (
            <p className="text-[10px] text-content-muted truncate">{enquete.objetCredit}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        {enquete.montantDemande && (
          <span className="flex items-center gap-1 text-status-success font-medium">
            <Banknote size={11} />
            {Number(enquete.montantDemande).toLocaleString('fr-FR')} F
          </span>
        )}
        {enquete.dueDate && (
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
            isOverdue
              ? 'text-status-danger font-bold bg-status-danger-bg'
              : 'text-status-warning font-medium bg-status-warning-bg'
          }`}>
            {isOverdue ? <AlertTriangle size={10} /> : <Calendar size={10} />}
            Échéance : {new Date(enquete.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            {isOverdue && ' (retard)'}
          </span>
        )}
      </div>

      {/* Action button */}
      {isAssigned && onStart ? (
        <button
          onClick={() => onStart(enquete.id)}
          disabled={starting}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover disabled:bg-surface-elevated text-content-primary text-xs font-bold rounded-lg transition-colors"
        >
          {starting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Démarrer l'enquête
        </button>
      ) : (
        <div className="text-center">
          <span className="text-[10px] font-bold text-status-info bg-status-info-bg px-2 py-0.5 rounded">En cours</span>
        </div>
      )}
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
            <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                required={required}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded-lg text-content-primary text-xs focus:ring-1 focus:ring-accent"
            />
        </div>
    );
}
