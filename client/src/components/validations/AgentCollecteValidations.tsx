import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  MapPin,
  RefreshCw,
  Calendar,
  Search,
  CreditCard,
  AlertCircle,
  Building2,
  Hash,
  ChevronDown,
  ChevronUp,
  Users,
  Wallet,
  CheckCheck,
  Loader2
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { caisseAgentApi, agencesApi, type Agence } from '@/lib/api-client';
import FormField from '@/components/ui/FormField';
import { useToast } from '../../hooks/use-toast';
import { useIsOnline } from '@/contexts/NetworkContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import SecureValidationModal from '../agent/SecureValidationModal';
import { StatutOperationTerrain } from '@shared/enum/status-constants';
import type { OperationTerrainWithRelations, OperationTerrainMetadata } from '@shared/schema';
import { resolveStorageUrl } from '@/lib/format';

// Helper: Format money
const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('fr-FR').format(amount);
};

// Agent Avatar Component with error handling
const AgentAvatar = ({ photoUrl, nom, prenom }: { photoUrl?: string | null; nom: string; prenom?: string }) => {
  const [hasError, setHasError] = React.useState(false);
  const resolvedUrl = photoUrl ? resolveStorageUrl(photoUrl) : null;
  const initials = `${nom.charAt(0)}${prenom?.charAt(0) || ''}`;

  if (!resolvedUrl || hasError) {
    return (
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-status-success to-accent flex items-center justify-center text-white font-bold text-sm sm:text-base shrink-0">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={`${nom} ${prenom || ''}`}
      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0 border-2 border-status-success"
      onError={() => setHasError(true)}
    />
  );
};

// Modal Component
const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4">
      <div className={`bg-surface rounded-xl shadow-2xl w-full max-h-[95vh] overflow-hidden flex flex-col ${size === 'lg' ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="p-3 sm:p-4 border-b border-edge flex justify-between items-center bg-surface-muted/50">
          <h3 className="font-semibold text-base sm:text-lg text-content-primary">{title}</h3>
          <button onClick={onClose} className="text-content-muted hover:text-content-secondary p-1">
            <XCircle size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {children}
        </div>
        {footer && (
          <div className="p-3 sm:p-4 border-t border-edge bg-surface-muted/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// Type for grouped operations
interface AgentGroup {
  agentId: string;
  agentName: string;
  agentPrenom: string;
  agentAvatar?: string | null;
  operations: OperationTerrainWithRelations[];
  totalAmount: number;
}

// Agent Group Card Component
function AgentGroupCard({
  group,
  isExpanded,
  onToggleExpand,
  onApproveAll,
  onApproveOne,
  onRejectOne,
  onViewDetails,
  isProcessing,
  processingAgentId,
}: {
  group: AgentGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApproveAll: (agentId: string, operationIds: string[]) => void;
  onApproveOne: (op: OperationTerrainWithRelations) => void;
  onRejectOne: (id: string) => void;
  onViewDetails: (op: OperationTerrainWithRelations) => void;
  isProcessing: boolean;
  processingAgentId: string | null;
}) {
  const isThisProcessing = isProcessing && processingAgentId === group.agentId;
  const operationIds = group.operations.map(op => op.id);

  return (
    <div className="bg-surface rounded-xl border border-edge overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Agent Header - Always visible */}
      <div
        className="p-3 sm:p-4 cursor-pointer hover:bg-surface-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Agent Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <AgentAvatar
              photoUrl={group.agentAvatar}
              nom={group.agentName}
              prenom={group.agentPrenom}
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-content-primary text-sm sm:text-base truncate">
                {group.agentName} {group.agentPrenom}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
                <span className="flex items-center gap-1">
                  <Wallet size={12} />
                  {formatMoney(group.totalAmount)} FCFA
                </span>
                <span className="flex items-center gap-1">
                  <CreditCard size={12} />
                  {group.operations.length} opération{group.operations.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="success"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onApproveAll(group.agentId, operationIds);
              }}
              disabled={isProcessing}
              className="text-xs sm:text-sm whitespace-nowrap"
            >
              {isThisProcessing ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <CheckCheck size={14} className="mr-1" />
              )}
              Tout valider
            </Button>

            <button
              className="p-2 rounded-lg hover:bg-surface-muted transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {isExpanded ? (
                <ChevronUp size={20} className="text-content-muted" />
              ) : (
                <ChevronDown size={20} className="text-content-muted" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Operations List - Expandable */}
      {isExpanded && (
        <div className="border-t border-edge">
          <div className="divide-y divide-edge-subtle">
            {group.operations.map((op) => (
              <div
                key={op.id}
                className="p-3 sm:p-4 hover:bg-surface-muted/30 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Operation Info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onViewDetails(op)}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-accent font-medium">
                        {op.reference}
                      </span>
                      <Badge
                        value={op.type === 'COLLECT_CASH' ? 'Collecte' : 'Remise'}
                        className="text-[10px]"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {format(new Date(op.submittedAt), 'dd/MM/yy HH:mm')}
                      </span>
                      {op.client && (
                        <span className="flex items-center gap-1 truncate">
                          <User size={11} />
                          {op.client.nom} {op.client.prenom}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="font-bold text-content-primary text-sm sm:text-base">
                      {formatMoney(parseFloat(op.montant))}
                      <span className="text-[10px] font-normal text-content-muted ml-1">FCFA</span>
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onApproveOne(op);
                        }}
                        disabled={isProcessing}
                        className="p-2 rounded-lg text-status-success hover:bg-status-success-bg transition-colors disabled:opacity-50"
                        title="Valider"
                      >
                        <CheckCircle size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRejectOne(op.id);
                        }}
                        disabled={isProcessing}
                        className="p-2 rounded-lg text-status-danger hover:bg-status-danger-bg transition-colors disabled:opacity-50"
                        title="Rejeter"
                      >
                        <XCircle size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentCollecteValidations() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useUserProfile();

  // State
  const [operations, setOperations] = useState<OperationTerrainWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agences, setAgences] = useState<Agence[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgenceId, setSelectedAgenceId] = useState<string>('all');

  // Expanded agents
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Processing
  const [processing, setProcessing] = useState(false);
  const [processingAgentId, setProcessingAgentId] = useState<string | null>(null);

  // Modals
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<OperationTerrainWithRelations | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectOperationId, setRejectOperationId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Secure Validation Modal
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<string[]>([]);
  const [pendingApprovalOp, setPendingApprovalOp] = useState<OperationTerrainWithRelations | null>(null);
  const [pendingApprovalAgentId, setPendingApprovalAgentId] = useState<string | null>(null);

  // Check role for Agency Filter
  const normalizedRole = normalizeRole(user?.role);
  const isAdmin = normalizedRole === SystemRole.ADMIN || normalizedRole === SystemRole.SUPERVISEUR;

  useEffect(() => {
    loadData(false);

    const handleOperationEvent = (event: CustomEvent) => {
      const { type } = event.detail || {};
      if (type && [
        'OPERATION_TERRAIN_CREATED',
        'OPERATION_TERRAIN_APPROVED',
        'OPERATION_TERRAIN_REJECTED',
        'OPERATION_TERRAIN_SETTLED',
        'BULK_APPROVE'
      ].includes(type)) {
        loadData(true);
      }
    };

    window.addEventListener('operation-update', handleOperationEvent as EventListener);
    return () => window.removeEventListener('operation-update', handleOperationEvent as EventListener);
  }, []);

  // Auto-refresh when back online
  const isOnline = useIsOnline();
  useEffect(() => {
    if (isOnline) {
      loadData(true);
    }
  }, [isOnline]);

  const loadData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const opsPromise = caisseAgentApi.listOperations({ statut: StatutOperationTerrain.SUBMITTED });
      const agencesPromise = isAdmin ? agencesApi.getAgences() : Promise.resolve([]);

      const [opsResponse, agencesResponse] = await Promise.all([opsPromise, agencesPromise]);

      const opsData = opsResponse.operations || [];
      setOperations(opsData);

      if (Array.isArray(agencesResponse)) {
        setAgences(agencesResponse);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      if (!isBackgroundRefresh) {
        toast({
          title: t('erreur'),
          description: "Impossible de charger les données.",
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Filter and group operations by agent
  const groupedOperations = useMemo(() => {
    const filtered = operations.filter(op => {
      const matchesSearch =
        op.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        op.agent?.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        op.client?.nom?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    });

    // Group by agent
    const groups = new Map<string, AgentGroup>();

    filtered.forEach(op => {
      const agentId = op.agentId || 'unknown';
      const existing = groups.get(agentId);

      if (existing) {
        existing.operations.push(op);
        existing.totalAmount += parseFloat(op.montant);
      } else {
        groups.set(agentId, {
          agentId,
          agentName: op.agent?.nom || 'Inconnu',
          agentPrenom: op.agent?.prenom || '',
          agentAvatar: (op.agent as any)?.photoProfile || null,
          operations: [op],
          totalAmount: parseFloat(op.montant),
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [operations, searchTerm]);

  const totalPending = operations.length;
  const totalAmount = operations.reduce((sum, op) => sum + parseFloat(op.montant), 0);

  const toggleAgentExpand = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  // Bulk approve for one agent
  const handleApproveAllForAgent = async (agentId: string, operationIds: string[]) => {
    setPendingApprovalIds(operationIds);
    setPendingApprovalAgentId(agentId);
    setPendingApprovalOp(null);
    setSecureModalOpen(true);
  };

  // Single operation approval
  const handleApproveOne = (op: OperationTerrainWithRelations) => {
    setPendingApprovalIds([op.id]);
    setPendingApprovalOp(op);
    setPendingApprovalAgentId(op.agentId);
    setSecureModalOpen(true);
  };

  // Confirm approval after password verification
  const handleSecureApprovalConfirm = async (password: string) => {
    if (pendingApprovalIds.length === 0) throw new Error('No pending operations');

    setProcessing(true);
    setProcessingAgentId(pendingApprovalAgentId);

    try {
      if (pendingApprovalIds.length === 1) {
        await caisseAgentApi.approveOperation(pendingApprovalIds[0], password);
        toast({
          title: t('succes'),
          description: 'Opération validée avec succès.',
        });
      } else {
        const result = await caisseAgentApi.bulkApproveOperations(pendingApprovalIds, password);
        if (result.success) {
          toast({
            title: t('succes'),
            description: `${pendingApprovalIds.length} opérations validées avec succès.`,
          });
        } else {
          const failures = result.results?.filter((r: any) => !r.success).length || 0;
          toast({
            title: t('attention'),
            description: `${pendingApprovalIds.length - failures} validées, ${failures} échecs.`,
            variant: failures > 0 ? 'destructive' : 'default',
          });
        }
      }

      setSecureModalOpen(false);
      setDetailModalOpen(false);
      setPendingApprovalIds([]);
      setPendingApprovalOp(null);
      setPendingApprovalAgentId(null);
      loadData(true);

      window.dispatchEvent(new CustomEvent('operation-update', {
        detail: { type: 'BULK_APPROVE', count: pendingApprovalIds.length }
      }));
    } finally {
      setProcessing(false);
      setProcessingAgentId(null);
    }
  };

  // Reject modal
  const openRejectModal = (id: string) => {
    setRejectOperationId(id);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectOperationId || !rejectReason || rejectReason.length < 5) {
      toast({
        title: "Motif requis",
        description: "Veuillez indiquer un motif de rejet (min. 5 caractères).",
        variant: "destructive"
      });
      return;
    }

    setProcessing(true);
    try {
      await caisseAgentApi.rejectOperation(rejectOperationId, rejectReason);
      toast({
        title: t('succes'),
        description: "Opération rejetée.",
      });
      setRejectModalOpen(false);
      setDetailModalOpen(false);
      loadData(true);

      window.dispatchEvent(new CustomEvent('operation-update', {
        detail: { type: 'OPERATION_TERRAIN_REJECTED', id: rejectOperationId }
      }));
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || "Erreur lors du rejet.",
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleViewDetails = (op: OperationTerrainWithRelations) => {
    setSelectedOperation(op);
    setDetailModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-3 sm:p-4 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/30">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-accent/10 rounded-lg">
              <Clock size={18} className="text-accent" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-content-muted uppercase font-semibold">En attente</p>
              <p className="text-lg sm:text-2xl font-bold text-accent">{totalPending}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3 sm:p-4 bg-gradient-to-br from-status-success/10 to-status-success/5 border-status-success/30">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-status-success-bg rounded-lg">
              <Wallet size={18} className="text-status-success" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-content-muted uppercase font-semibold">Montant total</p>
              <p className="text-base sm:text-xl font-bold text-status-success">
                {formatMoney(totalAmount)}
                <span className="text-[10px] font-normal ml-1">FCFA</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3 sm:p-4 bg-gradient-to-br from-status-info/10 to-status-info/5 border-status-info/30">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-status-info-bg rounded-lg">
              <Users size={18} className="text-status-info" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-content-muted uppercase font-semibold">Agents</p>
              <p className="text-lg sm:text-2xl font-bold text-status-info">{groupedOperations.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3 sm:p-4 bg-gradient-to-br from-status-warning/10 to-status-warning/5 border-status-warning/30 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-status-warning-bg rounded-lg">
              <CreditCard size={18} className="text-status-warning" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-content-muted uppercase font-semibold">Moy. / Opération</p>
              <p className="text-base sm:text-xl font-bold text-status-warning">
                {formatMoney(totalPending > 0 ? totalAmount / totalPending : 0)}
                <span className="text-[10px] font-normal ml-1">FCFA</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {isAdmin && agences.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" size={16} />
            <select
              value={selectedAgenceId}
              onChange={(e) => setSelectedAgenceId(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-sm bg-surface border border-edge rounded-lg focus:ring-2 focus:ring-primary/50 outline-none appearance-none"
            >
              <option value="all">Toutes les agences</option>
              {agences.map(a => (
                <option key={a.id} value={a.id}>{a.nom}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" size={16} />
          <input
            type="text"
            placeholder="Rechercher par référence, agent ou client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-9 pr-4 text-sm bg-surface border border-edge rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-accent animate-spin" />
        </div>
      ) : groupedOperations.length === 0 ? (
        <Card className="py-16 sm:py-20 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-surface-muted/50 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <CheckCircle className="text-status-success w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-content-primary mb-2">Tout est en ordre !</h3>
          <p className="text-sm text-content-muted">
            Aucune opération en attente de validation.
          </p>
        </Card>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {groupedOperations.map((group) => (
            <AgentGroupCard
              key={group.agentId}
              group={group}
              isExpanded={expandedAgents.has(group.agentId)}
              onToggleExpand={() => toggleAgentExpand(group.agentId)}
              onApproveAll={handleApproveAllForAgent}
              onApproveOne={handleApproveOne}
              onRejectOne={openRejectModal}
              onViewDetails={handleViewDetails}
              isProcessing={processing}
              processingAgentId={processingAgentId}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Détails de l'opération"
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button variant="ghost" onClick={() => setDetailModalOpen(false)} className="w-full sm:w-auto">
              Fermer
            </Button>
            {selectedOperation && (
              <>
                <Button
                  variant="danger"
                  onClick={() => {
                    setDetailModalOpen(false);
                    openRejectModal(selectedOperation.id);
                  }}
                  disabled={processing}
                  className="w-full sm:w-auto"
                >
                  Rejeter
                </Button>
                <Button
                  variant="success"
                  onClick={() => handleApproveOne(selectedOperation)}
                  disabled={processing}
                  className="w-full sm:w-auto"
                >
                  Confirmer Réception
                </Button>
              </>
            )}
          </div>
        }
      >
        {selectedOperation && (
          <div className="space-y-4 sm:space-y-6">
            {/* Amount Hero */}
            <div className="bg-surface-muted/50 p-4 sm:p-6 rounded-xl border border-edge-subtle text-center">
              <span className="text-content-muted text-xs sm:text-sm font-medium">Montant</span>
              <div className="text-2xl sm:text-4xl font-bold text-status-success mt-1">
                {formatMoney(parseFloat(selectedOperation.montant))}
                <span className="text-sm sm:text-xl text-status-success/60 ml-1">FCFA</span>
              </div>
              <Badge value={selectedOperation.statut} className="mt-3" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* Client Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-content-primary border-b pb-2 flex items-center gap-2 text-sm">
                  <User size={16} className="text-primary" />
                  Client
                </h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="text-[10px] text-content-muted uppercase font-semibold">Nom</label>
                    <p className="font-medium text-content-primary">
                      {selectedOperation.client ? `${selectedOperation.client.nom} ${selectedOperation.client.prenom}` : 'Non spécifié'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-content-primary border-b pb-2 flex items-center gap-2 text-sm">
                  <CreditCard size={16} className="text-primary" />
                  Transaction
                </h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <label className="text-[10px] text-content-muted uppercase font-semibold">Référence</label>
                    <p className="flex items-center gap-2 font-mono text-xs">
                      <Hash size={12} />
                      {selectedOperation.reference}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] text-content-muted uppercase font-semibold">Date</label>
                    <p className="text-xs">
                      {format(new Date(selectedOperation.submittedAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                    </p>
                  </div>
                  {(selectedOperation.metadata as OperationTerrainMetadata)?.latitude && (
                    <div>
                      <label className="text-[10px] text-content-muted uppercase font-semibold">GPS</label>
                      <a
                        href={`https://www.google.com/maps?q=${(selectedOperation.metadata as OperationTerrainMetadata).latitude},${(selectedOperation.metadata as OperationTerrainMetadata).longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline text-xs"
                      >
                        <MapPin size={12} /> Voir localisation
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Rejeter l'opération"
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejectModalOpen(false)} className="w-full sm:w-auto">
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={handleRejectConfirm}
              isLoading={processing}
              className="w-full sm:w-auto"
            >
              Confirmer Rejet
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-status-danger-bg border border-status-danger/30 text-status-danger p-3 sm:p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div className="text-xs sm:text-sm">
              <p className="font-bold">Action irréversible</p>
              <p>L'opération ne pourra plus être validée.</p>
            </div>
          </div>

          <FormField
            label="Motif du rejet"
            name="rejectReason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ex: Montant incorrect, Client absent..."
            autoFocus
            required
          />
        </div>
      </Modal>

      {/* Secure Validation Modal */}
      <SecureValidationModal
        isOpen={secureModalOpen}
        onClose={() => {
          setSecureModalOpen(false);
          setPendingApprovalIds([]);
          setPendingApprovalOp(null);
          setPendingApprovalAgentId(null);
        }}
        onConfirm={handleSecureApprovalConfirm}
        title={pendingApprovalIds.length > 1
          ? `Valider ${pendingApprovalIds.length} opérations`
          : "Confirmer Réception"
        }
        description={pendingApprovalIds.length > 1
          ? `Vous allez valider ${pendingApprovalIds.length} opérations pour cet agent. Entrez votre mot de passe pour confirmer.`
          : "Entrez votre mot de passe pour valider la réception physique des espèces."
        }
        operationDetails={pendingApprovalOp ? {
          agentName: `${pendingApprovalOp.agent?.nom || ''} ${pendingApprovalOp.agent?.prenom || ''}`.trim() || 'Agent',
          amount: parseFloat(pendingApprovalOp.montant),
          reference: pendingApprovalOp.reference
        } : pendingApprovalIds.length > 1 ? {
          agentName: groupedOperations.find(g => g.agentId === pendingApprovalAgentId)?.agentName || 'Agent',
          amount: groupedOperations.find(g => g.agentId === pendingApprovalAgentId)?.totalAmount || 0,
          reference: `${pendingApprovalIds.length} opérations`
        } : undefined}
      />
    </div>
  );
}
