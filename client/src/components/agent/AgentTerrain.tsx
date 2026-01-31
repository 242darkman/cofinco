import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Wallet, ArrowRightLeft, UserPlus, RefreshCw,
  Wifi, Search, MapPin, ChevronDown, Clock, CheckCircle,
  Target, Banknote, Calendar, AlertTriangle, MessageSquare, Trophy
} from 'lucide-react';
import { agentTerrainApi, caisseAgentApi } from '../../lib/api-client';
import { authService } from '../../lib/auth';
import AgentTerrainPaiement from './AgentTerrainPaiement';
import SettlementModal from './SettlementModal';
import ProspectionFormModal from './ProspectionFormModal';
import AgentPlanning from './AgentPlanning';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { StatutUser, StatutOperationTerrain } from '@shared/enum/status-constants';
import { resolveStorageUrl } from '../../lib/format';

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

interface PlanningEntry {
  id: string;
  heure_debut: string;
  heure_fin: string;
  type_activite: string;
  zone: string;
  statut: string;
}

interface KPIData {
  objectifPct: number;
  commissionsNet: number;
  planningToday: number;
  incidentsOpen: number;
  messagesUnread: number;
  rank: number;
  collectesToday: number;
  collectesMontant: number;
}

interface AgentTerrainProps {
  activeView?: string;
}

export default function AgentTerrain({ activeView }: AgentTerrainProps) {
  const [loading, setLoading] = useState(true);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentSummary, setAgentSummary] = useState<{ disponible: number; valide: number; pendingIn: number } | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [kpis, setKpis] = useState<KPIData>({
    objectifPct: 0, commissionsNet: 0, planningToday: 0,
    incidentsOpen: 0, messagesUnread: 0, rank: 0,
    collectesToday: 0, collectesMontant: 0,
  });
  const [todayPlannings, setTodayPlannings] = useState<PlanningEntry[]>([]);

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
  const [showFullPlanning, setShowFullPlanning] = useState(false);

  // Agent dropdown search
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  // Offline queue
  const { isOnline, pendingCount } = useOfflineQueue();

  useEffect(() => {
    loadAgents();
  }, []);

  // Reload data when target agent changes
  useEffect(() => {
    if (targetAgentId) {
      loadAgentData(targetAgentId);
      loadKPIs(targetAgentId);
    } else if (isAdmin) {
      setLoading(false);
      setAgentSummary(null);
      setRecentTransactions([]);
      setCurrentAgent(null);
      setKpis({ objectifPct: 0, commissionsNet: 0, planningToday: 0, incidentsOpen: 0, messagesUnread: 0, rank: 0, collectesToday: 0, collectesMontant: 0 });
      setTodayPlannings([]);
    }
  }, [targetAgentId]);

  const loadAgents = async () => {
    try {
      // For non-admin users, first try to get their own agent profile
      if (!isAdmin) {
        try {
          const meResponse = await agentTerrainApi.getMe();
          if (meResponse.data) {
            setCurrentAgent(meResponse.data);
            setAllAgents([meResponse.data]);
            return;
          }
        } catch (err) {
          console.warn('Could not fetch current agent profile:', err);
        }
      }

      // For admins or fallback: load all agents
      const agents = await agentTerrainApi.getAllList();
      setAllAgents(agents);
      if (!isAdmin && agents.length > 0) {
        // Fallback: if getMe failed, use first active agent (legacy behavior)
        const activeAgent = agents.find((a: Agent) => a.statut === StatutUser.ACTIVE) || agents[0];
        setCurrentAgent(activeAgent);
      } else if (isAdmin) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
      setLoading(false);
    }
  };

  const loadAgentData = async (agentId: string) => {
    setLoading(true);
    try {
      const agent = allAgents.find(a => a.id === agentId);
      if (agent) setCurrentAgent(agent);

      const summary = await caisseAgentApi.getCaisseSummary(agentId);
      setAgentSummary({
        disponible: parseFloat(summary.disponible || '0'),
        valide: parseFloat(summary.soldeValide || '0'),
        pendingIn: parseFloat(summary.pendingIn || '0')
      });

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

  /**
   * Load KPIs from agent-modules APIs (non-blocking, best-effort)
   */
  const loadKPIs = useCallback(async (agentId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const kpiState: KPIData = {
      objectifPct: 0, commissionsNet: 0, planningToday: 0,
      incidentsOpen: 0, messagesUnread: 0, rank: 0,
      collectesToday: 0, collectesMontant: 0,
    };

    const fetches = await Promise.allSettled([
      // 0: Objectifs
      fetch(`/api/agent-objectifs?agentId=${agentId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      // 1: Commissions (current month)
      fetch(`/api/agent-commissions?agentId=${agentId}&limit=5`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      // 2: Planning today
      fetch(`/api/agent-planning?agentId=${agentId}&date=${today}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      // 3: Incidents open
      fetch(`/api/agent-incidents?agentId=${agentId}&statut=OPEN`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      // 4: Communications unread
      fetch(`/api/agent-communications?agentId=${agentId}&lu=false`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ]);

    // Objectifs: average progress %
    if (fetches[0].status === 'fulfilled') {
      const objectifs = Array.isArray(fetches[0].value) ? fetches[0].value : [];
      if (objectifs.length > 0) {
        const totalPct = objectifs.reduce((sum: number, o: any) => {
          const target = Number(o.target_value || o.targetValue || 1);
          const current = Number(o.current_value || o.currentValue || 0);
          return sum + Math.min((current / target) * 100, 100);
        }, 0);
        kpiState.objectifPct = Math.round(totalPct / objectifs.length);
      }
    }

    // Commissions: net total
    if (fetches[1].status === 'fulfilled') {
      const comms = Array.isArray(fetches[1].value) ? fetches[1].value : [];
      kpiState.commissionsNet = comms.reduce((sum: number, c: any) =>
        sum + Number(c.net || c.commission_net || 0), 0);
    }

    // Planning today
    if (fetches[2].status === 'fulfilled') {
      const plans = Array.isArray(fetches[2].value) ? fetches[2].value : [];
      kpiState.planningToday = plans.length;
      setTodayPlannings(plans.slice(0, 5).map((p: any) => ({
        id: p.id,
        heure_debut: p.heure_debut || p.heureDebut || '08:00',
        heure_fin: p.heure_fin || p.heureFin || '17:00',
        type_activite: p.type_activite || p.typeActivite || 'Visite',
        zone: p.zone || '',
        statut: p.statut || 'PLANNED',
      })));
    }

    // Incidents open
    if (fetches[3].status === 'fulfilled') {
      const incidents = Array.isArray(fetches[3].value) ? fetches[3].value : [];
      kpiState.incidentsOpen = incidents.length;
    }

    // Communications unread
    if (fetches[4].status === 'fulfilled') {
      const msgs = Array.isArray(fetches[4].value) ? fetches[4].value : [];
      kpiState.messagesUnread = msgs.length;
    }

    setKpis(kpiState);
  }, []);

  const loadData = () => {
    if (targetAgentId) {
      loadAgentData(targetAgentId);
      loadKPIs(targetAgentId);
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
  const formatMoneyK = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
    return amount.toString();
  };
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const agentDisabled = isAdmin && !selectedAgentId;

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden font-sans text-white">

      {/* ═══ 1. TOP BAR ═══ */}
      <header className="h-12 flex-none bg-slate-900 border-b border-slate-800 flex justify-between items-center px-3">
        <div className="flex items-center gap-2">
           {isOnline ? (
             <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                <Wifi size={10} /> En ligne
             </div>
           ) : (
             <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
                <Wifi size={10} /> Hors ligne {pendingCount > 0 && `(${pendingCount})`}
             </div>
           )}
           <span className="text-[10px] text-slate-600 hidden sm:inline">POS v2.2</span>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
           <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* ═══ 2. SCROLLABLE CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* --- AGENT CARD --- */}
        <div className="px-3 pt-3 pb-2">
           {(isAdmin && !selectedAgentId) ? (
              <div className="relative">
                 <button
                    onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                    className="w-full h-14 bg-slate-900 border-2 border-slate-700 rounded-2xl px-4 text-base text-white flex items-center justify-between focus:border-indigo-500 outline-none cursor-pointer hover:bg-slate-800 transition-colors"
                 >
                    <div className="flex items-center gap-3">
                       <Search className="h-4 w-4 text-slate-500" />
                       <span className="text-slate-400">Sélectionner un agent...</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${agentDropdownOpen ? 'rotate-180' : ''}`} />
                 </button>

                 {agentDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
                       {/* Search Input */}
                       <div className="p-3 border-b border-slate-700">
                          <div className="relative">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                             <input
                                type="text"
                                placeholder="Rechercher un agent..."
                                value={agentSearchQuery}
                                onChange={(e) => setAgentSearchQuery(e.target.value)}
                                className="w-full h-10 bg-slate-800 border border-slate-600 rounded-xl pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
                                autoFocus
                             />
                          </div>
                       </div>

                       {/* Agent List */}
                       <div className="max-h-64 overflow-y-auto">
                          {allAgents
                             .filter(agent => {
                                const query = agentSearchQuery.toLowerCase();
                                return (
                                   agent.nom.toLowerCase().includes(query) ||
                                   agent.prenom.toLowerCase().includes(query) ||
                                   (agent.zone_affectation || '').toLowerCase().includes(query)
                                );
                             })
                             .map(agent => (
                                <button
                                   key={agent.id}
                                   onClick={() => {
                                      setSelectedAgentId(agent.id);
                                      setAgentDropdownOpen(false);
                                      setAgentSearchQuery('');
                                   }}
                                   className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800 transition-colors text-left border-b border-slate-800 last:border-b-0"
                                >
                                   {agent.photo_url ? (
                                      <img src={resolveStorageUrl(agent.photo_url)} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-600" />
                                   ) : (
                                      <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
                                         {agent.nom.charAt(0)}{agent.prenom.charAt(0)}
                                      </div>
                                   )}
                                   <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-white truncate">
                                         {agent.nom} {agent.prenom}
                                      </div>
                                      {agent.zone_affectation && (
                                         <div className="text-xs text-slate-500 flex items-center gap-1 truncate">
                                            <MapPin size={10} /> {agent.zone_affectation}
                                         </div>
                                      )}
                                   </div>
                                   <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      agent.statut === StatutUser.ACTIVE
                                         ? 'bg-emerald-500/10 text-emerald-400'
                                         : 'bg-slate-500/10 text-slate-400'
                                   }`}>
                                      {agent.statut === StatutUser.ACTIVE ? 'Actif' : 'Inactif'}
                                   </div>
                                </button>
                             ))
                          }
                          {allAgents.filter(agent => {
                             const query = agentSearchQuery.toLowerCase();
                             return agent.nom.toLowerCase().includes(query) || agent.prenom.toLowerCase().includes(query);
                          }).length === 0 && (
                             <div className="px-4 py-8 text-center text-slate-500 text-sm">
                                Aucun agent trouvé
                             </div>
                          )}
                       </div>
                    </div>
                 )}

                 {/* Backdrop to close dropdown */}
                 {agentDropdownOpen && (
                    <div
                       className="fixed inset-0 z-40"
                       onClick={() => {
                          setAgentDropdownOpen(false);
                          setAgentSearchQuery('');
                       }}
                    />
                 )}
              </div>
           ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-center justify-between relative overflow-hidden">
                 <div className="flex items-center gap-3 z-10">
                    {currentAgent?.photo_url ? (
                      <img src={resolveStorageUrl(currentAgent.photo_url)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-indigo-500/30" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                        {currentAgent ? `${currentAgent.nom.charAt(0)}${currentAgent.prenom.charAt(0)}` : <Users size={16} />}
                      </div>
                    )}
                    <div className="min-w-0">
                       <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
                         {isAdmin ? 'Supervision' : 'Agent Actif'}
                       </div>
                       <div className="text-sm font-bold leading-tight truncate">
                         {currentAgent ? `${currentAgent.nom} ${currentAgent.prenom}` : '...'}
                       </div>
                    </div>
                 </div>
                 <div className="text-right z-10 shrink-0">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Solde</div>
                    <div className="text-lg font-bold text-emerald-400 leading-tight">
                      {loading ? '...' : formatMoney(agentSummary?.disponible || 0)}
                    </div>
                    {!loading && agentSummary && agentSummary.pendingIn > 0 && (
                      <div className="text-[10px] text-amber-400 font-medium mt-0.5">
                        +{formatMoney(agentSummary.pendingIn)} FCFA en attente
                      </div>
                    )}
                    {(!agentSummary?.pendingIn || agentSummary.pendingIn === 0) && (
                      <div className="text-[9px] text-emerald-600 font-bold">FCFA</div>
                    )}
                 </div>

                 {isAdmin && (
                   <button
                     onClick={() => setSelectedAgentId(null)}
                     className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20 text-white text-xs font-bold transition-all"
                   >
                     Changer d'agent
                   </button>
                 )}
              </div>
           )}
        </div>

        {/* --- KPI STRIP (Horizontally Scrollable) --- */}
        {!agentDisabled && (
          <div className="px-3 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
              <KPIChip
                icon={Target}
                value={`${kpis.objectifPct}%`}
                label="Objectifs"
                color={kpis.objectifPct >= 80 ? 'emerald' : kpis.objectifPct >= 50 ? 'amber' : 'red'}
              />
              <KPIChip
                icon={Banknote}
                value={formatMoneyK(kpis.commissionsNet)}
                label="Commission"
                color="cyan"
              />
              <KPIChip
                icon={Calendar}
                value={String(kpis.planningToday)}
                label="Agenda"
                color="blue"
              />
              <KPIChip
                icon={AlertTriangle}
                value={String(kpis.incidentsOpen)}
                label="Incidents"
                color={kpis.incidentsOpen > 0 ? 'red' : 'slate'}
                pulse={kpis.incidentsOpen > 0}
              />
              <KPIChip
                icon={MessageSquare}
                value={String(kpis.messagesUnread)}
                label="Messages"
                color={kpis.messagesUnread > 0 ? 'purple' : 'slate'}
              />
            </div>
          </div>
        )}

        {/* --- ACTION GRID --- */}
        <div className={`px-3 pb-2 ${agentDisabled ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
           <div className="grid grid-cols-2 gap-2">
              <ActionTile
                 title="COLLECTE"
                 subtitle="Tontine"
                 icon={Wallet}
                 color="emerald"
                 className="col-span-2"
                 onClick={() => setShowPaiementForm(true)}
              />
              <ActionTile
                 title={isAdmin ? "ENCAISSER" : "REMISE"}
                 subtitle="Operation"
                 icon={ArrowRightLeft}
                 color="blue"
                 onClick={() => setShowSettlementModal(true)}
              />
              <ActionTile
                 title="PROSPECT"
                 subtitle="Nouveau Client"
                 icon={UserPlus}
                 color="purple"
                 onClick={() => setShowProspectionForm(true)}
              />
           </div>
        </div>

        {/* --- TODAY'S AGENDA --- */}
        {!agentDisabled && (
          <div className="px-3 pb-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <Calendar size={11} /> Agenda du jour
                </div>
                <div className="flex items-center gap-2">
                  {todayPlannings.length > 0 && (
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                      {todayPlannings.length}
                    </span>
                  )}
                  <button
                    onClick={() => setShowFullPlanning(true)}
                    className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-0.5 rounded transition-colors"
                  >
                    Voir Planning
                  </button>
                </div>
              </div>
              {todayPlannings.length > 0 ? (
                <div className="divide-y divide-slate-800/60">
                  {todayPlannings.map(p => (
                    <div key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                      <div className="text-[10px] font-mono font-bold text-slate-500 w-10 shrink-0">
                        {p.heure_debut}
                      </div>
                      <div className={`w-1 h-6 rounded-full shrink-0 ${
                        p.type_activite === 'Visite' ? 'bg-blue-500' :
                        p.type_activite === 'Collecte' ? 'bg-emerald-500' :
                        p.type_activite === 'Prospection' ? 'bg-violet-500' :
                        'bg-slate-600'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-white truncate">
                          {p.type_activite}
                        </div>
                        {p.zone && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                            <MapPin size={8} /> {p.zone}
                          </div>
                        )}
                      </div>
                      <div className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        p.statut === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400' :
                        p.statut === 'IN_PROGRESS' ? 'bg-blue-500/15 text-blue-400' :
                        p.statut === 'CANCELLED' ? 'bg-red-500/15 text-red-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {p.statut === 'COMPLETED' ? 'Fait' :
                         p.statut === 'IN_PROGRESS' ? 'En cours' :
                         p.statut === 'CANCELLED' ? 'Annule' : 'Prevu'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-center">
                  <Calendar size={20} className="mx-auto text-slate-600 mb-1" />
                  <p className="text-[11px] text-slate-500">Aucune activite prevue aujourd'hui</p>
                  <button
                    onClick={() => setShowFullPlanning(true)}
                    className="mt-2 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    + Planifier une activite
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- RECENT TRANSACTIONS --- */}
        {!agentDisabled && recentTransactions.length > 0 && (
           <div className="px-3 pb-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Clock size={11} /> Recemment
                  </div>
                </div>
                <div className="divide-y divide-slate-800/60">
                   {recentTransactions.map(op => (
                      <div key={op.id} className="flex items-center justify-between px-3 py-2">
                         <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-1 h-6 rounded-full shrink-0 ${op.type === 'Collecte' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
                            <div className="min-w-0">
                               <div className="text-xs font-semibold text-white truncate">{op.type}</div>
                               <div className="text-[10px] text-slate-500 truncate">{op.clientNom}</div>
                            </div>
                         </div>
                         <div className="text-right shrink-0 pl-2">
                            <div className="text-xs font-bold text-white">{formatMoney(op.montant)}</div>
                            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500">
                              <span>{formatTime(op.date)}</span>
                              {op.statut === StatutOperationTerrain.APPROVED && <CheckCircle size={8} className="text-emerald-500" />}
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
              </div>
           </div>
        )}

      </div>{/* end scrollable */}

      {/* ═══ MODALS ═══ */}
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

      {/* ═══ FULL PLANNING OVERLAY ═══ */}
      {showFullPlanning && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          <header className="h-12 flex-none bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Calendar size={16} className="text-indigo-400" />
              Planning
            </div>
            <button
              onClick={() => {
                setShowFullPlanning(false);
                // Refresh KPIs when closing planning (in case new plannings were added)
                if (targetAgentId) loadKPIs(targetAgentId);
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-colors"
            >
              Fermer
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            <AgentPlanning agentId={targetAgentId || undefined} />
          </div>
        </div>
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI CHIP - Compact metric display for the scrollable strip
// ═══════════════════════════════════════════════════════════════════════════

interface KPIChipProps {
  icon: React.ElementType;
  value: string;
  label: string;
  color: 'emerald' | 'cyan' | 'blue' | 'amber' | 'red' | 'purple' | 'slate';
  pulse?: boolean;
}

function KPIChip({ icon: Icon, value, label, color, pulse }: KPIChipProps) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    slate: 'bg-slate-800 border-slate-700 text-slate-400',
  };

  return (
    <div className={`
      shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all
      ${colorMap[color]}
      ${pulse ? 'animate-pulse' : ''}
    `}>
      <Icon size={13} />
      <div className="flex flex-col">
        <span className="text-sm font-black leading-none">{value}</span>
        <span className="text-[8px] font-bold uppercase tracking-wider opacity-70 leading-none mt-0.5">{label}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TILE - Large touch-friendly button
// ═══════════════════════════════════════════════════════════════════════════

interface ActionTileProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: 'emerald' | 'blue' | 'purple';
  className?: string;
  onClick: () => void;
}

function ActionTile({ title, subtitle, icon: Icon, color, className = '', onClick }: ActionTileProps) {
  const colors = {
    emerald: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 shadow-emerald-900/20',
    blue: 'bg-sky-600 hover:bg-sky-500 border-sky-500 shadow-sky-900/20',
    purple: 'bg-violet-600 hover:bg-violet-500 border-violet-500 shadow-violet-900/20',
  };

  const isWide = className.includes('col-span-2');

  return (
    <button
      onClick={onClick}
      className={`
        ${className} relative group overflow-hidden rounded-2xl border-t border-l border-white/20 shadow-xl
        transition-all active:scale-[0.97] text-white
        ${colors[color]}
        ${isWide ? 'py-5' : 'py-4'}
        flex flex-col items-center justify-center gap-1
      `}
    >
       <Icon size={isWide ? 80 : 60} className="absolute -bottom-3 -right-3 opacity-15 rotate-12 pointer-events-none" />

       <div className="relative z-10 p-2.5 bg-black/20 rounded-full group-hover:bg-black/10 transition-colors">
          <Icon size={isWide ? 28 : 22} />
       </div>
       <div className="relative z-10 text-center">
          <div className={`font-black tracking-tight ${isWide ? 'text-xl' : 'text-base'}`}>{title}</div>
          <div className="text-[9px] font-medium opacity-70 uppercase tracking-wider">{subtitle}</div>
       </div>
    </button>
  );
}
