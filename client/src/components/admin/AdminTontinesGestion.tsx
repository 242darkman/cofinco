import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Edit, Trash2, Plus, UserPlus, AlertTriangle, Play, Pause, CheckCircle, Ban, RotateCcw, Search, Filter } from 'lucide-react';
import { Card, Button, Badge, Pagination, ResponsiveTable, TableColumn } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { tontineApi, clientApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import AdminTontinePlansGestion from './AdminTontinePlansGestion';
import { TontineGroupWizard } from './TontineGroupWizard';
import { StatutClient, STATUT_TONTINE_LABELS } from '@shared/enum/status-constants';
import { TontineStatus } from '@shared/schema/tontines';
import type { Tontine, TontinePlan } from '@shared/schema/tontines';

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
  const [showWizard, setShowWizard] = useState(false);
  const [editTontine, setEditTontine] = useState<Tontine | null>(null);
  const [preSelectedPlanId, setPreSelectedPlanId] = useState<string | undefined>();
  const [showMembreForm, setShowMembreForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [membresPage, setMembresPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'groupes' | 'plans'>('groupes');
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [lifecycleLoading, setLifecycleLoading] = useState<string | null>(null);
  const itemsPerPage = 10;

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

  useEffect(() => {
    chargerTontines();
    chargerClients();
  }, [chargerTontines, chargerClients]);

  const handleSelectTontine = (tontine: Tontine) => {
    setSelectedTontine(tontine);
    setMembresPage(1);
    chargerMembres(tontine.id);
    setShowMembreForm(false);
  };

  const handleEditTontine = (tontine: Tontine) => {
    setEditTontine(tontine);
    setShowWizard(true);
  };

  const handleWizardSave = async (data: Partial<Tontine> & { members?: Array<{ clientId: string; groupRole: string }>; payoutOrder?: string[] }) => {
    if (editTontine) {
      await tontineApi.update(editTontine.id, data);
    } else {
      await tontineApi.create(data);
    }
    await chargerTontines();
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setEditTontine(null);
    setPreSelectedPlanId(null);
  };

  const handleDeleteTontine = useCallback((tontineId: string) => {
    openConfirm({
      title: 'Supprimer cette tontine ?',
      message: 'Cette action est irréversible. Êtes-vous sûr de vouloir supprimer cette tontine ?',
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await tontineApi.delete(tontineId);
          toast.success('Tontine supprimée');
          await chargerTontines();
          setSelectedTontine(null);
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression de la tontine'));
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

      toast.success('Membre ajouté');
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

          toast.success('Membre retiré');
          await chargerMembres(selectedTontine.id);
          await chargerTontines();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression du membre'));
        }
      },
    });
  }, [selectedTontine, openConfirm, chargerMembres, chargerTontines]);

  // Lifecycle actions
  const lifecycleActions: Record<string, { label: string; icon: React.ElementType; method: 'activate' | 'pause' | 'resume' | 'complete' | 'cancel'; variant: 'info' | 'warning' | 'danger'; allowedFrom: string[] }> = {
    activate: { label: 'Activer', icon: Play, method: 'activate', variant: 'info', allowedFrom: [TontineStatus.DRAFT] },
    pause: { label: 'Suspendre', icon: Pause, method: 'pause', variant: 'warning', allowedFrom: [TontineStatus.ACTIVE] },
    resume: { label: 'Reprendre', icon: RotateCcw, method: 'resume', variant: 'info', allowedFrom: [TontineStatus.PAUSED] },
    complete: { label: 'Terminer', icon: CheckCircle, method: 'complete', variant: 'warning', allowedFrom: [TontineStatus.ACTIVE, TontineStatus.PAUSED] },
    cancel: { label: 'Annuler', icon: Ban, method: 'cancel', variant: 'danger', allowedFrom: [TontineStatus.DRAFT, TontineStatus.ACTIVE, TontineStatus.PAUSED] },
  };

  const handleLifecycleAction = useCallback((tontine: Tontine, actionKey: string) => {
    const action = lifecycleActions[actionKey];
    if (!action) return;

    openConfirm({
      title: `${action.label} la tontine ?`,
      message: `Êtes-vous sûr de vouloir ${action.label.toLowerCase()} la tontine "${tontine.nom}" ?`,
      variant: action.variant,
      confirmText: action.label,
      onConfirm: async () => {
        setLifecycleLoading(tontine.id);
        try {
          await tontineApi[action.method](tontine.id);
          toast.success(`Tontine ${action.label.toLowerCase()}e avec succès`);
          await chargerTontines();
        } catch (error) {
          toast.error(handleApiError(error, `Erreur lors de l'action "${action.label}"`));
        } finally {
          setLifecycleLoading(null);
        }
      },
    });
  }, [openConfirm, chargerTontines]);

  // Filtered tontines
  const filteredTontines = useMemo(() => {
    let result = tontines;
    if (statusFilter) {
      result = result.filter((t) => t.statut === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => t.nom?.toLowerCase().includes(q));
    }
    return result;
  }, [tontines, statusFilter, searchQuery]);

  const handleLaunchFromPlan = (plan: TontinePlan) => {
    setActiveTab('groupes');
    setEditTontine(null);
    setPreSelectedPlanId(plan.id);
    setShowWizard(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Compact mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-accent/10 rounded-xl">
            <Users className="text-accent" size={22} />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-content-primary">Gestion des Tontines</h2>
            <p className="text-xs sm:text-sm text-content-muted">Gérer les groupes d'épargne rotative</p>
          </div>
        </div>
{canCreateTontines ? (
          <Button
            variant="primary"
            icon={Plus}
            size="sm"
            onClick={() => {
              if (activeTab === 'groupes') {
                setEditTontine(null);
                setShowWizard(true);
              } else {
                setShowPlanForm(true);
              }
            }}
            className="w-full sm:w-auto justify-center"
          >
            {activeTab === 'groupes' ? 'Nouvelle Tontine' : 'Nouveau Modèle'}
          </Button>
        ) : (
          <div className="px-4 py-2 bg-status-warning-bg text-status-warning rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            Permission requise
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-edge mb-6">
        <button
          onClick={() => setActiveTab('groupes')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'groupes' 
            ? 'text-accent border-accent' 
            : 'text-content-muted border-transparent hover:text-content-secondary'
          }`}
        >
          Groupes de Tontine
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'plans' 
            ? 'text-accent border-accent' 
            : 'text-content-muted border-transparent hover:text-content-secondary'
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
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Rechercher par nom..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-3 py-2 bg-input border border-input-border rounded-lg text-sm text-content-primary placeholder:text-content-muted focus:border-input-focus focus:outline-none"
              />
            </div>
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="pl-9 pr-8 py-2 bg-input border border-input-border rounded-lg text-sm text-content-primary focus:border-input-focus focus:outline-none appearance-none cursor-pointer"
              >
                <option value="">Tous les statuts</option>
                {Object.entries(STATUT_TONTINE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tontines Table */}
          {(() => {
        const totalPages = Math.ceil(filteredTontines.length / itemsPerPage);
        const paginatedTontines = filteredTontines.slice(
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
                <div className="font-bold text-content-primary">{val}</div>
                <div className="text-xs text-content-muted">{item.frequence}</div>
              </div>
            )
          },
          { 
            key: 'montantCotisation',
            label: 'Cotisation (FCFA)', 
            format: (val) => <span className="font-bold text-accent">{val?.toLocaleString()}</span> 
          },
          { 
            key: 'membresActuels',
            label: 'Membres',
            format: (val, item) => <span className="text-content-secondary">{val || 0}/{item.nombreMembres || 0}</span>
          },
          {
            key: 'tauxPlateforme',
            label: 'Frais',
            format: (val) => <span className="text-status-success font-medium">{val || 0}%</span>
          },
          {
            key: 'dateDebut',
            label: 'Début',
            format: (val) => val ? new Date(val).toLocaleDateString('fr-FR') : <span className="text-content-muted">—</span>,
          },
           {
            key: 'statut',
            label: 'Statut',
            format: (val) => {
              const variantMap: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
                DRAFT: 'neutral', ACTIVE: 'success', PAUSED: 'warning', COMPLETED: 'info', CANCELLED: 'danger',
              };
              return <Badge value={STATUT_TONTINE_LABELS[val] || val} variant={variantMap[val] || 'neutral'} size="sm" />;
            },
          },
        ];

        return (
          <div className="bg-surface-base border border-edge rounded-xl overflow-hidden">
             <ResponsiveTable
              data={paginatedTontines}
              columns={columns}
              density="compact"
              emptyMessage={searchQuery || statusFilter ? "Aucune tontine ne correspond aux filtres." : "Aucune tontine trouvée. Créez-en une pour commencer."}
              onRowClick={(item) => handleSelectTontine(item)}
              actions={(tontine) => (
                 <div className="flex items-center gap-0.5">
                  {/* Lifecycle buttons */}
                  {canEditTontines && Object.entries(lifecycleActions).map(([key, action]) => {
                    if (!action.allowedFrom.includes(tontine.statut)) return null;
                    const Icon = action.icon;
                    const isLoading = lifecycleLoading === tontine.id;
                    return (
                      <button
                        key={key}
                        onClick={(e) => { e.stopPropagation(); handleLifecycleAction(tontine, key); }}
                        disabled={isLoading}
                        className={`p-1.5 rounded-lg text-content-muted transition-colors ${
                          action.variant === 'danger'
                            ? 'hover:text-status-danger hover:bg-status-danger-bg'
                            : action.variant === 'warning'
                            ? 'hover:text-status-warning hover:bg-status-warning-bg'
                            : 'hover:text-status-info hover:bg-status-info-bg'
                        } disabled:opacity-50`}
                        title={action.label}
                      >
                        <Icon size={15} />
                      </button>
                    );
                  })}
                  {/* Edit */}
                  {canEditTontines && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditTontine(tontine); }}
                      className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-elevated transition-colors"
                      title="Modifier"
                    >
                      <Edit size={16} />
                    </button>
                  )}
                  {/* Delete (only DRAFT) */}
                  {canDeleteTontines && tontine.statut === TontineStatus.DRAFT && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTontine(tontine.id); }}
                      className="p-1.5 rounded-lg text-content-muted hover:text-status-danger hover:bg-status-danger-bg transition-colors"
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
        <Card className="bg-surface-base border-edge p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-content-primary text-sm sm:text-lg">
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
            <Card className="bg-surface border-edge p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-content-secondary mb-1">Sélectionner un client</label>
                  <select
                    value={membreForm.client_id}
                    onChange={(e) => setMembreForm({ ...membreForm, client_id: e.target.value })}
                    className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm text-content-primary focus:border-input-focus focus:outline-none"
                  >
                    <option value="">-- Choisir un client --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.nom} {c.prenom} - {c.numeroCompte}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1">Position dans l'ordre</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={membreForm.position}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMembreForm({ ...membreForm, position: v }); }}
                    placeholder="1"
                    className="w-full px-3 py-2 bg-input border border-input-border rounded-lg text-sm text-content-primary focus:border-input-focus focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-content-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={membreForm.est_president}
                      onChange={(e) => setMembreForm({ ...membreForm, est_president: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-xs sm:text-sm">Président</span>
                  </label>
                  <label className="flex items-center gap-2 text-content-secondary cursor-pointer">
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
              <div className="text-center py-6 text-content-muted text-sm">
                Aucun membre dans cette tontine
              </div>
            ) : (
              <>
                {membres
                  .slice((membresPage - 1) * itemsPerPage, membresPage * itemsPerPage)
                  .map((membre) => (
                    <div
                      key={membre.id}
                      className="bg-surface rounded-lg p-3 sm:p-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="w-8 h-8 sm:w-10 sm:h-10 bg-accent text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {membre.position}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-content-primary text-sm truncate">
                              {membre.client?.nom} {membre.client?.prenom}
                            </h4>
                            {membre.estPresident && <Badge value="Président" variant="success" size="sm" />}
                            {membre.estTresorier && <Badge value="Trésorier" variant="info" size="sm" />}
                          </div>
                          <p className="text-xs text-content-muted truncate">{membre.client?.numeroCompte}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-content-muted">Contribué</p>
                          <p className="font-bold text-accent text-sm">{membre.totalCotisations?.toLocaleString() || 0} FCFA</p>
                        </div>
                        {canManageMembres && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMembre(membre.id)}
                            className="p-2 text-status-danger hover:text-status-danger"
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

      {/* Tontine Group Wizard */}
      <TontineGroupWizard
        isOpen={showWizard}
        onClose={handleWizardClose}
        onSave={handleWizardSave}
        editTontine={editTontine ?? undefined}
        preSelectedPlanId={preSelectedPlanId ?? undefined}
      />

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
