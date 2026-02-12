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
import {
  CheckCircle, XCircle, Loader2, Search, RefreshCw,
  ChevronLeft, ChevronRight, ChevronDown,
  User, FileText, Shield,
  ArrowDownRight, ArrowUpRight,
  ClipboardList, Wallet, Users, CreditCard,
  AlertCircle,
} from 'lucide-react';
import { ConfirmDialog } from '../../ui';
import { toast } from 'sonner';
import { formatMoney, formatClientName, resolveStorageUrl } from '../../../lib/format';
import { useWebSocket } from '../../../hooks/useWebSocket';

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
    photoUrl?: string;
  };
}

type CategoryKey = 'ENGAGEMENT_FEE' | 'FEE_REFUND' | 'LOAN_DISBURSEMENT' | 'SALARY_PAYMENT' | 'ACCOUNT_ACTIVATION';

interface UnifiedDemande {
  id: string;
  source: 'payment-request' | 'loan-disbursement';
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
}

interface CaisseDemandesTabProps {
  sessionCaisseId: string;
  agenceId?: string;
  onRequestProcessed?: () => void;
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
    bgActive: 'bg-emerald-500',
    shadowActive: 'shadow-emerald-500/20',
    bgBadge: 'bg-emerald-500/20',
    textBadge: 'text-emerald-400',
    tagBg: 'bg-emerald-500/15',
    tagText: 'text-emerald-400',
    tagBorder: 'border-emerald-500/20',
  },
  FEE_REFUND: {
    label: 'Restitution de frais',
    icon: ArrowDownRight,
    bgActive: 'bg-red-500',
    shadowActive: 'shadow-red-500/20',
    bgBadge: 'bg-red-500/20',
    textBadge: 'text-red-400',
    tagBg: 'bg-red-500/15',
    tagText: 'text-red-400',
    tagBorder: 'border-red-500/20',
  },
  LOAN_DISBURSEMENT: {
    label: 'Décaissement prêts',
    icon: Wallet,
    bgActive: 'bg-orange-500',
    shadowActive: 'shadow-orange-500/20',
    bgBadge: 'bg-orange-500/20',
    textBadge: 'text-orange-400',
    tagBg: 'bg-orange-500/15',
    tagText: 'text-orange-400',
    tagBorder: 'border-orange-500/20',
  },
  SALARY_PAYMENT: {
    label: 'Paiement salaires',
    icon: Users,
    bgActive: 'bg-blue-500',
    shadowActive: 'shadow-blue-500/20',
    bgBadge: 'bg-blue-500/20',
    textBadge: 'text-blue-400',
    tagBg: 'bg-blue-500/15',
    tagText: 'text-blue-400',
    tagBorder: 'border-blue-500/20',
  },
  ACCOUNT_ACTIVATION: {
    label: 'Activation comptes',
    icon: CreditCard,
    bgActive: 'bg-purple-500',
    shadowActive: 'shadow-purple-500/20',
    bgBadge: 'bg-purple-500/20',
    textBadge: 'text-purple-400',
    tagBg: 'bg-purple-500/15',
    tagText: 'text-purple-400',
    tagBorder: 'border-purple-500/20',
  },
};

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function CaisseDemandesTab({
  sessionCaisseId,
  agenceId,
  onRequestProcessed,
}: CaisseDemandesTabProps) {
  const { socket } = useWebSocket();

  // Data
  const [paymentRequests, setPaymentRequests] = useState<CaissePaymentRequest[]>([]);
  const [pendingCredits, setPendingCredits] = useState<PendingCredit[]>([]);
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

      const [reqRes, loanRes] = await Promise.all([
        fetch(`/api/caisses/payment-requests?${params}`, { credentials: 'include' }),
        fetch('/api/credits/pending-disbursements', { credentials: 'include' }),
      ]);

      if (reqRes.ok) setPaymentRequests(await reqRes.json());
      if (loanRes.ok) {
        const data = await loanRes.json();
        setPendingCredits(data.data || []);
      }
    } catch (err) {
      console.error('[CaisseDemandesTab] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [agenceId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Listen for caisse-request-update DOM events (payment requests)
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener('caisse-request-update', handler);
    return () => window.removeEventListener('caisse-request-update', handler);
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
        photoUrl: credit.client.photoUrl,
        createdAt: credit.createdAt,
        creditData: credit,
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }, [paymentRequests, pendingCredits]);

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
      if (processTarget.source === 'payment-request' && processTarget.requestData) {
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
    } catch (err: any) {
      if (err?.error?.code === 'INSUFFICIENT_FUNDS') {
        toast.error(`Solde insuffisant. Déficit: ${formatMoney(err.error.deficit)}`, { duration: 6000 });
      } else {
        toast.error(err.message || 'Erreur lors du traitement');
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
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de l'annulation");
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
    } catch (err: any) {
      toast.error(err.message || 'Erreur décaissement groupé');
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
          <ClipboardList size={20} className="text-cyan-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-white">Demandes de Paiement</h2>
          {allItems.length > 0 && (
            <span className="bg-cyan-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {allItems.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedLoanIds.size > 0 && (
            <button
              onClick={() => setShowBatchConfirm(true)}
              className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-400 transition flex items-center gap-1.5"
            >
              <CheckCircle size={14} />
              Décaisser ({selectedLoanIds.size})
            </button>
          )}
          {activeCategory === 'LOAN_DISBURSEMENT' && pendingCredits.length > 1 && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 px-2 py-1 rounded hover:bg-slate-800">
              <input
                type="checkbox"
                checked={selectedLoanIds.size === pendingCredits.length && pendingCredits.length > 0}
                onChange={toggleSelectAllLoans}
                className="w-3.5 h-3.5 rounded border-slate-600 text-orange-500 focus:ring-0"
              />
              Tout
            </label>
          )}
          <button
            onClick={() => fetchAll()}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition"
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
              ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
              : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
          }`}
        >
          Toutes
          {categoryCounts.ALL > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeCategory === 'ALL' ? 'bg-white/20' : 'bg-cyan-500/20 text-cyan-400'
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
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              <Icon size={13} />
              {cfg.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeCategory === key
                  ? 'bg-white/20'
                  : count > 0
                  ? `${cfg.bgBadge} ${cfg.textBadge}`
                  : 'bg-slate-700/50 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search ─────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input
          type="text"
          placeholder="Rechercher par nom, description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 outline-none transition-all"
        />
      </div>

      {/* ── List ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-500" />
        </div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={24} className="text-slate-600" />
          </div>
          <p className="text-sm text-slate-500 font-medium">
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
                    ? 'bg-slate-800/80 border-orange-500/40 shadow-lg'
                    : isLoanSelected
                    ? 'bg-orange-950/20 border-orange-500/20'
                    : isIn
                    ? 'bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30'
                    : 'bg-red-500/5 border-red-500/10 hover:border-red-500/30'
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
                        className="w-3.5 h-3.5 rounded border-slate-600 text-orange-500 focus:ring-0 shrink-0 mt-1"
                      />
                    )}

                    {/* Icon / Photo */}
                    {item.photoUrl ? (
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden shrink-0">
                        <img src={resolveStorageUrl(item.photoUrl)} className="w-full h-full object-cover" alt="" />
                      </div>
                    ) : (
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isIn ? 'bg-emerald-500/15' : 'bg-red-500/15'
                      }`}>
                        {isIn
                          ? <ArrowUpRight size={16} className="text-emerald-400 sm:w-[18px] sm:h-[18px]" />
                          : <ArrowDownRight size={16} className="text-red-400 sm:w-[18px] sm:h-[18px]" />
                        }
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Top: label + amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-white truncate">{item.label}</p>
                          {item.displayName && (
                            <p className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <User size={10} className="shrink-0" />
                              <span className="truncate">{item.displayName}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm sm:text-base font-bold tabular-nums ${isIn ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isIn ? '+' : '-'}{formatMoney(item.montant)}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{timeSince(item.createdAt)}</p>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">{item.description}</p>
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
                            isIn ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {isIn ? 'Encaissement' : 'Décaissement'}
                          </span>
                        </div>

                        {/* Non-loan actions — always visible mobile */}
                        {!isLoan && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setCancelTarget(item); }}
                              disabled={!!actionLoading}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                              title="Annuler"
                            >
                              <XCircle size={14} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setProcessTarget(item); }}
                              disabled={!!actionLoading}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                isIn
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                  : 'bg-red-600 hover:bg-red-500 text-white'
                              }`}
                            >
                              {actionLoading === item.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <><CheckCircle size={12} className="inline mr-1" />Traiter</>
                              )}
                            </button>
                          </div>
                        )}

                        {/* Loan expand indicator */}
                        {isLoan && !isExpanded && (
                          <ChevronDown size={14} className="text-slate-500 shrink-0 hidden sm:block" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Loan expanded panel ─────────────── */}
                {isExpanded && item.creditData && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 animate-in slide-in-from-top-1 duration-200">
                    {/* Identity verification */}
                    <div className="flex items-start gap-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg mb-3">
                      <Shield size={14} className="text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] sm:text-xs text-orange-200/80 leading-relaxed">
                        <span className="font-bold text-orange-200">Vérifiez l'identité</span> du client avant le décaissement.
                      </p>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-950/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">Montant</p>
                        <p className="text-base sm:text-lg font-black text-white tabular-nums">
                          {formatMoney(item.montant)}
                        </p>
                      </div>
                      <div className="bg-slate-950/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider">Crédit</p>
                        <p className="text-xs font-bold text-slate-300 font-mono mt-1">
                          #{item.creditData.numeroCredit}
                        </p>
                      </div>
                    </div>

                    {/* Receipt input */}
                    <div className="mb-3">
                      <div className="relative">
                        <FileText size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          value={receiptNumbers[item.creditData.id] || ''}
                          onChange={(e) => setReceiptNumbers(prev => ({ ...prev, [item.creditData!.id]: e.target.value }))}
                          placeholder="Réf. reçu (optionnel)"
                          className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setCancelTarget(item); setCancelReason('Client non présenté'); }}
                        disabled={!!actionLoading}
                        className="flex-1 py-2 px-3 text-xs font-bold text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-500/10 transition flex items-center justify-center gap-1"
                      >
                        <XCircle size={14} />
                        Annuler
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setProcessTarget(item); }}
                        disabled={!!actionLoading}
                        className="flex-[2] py-2.5 px-3 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 rounded-lg hover:from-orange-500 hover:to-amber-500 transition flex items-center justify-center gap-1.5 shadow-lg shadow-orange-900/20"
                      >
                        {actionLoading === item.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <><CheckCircle size={14} /> Confirmer</>
                        )}
                      </button>
                    </div>
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
          <p className="text-xs text-slate-500">
            {filtered.length} demande{filtered.length > 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-slate-400 px-2">
              {currentPage}/{totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 transition-all"
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
              <p className="text-sm text-slate-300">{processTarget.label}</p>
              {processTarget.displayName && (
                <p className="text-xs text-slate-400">
                  {processTarget.source === 'loan-disbursement' ? 'Client' : 'Bénéficiaire'}:{' '}
                  <span className="text-white font-medium">{processTarget.displayName}</span>
                </p>
              )}
              <div className="bg-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Montant</span>
                  <span className={`font-bold ${processTarget.direction === 'IN' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatMoney(processTarget.montant)} FCFA
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Type</span>
                  <span className="text-white">{processCfg.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Direction</span>
                  <span className={processTarget.direction === 'IN' ? 'text-emerald-400' : 'text-red-400'}>
                    {processTarget.direction === 'IN' ? 'Encaissement' : 'Décaissement'}
                  </span>
                </div>
              </div>

              {processTarget.source === 'loan-disbursement' && processTarget.creditData && (
                <>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <Shield size={14} className="text-orange-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-orange-200/80">
                      <span className="font-bold text-orange-200">Vérifiez l'identité</span> du client avant de procéder.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1 block">Référence reçu (optionnel)</label>
                    <input
                      type="text"
                      value={receiptNumbers[processTarget.creditData.id] || ''}
                      onChange={(e) => setReceiptNumbers(prev => ({ ...prev, [processTarget.creditData!.id]: e.target.value }))}
                      placeholder="Numéro de reçu..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-orange-500 outline-none"
                    />
                  </div>
                </>
              )}

              {processTarget.source !== 'loan-disbursement' && processTarget.direction === 'OUT' && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-300">
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
              <p className="text-sm text-slate-300">
                Annuler: <span className="text-white font-medium">{cancelTarget.label}</span> — {formatMoney(cancelTarget.montant)} FCFA
              </p>
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-1 block">Motif d'annulation</label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Raison de l'annulation..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 outline-none resize-none"
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
