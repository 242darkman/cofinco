import React, { useState, useEffect } from 'react';
import { GraduationCap, Plus, Award, TrendingUp, CheckCircle, Clock, ExternalLink, Download, Star, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { StatutSuiviFormation, STATUT_SUIVI_FORMATION_LABELS } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

interface Formation {
  id: string;
  titre: string;
  description: string;
  type_formation: string;
  duree_heures: number;
  contenu_url: string;
  obligatoire: boolean;
  created_at: string;
}

interface FormationSuivi {
  id: string;
  agent_id: string;
  formation_id: string;
  date_debut?: string;
  date_fin?: string;
  progression: number;
  statut: string;
  score?: number;
  certificat_url: string;
  formation?: Formation;
}

export default function AgentFormations({ agentId }: { agentId?: string }) {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [suivis, setSuivis] = useState<FormationSuivi[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewFormation, setShowNewFormation] = useState(false);
  const [completionScore, setCompletionScore] = useState<Record<string, number>>({});

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 4;

  // Detail Sheet
  const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);

  const [newFormation, setNewFormation] = useState({
    titre: '',
    description: '',
    type_formation: 'Continue',
    duree_heures: 1,
    contenu_url: '',
    obligatoire: false
  });

  useEffect(() => {
    loadFormations();
    if (agentId) loadSuivis();
  }, [agentId]);

  const loadFormations = async () => {
    try {
      const response = await fetch('/api/agent-formations', { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setFormations(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuivis = async () => {
    try {
      const response = await fetch(`/api/agent-formations-suivi?agent_id=${agentId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur lors du chargement');
      const data = await response.json();
      setSuivis(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const creerFormation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/agent-formations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newFormation)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la création');
      }
      setShowNewFormation(false);
      loadFormations();
      setNewFormation({
        titre: '',
        description: '',
        type_formation: 'Continue',
        duree_heures: 1,
        contenu_url: '',
        obligatoire: false
      });
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const inscrireFormation = async (formationId: string) => {
    if (!agentId) {
      alert('Veuillez sélectionner un agent');
      return;
    }

    try {
      const response = await fetch('/api/agent-formations-suivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: agentId,
          formation_id: formationId,
          date_debut: new Date().toISOString().slice(0, 10),
          progression: 0,
          statut: 'IN_PROGRESS'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de l\'inscription');
      }
      loadSuivis();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const updateProgression = async (suiviId: string, progression: number, score?: number) => {
    try {
      const statut = progression >= 100 ? 'COMPLETED' : 'IN_PROGRESS';

      const body: Record<string, unknown> = {
        progression,
        statut,
        ...(progression >= 100 && { date_fin: new Date().toISOString().slice(0, 10) }),
      };
      if (score !== undefined) {
        body.score = score;
      }

      const response = await fetch(`/api/agent-formations-suivi/${suiviId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      loadSuivis();
    } catch (error: any) {
      alert('Erreur: ' + error.message);
    }
  };

  const formationsCompletes = suivis.filter(s => s.statut === 'COMPLETED').length;
  const enCours = suivis.filter(s => s.statut === StatutSuiviFormation.IN_PROGRESS).length;
  const progressionMoyenne = suivis.length > 0
    ? suivis.reduce((sum, s) => sum + s.progression, 0) / suivis.length
    : 0;

  // Pagination Logic
  const totalPages = Math.ceil(formations.length / ITEMS_PER_PAGE);
  const paginatedFormations = formations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Get suivi for selected formation
  const selectedSuivi = selectedFormation ? suivis.find(s => s.formation_id === selectedFormation.id) : null;

  return (
    <div className="space-y-3">
      {/* Stats Compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard icon={<GraduationCap size={14} />} label="Disponibles" value={formations.length.toString()} color="blue" />
        <StatCard icon={<CheckCircle size={14} />} label="Complétées" value={formationsCompletes.toString()} color="green" />
        <StatCard icon={<Clock size={14} />} label="En Cours" value={enCours.toString()} color="emerald" />
        <StatCard icon={<TrendingUp size={14} />} label="Progression" value={`${progressionMoyenne.toFixed(0)}%`} color="cyan" />
      </div>

      {/* New Formation Button */}
      <button
        onClick={() => setShowNewFormation(!showNewFormation)}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
      >
        {showNewFormation ? <X size={14} /> : <Plus size={14} />}
        {showNewFormation ? 'Annuler' : 'Nouvelle Formation'}
      </button>

      {/* New Formation Form (Compact) */}
      {showNewFormation && (
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <form onSubmit={creerFormation} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Titre</label>
                <input
                  type="text"
                  value={newFormation.titre}
                  onChange={(e) => setNewFormation({ ...newFormation, titre: e.target.value })}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Type</label>
                <select
                  value={newFormation.type_formation}
                  onChange={(e) => setNewFormation({ ...newFormation, type_formation: e.target.value })}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                >
                  <option value="Onboarding">Onboarding</option>
                  <option value="Continue">Continue</option>
                  <option value="Certification">Certification</option>
                  <option value="Recyclage">Recyclage</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Durée (h)</label>
                <input
                  type="number"
                  value={newFormation.duree_heures}
                  onChange={(e) => setNewFormation({ ...newFormation, duree_heures: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                  min="1"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Description</label>
              <textarea
                value={newFormation.description}
                onChange={(e) => setNewFormation({ ...newFormation, description: e.target.value })}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                rows={2}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={newFormation.contenu_url}
                onChange={(e) => setNewFormation({ ...newFormation, contenu_url: e.target.value })}
                className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
                placeholder="URL du contenu..."
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                <input
                  type="checkbox"
                  checked={newFormation.obligatoire}
                  onChange={(e) => setNewFormation({ ...newFormation, obligatoire: e.target.checked })}
                  className="w-3 h-3"
                />
                Obligatoire
              </label>
              <button type="submit" disabled={loading} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs shrink-0">
                Créer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My Formations (If agent has suivis) */}
      {agentId && suivis.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-900/30">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award size={16} className="text-green-400" />
              Mes Formations
            </h3>
          </div>
          <div className="divide-y divide-slate-700/50">
            {suivis.map((suivi) => (
              <div key={suivi.id} className="p-3 hover:bg-slate-700/20 transition">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{suivi.formation?.titre}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full max-w-32">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all"
                          style={{ width: `${suivi.progression}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold">{suivi.progression}%</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    suivi.statut === StatutSuiviFormation.COMPLETED ? 'bg-green-500/20 text-green-400' :
                    suivi.statut === StatutSuiviFormation.IN_PROGRESS ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {STATUT_SUIVI_FORMATION_LABELS[suivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS] || suivi.statut}
                  </span>
                  {suivi.statut === StatutSuiviFormation.COMPLETED && suivi.certificat_url && (
                    <a href={suivi.certificat_url} target="_blank" rel="noopener noreferrer" className="p-1 text-green-400 hover:bg-green-500/10 rounded">
                      <Download size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catalogue */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/30">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <GraduationCap size={16} className="text-blue-400" />
            Catalogue de Formations
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">{formations.length} formations</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500" /></div>
        ) : formations.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <GraduationCap size={32} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm text-slate-400">Aucune formation disponible</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 p-2">
            {paginatedFormations.map((formation) => {
              const isEnrolled = suivis.find(s => s.formation_id === formation.id);
              return (
                <div
                  key={formation.id}
                  onClick={() => setSelectedFormation(formation)}
                  className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 hover:border-slate-600 transition cursor-pointer group"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg shrink-0">
                      <GraduationCap size={14} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{formation.titre}</h4>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{formation.description}</p>
                    </div>
                    {formation.obligatoire && (
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[8px] font-bold uppercase shrink-0">Requis</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="text-blue-400 font-bold">{formation.type_formation}</span>
                      <span>•</span>
                      <span>{formation.duree_heures}h</span>
                    </div>
                    <Eye size={12} className="text-slate-600 group-hover:text-cyan-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/50 bg-slate-900/20">
            <span className="text-[10px] text-slate-500">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedFormation} onOpenChange={(open) => !open && setSelectedFormation(null)}>
        <SheetContent className="w-full sm:max-w-md bg-slate-950 border-l-slate-800 p-0 overflow-y-auto">
          {selectedFormation && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-white flex items-center gap-2">
                  <GraduationCap size={16} className="text-blue-400" />
                  {selectedFormation.titre}
                </SheetTitle>
                <SheetDescription className="text-slate-400">
                  {selectedFormation.type_formation} • {selectedFormation.duree_heures} heures
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-bold">{selectedFormation.type_formation}</span>
                  <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">{selectedFormation.duree_heures}h</span>
                  {selectedFormation.obligatoire && (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-bold">Obligatoire</span>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Description</h4>
                  <p className="text-sm text-slate-300 leading-relaxed">{selectedFormation.description || 'Aucune description disponible.'}</p>
                </div>

                {/* Progression (if enrolled) */}
                {selectedSuivi && (
                  <div className="space-y-3 p-4 bg-slate-900 border border-slate-800 rounded-xl">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-500 uppercase">Ma progression</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        selectedSuivi.statut === StatutSuiviFormation.COMPLETED ? 'bg-green-500/20 text-green-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {STATUT_SUIVI_FORMATION_LABELS[selectedSuivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS]}
                      </span>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Progression</span>
                        <span className="font-bold text-white">{selectedSuivi.progression}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full rounded-full transition-all"
                          style={{ width: `${selectedSuivi.progression}%` }}
                        />
                      </div>
                    </div>

                    {selectedSuivi.statut === StatutSuiviFormation.IN_PROGRESS && (
                      <div className="space-y-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={selectedSuivi.progression}
                          onChange={(e) => {
                            const prog = Number(e.target.value);
                            if (prog < 100) updateProgression(selectedSuivi.id, prog);
                          }}
                          className="w-full"
                        />
                        {selectedSuivi.progression >= 95 && (
                          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={completionScore[selectedSuivi.id] ?? ''}
                                onChange={(e) => setCompletionScore(prev => ({ ...prev, [selectedSuivi.id]: Number(e.target.value) }))}
                                className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-xs"
                                placeholder="Score (0-100)"
                              />
                              <button
                                onClick={() => {
                                  const score = completionScore[selectedSuivi.id];
                                  updateProgression(selectedSuivi.id, 100, score);
                                }}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold flex items-center gap-1.5"
                              >
                                <Award size={12} />
                                Terminer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedSuivi.statut === StatutSuiviFormation.COMPLETED && selectedSuivi.score != null && (
                      <div className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg">
                        <Star size={14} className="text-yellow-400" />
                        <span className="text-xs text-slate-300">Score: <span className={`font-bold ${selectedSuivi.score >= 70 ? 'text-green-400' : 'text-amber-400'}`}>{selectedSuivi.score}/100</span></span>
                      </div>
                    )}
                  </div>
                )}

                {/* Content URL */}
                {selectedFormation.contenu_url && (
                  <a
                    href={selectedFormation.contenu_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm text-center transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Accéder au contenu
                  </a>
                )}

                {/* Enroll Button */}
                {agentId && !selectedSuivi && (
                  <button
                    onClick={() => {
                      inscrireFormation(selectedFormation.id);
                      setSelectedFormation(null);
                    }}
                    className="block w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm text-center transition"
                  >
                    S'inscrire à cette formation
                  </button>
                )}

                {/* Certificate Download */}
                {selectedSuivi?.statut === StatutSuiviFormation.COMPLETED && selectedSuivi.certificat_url && (
                  <a
                    href={selectedSuivi.certificat_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm text-center transition flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    Télécharger le certificat
                  </a>
                )}
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
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
        cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20 text-cyan-400',
    };
    
    return (
        <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
            </div>
            <div className="text-lg font-bold text-white truncate">{value}</div>
            <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
        </div>
    );
}
