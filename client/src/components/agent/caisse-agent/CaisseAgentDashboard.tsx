/**
 * CaisseAgentDashboard - Dashboard principal de la caisse agent
 *
 * Affiche le résumé de la caisse (solde, pending in/out, disponible)
 * et les actions rapides pour collecter et remettre du cash.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, ArrowDownRight, ArrowUpRight, Clock, RefreshCw,
  Plus, Send, AlertTriangle, CheckCircle, XCircle, History,
  TrendingUp, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, StatCard, Button, Badge, EmptyState, TabGroup } from '../../ui';
import { caisseAgentApi, agentTerrainApi } from '../../../lib/api-client';
import type { CaisseAgentSummary, OperationTerrainWithRelations } from '@shared/schema';
import CollectCashModal from './CollectCashModal';
import SettlementCashModal from './SettlementCashModal';
import OperationDetailModal from './OperationDetailModal';

interface CaisseAgentDashboardProps {
  agentId: string;
  onModuleChange?: (module: string) => void;
}

type TabKey = 'dashboard' | 'historique' | 'pending';

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

const getStatutBadge = (statut: string) => {
  switch (statut) {
    case 'SUBMITTED':
      return <Badge variant="warning" size="sm" value="En attente" />;
    case 'APPROVED':
      return <Badge variant="success" size="sm" value="Approuvée" />;
    case 'REJECTED':
      return <Badge variant="danger" size="sm" value="Rejetée" />;
    case 'CANCELLED':
      return <Badge variant="neutral" size="sm" value="Annulée" />;
    default:
      return <Badge variant="neutral" size="sm" value={statut} />;
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'COLLECT_CASH':
      return 'Collecte';
    case 'SETTLEMENT_CASH':
      return 'Remise';
    default:
      return type;
  }
};

export default function CaisseAgentDashboard({ agentId, onModuleChange }: CaisseAgentDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [caisseSummary, setCaisseSummary] = useState<CaisseAgentSummary | null>(null);
  const [operations, setOperations] = useState<OperationTerrainWithRelations[]>([]);
  const [pendingOperations, setPendingOperations] = useState<OperationTerrainWithRelations[]>([]);
  const [agentInfo, setAgentInfo] = useState<any>(null);

  // Modals
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<OperationTerrainWithRelations | null>(null);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      // Charger les informations de l'agent
      const agent = await agentTerrainApi.getById(agentId);
      setAgentInfo(agent);

      // Charger le résumé de la caisse
      const summary = await caisseAgentApi.getCaisseSummary(agentId);
      setCaisseSummary(summary);

      // Charger les opérations récentes
      const opsResponse = await caisseAgentApi.getAgentOperations(agentId, { limit: 20 });
      setOperations(opsResponse.data || []);

      // Charger les opérations en attente
      const pendingResponse = await caisseAgentApi.getAgentOperations(agentId, { statut: 'SUBMITTED' });
      setPendingOperations(pendingResponse.data || []);

    } catch (error: any) {
      console.error('Erreur chargement données caisse agent:', error);

      // Si la caisse n'existe pas, proposer de la créer
      if (error.message?.includes('Caisse non trouvée') || error.message?.includes('404')) {
        toast.error('Caisse non initialisée', {
          description: 'Contactez un administrateur pour activer votre caisse agent.'
        });
      } else {
        toast.error('Erreur de chargement');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(false);
  };

  const handleOperationSuccess = () => {
    setShowCollectModal(false);
    setShowSettlementModal(false);
    loadData(false);
    toast.success('Opération soumise avec succès', {
      description: 'En attente de validation par un superviseur.'
    });
  };

  const handleCancelOperation = async (operationId: string) => {
    const reason = prompt('Raison de l\'annulation:');
    if (!reason) return;

    try {
      await caisseAgentApi.cancelOperation(operationId, reason);
      toast.success('Opération annulée');
      loadData(false);
      setSelectedOperation(null);
    } catch (error: any) {
      toast.error('Erreur lors de l\'annulation', {
        description: error.message
      });
    }
  };

  const tabs = [
    { key: 'dashboard' as TabKey, label: 'Dashboard', icon: Wallet },
    { key: 'pending' as TabKey, label: `En attente (${pendingOperations.length})`, icon: Clock },
    { key: 'historique' as TabKey, label: 'Historique', icon: History },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
          <p className="text-slate-400 text-sm">Chargement de votre caisse...</p>
        </div>
      </div>
    );
  }

  const renderDashboard = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Solde Validé"
          value={formatMoney(caisseSummary?.soldeValide || '0')}
          icon={Wallet}
          color="primary"
          subtitle={caisseSummary?.devise || 'XOF'}
          className="col-span-2"
        />
        <StatCard
          title="Collectes en attente"
          value={`+${formatMoney(caisseSummary?.pendingIn || '0')}`}
          icon={ArrowDownRight}
          color="warning"
          subtitle="Non validées"
        />
        <StatCard
          title="Remises en attente"
          value={`-${formatMoney(caisseSummary?.pendingOut || '0')}`}
          icon={ArrowUpRight}
          color="warning"
          subtitle="Non validées"
        />
      </div>

      {/* Disponible pour remise */}
      <Card variant="default" padding="md" className="border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Disponible pour remise</p>
              <p className="text-2xl font-bold text-emerald-400">
                {formatMoney(caisseSummary?.disponible || '0')} {caisseSummary?.devise || 'XOF'}
              </p>
            </div>
          </div>
          <Button
            variant="success"
            size="sm"
            icon={Send}
            onClick={() => setShowSettlementModal(true)}
            disabled={parseFloat(caisseSummary?.disponible || '0') <= 0 || caisseSummary?.statut !== 'Active'}
          >
            Remettre
          </Button>
        </div>
      </Card>

      {/* Quick Actions */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">
          Actions Rapides
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Card
            variant="default"
            padding="sm"
            className={`cursor-pointer transition-all group ${
              caisseSummary?.statut === 'Active'
                ? 'hover:border-cyan-500/50 hover:bg-cyan-500/5'
                : 'opacity-50 cursor-not-allowed'
            }`}
            onClick={() => caisseSummary?.statut === 'Active' && setShowCollectModal(true)}
          >
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">
                Nouvelle Collecte
              </span>
            </div>
          </Card>

          <Card
            variant="default"
            padding="sm"
            className={`cursor-pointer transition-all group ${
              caisseSummary?.statut === 'Active' && parseFloat(caisseSummary?.disponible || '0') > 0
                ? 'hover:border-emerald-500/50 hover:bg-emerald-500/5'
                : 'opacity-50 cursor-not-allowed'
            }`}
            onClick={() => {
              if (caisseSummary?.statut === 'Active' && parseFloat(caisseSummary?.disponible || '0') > 0) {
                setShowSettlementModal(true);
              }
            }}
          >
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                <Send size={24} />
              </div>
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">
                Remettre Cash
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* Caisse Status Alert */}
      {caisseSummary?.statut === 'Suspendue' && (
        <Card variant="default" padding="md" className="border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">Caisse Suspendue</p>
              <p className="text-xs text-slate-400">
                Votre caisse est temporairement suspendue. Contactez votre superviseur.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Recent Operations */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-edge flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Opérations Récentes</h3>
          </div>
          <button
            onClick={() => setActiveTab('historique')}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Voir tout
          </button>
        </div>

        <div className="divide-y divide-edge">
          {operations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-slate-500">Aucune opération</p>
            </div>
          ) : (
            operations.slice(0, 5).map((op) => (
              <div
                key={op.id}
                onClick={() => setSelectedOperation(op)}
                className="p-3 sm:p-4 flex items-center justify-between hover:bg-surface-elevated transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    op.type === 'COLLECT_CASH'
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {op.type === 'COLLECT_CASH' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors line-clamp-1">
                      {getTypeLabel(op.type)}
                      {op.client && ` - ${op.client.nom} ${op.client.prenom}`}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{formatDate(op.submittedAt as unknown as string)}</span>
                      <span>•</span>
                      {getStatutBadge(op.statut)}
                    </div>
                  </div>
                </div>
                <span className={`text-sm font-bold whitespace-nowrap ${
                  op.type === 'COLLECT_CASH' ? 'text-cyan-400' : 'text-emerald-400'
                }`}>
                  {op.type === 'COLLECT_CASH' ? '+' : '-'}{formatMoney(op.montant as unknown as string)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );

  const renderPending = () => (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Opérations en attente</h3>
        <Badge variant="warning" size="md" value={pendingOperations.length} />
      </div>

      {pendingOperations.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="Aucune opération en attente"
          description="Toutes vos opérations ont été traitées."
        />
      ) : (
        <div className="space-y-3">
          {pendingOperations.map((op) => (
            <Card
              key={op.id}
              variant="default"
              padding="md"
              className="hover:border-cyan-500/30 transition-colors cursor-pointer"
              onClick={() => setSelectedOperation(op)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    op.type === 'COLLECT_CASH'
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {op.type === 'COLLECT_CASH' ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {getTypeLabel(op.type)}
                    </p>
                    {op.client && (
                      <p className="text-xs text-slate-400">
                        Client: {op.client.nom} {op.client.prenom}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      Soumise le {formatDate(op.submittedAt as unknown as string)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    op.type === 'COLLECT_CASH' ? 'text-cyan-400' : 'text-emerald-400'
                  }`}>
                    {op.type === 'COLLECT_CASH' ? '+' : '-'}{formatMoney(op.montant as unknown as string)}
                  </p>
                  <Badge variant="warning" size="sm" value="En attente" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-edge flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Eye}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOperation(op);
                  }}
                >
                  Détails
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={XCircle}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelOperation(op.id);
                  }}
                >
                  Annuler
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistorique = () => (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Historique des opérations</h3>
        <Button
          variant="ghost"
          size="sm"
          icon={RefreshCw}
          onClick={handleRefresh}
          isLoading={refreshing}
        >
          Actualiser
        </Button>
      </div>

      {operations.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucun historique"
          description="Vos opérations apparaîtront ici."
        />
      ) : (
        <div className="space-y-2">
          {operations.map((op) => (
            <Card
              key={op.id}
              variant="default"
              padding="sm"
              className="hover:border-cyan-500/20 transition-colors cursor-pointer"
              onClick={() => setSelectedOperation(op)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    op.type === 'COLLECT_CASH'
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {op.type === 'COLLECT_CASH' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {getTypeLabel(op.type)}
                      {op.client && ` - ${op.client.nom}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(op.submittedAt as unknown as string)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getStatutBadge(op.statut)}
                  <span className={`text-sm font-bold ${
                    op.type === 'COLLECT_CASH' ? 'text-cyan-400' : 'text-emerald-400'
                  }`}>
                    {op.type === 'COLLECT_CASH' ? '+' : '-'}{formatMoney(op.montant as unknown as string)}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'pending':
        return renderPending();
      case 'historique':
        return renderHistorique();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans">
      <div className="w-full min-h-screen flex flex-col p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 flex items-center justify-center text-white">
              <Wallet size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white leading-none mb-0.5">Ma Caisse</h1>
                {caisseSummary?.statut === 'Active' ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider border border-red-500/20">
                    {caisseSummary?.statut || 'Inactive'}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Agent: {agentInfo?.nom || ''} {agentInfo?.prenom || ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={handleRefresh}
              isLoading={refreshing}
              className="rounded-full w-9 h-9 p-0"
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#020617]/90 backdrop-blur-xl -mx-4 px-4 py-2 mb-4 border-b border-[#1e293b]/50 sticky top-0 z-20">
          <TabGroup
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as TabKey)}
            tabs={tabs}
            variant="pills"
            size="sm"
            scrollable
            className="pb-1"
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 pb-16">
          {renderContent()}
        </div>
      </div>

      {/* Modals */}
      {showCollectModal && caisseSummary && (
        <CollectCashModal
          agentId={agentId}
          caisseAgentId={caisseSummary.caisseId}
          onClose={() => setShowCollectModal(false)}
          onSuccess={handleOperationSuccess}
        />
      )}

      {showSettlementModal && caisseSummary && (
        <SettlementCashModal
          agentId={agentId}
          caisseAgentId={caisseSummary.caisseId}
          maxAmount={parseFloat(caisseSummary.disponible || '0')}
          onClose={() => setShowSettlementModal(false)}
          onSuccess={handleOperationSuccess}
        />
      )}

      {selectedOperation && (
        <OperationDetailModal
          operation={selectedOperation}
          onClose={() => setSelectedOperation(null)}
          onCancel={
            selectedOperation.statut === 'SUBMITTED'
              ? () => handleCancelOperation(selectedOperation.id)
              : undefined
          }
        />
      )}
    </div>
  );
}
