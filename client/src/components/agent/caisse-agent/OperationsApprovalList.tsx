/**
 * OperationsApprovalList - Liste des opérations en attente d'approbation
 *
 * Vue superviseur pour valider ou rejeter les opérations terrain.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle, XCircle, RefreshCw, Filter, Search,
  ArrowDownRight, ArrowUpRight, User, Calendar, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, Button, Badge, EmptyState, FormField, SelectField } from '../../ui';
import { caisseAgentApi, agentTerrainApi } from '../../../lib/api-client';
import type { OperationTerrainWithRelations } from '@shared/schema';
import OperationDetailModal from './OperationDetailModal';
import RejectOperationModal from './RejectOperationModal';
import { formatClientName } from '../../../lib/format';
import { StatutOperationTerrain, TypeOperationTerrain } from '@shared/enum/status-constants';

interface OperationsApprovalListProps {
  onModuleChange?: (module: string) => void;
}

type FilterType = 'all' | 'COLLECT_CASH' | 'SETTLEMENT_CASH';
type FilterStatut = typeof StatutOperationTerrain.SUBMITTED | typeof StatutOperationTerrain.APPROVED | typeof StatutOperationTerrain.PENDING_SETTLEMENT | typeof StatutOperationTerrain.SETTLED | typeof StatutOperationTerrain.REJECTED | 'all';

const formatMoney = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('fr-FR').format(num || 0);
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const isWithdrawalOp = (op: OperationTerrainWithRelations) => {
  const meta = op.metadata as any;
  const tpc = meta?.typePaiementClient;
  return tpc === TypeOperationTerrain.WITHDRAWAL_CURRENT || tpc === TypeOperationTerrain.WITHDRAWAL_SAVINGS;
};

const getOperationLabel = (op: OperationTerrainWithRelations) => {
  if (op.type === 'SETTLEMENT_CASH') return 'Remise';
  if (isWithdrawalOp(op)) return 'Retrait';
  return 'Collecte';
};

const getStatutBadge = (statut: string) => {
  switch (statut) {
    case StatutOperationTerrain.SUBMITTED:
      return <Badge variant="warning" size="sm" value="En attente" />;
    case StatutOperationTerrain.APPROVED:
      return <Badge variant="success" size="sm" value="Approuvée" />;
    case StatutOperationTerrain.PENDING_SETTLEMENT:
      return <Badge variant="info" size="sm" value="En attente de remise" />;
    case StatutOperationTerrain.SETTLED:
      return <Badge variant="success" size="sm" value="Remise effectuée" />;
    case StatutOperationTerrain.REJECTED:
      return <Badge variant="danger" size="sm" value="Rejetée" />;
    case StatutOperationTerrain.CANCELLED:
      return <Badge variant="neutral" size="sm" value="Annulée" />;
    default:
      return <Badge variant="neutral" size="sm" value={statut} />;
  }
};

export default function OperationsApprovalList({ onModuleChange }: OperationsApprovalListProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operations, setOperations] = useState<OperationTerrainWithRelations[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatut, setFilterStatut] = useState<FilterStatut>(StatutOperationTerrain.SUBMITTED);
  const [filterAgentId, setFilterAgentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [selectedOperation, setSelectedOperation] = useState<OperationTerrainWithRelations | null>(null);
  const [operationToReject, setOperationToReject] = useState<OperationTerrainWithRelations | null>(null);

  // Actions en cours
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      // Charger les agents
      const agentsData = await agentTerrainApi.getAllList();
      setAgents(agentsData || []);

      // Construire les filtres
      const filters: any = {
        limit: 50,
      };

      if (filterStatut !== 'all') {
        filters.statut = filterStatut;
      }

      if (filterType !== 'all') {
        filters.type = filterType;
      }

      if (filterAgentId) {
        filters.agentId = filterAgentId;
      }

      // Charger les opérations
      const response = await caisseAgentApi.listOperations(filters);
      setOperations(response.operations || []);
      setTotalCount(response.total || 0);

    } catch (error: any) {
      console.error('Erreur chargement opérations:', error);
      toast.error('Erreur lors du chargement des opérations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterType, filterStatut, filterAgentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(false);
  };

  const handleApprove = async (operation: OperationTerrainWithRelations) => {
    setProcessingId(operation.id);
    try {
      await caisseAgentApi.approveOperation(operation.id, '');
      toast.success('Opération approuvée', {
        description: 'Les écritures comptables ont été postées.'
      });
      loadData(false);
      setSelectedOperation(null);
    } catch (error: any) {
      toast.error('Erreur lors de l\'approbation', {
        description: error.message
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (operationId: string, reason: string) => {
    setProcessingId(operationId);
    try {
      await caisseAgentApi.rejectOperation(operationId, reason);
      toast.success('Opération rejetée');
      loadData(false);
      setOperationToReject(null);
      setSelectedOperation(null);
    } catch (error: any) {
      toast.error('Erreur lors du rejet', {
        description: error.message
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Filtrer localement par recherche
  const filteredOperations = operations.filter((op) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const clientName = op.client ? formatClientName(op.client.nom, op.client.prenom).toLowerCase() : '';
    const agentName = op.agent ? `${op.agent.nom} ${op.agent.prenom}`.toLowerCase() : '';
    const ref = op.reference?.toLowerCase() || '';
    return clientName.includes(query) || agentName.includes(query) || ref.includes(query);
  });

  const pendingCount = operations.filter(op => op.statut === StatutOperationTerrain.SUBMITTED).length;

  const agentOptions = [
    { value: '', label: 'Tous les agents' },
    ...agents.map((a) => ({
      value: a.id,
      label: formatClientName(a.nom, a.prenom)
    }))
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-accent animate-spin" />
          <p className="text-content-muted text-sm">Chargement des opérations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base text-content-primary font-sans">
      <div className="w-full min-h-screen flex flex-col p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-content-primary">Approbation des opérations</h1>
            <p className="text-sm text-content-muted">
              {pendingCount > 0 ? (
                <span className="text-status-warning">{pendingCount} opération(s) en attente</span>
              ) : (
                'Aucune opération en attente'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={Filter}
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-accent/10 text-accent' : ''}
            >
              Filtres
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={handleRefresh}
              isLoading={refreshing}
            />
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <Card variant="default" padding="md" className="mb-4 animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField
                label="Recherche"
                name="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Client, agent, référence..."
              />

              <SelectField
                label="Statut"
                name="filterStatut"
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as FilterStatut)}
                options={[
                  { value: StatutOperationTerrain.SUBMITTED, label: 'En attente' },
                  { value: StatutOperationTerrain.PENDING_SETTLEMENT, label: 'En attente de remise' },
                  { value: StatutOperationTerrain.SETTLED, label: 'Remise effectuée' },
                  { value: StatutOperationTerrain.APPROVED, label: 'Approuvées' },
                  { value: StatutOperationTerrain.REJECTED, label: 'Rejetées' },
                  { value: 'all', label: 'Tous les statuts' },
                ]}
              />

              <SelectField
                label="Type"
                name="filterType"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterType)}
                options={[
                  { value: 'all', label: 'Tous les types' },
                  { value: 'COLLECT_CASH', label: 'Collectes' },
                  { value: 'SETTLEMENT_CASH', label: 'Remises' },
                ]}
              />

              <SelectField
                label="Agent"
                name="filterAgentId"
                value={filterAgentId}
                onChange={(e) => setFilterAgentId(e.target.value)}
                options={agentOptions}
              />
            </div>
          </Card>
        )}

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card
            variant="default"
            padding="sm"
            className={`cursor-pointer transition-all ${filterStatut === StatutOperationTerrain.SUBMITTED ? 'border-status-warning/50 bg-status-warning/5' : ''}`}
            onClick={() => setFilterStatut(StatutOperationTerrain.SUBMITTED)}
          >
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-status-warning" />
              <span className="text-sm text-content-secondary">En attente</span>
            </div>
            <p className="text-2xl font-bold text-status-warning mt-1">
              {operations.filter(op => op.statut === StatutOperationTerrain.SUBMITTED).length}
            </p>
          </Card>

          <Card
            variant="default"
            padding="sm"
            className={`cursor-pointer transition-all ${filterStatut === StatutOperationTerrain.APPROVED ? 'border-status-success/50 bg-status-success/5' : ''}`}
            onClick={() => setFilterStatut(StatutOperationTerrain.APPROVED)}
          >
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-status-success" />
              <span className="text-sm text-content-secondary">Approuvées</span>
            </div>
            <p className="text-2xl font-bold text-status-success mt-1">
              {operations.filter(op => op.statut === StatutOperationTerrain.APPROVED).length}
            </p>
          </Card>

          <Card
            variant="default"
            padding="sm"
            className={`cursor-pointer transition-all ${filterStatut === StatutOperationTerrain.REJECTED ? 'border-status-danger/50 bg-status-danger/5' : ''}`}
            onClick={() => setFilterStatut(StatutOperationTerrain.REJECTED)}
          >
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-status-danger" />
              <span className="text-sm text-content-secondary">Rejetées</span>
            </div>
            <p className="text-2xl font-bold text-status-danger mt-1">
              {operations.filter(op => op.statut === StatutOperationTerrain.REJECTED).length}
            </p>
          </Card>
        </div>

        {/* Liste des opérations */}
        {filteredOperations.length === 0 ? (
          <EmptyState
            icon={filterStatut === StatutOperationTerrain.SUBMITTED ? CheckCircle : Clock}
            title={filterStatut === StatutOperationTerrain.SUBMITTED ? 'Aucune opération en attente' : 'Aucune opération trouvée'}
            description={
              filterStatut === StatutOperationTerrain.SUBMITTED
                ? 'Toutes les opérations ont été traitées.'
                : 'Modifiez vos filtres pour voir plus de résultats.'
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredOperations.map((op) => (
              <Card
                key={op.id}
                variant="default"
                padding="md"
                className={`transition-all ${
                  op.statut === StatutOperationTerrain.SUBMITTED
                    ? 'border-status-warning/20 hover:border-status-warning/40'
                    : 'hover:border-accent/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      op.type === 'COLLECT_CASH' && !isWithdrawalOp(op)
                        ? 'bg-accent/10 text-accent'
                        : op.type === 'COLLECT_CASH' && isWithdrawalOp(op)
                        ? 'bg-status-danger-bg text-status-danger'
                        : 'bg-status-success-bg text-status-success'
                    }`}>
                      {op.type === 'COLLECT_CASH' && !isWithdrawalOp(op) ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-content-primary">
                          {getOperationLabel(op)}
                        </p>
                        {getStatutBadge(op.statut)}
                      </div>
                      <p className="text-xs text-content-muted">
                        Réf: {op.reference}
                      </p>
                      {op.client && (
                        <p className="text-xs text-content-muted flex items-center gap-1 mt-1">
                          <User size={12} />
                          Client: {formatClientName(op.client.nom, op.client.prenom)}
                        </p>
                      )}
                      {op.agent && (
                        <p className="text-xs text-content-muted flex items-center gap-1">
                          <User size={12} />
                          Agent: {formatClientName(op.agent.nom, op.agent.prenom)}
                        </p>
                      )}
                      <p className="text-xs text-content-muted flex items-center gap-1 mt-1">
                        <Calendar size={12} />
                        {formatDate(op.submittedAt as unknown as string)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      op.type === 'COLLECT_CASH' && !isWithdrawalOp(op) ? 'text-accent' :
                      isWithdrawalOp(op) ? 'text-status-danger' : 'text-status-success'
                    }`}>
                      {op.type === 'COLLECT_CASH' && !isWithdrawalOp(op) ? '+' : '-'}{formatMoney(op.montant as unknown as string)} XOF
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 pt-3 border-t border-edge flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Eye}
                    onClick={() => setSelectedOperation(op)}
                  >
                    Détails
                  </Button>

                  {op.statut === StatutOperationTerrain.SUBMITTED && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={XCircle}
                        onClick={() => setOperationToReject(op)}
                        disabled={processingId === op.id}
                        className="border-status-danger/50 text-status-danger hover:bg-status-danger-bg"
                      >
                        Rejeter
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        icon={CheckCircle}
                        onClick={() => handleApprove(op)}
                        isLoading={processingId === op.id}
                      >
                        Approuver
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedOperation && (
        <OperationDetailModal
          operation={selectedOperation}
          onClose={() => setSelectedOperation(null)}
          onApprove={
            selectedOperation.statut === StatutOperationTerrain.SUBMITTED
              ? () => handleApprove(selectedOperation)
              : undefined
          }
          onReject={
            selectedOperation.statut === StatutOperationTerrain.SUBMITTED
              ? () => {
                  setOperationToReject(selectedOperation);
                  setSelectedOperation(null);
                }
              : undefined
          }
        />
      )}

      {operationToReject && (
        <RejectOperationModal
          operation={operationToReject}
          onClose={() => setOperationToReject(null)}
          onReject={(reason) => handleReject(operationToReject.id, reason)}
          loading={processingId === operationToReject.id}
        />
      )}
    </div>
  );
}
