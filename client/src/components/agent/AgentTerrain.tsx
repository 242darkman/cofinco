import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Wallet, ArrowRightLeft, UserPlus, RefreshCw,
  Wifi, Search, MapPin, ChevronDown, Clock, CheckCircle,
  Target, Banknote, Calendar, AlertTriangle,
  ClipboardCheck, ChevronLeft, ChevronRight, Loader2,
  ShieldCheck, Printer, ArrowDownLeft, ArrowUpRight, Filter, X
} from 'lucide-react';
import { toast } from 'sonner';
import { agentTerrainApi, caisseAgentApi } from '../../lib/api-client';
import { authService } from '../../lib/auth';
import { useIsAdmin } from '../../contexts/AbilityContext';
import AgentTerrainPaiement from './AgentTerrainPaiement';
import SettlementModal from './SettlementModal';
import CloseSessionModal from './CloseSessionModal';
import { useAgentGlSession } from '../../hooks/useAgentGlSession';
import ProspectionFormModal from './ProspectionFormModal';
import AgentPlanning from './AgentPlanning';
import AgentAgendaSidebar from './AgentAgendaSidebar';
import { EnqueteWizard } from '../finance/credits/EnqueteWizard';
import { UniversalPaymentSuccessModal } from '../finance/caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../ui/printable/ReceiptTemplate';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
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
  photoProfile?: string;
  currentAgenceId?: string;
}

interface Transaction {
  id: string;
  type: string;
  typeLabel: string;
  subLabel: string;
  montant: number;
  isWithdrawal: boolean;
  date: string;
  statut: string;
  reference?: string;
  rawData?: any;
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

type ActiveTab = 'today' | 'history';
type TypeFilter = '' | 'COLLECT_CASH' | 'SETTLEMENT_CASH';
type StatusFilter = '' | 'SUBMITTED' | 'APPROVED' | 'PENDING_SETTLEMENT' | 'SETTLED' | 'REJECTED';

interface AgentTerrainProps {
  activeView?: string;
  agentId?: string;
  embedded?: boolean;
}

const TX_PAGE_SIZE = 15;

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

export default function AgentTerrain({ activeView, agentId: propAgentId, embedded }: AgentTerrainProps) {
  const [loading, setLoading] = useState(true);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(propAgentId || null);
  const [agentSummary, setAgentSummary] = useState<{ disponible: number; valide: number; pendingIn: number } | null>(null);

  // Operations state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [showFilters, setShowFilters] = useState(false);

  const [kpis, setKpis] = useState<KPIData>({
    objectifPct: 0, commissionsNet: 0, planningToday: 0,
    incidentsOpen: 0, messagesUnread: 0, rank: 0,
    collectesToday: 0, collectesMontant: 0,
  });
  const [todayPlannings, setTodayPlannings] = useState<PlanningEntry[]>([]);

  // Enquêtes (investigations) state
  const [pendingEnquetes, setPendingEnquetes] = useState<any[]>([]);
  const [startingEnquete, setStartingEnquete] = useState<string | null>(null);

  // Auth & Role
  const currentUser = authService.getCurrentUser();
  const isAdmin = useIsAdmin();
  const userRole = normalizeRole(currentUser?.role);
  const canSupervise = isAdmin || userRole === SystemRole.CHEF_AGENCE || userRole === SystemRole.SUPERVISEUR;

  // Target agent: supervisor uses selected agent, normal agent uses themselves
  const targetAgentId = canSupervise ? selectedAgentId : currentAgent?.id;
  const targetAgent = canSupervise ? allAgents.find(a => a.id === selectedAgentId) : currentAgent;
  const targetAgenceId = targetAgent?.currentAgenceId || currentUser?.agenceId;

  // GL session
  const { session: glSession, hasActiveSession: hasGlSession } = useAgentGlSession(targetAgentId || undefined);

  // Modals
  const [showPaiementForm, setShowPaiementForm] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showProspectionForm, setShowProspectionForm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>();
  const [showFullPlanning, setShowFullPlanning] = useState(false);
  const [enqueteFormData, setEnqueteFormData] = useState<any>(null);
  const [showCloseSessionModal, setShowCloseSessionModal] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);

  // Body scroll lock
  useEffect(() => {
    const anyOpen = showPaiementForm || showSettlementModal || showProspectionForm
      || showFullPlanning || !!enqueteFormData || showCloseSessionModal;
    document.body.classList.toggle('modal-open', anyOpen);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showPaiementForm, showSettlementModal, showProspectionForm,
      showFullPlanning, enqueteFormData, showCloseSessionModal]);

  // Sync agentId prop from parent (embedded mode)
  useEffect(() => {
    if (propAgentId !== undefined) {
      setSelectedAgentId(propAgentId || null);
    }
  }, [propAgentId]);

  // Agent dropdown search
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');

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

  const agendaItemCount = todayPlannings.length + pendingEnquetes.length;

  // ─── Data Loading ──────────────────────────────────────────────────────

  const loadKPIs = useCallback(async (agentId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const kpiState: KPIData = {
      objectifPct: 0, commissionsNet: 0, planningToday: 0,
      incidentsOpen: 0, messagesUnread: 0, rank: 0,
      collectesToday: 0, collectesMontant: 0,
    };

    const fetches = await Promise.allSettled([
      fetch(`/api/agent-objectifs?agentId=${agentId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch(`/api/agent-commissions?agentId=${agentId}&limit=5`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch(`/api/agent-planning?agentId=${agentId}&date=${today}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch(`/api/agent-incidents?agentId=${agentId}&statut=OPEN`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch(`/api/agent-communications?agentId=${agentId}&lu=false`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ]);

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

    if (fetches[1].status === 'fulfilled') {
      const comms = Array.isArray(fetches[1].value) ? fetches[1].value : [];
      kpiState.commissionsNet = comms.reduce((sum: number, c: any) => sum + Number(c.montantNet || 0), 0);
    }

    if (fetches[2].status === 'fulfilled') {
      const plans = Array.isArray(fetches[2].value) ? fetches[2].value : [];
      kpiState.planningToday = plans.length;
      setTodayPlannings(plans.slice(0, 10).map((p: any) => ({
        id: p.id,
        heureDebut: p.heureDebut || '08:00',
        heureFin: p.heureFin || '17:00',
        typeActivite: p.typeActivite || 'Visite',
        zone: p.zone || '',
        statut: p.statut || 'PLANNED',
      })));
    }

    if (fetches[3].status === 'fulfilled') {
      const incidents = Array.isArray(fetches[3].value) ? fetches[3].value : [];
      kpiState.incidentsOpen = incidents.length;
    }

    if (fetches[4].status === 'fulfilled') {
      const msgs = Array.isArray(fetches[4].value) ? fetches[4].value : [];
      kpiState.messagesUnread = msgs.length;
    }

    setKpis(kpiState);
  }, []);

  const mapOperations = useCallback((opsData: any[]): Transaction[] => {
    return opsData.map((op: any) => {
      const typePaiement = op.metadata?.typePaiementClient as TypeOperationTerrainType | undefined;
      const isWithdrawal = typePaiement === 'WITHDRAWAL_CURRENT' || typePaiement === 'WITHDRAWAL_SAVINGS';
      const clientFullName = op.client ? `${op.client.prenom || ''} ${op.client.nom || ''}`.trim() : '';

      let typeLabel: string;
      let subLabel: string;

      switch (op.type) {
        case 'COLLECT_CASH':
          typeLabel = typePaiement ? (TYPE_OPERATION_TERRAIN_LABELS[typePaiement] || 'Collecte') : 'Collecte';
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
    });
  }, []);

  const loadOperations = useCallback(async (agentId: string, append = false) => {
    setTxLoading(true);
    try {
      const offset = append ? txOffset + TX_PAGE_SIZE : 0;
      const filters: Record<string, any> = { agentId, limit: TX_PAGE_SIZE, offset };

      if (activeTab === 'today') {
        const range = getTodayRange();
        filters.dateFrom = range.dateFrom;
        filters.dateTo = range.dateTo;
      }
      if (typeFilter) filters.type = typeFilter;
      if (statusFilter) filters.statut = statusFilter;

      const ops = await caisseAgentApi.listOperations(filters);
      const opsData = Array.isArray(ops) ? ops : ops.operations || [];
      const total = Array.isArray(ops) ? opsData.length : (ops.total || opsData.length);
      const mapped = mapOperations(opsData);

      if (append) {
        setTransactions(prev => [...prev, ...mapped]);
      } else {
        setTransactions(mapped);
      }
      setTxTotal(total);
      setTxOffset(offset);
    } catch {
      toast.error('Erreur lors du chargement des opérations');
    } finally {
      setTxLoading(false);
    }
  }, [activeTab, typeFilter, statusFilter, txOffset, mapOperations]);

  const loadAgentSummary = useCallback(async (agentId: string) => {
    try {
      const summary = await caisseAgentApi.getCaisseSummary(agentId);
      setAgentSummary({
        disponible: parseFloat(summary.disponible || '0'),
        valide: parseFloat(summary.soldeValide || '0'),
        pendingIn: parseFloat(summary.pendingIn || '0')
      });
    } catch {
      toast.error('Erreur lors du chargement du résumé');
    }
  }, []);

  useEffect(() => { loadAgents(); }, []);

  // Reload when target agent changes
  useEffect(() => {
    if (targetAgentId) {
      setLoading(true);
      const agent = allAgents.find(a => a.id === targetAgentId);
      if (agent) setCurrentAgent(agent);
      Promise.all([
        loadAgentSummary(targetAgentId),
        loadOperations(targetAgentId),
        loadKPIs(targetAgentId),
      ]).finally(() => setLoading(false));
    } else if (canSupervise) {
      setLoading(false);
      setAgentSummary(null);
      setTransactions([]);
      setCurrentAgent(null);
      setTodayPlannings([]);
    }
  }, [targetAgentId]);

  // Reload operations when tab/filters change
  useEffect(() => {
    if (targetAgentId) {
      loadOperations(targetAgentId);
    }
  }, [activeTab, typeFilter, statusFilter]);

  // Real-time: refresh when session provisioned
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (targetAgentId && detail?.agentId === targetAgentId) {
        loadAgentSummary(targetAgentId);
        loadOperations(targetAgentId);
      }
    };
    window.addEventListener('session-agent-update', handler);
    return () => window.removeEventListener('session-agent-update', handler);
  }, [targetAgentId, loadAgentSummary, loadOperations]);

  // Real-time: refresh KPIs
  useEffect(() => {
    const handler = () => { if (targetAgentId) loadKPIs(targetAgentId); };
    window.addEventListener('agent-modules-update', handler);
    return () => window.removeEventListener('agent-modules-update', handler);
  }, [targetAgentId, loadKPIs]);

  const loadAgents = async () => {
    try {
      if (!canSupervise) {
        try {
          const meResponse = await agentTerrainApi.getMe();
          if (meResponse.data) {
            setCurrentAgent(meResponse.data);
            setAllAgents([meResponse.data]);
            return;
          }
        } catch {
          // Fallback to full list below
        }
      }
      const agents = await agentTerrainApi.getAllList();
      setAllAgents(agents);
      if (!canSupervise && agents.length > 0) {
        const activeAgent = agents.find((a: Agent) => a.statut === StatutUser.ACTIVE) || agents[0];
        setCurrentAgent(activeAgent);
      } else if (canSupervise) {
        setLoading(false);
      }
    } catch {
      toast.error('Erreur lors du chargement des agents');
      setLoading(false);
    }
  };

  // Enquêtes
  const loadEnquetes = useCallback(async () => {
    try {
      let url = '/api/enquetes-credit/mes-enquetes';
      if (canSupervise && selectedAgentId) {
        const agent = allAgents.find(a => a.id === selectedAgentId);
        if (agent?.userId) url += `?agentUserId=${agent.userId}`;
      }
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) {
        const result = await response.json();
        const all: any[] = Array.isArray(result.data) ? result.data : [];
        setPendingEnquetes(all.filter((e: any) => ['ASSIGNED', 'IN_PROGRESS'].includes(e.statut)));
      }
    } catch (error) {
      // Error handled silently
    }
  }, [canSupervise, selectedAgentId, allAgents]);

  useEffect(() => {
    if (canSupervise && !selectedAgentId) return;
    loadEnquetes();
  }, [loadEnquetes]);

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent).detail || {};
      if (['enquete_new', 'investigation_assigned', 'investigation_submitted', 'investigation_reviewed', 'demande_updated'].includes(payload.type)) {
        loadEnquetes();
      }
    };
    window.addEventListener('credit-update', handler);
    return () => window.removeEventListener('credit-update', handler);
  }, [loadEnquetes]);

  const loadData = () => {
    if (targetAgentId) {
      loadAgentSummary(targetAgentId);
      loadOperations(targetAgentId);
      loadKPIs(targetAgentId);
      loadEnquetes();
    }
  };

  const handlePaymentSuccess = () => { setShowPaiementForm(false); loadData(); };
  const handleSettlementSuccess = () => { setShowSettlementModal(false); loadData(); };

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
      ...(raw.client && { client: { nom: raw.client.nom || '', prenom: raw.client.prenom || '' } }),
      agent: { nom: agentName, prenom: '' },
      items: [{ description: op.typeLabel, details: raw.metadata?.observations || '', montant, quantite: 1 }],
      total: montant,
      modePaiement: 'Espèces',
      devise: currencySymbol(),
    };
    setReceiptData(rData);
    setShowSuccessModal(true);
  };

  const formatMoney = (amount: number) => amount.toLocaleString('fr-FR');
  const formatMoneyCurrency = (amount: number) => `${amount.toLocaleString('fr-FR')} ${currencySymbol()}`;
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
      date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const formatTimeOnly = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const handleStartEnquete = useCallback(async (enqueteId: string) => {
    setStartingEnquete(enqueteId);
    try {
      const response = await fetch(`/api/enquetes-credit/${enqueteId}/demarrer`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) loadEnquetes();
    } finally { setStartingEnquete(null); }
  }, [loadEnquetes]);

  const handleSubmitEnquete = useCallback(async (payload: any) => {
    if (!enqueteFormData?.id) return;
    const response = await fetch(`/api/enquetes-credit/${enqueteFormData.id}/soumettre`, {
      method: 'PATCH', credentials: 'include',
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
  const hasMore = transactions.length < txTotal;

  // ─── RENDER ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-surface-base overflow-hidden font-sans text-content-primary">

      {/* ═══ 1. STICKY HEADER (compact: status + agent + solde) ═══ */}
      <header className="flex-none bg-surface-base border-b border-edge z-10">
        {/* Top bar */}
        <div className="h-10 flex justify-between items-center px-3">
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
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-1.5 bg-surface rounded-lg text-content-muted hover:text-content-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Agent card (compact) or agent selector — hidden in embedded mode (parent controls selection) */}
        {!embedded && (
          <div className="px-3 pb-2">
            {(canSupervise && !selectedAgentId) ? (
              <AgentSelector
                agents={allAgents}
                open={agentDropdownOpen}
                searchQuery={agentSearchQuery}
                onToggle={() => setAgentDropdownOpen(!agentDropdownOpen)}
                onSelect={(id) => { setSelectedAgentId(id); setAgentDropdownOpen(false); setAgentSearchQuery(''); }}
                onSearchChange={setAgentSearchQuery}
                onClose={() => { setAgentDropdownOpen(false); setAgentSearchQuery(''); }}
              />
            ) : (
              <div className="flex items-center justify-between gap-3 relative">
                <div className="flex items-center gap-2.5 min-w-0">
                  {currentAgent?.photoProfile ? (
                    <img src={resolveStorageUrl(currentAgent.photoProfile)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border-2 border-accent/30" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-bold text-xs text-white shrink-0">
                      {currentAgent ? `${currentAgent.nom.charAt(0)}${currentAgent.prenom.charAt(0)}` : <Users size={14} />}
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
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-status-success leading-tight tabular-nums">
                    {loading ? '...' : formatMoney(agentSummary?.disponible || 0)}
                  </div>
                  {!loading && agentSummary && agentSummary.pendingIn > 0 ? (
                    <div className="text-[10px] text-status-warning font-medium">
                      +{formatMoney(agentSummary.pendingIn)} en attente
                    </div>
                  ) : (
                    <div className="text-[9px] text-status-success font-bold">{currencySymbol()}</div>
                  )}
                </div>
                {canSupervise && (
                  <button
                    onClick={() => setSelectedAgentId(null)}
                    className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20 text-content-primary text-xs font-bold transition-all rounded-lg"
                  >
                    Changer d'agent
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ 2. TAB BAR (sticky) ═══ */}
        {!agentDisabled && (
          <div className="px-3 pb-2 flex items-center gap-2">
            <div className="flex gap-1 bg-surface rounded-lg p-0.5 flex-1">
              <button
                onClick={() => { setActiveTab('today'); setTypeFilter(''); setStatusFilter(''); }}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  activeTab === 'today'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Aujourd'hui
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  activeTab === 'history'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                Historique
              </button>
            </div>
            {activeTab === 'history' && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-lg border transition-colors ${
                  showFilters || typeFilter || statusFilter
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-surface border-edge text-content-muted hover:text-content-primary'
                }`}
              >
                <Filter size={14} />
              </button>
            )}
          </div>
        )}

        {/* Filter bar (history only) */}
        {!agentDisabled && activeTab === 'history' && showFilters && (
          <div className="px-3 pb-2 flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="text-[11px] px-2 py-1 rounded-lg bg-surface border border-edge text-content-primary"
            >
              <option value="">Tous types</option>
              <option value="COLLECT_CASH">Collectes</option>
              <option value="SETTLEMENT_CASH">Remises</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-[11px] px-2 py-1 rounded-lg bg-surface border border-edge text-content-primary"
            >
              <option value="">Tous statuts</option>
              <option value="SUBMITTED">En attente</option>
              <option value="APPROVED">Approuvé</option>
              <option value="PENDING_SETTLEMENT">En cours</option>
              <option value="SETTLED">Apuré</option>
              <option value="REJECTED">Rejeté</option>
            </select>
            {(typeFilter || statusFilter) && (
              <button
                onClick={() => { setTypeFilter(''); setStatusFilter(''); }}
                className="text-[11px] px-2 py-1 rounded-lg bg-status-danger-bg text-status-danger font-bold flex items-center gap-1"
              >
                <X size={10} /> Réinitialiser
              </button>
            )}
          </div>
        )}
      </header>

      {/* ═══ 3. MAIN CONTENT: flex row with operations + desktop sidebar ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* Operations list (scrollable) */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-24 lg:pb-4">
          {agentDisabled ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <Users size={40} className="text-content-muted mb-3" />
              <p className="text-sm text-content-muted font-medium">Sélectionnez un agent pour commencer</p>
            </div>
          ) : transactions.length === 0 && !txLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Clock size={32} className="text-content-muted mb-2" />
              <p className="text-sm text-content-muted font-medium">
                {activeTab === 'today' ? 'Aucune opération aujourd\'hui' : 'Aucune opération trouvée'}
              </p>
              <p className="text-xs text-content-muted mt-1">
                {activeTab === 'today' ? 'Les nouvelles opérations apparaîtront ici' : 'Essayez de modifier les filtres'}
              </p>
            </div>
          ) : (
            <>
              {/* Operations count header */}
              <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-surface-base/95 backdrop-blur-sm z-[5]">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-content-muted uppercase tracking-wider">
                  <Clock size={11} />
                  {activeTab === 'today' ? "Opérations du jour" : "Historique complet"}
                </div>
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded tabular-nums">
                  {txTotal > 0 ? txTotal : transactions.length}
                </span>
              </div>

              {/* Transaction list */}
              <div className="divide-y divide-edge/60">
                {transactions.map(op => (
                  <TransactionRow
                    key={op.id}
                    op={op}
                    showDate={activeTab === 'history'}
                    formatMoneyCurrency={formatMoneyCurrency}
                    formatDateTime={formatDateTime}
                    formatTimeOnly={formatTimeOnly}
                    onReprint={handleReprintReceipt}
                  />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="px-3 py-4 flex justify-center">
                  <button
                    onClick={() => targetAgentId && loadOperations(targetAgentId, true)}
                    disabled={txLoading}
                    className="px-4 py-2 rounded-lg bg-surface border border-edge text-xs font-bold text-content-secondary hover:bg-surface-elevated transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {txLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                    Charger plus
                  </button>
                </div>
              )}

              {txLoading && transactions.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-accent" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Desktop sidebar: Agenda (lg+ only) */}
        <div className="hidden lg:flex lg:flex-col lg:w-[280px] lg:border-l lg:border-edge lg:bg-surface-base p-2">
          <AgentAgendaSidebar
            plannings={todayPlannings}
            enquetes={pendingEnquetes}
            onStartEnquete={handleStartEnquete}
            onFillEnquete={setEnqueteFormData}
            onViewFullPlanning={() => setShowFullPlanning(true)}
            startingEnquete={startingEnquete}
          />
        </div>
      </div>

      {/* ═══ 4. FIXED BOTTOM ACTION BAR (mobile + tablet) ═══ */}
      {!agentDisabled && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-base/95 backdrop-blur-md border-t border-edge pb-[env(safe-area-inset-bottom)]">
          <div className={`grid gap-2 p-2 ${hasGlSession ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <ActionButton
              icon={Wallet}
              label="Collecte"
              color="bg-status-success"
              onClick={() => setShowPaiementForm(true)}
            />
            <ActionButton
              icon={ArrowRightLeft}
              label="Remise"
              color="bg-status-info"
              onClick={() => setShowSettlementModal(true)}
            />
            <ActionButton
              icon={UserPlus}
              label="Prospect"
              color="bg-accent"
              onClick={() => setShowProspectionForm(true)}
            />
            {hasGlSession && (
              <ActionButton
                icon={ShieldCheck}
                label="Clôturer"
                color="bg-status-warning"
                onClick={() => setShowCloseSessionModal(true)}
              />
            )}
          </div>
        </div>
      )}

      {/* Desktop inline action bar */}
      {!agentDisabled && (
        <div className="hidden lg:flex gap-2 px-3 py-2 border-t border-edge bg-surface-base shrink-0">
          <ActionTile title="COLLECTE" subtitle="Tontine" icon={Wallet} color="emerald" className="flex-1" onClick={() => setShowPaiementForm(true)} />
          <ActionTile title="REMISE" subtitle="Caisse Agence" icon={ArrowRightLeft} color="blue" className="flex-1" onClick={() => setShowSettlementModal(true)} />
          <ActionTile title="PROSPECT" subtitle="Nouveau Client" icon={UserPlus} color="purple" className="flex-1" onClick={() => setShowProspectionForm(true)} />
          {hasGlSession && (
            <ActionTile title="CLÔTURER" subtitle="Fin de journée" icon={ShieldCheck} color="amber" className="flex-1" onClick={() => setShowCloseSessionModal(true)} />
          )}
        </div>
      )}

      {/* ═══ 5. FLOATING AGENDA PILL (mobile only) ═══ */}
      {!agentDisabled && (
        <button
          onClick={() => setAgendaOpen(true)}
          className="lg:hidden fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-accent text-white shadow-lg shadow-accent/30 text-xs font-bold active:scale-95 transition-transform"
        >
          <Calendar size={14} />
          Agenda
          {agendaItemCount > 0 && (
            <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {agendaItemCount}
            </span>
          )}
        </button>
      )}

      {/* ═══ AGENDA BOTTOM SHEET (mobile) ═══ */}
      <Sheet open={agendaOpen} onOpenChange={setAgendaOpen}>
        <SheetContent side="bottom" className="h-[70vh] bg-surface-base rounded-t-2xl flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="text-sm font-bold text-content-primary flex items-center gap-2">
              <Calendar size={14} className="text-accent" />
              Agenda du jour
              {agendaItemCount > 0 && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {agendaItemCount}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden p-3 pt-2">
            <AgentAgendaSidebar
              plannings={todayPlannings}
              enquetes={pendingEnquetes}
              onStartEnquete={handleStartEnquete}
              onFillEnquete={(enq) => { setEnqueteFormData(enq); setAgendaOpen(false); }}
              onViewFullPlanning={() => { setShowFullPlanning(true); setAgendaOpen(false); }}
              startingEnquete={startingEnquete}
            />
          </div>
        </SheetContent>
      </Sheet>

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
          onSuccess={() => { setShowCloseSessionModal(false); loadData(); }}
        />
      )}

      <ProspectionFormModal
        isOpen={showProspectionForm}
        agentId={targetAgentId || ''}
        onClose={() => setShowProspectionForm(false)}
        onSuccess={() => { setShowProspectionForm(false); loadData(); }}
      />

      <UniversalPaymentSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        term="Fermer"
        data={receiptData}
      />

      {/* Full Planning Overlay */}
      {showFullPlanning && (
        <div className="fixed inset-0 z-50 bg-surface-base flex flex-col">
          <header className="h-12 flex-none bg-surface-base border-b border-edge flex items-center justify-between px-3">
            <div className="flex items-center gap-2 text-content-primary font-bold text-sm">
              <Calendar size={16} className="text-accent" /> Planning
            </div>
            <button
              onClick={() => { setShowFullPlanning(false); if (targetAgentId) loadKPIs(targetAgentId); }}
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

      {/* Enquête Wizard */}
      {enqueteFormData && (
        <EnqueteWizard
          clientId={enqueteFormData.clientId}
          clientNom={enqueteFormData.client ? `${enqueteFormData.client.prenom || ''} ${enqueteFormData.client.nom || ''}`.trim() : undefined}
          initialData={{
            demandeId: enqueteFormData.demandeId,
            id: enqueteFormData.id,
            clientId: enqueteFormData.clientId,
            montantDemande: enqueteFormData.montantDemande,
            objetCredit: enqueteFormData.objetCredit,
            categorieActivite: enqueteFormData.categorieActivite,
            typeActivite: enqueteFormData.typeActivite || enqueteFormData.client?.typeActivite,
            ancienneteActivite: enqueteFormData.ancienneteActivite,
            revenuMensuel: enqueteFormData.revenuMensuel || enqueteFormData.client?.revenuMensuel,
            revenuJournalier: enqueteFormData.revenuJournalier || enqueteFormData.client?.revenuJournalier,
            typeRevenu: enqueteFormData.typeRevenu || enqueteFormData.client?.typeRevenu,
            chargesMensuelles: enqueteFormData.chargesMensuelles,
            descriptionActivite: enqueteFormData.descriptionActivite || enqueteFormData.client?.profession,
            creditPlan: enqueteFormData.creditPlan || null,
            clientSituation: enqueteFormData.clientSituation || null,
            situationMatrimoniale: enqueteFormData.situationMatrimoniale,
            personnesCharge: enqueteFormData.personnesCharge,
            typeHabitation: enqueteFormData.typeHabitation,
            garantiesProposees: enqueteFormData.garantiesProposees,
            autresCredits: enqueteFormData.autresCredits,
            photosActivite: enqueteFormData.photosActivite,
            photosGeotagged: enqueteFormData.photosGeotagged,
            documentsJustificatifs: enqueteFormData.documentsJustificatifs,
            agentRecommendation: enqueteFormData.agentRecommendation,
            recommendedAmount: enqueteFormData.recommendedAmount,
            riskLevel: enqueteFormData.riskLevel,
            riskFactors: enqueteFormData.riskFactors,
            observations: enqueteFormData.observations,
            geoLatitude: enqueteFormData.geoLatitude,
            geoLongitude: enqueteFormData.geoLongitude,
            geoAccuracy: enqueteFormData.geoAccuracy,
            geoTimestamp: enqueteFormData.geoTimestamp,
            client: enqueteFormData.client,
          }}
          onClose={() => setEnqueteFormData(null)}
          onSave={handleSubmitEnquete}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION ROW
// ═══════════════════════════════════════════════════════════════════════════

function TransactionRow({ op, showDate, formatMoneyCurrency, formatDateTime, formatTimeOnly, onReprint }: {
  op: Transaction;
  showDate: boolean;
  formatMoneyCurrency: (n: number) => string;
  formatDateTime: (s: string) => string;
  formatTimeOnly: (s: string) => string;
  onReprint: (op: Transaction) => void;
}) {
  const indicatorColor =
    op.type === 'COLLECT_CASH' ? (op.isWithdrawal ? 'bg-status-warning' : 'bg-status-success')
    : op.type === 'PROVISIONING' ? 'bg-accent'
    : op.type === 'SETTLEMENT_CASH' ? 'bg-status-info'
    : 'bg-content-muted';
  const DirectionIcon = op.isWithdrawal || op.type === 'SETTLEMENT_CASH' ? ArrowUpRight : ArrowDownLeft;
  const amountColor = op.isWithdrawal || op.type === 'SETTLEMENT_CASH' ? 'text-status-warning' : 'text-status-success';
  const amountPrefix = op.isWithdrawal || op.type === 'SETTLEMENT_CASH' ? '-' : '+';

  const statusBadge = op.statut === StatutOperationTerrain.APPROVED ? (
    <CheckCircle size={8} className="text-status-success" />
  ) : op.statut === 'SETTLED' ? (
    <CheckCircle size={8} className="text-accent" />
  ) : op.statut === 'REJECTED' ? (
    <X size={8} className="text-status-danger" />
  ) : op.statut === 'SUBMITTED' ? (
    <Clock size={8} className="text-status-warning" />
  ) : null;

  return (
    <div className="flex items-center gap-2 px-3 py-3">
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
          <span>{showDate ? formatDateTime(op.date) : formatTimeOnly(op.date)}</span>
          {statusBadge}
        </div>
      </div>
      {op.type === 'COLLECT_CASH' && (
        <button
          onClick={() => onReprint(op)}
          className="p-1.5 rounded-lg text-content-muted hover:text-accent hover:bg-surface transition-colors shrink-0"
          title="Réimprimer reçu"
        >
          <Printer size={13} />
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT SELECTOR (supervisor dropdown)
// ═══════════════════════════════════════════════════════════════════════════

function AgentSelector({ agents, open, searchQuery, onToggle, onSelect, onSearchChange, onClose }: {
  agents: Agent[];
  open: boolean;
  searchQuery: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onSearchChange: (q: string) => void;
  onClose: () => void;
}) {
  const filtered = agents.filter(agent => {
    const query = searchQuery.toLowerCase();
    return agent.nom.toLowerCase().includes(query) || agent.prenom.toLowerCase().includes(query) || (agent.zone_affectation || '').toLowerCase().includes(query);
  });

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="w-full h-12 bg-surface-base border-2 border-edge rounded-xl px-4 text-sm text-content-primary flex items-center justify-between focus:border-accent outline-none cursor-pointer hover:bg-surface transition-colors"
      >
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 text-content-muted" />
          <span className="text-content-muted">Sélectionner un agent...</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-content-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface-base border-2 border-edge rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-edge">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                type="text"
                placeholder="Rechercher un agent..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full h-10 bg-surface border border-edge-strong rounded-xl pl-10 pr-4 text-sm text-content-primary placeholder-content-muted focus:border-accent outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map(agent => (
              <button
                key={agent.id}
                onClick={() => onSelect(agent.id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface transition-colors text-left border-b border-edge last:border-b-0"
              >
                {agent.photoProfile ? (
                  <img src={resolveStorageUrl(agent.photoProfile)} alt="" className="w-9 h-9 rounded-full object-cover border border-edge-strong" />
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
                  agent.statut === StatutUser.ACTIVE ? 'bg-status-success-bg text-status-success' : 'bg-surface-subtle/30 text-content-muted'
                }`}>
                  {agent.statut === StatutUser.ACTIVE ? 'Actif' : 'Inactif'}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-content-muted text-sm">Aucun agent trouvé</div>
            )}
          </div>
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BUTTON (mobile bottom bar)
// ═══════════════════════════════════════════════════════════════════════════

function ActionButton({ icon: Icon, label, color, onClick }: {
  icon: React.ElementType;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`${color} text-white rounded-xl py-2.5 flex flex-col items-center gap-0.5 active:scale-95 transition-transform shadow-md`}
    >
      <Icon size={18} />
      <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TILE (desktop inline bar)
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

  return (
    <button
      onClick={onClick}
      className={`${className} relative overflow-hidden rounded-xl border-t border-l border-white/20 shadow-lg transition-all active:scale-[0.97] text-white ${colors[color]} h-12 px-3 flex items-center gap-2.5`}
    >
      <div className="p-1 bg-black/20 rounded-lg shrink-0">
        <Icon size={16} />
      </div>
      <div className="text-left min-w-0">
        <div className="text-xs font-black tracking-tight leading-tight">{title}</div>
        <div className="text-[8px] font-medium opacity-70 uppercase tracking-wider">{subtitle}</div>
      </div>
    </button>
  );
}
