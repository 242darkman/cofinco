import React, { useState, useEffect, useCallback } from 'react';
import { Users, Edit, Trash2, Plus, Save, Calendar, UserPlus, AlertTriangle } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, Modal, EmptyState, LoadingSpinner, Pagination } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { tontineApi, membreTontineApi, clientApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface Tontine {
  id: string;
  nom: string;
  description: string;
  type_tontine: string;
  montant_contribution: number;
  frequence: string;
  date_debut: string;
  nombre_membres: number;       // Was: nombre_membres_max
  membres_actuels: number;      // Was: nombre_membres_actuel
  status: string;
  regles: any;
}

interface Membre {
  id: string;
  tontine_id: string;
  client_id: string;
  position_ordre: number;
  est_president: boolean;
  est_tresorier: boolean;
  status: string;
  montant_total_contribue: number;
  clients?: {
    nom: string;
    prenom: string;
    numero_compte: string;
  };
}

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numero_compte: string;
  telephone: string;
}

export default function AdminTontinesGestion() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateTontines = hasPermission('tontines', 'create') || hasPermission('admin', 'manage');
  const canEditTontines = hasPermission('tontines', 'edit') || hasPermission('admin', 'manage');
  const canDeleteTontines = hasPermission('tontines', 'delete') || hasPermission('admin', 'manage');
  const canManageMembres = hasPermission('tontines', 'edit') || hasPermission('admin', 'manage');

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [tontines, setTontines] = useState<Tontine[]>([]);
  const [selectedTontine, setSelectedTontine] = useState<Tontine | null>(null);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showTontineForm, setShowTontineForm] = useState(false);
  const [showMembreForm, setShowMembreForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6; // Compact: 6 items per page

  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    type_tontine: 'Rotative',
    montant_contribution: '',
    frequence: 'Hebdomadaire',
    date_debut: new Date().toISOString().split('T')[0],
    nombre_membres_max: '10',
    frais_pourcentage: '2',
    montant_par_tour: ''
  });

  const [membreForm, setMembreForm] = useState({
    client_id: '',
    position_ordre: '',
    est_president: false,
    est_tresorier: false
  });

  const chargerTontines = useCallback(async () => {
    try {
      const data = await tontineApi.getAll();
      setTontines(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des tontines'));
    }
  }, []);

  const chargerClients = useCallback(async () => {
    try {
      const data = await clientApi.getAll();
      // Filter active clients
      setClients((data || []).filter((c: any) => c.status === 'Actif' || c.statut === 'Actif'));
    } catch (error) {
      // Silently fail
    }
  }, []);

  const chargerMembres = useCallback(async (tontineId: string) => {
    try {
      const data = await membreTontineApi.getByTontine(tontineId);
      setMembres(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des membres'));
    }
  }, []);

  useEffect(() => {
    chargerTontines();
    chargerClients();
  }, [chargerTontines, chargerClients]);

  const handleSelectTontine = (tontine: Tontine) => {
    setSelectedTontine(tontine);
    chargerMembres(tontine.id);
    setShowTontineForm(false);
    setShowMembreForm(false);
  };

  const handleEditTontine = (tontine: Tontine) => {
    setFormData({
      nom: tontine.nom || '',
      description: tontine.description || '',
      type_tontine: tontine.type_tontine || 'Rotative',
      montant_contribution: tontine.montant_contribution?.toString() || '',
      frequence: tontine.frequence || 'Hebdomadaire',
      date_debut: tontine.date_debut || new Date().toISOString().split('T')[0],
      nombre_membres_max: tontine.nombre_membres?.toString() || '10',
      frais_pourcentage: tontine.regles?.frais_sortie_pourcentage?.toString() || '2',
      montant_par_tour: tontine.regles?.montant_par_tour?.toString() || ''
    });
    setSelectedTontine(tontine);
    setEditMode(true);
    setShowTontineForm(true);
  };

  const handleSaveTontine = useCallback(async () => {
    setLoading(true);
    try {
      const montantContribution = parseFloat(formData.montant_contribution);
      const nombreMembres = parseInt(formData.nombre_membres_max);
      const montantParTour = montantContribution * nombreMembres;

      const tontineData = {
        nom: formData.nom,
        description: formData.description,
        type_tontine: formData.type_tontine,
        montant_contribution: montantContribution,
        frequence: formData.frequence,
        date_debut: formData.date_debut,
        nombre_membres_max: nombreMembres,
        nombre_membres_actuel: editMode ? selectedTontine?.membres_actuels : 0,
        status: 'Active',
        regles: {
          frais_sortie_pourcentage: parseFloat(formData.frais_pourcentage),
          montant_par_tour: montantParTour,
          description_frais: `Frais de ${formData.frais_pourcentage}% sur chaque distribution`
        }
      };

      if (editMode && selectedTontine) {
        await tontineApi.update(selectedTontine.id, tontineData);
        toast.success('Tontine modifiée avec succès');
      } else {
        await tontineApi.create(tontineData);
        toast.success('Tontine créée avec succès');
      }

      await chargerTontines();
      setShowTontineForm(false);
      setEditMode(false);
      resetForm();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde'));
    } finally {
      setLoading(false);
    }
  }, [formData, editMode, selectedTontine, chargerTontines]);

  const handleDeleteTontine = useCallback((tontineId: string) => {
    openConfirm({
      title: 'Supprimer cette tontine ?',
      message: 'Cette action est irréversible. Êtes-vous sûr de vouloir supprimer cette tontine ?',
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await tontineApi.delete(tontineId);
          toast.success('Tontine supprimée avec succès');
          await chargerTontines();
          setSelectedTontine(null);
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        }
      },
    });
  }, [openConfirm, chargerTontines]);

  const handleAddMembre = useCallback(async () => {
    if (!selectedTontine) return;

    setLoading(true);
    try {
      const membreData = {
        tontine_id: selectedTontine.id,
        client_id: membreForm.client_id,
        position_ordre: parseInt(membreForm.position_ordre),
        est_president: membreForm.est_president,
        est_tresorier: membreForm.est_tresorier,
        status: 'Actif',
        date_adhesion: new Date().toISOString().split('T')[0],
        montant_total_contribue: 0
      };

      await membreTontineApi.create(membreData);

      await tontineApi.update(selectedTontine.id, {
        nombre_membres_actuel: selectedTontine.membres_actuels + 1
      });

      toast.success('Membre ajouté avec succès');
      await chargerMembres(selectedTontine.id);
      await chargerTontines();
      setShowMembreForm(false);
      setMembreForm({ client_id: '', position_ordre: '', est_president: false, est_tresorier: false });
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'ajout du membre'));
    } finally {
      setLoading(false);
    }
  }, [selectedTontine, membreForm, chargerMembres, chargerTontines]);

  const handleDeleteMembre = useCallback((membreId: string) => {
    if (!selectedTontine) return;

    openConfirm({
      title: 'Retirer ce membre ?',
      message: 'Êtes-vous sûr de vouloir retirer ce membre de la tontine ?',
      variant: 'danger',
      confirmText: 'Retirer',
      onConfirm: async () => {
        try {
          await membreTontineApi.delete(membreId);

          await tontineApi.update(selectedTontine.id, {
            nombre_membres_actuel: Math.max(0, selectedTontine.membres_actuels - 1)
          });

          toast.success('Membre retiré avec succès');
          await chargerMembres(selectedTontine.id);
          await chargerTontines();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression du membre'));
        }
      },
    });
  }, [selectedTontine, openConfirm, chargerMembres, chargerTontines]);

  const resetForm = () => {
    setFormData({
      nom: '',
      description: '',
      type_tontine: 'Rotative',
      montant_contribution: '',
      frequence: 'Hebdomadaire',
      date_debut: new Date().toISOString().split('T')[0],
      nombre_membres_max: '10',
      frais_pourcentage: '2',
      montant_par_tour: ''
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Compact mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-teal-500/20 rounded-xl">
            <Users className="text-teal-400" size={22} />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-white">Gestion des Tontines</h2>
            <p className="text-xs sm:text-sm text-slate-400">Gérer les groupes d'épargne rotative</p>
          </div>
        </div>
{canCreateTontines ? (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setShowTontineForm(true);
              setEditMode(false);
              resetForm();
              setSelectedTontine(null);
            }}
            className="w-full sm:w-auto justify-center"
          >
            Nouvelle Tontine
          </Button>
        ) : (
          <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            Permission requise
          </div>
        )}
      </div>

      {/* Tontines Grid */}
      {(() => {
        const totalPages = Math.ceil(tontines.length / itemsPerPage);
        const paginatedTontines = tontines.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage
        );

        if (tontines.length === 0) {
          return (
            <EmptyState
              icon={Users}
              title="Aucune tontine"
              description="Créez votre première tontine pour commencer."
            />
          );
        }

        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {paginatedTontines.map((tontine) => (
            <Card
              key={tontine.id}
              onClick={() => handleSelectTontine(tontine)}
              className={`cursor-pointer transition-all p-4 sm:p-5 ${
                selectedTontine?.id === tontine.id
                  ? 'bg-slate-800 border-teal-500 ring-1 ring-teal-500/50'
                  : 'bg-slate-900 border-slate-800 hover:border-teal-500/50'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-sm sm:text-base truncate">{tontine.nom}</h3>
                  <p className="text-xs text-slate-400">{tontine.frequence}</p>
                </div>
                <Badge
                  value={tontine.status}
                  size="sm"
                />
              </div>

              {/* Stats */}
              <div className="space-y-1.5 text-xs sm:text-sm mb-3">
                <div className="flex justify-between">
                  <span className="text-slate-400">Cotisation:</span>
                  <span className="font-bold text-teal-400">{tontine.montant_contribution?.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Membres:</span>
                  <span className="font-bold text-white">{tontine.membres_actuels || 0}/{tontine.nombre_membres || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Frais:</span>
                  <span className="font-bold text-emerald-400">{tontine.regles?.frais_sortie_pourcentage || 0}%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {canEditTontines && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Edit}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditTontine(tontine);
                    }}
                    className="flex-1 justify-center"
                  >
                    Modifier
                  </Button>
                )}
                {canDeleteTontines && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTontine(tontine.id);
                    }}
                    className="p-2 text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            canGoNext={currentPage < totalPages}
            canGoPrevious={currentPage > 1}
            itemsPerPage={itemsPerPage}
            totalItems={tontines.length}
            className="mt-4"
          />
        )}
      </>
    );
  })()}

      {/* Selected Tontine Members */}
      {selectedTontine && (
        <Card className="bg-slate-900 border-slate-800 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-white text-sm sm:text-lg">
              Membres de {selectedTontine.nom}
            </h3>
{canManageMembres && (
              <Button
                variant="primary"
                size="sm"
                icon={UserPlus}
                onClick={() => setShowMembreForm(!showMembreForm)}
              >
                Ajouter membre
              </Button>
            )}
          </div>

          {/* Add Member Form */}
          {showMembreForm && (
            <Card className="bg-slate-800 border-slate-700 p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <SelectField
                    label="Sélectionner un client"
                    name="client_id"
                    value={membreForm.client_id}
                    onChange={(e) => setMembreForm({ ...membreForm, client_id: e.target.value })}
                    options={[
                      { value: '', label: '-- Choisir un client --' },
                      ...clients.map(c => ({ value: c.id, label: `${c.nom} ${c.prenom} - ${c.numero_compte}` }))
                    ]}
                  />
                </div>
                <FormField
                  label="Position dans l'ordre"
                  name="position_ordre"
                  type="number"
                  value={membreForm.position_ordre}
                  onChange={(e) => setMembreForm({ ...membreForm, position_ordre: e.target.value })}
                  placeholder="1"
                />
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={membreForm.est_president}
                      onChange={(e) => setMembreForm({ ...membreForm, est_president: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-xs sm:text-sm">Président</span>
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={membreForm.est_tresorier}
                      onChange={(e) => setMembreForm({ ...membreForm, est_tresorier: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-xs sm:text-sm">Trésorier</span>
                  </label>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" size="sm" onClick={handleAddMembre} isLoading={loading}>
                  Ajouter
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowMembreForm(false)}>
                  Annuler
                </Button>
              </div>
            </Card>
          )}

          {/* Members List */}
          <div className="space-y-2">
            {membres.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                Aucun membre dans cette tontine
              </div>
            ) : (
              membres.map((membre) => (
                <div
                  key={membre.id}
                  className="bg-slate-800 rounded-lg p-3 sm:p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-8 h-8 sm:w-10 sm:h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {membre.position_ordre}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-white text-sm truncate">
                          {membre.clients?.nom} {membre.clients?.prenom}
                        </h4>
                        {membre.est_president && <Badge value="Président" variant="success" size="sm" />}
                        {membre.est_tresorier && <Badge value="Trésorier" variant="info" size="sm" />}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{membre.clients?.numero_compte}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-slate-500">Contribué</p>
                      <p className="font-bold text-teal-400 text-sm">{membre.montant_total_contribue?.toLocaleString()} FCFA</p>
                    </div>
{canManageMembres && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMembre(membre.id)}
                        className="p-2 text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Tontine Form Modal */}
      <Modal
        isOpen={showTontineForm}
        onClose={() => {
          setShowTontineForm(false);
          setEditMode(false);
          resetForm();
        }}
        title={editMode ? 'Modifier la tontine' : 'Créer une nouvelle tontine'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <FormField
              label="Nom du groupe"
              name="nom"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Ex: Groupe Solidarité"
            />
            <SelectField
              label="Fréquence"
              name="frequence"
              value={formData.frequence}
              onChange={(e) => setFormData({ ...formData, frequence: e.target.value })}
              options={[
                { value: 'Hebdomadaire', label: 'Hebdomadaire' },
                { value: 'Bimensuel', label: 'Bimensuel' },
                { value: 'Mensuel', label: 'Mensuel' },
                { value: 'Trimestriel', label: 'Trimestriel' }
              ]}
            />
            <FormField
              label="Montant cotisation (FCFA)"
              name="montant_contribution"
              type="number"
              value={formData.montant_contribution}
              onChange={(e) => setFormData({ ...formData, montant_contribution: e.target.value })}
              placeholder="10000"
            />
            <FormField
              label="Nombre max de membres"
              name="nombre_membres_max"
              type="number"
              value={formData.nombre_membres_max}
              onChange={(e) => setFormData({ ...formData, nombre_membres_max: e.target.value })}
              placeholder="10"
            />
            <FormField
              label="Frais de sortie (%)"
              name="frais_pourcentage"
              type="number"
              value={formData.frais_pourcentage}
              onChange={(e) => setFormData({ ...formData, frais_pourcentage: e.target.value })}
              placeholder="2"
            />
            <FormField
              label="Date de début"
              name="date_debut"
              type="date"
              value={formData.date_debut}
              onChange={(e) => setFormData({ ...formData, date_debut: e.target.value })}
              icon={Calendar}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="primary"
              icon={Save}
              onClick={handleSaveTontine}
              isLoading={loading}
              fullWidth
            >
              Sauvegarder
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowTontineForm(false);
                setEditMode(false);
                resetForm();
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
