import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Plus, Edit2, Trash2, Building2, MapPin, Phone, User, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Map, List, AlertTriangle } from 'lucide-react';
import { Card, Button, Badge, SearchInput, SelectField, FormField, Modal, EmptyState, LoadingSpinner, IconButton, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { agenceApi, villeApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { AgencyMigrationWizard } from '../agences/AgencyMigrationWizard';
import MapViewToggle, { ViewMode } from './shared/MapViewToggle';
import { TypeAgence, TypeAgenceType, StatutAgence, StatutAgenceType } from '@shared/enum/status-constants';

// Lazy load map component
const AdminAgenciesMap = lazy(() => import('./AdminAgenciesMap'));

interface Agence {
  id: string;
  codeAgence: string;
  nom: string;
  typeAgence: TypeAgenceType;
  adresse?: string;
  ville?: string;
  region?: string;
  pays?: string;
  telephone?: string;
  email?: string;
  responsableNom?: string;
  responsablePhone?: string;
  statut: StatutAgenceType;
  dateOuverture?: string;
  nombreEmployes: number;
  nombreClients: number;
  latitude?: number;
  longitude?: number;
  notes?: string;
  createdAt: string;
}

export default function AdminGestionAgences() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateAgences = hasPermission('agences', 'create') || hasPermission('admin', 'manage');
  const canEditAgences = hasPermission('agences', 'edit') || hasPermission('admin', 'manage');
  const canDeleteAgences = hasPermission('agences', 'delete') || hasPermission('admin', 'manage');

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [agences, setAgences] = useState<Agence[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAgence, setEditingAgence] = useState<Agence | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [migrationAgence, setMigrationAgence] = useState<Agence | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [formData, setFormData] = useState({
    codeAgence: '',
    nom: '',
    typeAgence: TypeAgence.SECONDARY as TypeAgenceType,
    adresse: '',
    ville: '',
    villeId: '',
    region: '',
    pays: 'Congo-Brazzaville',
    telephone: '',
    email: '',
    responsableNom: '',
    responsablePhone: '',
    statut: StatutAgence.ACTIVE as StatutAgenceType,
    dateOuverture: new Date().toISOString().split('T')[0],
    nombreEmployes: 0,
    nombreClients: 0,
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    notes: ''
  });

  const [villesList, setVillesList] = useState<{ id: string; nom: string }[]>([]);

  useEffect(() => {
    loadAgences();
    villeApi.getAll({ actif: true }).then(setVillesList).catch(console.error);
  }, []);

  const loadAgences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agenceApi.getAll();
      setAgences(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des agences'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingAgence) {
        await agenceApi.update(editingAgence.id, {
          ...formData,
          updated_at: new Date().toISOString()
        });
        toast.success('Agence mise à jour avec succès');
      } else {
        await agenceApi.create(formData);
        toast.success('Agence créée avec succès');
      }

      setShowForm(false);
      setEditingAgence(null);
      resetForm();
      loadAgences();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'enregistrement'));
    } finally {
      setLoading(false);
    }
  }, [editingAgence, formData, loadAgences]);

  const handleDelete = useCallback((agence: Agence) => {
    // Check if agency has data that requires migration
    if (agence.nombreClients > 0 || agence.nombreEmployes > 0) {
      setMigrationAgence(agence);
      setShowMigration(true);
      return;
    }

    openConfirm({
      title: 'Supprimer cette agence ?',
      message: 'Cette action est irréversible. Êtes-vous sûr de vouloir supprimer cette agence ?',
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        setLoading(true);
        try {
          await agenceApi.delete(agence.id);
          toast.success('Agence supprimée avec succès');
          loadAgences();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        } finally {
          setLoading(false);
        }
      },
    });
  }, [openConfirm, loadAgences]);

  const handleEdit = (agence: Agence) => {
    setEditingAgence(agence);
    setFormData({
      codeAgence: agence.codeAgence,
      nom: agence.nom,
      typeAgence: agence.typeAgence,
      adresse: agence.adresse || '',
      ville: agence.ville || '',
      villeId: (agence as any).villeId || '',
      region: agence.region || '',
      pays: agence.pays || 'Congo-Brazzaville',
      telephone: agence.telephone || '',
      email: agence.email || '',
      responsableNom: agence.responsableNom || '',
      responsablePhone: agence.responsablePhone || '',
      statut: agence.statut,
      dateOuverture: agence.dateOuverture || new Date().toISOString().split('T')[0],
      nombreEmployes: agence.nombreEmployes || 0,
      nombreClients: agence.nombreClients || 0,
      latitude: agence.latitude,
      longitude: agence.longitude,
      notes: agence.notes || ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      codeAgence: '',
      nom: '',
      typeAgence: TypeAgence.SECONDARY as TypeAgenceType,
      adresse: '',
      ville: '',
      villeId: '',
      region: '',
      pays: 'Congo-Brazzaville',
      telephone: '',
      email: '',
      responsableNom: '',
      responsablePhone: '',
      statut: StatutAgence.ACTIVE,
      dateOuverture: new Date().toISOString().split('T')[0],
      nombreEmployes: 0,
      nombreClients: 0,
      latitude: undefined,
      longitude: undefined,
      notes: ''
    });
  };

  const filteredAgences = agences.filter(agence => {
    const matchesSearch = agence.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agence.codeAgence.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (agence.ville?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatut = filterStatut === 'all' || agence.statut === filterStatut;
    const matchesType = filterType === 'all' || agence.typeAgence === filterType;
    return matchesSearch && matchesStatut && matchesType;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredAgences.length / pageSize);
  const paginatedAgences = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgences.slice(start, start + pageSize);
  }, [filteredAgences, currentPage, pageSize]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatut, filterType]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Compact mobile */}
      <FeatureHeader
        featureKey="admin.agencies"
        title={FEATURE_DESCRIPTIONS['admin.agencies'].title}
        subtitle={`${FEATURE_DESCRIPTIONS['admin.agencies'].subtitle} (${agences.length} agences)`}
        helpText={FEATURE_DESCRIPTIONS['admin.agencies'].helpText}
        icon={
          <div className="p-2 sm:p-3 bg-cyan-500/20 rounded-xl">
            <Building2 className="text-cyan-400" size={22} />
          </div>
        }
        actions={
          canCreateAgences ? (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setEditingAgence(null);
                resetForm();
                setShowForm(true);
              }}
              className="w-full sm:w-auto justify-center"
            >
              Nouvelle Agence
            </Button>
          ) : undefined
        }
      />

      {/* Filters - Mobile-first: Stack all on mobile, inline on desktop */}
      <Card className="bg-slate-900 border-slate-800 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* Search - Full width on mobile, flex-1 on desktop */}
          <div className="w-full sm:flex-1">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une agence..."
              className="w-full h-full min-h-[42px]"
            />
          </div>
          {/* Filters row - Side by side on mobile too, but full width */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <SelectField
              label=""
              name="filterStatut"
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              options={[
                { value: 'all', label: 'Tous les statuts' },
                { value: StatutAgence.ACTIVE, label: 'Actif' },
                { value: StatutAgence.INACTIVE, label: 'Suspendu' },
                { value: StatutAgence.CLOSED, label: 'Fermé' }
              ]}
              className="w-full sm:w-44"
            />
            <SelectField
              label=""
              name="filterType"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              options={[
                { value: 'all', label: 'Tous les types' },
                { value: TypeAgence.MAIN, label: 'Principale' },
                { value: TypeAgence.SECONDARY, label: 'Secondaire' },
                { value: TypeAgence.KIOSK, label: 'Kiosque' }
              ]}
              className="w-full sm:w-44"
            />
          </div>
          {/* View Toggle */}
          <MapViewToggle
            viewMode={viewMode}
            onChange={setViewMode}
          />
        </div>

        {/* GPS Warning */}
        {viewMode === 'map' && filteredAgences.some(a => !a.latitude || !a.longitude) && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-300">
              {filteredAgences.filter(a => !a.latitude || !a.longitude).length} agence(s) sans coordonnées GPS ne s'afficheront pas sur la carte.
            </span>
          </div>
        )}
      </Card>

      {/* Agences Grid / Map */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredAgences.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune agence trouvée"
          description="Créez votre première agence ou modifiez vos filtres de recherche."
        />
      ) : viewMode === 'map' ? (
        /* Map View */
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        }>
          <AdminAgenciesMap
            agencies={filteredAgences.map(a => ({
              id: a.id,
              codeAgence: a.codeAgence,
              nom: a.nom,
              typeAgence: a.typeAgence,
              adresse: a.adresse,
              ville: a.ville,
              region: a.region,
              telephone: a.telephone,
              statut: a.statut,
              latitude: a.latitude,
              longitude: a.longitude,
              nombreEmployes: a.nombreEmployes,
              nombreClients: a.nombreClients,
            }))}
            onAgencyClick={(agency) => {
              const agence = agences.find(a => a.id === agency.id);
              if (agence && canEditAgences) {
                handleEdit(agence);
              }
            }}
          />
        </Suspense>
      ) : (
        <>
        {/* Scrollable Grid Container */}
        <div className="overflow-auto max-h-[500px] custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {paginatedAgences.map(agence => (
            <Card
              key={agence.id}
              className="bg-slate-900 border-slate-800 hover:border-cyan-500/50 transition-all p-4 sm:p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge
                      value={agence.statut}
                      size="sm"
                    />
                  </div>
                  <h3 className="font-bold text-white text-sm sm:text-base truncate">{agence.nom}</h3>
                  <p className="text-xs text-cyan-400 font-mono">{agence.codeAgence}</p>
                </div>
                <div className="flex gap-1">
                  {canEditAgences && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(agence)}
                      className="p-2"
                    >
                      <Edit2 size={16} />
                    </Button>
                  )}
                  {canDeleteAgences && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(agence)}
                      className="p-2 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-xs sm:text-sm">
                {agence.ville && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin size={14} className="flex-shrink-0" />
                    <span className="truncate">{agence.ville}{agence.region ? `, ${agence.region}` : ''}</span>
                  </div>
                )}
                {agence.telephone && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Phone size={14} className="flex-shrink-0" />
                    <span>{agence.telephone}</span>
                  </div>
                )}
                {agence.responsableNom && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <User size={14} className="flex-shrink-0" />
                    <span className="truncate">{agence.responsableNom}</span>
                  </div>
                )}
              </div>

              {/* Stats Footer */}
              <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500">Employés</p>
                  <p className="text-sm sm:text-base font-bold text-white">{agence.nombreEmployes || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500">Clients</p>
                  <p className="text-sm sm:text-base font-bold text-white">{agence.nombreClients || 0}</p>
                </div>
              </div>
            </Card>
          ))}
          </div>
        </div>

        {/* Pagination Controls - Mobile First */}
        <div className="p-3 sm:p-4 mt-4 bg-surface-muted/30 border border-edge rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Page info & size selector */}
          <div className="flex items-center gap-3 text-xs sm:text-sm text-content-muted">
            <span className="hidden sm:inline">
              {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredAgences.length)} sur {filteredAgences.length}
            </span>
            <span className="sm:hidden">
              Page {currentPage}/{totalPages || 1}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-surface-base border border-edge rounded text-xs text-content-primary focus:border-primary outline-none"
            >
              <option value={6}>6 / page</option>
              <option value={12}>12 / page</option>
              <option value={24}>24 / page</option>
            </select>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1">
            <IconButton
              icon={ChevronsLeft}
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="w-8 h-8 text-content-muted disabled:opacity-30"
              aria-label="Première page"
            />
            <IconButton
              icon={ChevronLeft}
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 text-content-muted disabled:opacity-30"
              aria-label="Page précédente"
            />
            
            {/* Page numbers */}
            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 3) {
                  pageNum = i + 1;
                } else if (currentPage === 1) {
                  pageNum = i + 1;
                } else if (currentPage === totalPages) {
                  pageNum = totalPages - 2 + i;
                } else {
                  pageNum = currentPage - 1 + i;
                }
                if (pageNum < 1 || pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-primary text-white'
                        : 'text-content-muted hover:bg-surface-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <IconButton
              icon={ChevronRight}
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="w-8 h-8 text-content-muted disabled:opacity-30"
              aria-label="Page suivante"
            />
            <IconButton
              icon={ChevronsRight}
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="w-8 h-8 text-content-muted disabled:opacity-30"
              aria-label="Dernière page"
            />
          </div>
        </div>
      </>
      )}

      {/* Modal Form */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingAgence(null);
          resetForm();
        }}
        title={editingAgence ? "Modifier l'agence" : "Nouvelle agence"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <FormField
              label="Code Agence"
              name="codeAgence"
              required
              value={formData.codeAgence}
              onChange={(e) => setFormData({ ...formData, codeAgence: e.target.value })}
              placeholder="AG-XXX"
            />
            <SelectField
              label="Type d'agence"
              name="typeAgence"
              value={formData.typeAgence}
              onChange={(e) => setFormData({ ...formData, typeAgence: e.target.value as any })}
              options={[
                { value: TypeAgence.MAIN, label: 'Principale' },
                { value: TypeAgence.SECONDARY, label: 'Secondaire' },
                { value: TypeAgence.KIOSK, label: 'Kiosque' }
              ]}
            />
            <div className="sm:col-span-2">
              <FormField
                label="Nom de l'agence"
                name="nom"
                required
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Agence..."
              />
            </div>
            <div className="sm:col-span-2">
              <FormField
                label="Adresse"
                name="adresse"
                value={formData.adresse}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                placeholder="Adresse complète"
              />
            </div>
            <SelectField
              label="Ville"
              name="villeId"
              value={formData.villeId}
              onChange={(e) => {
                const selected = villesList.find(v => v.id === e.target.value);
                setFormData({ ...formData, villeId: e.target.value, ville: selected?.nom || '' });
              }}
              options={[
                { value: '', label: 'Sélectionner une ville...' },
                ...villesList.map(v => ({ value: v.id, label: v.nom })),
              ]}
            />
            <FormField
              label="Région"
              name="region"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              placeholder="Région"
            />
            <FormField
              label="Téléphone"
              name="telephone"
              type="tel"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              placeholder="+242 XXX XXX XXX"
            />
            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@exemple.com"
            />
            <FormField
              label="Responsable"
              name="responsableNom"
              value={formData.responsableNom}
              onChange={(e) => setFormData({ ...formData, responsableNom: e.target.value })}
              placeholder="Nom du responsable"
            />
            <SelectField
              label="Statut"
              name="statut"
              value={formData.statut}
              onChange={(e) => setFormData({ ...formData, statut: e.target.value as any })}
              options={[
                { value: StatutAgence.ACTIVE, label: 'Actif' },
                { value: StatutAgence.INACTIVE, label: 'Suspendu' },
                { value: StatutAgence.CLOSED, label: 'Fermé' }
              ]}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              fullWidth
            >
              {editingAgence ? 'Mettre à jour' : "Créer l'agence"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setEditingAgence(null);
                resetForm();
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
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

      {migrationAgence && (
        <AgencyMigrationWizard
          isOpen={showMigration}
          onClose={() => {
            setShowMigration(false);
            setMigrationAgence(null);
          }}
          sourceAgence={migrationAgence}
          onSuccess={() => {
            loadAgences();
            setShowMigration(false);
            setMigrationAgence(null);
          }}
        />
      )}
    </div>
  );
}
