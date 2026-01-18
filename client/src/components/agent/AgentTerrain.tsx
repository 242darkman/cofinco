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
        const activeAgent = agents.find((a: Agent) => a.statut === 'Actif') || agents[0];
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
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER - Agent Info & Balance Hero
      ═══════════════════════════════════════════════════════════════════ */}
      <header className="mb-6">
        {/* Status Bar */}
        <div className="flex items-center justify-between mb-4">
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
            className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Admin Supervision Banner */}
        {isAdmin && selectedAgentId && currentAgent && (
          <div className="mb-4 px-4 py-3 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-center gap-3">
            <Shield size={18} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-amber-300 font-medium">
                Mode Supervision
              </p>
              <p className="text-xs text-amber-400/70">
                Vous agissez au nom de <strong>{currentAgent.nom} {currentAgent.prenom}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Agent Card */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-2xl p-5">
          {/* Admin: Agent Selector / Agent: Static Display */}
          {isAdmin ? (
            <div className="mb-4">
              <label className="block text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">
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
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border-2 border-cyan-500/30 flex items-center justify-center text-cyan-400">
                {currentAgent?.photo_url ? (
                  <img src={currentAgent.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User size={28} />
                )}
              </div>
              <div className="flex-1">
                <h1 className="text-lg font-bold text-white">
                  {currentAgent ? `${currentAgent.nom} ${currentAgent.prenom}` : 'Agent'}
                </h1>
                <p className="text-xs text-slate-400">
                  {currentAgent?.zone_affectation || 'Zone non assignée'}
                </p>
              </div>
            </div>
          )}

          {/* Balance Hero */}
          <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-xs text-emerald-400/80 uppercase tracking-wider font-semibold mb-1">
              {isAdmin && !selectedAgentId ? 'Sélectionnez un agent' : 'Solde Disponible'}
            </p>
            <p className="text-4xl sm:text-5xl font-black text-emerald-400 tabular-nums">
              {loading ? (
                <span className="animate-pulse">---</span>
              ) : !targetAgentId ? (
                <span className="text-slate-500">---</span>
              ) : (
                formatMoney(agentSummary?.disponible || 0)
              )}
            </p>
            <p className="text-sm text-emerald-400/60 mt-1">FCFA</p>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO ACTION ZONE - Three Action Buttons (2 top + 1 full width)
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-2 gap-4 mb-4">
        {/* COLLECTE Button */}
        <button
          onClick={() => setShowPaiementForm(true)}
          disabled={isAdmin && !targetAgentId}
          className={`
            h-32 sm:h-36 rounded-2xl
            bg-gradient-to-br from-emerald-600 to-green-700
            hover:from-emerald-500 hover:to-green-600
            active:scale-[0.98]
            border-2 border-emerald-500/50
            shadow-lg shadow-emerald-500/20
            flex flex-col items-center justify-center gap-2
            transition-all duration-150
            touch-manipulation
            ${isAdmin && !targetAgentId ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 flex items-center justify-center">
            <DollarSign size={28} className="text-white" />
          </div>
          <span className="text-base sm:text-lg font-bold text-white tracking-wide">
            COLLECTE
          </span>
        </button>

        {/* REMISE Button */}
        <button
          onClick={() => setShowSettlementModal(true)}
          disabled={isAdmin && !targetAgentId}
          className={`
            h-32 sm:h-36 rounded-2xl
            bg-gradient-to-br from-cyan-600 to-blue-700
            hover:from-cyan-500 hover:to-blue-600
            active:scale-[0.98]
            border-2 border-cyan-500/50
            shadow-lg shadow-cyan-500/20
            flex flex-col items-center justify-center gap-2
            transition-all duration-150
            touch-manipulation
            ${isAdmin && !targetAgentId ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 flex items-center justify-center">
            <ArrowRightCircle size={28} className="text-white" />
          </div>
          <span className="text-base sm:text-lg font-bold text-white tracking-wide">
            {isAdmin ? 'ENCAISSER' : 'REMISE'}
          </span>
        </button>
      </section>

      {/* PROSPECTION Button - Full Width */}
      <section className="mb-6">
        <button
          onClick={() => setShowProspectionForm(true)}
          disabled={isAdmin && !targetAgentId}
          className={`
            w-full h-28 sm:h-32 rounded-2xl
            bg-gradient-to-br from-violet-600 to-purple-700
            hover:from-violet-500 hover:to-purple-600
            active:scale-[0.98]
            border-2 border-violet-500/50
            shadow-lg shadow-violet-500/20
            flex flex-col items-center justify-center gap-2
            transition-all duration-150
            touch-manipulation
            ${isAdmin && !targetAgentId ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 flex items-center justify-center">
            <UserPlus size={28} className="text-white" />
          </div>
          <span className="text-base sm:text-lg font-bold text-white tracking-wide">
            PROSPECTION
          </span>
        </button>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          RECENT TRANSACTIONS - Simple List
      ═══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <History size={14} />
            Dernières Opérations
          </h2>
        </div>

        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />
            ))
          ) : recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune opération récente</p>
            </div>
          ) : (
            recentTransactions.map((tx) => (
              <div 
                key={tx.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${tx.type === 'Collecte' 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-cyan-500/20 text-cyan-400'
                    }
                  `}>
                    {tx.type === 'Collecte' ? <DollarSign size={18} /> : <ArrowRightCircle size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{tx.clientNom || tx.type}</p>
                    <p className="text-[10px] text-slate-500">{formatTime(tx.date)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${tx.type === 'Collecte' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                    {tx.type === 'Collecte' ? '+' : '-'}{formatMoney(tx.montant)}
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[10px]">
                    {tx.statut === 'APPROVED' ? (
                      <CheckCircle size={10} className="text-emerald-400" />
                    ) : (
                      <Clock size={10} className="text-amber-400" />
                    )}
                    <span className={tx.statut === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400'}>
                      {tx.statut === 'APPROVED' ? 'Validé' : 'En attente'}
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
