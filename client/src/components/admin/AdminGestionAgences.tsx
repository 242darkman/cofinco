import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Plus, Edit2, Trash2, Building2, MapPin, Phone, User, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertTriangle, Mail, Calendar, Globe, StickyNote, Users, UserCheck, X, CheckCircle2, Clock, Ban, XCircle, Send, ShieldCheck, Pause, Power, History } from 'lucide-react';
import { Card, Button, Badge, SearchInput, SelectField, FormField, Modal, EmptyState, LoadingSpinner, IconButton, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { usePermissions } from '../auth/ProtectedFeature';
import { agenceApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { AgencyMigrationWizard } from '../agences/AgencyMigrationWizard';
import { AgencyWizard } from './AgencyWizard';
import { CascadingGeoSelect, type GeoSelection } from '../shared/CascadingGeoSelect';
import MapViewToggle, { ViewMode } from './shared/MapViewToggle';
import { TypeAgence, TypeAgenceType, StatutAgence, StatutAgenceType, STATUT_AGENCE_LABELS } from '@shared/enum/status-constants';
import { formatPhoneNumber, formatPhoneInput, stripPhoneFormat } from '../../lib/format';

// Lazy load map component
const AdminAgenciesMap = lazy(() => import('./AdminAgenciesMap'));

// Type labels
const TYPE_AGENCE_LABELS: Record<TypeAgenceType, string> = {
  [TypeAgence.MAIN]: 'Principale',
  [TypeAgence.SECONDARY]: 'Secondaire',
  [TypeAgence.KIOSK]: 'Kiosque',
};

// Status badge styling
const STATUS_BADGE_STYLES: Record<string, string> = {
  [StatutAgence.DRAFT]: 'bg-surface-subtle text-content-muted border-edge',
  [StatutAgence.PENDING_APPROVAL]: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  [StatutAgence.ACTIVE]: 'bg-status-success-bg text-status-success border-status-success/20',
  [StatutAgence.SUSPENDED]: 'bg-status-danger-bg text-status-danger border-status-danger/20',
  [StatutAgence.INACTIVE]: 'bg-surface-subtle text-content-muted border-edge',
  [StatutAgence.CLOSING_PENDING]: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  [StatutAgence.CLOSED]: 'bg-status-danger-bg text-status-danger border-status-danger/20',
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
  paysId?: string;
  telephone?: string;
  email?: string;
  responsableId?: string;
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
  activatedAt?: string;
  suspendedAt?: string;
  suspendedReason?: string;
  createdAt: string;
}

interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  details?: string;
}

interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedByName: string;
  createdAt: string;
}

export default function AdminGestionAgences() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateAgences = hasPermission('agences', 'create') || hasPermission('admin', 'manage');
  const canEditAgences = hasPermission('agences', 'edit') || hasPermission('admin', 'manage');
  const canDeleteAgences = hasPermission('agences', 'delete') || hasPermission('admin', 'manage');
  const canApproveAgences = hasPermission('agences', 'approve') || hasPermission('admin', 'manage');
  const canSuspendAgences = hasPermission('agences', 'suspend') || hasPermission('admin', 'manage');

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [agences, setAgences] = useState<Agence[]>([]);
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
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

  // Detail sheet state
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<{ action: string; title: string } | null>(null);
  const [reasonText, setReasonText] = useState('');

  // Edit form data
  const [editFormData, setEditFormData] = useState({
    nom: '',
    typeAgence: TypeAgence.SECONDARY as TypeAgenceType,
    adresse: '',
    geo: { paysId: '', regionId: '', villeId: '' } as GeoSelection,
    telephone: '',
    email: '',
    responsableNom: '',
    responsablePhone: '',
    notes: ''
  });

  useEffect(() => {
    loadAgences();
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

  // Load checklist + history when viewing an agency
  useEffect(() => {
    if (!viewingAgence) {
      setChecklist(null);
      setStatusHistory([]);
      setShowTimeline(false);
      return;
    }
    agenceApi.getChecklist(viewingAgence.id)
      .then((data: any) => setChecklist(data.items || []))
      .catch(() => setChecklist(null));
    agenceApi.getStatusHistory(viewingAgence.id)
      .then((data: any) => setStatusHistory(data || []))
      .catch(() => setStatusHistory([]));
  }, [viewingAgence?.id]);

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
          toast.success('Agence supprimée');
          loadAgences();
        } catch (error) {
          toast.error(handleApiError(error, "Erreur lors de la suppression de l'agence"));
        } finally {
          setLoading(false);
        }
      },
    });
  }, [openConfirm, loadAgences]);

  const handleEdit = (agence: Agence) => {
    setEditingAgence(agence);
    setEditFormData({
      nom: agence.nom,
      typeAgence: agence.typeAgence,
      adresse: agence.adresse || '',
      geo: {
        paysId: agence.paysId || '',
        regionId: '',
        villeId: agence.villeId || '',
      },
      telephone: agence.telephone || '',
      email: agence.email || '',
      responsableNom: agence.responsableNom || '',
      responsablePhone: agence.responsablePhone || '',
      notes: agence.notes || ''
    });
    setShowEditForm(true);
  };

  const handleEditSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgence) return;
    setLoading(true);
    try {
      await agenceApi.update(editingAgence.id, {
        nom: editFormData.nom,
        typeAgence: editFormData.typeAgence,
        adresse: editFormData.adresse,
        villeId: editFormData.geo.villeId || undefined,
        paysId: editFormData.geo.paysId || undefined,
        telephone: editFormData.telephone,
        email: editFormData.email,
        responsableNom: editFormData.responsableNom,
        responsablePhone: editFormData.responsablePhone,
        notes: editFormData.notes,
        latitude: editFormData.geo.latitude,
        longitude: editFormData.geo.longitude,
      });
      toast.success('Agence mise à jour');
      setShowEditForm(false);
      setEditingAgence(null);
      loadAgences();
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de la mise à jour"));
    } finally {
      setLoading(false);
    }
  }, [editingAgence, editFormData, loadAgences]);

  // Workflow actions
  const handleSubmitForApproval = useCallback(async () => {
    if (!viewingAgence) return;
    setActionLoading(true);
    try {
      await agenceApi.submit(viewingAgence.id);
      toast.success('Agence soumise pour validation');
      loadAgences();
      // Refresh viewing data
      const updated = await agenceApi.getById(viewingAgence.id);
      setViewingAgence(updated);
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors de la soumission');
    } finally {
      setActionLoading(false);
    }
  }, [viewingAgence, loadAgences]);

  const handleActivate = useCallback(async () => {
    if (!viewingAgence) return;
    setActionLoading(true);
    try {
      await agenceApi.activate(viewingAgence.id);
      toast.success('Agence activée avec succès');
      loadAgences();
      const updated = await agenceApi.getById(viewingAgence.id);
      setViewingAgence(updated);
    } catch (error: any) {
      const msg = error?.failedItems
        ? `Checklist incomplète:\n${error.failedItems.map((i: any) => `- ${i.label}: ${i.details}`).join('\n')}`
        : (error?.message || "Erreur lors de l'activation");
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  }, [viewingAgence, loadAgences]);

  const executeReasonAction = useCallback(async () => {
    if (!viewingAgence || !reasonDialog || !reasonText.trim()) return;
    setActionLoading(true);
    try {
      const { action } = reasonDialog;
      if (action === 'reject') {
        await agenceApi.reject(viewingAgence.id, { reason: reasonText.trim() });
        toast.success('Agence renvoyée en brouillon');
      } else if (action === 'suspend') {
        await agenceApi.suspend(viewingAgence.id, { reason: reasonText.trim() });
        toast.success('Agence suspendue');
      } else if (action === 'close') {
        await agenceApi.close(viewingAgence.id, { reason: reasonText.trim() });
        toast.success('Clôture initiée');
      }
      setReasonDialog(null);
      setReasonText('');
      loadAgences();
      const updated = await agenceApi.getById(viewingAgence.id);
      setViewingAgence(updated);
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'action");
    } finally {
      setActionLoading(false);
    }
  }, [viewingAgence, reasonDialog, reasonText, loadAgences]);

  const filteredAgences = useMemo(() => {
    return agences.filter(agence => {
      const matchesSearch = agence.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           agence.codeAgence.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (agence.ville?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      const matchesStatut = filterStatut === 'all' || agence.statut === filterStatut;
      const matchesType = filterType === 'all' || agence.typeAgence === filterType;
      const matchesDeleted = showDeleted ? !!agence.deletedAt : !agence.deletedAt;
      return matchesSearch && matchesStatut && matchesType && matchesDeleted;
    });
  }, [agences, searchQuery, filterStatut, filterType, showDeleted]);

  const activeAgencesCount = useMemo(() => {
    return agences.filter(a => !a.deletedAt).length;
  }, [agences]);

  // Pending approval count for badge
  const pendingCount = useMemo(() => {
    return agences.filter(a => a.statut === StatutAgence.PENDING_APPROVAL && !a.deletedAt).length;
  }, [agences]);

  // Pagination logic
  const totalPages = Math.ceil(filteredAgences.length / pageSize);
  const paginatedAgences = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAgences.slice(start, start + pageSize);
  }, [filteredAgences, currentPage, pageSize]);

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
          <div className="p-2 sm:p-3 bg-accent/10 rounded-xl">
            <Building2 className="text-accent" size={22} />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={() => setFilterStatut(StatutAgence.PENDING_APPROVAL)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-status-warning-bg text-status-warning border border-status-warning/20 hover:bg-status-warning/10 transition-colors"
              >
                <Clock size={14} />
                {pendingCount} en attente
              </button>
            )}
            {canCreateAgences && (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => setShowWizard(true)}
                className="w-full sm:w-auto justify-center"
              >
                Nouvelle Agence
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <Card className="bg-surface-base border-edge p-3 sm:p-4">
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
                { value: StatutAgence.DRAFT, label: 'Brouillon' },
                { value: StatutAgence.PENDING_APPROVAL, label: 'En attente' },
                { value: StatutAgence.ACTIVE, label: 'Actif' },
                { value: StatutAgence.SUSPENDED, label: 'Suspendu' },
                { value: StatutAgence.CLOSING_PENDING, label: 'En fermeture' },
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
            <label className="flex items-center gap-2 text-xs text-content-muted cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="rounded border-edge-strong bg-surface text-status-danger focus:ring-status-danger/30"
              />
              Supprimées
            </label>
            <MapViewToggle
              viewMode={viewMode}
              onChange={setViewMode}
            />
          </div>
        </div>

        {viewMode === 'map' && filteredAgences.some(a => !a.latitude || !a.longitude) && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-status-warning-bg border border-status-warning/30 rounded-lg">
            <AlertTriangle size={16} className="text-status-warning flex-shrink-0" />
            <span className="text-sm text-status-warning">
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
        <div className="overflow-auto max-h-[500px] custom-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {paginatedAgences.map(agence => {
              const deleted = isDeleted(agence);
              return (
              <Card
                key={agence.id}
                className={`bg-surface-base border-edge transition-all p-4 sm:p-5 cursor-pointer ${
                  deleted
                    ? 'opacity-50 border-status-danger/30'
                    : 'hover:border-accent/50'
                }`}
                onClick={() => setViewingAgence(agence)}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border tracking-wide ${STATUS_BADGE_STYLES[agence.statut] || ''}`}>
                        {STATUT_AGENCE_LABELS[agence.statut] || agence.statut}
                      </span>
                      {deleted && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-status-danger-bg text-status-danger border border-status-danger/30">
                          Supprimée
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-content-primary text-sm sm:text-base truncate">{agence.nom}</h3>
                    <p className="text-xs text-accent font-mono">{agence.codeAgence}</p>
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
                      {canDeleteAgences && activeAgencesCount >= 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(agence)}
                          className="p-2 text-status-danger hover:text-status-danger"
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs sm:text-sm">
                  {agence.ville && (
                    <div className="flex items-center gap-2 text-content-muted">
                      <MapPin size={14} className="flex-shrink-0" />
                      <span className="truncate">{agence.ville}{agence.region ? `, ${agence.region}` : ''}</span>
                    </div>
                  )}
                  {agence.telephone && (
                    <div className="flex items-center gap-2 text-content-muted">
                      <Phone size={14} className="flex-shrink-0" />
                      <span>{formatPhoneNumber(agence.telephone)}</span>
                    </div>
                  )}
                  {agence.responsableNom && (
                    <div className="flex items-center gap-2 text-content-muted">
                      <User size={14} className="flex-shrink-0" />
                      <span className="truncate">{agence.responsableNom}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-edge grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] sm:text-xs text-content-muted">Employés</p>
                    <p className="text-sm sm:text-base font-bold text-content-primary">{agence.nombreEmployes || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs text-content-muted">Clients</p>
                    <p className="text-sm sm:text-base font-bold text-content-primary">{agence.nombreClients || 0}</p>
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
            <IconButton icon={ChevronsLeft} variant="ghost" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="w-8 h-8 text-content-muted disabled:opacity-30" aria-label="Première page" />
            <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 text-content-muted disabled:opacity-30" aria-label="Page précédente" />
            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 3) pageNum = i + 1;
                else if (currentPage === 1) pageNum = i + 1;
                else if (currentPage === totalPages) pageNum = totalPages - 2 + i;
                else pageNum = currentPage - 1 + i;
                if (pageNum < 1 || pageNum > totalPages) return null;
                return (
                  <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${currentPage === pageNum ? 'bg-primary text-content-primary' : 'text-content-muted hover:bg-surface-muted'}`}>
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 text-content-muted disabled:opacity-30" aria-label="Page suivante" />
            <IconButton icon={ChevronsRight} variant="ghost" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="w-8 h-8 text-content-muted disabled:opacity-30" aria-label="Dernière page" />
          </div>
        </div>
        )}
      </>
      )}

      {/* Detail Sheet with Workflow */}
      <Sheet open={!!viewingAgence} onOpenChange={(open) => !open && setViewingAgence(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-surface-base border-l-edge p-0">
          <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
            <SheetTitle className="text-content-primary">Détail de l'agence</SheetTitle>
            <SheetDescription className="text-content-muted">
              Informations complètes et workflow
            </SheetDescription>
          </SheetHeader>

          {viewingAgence && (
            <div className="p-6 space-y-6">
              {/* Identity + Status */}
              <div className="bg-surface-base/50 border border-edge rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-content-primary leading-tight">{viewingAgence.nom}</h3>
                    <p className="text-xs text-accent font-mono mt-0.5">{viewingAgence.codeAgence}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-bold border tracking-wide ${STATUS_BADGE_STYLES[viewingAgence.statut] || ''}`}>
                      {STATUT_AGENCE_LABELS[viewingAgence.statut] || viewingAgence.statut}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
                      {TYPE_AGENCE_LABELS[viewingAgence.typeAgence] || viewingAgence.typeAgence}
                    </span>
                  </div>
                </div>
                {viewingAgence.suspendedReason && viewingAgence.statut === StatutAgence.SUSPENDED && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-status-danger-bg border border-status-danger/30 rounded-lg">
                    <Ban size={14} className="text-status-danger mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-status-danger">Raison de la suspension:</span>
                      <p className="text-xs text-status-danger/80 mt-0.5">{viewingAgence.suspendedReason}</p>
                    </div>
                  </div>
                )}
                {isDeleted(viewingAgence) && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-status-danger-bg border border-status-danger/30 rounded-lg">
                    <Trash2 size={14} className="text-status-danger" />
                    <span className="text-xs text-status-danger font-medium">
                      Supprimée le {new Date(viewingAgence.deletedAt!).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )}
              </div>

              {/* Workflow Action Buttons */}
              {!isDeleted(viewingAgence) && (
                <div className="flex flex-wrap gap-2">
                  {viewingAgence.statut === StatutAgence.DRAFT && canEditAgences && (
                    <button
                      onClick={handleSubmitForApproval}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                      <Send size={14} /> Soumettre pour validation
                    </button>
                  )}
                  {viewingAgence.statut === StatutAgence.PENDING_APPROVAL && canApproveAgences && (
                    <>
                      <button
                        onClick={handleActivate}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-btn-success text-white hover:bg-btn-success/90 disabled:opacity-50 transition-colors"
                      >
                        <ShieldCheck size={14} /> Activer
                      </button>
                      <button
                        onClick={() => { setReasonDialog({ action: 'reject', title: 'Rejeter — Renvoyer en brouillon' }); setReasonText(''); }}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-status-warning-bg text-status-warning border border-status-warning/20 hover:bg-status-warning/10 disabled:opacity-50 transition-colors"
                      >
                        <XCircle size={14} /> Renvoyer en brouillon
                      </button>
                    </>
                  )}
                  {viewingAgence.statut === StatutAgence.ACTIVE && canSuspendAgences && (
                    <button
                      onClick={() => { setReasonDialog({ action: 'suspend', title: "Suspendre l'agence" }); setReasonText(''); }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-status-danger-bg text-status-danger border border-status-danger/20 hover:bg-status-danger/10 disabled:opacity-50 transition-colors"
                    >
                      <Pause size={14} /> Suspendre
                    </button>
                  )}
                  {viewingAgence.statut === StatutAgence.SUSPENDED && canApproveAgences && (
                    <button
                      onClick={handleActivate}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-btn-success text-white hover:bg-btn-success/90 disabled:opacity-50 transition-colors"
                    >
                      <Power size={14} /> Réactiver
                    </button>
                  )}
                  {(viewingAgence.statut === StatutAgence.ACTIVE || viewingAgence.statut === StatutAgence.SUSPENDED || viewingAgence.statut === StatutAgence.CLOSING_PENDING) && canDeleteAgences && (
                    <button
                      onClick={() => { setReasonDialog({ action: 'close', title: "Clôturer l'agence" }); setReasonText(''); }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-subtle text-content-muted border border-edge hover:bg-surface-subtle/80 disabled:opacity-50 transition-colors"
                    >
                      <Ban size={14} /> Clôturer
                    </button>
                  )}
                </div>
              )}

              {/* Checklist (visible for DRAFT / PENDING_APPROVAL) */}
              {checklist && (viewingAgence.statut === StatutAgence.DRAFT || viewingAgence.statut === StatutAgence.PENDING_APPROVAL) && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                    <CheckCircle2 size={12} /> Checklist d'activation
                  </h4>
                  <div className="space-y-1.5">
                    {checklist.filter(i => i.required).map((item) => (
                      <div key={item.key} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${item.passed ? 'bg-status-success-bg/30 border-status-success/10' : 'bg-status-danger-bg/30 border-status-danger/10'}`}>
                        {item.passed ? (
                          <CheckCircle2 size={16} className="text-status-success flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={16} className="text-status-danger flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className={`text-xs font-medium ${item.passed ? 'text-status-success' : 'text-status-danger'}`}>
                            {item.label}
                          </div>
                          {!item.passed && item.details && (
                            <div className="text-[10px] text-status-danger/70 mt-0.5">{item.details}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Localisation */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
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
                  <div className="flex items-center gap-2 text-xs text-content-muted">
                    <Globe size={12} />
                    <span className="font-mono">{viewingAgence.latitude}, {viewingAgence.longitude}</span>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                  <Phone size={12} /> Contact
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <DetailCard label="Téléphone" value={formatPhoneNumber(viewingAgence.telephone)} />
                  <DetailCard label="Email" value={viewingAgence.email} />
                  <DetailCard label="Responsable" value={viewingAgence.responsableNom} />
                  <DetailCard label="Tél. responsable" value={formatPhoneNumber(viewingAgence.responsablePhone)} />
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                  <Users size={12} /> Statistiques
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-surface-base rounded-lg border border-edge text-center">
                    <div className="text-2xl font-bold text-content-primary">{viewingAgence.nombreEmployes || 0}</div>
                    <div className="text-[10px] font-medium text-content-muted uppercase mt-0.5">Employés actifs</div>
                  </div>
                  <div className="p-3 bg-surface-base rounded-lg border border-edge text-center">
                    <div className="text-2xl font-bold text-content-primary">{viewingAgence.nombreClients || 0}</div>
                    <div className="text-[10px] font-medium text-content-muted uppercase mt-0.5">Clients actifs</div>
                  </div>
                </div>
              </div>

              {/* Dates & Notes */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
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
                  {viewingAgence.activatedAt && (
                    <DetailCard
                      label="Activée le"
                      value={new Date(viewingAgence.activatedAt).toLocaleDateString('fr-FR')}
                    />
                  )}
                </div>
                {viewingAgence.notes && (
                  <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
                    <div className="text-[10px] font-medium text-content-muted uppercase mb-0.5">Notes</div>
                    <div className="text-sm text-content-secondary leading-relaxed">{viewingAgence.notes}</div>
                  </div>
                )}
              </div>

              {/* Status History Timeline */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="flex items-center gap-2 text-xs font-bold text-content-muted uppercase hover:text-content-secondary transition-colors"
                >
                  <History size={12} />
                  Historique des statuts ({statusHistory.length})
                  <ChevronRight size={12} className={`transition-transform ${showTimeline ? 'rotate-90' : ''}`} />
                </button>
                {showTimeline && statusHistory.length > 0 && (
                  <div className="relative pl-4 border-l-2 border-edge space-y-3">
                    {statusHistory.map((entry) => (
                      <div key={entry.id} className="relative">
                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-accent border-2 border-surface-base" />
                        <div className="text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entry.fromStatus && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE_STYLES[entry.fromStatus] || 'bg-surface-subtle text-content-muted border-edge'}`}>
                                {STATUT_AGENCE_LABELS[entry.fromStatus as StatutAgenceType] || entry.fromStatus}
                              </span>
                            )}
                            <span className="text-content-muted">→</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE_STYLES[entry.toStatus] || 'bg-surface-subtle text-content-muted border-edge'}`}>
                              {STATUT_AGENCE_LABELS[entry.toStatus as StatutAgenceType] || entry.toStatus}
                            </span>
                          </div>
                          <div className="text-content-muted mt-1">
                            <span className="font-medium">{entry.changedByName}</span>
                            {' · '}
                            {new Date(entry.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {entry.reason && (
                            <div className="mt-1 text-content-secondary italic">"{entry.reason}"</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit button */}
              {!isDeleted(viewingAgence) && canEditAgences && (
                <div className="pt-4 border-t border-edge/50">
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

      {/* Agency Wizard (Create) */}
      <AgencyWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={(id) => {
          loadAgences();
          // Open the detail view for the newly created agency
          agenceApi.getById(id).then(setViewingAgence).catch(console.error);
        }}
      />

      {/* Edit Form Modal */}
      <Modal
        isOpen={showEditForm}
        onClose={() => {
          setShowEditForm(false);
          setEditingAgence(null);
        }}
        title="Modifier l'agence"
        size="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <FormField
              label="Code Agence"
              name="codeAgence"
              value={editingAgence?.codeAgence || ''}
              disabled
              placeholder="AG-XXX"
            />
            <SelectField
              label="Type d'agence"
              name="typeAgence"
              value={editFormData.typeAgence}
              onChange={(e) => setEditFormData({ ...editFormData, typeAgence: e.target.value as any })}
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
                value={editFormData.nom}
                onChange={(e) => setEditFormData({ ...editFormData, nom: e.target.value })}
                placeholder="Agence..."
              />
            </div>
          </div>

          <CascadingGeoSelect
            value={editFormData.geo}
            onChange={(geo) => setEditFormData({ ...editFormData, geo })}
          />

          <FormField
            label="Adresse"
            name="adresse"
            value={editFormData.adresse}
            onChange={(e) => setEditFormData({ ...editFormData, adresse: e.target.value })}
            placeholder="Adresse complète"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <FormField
              label="Téléphone"
              name="telephone"
              type="tel"
              value={formatPhoneInput(editFormData.telephone || '')}
              onChange={(e) => setEditFormData({ ...editFormData, telephone: stripPhoneFormat(e.target.value) })}
              placeholder="+242 06 XXX XX XX"
            />
            <FormField
              label="Email"
              name="email"
              type="email"
              value={editFormData.email}
              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
              placeholder="email@exemple.com"
            />
            <FormField
              label="Responsable"
              name="responsableNom"
              value={editFormData.responsableNom}
              onChange={(e) => setEditFormData({ ...editFormData, responsableNom: e.target.value })}
              placeholder="Nom du responsable"
            />
            <FormField
              label="Tél. responsable"
              name="responsablePhone"
              value={editFormData.responsablePhone}
              onChange={(e) => setEditFormData({ ...editFormData, responsablePhone: e.target.value })}
              placeholder="+242 06 XXX XX XX"
            />
          </div>

          <FormField
            label="Notes"
            name="notes"
            value={editFormData.notes}
            onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
            placeholder="Notes ou observations..."
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" variant="primary" isLoading={loading} fullWidth>
              Mettre à jour
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowEditForm(false); setEditingAgence(null); }}>
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reason Dialog (for reject/suspend/close) */}
      <Modal
        isOpen={!!reasonDialog}
        onClose={() => { setReasonDialog(null); setReasonText(''); }}
        title={reasonDialog?.title || ''}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">Veuillez indiquer la raison de cette action :</p>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Raison..."
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-edge bg-input text-content-primary focus:border-input-focus focus:ring-1 focus:ring-input-focus/30 outline-none resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setReasonDialog(null); setReasonText(''); }}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={executeReasonAction}
              disabled={!reasonText.trim() || actionLoading}
              isLoading={actionLoading}
            >
              Confirmer
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
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] font-medium text-content-muted uppercase mb-0.5">{label}</div>
      <div className="text-sm text-content-secondary font-medium break-words">{value || '-'}</div>
    </div>
  );
}
