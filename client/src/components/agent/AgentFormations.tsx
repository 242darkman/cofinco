import React, { useState, useEffect } from 'react';
import { GraduationCap, Plus, Award, TrendingUp, CheckCircle, Clock, ExternalLink, Download, Star } from 'lucide-react';
import { StatutSuiviFormation, STATUT_SUIVI_FORMATION_LABELS } from '@shared/enum/status-constants';

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
  const progressionMoyenne = suivis.length > 0
    ? suivis.reduce((sum, s) => sum + s.progression, 0) / suivis.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <GraduationCap size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{formations.length}</div>
          <div className="text-blue-100 text-sm">Formations Disponibles</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{formationsCompletes}</div>
          <div className="text-green-100 text-sm">Formations Complétées</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{suivis.filter(s => s.statut === StatutSuiviFormation.IN_PROGRESS).length}</div>
          <div className="text-emerald-100 text-sm">En Cours</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={24} />
          </div>
          <div className="text-3xl font-bold mb-1">{progressionMoyenne.toFixed(0)}%</div>
          <div className="text-emerald-100 text-sm">Progression Moyenne</div>
        </div>
      </div>

      <button
        onClick={() => setShowNewFormation(!showNewFormation)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
      >
        <Plus size={20} />
        Nouvelle Formation
      </button>

      {showNewFormation && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Nouvelle Formation</h3>
          <form onSubmit={creerFormation} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Titre</label>
                <input
                  type="text"
                  value={newFormation.titre}
                  onChange={(e) => setNewFormation({ ...newFormation, titre: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Type</label>
                <select
                  value={newFormation.type_formation}
                  onChange={(e) => setNewFormation({ ...newFormation, type_formation: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                >
                  <option value="Onboarding">Onboarding</option>
                  <option value="Continue">Continue</option>
                  <option value="Certification">Certification</option>
                  <option value="Recyclage">Recyclage</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Durée (heures)</label>
                <input
                  type="number"
                  value={newFormation.duree_heures}
                  onChange={(e) => setNewFormation({ ...newFormation, duree_heures: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  min="1"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Description</label>
                <textarea
                  value={newFormation.description}
                  onChange={(e) => setNewFormation({ ...newFormation, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  rows={3}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">URL du contenu (PDF, vidéo, etc.)</label>
                <input
                  type="url"
                  value={newFormation.contenu_url}
                  onChange={(e) => setNewFormation({ ...newFormation, contenu_url: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="https://example.com/formation.pdf"
                />
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={newFormation.obligatoire}
                    onChange={(e) => setNewFormation({ ...newFormation, obligatoire: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Formation obligatoire</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                Créer
              </button>
              <button type="button" onClick={() => setShowNewFormation(false)} className="px-6 py-3 bg-slate-700 text-white rounded-lg">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {agentId && suivis.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Mes Formations</h3>
          <div className="space-y-4">
            {suivis.map((suivi) => (
              <div key={suivi.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-white font-bold">{suivi.formation?.titre}</h4>
                    <p className="text-slate-400 text-sm">{suivi.formation?.description}</p>
                    {suivi.formation?.contenu_url && (
                      <a
                        href={suivi.formation.contenu_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm mt-1"
                      >
                        <ExternalLink size={14} />
                        Accéder au contenu
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {suivi.statut === StatutSuiviFormation.COMPLETED && suivi.certificat_url && (
                      <a
                        href={suivi.certificat_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"
                        title="Télécharger le certificat"
                      >
                        <Download size={16} />
                      </a>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      suivi.statut === StatutSuiviFormation.COMPLETED ? 'bg-green-500/20 text-green-400' :
                      suivi.statut === StatutSuiviFormation.IN_PROGRESS ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {STATUT_SUIVI_FORMATION_LABELS[suivi.statut as keyof typeof STATUT_SUIVI_FORMATION_LABELS] || suivi.statut}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-sm text-slate-300 mb-2">
                    <span>Progression</span>
                    <span>{suivi.progression}%</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all"
                      style={{ width: `${suivi.progression}%` }}
                    />
                  </div>
                </div>

                {/* Score display for completed formations */}
                {suivi.statut === StatutSuiviFormation.COMPLETED && suivi.score != null && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-slate-600/30 rounded-lg">
                    <Star size={16} className="text-yellow-400" />
                    <span className="text-sm text-slate-300">
                      Score: <span className={`font-bold ${suivi.score >= 70 ? 'text-green-400' : suivi.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{suivi.score}/100</span>
                    </span>
                    {suivi.certificat_url && (
                      <span className="ml-auto flex items-center gap-1 text-green-400 text-xs">
                        <Award size={14} />
                        Certifié
                      </span>
                    )}
                  </div>
                )}

                {suivi.statut === StatutSuiviFormation.IN_PROGRESS && (
                  <div className="space-y-3">
                    <div className="flex gap-2 items-center">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={suivi.progression}
                        onChange={(e) => {
                          const prog = Number(e.target.value);
                          if (prog < 100) {
                            updateProgression(suivi.id, prog);
                          }
                        }}
                        className="flex-1"
                      />
                    </div>

                    {/* Score input + completion button when progression reaches 100 */}
                    {suivi.progression >= 95 && (
                      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="text-sm text-blue-400 font-semibold mb-2">Terminer la formation</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Score obtenu (0-100)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={completionScore[suivi.id] ?? ''}
                              onChange={(e) => setCompletionScore(prev => ({ ...prev, [suivi.id]: Number(e.target.value) }))}
                              className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                              placeholder="Score..."
                            />
                          </div>
                          <button
                            onClick={() => {
                              const score = completionScore[suivi.id];
                              updateProgression(suivi.id, 100, score !== undefined ? score : undefined);
                            }}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 mt-4"
                          >
                            <Award size={16} />
                            Terminer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-xl font-bold text-white mb-4">Catalogue de Formations</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {formations.map((formation) => (
            <div key={formation.id} className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <div className="flex items-start justify-between mb-3">
                <GraduationCap size={24} className="text-blue-400" />
                {formation.obligatoire && (
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold">
                    Obligatoire
                  </span>
                )}
              </div>
              <h4 className="text-lg font-bold text-white mb-2">{formation.titre}</h4>
              <p className="text-slate-300 text-sm mb-4">{formation.description}</p>

              {formation.contenu_url && (
                <a
                  href={formation.contenu_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm mb-4"
                >
                  <ExternalLink size={14} />
                  Voir le contenu
                </a>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">
                  <span className="text-blue-400">{formation.type_formation}</span> • {formation.duree_heures}h
                </div>
                {agentId && !suivis.find(s => s.formation_id === formation.id) && (
                  <button
                    onClick={() => inscrireFormation(formation.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold"
                  >
                    S'inscrire
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {formations.length === 0 && (
          <div className="text-center py-12">
            <GraduationCap size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">Aucune formation disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}
