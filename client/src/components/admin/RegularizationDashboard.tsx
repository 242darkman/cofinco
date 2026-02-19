import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  LayoutList,
  Lock,
  RefreshCw,
  User,
  XCircle,
  Zap,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Modal,
  ResponsiveTable,
  SearchInput,
  TabGroup,
  EmptyState,
  StatCard,
  SelectField,
  TextareaField,
  Switch,
} from '../ui';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney, formatDate } from '../../lib/format';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';

// Types
interface RegularizationTask {
  id: string;
  source: 'coffre' | 'coffre-caisse';
  type: string;
  typeLabel: string;
  description: string;
  montantEcart: string | null;
  statut: string;
  statutLabel: string;
  priorite: string;
  prioriteLabel: string;
  assignedTo: string | null;
  assignedToName: string | null;
  dateEcheance: string | null;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  transfertId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RegularizationStats {
  summary: {
    totalOpen: number;
    totalResolved: number;
    totalCritical: number;
    totalMontantEcart: number;
  };
  byStatut: Array<{ statut: string; statutLabel: string; count: number; montant: number }>;
  byPriorite: Array<{ priorite: string; prioriteLabel: string; count: number; montant: number }>;
}

interface User {
  id: string;
  nom: string;
  prenom: string;
}

// API functions
const regularisationApi = {
  async list(params: {
    statut?: string;
    type?: string;
    priorite?: string;
    source?: string;
    limit?: number;
    offset?: number;
    assignedToMe?: boolean;
  }) {
    const searchParams = new URLSearchParams();
    if (params.statut) searchParams.set('statut', params.statut);
    if (params.type) searchParams.set('type', params.type);
    if (params.priorite) searchParams.set('priorite', params.priorite);
    if (params.source) searchParams.set('source', params.source);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.offset) searchParams.set('offset', params.offset.toString());
    if (params.assignedToMe) searchParams.set('assignedToMe', 'true');

    const response = await fetch(`/api/admin/regularisations?${searchParams}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Erreur lors du chargement');
    return response.json();
  },

  async getStats() {
    const response = await fetch('/api/admin/regularisations/stats', {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des stats');
    return response.json();
  },

  async getDetails(source: string, id: string) {
    const response = await fetch(`/api/admin/regularisations/${source}/${id}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Erreur lors du chargement des détails');
    return response.json();
  },

  async resolve(source: string, id: string, data: { resolution: string; newStatut?: string }) {
    const response = await fetch(`/api/admin/regularisations/${source}/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erreur lors de la résolution');
    }
    return response.json();
  },

  async assign(source: string, id: string, assignedTo: string) {
    const response = await fetch(`/api/admin/regularisations/${source}/${id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assignedTo }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erreur lors de l\'assignation');
    }
    return response.json();
  },

  async updatePriorite(source: string, id: string, priorite: string) {
    const response = await fetch(`/api/admin/regularisations/${source}/${id}/priorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ priorite }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erreur lors de la mise à jour');
    }
    return response.json();
  },
};

// Helpers
const getPriorityColor = (priorite: string) => {
  switch (priorite) {
    case 'CRITICAL': return 'danger';
    case 'HIGH': return 'warning';
    case 'NORMAL': return 'info';
    case 'LOW': return 'neutral';
    default: return 'neutral';
  }
};

const getStatusColor = (statut: string) => {
  switch (statut) {
    case 'OPEN': return 'danger';
    case 'IN_PROGRESS': return 'warning';
    case 'RESOLVED': return 'success';
    case 'CLOSED': return 'neutral';
    default: return 'neutral';
  }
};

const getStatusIcon = (statut: string) => {
  switch (statut) {
    case 'OPEN': return AlertTriangle;
    case 'IN_PROGRESS': return Clock;
    case 'RESOLVED': return CheckCircle2;
    case 'CLOSED': return XCircle;
    default: return AlertTriangle;
  }
};

export default function RegularizationDashboard() {
  const [tasks, setTasks] = useState<RegularizationTask[]>([]);
  const [stats, setStats] = useState<RegularizationStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [assignedToMe, setAssignedToMe] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modals
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<RegularizationTask | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState(false);

  const { confirmState, closeConfirm, handleConfirm } = useConfirmDialog();
  const { hasPermission } = usePermissions();

  const canView = hasPermission('regularisations', 'view') || hasPermission('admin', 'manage');
  const canResolve = hasPermission('regularisations', 'edit') || hasPermission('admin', 'manage');

  // Load data
  const loadData = useCallback(async (isPolling = false) => {
    if (!canView) {
      if (!isPolling) {
        setLoading(false);
        setTasks([]);
      }
      return;
    }

    if (!isPolling) setLoading(true);

    try {
      const [listRes, statsRes] = await Promise.all([
        regularisationApi.list({
          statut: statusFilter === 'all' ? undefined : statusFilter,
          priorite: priorityFilter === 'all' ? undefined : priorityFilter,
          source: sourceFilter === 'all' ? undefined : sourceFilter,
          limit,
          offset: (page - 1) * limit,
          assignedToMe,
        }),
        regularisationApi.getStats(),
      ]);

      // Filter by search term client-side
      let filteredData = listRes?.data || [];
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        filteredData = filteredData.filter((t: RegularizationTask) =>
          t.description.toLowerCase().includes(term) ||
          t.typeLabel.toLowerCase().includes(term) ||
          t.id.toLowerCase().includes(term)
        );
      }

      setTasks(filteredData);
      setTotalPages(listRes?.pagination?.totalPages || 1);
      setTotal(listRes?.pagination?.total || 0);
      setStats(statsRes);
    } catch (err) {
      if (!isPolling) toast.error(handleApiError(err, 'Erreur lors du chargement des régularisations'));
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [canView, statusFilter, priorityFilter, sourceFilter, page, limit, assignedToMe, searchTerm]);

  useEffect(() => {
    if (canView) loadData();

    // Polling every 30s
    const interval = setInterval(() => {
      if (canView && !document.hidden) {
        loadData(true);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [canView, loadData]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, sourceFilter, assignedToMe, searchTerm]);

  // Actions
  const handleOpenResolve = (task: RegularizationTask) => {
    setSelectedTask(task);
    setResolution('');
    setResolveModalOpen(true);
  };

  const handleResolve = async () => {
    if (!selectedTask) return;
    if (resolution.length < 10) {
      toast.error('La résolution doit contenir au moins 10 caractères');
      return;
    }

    setResolving(true);
    try {
      await regularisationApi.resolve(selectedTask.source, selectedTask.id, {
        resolution,
        newStatut: 'RESOLVED',
      });
      toast.success('Tâche résolue');
      setResolveModalOpen(false);
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la résolution');
    } finally {
      setResolving(false);
    }
  };

  const handleRowClick = (task: RegularizationTask) => {
    setSelectedTask(task);
    setDetailsModalOpen(true);
  };

  // Table columns
  const tableColumns = useMemo(() => [
    {
      key: 'priorite',
      label: 'P',
      align: 'center' as const,
      format: (_: unknown, item: RegularizationTask) => {
        const color = getPriorityColor(item.priorite);
        return (
          <div className="flex justify-center">
            {item.priorite === 'CRITICAL' ? (
              <Zap className="w-5 h-5 text-status-danger animate-pulse" />
            ) : (
              <Badge value={item.priorite[0]} variant={color} size="sm" />
            )}
          </div>
        );
      },
    },
    {
      key: 'description',
      label: 'Description',
      primary: true,
      format: (_: unknown, item: RegularizationTask) => (
        <div className="flex flex-col gap-0.5 cursor-pointer group">
          <span className="text-sm font-medium text-content-primary group-hover:text-status-info transition-colors">
            {item.typeLabel}
          </span>
          <span className="text-xs text-content-muted line-clamp-1">
            {item.description}
          </span>
        </div>
      ),
    },
    {
      key: 'montantEcart',
      label: 'Montant',
      align: 'right' as const,
      format: (val: string | null) =>
        val ? (
          <span className="font-bold text-status-danger">
            {formatMoney(val)}
          </span>
        ) : (
          <span className="text-content-muted">-</span>
        ),
    },
    {
      key: 'source',
      label: 'Source',
      align: 'center' as const,
      format: (val: string) => (
        <Badge
          value={val === 'coffre' ? 'Inter-coffres' : 'Coffre-Caisse'}
          variant={val === 'coffre' ? 'info' : 'neutral'}
          size="sm"
        />
      ),
    },
    {
      key: 'statut',
      label: 'Statut',
      align: 'center' as const,
      format: (_: unknown, item: RegularizationTask) => {
        const Icon = getStatusIcon(item.statut);
        const color = getStatusColor(item.statut);
        return (
          <Badge
            value={item.statutLabel}
            variant={color}
            size="sm"
            icon={<Icon className="w-3 h-3" />}
          />
        );
      },
    },
    {
      key: 'assignedToName',
      label: 'Assigné',
      format: (val: string | null) =>
        val ? (
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-content-muted" />
            <span className="text-sm text-content-secondary">{val}</span>
          </div>
        ) : (
          <span className="text-content-muted text-sm">Non assigné</span>
        ),
    },
    {
      key: 'createdAt',
      label: 'Créé le',
      format: (val: string) => (
        <span className="text-sm text-content-muted">{formatDate(val)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      format: (_: unknown, item: RegularizationTask) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {item.statut !== 'RESOLVED' && item.statut !== 'CLOSED' && canResolve && (
            <Button
              variant="ghost"
              size="sm"
              icon={CheckCircle2}
              onClick={() => handleOpenResolve(item)}
              className="text-status-success hover:bg-status-success-bg"
            >
              Résoudre
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            onClick={() => handleRowClick(item)}
          />
        </div>
      ),
    },
  ], [canResolve]);

  // Permission denied
  if (!canView) {
    return (
      <div className="p-8 flex justify-center">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-content-secondary" />
          <h3 className="mt-2 text-lg font-medium text-content-primary">Accès refusé</h3>
          <p className="text-content-muted">Vous n'avez pas les permissions nécessaires.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-content-primary">
            Tâches de Régularisation
          </h1>
          <p className="text-xs sm:text-sm text-content-muted">
            Suivi et résolution des anomalies financières
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          onClick={() => loadData(false)}
          isLoading={loading}
          className="self-end sm:self-auto"
        >
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            title="Tâches ouvertes"
            value={stats.summary.totalOpen}
            icon={AlertTriangle}
            color="danger"
            variant="glass"
            compact
          />
          <StatCard
            title="Critiques"
            value={stats.summary.totalCritical}
            icon={Zap}
            color="warning"
            variant="glass"
            compact
          />
          <StatCard
            title="Montant écarts"
            value={formatMoney(stats.summary.totalMontantEcart || 0)}
            icon={ArrowUpRight}
            color="primary"
            variant="glass"
            compact
          />
          <StatCard
            title="Résolues"
            value={stats.summary.totalResolved}
            icon={CheckCircle2}
            color="success"
            variant="glass"
            compact
          />
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-surface/50 p-2 sm:p-3 rounded-xl border border-edge backdrop-blur-sm space-y-2 lg:space-y-0 lg:flex lg:justify-between lg:items-center lg:gap-3">
        {/* Status Tabs - scrollable on mobile */}
        <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 shrink-0">
          <TabGroup
            activeTab={statusFilter}
            onTabChange={setStatusFilter}
            tabs={[
              { key: 'all', label: 'Tous', icon: LayoutList },
              { key: 'OPEN', label: 'Ouvertes', badge: stats?.summary.totalOpen },
              { key: 'IN_PROGRESS', label: 'En cours' },
              { key: 'RESOLVED', label: 'Résolues' },
            ]}
            variant="pills"
            size="sm"
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <SearchInput
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher..."
            className="flex-2 min-w-0"
          />

          <SelectField
            label=""
            name="priorityFilter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            placeholder="Priorité"
            options={[
              { value: 'all', label: 'Priorité' },
              { value: 'CRITICAL', label: 'Critique' },
              { value: 'HIGH', label: 'Haute' },
              { value: 'NORMAL', label: 'Normale' },
              { value: 'LOW', label: 'Basse' },
            ]}
            containerClassName="flex-1 min-w-0"
          />

          <SelectField
            label=""
            name="sourceFilter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            placeholder="Source"
            options={[
              { value: 'all', label: 'Source' },
              { value: 'coffre', label: 'Inter-coffres' },
              { value: 'coffre-caisse', label: 'Coffre-Caisse' },
            ]}
            containerClassName="flex-1 min-w-0"
          />

          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <Switch
              checked={assignedToMe}
              onChange={setAssignedToMe}
            />
            <span className="text-xs sm:text-sm text-content-secondary whitespace-nowrap">Mes tâches</span>
          </label>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface-base rounded-xl border border-edge overflow-hidden min-h-[300px] sm:min-h-[350px]">
        {tasks.length > 0 ? (
          <ResponsiveTable
            data={tasks}
            columns={tableColumns}
            loading={loading}
            emptyMessage="Aucun résultat"
            onRowClick={handleRowClick}
            density="compact"
          />
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="Aucune tâche de régularisation"
            description={
              statusFilter === 'OPEN'
                ? 'Toutes les anomalies ont été traitées.'
                : 'Aucune tâche ne correspond aux filtres sélectionnés.'
            }
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 bg-surface/30 rounded-lg">
          <span className="text-xs sm:text-sm text-content-muted order-2 sm:order-1">
            {total} tâche{total > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1 sm:gap-2 order-1 sm:order-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Précédent</span>
              <span className="sm:hidden">←</span>
            </Button>
            <span className="text-xs sm:text-sm text-content-secondary min-w-[60px] sm:min-w-[80px] text-center">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Suivant</span>
              <span className="sm:hidden">→</span>
            </Button>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      <Modal
        isOpen={resolveModalOpen}
        onClose={() => setResolveModalOpen(false)}
        title="Résoudre la tâche"
        size="md"
      >
        {selectedTask && (
          <div className="space-y-3">
            <div className="bg-surface-muted rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <Badge value={selectedTask.typeLabel} variant="info" size="sm" />
                <Badge
                  value={selectedTask.prioriteLabel}
                  variant={getPriorityColor(selectedTask.priorite)}
                  size="sm"
                />
              </div>
              <p className="text-xs sm:text-sm text-content-muted">
                {selectedTask.description}
              </p>
              {selectedTask.montantEcart && (
                <p className="text-xs sm:text-sm font-bold text-status-danger mt-1.5">
                  Montant: {formatMoney(selectedTask.montantEcart)}
                </p>
              )}
            </div>

            <TextareaField
              label="Commentaire de résolution"
              name="resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Décrivez les actions effectuées (min. 10 caractères)..."
              rows={3}
              required
              helperText={resolution.length < 10 ? `${10 - resolution.length} caractères restants` : undefined}
            />

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-edge">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResolveModalOpen(false)}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={handleResolve}
                isLoading={resolving}
                disabled={resolution.length < 10}
              >
                <span className="hidden sm:inline">Marquer comme résolue</span>
                <span className="sm:hidden">Résoudre</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Détails de la tâche"
        size="lg"
      >
        {selectedTask && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <Badge value={selectedTask.typeLabel} variant="info" size="sm" />
                  <Badge
                    value={selectedTask.statutLabel}
                    variant={getStatusColor(selectedTask.statut)}
                    size="sm"
                  />
                  <Badge
                    value={selectedTask.prioriteLabel}
                    variant={getPriorityColor(selectedTask.priorite)}
                    size="sm"
                  />
                </div>
                <p className="text-sm text-content-muted">
                  {selectedTask.description}
                </p>
              </div>
              {selectedTask.montantEcart && (
                <div className="text-left sm:text-right bg-status-danger-bg px-3 py-2 rounded-lg">
                  <span className="text-xs text-content-muted">Montant écart</span>
                  <p className="text-lg font-bold text-status-danger">
                    {formatMoney(selectedTask.montantEcart)}
                  </p>
                </div>
              )}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-surface-muted/50 rounded-lg p-3">
              <div>
                <span className="text-[10px] sm:text-xs text-content-muted uppercase">ID</span>
                <p className="text-xs sm:text-sm font-mono text-content-primary truncate">
                  {selectedTask.id.slice(0, 8)}...
                </p>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs text-content-muted uppercase">Source</span>
                <p className="text-xs sm:text-sm text-content-primary">
                  {selectedTask.source === 'coffre' ? 'Inter-coffres' : 'Coffre-Caisse'}
                </p>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs text-content-muted uppercase">Créé le</span>
                <p className="text-xs sm:text-sm text-content-primary">
                  {formatDate(selectedTask.createdAt)}
                </p>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs text-content-muted uppercase">Échéance</span>
                <p className="text-xs sm:text-sm text-content-primary">
                  {selectedTask.dateEcheance ? formatDate(selectedTask.dateEcheance) : '-'}
                </p>
              </div>
              <div>
                <span className="text-[10px] sm:text-xs text-content-muted uppercase">Assigné à</span>
                <p className="text-xs sm:text-sm text-content-primary">
                  {selectedTask.assignedToName || 'Non assigné'}
                </p>
              </div>
              {selectedTask.transfertId && (
                <div>
                  <span className="text-[10px] sm:text-xs text-content-muted uppercase">Transfert</span>
                  <p className="text-xs sm:text-sm font-mono text-content-primary truncate">
                    {selectedTask.transfertId.slice(0, 8)}...
                  </p>
                </div>
              )}
            </div>

            {/* Resolution */}
            {selectedTask.resolution && (
              <div className="bg-status-success-bg border border-status-success/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                  <span className="text-xs font-medium text-status-success">
                    Résolution
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-status-success">
                  {selectedTask.resolution}
                </p>
                {selectedTask.resolvedAt && (
                  <p className="text-[10px] sm:text-xs text-status-success mt-1.5">
                    Résolu le {formatDate(selectedTask.resolvedAt)}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-edge">
              <Button variant="ghost" size="sm" onClick={() => setDetailsModalOpen(false)}>
                Fermer
              </Button>
              {selectedTask.statut !== 'RESOLVED' &&
                selectedTask.statut !== 'CLOSED' &&
                canResolve && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={CheckCircle2}
                    onClick={() => {
                      setDetailsModalOpen(false);
                      handleOpenResolve(selectedTask);
                    }}
                  >
                    Résoudre
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || 'Confirmer'}
        message={confirmState.message || 'Êtes-vous sûr ?'}
        variant={confirmState.variant || 'warning'}
        confirmText={confirmState.confirmText || 'Confirmer'}
      />
    </div>
  );
}
