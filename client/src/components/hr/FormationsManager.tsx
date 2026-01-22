import React, { useState, useCallback } from 'react';
import { Plus, GraduationCap, Users as UsersIcon, Calendar, MapPin, Clock, User, FileText, X } from 'lucide-react';
import { Formation, FormationParticipant } from '../../hooks/hr/useFormations';
import { Employe } from '../../hooks/hr/useEmployes';
import { Card, Button, Modal, FormField, Badge, ResponsiveTable } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

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
}

export default function FormationsManager({
  formations,
  employes,
  selectedParticipants,
  onToggleParticipant,
  onCreate,
  onFetchParticipants
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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(formations.length / ITEMS_PER_PAGE);
  const paginatedFormations = formations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-base sm:text-lg font-bold text-white">Formations</h3>
        {canCreateFormations && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Nouvelle Formation</span>
          </Button>
        )}
      </div>

      <Card padding="none" className="bg-slate-900/50 overflow-hidden border-slate-800">
        <ResponsiveTable
          data={paginatedFormations}
          columns={columns}
          mobileBreakpoint="md"
          emptyMessage="Aucune formation enregistrée."
          maxHeight="500px"
          onRowClick={handleRowClick}
          pagination={{
            page: currentPage,
            totalPages,
            onPageChange: setCurrentPage
          }}
        />
      </Card>

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
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {participants.map((participant) => (
                      <div 
                        key={participant.employeId}
                        className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg"
                      >
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
                        {participant.presence && (
                          <Badge 
                            variant={participant.presence === 'Présent' ? 'success' : 'neutral'} 
                            value={participant.presence} 
                            size="sm" 
                          />
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
            </div>

            {/* Footer - Mobile optimized */}
            <div className="p-4 border-t border-slate-700 bg-slate-900">
              <Button 
                variant="secondary" 
                fullWidth 
                onClick={closeDetailModal}
                className="sm:w-auto sm:ml-auto"
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
