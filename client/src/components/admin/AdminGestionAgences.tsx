import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Plus, Edit2, Trash2, Building2, MapPin, Phone, User, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertTriangle, Mail, Calendar, Globe, StickyNote, Users, UserCheck, X } from 'lucide-react';
import { Card, Button, Badge, SearchInput, SelectField, FormField, Modal, EmptyState, LoadingSpinner, IconButton, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { usePermissions } from '../auth/ProtectedFeature';
import { agenceApi, villeApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { AgencyMigrationWizard } from '../agences/AgencyMigrationWizard';
import MapViewToggle, { ViewMode } from './shared/MapViewToggle';
import { TypeAgence, TypeAgenceType, StatutAgence, StatutAgenceType, STATUT_AGENCE_LABELS } from '@shared/enum/status-constants';

// Lazy load map component
const AdminAgenciesMap = lazy(() => import('./AdminAgenciesMap'));

// Type labels
const TYPE_AGENCE_LABELS: Record<TypeAgenceType, string> = {
  [TypeAgence.MAIN]: 'Principale',
  [TypeAgence.SECONDARY]: 'Secondaire',
  [TypeAgence.KIOSK]: 'Kiosque',
};

interface Agence {
  id: string;
  codeAgence: string;
  nom: string;
  typeAgence: TypeAgenceType;
  adresse?: string;
  ville?: string;
  villeId?: string;
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
  deletedAt?: string | null;
  createdAt: string;
}

interface VilleItem {
  id: string;
  nom: string;
  departementNom?: string;
  latitude?: string | number;
  longitude?: string | number;
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
  const [viewingAgence, setViewingAgence] = useState<Agence | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [migrationAgence, setMigrationAgence] = useState<Agence | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [formData, setFormData] = useState({
    codeAgence: '',
    nom: '',
    typeAgence: TypeAgence.SECONDARY as TypeAgenceType,
    adresse: '',
    villeId: '',
    region: '',
    pays: 'Congo-Brazzaville',
    telephone: '',
    email: '',
    responsableNom: '',
    responsablePhone: '',
    statut: StatutAgence.ACTIVE as StatutAgenceType,
    dateOuverture: new Date().toISOString().split('T')[0],
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    notes: ''
  });

  const [villesList, setVillesList] = useState<VilleItem[]>([]);

  useEffect(() => {
    loadAgences();
    villeApi.getAll({ actif: true }).then(setVillesList).catch(console.error);
  }, []);

  const loadAgences = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (showDeleted) params.includeDeleted = 'true';
      const data = await agenceApi.getAll(params);
      setAgences(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des agences'));
    } finally {
      setLoading(false);
    }
  }, [showDeleted]);

  // Reload when showDeleted changes
  useEffect(() => { loadAgences(); }, [loadAgences]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingAgence) {
        await agenceApi.update(editingAgence.id, formData);
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
      villeId: agence.villeId || '',
      region: agence.region || '',
      pays: agence.pays || 'Congo-Brazzaville',
      telephone: agence.telephone || '',
      email: agence.email || '',
      responsableNom: agence.responsableNom || '',
      responsablePhone: agence.responsablePhone || '',
      statut: agence.statut,
      dateOuverture: agence.dateOuverture || new Date().toISOString().split('T')[0],
      latitude: agence.latitude,
      longitude: agence.longitude,
      notes: agence.notes || ''
    });
    setShowForm(true);
  };

  const handleVilleChange = (villeId: string) => {
    const selected = villesList.find(v => v.id === villeId);
    if (selected) {
      setFormData(prev => ({
        ...prev,
        villeId,
        region: selected.departementNom || prev.region,
        latitude: selected.latitude ? Number(selected.latitude) : prev.latitude,
        longitude: selected.longitude ? Number(selected.longitude) : prev.longitude,
      }));
    } else {
      setFormData(prev => ({ ...prev, villeId }));
    }
  };

  const resetForm = () => {
    setFormData({
      codeAgence: '',
      nom: '',
      typeAgence: TypeAgence.SECONDARY as TypeAgenceType,
      adresse: '',
      villeId: '',
      region: '',
      pays: 'Congo-Brazzaville',
      telephone: '',
      email: '',
      responsableNom: '',
      responsablePhone: '',
      statut: StatutAgence.ACTIVE,
      dateOuverture: new Date().toISOString().split('T')[0],
      latitude: undefined,
      longitude: undefined,
      notes: ''
    });
  };

  const filteredAgences = useMemo(() => {
    return agences.filter(agence => {
      const matchesSearch = agence.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           agence.codeAgence.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (agence.ville?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      const matchesStatut = filterStatut === 'all' || agence.statut === filterStatut;
      const matchesType = filterType === 'all' || agence.typeAgence === filterType;
      // If showDeleted is on, show only deleted; otherwise exclude deleted
      const matchesDeleted = showDeleted ? !!agence.deletedAt : !agence.deletedAt;
      return matchesSearch && matchesStatut && matchesType && matchesDeleted;
    });
  }, [agences, searchQuery, filterStatut, filterType, showDeleted]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAgences.length / pageSize);
  const paginatedAgences = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgences.slice(start, start + pageSize);
  }, [filteredAgences, currentPage, pageSize]);

  // Memoize agencies for map to avoid re-creating array every render
  const mapAgencies = useMemo(() => {
    return filteredAgences.map(a => ({
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
    }));
  }, [filteredAgences]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatut, filterType, showDeleted]);

  const isDeleted = (agence: Agence) => !!agence.deletedAt;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <FeatureHeader
        featureKey="admin.agencies"
        title={FEATURE_DESCRIPTIONS['admin.agencies'].title}
        subtitle={`${FEATURE_DESCRIPTIONS['admin.agencies'].subtitle} (${agences.filter(a => !a.deletedAt).length} agences)`}
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

      {/* Filters */}
      <Card className="bg-slate-900 border-slate-800 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="w-full sm:flex-1">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une agence..."
              className="w-full h-full min-h-[42px]"
            />
          </div>
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
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500/30"
              />
              Supprimées
            </label>
            <MapViewToggle
              viewMode={viewMode}
              onChange={setViewMode}
            />
          </div>
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
          description={showDeleted ? "Aucune agence supprimée." : "Créez votre première agence ou modifiez vos filtres de recherche."}
        />
      ) : viewMode === 'map' ? (
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        }>
          <AdminAgenciesMap agencies={mapAgencies} />
        </Suspense>
      ) : (
        <>
        {/* Scrollable Grid Container */}
        <div className="overflow-auto max-h-[500px] custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {paginatedAgences.map(agence => {
              const deleted = isDeleted(agence);
              return (
              <Card
                key={agence.id}
                className={`bg-slate-900 border-slate-800 transition-all p-4 sm:p-5 cursor-pointer ${
                  deleted
                    ? 'opacity-50 border-red-500/30'
                    : 'hover:border-cyan-500/50'
                }`}
                onClick={() => setViewingAgence(agence)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        value={agence.statut}
                        size="sm"
                      />
                      {deleted && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                          Supprimée
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-white text-sm sm:text-base truncate">{agence.nom}</h3>
                    <p className="text-xs text-cyan-400 font-mono">{agence.codeAgence}</p>
                  </div>
                  {!deleted && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
                  )}
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
            );})}
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
        <div className="p-3 sm:p-4 mt-4 bg-surface-muted/30 border border-edge rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-content-muted">
            <span className="hidden sm:inline">
              {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredAgences.length)} sur {filteredAgences.length}
            </span>
            <span className="sm:hidden">
              Page {currentPage}/{totalPages}
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
              disabled={currentPage === totalPages}
              className="w-8 h-8 text-content-muted disabled:opacity-30"
              aria-label="Page suivante"
            />
            <IconButton
              icon={ChevronsRight}
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="w-8 h-8 text-content-muted disabled:opacity-30"
              aria-label="Dernière page"
            />
          </div>
        </div>
        )}
      </>
      )}

      {/* Read-only Detail Sheet */}
      <Sheet open={!!viewingAgence} onOpenChange={(open) => !open && setViewingAgence(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-slate-950 border-l-slate-800 p-0">
          <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
            <SheetTitle className="text-white">Détail de l'agence</SheetTitle>
            <SheetDescription className="text-slate-400">
              Informations complètes
            </SheetDescription>
          </SheetHeader>

          {viewingAgence && (
            <div className="p-6 space-y-6">
              {/* Identity */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">{viewingAgence.nom}</h3>
                    <p className="text-xs text-cyan-400 font-mono mt-0.5">{viewingAgence.codeAgence}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-bold border tracking-wide ${
                      viewingAgence.statut === StatutAgence.ACTIVE
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : viewingAgence.statut === StatutAgence.CLOSED
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {STATUT_AGENCE_LABELS[viewingAgence.statut] || viewingAgence.statut}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {TYPE_AGENCE_LABELS[viewingAgence.typeAgence] || viewingAgence.typeAgence}
                    </span>
                  </div>
                </div>
                {isDeleted(viewingAgence) && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <Trash2 size={14} className="text-red-400" />
                    <span className="text-xs text-red-300 font-medium">
                      Supprimée le {new Date(viewingAgence.deletedAt!).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )}
              </div>

              {/* Localisation */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <MapPin size={12} /> Localisation
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <DetailCard label="Ville" value={viewingAgence.ville} />
                  <DetailCard label="Région" value={viewingAgence.region} />
                  <DetailCard label="Pays" value={viewingAgence.pays} />
                  {viewingAgence.adresse && (
                    <div className="col-span-2">
                      <DetailCard label="Adresse" value={viewingAgence.adresse} />
                    </div>
                  )}
                </div>
                {(viewingAgence.latitude || viewingAgence.longitude) && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Globe size={12} />
                    <span className="font-mono">{viewingAgence.latitude}, {viewingAgence.longitude}</span>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Phone size={12} /> Contact
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <DetailCard label="Téléphone" value={viewingAgence.telephone} />
                  <DetailCard label="Email" value={viewingAgence.email} />
                  <DetailCard label="Responsable" value={viewingAgence.responsableNom} />
                  <DetailCard label="Tél. responsable" value={viewingAgence.responsablePhone} />
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Users size={12} /> Statistiques
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                    <div className="text-2xl font-bold text-white">{viewingAgence.nombreEmployes || 0}</div>
                    <div className="text-[10px] font-medium text-slate-500 uppercase mt-0.5">Employés actifs</div>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-center">
                    <div className="text-2xl font-bold text-white">{viewingAgence.nombreClients || 0}</div>
                    <div className="text-[10px] font-medium text-slate-500 uppercase mt-0.5">Clients actifs</div>
                  </div>
                </div>
              </div>

              {/* Dates & Notes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Calendar size={12} /> Informations
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <DetailCard
                    label="Date d'ouverture"
                    value={viewingAgence.dateOuverture ? new Date(viewingAgence.dateOuverture).toLocaleDateString('fr-FR') : undefined}
                  />
                  <DetailCard
                    label="Créée le"
                    value={viewingAgence.createdAt ? new Date(viewingAgence.createdAt).toLocaleDateString('fr-FR') : undefined}
                  />
                </div>
                {viewingAgence.notes && (
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-[10px] font-medium text-slate-500 uppercase mb-0.5">Notes</div>
                    <div className="text-sm text-slate-200 leading-relaxed">{viewingAgence.notes}</div>
                  </div>
                )}
              </div>

              {/* Actions */}
              {!isDeleted(viewingAgence) && canEditAgences && (
                <div className="pt-4 border-t border-slate-800/50">
                  <Button
                    variant="primary"
                    icon={Edit2}
                    fullWidth
                    onClick={() => {
                      handleEdit(viewingAgence);
                      setViewingAgence(null);
                    }}
                  >
                    Modifier cette agence
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

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
              onChange={(e) => handleVilleChange(e.target.value)}
              options={[
                { value: '', label: 'Sélectionner une ville...' },
                ...villesList.map(v => ({ value: v.id, label: v.nom })),
              ]}
            />
            <FormField
              label="Région / Département"
              name="region"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              placeholder="Auto-rempli par la ville"
              disabled={!!formData.villeId}
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

          {/* GPS info when ville is selected */}
          {formData.villeId && (formData.latitude || formData.longitude) && (
            <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300">
              <Globe size={14} />
              <span>Coordonnées GPS: {formData.latitude}, {formData.longitude} (depuis la ville)</span>
            </div>
          )}

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

function DetailCard({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
      <div className="text-[10px] font-medium text-slate-500 uppercase mb-0.5">{label}</div>
      <div className="text-sm text-slate-200 font-medium break-words">{value || '-'}</div>
    </div>
  );
}
