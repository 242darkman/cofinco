import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Wallet, ArrowRightLeft, UserPlus, RefreshCw,
  Wifi, Search, MapPin, ChevronDown, Clock, CheckCircle,
  Target, Banknote, Calendar, AlertTriangle, MessageSquare,
  ClipboardCheck, ChevronLeft, ChevronRight, User, Play, Loader2,
  ShieldCheck, Printer, ArrowDownLeft, ArrowUpRight
} from 'lucide-react';
import { agentTerrainApi, caisseAgentApi } from '../../lib/api-client';
import { authService } from '../../lib/auth';
import AgentTerrainPaiement from './AgentTerrainPaiement';
import SettlementModal from './SettlementModal';
import CloseSessionModal from './CloseSessionModal';
import { useAgentGlSession } from '../../hooks/useAgentGlSession';
import ProspectionFormModal from './ProspectionFormModal';
import AgentPlanning from './AgentPlanning';
import EnqueteCreditForm from '../finance/credits/EnqueteCreditForm';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { useIsOnline } from '@/contexts/NetworkContext';
import { getOperationStats } from '@/lib/offline-db';
import { StatutUser, StatutOperationTerrain, TYPE_OPERATION_TERRAIN_LABELS, TypeOperationTerrainType } from '@shared/enum/status-constants';
import { SystemRole, normalizeRole } from '@shared/types/roles';
import { currencySymbol } from '@shared/config/currency';
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
  currentAgenceId?: string;
}

interface Transaction {
  id: string;
  type: string;        // raw type: COLLECT_CASH, SETTLEMENT_CASH, PROVISIONING, SESSION_CLOSE
  typeLabel: string;    // display label (e.g. "Dépôt Épargne", "Remise", "Approvisionnement")
  subLabel: string;     // secondary info (client name, caisse name)
  montant: number;
  isWithdrawal: boolean;
  date: string;
  statut: string;
  reference?: string;
  rawData?: any;        // original API data for receipt generation
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
  const targetAgent = canSupervise ? allAgents.find(a => a.id === selectedAgentId) : currentAgent;
  const targetAgenceId = targetAgent?.currentAgenceId || currentUser?.agenceId;

  // GL session
  const { session: glSession, hasActiveSession: hasGlSession } = useAgentGlSession(targetAgentId);

  // Modals
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showProspectionForm, setShowProspectionForm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>();
  const [showFullPlanning, setShowFullPlanning] = useState(false);
  const [enqueteFormData, setEnqueteFormData] = useState<any>(null);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false);

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
  const isOnline = useIsOnline();
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    getOperationStats().then((stats) => setPendingCount(stats.pending)).catch(() => {});
    const interval = setInterval(() => {
      getOperationStats().then((stats) => setPendingCount(stats.pending)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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

  // Real-time: refresh balance when session is provisioned via WebSocket
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (targetAgentId && detail?.agentId === targetAgentId) {
        loadAgentData(targetAgentId);
      }
    };
    window.addEventListener('session-agent-update', handler);
    return () => window.removeEventListener('session-agent-update', handler);
  }, [targetAgentId]);

  // Real-time: refresh KPIs when objectives are auto-recalculated
  useEffect(() => {
    const handler = () => {
      if (targetAgentId) loadKPIs(targetAgentId);
    };
    window.addEventListener('agent-modules-update', handler);
    return () => window.removeEventListener('agent-modules-update', handler);
  }, [targetAgentId, loadKPIs]);

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
      const opsData = Array.isArray(ops) ? ops : ops.operations || [];
      setRecentTransactions(opsData.slice(0, 5).map((op: any) => {
        const typePaiement = op.metadata?.typePaiementClient as TypeOperationTerrainType | undefined;
        const isWithdrawal = typePaiement === 'WITHDRAWAL_CURRENT' || typePaiement === 'WITHDRAWAL_SAVINGS';
        const clientFullName = op.client ? `${op.client.prenom || ''} ${op.client.nom || ''}`.trim() : '';

        let typeLabel: string;
        let subLabel: string;

        switch (op.type) {
          case 'COLLECT_CASH':
            typeLabel = typePaiement
              ? (TYPE_OPERATION_TERRAIN_LABELS[typePaiement] || 'Collecte')
              : 'Collecte';
            subLabel = clientFullName || 'Client';
            break;
          case 'SETTLEMENT_CASH':
            typeLabel = 'Remise';
            subLabel = op.destinationCaisse?.nom || 'Caisse';
            break;
          case 'PROVISIONING':
            typeLabel = 'Approvisionnement';
            subLabel = op.sourceCaisse?.nom || 'Caisse';
            break;
          case 'SESSION_CLOSE':
            typeLabel = 'Clôture Session';
            subLabel = op.destinationCaisse?.nom || '';
            break;
          default:
            typeLabel = op.type;
            subLabel = clientFullName || '';
        }

        return {
          id: op.id,
          type: op.type,
          typeLabel,
          subLabel,
          montant: parseFloat(op.montant),
          isWithdrawal,
          date: op.submittedAt || op.createdAt,
          statut: op.statut,
          reference: op.reference,
          rawData: op,
        };
      }));
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

    // Objectifs: average progress % (current period only)
    if (fetches[0].status === 'fulfilled') {
      const allObjectifs = Array.isArray(fetches[0].value) ? fetches[0].value : [];
      const currentPeriode = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const objectifs = allObjectifs.filter((o: any) => o.periode === currentPeriode);
      if (objectifs.length > 0) {
        const totalPct = objectifs.reduce((sum: number, o: any) => {
          const target = Number(o.valeurObjectif || 1);
          const current = Number(o.valeurRealisee || 0);
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

  const handleReprintReceipt = (op: Transaction) => {
    const raw = op.rawData;
    if (!raw) return;

    const clientName = raw.client ? `${raw.client.prenom || ''} ${raw.client.nom || ''}`.trim() : '';
    const agentName = raw.agent ? `${raw.agent.prenom || ''} ${raw.agent.nom || ''}`.trim() : '';
    const montant = parseFloat(raw.montant);

    const rData: ReceiptData = {
      title: op.type === 'COLLECT_CASH' ? 'REÇU PROVISOIRE' : 'REÇU OPÉRATION',
      reference: raw.reference || op.id,
      date: new Date(raw.submittedAt || raw.createdAt),
      type: op.typeLabel,
      transaction: {
        id: raw.reference || op.id,
        date: new Date(raw.submittedAt || raw.createdAt),
        type: op.isWithdrawal ? 'RETRAIT' : 'DEPOT',
        amount: montant,
        cashierName: agentName,
      },
      ...(raw.client && {
        client: {
          nom: raw.client.nom || '',
          prenom: raw.client.prenom || '',
        },
      }),
      agent: { nom: agentName, prenom: '' },
      items: [{
        description: op.typeLabel,
        details: raw.metadata?.observations || '',
        montant,
        quantite: 1,
      }],
      total: montant,
      modePaiement: 'Espèces',
      devise: currencySymbol(),
    };

    setReceiptData(rData);
    setShowSuccessModal(true);
  };

  const formatMoney = (amount: number) => amount.toLocaleString('fr-FR');
  const formatMoneyCurrency = (amount: number) => `${amount.toLocaleString('fr-FR')} ${currencySymbol()}`;
  const formatMoneyK = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
    return amount.toString();
  };
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
      date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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
    <div className="flex flex-col h-full bg-surface-base overflow-hidden font-sans text-content-primary">

      {/* ═══ 1. TOP BAR ═══ */}
      <header className="h-12 flex-none bg-surface-base border-b border-edge flex justify-between items-center px-3">
        <div className="flex items-center gap-2">
           {isOnline ? (
             <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success-bg border border-status-success/20 text-status-success text-[10px] font-bold">
                <Wifi size={10} /> En ligne
             </div>
           ) : (
             <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-warning-bg border border-status-warning/20 text-status-warning text-[10px] font-bold">
                <Wifi size={10} /> Hors ligne {pendingCount > 0 && `(${pendingCount})`}
             </div>
           )}
           {/* POS version only shown in standalone/PWA mode (actual POS device) */}
           {window.matchMedia?.('(display-mode: standalone)')?.matches && (
             <span className="text-[10px] text-content-muted hidden sm:inline">POS v2.2</span>
           )}
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 bg-surface rounded-lg text-content-muted hover:text-content-primary transition-colors disabled:opacity-50"
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
                    className="w-full h-14 bg-surface-base border-2 border-edge rounded-2xl px-4 text-base text-content-primary flex items-center justify-between focus:border-accent outline-none cursor-pointer hover:bg-surface transition-colors"
                 >
                    <div className="flex items-center gap-3">
                       <Search className="h-4 w-4 text-content-muted" />
                       <span className="text-content-muted">Sélectionner un agent...</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-content-muted transition-transform ${agentDropdownOpen ? 'rotate-180' : ''}`} />
                 </button>

                 {agentDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface-base border-2 border-edge rounded-2xl shadow-xl z-50 overflow-hidden">
                       {/* Search Input */}
                       <div className="p-3 border-b border-edge">
                          <div className="relative">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
                             <input
                                type="text"
                                placeholder="Rechercher un agent..."
                                value={agentSearchQuery}
                                onChange={(e) => setAgentSearchQuery(e.target.value)}
                                className="w-full h-10 bg-surface border border-edge-strong rounded-xl pl-10 pr-4 text-sm text-content-primary placeholder-content-muted focus:border-accent outline-none"
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
                                   className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface transition-colors text-left border-b border-edge last:border-b-0"
                                >
                                   {agent.photo_url ? (
                                      <img src={resolveStorageUrl(agent.photo_url)} alt="" className="w-9 h-9 rounded-full object-cover border border-edge-strong" />
                                   ) : (
                                      <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs">
                                         {agent.nom.charAt(0)}{agent.prenom.charAt(0)}
                                      </div>
                                   )}
                                   <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-content-primary truncate">
                                         {agent.nom} {agent.prenom}
                                      </div>
                                      {agent.zone_affectation && (
                                         <div className="text-xs text-content-muted flex items-center gap-1 truncate">
                                            <MapPin size={10} /> {agent.zone_affectation}
                                         </div>
                                      )}
                                   </div>
                                   <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      agent.statut === StatutUser.ACTIVE
                                         ? 'bg-status-success-bg text-status-success'
                                         : 'bg-surface-subtle/30 text-content-muted'
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
                             <div className="px-4 py-8 text-center text-content-muted text-sm">
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
              <div className="bg-surface-base border border-edge rounded-2xl p-3 flex items-center justify-between relative overflow-hidden">
                 <div className="flex items-center gap-3 z-10">
                    {currentAgent?.photo_url ? (
                      <img src={resolveStorageUrl(currentAgent.photo_url)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-accent/30" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-sm text-white shrink-0">
                        {currentAgent ? `${currentAgent.nom.charAt(0)}${currentAgent.prenom.charAt(0)}` : <Users size={16} />}
                      </div>
                    )}
                    <div className="min-w-0">
                       <div className="text-[9px] text-content-muted uppercase font-bold tracking-wider">
                         {canSupervise ? 'Supervision' : 'Agent Actif'}
                       </div>
                       <div className="text-sm font-bold leading-tight truncate">
                         {currentAgent ? `${currentAgent.nom} ${currentAgent.prenom}` : '...'}
                       </div>
                    </div>
                 </div>
                 <div className="text-right z-10 shrink-0">
                    <div className="text-[9px] text-content-muted uppercase font-bold tracking-wider">Solde</div>
                    <div className="text-lg font-bold text-status-success leading-tight">
                      {loading ? '...' : formatMoney(agentSummary?.disponible || 0)}
                    </div>
                    {!loading && agentSummary && agentSummary.pendingIn > 0 && (
                      <div className="text-[10px] text-status-warning font-medium mt-0.5">
                        +{formatMoney(agentSummary.pendingIn)} FCFA en attente
                      </div>
                    )}
                    {(!agentSummary?.pendingIn || agentSummary.pendingIn === 0) && (
                      <div className="text-[9px] text-status-success font-bold">FCFA</div>
                    )}
                 </div>

                 {canSupervise && (
                   <button
                     onClick={() => setSelectedAgentId(null)}
                     className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20 text-content-primary text-xs font-bold transition-all"
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
           <div className={`grid gap-2 ${hasGlSession ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <ActionTile
                 title="COLLECTE"
                 subtitle="Tontine"
                 icon={Wallet}
                 color="emerald"
                 className={hasGlSession ? 'col-span-3' : 'col-span-2'}
                 onClick={() => setShowPaiementForm(true)}
              />
              <ActionTile
                 title="REMISE"
                 subtitle="Caisse Agence"
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
              {hasGlSession && (
                <ActionTile
                  title="CLÔTURER"
                  subtitle="Fin de journée"
                  icon={ShieldCheck}
                  color="amber"
                  onClick={() => setShowCloseSessionModal(true)}
                />
              )}
           </div>
        </div>

        {/* --- AGENDA DU JOUR (planning + enquêtes intégrées) --- */}
        {!agentDisabled && (
          <div className="px-3 pb-2">
            <div className="bg-surface-base border border-edge rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-edge flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-content-muted uppercase tracking-wider">
                  <Calendar size={11} /> Mon agenda
                </div>
                <div className="flex items-center gap-2">
                  {allAgendaItems.length > 0 && (
                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                      {allAgendaItems.length}
                    </span>
                  )}
                  <button
                    onClick={() => setShowFullPlanning(true)}
                    className="text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded transition-colors"
                  >
                    Voir Planning
                  </button>
                </div>
              </div>

              {allAgendaItems.length > 0 ? (
                <div className="divide-y divide-edge/60">
                  {paginatedAgendaItems.map((item) => {
                    if (item.type === 'enquete') {
                      const enq = item.data;
                      const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
                      const isAssigned = enq.statut === 'ASSIGNED';
                      const isStarting = startingEnquete === enq.id;
                      const borderColor =
                        enq.priority === 'URGENT' ? 'bg-status-danger' :
                        enq.priority === 'HIGH' ? 'bg-status-warning' :
                        enq.priority === 'MEDIUM' ? 'bg-status-info' :
                        'bg-surface-muted0';
                      const priorityConf: Record<string, { label: string; color: string }> = {
                        LOW: { label: 'Basse', color: 'bg-surface-subtle/35 text-content-muted' },
                        MEDIUM: { label: 'Normale', color: 'bg-status-info-bg text-status-info' },
                        HIGH: { label: 'Haute', color: 'bg-status-warning-bg text-status-warning' },
                        URGENT: { label: 'Urgente', color: 'bg-status-danger-bg text-status-danger animate-pulse' },
                      };
                      const pConf = priorityConf[enq.priority || 'MEDIUM'] || priorityConf.MEDIUM;

                      return (
                        <div
                          key={`enq-${enq.id}`}
                          className={`flex items-center gap-2.5 px-3 py-2.5 ${isOverdue ? 'bg-status-danger-bg' : ''}`}
                        >
                          <div className={`w-1 self-stretch rounded-full shrink-0 ${borderColor} ${enq.priority === 'URGENT' ? 'animate-pulse' : ''}`} />
                          <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-[10px] shrink-0">
                            {enq.client
                              ? `${(enq.client.nom || '?')[0]}${(enq.client.prenom || '')[0] || ''}`
                              : '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 mb-0.5">
                              <ClipboardCheck size={10} className="text-status-warning shrink-0" />
                              <span className="text-[10px] text-status-warning/80 font-medium">Enquête crédit</span>
                            </div>
                            <p className="text-xs font-semibold text-content-primary truncate">
                              {enq.client
                                ? `${enq.client.prenom || ''} ${enq.client.nom || ''}`.trim() || 'Client'
                                : enq.clientNom || 'Client'}
                            </p>
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                              {enq.montantDemande && (
                                <span className="text-[10px] text-status-success font-medium">
                                  {Number(enq.montantDemande).toLocaleString('fr-FR')} F
                                </span>
                              )}
                              {enq.dueDate && (
                                <span className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                                  isOverdue
                                    ? 'text-status-danger font-bold bg-status-danger-bg border border-status-danger/20'
                                    : 'text-status-warning font-medium bg-status-warning-bg border border-status-warning/20'
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
                                className="flex items-center gap-1 px-2 py-1 bg-accent-secondary hover:bg-accent-secondary-hover disabled:bg-surface-elevated text-content-primary text-[9px] font-bold rounded-lg transition-colors"
                              >
                                {isStarting ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                                Démarrer
                              </button>
                            ) : enq.statut === 'IN_PROGRESS' ? (
                              <button
                                onClick={() => setEnqueteFormData(enq)}
                                className="flex items-center gap-1 px-2 py-1 bg-status-info hover:bg-status-info text-white text-[9px] font-bold rounded-lg transition-colors"
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
                          <div className="text-[10px] font-mono font-bold text-content-muted w-10 shrink-0">
                            {p.heureDebut}
                          </div>
                          <div className={`w-1 h-6 rounded-full shrink-0 ${
                            p.typeActivite === 'Visite' ? 'bg-status-info' :
                            p.typeActivite === 'Collecte' ? 'bg-status-success' :
                            p.typeActivite === 'Prospection' ? 'bg-accent' :
                            'bg-surface-subtle'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-content-primary truncate">
                              {p.typeActivite}
                            </div>
                            {p.zone && (
                              <div className="text-[10px] text-content-muted flex items-center gap-1 truncate">
                                <MapPin size={8} /> {p.zone}
                              </div>
                            )}
                          </div>
                          <div className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            p.statut === 'COMPLETED' ? 'bg-status-success-bg text-status-success' :
                            p.statut === 'IN_PROGRESS' ? 'bg-status-info-bg text-status-info' :
                            p.statut === 'CANCELLED' ? 'bg-status-danger-bg text-status-danger' :
                            'bg-surface-elevated text-content-muted'
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
                  <Calendar size={20} className="mx-auto text-content-muted mb-1" />
                  <p className="text-[11px] text-content-muted">Aucune activite prevue aujourd'hui</p>
                  <button
                    onClick={() => setShowFullPlanning(true)}
                    className="mt-2 text-[10px] font-bold text-accent hover:text-accent transition-colors"
                  >
                    + Planifier une activite
                  </button>
                </div>
              )}

              {/* Pagination controls */}
              {totalAgendaPages > 1 && (
                <div className="px-3 py-1.5 border-t border-edge flex items-center justify-between">
                  <button
                    onClick={() => setAgendaPage(p => Math.max(0, p - 1))}
                    disabled={safeAgendaPage === 0}
                    className="p-1.5 rounded-lg disabled:opacity-20 text-content-muted hover:text-content-primary hover:bg-surface active:bg-surface-elevated transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[10px] text-content-muted font-medium tabular-nums">
                    {safeAgendaPage + 1} / {totalAgendaPages}
                  </span>
                  <button
                    onClick={() => setAgendaPage(p => Math.min(totalAgendaPages - 1, p + 1))}
                    disabled={safeAgendaPage >= totalAgendaPages - 1}
                    className="p-1.5 rounded-lg disabled:opacity-20 text-content-muted hover:text-content-primary hover:bg-surface active:bg-surface-elevated transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
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
              <div className="bg-surface-base border border-edge rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-edge">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-content-muted uppercase tracking-wider">
                    <Clock size={11} /> Recemment
                  </div>
                </div>
                <div className="divide-y divide-edge/60">
                   {recentTransactions.map(op => {
                     const indicatorColor =
                       op.type === 'COLLECT_CASH' ? (op.isWithdrawal ? 'bg-status-warning' : 'bg-status-success')
                       : op.type === 'PROVISIONING' ? 'bg-accent'
                       : op.type === 'SETTLEMENT_CASH' ? 'bg-status-info'
                       : 'bg-content-muted';
                     const DirectionIcon = op.isWithdrawal || op.type === 'SETTLEMENT_CASH' ? ArrowUpRight : ArrowDownLeft;
                     const amountColor = op.isWithdrawal || op.type === 'SETTLEMENT_CASH'
                       ? 'text-status-warning' : 'text-status-success';
                     const amountPrefix = op.isWithdrawal || op.type === 'SETTLEMENT_CASH' ? '-' : '+';

                     return (
                       <div key={op.id} className="flex items-center gap-2 px-3 py-2">
                         <div className={`w-1 h-8 rounded-full shrink-0 ${indicatorColor}`} />
                         <DirectionIcon size={14} className={`shrink-0 ${amountColor}`} />
                         <div className="min-w-0 flex-1">
                           <div className="text-xs font-semibold text-content-primary truncate">{op.typeLabel}</div>
                           <div className="text-[10px] text-content-muted truncate">{op.subLabel}</div>
                         </div>
                         <div className="text-right shrink-0">
                           <div className={`text-xs font-bold tabular-nums ${amountColor}`}>
                             {amountPrefix}{formatMoneyCurrency(op.montant)}
                           </div>
                           <div className="flex items-center justify-end gap-1 text-[10px] text-content-muted">
                             <span>{formatDateTime(op.date)}</span>
                             {op.statut === StatutOperationTerrain.APPROVED && <CheckCircle size={8} className="text-status-success" />}
                           </div>
                         </div>
                         {op.type === 'COLLECT_CASH' && (
                           <button
                             onClick={() => handleReprintReceipt(op)}
                             className="p-1.5 rounded-lg text-content-muted hover:text-accent hover:bg-surface transition-colors shrink-0"
                             title="Réimprimer reçu"
                           >
                             <Printer size={13} />
                           </button>
                         )}
                       </div>
                     );
                   })}
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
          agenceId={targetAgenceId}
          onClose={() => setShowSettlementModal(false)}
          onSuccess={handleSettlementSuccess}
        />
      )}

      {showCloseSessionModal && glSession && (
        <CloseSessionModal
          isOpen={showCloseSessionModal}
          agentId={targetAgentId || ''}
          agenceId={targetAgenceId}
          sessionId={glSession.id}
          soldeTheorique={parseFloat(agentSummary?.valide?.toString() || '0')}
          onClose={() => setShowCloseSessionModal(false)}
          onSuccess={() => {
            setShowCloseSessionModal(false);
            loadData();
          }}
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
        <div className="fixed inset-0 z-50 bg-surface-base flex flex-col">
          <header className="h-12 flex-none bg-surface-base border-b border-edge flex items-center justify-between px-3">
            <div className="flex items-center gap-2 text-content-primary font-bold text-sm">
              <Calendar size={16} className="text-accent" />
              Planning
            </div>
            <button
              onClick={() => {
                setShowFullPlanning(false);
                if (targetAgentId) loadKPIs(targetAgentId);
              }}
              className="px-3 py-1.5 bg-surface hover:bg-surface-elevated rounded-lg text-xs font-bold text-content-secondary transition-colors"
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
        <div className="fixed inset-0 z-50 bg-surface-base flex flex-col">
          <header className="h-12 flex-none bg-surface-base border-b border-edge flex items-center justify-between px-3">
            <div className="flex items-center gap-2 text-content-primary font-bold text-sm">
              <ClipboardCheck size={16} className="text-status-warning" />
              Enquêtes à effectuer
              {pendingEnquetes.length > 0 && (
                <span className="text-[10px] font-bold text-status-warning bg-status-warning-bg px-1.5 py-0.5 rounded">
                  {pendingEnquetes.length}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setShowEnquetesPanel(false);
                loadEnquetes();
              }}
              className="px-3 py-1.5 bg-surface hover:bg-surface-elevated rounded-lg text-xs font-bold text-content-secondary transition-colors"
            >
              Fermer
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {pendingEnquetes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ClipboardCheck size={40} className="text-content-secondary mb-3" />
                <p className="text-sm text-content-muted font-medium">Aucune enquête en attente</p>
                <p className="text-xs text-content-muted mt-1">Les nouvelles enquêtes assignées apparaîtront ici</p>
              </div>
            ) : (
              pendingEnquetes.map((enq: any) => {
                const isOverdue = enq.dueDate && new Date(enq.dueDate) < new Date();
                const priorityConf: Record<string, { label: string; color: string }> = {
                  LOW: { label: 'Basse', color: 'bg-surface-subtle/35 text-content-muted' },
                  MEDIUM: { label: 'Normale', color: 'bg-status-info-bg text-status-info' },
                  HIGH: { label: 'Haute', color: 'bg-status-warning-bg text-status-warning' },
                  URGENT: { label: 'Urgente', color: 'bg-status-danger-bg text-status-danger animate-pulse' },
                };
                const pConf = priorityConf[enq.priority || 'MEDIUM'] || priorityConf.MEDIUM;
                return (
                  <div
                    key={enq.id}
                    className={`bg-surface-base border rounded-xl p-3 ${isOverdue ? 'border-status-danger/40' : 'border-edge'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                          {enq.client
                            ? `${(enq.client.nom || '?')[0]}${(enq.client.prenom || '')[0] || ''}`
                            : '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-content-primary truncate">
                            {enq.client ? `${enq.client.nom || ''} ${enq.client.prenom || ''}`.trim() : 'Client'}
                          </div>
                          {enq.objetCredit && (
                            <div className="text-[11px] text-content-muted truncate">{enq.objetCredit}</div>
                          )}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${pConf.color}`}>
                        {pConf.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {enq.montantDemande && (
                        <div className="flex items-center gap-1.5 text-content-muted">
                          <Banknote size={11} className="text-status-success shrink-0" />
                          {Number(enq.montantDemande).toLocaleString('fr-FR')} FCFA
                        </div>
                      )}
                      {enq.client?.telephone && (
                        <div className="flex items-center gap-1.5 text-content-muted">
                          <User size={11} className="text-status-info shrink-0" />
                          <span className="truncate">{enq.client.telephone}</span>
                        </div>
                      )}
                      {enq.client?.adresseDomicile && (
                        <div className="flex items-center gap-1.5 text-content-muted">
                          <MapPin size={11} className="text-status-info shrink-0" />
                          <span className="truncate">{enq.client.adresseDomicile}</span>
                        </div>
                      )}
                      {enq.dueDate && (
                        <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-status-danger' : 'text-content-muted'}`}>
                          <Calendar size={11} className={isOverdue ? 'text-status-danger' : 'text-content-muted'} />
                          {isOverdue && <AlertTriangle size={9} />}
                          {new Date(enq.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      )}
                      {enq.assignedAt && (
                        <div className="flex items-center gap-1.5 text-content-muted">
                          <Clock size={11} />
                          Assignée: {new Date(enq.assignedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      )}
                    </div>
                    {isOverdue && (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-status-danger bg-status-danger-bg rounded-lg px-2 py-1">
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover disabled:bg-surface-elevated text-content-primary text-[11px] font-bold rounded-lg transition-colors"
                        >
                          {startingEnquete === enq.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          Démarrer l'enquête
                        </button>
                      ) : enq.statut === 'IN_PROGRESS' ? (
                        <button
                          onClick={() => setEnqueteFormData(enq)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-status-info hover:bg-status-info text-white text-[11px] font-bold rounded-lg transition-colors"
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
    emerald: 'bg-status-success-bg border-status-success/20 text-status-success',
    cyan: 'bg-accent/10 border-accent/20 text-accent',
    blue: 'bg-status-info-bg border-status-info/20 text-status-info',
    amber: 'bg-status-warning-bg border-status-warning/20 text-status-warning',
    red: 'bg-status-danger-bg border-status-danger/20 text-status-danger',
    purple: 'bg-status-info-bg border-status-info/20 text-status-info',
    slate: 'bg-surface border-edge text-content-muted',
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
  color: 'emerald' | 'blue' | 'purple' | 'amber';
  className?: string;
  onClick: () => void;
}

function ActionTile({ title, subtitle, icon: Icon, color, className = '', onClick }: ActionTileProps) {
  const colors = {
    emerald: 'bg-status-success hover:bg-status-success border-status-success shadow-status-success/20',
    blue: 'bg-status-info hover:bg-status-info border-status-info shadow-status-info/20',
    purple: 'bg-accent hover:bg-accent border-accent shadow-accent/20',
    amber: 'bg-status-warning hover:bg-status-warning border-status-warning shadow-status-warning/20',
  };

  const isWide = className.includes('col-span-2');

  return (
    <button
      onClick={onClick}
      className={`
        ${className} relative group overflow-hidden rounded-2xl border-t border-l border-white/20 shadow-xl
        transition-all active:scale-[0.97] text-white
        ${colors[color]}
        ${isWide ? 'py-4' : 'py-3'}
        flex flex-col items-center justify-center gap-0.5
      `}
    >
       <Icon size={isWide ? 60 : 48} className="absolute -bottom-2 -right-2 opacity-15 rotate-12 pointer-events-none" />

       <div className="relative z-10 p-2 bg-black/20 rounded-full group-hover:bg-black/10 transition-colors">
          <Icon size={isWide ? 24 : 20} />
       </div>
       <div className="relative z-10 text-center">
          <div className={`font-black tracking-tight ${isWide ? 'text-lg' : 'text-sm'}`}>{title}</div>
          <div className="text-[8px] font-medium opacity-70 uppercase tracking-wider">{subtitle}</div>
       </div>
    </button>
  );
}
