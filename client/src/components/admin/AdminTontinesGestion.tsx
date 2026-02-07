import React, { useState, useEffect, useCallback } from 'react';
import { Users, Edit, Trash2, Plus, Save, Calendar, UserPlus, AlertTriangle } from 'lucide-react';
import { Card, Button, Badge, FormField, SelectField, Modal, EmptyState, LoadingSpinner, Pagination, ResponsiveTable, TableColumn } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { tontineApi, membreTontineApi, clientApi, tontinePlanApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import AdminTontinePlansGestion from './AdminTontinePlansGestion';
import { StatutClient } from '@shared/enum/status-constants';

interface Tontine {
  id: string;
  nom: string;
  description: string;
  typeDistribution: string;
  montantCotisation: number;
  frequence: string;
  dateDebut: string;
  nombreMembres: number;
  membresActuels: number;
  statut: string;
  regles: any;
}

interface Membre {
  id: string;
  tontineId: string;
  clientId: string;
  position: number;
  estPresident?: boolean;
  estTresorier?: boolean;
  statut: string;
  totalCotisations: number;
  client?: {
    nom: string;
    prenom: string;
    numeroCompte: string;
  };
}

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numeroCompte: string;
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
  const itemsPerPage = 10; // Table view can show more items

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
      const data = await clientApi.getAllList();
      // Filter active clients
      setClients((data || []).filter((c: any) => c.status === StatutClient.ACTIVE || c.statut === StatutClient.ACTIVE));
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
    const formattedDate = tontine.dateDebut
      ? new Date(tontine.dateDebut).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    setFormData({
      nom: tontine.nom || '',
      description: tontine.description || '',
      type_distribution: tontine.typeDistribution || 'Rotative',
      montant_cotisation: tontine.montantCotisation?.toString() || '',
      frequence: tontine.frequence || 'Hebdomadaire',
      date_debut: formattedDate,
      nombre_membres: tontine.nombreMembres?.toString() || '10',
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
        membres_actuels: editMode ? selectedTontine?.membresActuels : 0,
        statut: 'ACTIVE',
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
        statut: StatutClient.ACTIVE,
        date_adhesion: new Date().toISOString().split('T')[0],
        total_cotisations: 0
      };

      await tontineApi.addMembre(selectedTontine.id, membreData);

      await tontineApi.update(selectedTontine.id, {
        membres_actuels: selectedTontine.membresActuels + 1
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
            membres_actuels: Math.max(0, selectedTontine.membresActuels - 1)
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
      montant_cotisation: plan.montantCotisation.toString(),
      frequence: plan.frequence,
      nombre_membres: plan.nombreMembres.toString(),
      frais_pourcentage: plan.tauxPlateforme.toString()
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
            size="sm"
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
          {/* Tontines Table */}
          {(() => {
        const totalPages = Math.ceil(tontines.length / itemsPerPage);
        const paginatedTontines = tontines.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage
        );

        const columns: TableColumn<Tontine>[] = [
           { 
            key: 'nom', 
            label: 'Tontine', 
            primary: true,
            format: (val, item) => (
              <div>
                <div className="font-bold text-white">{val}</div>
                <div className="text-xs text-slate-400">{item.frequence}</div>
              </div>
            )
          },
          { 
            key: 'montantCotisation',
            label: 'Cotisation (FCFA)', 
            format: (val) => <span className="font-bold text-teal-400">{val?.toLocaleString()}</span> 
          },
          { 
            key: 'membresActuels',
            label: 'Membres',
            format: (val, item) => <span className="text-slate-200">{val || 0}/{item.nombreMembres || 0}</span>
          },
          { 
            key: 'regles.frais_sortie_pourcentage', 
            label: 'Frais', 
            format: (val, item) => <span className="text-emerald-400 font-medium">{item.regles?.frais_sortie_pourcentage || 0}%</span>
          },
           { 
            key: 'statut', 
            label: 'Statut', 
            badge: true
          },
        ];

        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
             <ResponsiveTable
              data={paginatedTontines}
              columns={columns}
              density="compact"
              emptyMessage="Aucune tontine trouvée. Créez-en une pour commencer."
              onRowClick={(item) => handleSelectTontine(item)}
              actions={(tontine) => (
                 <div className="flex items-center gap-1">
                  {canEditTontines && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleEditTontine(tontine); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                      title="Modifier"
                    >
                      <Edit size={16} />
                    </button>
                  )}
                  {canDeleteTontines && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteTontine(tontine.id); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
              pagination={{
                page: currentPage,
                totalPages,
                onPageChange: setCurrentPage
              }}
            />
          </div>
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
                      ...clients.map(c => ({ value: c.id, label: `${c.nom} ${c.prenom} - ${c.numeroCompte}` }))
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
                            {membre.estPresident && <Badge value="Président" variant="success" size="sm" />}
                            {membre.estTresorier && <Badge value="Trésorier" variant="info" size="sm" />}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{membre.client?.numeroCompte}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-slate-500">Contribué</p>
                          <p className="font-bold text-teal-400 text-sm">{membre.totalCotisations?.toLocaleString() || 0} FCFA</p>
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
                  ...tontinePlans.map(p => ({ value: p.id, label: `${p.nom} (${p.montantCotisation} FCFA)` }))
                ]}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                { value: 'Journalier', label: 'Journalier' },
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
              helperText={<span className="text-[10px]">Pourcentage retenu par la plateforme sur chaque bénéficiaire.</span>}
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
