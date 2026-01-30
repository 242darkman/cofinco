import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, MapPin, Plus, Check, X, List, Grid3X3, ChevronLeft, ChevronRight, AlertTriangle, Repeat } from 'lucide-react';
import { StatutPlanning, STATUT_PLANNING_LABELS } from '@shared/enum/status-constants';

interface Planning {
  id: string;
  agent_id: string;
  date_planning: string;
  heure_debut: string;
  heure_fin: string;
  type_activite: string;
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
        // Fetch entire week
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

  // Group plannings by date for calendar view
  const planningsByDate = useMemo(() => {
    const map: Record<string, Planning[]> = {};
    plannings.forEach(p => {
      const dateKey = (p.date_planning || '').slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(p);
    });
    // Sort each day by heure_debut
    Object.values(map).forEach(arr => arr.sort((a, b) => a.heure_debut.localeCompare(b.heure_debut)));
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
    <div className="space-y-4">
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Vue liste"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              title="Vue calendrier"
            >
              <Grid3X3 size={16} />
            </button>
          </div>

          {viewMode === 'list' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          )}

          {viewMode === 'calendar' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition"
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center gap-2 text-sm font-semibold transition"
        >
          <Plus size={16} />
          Nouveau
        </button>
      </div>

      {/* CREATION FORM */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">Nouveau Planning</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={formData.date_planning}
                  onChange={(e) => setFormData({ ...formData, date_planning: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Type</label>
                <select
                  value={formData.type_activite}
                  onChange={(e) => setFormData({ ...formData, type_activite: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="Visite">Visite</option>
                  <option value="Collecte">Collecte</option>
                  <option value="Formation">Formation</option>
                  <option value="Conge">Conge</option>
                  <option value="Reunion">Reunion</option>
                  <option value="Prospection">Prospection</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Debut</label>
                <input
                  type="time"
                  value={formData.heure_debut}
                  onChange={(e) => setFormData({ ...formData, heure_debut: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Fin</label>
                <input
                  type="time"
                  value={formData.heure_fin}
                  onChange={(e) => setFormData({ ...formData, heure_fin: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Zone</label>
                <input
                  type="text"
                  value={formData.zone}
                  onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  placeholder="Zone a couvrir"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm resize-none"
                  rows={2}
                />
              </div>

              {/* Recurrence */}
              <div className="sm:col-span-2 bg-slate-900/50 border border-slate-700 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Repeat size={14} />
                  Recurrence
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={recurrence.type}
                    onChange={(e) => setRecurrence({ ...recurrence, type: e.target.value as any })}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="none">Aucune</option>
                    <option value="daily">Quotidien</option>
                    <option value="weekly">Hebdomadaire</option>
                    <option value="biweekly">Bimensuel</option>
                    <option value="monthly">Mensuel</option>
                  </select>
                  {recurrence.type !== 'none' && (
                    <input
                      type="date"
                      value={recurrence.endDate}
                      onChange={(e) => setRecurrence({ ...recurrence, endDate: e.target.value })}
                      className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                      placeholder="Date fin"
                      min={formData.date_planning}
                      required
                    />
                  )}
                </div>
                {recurrence.type === 'weekly' && (
                  <div className="flex flex-wrap gap-1.5">
                    {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((day, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const days = recurrence.days.includes(idx)
                            ? recurrence.days.filter(d => d !== idx)
                            : [...recurrence.days, idx];
                          setRecurrence({ ...recurrence, days });
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                          recurrence.days.includes(idx)
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <AlertTriangle size={16} />
                  {conflicts.length} conflit(s) horaire(s) detecte(s)
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {conflicts.map((c, i) => (
                    <div key={i} className="text-xs text-slate-300">
                      <span className="font-semibold text-amber-300">{c.date}</span>
                      {' — '}
                      {c.conflicts.map((cf: any) => `${cf.type_activite} ${cf.heure_debut}-${cf.heure_fin}`).join(', ')}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={(e) => { setForceCreate(true); handleSubmit(e as any, true); }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  Creer malgre les conflits
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold text-sm transition">
                Enregistrer
              </button>
              <button type="button" onClick={() => { setShowForm(false); setConflicts([]); }} className="px-4 py-2.5 bg-slate-700 text-white rounded-lg text-sm transition hover:bg-slate-600">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {viewMode === 'list' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
            <Calendar size={18} className="text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              Planning du {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
              </div>
            ) : plannings.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                Aucune activite planifiee
              </div>
            ) : (
              <div className="space-y-3">
                {plannings.map((planning) => (
                  <PlanningCard
                    key={planning.id}
                    planning={planning}
                    typeColor={typeColor}
                    onComplete={() => updateStatut(planning.id, 'COMPLETED')}
                    onCancel={() => updateStatut(planning.id, 'CANCELLED')}
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
          <div className="grid grid-cols-7 border-b border-slate-700">
            {weekDays.map(day => (
              <div
                key={day.date}
                className={`text-center py-2 border-r border-slate-700 last:border-r-0 ${day.isToday ? 'bg-cyan-500/10' : ''}`}
              >
                <div className="text-[10px] font-bold text-slate-500 uppercase">{day.dayName}</div>
                <div className={`text-sm font-bold ${day.isToday ? 'text-cyan-400' : 'text-white'}`}>
                  {day.dayNum}
                </div>
              </div>
            ))}
          </div>

          {/* Week body */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            </div>
          ) : (
            <div className="grid grid-cols-7 min-h-[300px]">
              {weekDays.map(day => {
                const dayPlannings = planningsByDate[day.date] || [];
                return (
                  <div
                    key={day.date}
                    className={`border-r border-slate-700 last:border-r-0 p-1.5 min-h-[200px] ${
                      day.isToday ? 'bg-cyan-500/5' : ''
                    }`}
                  >
                    {dayPlannings.length === 0 ? (
                      <div className="text-[10px] text-slate-600 text-center mt-8">-</div>
                    ) : (
                      <div className="space-y-1">
                        {dayPlannings.map(p => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedDate(day.date);
                              setViewMode('list');
                            }}
                            className={`w-full text-left px-1.5 py-1 rounded-md border text-[10px] leading-tight transition-all hover:opacity-80 ${typeColor(p.type_activite)}`}
                          >
                            <div className="font-bold truncate">{p.heure_debut}</div>
                            <div className="truncate opacity-80">{p.type_activite}</div>
                            {p.zone && (
                              <div className="truncate opacity-60">{p.zone}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="px-3 py-2 border-t border-slate-700 flex flex-wrap gap-3">
            {['Visite', 'Collecte', 'Formation', 'Prospection', 'Reunion'].map(type => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${typeDot(type)}`} />
                <span className="text-[10px] text-slate-400">{type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANNING CARD - Individual planning item in list view
// ═══════════════════════════════════════════════════════════════════════════

interface PlanningCardProps {
  planning: Planning;
  typeColor: (type: string) => string;
  onComplete: () => void;
  onCancel: () => void;
}

function PlanningCard({ planning, typeColor, onComplete, onCancel }: PlanningCardProps) {
  const isActionable = planning.statut === 'PLANNED' || planning.statut === 'Planifie';

  return (
    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${typeColor(planning.type_activite)}`}>
              {planning.type_activite}
            </span>
            <span className="text-white font-semibold text-sm flex items-center gap-1.5">
              <Clock size={14} className="text-slate-400" />
              {planning.heure_debut} - {planning.heure_fin}
            </span>
          </div>
          {planning.zone && (
            <p className="text-slate-300 text-sm flex items-center gap-1.5 mb-1">
              <MapPin size={14} className="text-slate-500" />
              {planning.zone}
            </p>
          )}
          {planning.notes && (
            <p className="text-slate-500 text-xs mt-1 line-clamp-2">{planning.notes}</p>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          {isActionable ? (
            <>
              <button
                onClick={onComplete}
                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
                title="Completer"
              >
                <Check size={16} />
              </button>
              <button
                onClick={onCancel}
                className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                title="Annuler"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              planning.statut === StatutPlanning.COMPLETED || planning.statut === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
              planning.statut === StatutPlanning.CANCELLED || planning.statut === 'CANCELLED' ? 'bg-red-500/20 text-red-400' :
              'bg-cyan-500/20 text-cyan-400'
            }`}>
              {STATUT_PLANNING_LABELS[planning.statut as keyof typeof STATUT_PLANNING_LABELS] || planning.statut}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
