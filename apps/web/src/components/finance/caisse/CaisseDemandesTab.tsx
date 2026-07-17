/**
 * CaisseDemandesTab — Unified payment requests queue for the caisse.
 *
 * Centralizes ALL pending demands:
 * - ENGAGEMENT_FEE: Credit application fees (IN)
 * - FEE_REFUND: Credit fee refunds (OUT)
 * - LOAN_DISBURSEMENT: Loan cash payouts (OUT)
 * - SALARY_PAYMENT: Employee salary cash payments (OUT)
 * - ACCOUNT_ACTIVATION: Opening fees + initial deposit (IN)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { CheckCircle, XCircle, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, User, FileText, Shield, Send, ArrowDownRight, ArrowUpRight, ClipboardList, Wallet, Users, CreditCard, AlertCircle } from 'lucide-react';
import { ConfirmDialog } from '../../ui';
import { toast } from 'sonner';
import { formatMoney, formatClientName, resolveStorageUrl } from '../../../lib/format';
import { caisseAgentApi } from '../../../lib/api-client';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { usePermissions } from '../../auth/ProtectedFeature';
import { formatDistance } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Avatar } from '@/components/ui/Avatar';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface CaissePaymentRequest {
  id: string;
  category: 'ENGAGEMENT_FEE' | 'FEE_REFUND' | 'SALARY_PAYMENT' | 'ACCOUNT_ACTIVATION';
  direction: 'IN' | 'OUT';
  agenceId: string;
  sourceType: string;
  sourceId: string;
  clientId?: string;
  employeeId?: string;
  montant: string;
  label: string;
  description?: string;
  metadata?: Record<string, unknown>;
  statut: string;
  createdAt: string;
  clientNom?: string;
  clientPrenom?: string;
  createdByNom?: string;
}

interface PendingCredit {
  id: string;
  numeroCredit: string;
  montant: string;
  taux: number | string;
  duree: number;
  statut: string;
  disbursementChannel: string;
  disbursementStatus: string;
  createdAt: string;
  client: {
    id: string;
    nom: string;
    prenom: string;
    photoProfile?: string;
  };
}

type CategoryKey = 'ENGAGEMENT_FEE' | 'FEE_REFUND' | 'LOAN_DISBURSEMENT' | 'SALARY_PAYMENT' | 'ACCOUNT_ACTIVATION' | 'AGENT_PROVISIONING';

interface PendingAgentSession {
  id: string;
  agentId: string;
  agentNom?: string;
  agentPrenom?: string;
  montantDemande: string;
  observations?: string;
  createdAt: string;
  glAccountNumber?: string;
}

interface UnifiedDemande {
  id: string;
  source: 'payment-request' | 'loan-disbursement' | 'agent-session';
  category: CategoryKey;
  direction: 'IN' | 'OUT';
  montant: number;
  label: string;
  description?: string;
  displayName: string;
  photoUrl?: string;
  createdAt: string;
  metadata?: Record<string, any>;
  creditData?: PendingCredit;
  requestData?: CaissePaymentRequest;
  agentSessionData?: PendingAgentSession;
}

interface CaisseDemandesTabProps {
  sessionCaisseId: string;
  caisseId: string;
  agenceId?: string;
  onRequestProcessed?: () => void;
  onTotalCountChange?: (count: number) => void;
}

// ═══════════════════════════════════════════════════════════════
// Constants — explicit Tailwind classes (no dynamic interpolation)
// ═══════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;

const CATEGORY_CONFIG: Record<CategoryKey, {
  label: string;
  icon: React.FC<any>;
  bgActive: string;
  shadowActive: string;
  bgBadge: string;
  textBadge: string;
  tagBg: string;
  tagText: string;
  tagBorder: string;
}> = {
  ENGAGEMENT_FEE: {
    label: 'Frais de dossier',
    icon: FileText,
    bgActive: 'bg-status-success',
    shadowActive: 'shadow-status-success/20',
    bgBadge: 'bg-status-success-bg',
    textBadge: 'text-status-success',
    tagBg: 'bg-status-success-bg',
    tagText: 'text-status-success',
    tagBorder: 'border-status-success/20',
  },
  FEE_REFUND: {
    label: 'Restitution de frais',
    icon: ArrowDownRight,
    bgActive: 'bg-status-danger',
    shadowActive: 'shadow-status-danger/20',
    bgBadge: 'bg-status-danger-bg',
    textBadge: 'text-status-danger',
    tagBg: 'bg-status-danger-bg',
    tagText: 'text-status-danger',
    tagBorder: 'border-status-danger/20',
  },
  LOAN_DISBURSEMENT: {
    label: 'Décaissement prêts',
    icon: Wallet,
    bgActive: 'bg-status-warning',
    shadowActive: 'shadow-status-warning/20',
    bgBadge: 'bg-status-warning-bg',
    textBadge: 'text-status-warning',
    tagBg: 'bg-status-warning-bg',
    tagText: 'text-status-warning',
    tagBorder: 'border-status-warning/20',
  },
  SALARY_PAYMENT: {
    label: 'Paiement salaires',
    icon: Users,
    bgActive: 'bg-status-info',
    shadowActive: 'shadow-status-info/20',
    bgBadge: 'bg-status-info-bg',
    textBadge: 'text-status-info',
    tagBg: 'bg-status-info-bg',
    tagText: 'text-status-info',
    tagBorder: 'border-status-info/20',
  },
  ACCOUNT_ACTIVATION: {
    label: 'Activation comptes',
    icon: CreditCard,
    bgActive: 'bg-status-info',
    shadowActive: 'shadow-status-info/20',
    bgBadge: 'bg-status-info-bg',
    textBadge: 'text-status-info',
    tagBg: 'bg-status-info/15',
    tagText: 'text-status-info',
    tagBorder: 'border-status-info/20',
  },
  AGENT_PROVISIONING: {
    label: 'Appro. Agent',
    icon: Send,
    bgActive: 'bg-accent',
    shadowActive: 'shadow-accent/20',
    bgBadge: 'bg-accent/10',
    textBadge: 'text-accent',
    tagBg: 'bg-accent/10',
    tagText: 'text-accent',
    tagBorder: 'border-accent/20',
  },
};

function timeSince(dateStr: string): string {
  return formatDistance(new Date(dateStr), new Date(), { addSuffix: true, locale: fr });
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function CaisseDemandesTab({
  sessionCaisseId,
  caisseId,
  agenceId,
  onRequestProcessed,
  onTotalCountChange,
}: CaisseDemandesTabProps) {
  const { socket } = useWebSocket();
  const { hasPermission } = usePermissions();
  const canProcess = hasPermission('caisse', 'approve') || hasPermission('caisse', 'manage');

  // Data
  const [paymentRequests, setPaymentRequests] = useState<CaissePaymentRequest[]>([]);
  const [pendingCredits, setPendingCredits] = useState<PendingCredit[]>([]);
  const [pendingAgentSessions, setPendingAgentSessions] = useState<PendingAgentSession[]>([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | 'ALL'>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [receiptNumbers, setReceiptNumbers] = useState<Record<string, string>>({});

  // Dialogs
  const [processTarget, setProcessTarget] = useState<UnifiedDemande | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UnifiedDemande | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Batch (loans only)
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (agenceId) params.set('agenceId', agenceId);
      if (caisseId) params.set('caisseId', caisseId);

      const loanParams = new URLSearchParams();
      if (caisseId) loanParams.set('caisseId', caisseId);

      const agentSessionParams = new URLSearchParams({ statut: 'REQUESTING_FUNDS' });
      if (agenceId) agentSessionParams.set('agenceId', agenceId);
      if (caisseId) agentSessionParams.set('sourceCaisseId', caisseId);

      const [reqRes, loanRes, agentRes] = await Promise.all([
        fetch(`/api/caisses/payment-requests?${params}`, { credentials: 'include' }),
        fetch(`/api/credits/pending-disbursements?${loanParams}`, { credentials: 'include' }),
        fetch(`/api/caisse-agent/sessions?${agentSessionParams}`, { credentials: 'include' }),
      ]);

      if (reqRes.ok) setPaymentRequests(await reqRes.json());
      if (loanRes.ok) {
        const data = await loanRes.json();
        setPendingCredits(data.data || []);
      }
      if (agentRes.ok) {
        const data = await agentRes.json();
        setPendingAgentSessions(data.sessions || []);
      }
    } catch {
      // fetch error handled silently
    } finally {
      setLoading(false);
    }
  }, [agenceId, caisseId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Listen for caisse-request-update DOM events (payment requests)
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener('caisse-request-update', handler);
    return () => window.removeEventListener('caisse-request-update', handler);
  }, [fetchAll]);

  // Listen for agent provisioning updates (real-time session requests)
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener('agent-provisioning-update', handler);
    return () => window.removeEventListener('agent-provisioning-update', handler);
  }, [fetchAll]);

  // Listen for loan disbursement WebSocket events
  useEffect(() => {
    if (!socket) return;
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CAISSE_UPDATE') {
          const { subtype } = data.payload || {};
          if (['NEW_LOAN_DISBURSEMENT', 'LOAN_DISBURSEMENT_COMPLETED', 'LOAN_DISBURSEMENT_CANCELLED'].includes(subtype)) {
            fetchAll();
          }
        }
      } catch { /* ignore */ }
    };
    socket.addEventListener('message', handler);
    return () => socket.removeEventListener('message', handler);
  }, [socket, fetchAll]);

  // ─── Normalize ──────────────────────────────────────────

  const allItems = useMemo((): UnifiedDemande[] => {
    const items: UnifiedDemande[] = [];

    for (const req of paymentRequests) {
      const meta = req.metadata as Record<string, any> | null;
      const clientName = [req.clientNom, req.clientPrenom].filter(Boolean).join(' ');
      const employeeName = meta?.employeNom
        ? [meta.employeNom, meta.employePrenom].filter(Boolean).join(' ')
        : undefined;

      items.push({
        id: `req-${req.id}`,
        source: 'payment-request',
        category: req.category as CategoryKey,
        direction: req.direction as 'IN' | 'OUT',
        montant: Number(req.montant),
        label: req.label,
        description: req.description,
        displayName: clientName || employeeName || '',
        createdAt: req.createdAt,
        metadata: meta || undefined,
        requestData: req,
      });
    }

    for (const credit of pendingCredits) {
      items.push({
        id: `loan-${credit.id}`,
        source: 'loan-disbursement',
        category: 'LOAN_DISBURSEMENT',
        direction: 'OUT',
        montant: parseFloat(credit.montant),
        label: `Prêt #${credit.numeroCredit}`,
        description: `Décaissement prêt — ${credit.duree} mois`,
        displayName: formatClientName(credit.client.nom, credit.client.prenom),
        photoUrl: credit.client.photoProfile,
        createdAt: credit.createdAt,
        creditData: credit,
      });
    }

    for (const session of pendingAgentSessions) {
      const agentName = [session.agentPrenom, session.agentNom].filter(Boolean).join(' ');
      items.push({
        id: `agent-session-${session.id}`,
        source: 'agent-session',
        category: 'AGENT_PROVISIONING',
        direction: 'OUT',
        montant: Number(session.montantDemande),
        label: `Appro. agent ${agentName}`.trim(),
        description: session.observations || (session.glAccountNumber ? `Compte GL: ${session.glAccountNumber}` : undefined),
        displayName: agentName || 'Agent',
        createdAt: session.createdAt,
        agentSessionData: session,
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [paymentRequests, pendingCredits, pendingAgentSessions]);

  // Notify parent of total count changes (for tab badge sync)
  useEffect(() => {
    onTotalCountChange?.(allItems.length);
  }, [allItems.length, onTotalCountChange]);

  // ─── Category counts ────────────────────────────────────

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: allItems.length };
    for (const key of Object.keys(CATEGORY_CONFIG)) {
      counts[key] = allItems.filter(item => item.category === key).length;
    }
    return counts;
  }, [allItems]);

  // ─── Filter + Search ────────────────────────────────────

  const filtered = useMemo(() => {
    let result = allItems;
    if (activeCategory !== 'ALL') {
      result = result.filter(item => item.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allItems, activeCategory, searchQuery]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [activeCategory, searchQuery]);

  // ─── Actions ────────────────────────────────────────────

  const handleProcess = async () => {
    if (!processTarget) return;
    setActionLoading(processTarget.id);
    try {
      if (processTarget.source === 'agent-session' && processTarget.agentSessionData) {
        await caisseAgentApi.dispatchFunds(processTarget.agentSessionData.id, {
          montantProvisionne: processTarget.montant,
          sourceCaisseId: caisseId,
        });
        toast.success('Fonds dispatchés', {
          description: `${processTarget.displayName} — ${formatMoney(processTarget.montant)}`,
        });
      } else if (processTarget.source === 'payment-request' && processTarget.requestData) {
        const res = await fetch(`/api/caisses/payment-requests/${processTarget.requestData.id}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionCaisseId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        toast.success('Demande traitée', {
          description: `${processTarget.label} — ${formatMoney(processTarget.montant)}`,
        });
      } else if (processTarget.source === 'loan-disbursement' && processTarget.creditData) {
        const creditId = processTarget.creditData.id;
        const receipt = receiptNumbers[creditId];
        const res = await fetch(`/api/credits/${creditId}/caisse-payout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionCaisseId, paymentReference: receipt || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Erreur');
        toast.success(data.message || 'Décaissement effectué', {
          description: `${processTarget.displayName} — ${formatMoney(processTarget.montant)}`,
        });
        setReceiptNumbers(prev => { const n = { ...prev }; delete n[creditId]; return n; });
        setExpandedLoanId(null);
      }
      setProcessTarget(null);
      fetchAll();
      onRequestProcessed?.();
    } catch (err: unknown) {
      const errObj = err as Record<string, any>;
      if (errObj?.error?.code === 'INSUFFICIENT_FUNDS') {
        toast.error(`Solde insuffisant. Déficit: ${formatMoney(errObj.error.deficit)}`, { duration: 6000 });
      } else {
        toast.error((err as Error).message || 'Erreur lors du traitement');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setActionLoading(cancelTarget.id);
    try {
      if (cancelTarget.source === 'payment-request' && cancelTarget.requestData) {
        const res = await fetch(`/api/caisses/payment-requests/${cancelTarget.requestData.id}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reason: cancelReason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
      } else if (cancelTarget.source === 'loan-disbursement' && cancelTarget.creditData) {
        const res = await fetch(`/api/credits/${cancelTarget.creditData.id}/cancel-disbursement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ raison: cancelReason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Erreur');
      }
      toast.success('Demande annulée');
      setCancelTarget(null);
      setCancelReason('');
      fetchAll();
      onRequestProcessed?.();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Erreur lors de l'annulation"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchPayout = async () => {
    if (selectedLoanIds.size === 0) return;
    setActionLoading('batch');
    try {
      const res = await fetch('/api/credits/batch-disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ creditIds: Array.from(selectedLoanIds), sessionCaisseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Erreur');
      if (data.failCount === 0) {
        toast.success(`${data.successCount} décaissement(s) effectué(s)`);
      } else {
        toast.warning(`${data.successCount} réussi(s), ${data.failCount} erreur(s)`);
      }
      setSelectedLoanIds(new Set());
      setShowBatchConfirm(false);
      fetchAll();
      onRequestProcessed?.();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Erreur décaissement groupé');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleLoanSelect = (creditId: string) => {
    setSelectedLoanIds(prev => {
      const next = new Set(prev);
      if (next.has(creditId)) next.delete(creditId);
      else next.add(creditId);
      return next;
    });
  };

  const toggleSelectAllLoans = () => {
    if (selectedLoanIds.size === pendingCredits.length) {
      setSelectedLoanIds(new Set());
    } else {
      setSelectedLoanIds(new Set(pendingCredits.map(c => c.id)));
    }
  };

  // Process dialog category config lookup
  const processCfg = processTarget ? CATEGORY_CONFIG[processTarget.category] : null;

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-accent shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-content-primary">Demandes de Paiement</h2>
          {allItems.length > 0 && (
            <span className="bg-accent-secondary text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {allItems.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedLoanIds.size > 0 && canProcess && (
            <button
              onClick={() => setShowBatchConfirm(true)}
              className="px-3 py-1.5 text-xs font-bold bg-status-warning text-white rounded-lg hover:bg-status-warning transition flex items-center gap-1.5"
            >
              <CheckCircle size={14} />
              Décaisser ({selectedLoanIds.size})
            </button>
          )}
          {activeCategory === 'LOAN_DISBURSEMENT' && pendingCredits.length > 1 && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-content-muted px-2 py-1 rounded hover:bg-surface">
              <input
                type="checkbox"
                checked={selectedLoanIds.size === pendingCredits.length && pendingCredits.length > 0}
                onChange={toggleSelectAllLoans}
                className="w-3.5 h-3.5 rounded border-edge-strong text-status-warning focus:ring-0"
              />
              Tout
            </label>
          )}
          <button
            onClick={() => fetchAll()}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-surface text-content-muted transition"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Category Filters (scrollable on mobile) ──── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        <button
          onClick={() => setActiveCategory('ALL')}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeCategory === 'ALL'
              ? 'bg-accent-secondary text-white shadow-lg shadow-accent/20'
              : 'bg-surface text-content-muted hover:text-content-primary border border-edge'
          }`}
        >
          Toutes
          {categoryCounts.ALL > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeCategory === 'ALL' ? 'bg-white/20 text-white' : 'bg-accent/10 text-accent'
            }`}>
              {categoryCounts.ALL}
            </span>
          )}
        </button>

        {(Object.keys(CATEGORY_CONFIG) as CategoryKey[]).map((key) => {
          const cfg = CATEGORY_CONFIG[key];
          const count = categoryCounts[key] || 0;
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeCategory === key
                  ? `${cfg.bgActive} text-white shadow-lg ${cfg.shadowActive}`
                  : 'bg-surface text-content-muted hover:text-content-primary border border-edge'
              }`}
            >
              <Icon size={13} />
              {cfg.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeCategory === key
                  ? 'bg-white/20 text-white'
                  : count > 0
                  ? `${cfg.bgBadge} ${cfg.textBadge}`
                  : 'bg-surface-elevated/50 text-content-muted'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search ─────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
        <input
          type="text"
          placeholder="Rechercher par nom, description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface-base border border-edge rounded-lg pl-10 pr-4 py-2.5 text-sm text-content-primary placeholder-content-muted focus:border-accent outline-none transition-all"
        />
      </div>

      {/* ── List ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="sm" tone="accent" />
        </div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={24} className="text-content-muted" />
          </div>
          <p className="text-sm text-content-muted font-medium">
            {allItems.length === 0
              ? 'Aucune demande en attente'
              : 'Aucun résultat pour cette recherche'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {paged.map((item) => {
            const cfg = CATEGORY_CONFIG[item.category];
            const isIn = item.direction === 'IN';
            const isLoan = item.source === 'loan-disbursement';
            const isExpanded = isLoan && expandedLoanId === item.creditData?.id;
            const isLoanSelected = isLoan && item.creditData && selectedLoanIds.has(item.creditData.id);

            return (
              <div
                key={item.id}
                className={`group rounded-xl border transition-all ${
                  isExpanded
                    ? 'bg-surface/80 border-status-warning/40 shadow-lg'
                    : isLoanSelected
                    ? 'bg-status-warning-bg border-status-warning/20'
                    : isIn
                    ? 'bg-status-success/5 border-status-success/10 hover:border-status-success/30'
                    : 'bg-status-danger/5 border-status-danger/10 hover:border-status-danger/30'
                }`}
              >
                <div
                  className={`p-3 ${isLoan ? 'cursor-pointer' : ''}`}
                  onClick={isLoan && item.creditData ? () => setExpandedLoanId(
                    expandedLoanId === item.creditData!.id ? null : item.creditData!.id
                  ) : undefined}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    {/* Loan checkbox */}
                    {isLoan && item.creditData && (
                      <input
                        type="checkbox"
                        checked={!!isLoanSelected}
                        onClick={(e) => { e.stopPropagation(); toggleLoanSelect(item.creditData!.id); }}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded border-edge-strong text-status-warning focus:ring-0 shrink-0 mt-1"
                      />
                    )}

                    {/* Icon / Photo */}
                    {item.photoUrl ? (
                      <div className="shrink-0">
                        <Avatar
                          photoUrl={resolveStorageUrl(item.photoUrl)}
                          fullName={item.nom}
                          size="md"
                        />
                      </div>
                    ) : (
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isIn ? 'bg-status-success-bg' : 'bg-status-danger-bg'
                      }`}>
                        {isIn
                          ? <ArrowUpRight size={16} className="text-status-success sm:w-[18px] sm:h-[18px]" />
                          : <ArrowDownRight size={16} className="text-status-danger sm:w-[18px] sm:h-[18px]" />
                        }
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Top: label + amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-content-primary truncate">{item.label}</p>
                          {item.displayName && (
                            <p className="text-[11px] sm:text-xs text-content-muted flex items-center gap-1 mt-0.5">
                              <User size={10} className="shrink-0" />
                              <span className="truncate">{item.displayName}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm sm:text-base font-bold tabular-nums ${isIn ? 'text-status-success' : 'text-status-danger'}`}>
                            {isIn ? '+' : '-'}{formatMoney(item.montant)}
                          </p>
                          <p className="text-[10px] text-content-muted mt-0.5">{timeSince(item.createdAt)}</p>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-[10px] sm:text-[11px] text-content-muted mt-1 truncate">{item.description}</p>
                      )}

                      {/* Tags + Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.tagBg} ${cfg.tagText} border ${cfg.tagBorder}`}>
                            <cfg.icon size={10} />
                            <span className="hidden xs:inline">{cfg.label}</span>
                            <span className="xs:hidden">{cfg.label.split(' ')[0]}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            isIn ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'
                          }`}>
                            {isIn ? 'Encaissement' : 'Décaissement'}
                          </span>
                        </div>

                        {/* Non-loan actions — always visible mobile */}
                        {!isLoan && canProcess && (
                          <div className="flex items-center gap-1.5">
                            {item.source !== 'agent-session' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setCancelTarget(item); }}
                                disabled={!!actionLoading}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-status-danger-bg text-content-muted hover:text-status-danger transition-all"
                                title="Rejeter la demande"
                              >
                                <XCircle size={14} className="inline mr-1" />Rejeter
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setProcessTarget(item); }}
                              disabled={!!actionLoading}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                isIn
                                  ? 'bg-status-success hover:bg-status-success text-white'
                                  : 'bg-status-danger hover:bg-status-danger text-white'
                              }`}
                            >
                              {actionLoading === item.id ? (
                                <Spinner size="xs" tone="current" />
                              ) : (
                                <><CheckCircle size={12} className="inline mr-1" />Traiter</>
                              )}
                            </button>
                          </div>
                        )}

                        {/* Loan expand indicator */}
                        {isLoan && !isExpanded && (
                          <ChevronDown size={14} className="text-content-muted shrink-0 hidden sm:block" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Loan expanded panel ─────────────── */}
                {isExpanded && item.creditData && (
                  <div className="px-3 pb-3 pt-1 border-t border-edge-subtle animate-in slide-in-from-top-1 duration-200">
                    {/* Identity verification */}
                    <div className="flex items-start gap-2 p-2 bg-status-warning-bg border border-status-warning/20 rounded-lg mb-3">
                      <Shield size={14} className="text-status-warning shrink-0 mt-0.5" />
                      <p className="text-[10px] sm:text-xs text-status-warning-text/80 leading-relaxed">
                        <span className="font-bold text-status-warning-text">Vérifiez l'identité</span> du client avant le décaissement.
                      </p>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-surface-base/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-content-muted uppercase tracking-wider">Montant</p>
                        <p className="text-base sm:text-lg font-black text-content-primary tabular-nums">
                          {formatMoney(item.montant)}
                        </p>
                      </div>
                      <div className="bg-surface-base/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-content-muted uppercase tracking-wider">Crédit</p>
                        <p className="text-xs font-bold text-content-secondary font-mono mt-1">
                          #{item.creditData.numeroCredit}
                        </p>
                      </div>
                    </div>

                    {/* Receipt input */}
                    <div className="mb-3">
                      <div className="relative">
                        <FileText size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
                        <input
                          type="text"
                          value={receiptNumbers[item.creditData.id] || ''}
                          onChange={(e) => setReceiptNumbers(prev => ({ ...prev, [item.creditData!.id]: e.target.value }))}
                          placeholder="Réf. reçu (optionnel)"
                          className="w-full pl-8 pr-3 py-2 bg-surface-base border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:border-status-warning outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    {canProcess && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setCancelTarget(item); setCancelReason('Client non présenté'); }}
                        disabled={!!actionLoading}
                        className="flex-1 py-2 px-3 text-xs font-bold text-status-danger border border-status-danger/30 rounded-lg hover:bg-status-danger/10 transition flex items-center justify-center gap-1"
                      >
                        <XCircle size={14} />
                        Rejeter
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setProcessTarget(item); }}
                        disabled={!!actionLoading}
                        className="flex-[2] py-2.5 px-3 text-xs font-bold text-white bg-linear-to-r from-status-warning to-status-warning rounded-lg hover:from-status-warning hover:to-status-warning transition flex items-center justify-center gap-1.5 shadow-lg shadow-status-warning/20"
                      >
                        {actionLoading === item.id ? (
                          <Spinner size="xs" tone="current" />
                        ) : (
                          <><CheckCircle size={14} /> Confirmer</>
                        )}
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-content-muted">
            {filtered.length} demande{filtered.length > 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-surface text-content-muted hover:text-content-primary disabled:opacity-50 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-content-muted px-2">
              {currentPage}/{totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-surface text-content-muted hover:text-content-primary disabled:opacity-50 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Process Confirm Dialog ─────────────────────── */}
      {processTarget && processCfg && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setProcessTarget(null)}
          onConfirm={handleProcess}
          title={processTarget.source === 'loan-disbursement' ? 'Confirmer le décaissement' : 'Confirmer le traitement'}
          message={
            <div className="space-y-3">
              <p className="text-sm text-content-secondary">{processTarget.label}</p>
              {processTarget.displayName && (
                <p className="text-xs text-content-muted">
                  {processTarget.source === 'loan-disbursement' ? 'Client' : 'Bénéficiaire'}:{' '}
                  <span className="text-content-primary font-medium">{processTarget.displayName}</span>
                </p>
              )}
              <div className="bg-surface rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Montant</span>
                  <span className={`font-bold ${processTarget.direction === 'IN' ? 'text-status-success' : 'text-status-danger'}`}>
                    {formatMoney(processTarget.montant)} FCFA
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Type</span>
                  <span className="text-content-primary">{processCfg.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Direction</span>
                  <span className={processTarget.direction === 'IN' ? 'text-status-success' : 'text-status-danger'}>
                    {processTarget.direction === 'IN' ? 'Encaissement' : 'Décaissement'}
                  </span>
                </div>
              </div>

              {processTarget.source === 'loan-disbursement' && processTarget.creditData && (
                <>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-status-warning-bg border border-status-warning/20">
                    <Shield size={14} className="text-status-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-status-warning-text/80">
                      <span className="font-bold text-status-warning-text">Vérifiez l'identité</span> du client avant de procéder.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-content-muted mb-1 block">Référence reçu (optionnel)</label>
                    <input
                      type="text"
                      value={receiptNumbers[processTarget.creditData.id] || ''}
                      onChange={(e) => setReceiptNumbers(prev => ({ ...prev, [processTarget.creditData!.id]: e.target.value }))}
                      placeholder="Numéro de reçu..."
                      className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-sm text-content-primary placeholder-content-muted focus:border-status-warning outline-none"
                    />
                  </div>
                </>
              )}

              {processTarget.source !== 'loan-disbursement' && processTarget.direction === 'OUT' && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-status-warning-bg border border-status-warning/20">
                  <AlertCircle size={14} className="text-status-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-status-warning">
                    Ce montant sera retiré de la caisse. Vérifiez les fonds disponibles.
                  </p>
                </div>
              )}
            </div>
          }
          confirmText={
            processTarget.source === 'loan-disbursement'
              ? 'Confirmer le décaissement'
              : processTarget.direction === 'IN'
              ? 'Encaisser'
              : 'Décaisser'
          }
          variant={processTarget.direction === 'IN' ? 'success' : processTarget.source === 'loan-disbursement' ? 'warning' : 'danger'}
          isLoading={!!actionLoading}
        />
      )}

      {/* ── Cancel Confirm Dialog ──────────────────────── */}
      {cancelTarget && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => { setCancelTarget(null); setCancelReason(''); }}
          onConfirm={handleCancel}
          title="Annuler la demande"
          message={
            <div className="space-y-3">
              <p className="text-sm text-content-secondary">
                Annuler: <span className="text-content-primary font-medium">{cancelTarget.label}</span> — {formatMoney(cancelTarget.montant)} FCFA
              </p>
              {cancelTarget.category === 'ENGAGEMENT_FEE' && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-status-info-bg border border-status-info/20">
                  <AlertCircle size={14} className="text-status-info mt-0.5 shrink-0" />
                  <p className="text-[10px] text-status-info/80">
                    En annulant, le bouton de paiement réapparaîtra dans le module Crédits. Le client pourra re-payer via Mobile Money ou espèces.
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-content-muted mb-1 block">Motif d'annulation</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Raison de l'annulation..."
                  className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-sm text-content-primary placeholder-content-muted focus:border-status-danger outline-none resize-none"
                  rows={2}
                  autoFocus
                />
              </div>
            </div>
          }
          confirmText="Annuler la demande"
          variant="danger"
          isLoading={!!actionLoading}
          disabled={cancelReason.trim().length < 3}
        />
      )}

      {/* ── Batch Payout Dialog (loans) ────────────────── */}
      {showBatchConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setShowBatchConfirm(false)}
          onConfirm={handleBatchPayout}
          title="Décaissement groupé"
          message={(() => {
            const selected = pendingCredits.filter(c => selectedLoanIds.has(c.id));
            const totalMontant = selected.reduce((sum, c) => sum + parseFloat(c.montant), 0);
            return `Décaisser ${selectedLoanIds.size} crédit(s) pour un total de ${formatMoney(totalMontant)} ?`;
          })()}
          confirmText={`Décaisser ${selectedLoanIds.size} crédit(s)`}
          variant="warning"
          isLoading={actionLoading === 'batch'}
        />
      )}
    </div>
  );
}
