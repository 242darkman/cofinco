import React, { useState, useCallback } from 'react';
import { Plus, GraduationCap, Users as UsersIcon, Calendar, MapPin, Clock, User, FileText, X, Pencil, Trash2, Star, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { Formation, FormationParticipant } from '../../hooks/hr/useFormations';
import { Employe } from '../../hooks/hr/useEmployes';
import { Card, Button, Modal, FormField, Badge, ResponsiveTable } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import FormationCertificatesPanel from './FormationCertificatesPanel';

interface FormationsManagerProps {
  formations: Formation[];
  employes: Employe[];
  selectedParticipants: string[];
  onToggleParticipant: (employeId: string) => void;
  onCreate: (data: {
    titre: string;
    formateur: string;
    dateDebut: string;
    duree: string;
    lieu?: string;
    description?: string;
    capaciteMax?: number;
  }) => Promise<boolean>;
  onFetchParticipants?: (formationId: number) => Promise<FormationParticipant[]>;
  onUpdate?: (formationId: number, data: Partial<Formation>) => Promise<boolean>;
  onDelete?: (formationId: number) => Promise<boolean>;
  onEvaluateParticipant?: (formationId: number, employeId: string, data: { scoreEvaluation: number; recommandation: string; competencesAcquises?: string[]; evaluation?: string }) => Promise<FormationParticipant | null>;
}

export default function FormationsManager({
  formations,
  employes,
  selectedParticipants,
  onToggleParticipant,
  onCreate,
  onFetchParticipants,
  onUpdate,
  onDelete,
  onEvaluateParticipant,
}: FormationsManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateFormations = hasPermission('rh', 'edit') || hasPermission('formations', 'create');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    titre: '',
    formateur: '',
    dateDebut: '',
    duree: '',
    lieu: '',
    description: '',
    capaciteMax: 20
  });

  // Detail modal state
  const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);
  const [participants, setParticipants] = useState<FormationParticipant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // Edit mode
  const [editingFormation, setEditingFormation] = useState<Formation | null>(null);
  const [editData, setEditData] = useState({ titre: '', formateur: '', dateDebut: '', duree: '', lieu: '', description: '', capaciteMax: 20 });
  const [confirmDelete, setConfirmDelete] = useState<Formation | null>(null);

  // Evaluation state
  const [evaluatingParticipant, setEvaluatingParticipant] = useState<string | null>(null);
  const [evalForm, setEvalForm] = useState({ scoreEvaluation: 70, recommandation: 'SATISFAISANT', competencesAcquises: '', evaluation: '' });
  const [submittingEval, setSubmittingEval] = useState(false);

  const handleEdit = (formation: Formation) => {
    setEditData({
      titre: formation.titre,
      formateur: formation.formateur,
      dateDebut: formation.dateDebut,
      duree: formation.duree,
      lieu: formation.lieu || '',
      description: formation.description || '',
      capaciteMax: formation.capaciteMax || 20,
    });
    setEditingFormation(formation);
    setSelectedFormation(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFormation || !onUpdate) return;
    const success = await onUpdate(editingFormation.id, editData);
    if (success) {
      toast.success('Formation mise à jour');
      setEditingFormation(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete || !onDelete) return;
    const success = await onDelete(confirmDelete.id);
    if (success) {
      toast.success('Formation supprimée');
      setConfirmDelete(null);
      setSelectedFormation(null);
    }
  };

  const handleEvaluateSubmit = async (formationId: number, employeId: string) => {
    if (!onEvaluateParticipant) return;
    setSubmittingEval(true);
    try {
      const competencesArray = evalForm.competencesAcquises
        ? evalForm.competencesAcquises.split(',').map(c => c.trim()).filter(Boolean)
        : undefined;
      const result = await onEvaluateParticipant(formationId, employeId, {
        scoreEvaluation: evalForm.scoreEvaluation,
        recommandation: evalForm.recommandation,
        competencesAcquises: competencesArray,
        evaluation: evalForm.evaluation || undefined,
      });
      if (result) {
        setParticipants(prev => prev.map(p =>
          p.employeId === employeId ? { ...p, ...result } : p
        ));
        toast.success('Evaluation enregistrée');
        setEvaluatingParticipant(null);
        setEvalForm({ scoreEvaluation: 70, recommandation: 'SATISFAISANT', competencesAcquises: '', evaluation: '' });
      }
    } catch {
      toast.error("Erreur lors de l'évaluation");
    } finally {
      setSubmittingEval(false);
    }
  };

  const getRecommandationColor = (rec?: string | null) => {
    switch (rec) {
      case 'EXCELLENT': return 'success';
      case 'SATISFAISANT': return 'warning';
      case 'INSUFFISANT': return 'danger';
      default: return 'neutral';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  // Pagination

  // Safeguard: Ensure formations is an array
  const safeFormations = Array.isArray(formations) ? formations : [];
  
  const [currentPaginationPage, setCurrentPaginationPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(safeFormations.length / ITEMS_PER_PAGE);
  const paginatedFormations = safeFormations.slice(
    (currentPaginationPage - 1) * ITEMS_PER_PAGE,
    currentPaginationPage * ITEMS_PER_PAGE
  );

  const handleRowClick = useCallback(async (formation: Formation) => {
    setSelectedFormation(formation);
    setParticipants([]);
    
    if (onFetchParticipants) {
      setLoadingParticipants(true);
      try {
        const data = await onFetchParticipants(formation.id);
        setParticipants(data);
      } catch (error) {
        console.error('Erreur chargement participants:', error);
      } finally {
        setLoadingParticipants(false);
      }
    }
  }, [onFetchParticipants]);

  const closeDetailModal = () => {
    setSelectedFormation(null);
    setParticipants([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onCreate(formData);
    if (success) {
      setFormData({
        titre: '',
        formateur: '',
        dateDebut: '',
        duree: '',
        lieu: '',
        description: '',
        capaciteMax: 20
      });
      setShowForm(false);
    }
  };

  const getStatutColor = (statut: Formation['statut']) => {
    switch (statut) {
      case 'IN_PROGRESS': return 'success';
      case 'PLANNED': return 'warning';
      case 'COMPLETED': return 'neutral';
      case 'CANCELLED': return 'danger';
      default: return 'neutral';
    }
  };

  const columns = [
    {
      label: 'Formation',
      key: 'titre',
      primary: true,
      format: (val: string, item: Formation) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <GraduationCap size={18} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm truncate">{val}</div>
            <div className="text-[10px] text-slate-400">Formateur: {item.formateur}</div>
          </div>
        </div>
      )
    },
    {
      label: 'Date',
      key: 'dateDebut',
      hideOnMobile: true,
      format: (val: string, item: Formation) => (
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <Calendar size={12} className="text-slate-500" />
          <span>{val} - {item.duree}</span>
        </div>
      )
    },
    {
      label: 'Participants',
      key: 'participants',
      format: (val: number, item: Formation) => (
        <div className="flex items-center gap-1 text-xs">
          <UsersIcon size={12} className="text-purple-400" />
          <span className="font-semibold text-purple-300">{val || 0}</span>
          {item.capaciteMax && (
            <span className="text-slate-500">/ {item.capaciteMax}</span>
          )}
        </div>
      )
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (val: string, item: Formation) => (
        <Badge variant={getStatutColor(item.statut)} value={val} size="sm" />
      )
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Compact Header Toolbar */}
      <div className="shrink-0 flex justify-between items-center p-1">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
           <GraduationCap size={16} className="text-blue-400" />
           Formations
        </h3>
        {canCreateFormations && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="h-8 text-xs px-3">
            <Plus size={14} />
            <span className="hidden sm:inline">Nouvelle Formation</span>
          </Button>
        )}
      </div>

      {/* Main Content - Flex Grow */}
      <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col">
        <div className="flex-1 overflow-hidden">
          <ResponsiveTable
            data={paginatedFormations}
            columns={columns}
            mobileBreakpoint="md"
            emptyMessage="Aucune formation enregistrée."
            maxHeight="100%"
            onRowClick={handleRowClick}
            pagination={{
              page: currentPaginationPage,
              totalPages,
              onPageChange: setCurrentPaginationPage
            }}
            density="compact"
            className="border-0 rounded-none h-full"
            headerClassName="bg-slate-900 sticky top-0"
          />
        </div>
      </div>

      {/* Modal Nouvelle Formation */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle Formation"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Titre de la Formation"
            name="titre"
            type="text"
            value={formData.titre}
            onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
            required
          />

          <FormField
            label="Formateur"
            name="formateur"
            type="text"
            value={formData.formateur}
            onChange={(e) => setFormData({ ...formData, formateur: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Date de Début"
              name="dateDebut"
              type="date"
              value={formData.dateDebut}
              onChange={(e) => setFormData({ ...formData, dateDebut: e.target.value })}
              required
            />

            <FormField
              label="Durée"
              name="duree"
              type="text"
              value={formData.duree}
              onChange={(e) => setFormData({ ...formData, duree: e.target.value })}
              placeholder="Ex: 3 jours"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Participants ({selectedParticipants.length} sélectionnés)
            </label>
            <div className="max-h-48 overflow-y-auto bg-slate-700 rounded-lg p-3 space-y-2">
              {employes.map((emp) => (
                <label
                  key={emp.id}
                  className="flex items-center gap-3 p-2 hover:bg-slate-600 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedParticipants.includes(emp.id)}
                    onChange={() => onToggleParticipant(emp.id)}
                    className="w-4 h-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-white">
                    {emp.nom} {emp.prenom} - {emp.poste}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Créer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Détail Formation - Mobile First */}
      {selectedFormation && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" 
          onClick={closeDetailModal}
        >
          <div 
            className="bg-slate-900 rounded-t-2xl sm:rounded-xl border-t sm:border border-slate-700 w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Mobile optimized with drag indicator */}
            <div className="flex flex-col border-b border-slate-700">
              {/* Mobile drag indicator */}
              <div className="flex justify-center pt-2 sm:hidden">
                <div className="w-10 h-1 bg-slate-600 rounded-full"></div>
              </div>
              
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 sm:p-3 bg-blue-500/20 rounded-xl flex-shrink-0">
                    <GraduationCap size={24} className="text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white truncate">
                      {selectedFormation.titre}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400">
                      Formateur: {selectedFormation.formateur}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={closeDetailModal}
                  className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-white flex-shrink-0"
                  aria-label="Fermer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Info cards - Mobile: stack, Desktop: grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <Calendar size={16} className="mx-auto text-cyan-400 mb-1" />
                  <p className="text-[10px] sm:text-xs text-slate-400">Date</p>
                  <p className="text-xs sm:text-sm font-semibold text-white">{selectedFormation.dateDebut}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <Clock size={16} className="mx-auto text-emerald-400 mb-1" />
                  <p className="text-[10px] sm:text-xs text-slate-400">Durée</p>
                  <p className="text-xs sm:text-sm font-semibold text-white">{selectedFormation.duree}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <UsersIcon size={16} className="mx-auto text-purple-400 mb-1" />
                  <p className="text-[10px] sm:text-xs text-slate-400">Participants</p>
                  <p className="text-xs sm:text-sm font-semibold text-white">
                    {selectedFormation.participants || 0}
                    {selectedFormation.capaciteMax && <span className="text-slate-500">/{selectedFormation.capaciteMax}</span>}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <Badge variant={getStatutColor(selectedFormation.statut)} value={selectedFormation.statut} size="sm" />
                </div>
              </div>

              {/* Lieu si disponible */}
              {selectedFormation.lieu && (
                <div className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/30 rounded-lg p-3">
                  <MapPin size={16} className="text-rose-400 flex-shrink-0" />
                  <span>{selectedFormation.lieu}</span>
                </div>
              )}

              {/* Description si disponible */}
              {selectedFormation.description && (
                <div className="bg-slate-800/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                    <FileText size={14} />
                    <span>Description</span>
                  </div>
                  <p className="text-sm text-slate-300">{selectedFormation.description}</p>
                </div>
              )}

              {/* Liste des participants */}
              <div className="bg-slate-800/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <UsersIcon size={14} />
                    <span>Participants inscrits</span>
                  </div>
                  <span className="text-xs text-purple-400 font-bold">
                    {participants.length} inscrit(s)
                  </span>
                </div>

                {loadingParticipants ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : participants.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {participants.map((participant) => (
                      <div
                        key={participant.employeId}
                        className="bg-slate-800/50 rounded-lg overflow-hidden"
                      >
                        <div className="flex items-center gap-3 p-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {participant.employeNom?.split(' ').map(n => n[0]).join('').slice(0, 2) || <User size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{participant.employeNom}</p>
                            {participant.dateInscription && (
                              <p className="text-[10px] text-slate-500">
                                Inscrit le {new Date(participant.dateInscription).toLocaleDateString('fr-FR')}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {participant.presence && (
                              <Badge
                                variant={participant.presence === 'Présent' ? 'success' : 'neutral'}
                                value={participant.presence}
                                size="sm"
                              />
                            )}
                            {/* Show evaluation badge or evaluate button */}
                            {participant.scoreEvaluation != null ? (
                              <div className="flex items-center gap-1">
                                <span className={`text-xs font-bold ${getScoreColor(participant.scoreEvaluation)}`}>
                                  {participant.scoreEvaluation}/100
                                </span>
                                <Badge variant={getRecommandationColor(participant.recommandation)} value={participant.recommandation || '-'} size="sm" />
                              </div>
                            ) : (
                              selectedFormation?.statut === 'COMPLETED' && onEvaluateParticipant && canCreateFormations && (
                                <button
                                  onClick={() => {
                                    if (evaluatingParticipant === participant.employeId) {
                                      setEvaluatingParticipant(null);
                                    } else {
                                      setEvaluatingParticipant(participant.employeId);
                                      setEvalForm({ scoreEvaluation: 70, recommandation: 'SATISFAISANT', competencesAcquises: '', evaluation: '' });
                                    }
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-md transition"
                                >
                                  <Star size={10} />
                                  Evaluer
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Competences acquises display */}
                        {participant.competencesAcquises && (
                          <div className="px-3 pb-2 flex flex-wrap gap-1">
                            {(() => {
                              try {
                                const parsed = JSON.parse(participant.competencesAcquises);
                                return Array.isArray(parsed) ? parsed : [participant.competencesAcquises];
                              } catch {
                                return participant.competencesAcquises.split(',');
                              }
                            })().map((c: string, i: number) => (
                              <span key={i} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 text-[9px] rounded-full">
                                {c.trim()}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Inline evaluation form */}
                        {evaluatingParticipant === participant.employeId && selectedFormation && (
                          <div className="border-t border-slate-700/50 p-3 space-y-3 bg-slate-800/30">
                            <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
                              <Award size={12} />
                              Evaluation de {participant.employeNom}
                            </div>

                            {/* Score slider */}
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">
                                Score: <span className={`font-bold ${getScoreColor(evalForm.scoreEvaluation)}`}>{evalForm.scoreEvaluation}/100</span>
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={evalForm.scoreEvaluation}
                                onChange={(e) => setEvalForm(f => ({ ...f, scoreEvaluation: parseInt(e.target.value) }))}
                                className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-amber-500"
                              />
                              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                                <span>0</span>
                                <span>50</span>
                                <span>100</span>
                              </div>
                            </div>

                            {/* Recommandation dropdown */}
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Recommandation</label>
                              <select
                                value={evalForm.recommandation}
                                onChange={(e) => setEvalForm(f => ({ ...f, recommandation: e.target.value }))}
                                className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                              >
                                <option value="EXCELLENT">Excellent</option>
                                <option value="SATISFAISANT">Satisfaisant</option>
                                <option value="INSUFFISANT">Insuffisant</option>
                                <option value="NON_EVALUE">Non évalué</option>
                              </select>
                            </div>

                            {/* Competences */}
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Compétences acquises (séparées par virgule)</label>
                              <input
                                type="text"
                                value={evalForm.competencesAcquises}
                                onChange={(e) => setEvalForm(f => ({ ...f, competencesAcquises: e.target.value }))}
                                placeholder="Ex: Excel avancé, Gestion projet, ..."
                                className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 placeholder-slate-500 focus:ring-1 focus:ring-amber-500"
                              />
                            </div>

                            {/* Commentaire */}
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-1">Commentaire (optionnel)</label>
                              <textarea
                                value={evalForm.evaluation}
                                onChange={(e) => setEvalForm(f => ({ ...f, evaluation: e.target.value }))}
                                rows={2}
                                className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 placeholder-slate-500 focus:ring-1 focus:ring-amber-500 resize-none"
                                placeholder="Observations sur le participant..."
                              />
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEvaluatingParticipant(null)}
                                className="px-3 py-1 text-xs text-slate-400 hover:text-white transition"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                disabled={submittingEval}
                                onClick={() => handleEvaluateSubmit(selectedFormation.id, participant.employeId)}
                                className="px-3 py-1 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-black rounded-lg transition disabled:opacity-50"
                              >
                                {submittingEval ? 'Enregistrement...' : 'Enregistrer'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    Aucun participant inscrit
                  </div>
                )}
              </div>

              {/* Certificates Section */}
              <FormationCertificatesPanel
                formationId={selectedFormation.id}
                formationTitre={selectedFormation.titre}
                formationStatut={selectedFormation.statut}
                participants={participants.map(p => ({
                  employeId: p.employeId,
                  employeNom: p.employeNom,
                  presence: p.presence,
                  scoreEvaluation: p.scoreEvaluation ?? undefined,
                }))}
                onRefresh={() => handleRowClick(selectedFormation)}
              />
            </div>

            {/* Footer - Edit/Delete actions */}
            <div className="p-4 border-t border-slate-700 bg-slate-900 flex justify-between items-center gap-2">
              <div className="flex gap-2">
                {canCreateFormations && onUpdate && selectedFormation.statut !== 'CANCELLED' && (
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => handleEdit(selectedFormation)} className="text-blue-400 hover:bg-blue-500/10">
                    Modifier
                  </Button>
                )}
                {canCreateFormations && onDelete && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => { setConfirmDelete(selectedFormation); setSelectedFormation(null); }} className="text-red-400 hover:bg-red-500/10">
                    Supprimer
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={closeDetailModal} className="sm:w-auto">
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Édition Formation */}
      <Modal isOpen={!!editingFormation} onClose={() => setEditingFormation(null)} title="Modifier la Formation" size="lg">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <FormField label="Titre" name="titre" type="text" value={editData.titre} onChange={(e) => setEditData({ ...editData, titre: e.target.value })} required />
          <FormField label="Formateur" name="formateur" type="text" value={editData.formateur} onChange={(e) => setEditData({ ...editData, formateur: e.target.value })} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Date de Début" name="dateDebut" type="date" value={editData.dateDebut} onChange={(e) => setEditData({ ...editData, dateDebut: e.target.value })} required />
            <FormField label="Durée" name="duree" type="text" value={editData.duree} onChange={(e) => setEditData({ ...editData, duree: e.target.value })} placeholder="Ex: 3 jours" required />
          </div>
          <FormField label="Lieu" name="lieu" type="text" value={editData.lieu} onChange={(e) => setEditData({ ...editData, lieu: e.target.value })} />
          <FormField label="Description" name="description" type="textarea" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} />
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button type="button" variant="secondary" onClick={() => setEditingFormation(null)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-red-400">Supprimer la formation</h3>
            </div>
            <div className="p-4 text-sm text-slate-300">
              Voulez-vous vraiment supprimer la formation <span className="font-bold text-white">"{confirmDelete.titre}"</span> ?
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Annuler</Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
