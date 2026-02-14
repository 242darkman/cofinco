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
        className="px-3 py-1.5 bg-status-info hover:bg-status-info text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
      >
        {showNewFormation ? <X size={14} /> : <Plus size={14} />}
        {showNewFormation ? 'Annuler' : 'Nouvelle Formation'}
      </button>

      {/* New Formation Form (Compact) */}
      {showNewFormation && (
        <div className="bg-surface-base/50 rounded-xl p-4 border border-edge">
          <form onSubmit={creerFormation} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">Titre</label>
                <input
                  type="text"
                  value={newFormation.titre}
                  onChange={(e) => setNewFormation({ ...newFormation, titre: e.target.value })}
                  className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">Type</label>
                <select
                  value={newFormation.type_formation}
                  onChange={(e) => setNewFormation({ ...newFormation, type_formation: e.target.value })}
                  className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
                >
                  <option value="Onboarding">Onboarding</option>
                  <option value="Continue">Continue</option>
                  <option value="Certification">Certification</option>
                  <option value="Recyclage">Recyclage</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">Durée (h)</label>
                <input
                  type="number"
                  value={newFormation.duree_heures}
                  onChange={(e) => setNewFormation({ ...newFormation, duree_heures: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
                  min="1"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-content-muted mb-1">Description</label>
              <textarea
                value={newFormation.description}
                onChange={(e) => setNewFormation({ ...newFormation, description: e.target.value })}
                className="w-full px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
                rows={2}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={newFormation.contenu_url}
                onChange={(e) => setNewFormation({ ...newFormation, contenu_url: e.target.value })}
                className="flex-1 px-2 py-1.5 bg-surface border border-edge rounded-lg text-content-primary text-xs"
                placeholder="URL du contenu..."
              />
              <label className="flex items-center gap-1.5 text-xs text-content-muted shrink-0">
                <input
                  type="checkbox"
                  checked={newFormation.obligatoire}
                  onChange={(e) => setNewFormation({ ...newFormation, obligatoire: e.target.checked })}
                  className="w-3 h-3"
                />
                Obligatoire
              </label>
              <button type="submit" disabled={loading} className="px-4 py-1.5 bg-status-info hover:bg-status-info text-white rounded-lg font-bold text-xs shrink-0">
                Créer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My Formations (If agent has suivis) */}
      {agentId && suivis.length > 0 && (
        <div className="bg-surface rounded-xl border border-edge overflow-hidden">
          <div className="px-4 py-3 border-b border-edge bg-surface-base/30">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <Award size={16} className="text-status-success" />
              Mes Formations
            </h3>
          </div>
          <div className="divide-y divide-edge/50">
            {suivis.map((suivi) => (
              <div key={suivi.id} className="p-3 hover:bg-surface-elevated/20 transition">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-content-primary truncate">{suivi.formation?.titre}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-surface-elevated rounded-full max-w-32">
                        <div
                          className="h-full bg-gradient-to-r from-status-info to-accent rounded-full transition-all"
                          style={{ width: `${suivi.progression}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-content-muted font-bold">{suivi.progression}%</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    suivi.statut === StatutSuiviFormation.COMPLETED ? 'bg-status-success-bg text-status-success' :
                    suivi.statut === StatutSuiviFormation.IN_PROGRESS ? 'bg-status-info-bg text-status-info' :
                    'bg-surface-subtle/40 text-content-muted'
                  }`}>
                    {STATUT_SUIVI_FORMATION_LABELS[suivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS] || suivi.statut}
                  </span>
                  {suivi.statut === StatutSuiviFormation.COMPLETED && suivi.certificat_url && (
                    <a href={suivi.certificat_url} target="_blank" rel="noopener noreferrer" className="p-1 text-status-success hover:bg-status-success-bg rounded">
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
      <div className="bg-surface rounded-xl border border-edge overflow-hidden">
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between bg-surface-base/30">
          <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
            <GraduationCap size={16} className="text-status-info" />
            Catalogue de Formations
          </h3>
          <span className="text-[10px] text-content-muted font-medium">{formations.length} formations</span>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" /></div>
        ) : formations.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <GraduationCap size={32} className="mx-auto mb-2 text-content-muted" />
            <p className="text-sm text-content-muted">Aucune formation disponible</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 p-2">
            {paginatedFormations.map((formation) => {
              const isEnrolled = suivis.find(s => s.formation_id === formation.id);
              return (
                <div
                  key={formation.id}
                  onClick={() => setSelectedFormation(formation)}
                  className="bg-surface-base/50 rounded-lg p-3 border border-edge-subtle hover:border-edge-strong transition cursor-pointer group"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className="p-1.5 bg-status-info-bg rounded-lg shrink-0">
                      <GraduationCap size={14} className="text-status-info" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-content-primary truncate">{formation.titre}</h4>
                      <p className="text-[10px] text-content-muted line-clamp-1">{formation.description}</p>
                    </div>
                    {formation.obligatoire && (
                      <span className="px-1.5 py-0.5 bg-status-warning-bg text-status-warning rounded text-[8px] font-bold uppercase shrink-0">Requis</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-content-muted">
                      <span className="text-status-info font-bold">{formation.type_formation}</span>
                      <span>•</span>
                      <span>{formation.duree_heures}h</span>
                    </div>
                    <Eye size={12} className="text-content-muted group-hover:text-accent" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-edge-subtle bg-surface-base/20">
            <span className="text-[10px] text-content-muted">Page {currentPage} sur {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-surface border border-edge text-content-muted hover:text-content-primary disabled:opacity-30 transition"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedFormation} onOpenChange={(open) => !open && setSelectedFormation(null)}>
        <SheetContent className="w-full sm:max-w-md bg-surface-base border-l-edge p-0 overflow-y-auto">
          {selectedFormation && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
                <SheetTitle className="text-content-primary flex items-center gap-2">
                  <GraduationCap size={16} className="text-status-info" />
                  {selectedFormation.titre}
                </SheetTitle>
                <SheetDescription className="text-content-muted">
                  {selectedFormation.type_formation} • {selectedFormation.duree_heures} heures
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-status-info-bg text-status-info rounded text-xs font-bold">{selectedFormation.type_formation}</span>
                  <span className="px-2 py-1 bg-surface-elevated text-content-secondary rounded text-xs">{selectedFormation.duree_heures}h</span>
                  {selectedFormation.obligatoire && (
                    <span className="px-2 py-1 bg-status-warning-bg text-status-warning rounded text-xs font-bold">Obligatoire</span>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-content-muted uppercase">Description</h4>
                  <p className="text-sm text-content-secondary leading-relaxed">{selectedFormation.description || 'Aucune description disponible.'}</p>
                </div>

                {/* Progression (if enrolled) */}
                {selectedSuivi && (
                  <div className="space-y-3 p-4 bg-surface-base border border-edge rounded-xl">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-content-muted uppercase">Ma progression</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        selectedSuivi.statut === StatutSuiviFormation.COMPLETED ? 'bg-status-success-bg text-status-success' :
                        'bg-status-info-bg text-status-info'
                      }`}>
                        {STATUT_SUIVI_FORMATION_LABELS[selectedSuivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS]}
                      </span>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs text-content-muted mb-1">
                        <span>Progression</span>
                        <span className="font-bold text-content-primary">{selectedSuivi.progression}%</span>
                      </div>
                      <div className="w-full bg-surface-elevated rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-status-info to-accent h-full rounded-full transition-all"
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
                          <div className="p-3 bg-status-success-bg border border-status-success/30 rounded-lg space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={completionScore[selectedSuivi.id] ?? ''}
                                onChange={(e) => setCompletionScore(prev => ({ ...prev, [selectedSuivi.id]: Number(e.target.value) }))}
                                className="flex-1 px-2 py-1.5 bg-surface border border-edge rounded text-content-primary text-xs"
                                placeholder="Score (0-100)"
                              />
                              <button
                                onClick={() => {
                                  const score = completionScore[selectedSuivi.id];
                                  updateProgression(selectedSuivi.id, 100, score);
                                }}
                                className="px-3 py-1.5 bg-status-success hover:bg-status-success text-white rounded text-xs font-bold flex items-center gap-1.5"
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
                      <div className="flex items-center gap-2 p-2 bg-surface rounded-lg">
                        <Star size={14} className="text-status-warning" />
                        <span className="text-xs text-content-secondary">Score: <span className={`font-bold ${selectedSuivi.score >= 70 ? 'text-status-success' : 'text-status-warning'}`}>{selectedSuivi.score}/100</span></span>
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
                    className="block w-full py-3 bg-status-info hover:bg-status-info text-white rounded-xl font-bold text-sm text-center transition shadow-lg shadow-status-info/20 flex items-center justify-center gap-2"
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
                    className="block w-full py-3 bg-status-success hover:bg-status-success text-white rounded-xl font-bold text-sm text-center transition"
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
                    className="block w-full py-3 bg-status-success hover:bg-status-success text-white rounded-xl font-bold text-sm text-center transition flex items-center justify-center gap-2"
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
        blue: 'from-status-info/20 to-status-info/5 border-status-info/20 text-status-info',
        green: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
        emerald: 'from-status-success/20 to-status-success/5 border-status-success/20 text-status-success',
        cyan: 'from-accent/20 to-accent/5 border-accent/20 text-accent',
    };
    
    return (
        <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorClasses[color] || colorClasses.blue}`}>
            <div className="flex justify-between items-start mb-1">
                <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
            </div>
            <div className="text-lg font-bold text-content-primary truncate">{value}</div>
            <div className="text-[10px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
        </div>
    );
}
