import React, { useState, useEffect, useCallback } from 'react';
import { Users, Edit, Trash2, Plus, Save, Calendar, UserPlus, AlertTriangle } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, Modal, EmptyState, LoadingSpinner, Pagination } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { tontineApi, membreTontineApi, clientApi, tontinePlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import AdminTontinePlansGestion from './AdminTontinePlansGestion';

interface Tontine {
  id: string;
  nom: string;
  description: string;
  type_distribution: string;
  montant_cotisation: number;
  frequence: string;
  date_debut: string;
  nombre_membres: number;
  membres_actuels: number;
  statut: string;
  regles: any;
}

interface Membre {
  id: string;
  tontine_id: string;
  client_id: string;
  position: number;
  est_president?: boolean;
  est_tresorier?: boolean;
  statut: string;
  total_cotisations: number;
  client?: {
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
  const [membresPage, setMembresPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'groupes' | 'plans'>('groupes');
  const [tontinePlans, setTontinePlans] = useState<any[]>([]);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const itemsPerPage = 6; // Compact: 6 items per page

  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    type_distribution: 'Rotative',
    montant_cotisation: '',
    frequence: 'Hebdomadaire',
    date_debut: new Date().toISOString().split('T')[0],
    nombre_membres: '10',
    frais_pourcentage: '2',
    montant_par_tour: ''
  });

  const [membreForm, setMembreForm] = useState({
    client_id: '',
    position: '',
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
      const data = await tontineApi.getMembres(tontineId);
      setMembres(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des membres'));
    }
  }, []);

  const chargerTontinePlans = useCallback(async () => {
    try {
      const data = await tontinePlanApi.getAll();
      setTontinePlans(data?.filter((p: any) => p.actif) || []);
    } catch (error) {
      // Silently fail or use toast
    }
  }, []);

  useEffect(() => {
    chargerTontines();
    chargerClients();
    chargerTontinePlans();
  }, [chargerTontines, chargerClients, chargerTontinePlans]);

  const handleSelectTontine = (tontine: Tontine) => {
    setSelectedTontine(tontine);
    setMembresPage(1); // Reset page on selection
    chargerMembres(tontine.id);
    setShowTontineForm(false);
    setShowMembreForm(false);
  };

  const handleEditTontine = (tontine: Tontine) => {
    // Format date for <input type="date"> (YYYY-MM-DD)
    const formattedDate = tontine.date_debut 
      ? new Date(tontine.date_debut).toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0];

    setFormData({
      nom: tontine.nom || '',
      description: tontine.description || '',
      type_distribution: tontine.type_distribution || 'Rotative',
      montant_cotisation: tontine.montant_cotisation?.toString() || '',
      frequence: tontine.frequence || 'Hebdomadaire',
      date_debut: formattedDate,
      nombre_membres: tontine.nombre_membres?.toString() || '10',
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
      const montantCotisation = parseFloat(formData.montant_cotisation);
      const nombreMembres = parseInt(formData.nombre_membres);
      const montantParTour = montantCotisation * nombreMembres;

      const tontineData = {
        nom: formData.nom,
        description: formData.description,
        type_distribution: formData.type_distribution,
        montant_cotisation: montantCotisation,
        frequence: formData.frequence,
        date_debut: formData.date_debut,
        nombre_membres: nombreMembres,
        membres_actuels: editMode ? selectedTontine?.membres_actuels : 0,
        statut: 'Active',
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
        client_id: membreForm.client_id,
        position: parseInt(membreForm.position),
        est_president: membreForm.est_president,
        est_tresorier: membreForm.est_tresorier,
        statut: 'Actif',
        date_adhesion: new Date().toISOString().split('T')[0],
        total_cotisations: 0
      };

      await tontineApi.addMembre(selectedTontine.id, membreData);

      await tontineApi.update(selectedTontine.id, {
        membres_actuels: selectedTontine.membres_actuels + 1
      });

      toast.success('Membre ajouté avec succès');
      await chargerMembres(selectedTontine.id);
      await chargerTontines();
      setShowMembreForm(false);
      setMembreForm({ client_id: '', position: '', est_president: false, est_tresorier: false });
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
          await tontineApi.deleteMembre(selectedTontine.id, membreId);

          await tontineApi.update(selectedTontine.id, {
            membres_actuels: Math.max(0, selectedTontine.membres_actuels - 1)
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
      type_distribution: 'Rotative',
      montant_cotisation: '',
      frequence: 'Hebdomadaire',
      date_debut: new Date().toISOString().split('T')[0],
      nombre_membres: '10',
      frais_pourcentage: '2',
      montant_par_tour: ''
    });
  };

  const applyPlan = (planId: string) => {
    const plan = tontinePlans.find(p => p.id === planId);
    if (!plan) return;

    setFormData({
      ...formData,
      nom: formData.nom || plan.nom,
      description: formData.description || plan.description || '',
      montant_cotisation: plan.montant_cotisation.toString(),
      frequence: plan.frequence,
      nombre_membres: plan.nombre_membres.toString(),
      frais_pourcentage: plan.taux_plateforme.toString()
    });
    toast.info(`Modèle "${plan.nom}" appliqué`);
  };

  const handleLaunchFromPlan = (plan: any) => {
    setActiveTab('groupes');
    resetForm();
    setEditMode(false);
    
    // Defer form opening to ensure tab switch is processed if needed, 
    // but React handles it fine usually.
    setTimeout(() => {
      applyPlan(plan);
      setShowTontineForm(true);
    }, 100);
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
              if (activeTab === 'groupes') {
                setShowTontineForm(true);
                setEditMode(false);
                resetForm();
                setSelectedTontine(null);
              } else {
                setShowPlanForm(true);
              }
            }}
            className="w-full sm:w-auto justify-center"
          >
            {activeTab === 'groupes' ? 'Nouvelle Tontine' : 'Nouveau Modèle'}
          </Button>
        ) : (
          <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            Permission requise
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6">
        <button
          onClick={() => setActiveTab('groupes')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'groupes' 
            ? 'text-teal-400 border-teal-500' 
            : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          Groupes de Tontine
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'plans' 
            ? 'text-teal-400 border-teal-500' 
            : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          Modèles & Plans
        </button>
      </div>

      {activeTab === 'plans' ? (
        <AdminTontinePlansGestion 
          showForm={showPlanForm} 
          onHideForm={() => setShowPlanForm(false)} 
          onLaunchTontine={handleLaunchFromPlan}
        />
      ) : (
        <>
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
              className={`cursor-pointer transition-all p-5 flex flex-col h-full group ${
                selectedTontine?.id === tontine.id
                  ? 'bg-slate-800 border-teal-500 ring-1 ring-teal-500/50 shadow-lg shadow-teal-500/10'
                  : 'bg-slate-900 border-slate-800 hover:border-teal-500/50'
              }`}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4 gap-3 h-14">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-base leading-tight line-clamp-2 group-hover:text-teal-400 transition-colors">
                    {tontine.nom}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">{tontine.frequence}</p>
                </div>
                <Badge
                  value={tontine.statut}
                  size="sm"
                  className="flex-shrink-0"
                />
              </div>

              {/* Stats */}
              <div className="space-y-2.5 mb-6 bg-slate-800/30 p-3 rounded-lg border border-slate-800/50">
                <div className="flex justify-between text-xs sm:text-sm items-baseline">
                  <span className="text-slate-500 font-medium">Cotisation:</span>
                  <span className="font-bold text-teal-400">{tontine.montant_cotisation?.toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 font-medium">Membres:</span>
                  <span className="text-slate-200 font-semibold">{tontine.membres_actuels || 0}/{tontine.nombre_membres || 0}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 font-medium">Frais:</span>
                  <span className="text-emerald-400 font-bold">{tontine.regles?.frais_sortie_pourcentage || 0}%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-4 border-t border-slate-800/50">
                {canEditTontines && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Edit}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditTontine(tontine);
                    }}
                    className="flex-1 justify-center bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:text-white"
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
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-all"
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
                  name="position"
                  type="number"
                  value={membreForm.position}
                  onChange={(e) => setMembreForm({ ...membreForm, position: e.target.value })}
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
              <>
                {membres
                  .slice((membresPage - 1) * itemsPerPage, membresPage * itemsPerPage)
                  .map((membre) => (
                    <div
                      key={membre.id}
                      className="bg-slate-800 rounded-lg p-3 sm:p-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="w-8 h-8 sm:w-10 sm:h-10 bg-teal-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {membre.position}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-white text-sm truncate">
                              {membre.client?.nom} {membre.client?.prenom}
                            </h4>
                            {membre.est_president && <Badge value="Président" variant="success" size="sm" />}
                            {membre.est_tresorier && <Badge value="Trésorier" variant="info" size="sm" />}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{membre.client?.numero_compte}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-slate-500">Contribué</p>
                          <p className="font-bold text-teal-400 text-sm">{membre.total_cotisations?.toLocaleString() || 0} FCFA</p>
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
                  ))}

                {/* Pagination des membres */}
                {membres.length > itemsPerPage && (
                  <Pagination
                    currentPage={membresPage}
                    totalPages={Math.ceil(membres.length / itemsPerPage)}
                    onPageChange={setMembresPage}
                    canGoNext={membresPage < Math.ceil(membres.length / itemsPerPage)}
                    canGoPrevious={membresPage > 1}
                    itemsPerPage={itemsPerPage}
                    totalItems={membres.length}
                    className="mt-4"
                  />
                )}
              </>
            )}
          </div>
        </Card>
      )}
      </>
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
          {!editMode && tontinePlans.length > 0 && (
            <div className="bg-teal-500/10 p-4 rounded-xl border border-teal-500/20 mb-4">
              <SelectField
                label="Utiliser un modèle (Optionnel)"
                name="plan_selection"
                value=""
                onChange={(e) => applyPlan(e.target.value)}
                options={[
                  { value: '', label: '-- Sélectionner un modèle pour pré-remplir --' },
                  ...tontinePlans.map(p => ({ value: p.id, label: `${p.nom} (${p.montant_cotisation} FCFA)` }))
                ]}
              />
            </div>
          )}

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
              name="montant_cotisation"
              type="number"
              value={formData.montant_cotisation}
              onChange={(e) => setFormData({ ...formData, montant_cotisation: e.target.value })}
              placeholder="10000"
            />
            <FormField
              label="Nombre max de membres"
              name="nombre_membres"
              type="number"
              value={formData.nombre_membres}
              onChange={(e) => setFormData({ ...formData, nombre_membres: e.target.value })}
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
