import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Wallet, ArrowRightLeft, UserPlus, RefreshCw,
  Wifi, Search, MapPin, ChevronDown, Clock, CheckCircle,
  Target, Banknote, Calendar, AlertTriangle, MessageSquare,
  ClipboardCheck, ChevronLeft, ChevronRight, User, Play, Loader2
} from 'lucide-react';
import { agentTerrainApi, caisseAgentApi } from '../../lib/api-client';
import { authService } from '../../lib/auth';
import AgentTerrainPaiement from './AgentTerrainPaiement';
import SettlementModal from './SettlementModal';
import ProspectionFormModal from './ProspectionFormModal';
import AgentPlanning from './AgentPlanning';
import EnqueteCreditForm from '../finance/credits/EnqueteCreditForm';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { StatutUser, StatutOperationTerrain } from '@shared/enum/status-constants';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import { resolveStorageUrl } from '../../lib/format';

interface Agent {
  id: string;
  userId?: string;
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
  heureDebut: string;
  heureFin: string;
  typeActivite: string;
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

  // Enquêtes (investigations) state
  const [pendingEnquetes, setPendingEnquetes] = useState<any[]>([]);
  const [showEnquetesPanel, setShowEnquetesPanel] = useState(false);
  const [startingEnquete, setStartingEnquete] = useState<string | null>(null);

  // Auth & Role
  const currentUser = authService.getCurrentUser();
  const isAdmin = authService.isAdmin();
  // Supervision mode: admin, chef d'agence, superviseur (or users with admin permissions)
  const userRole = normalizeRole(currentUser?.role);
  const canSupervise = isAdmin || userRole === SystemRole.CHEF_AGENCE || userRole === SystemRole.SUPERVISEUR;

  // Target agent: supervisor uses selected agent, normal agent uses themselves
  const targetAgentId = canSupervise ? selectedAgentId : currentAgent?.id;

  // Modals
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showProspectionForm, setShowProspectionForm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>();
  const [showFullPlanning, setShowFullPlanning] = useState(false);
  const [enqueteFormData, setEnqueteFormData] = useState<any>(null);

  // Agent dropdown search
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

  // Agenda pagination
  const [agendaPage, setAgendaPage] = useState(0);
  const [agendaPageSize, setAgendaPageSize] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setAgendaPageSize(w < 400 ? 3 : w < 768 ? 4 : w < 1280 ? 5 : 8);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const allAgendaItems = useMemo(() => {
    const items: Array<{ type: 'enquete'; data: any } | { type: 'planning'; data: PlanningEntry }> = [];
    pendingEnquetes.forEach(enq => items.push({ type: 'enquete', data: enq }));
    todayPlannings.forEach(p => items.push({ type: 'planning', data: p }));
    return items;
  }, [pendingEnquetes, todayPlannings]);

  const totalAgendaPages = Math.max(1, Math.ceil(allAgendaItems.length / agendaPageSize));
  const safeAgendaPage = Math.min(agendaPage, totalAgendaPages - 1);
  const paginatedAgendaItems = allAgendaItems.slice(
    safeAgendaPage * agendaPageSize,
    (safeAgendaPage + 1) * agendaPageSize
  );

  // Reset page when data changes
  useEffect(() => { setAgendaPage(0); }, [pendingEnquetes.length, todayPlannings.length]);

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
    } else if (canSupervise) {
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
      if (!canSupervise) {
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
      if (!canSupervise && agents.length > 0) {
        // Fallback: if getMe failed, use first active agent (legacy behavior)
        const activeAgent = agents.find((a: Agent) => a.statut === StatutUser.ACTIVE) || agents[0];
        setCurrentAgent(activeAgent);
      } else if (canSupervise) {
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
        heureDebut: p.heureDebut || '08:00',
        heureFin: p.heureFin || '17:00',
        typeActivite: p.typeActivite || 'Visite',
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

  // Load pending enquêtes assigned to the agent
  // Admin supervision: pass agentUserId to view a specific agent's investigations
  const loadEnquetes = useCallback(async () => {
    try {
      // For admin supervision mode, resolve the agent's users.id from allAgents
      let url = '/api/enquetes-credit/mes-enquetes';
      if (canSupervise && selectedAgentId) {
        const agent = allAgents.find(a => a.id === selectedAgentId);
        if (agent?.userId) {
          url += `?agentUserId=${agent.userId}`;
        }
      }
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const result = await response.json();
        const all: any[] = Array.isArray(result.data) ? result.data : [];
        // Only show ASSIGNED and IN_PROGRESS
        setPendingEnquetes(all.filter((e: any) => ['ASSIGNED', 'IN_PROGRESS'].includes(e.statut)));
      }
    } catch (error) {
      console.error('[AgentTerrain] Error loading enquêtes:', error);
    }
  }, [canSupervise, selectedAgentId, allAgents]);

  // Load enquêtes when target changes or on mount
  useEffect(() => {
    if (canSupervise && !selectedAgentId) return; // supervisor without selection: skip
    loadEnquetes();
  }, [loadEnquetes]);

  // Real-time updates for enquêtes
  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent).detail || {};
      if (
        payload.type === 'enquete_new' ||
        payload.type === 'investigation_assigned' ||
        payload.type === 'investigation_submitted' ||
        payload.type === 'investigation_reviewed' ||
        payload.type === 'demande_updated'
      ) {
        loadEnquetes();
      }
    };
    window.addEventListener('credit-update', handler);
    return () => window.removeEventListener('credit-update', handler);
  }, [loadEnquetes]);

  const loadData = () => {
    if (targetAgentId) {
      loadAgentData(targetAgentId);
      loadKPIs(targetAgentId);
      loadEnquetes();
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

  // Start an investigation (ASSIGNED → IN_PROGRESS)
  const handleStartEnquete = useCallback(async (enqueteId: string) => {
    setStartingEnquete(enqueteId);
    try {
      const response = await fetch(`/api/enquetes-credit/${enqueteId}/demarrer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        loadEnquetes();
      }
    } finally {
      setStartingEnquete(null);
    }
  }, [loadEnquetes]);

  // Submit investigation form data for an IN_PROGRESS enquête
  const handleSubmitEnquete = useCallback(async (payload: any) => {
    if (!enqueteFormData?.id) return;
    const response = await fetch(`/api/enquetes-credit/${enqueteFormData.id}/soumettre`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Erreur lors de la soumission");
    }
    setEnqueteFormData(null);
    loadEnquetes();
  }, [enqueteFormData, loadEnquetes]);

  const agentDisabled = canSupervise && !selectedAgentId;

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
           {/* POS version only shown in standalone/PWA mode (actual POS device) */}
           {window.matchMedia?.('(display-mode: standalone)')?.matches && (
             <span className="text-[10px] text-slate-600 hidden sm:inline">POS v2.2</span>
           )}
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
           {(canSupervise && !selectedAgentId) ? (
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
                         {canSupervise ? 'Supervision' : 'Agent Actif'}
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

                 {canSupervise && (
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
                value={String(kpis.planningToday + pendingEnquetes.length)}
                label="Agenda"
                color={pendingEnquetes.length > 0 ? 'cyan' : 'blue'}
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
              <KPIChip
                icon={ClipboardCheck}
                value={String(pendingEnquetes.length)}
                label="Enquêtes"
                color={pendingEnquetes.length > 0 ? 'amber' : 'slate'}
                pulse={pendingEnquetes.length > 0}
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
                 title={canSupervise ? "ENCAISSER" : "REMISE"}
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

        {/* --- AGENDA DU JOUR (planning + enquêtes intégrées) --- */}
        {!agentDisabled && (
          <div className="px-3 pb-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <Calendar size={11} /> Mon agenda
                </div>
                <div className="flex items-center gap-2">
                  {allAgendaItems.length > 0 && (
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                      {allAgendaItems.length}
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

              {allAgendaItems.length > 0 ? (
                <div className="divide-y divide-slate-800/60">
                  {paginatedAgendaItems.map((item) => {
                    if (item.type === 'enquete') {
                      const enq = item.data;
                      const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
                      const isAssigned = enq.statut === 'ASSIGNED';
                      const isStarting = startingEnquete === enq.id;
                      const borderColor =
                        enq.priority === 'URGENT' ? 'bg-red-500' :
                        enq.priority === 'HIGH' ? 'bg-amber-500' :
                        enq.priority === 'MEDIUM' ? 'bg-blue-500' :
                        'bg-slate-500';
                      const priorityConf: Record<string, { label: string; color: string }> = {
                        LOW: { label: 'Basse', color: 'bg-slate-500/15 text-slate-400' },
                        MEDIUM: { label: 'Normale', color: 'bg-blue-500/15 text-blue-400' },
                        HIGH: { label: 'Haute', color: 'bg-amber-500/15 text-amber-400' },
                        URGENT: { label: 'Urgente', color: 'bg-red-500/15 text-red-400 animate-pulse' },
                      };
                      const pConf = priorityConf[enq.priority || 'MEDIUM'] || priorityConf.MEDIUM;

                      return (
                        <div
                          key={`enq-${enq.id}`}
                          className={`flex items-center gap-2.5 px-3 py-2.5 ${isOverdue ? 'bg-red-950/40' : ''}`}
                        >
                          <div className={`w-1 self-stretch rounded-full shrink-0 ${borderColor} ${enq.priority === 'URGENT' ? 'animate-pulse' : ''}`} />
                          <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-[10px] shrink-0">
                            {enq.client
                              ? `${(enq.client.nom || '?')[0]}${(enq.client.prenom || '')[0] || ''}`
                              : '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 mb-0.5">
                              <ClipboardCheck size={10} className="text-amber-400 shrink-0" />
                              <span className="text-[10px] text-amber-400/80 font-medium">Enquête crédit</span>
                            </div>
                            <p className="text-xs font-semibold text-white truncate">
                              {enq.client
                                ? `${enq.client.prenom || ''} ${enq.client.nom || ''}`.trim() || 'Client'
                                : enq.clientNom || 'Client'}
                            </p>
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                              {enq.montantDemande && (
                                <span className="text-[10px] text-emerald-400 font-medium">
                                  {Number(enq.montantDemande).toLocaleString('fr-FR')} F
                                </span>
                              )}
                              {enq.dueDate && (
                                <span className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                                  isOverdue
                                    ? 'text-red-400 font-bold bg-red-500/10 border border-red-500/20'
                                    : 'text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20'
                                }`}>
                                  {isOverdue ? <AlertTriangle size={9} /> : <Calendar size={9} />}
                                  Échéance : {new Date(enq.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  {isOverdue && ' (en retard)'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${pConf.color}`}>
                              {pConf.label}
                            </span>
                            {isAssigned ? (
                              <button
                                onClick={() => handleStartEnquete(enq.id)}
                                disabled={isStarting}
                                className="flex items-center gap-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white text-[9px] font-bold rounded-lg transition-colors"
                              >
                                {isStarting ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                                Démarrer
                              </button>
                            ) : enq.statut === 'IN_PROGRESS' ? (
                              <button
                                onClick={() => setEnqueteFormData(enq)}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold rounded-lg transition-colors"
                              >
                                <ClipboardCheck size={10} /> Remplir
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    } else {
                      const p = item.data;
                      return (
                        <div key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                          <div className="text-[10px] font-mono font-bold text-slate-500 w-10 shrink-0">
                            {p.heureDebut}
                          </div>
                          <div className={`w-1 h-6 rounded-full shrink-0 ${
                            p.typeActivite === 'Visite' ? 'bg-blue-500' :
                            p.typeActivite === 'Collecte' ? 'bg-emerald-500' :
                            p.typeActivite === 'Prospection' ? 'bg-violet-500' :
                            'bg-slate-600'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate">
                              {p.typeActivite}
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
                      );
                    }
                  })}
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

              {/* Pagination controls */}
              {totalAgendaPages > 1 && (
                <div className="px-3 py-1.5 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => setAgendaPage(p => Math.max(0, p - 1))}
                    disabled={safeAgendaPage === 0}
                    className="p-1.5 rounded-lg disabled:opacity-20 text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[10px] text-slate-500 font-medium tabular-nums">
                    {safeAgendaPage + 1} / {totalAgendaPages}
                  </span>
                  <button
                    onClick={() => setAgendaPage(p => Math.min(totalAgendaPages - 1, p + 1))}
                    disabled={safeAgendaPage >= totalAgendaPages - 1}
                    className="p-1.5 rounded-lg disabled:opacity-20 text-slate-400 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                  >
                    <ChevronRight size={14} />
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
                if (targetAgentId) loadKPIs(targetAgentId);
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-colors"
            >
              Fermer
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            <AgentPlanning agentId={targetAgentId || undefined} enquetes={pendingEnquetes} onStartEnquete={handleStartEnquete} startingEnquete={startingEnquete} />
          </div>
        </div>
      )}

      {/* ═══ FULL ENQUETES OVERLAY ═══ */}
      {showEnquetesPanel && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
          <header className="h-12 flex-none bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <ClipboardCheck size={16} className="text-amber-400" />
              Enquêtes à effectuer
              {pendingEnquetes.length > 0 && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  {pendingEnquetes.length}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setShowEnquetesPanel(false);
                loadEnquetes();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-300 transition-colors"
            >
              Fermer
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {pendingEnquetes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardCheck size={40} className="text-slate-700 mb-3" />
                <p className="text-sm text-slate-400 font-medium">Aucune enquête en attente</p>
                <p className="text-xs text-slate-600 mt-1">Les nouvelles enquêtes assignées apparaîtront ici</p>
              </div>
            ) : (
              pendingEnquetes.map((enq: any) => {
                const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
                const priorityConf: Record<string, { label: string; color: string }> = {
                  LOW: { label: 'Basse', color: 'bg-slate-500/15 text-slate-400' },
                  MEDIUM: { label: 'Normale', color: 'bg-blue-500/15 text-blue-400' },
                  HIGH: { label: 'Haute', color: 'bg-amber-500/15 text-amber-400' },
                  URGENT: { label: 'Urgente', color: 'bg-red-500/15 text-red-400 animate-pulse' },
                };
                const pConf = priorityConf[enq.priority || 'MEDIUM'] || priorityConf.MEDIUM;
                return (
                  <div
                    key={enq.id}
                    className={`bg-slate-900 border rounded-xl p-3 ${isOverdue ? 'border-red-500/40' : 'border-slate-800'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
                          {enq.client
                            ? `${(enq.client.nom || '?')[0]}${(enq.client.prenom || '')[0] || ''}`
                            : '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {enq.client ? `${enq.client.nom || ''} ${enq.client.prenom || ''}`.trim() : 'Client'}
                          </div>
                          {enq.objetCredit && (
                            <div className="text-[11px] text-slate-500 truncate">{enq.objetCredit}</div>
                          )}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${pConf.color}`}>
                        {pConf.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {enq.montantDemande && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Banknote size={11} className="text-emerald-500 shrink-0" />
                          {Number(enq.montantDemande).toLocaleString('fr-FR')} FCFA
                        </div>
                      )}
                      {enq.client?.telephone && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <User size={11} className="text-blue-400 shrink-0" />
                          <span className="truncate">{enq.client.telephone}</span>
                        </div>
                      )}
                      {enq.client?.adresseDomicile && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <MapPin size={11} className="text-purple-400 shrink-0" />
                          <span className="truncate">{enq.client.adresseDomicile}</span>
                        </div>
                      )}
                      {enq.dueDate && (
                        <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-400' : 'text-slate-400'}`}>
                          <Calendar size={11} className={isOverdue ? 'text-red-400' : 'text-slate-500'} />
                          {isOverdue && <AlertTriangle size={9} />}
                          {new Date(enq.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      )}
                      {enq.assignedAt && (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock size={11} />
                          Assignée: {new Date(enq.assignedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      )}
                    </div>
                    {isOverdue && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-400 bg-red-500/10 rounded-lg px-2 py-1">
                        <AlertTriangle size={10} />
                        <span className="font-medium">Echéance dépassée</span>
                      </div>
                    )}
                    {/* Action button */}
                    <div className="mt-2 flex justify-end">
                      {enq.statut === 'ASSIGNED' ? (
                        <button
                          onClick={() => handleStartEnquete(enq.id)}
                          disabled={startingEnquete === enq.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white text-[11px] font-bold rounded-lg transition-colors"
                        >
                          {startingEnquete === enq.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          Démarrer l'enquête
                        </button>
                      ) : enq.statut === 'IN_PROGRESS' ? (
                        <button
                          onClick={() => setEnqueteFormData(enq)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-colors"
                        >
                          <ClipboardCheck size={12} /> Remplir l'enquête
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Enquête Credit Form — agent fills investigation data */}
      {enqueteFormData && (
        <EnqueteCreditForm
          clientId={enqueteFormData.clientId}
          clientNom={enqueteFormData.client ? `${enqueteFormData.client.prenom || ''} ${enqueteFormData.client.nom || ''}`.trim() : undefined}
          initialData={{
            demandeId: enqueteFormData.demandeId,
            id: enqueteFormData.id,
            client_id: enqueteFormData.clientId,
            montant_demande: enqueteFormData.montantDemande,
            objet_credit: enqueteFormData.objetCredit,
            // Enquête fields with client profile fallback
            categorie_activite: enqueteFormData.categorieActivite,
            type_activite: enqueteFormData.typeActivite || enqueteFormData.client?.typeActivite,
            anciennete_activite: enqueteFormData.ancienneteActivite,
            revenu_mensuel: enqueteFormData.revenuMensuel || enqueteFormData.client?.revenuMensuel,
            revenus_mensuels: enqueteFormData.revenuMensuel || enqueteFormData.client?.revenuMensuel,
            revenu_journalier: enqueteFormData.revenuJournalier || enqueteFormData.client?.revenuJournalier,
            type_revenu: enqueteFormData.typeRevenu || enqueteFormData.client?.typeRevenu,
            charges_mensuelles: enqueteFormData.chargesMensuelles,
            description_activite: enqueteFormData.descriptionActivite || enqueteFormData.client?.profession,
          }}
          onClose={() => setEnqueteFormData(null)}
          onSave={handleSubmitEnquete}
        />
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
