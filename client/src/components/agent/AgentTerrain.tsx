import React, { useState, useEffect } from 'react';
import { DollarSign, ArrowRightCircle, Clock, CheckCircle, User, Wifi, WifiOff, History, RefreshCw, UserPlus, Shield } from 'lucide-react';
import { agentTerrainApi, requestAllPages, caisseAgentApi } from '../../lib/api-client';
import { authService } from '../../lib/auth';
import AgentTerrainPaiement from './AgentTerrainPaiement';
import SettlementModal from './SettlementModal';
import ProspectionFormModal from './ProspectionFormModal';
import AgentSelector from './AgentSelector';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { StatutUser, StatutOperationTerrain } from '@shared/enum/status-constants';

interface Agent {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  zone_affectation: string;
  statut: string;
  photo_url?: string;
}

interface Transaction {
  id: string;
  type: string;
  montant: number;
  clientNom?: string;
  date: string;
  statut: string;
}

interface AgentTerrainProps {
  activeView?: string;
}

export default function AgentTerrain({ activeView }: AgentTerrainProps) {
  const [loading, setLoading] = useState(true);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentSummary, setAgentSummary] = useState<{ disponible: number; valide: number } | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);

  // Auth & Role
  const currentUser = authService.getCurrentUser();
  const isAdmin = authService.isAdmin();
  
  // Target agent: admin uses selected agent, normal agent uses themselves
  const targetAgentId = isAdmin ? selectedAgentId : currentAgent?.id;
  
  // Modals
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showProspectionForm, setShowProspectionForm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>();

  // Offline queue
  const { isOnline, pendingCount, queue } = useOfflineQueue();

  useEffect(() => {
    loadAgents();
  }, []);

  // Reload data when target agent changes
  useEffect(() => {
    if (targetAgentId) {
      loadAgentData(targetAgentId);
    }
  }, [targetAgentId]);

  const loadAgents = async () => {
    try {
      const agents = await agentTerrainApi.getAllList();
      setAllAgents(agents);
      
      // For non-admin, set current agent automatically
      if (!isAdmin) {
        const activeAgent = agents.find((a: Agent) => a.statut === StatutUser.ACTIVE) || agents[0];
        setCurrentAgent(activeAgent);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const loadAgentData = async (agentId: string) => {
    setLoading(true);
    try {
      // Find agent in list
      const agent = allAgents.find(a => a.id === agentId);
      if (agent) {
        setCurrentAgent(agent);
      }

      // Load agent balance summary
      const summary = await caisseAgentApi.getCaisseSummary(agentId);
      setAgentSummary({
        disponible: parseFloat(summary.disponible || '0'),
        valide: parseFloat(summary.soldeValide || '0')
      });

      // Load recent transactions (last 5)
      const ops = await caisseAgentApi.listOperations({ agentId, limit: 5 });
      const opsData = Array.isArray(ops) ? ops : ops.data || [];
      setRecentTransactions(opsData.slice(0, 5).map((op: any) => ({
        id: op.id,
        type: op.type === 'COLLECT_CASH' ? 'Collecte' : 'Remise',
        montant: parseFloat(op.montant),
        clientNom: op.client?.nom || 'N/A',
        date: op.submittedAt || op.createdAt,
        statut: op.statut
      })));
    } catch (error) {
      console.error('Error loading agent data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadData = () => {
    if (targetAgentId) {
      loadAgentData(targetAgentId);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaiementForm(false);
    loadData();
  };

  const handleSettlementSuccess = () => {
    setShowSettlementModal(false);
    loadData();
  };

  const formatMoney = (amount: number) => amount.toLocaleString('fr-FR');
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-3 sm:p-4">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER - Agent Info & Balance Hero
      ═══════════════════════════════════════════════════════════════════ */}
      <header className="mb-4">
        {/* Status Bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                <Wifi size={14} />
                <span>En ligne</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                <WifiOff size={14} />
                <span>Hors ligne</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-500/20 rounded-full text-[10px] font-bold">
                    {pendingCount} en attente
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 active:bg-slate-600/50 transition-colors disabled:opacity-50 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Admin Supervision Banner */}
        {isAdmin && selectedAgentId && currentAgent && (
          <div className="mb-3 px-3 py-2 bg-amber-500/15 border border-amber-500/40 rounded-lg flex items-center gap-2">
            <Shield size={14} className="text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              <span className="font-medium">Supervision:</span>{' '}
              <strong>{currentAgent.nom} {currentAgent.prenom}</strong>
            </p>
          </div>
        )}

        {/* Agent Card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-xl p-3">
          {/* Admin: Agent Selector / Agent: Static Display */}
          {isAdmin ? (
            <div className="mb-3">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">
                Sélectionner un Agent
              </label>
              <AgentSelector
                agents={allAgents}
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
                placeholder="Choisir un agent à superviser..."
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                {currentAgent?.photo_url ? (
                  <img src={currentAgent.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User size={20} />
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-base font-bold text-white">
                  {currentAgent ? `${currentAgent.nom} ${currentAgent.prenom}` : 'Agent'}
                </h1>
                <p className="text-[10px] text-slate-400">
                  {currentAgent?.zone_affectation || 'Zone non assignée'}
                </p>
              </div>
            </div>
          )}

          {/* Balance Hero - POS optimized */}
          <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[9px] text-emerald-400/80 uppercase tracking-wider font-semibold">
              {isAdmin && !selectedAgentId ? 'Sélectionnez un agent' : 'Solde'}
            </p>
            <p className="text-xl font-black text-emerald-400 tabular-nums leading-tight">
              {loading ? (
                <span className="animate-pulse">---</span>
              ) : !targetAgentId ? (
                <span className="text-slate-500">---</span>
              ) : (
                formatMoney(agentSummary?.disponible || 0)
              )}
              <span className="text-xs font-semibold text-emerald-400/60 ml-0.5">F</span>
            </p>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO ACTION ZONE - Three Action Buttons (POS optimized)
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-3 gap-1.5 mb-3">
        {/* COLLECTE Button */}
        <button
          onClick={() => setShowPaiementForm(true)}
          disabled={isAdmin && !targetAgentId}
          className={`
            min-h-[72px] py-2.5 rounded-lg
            bg-gradient-to-br from-emerald-600 to-green-700
            hover:from-emerald-500 hover:to-green-600
            active:scale-[0.97] active:brightness-90
            border border-emerald-500/50
            shadow-md shadow-emerald-500/20
            flex flex-col items-center justify-center gap-0.5
            transition-all duration-100
            touch-manipulation select-none
            ${isAdmin && !targetAgentId ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <DollarSign size={22} className="text-white" />
          </div>
          <span className="text-[11px] font-bold text-white leading-tight">
            COLLECTE
          </span>
        </button>

        {/* REMISE Button */}
        <button
          onClick={() => setShowSettlementModal(true)}
          disabled={isAdmin && !targetAgentId}
          className={`
            min-h-[72px] py-2.5 rounded-lg
            bg-gradient-to-br from-cyan-600 to-blue-700
            hover:from-cyan-500 hover:to-blue-600
            active:scale-[0.97] active:brightness-90
            border border-cyan-500/50
            shadow-md shadow-cyan-500/20
            flex flex-col items-center justify-center gap-0.5
            transition-all duration-100
            touch-manipulation select-none
            ${isAdmin && !targetAgentId ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <ArrowRightCircle size={22} className="text-white" />
          </div>
          <span className="text-[11px] font-bold text-white leading-tight">
            {isAdmin ? 'ENCAISSER' : 'REMISE'}
          </span>
        </button>

        {/* PROSPECTION Button */}
        <button
          onClick={() => setShowProspectionForm(true)}
          disabled={isAdmin && !targetAgentId}
          className={`
            min-h-[72px] py-2.5 rounded-lg
            bg-gradient-to-br from-violet-600 to-purple-700
            hover:from-violet-500 hover:to-purple-600
            active:scale-[0.97] active:brightness-90
            border border-violet-500/50
            shadow-md shadow-violet-500/20
            flex flex-col items-center justify-center gap-0.5
            transition-all duration-100
            touch-manipulation select-none
            ${isAdmin && !targetAgentId ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <UserPlus size={22} className="text-white" />
          </div>
          <span className="text-[11px] font-bold text-white leading-tight">
            PROSPECT
          </span>
        </button>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          RECENT TRANSACTIONS - POS optimized list
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <History size={10} />
            Récent
          </h2>
        </div>

        <div className="space-y-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 bg-slate-800/50 rounded-lg animate-pulse" />
            ))
          ) : recentTransactions.length === 0 ? (
            <div className="text-center py-4 text-slate-500">
              <Clock size={20} className="mx-auto mb-1 opacity-50" />
              <p className="text-[10px]">Aucune opération</p>
            </div>
          ) : (
            recentTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg min-h-[44px]"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`
                    w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                    ${tx.type === 'Collecte'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-cyan-500/20 text-cyan-400'
                    }
                  `}>
                    {tx.type === 'Collecte' ? <DollarSign size={14} /> : <ArrowRightCircle size={14} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-white truncate">{tx.clientNom || tx.type}</p>
                    <p className="text-[9px] text-slate-500">{formatTime(tx.date)}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 pl-2">
                  <p className={`text-xs font-bold tabular-nums ${tx.type === 'Collecte' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                    {tx.type === 'Collecte' ? '+' : '-'}{formatMoney(tx.montant)}
                  </p>
                  <div className="flex items-center justify-end gap-0.5">
                    {tx.statut === StatutOperationTerrain.APPROVED ? (
                      <CheckCircle size={8} className="text-emerald-400" />
                    ) : (
                      <Clock size={8} className="text-amber-400" />
                    )}
                    <span className={`text-[8px] ${tx.statut === StatutOperationTerrain.APPROVED ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {tx.statut === StatutOperationTerrain.APPROVED ? 'OK' : '...'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════ */}
      {showPaiementForm && (
        <AgentTerrainPaiement 
          agentId={targetAgentId || ''}
          onClose={() => setShowPaiementForm(false)} 
          onSuccess={handlePaymentSuccess} 
        />
      )}

      {showSettlementModal && (
        <SettlementModal 
          isOpen={showSettlementModal}
          agentId={targetAgentId || ''}
          onClose={() => setShowSettlementModal(false)} 
          onSuccess={handleSettlementSuccess} 
        />
      )}

      <ProspectionFormModal
        isOpen={showProspectionForm}
        agentId={targetAgentId || ''}
        onClose={() => setShowProspectionForm(false)}
        onSuccess={() => {
          setShowProspectionForm(false);
          loadData();
        }}
      />

      <UniversalPaymentSuccessModal 
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        term="Fermer"
        data={receiptData}
      />
    </div>
  );
}
