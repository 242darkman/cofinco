import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, XCircle, Clock, User, Loader2, RefreshCw,
  Banknote, CreditCard, AlertTriangle,
  Search, ChevronLeft, ChevronRight, PiggyBank, Lock, Wallet,
} from 'lucide-react';
import { Card, Badge, ConfirmDialog } from '../ui';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney } from '../../lib/format';

interface OpeningRequest {
  id: string;
  compteId: string;
  initiatedBy: string;
  initiatedAt: string;
  status: string;
  openingFeeAmount: string;
  initialDepositAmount: string;
  produitId: string | null;
  createdAt: string;
  // Joined fields
  numeroCompte?: string;
  typeCompte?: string;
  produitNom?: string;
  clientNom?: string;
  initiatorName?: string;
}

interface OpeningApprovalsProps {
  agenceId?: string;
}

const PAGE_SIZE = 10;


const TYPE_LABEL: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  SAVINGS: { label: 'Épargne', icon: PiggyBank, className: 'bg-status-success-bg border-status-success/20 text-status-success' },
  CURRENT: { label: 'Courant', icon: Wallet, className: 'bg-status-info-bg border-status-info/20 text-status-info' },
  BLOCKED: { label: 'Bloqué', icon: Lock, className: 'bg-status-warning-bg border-status-warning/20 text-status-warning' },
};

function AccountTypeBadge({ typeCompte }: { typeCompte?: string }) {
  const config = TYPE_LABEL[typeCompte || ''] || { label: typeCompte || '—', icon: CreditCard, className: 'bg-surface-subtle/30 border-edge-strong/20 text-content-muted' };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${config.className}`}>
      <Icon size={14} />
      {config.label}
    </span>
  );
}

export default function OpeningApprovals({ agenceId }: OpeningApprovalsProps) {
  const [requests, setRequests] = useState<OpeningRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<OpeningRequest | null>(null);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<OpeningRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchPending();
  }, [agenceId]);

  // Real-time: listen for opening-update DOM events (from WS bridge or same-tab)
  useEffect(() => {
    const handleOpeningUpdate = () => {
      fetchPending();
    };
    window.addEventListener('opening-update', handleOpeningUpdate);
    return () => window.removeEventListener('opening-update', handleOpeningUpdate);
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const url = agenceId
        ? `/api/opening-requests/pending?agenceId=${agenceId}`
        : '/api/opening-requests/pending';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement demandes');
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading opening requests:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtered + paginated data
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase().trim();
    return requests.filter(r =>
      (r.numeroCompte || '').toLowerCase().includes(q) ||
      (r.clientNom || '').toLowerCase().includes(q) ||
      (r.initiatorName || '').toLowerCase().includes(q) ||
      (r.produitNom || '').toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(approveTarget.id);
    try {
      const res = await fetch(`/api/opening-requests/${approveTarget.id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur lors de l'approbation");
      }
      toast.success('Ouverture de compte approuvée. Le caissier peut maintenant encaisser le dépôt initial.');
      setApproveTarget(null);
      fetchPending();
      window.dispatchEvent(new CustomEvent('opening-update'));
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'approbation"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || rejectReason.trim().length < 3) return;
    setActionLoading(rejectTarget.id);
    try {
      const res = await fetch(`/api/opening-requests/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors du rejet');
      }
      toast.success("Demande d'ouverture rejetée. Le compte a été annulé.");
      setRejectTarget(null);
      setRejectReason('');
      fetchPending();
      window.dispatchEvent(new CustomEvent('opening-update'));
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du rejet'));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card variant="default" padding="lg" className="border-dashed border-edge bg-transparent">
        <div className="text-center py-8">
          <CheckCircle className="text-status-success mx-auto mb-2" size={32} />
          <p className="text-content-muted text-sm">Aucune demande d'ouverture en attente</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-content-muted uppercase flex items-center gap-2">
          <Clock size={14} />
          Ouvertures en attente
          <Badge value={String(requests.length)} size="sm" />
        </h4>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="N° compte, client, produit..."
              className="pl-8 pr-3 py-1.5 w-48 sm:w-56 bg-surface/60 border border-edge rounded-lg text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-status-info/50 transition"
            />
          </div>
          <button
            onClick={fetchPending}
            className="p-1.5 rounded hover:bg-surface text-content-muted hover:text-content-primary transition"
            title="Rafraîchir"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Search result count when filtering */}
      {searchQuery.trim() && (
        <p className="text-xs text-content-muted">
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''} sur {requests.length}
        </p>
      )}

      {/* Cards */}
      {paginated.length === 0 ? (
        <Card variant="default" padding="md" className="border-dashed border-edge bg-transparent">
          <p className="text-center text-sm text-content-muted py-4">
            Aucun résultat pour « {searchQuery} »
          </p>
        </Card>
      ) : (
        paginated.map((req) => {
          const fee = Number(req.openingFeeAmount);
          const deposit = Number(req.initialDepositAmount);
          const total = deposit; // deposit already includes fees
          const netDeposit = deposit - fee; // amount actually credited to account

          return (
            <Card key={req.id} variant="default" padding="md" className="border-status-info/20">
              <div className="space-y-4">
                {/* Top: Account + Client */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CreditCard size={16} className="text-status-info" />
                      <span className="text-content-primary font-mono text-sm font-semibold">
                        {req.numeroCompte || req.compteId.slice(0, 8)}
                      </span>
                    </div>
                    {req.clientNom && (
                      <p className="text-sm text-content-secondary pl-6">{req.clientNom}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <AccountTypeBadge typeCompte={req.typeCompte} />
                    {req.produitNom && (
                      <span className="text-xs text-content-muted bg-surface/60 px-2 py-1 rounded-md border border-edge-subtle">
                        {req.produitNom}
                      </span>
                    )}
                  </div>
                </div>

                {/* Financial details grid */}
                <div className="grid grid-cols-3 gap-3 bg-surface/40 rounded-lg p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-content-muted mb-0.5">Frais d'ouverture</p>
                    <p className="text-sm font-semibold text-status-danger">
                      {fee > 0 ? formatMoney(fee) : 'Offerts'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-content-muted mb-0.5">Dépôt sur compte</p>
                    <p className="text-sm font-semibold text-content-secondary">
                      {formatMoney(netDeposit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-content-muted mb-0.5">Total à verser</p>
                    <p className="text-sm font-bold text-status-success">
                      {formatMoney(total)}
                    </p>
                    {fee > 0 && (
                      <p className="text-[10px] text-content-muted mt-0.5">dont {formatMoney(fee)} de frais</p>
                    )}
                  </div>
                </div>

                {/* Info notice */}
                <div className="flex items-start gap-2 px-3 py-2 bg-status-info/5 border border-status-info/15 rounded-lg">
                  <Banknote size={14} className="text-status-info mt-0.5 shrink-0" />
                  <p className="text-xs text-status-info/90">
                    Après approbation, le caissier pourra encaisser le dépôt initial de {formatMoney(total)}.
                  </p>
                </div>

                {/* Footer: Initiator + Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-edge-subtle">
                  <div className="flex items-center gap-2 text-xs text-content-muted">
                    <User size={12} />
                    <span>
                      Initié par <span className="text-content-secondary">{req.initiatorName || req.initiatedBy.slice(0, 8)}</span>
                      {' — '}
                      {new Date(req.initiatedAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApproveTarget(req)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-1.5 bg-status-success-bg hover:bg-status-success-bg text-status-success border border-status-success/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <CheckCircle size={14} />
                      Approuver
                    </button>
                    <button
                      onClick={() => setRejectTarget(req)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-1.5 bg-status-danger-bg hover:bg-status-danger-bg text-status-danger border border-status-danger/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <XCircle size={14} />
                      Rejeter
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-content-muted">
            {(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, filtered.length)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="p-1.5 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:pointer-events-none transition"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  page === safeCurrentPage
                    ? 'bg-status-info-bg text-status-info border border-status-info/30'
                    : 'text-content-muted hover:bg-surface hover:text-content-primary'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="p-1.5 rounded hover:bg-surface text-content-muted hover:text-content-primary disabled:opacity-30 disabled:pointer-events-none transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Approve dialog */}
      <ConfirmDialog
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="Approuver l'ouverture de compte"
        size="md"
        message={
          approveTarget ? (
            <div className="space-y-3">
              <p>
                Vous allez approuver l'ouverture du compte{' '}
                <span className="font-mono text-content-primary font-semibold">{approveTarget.numeroCompte || approveTarget.compteId.slice(0, 8)}</span>
                {approveTarget.clientNom && (
                  <> du client <span className="text-content-primary">{approveTarget.clientNom}</span></>
                )}.
              </p>

              {/* Financial summary in dialog */}
              <div className="grid grid-cols-3 gap-2 bg-surface/60 rounded-lg p-3 text-center">
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Frais ouverture</p>
                  <p className="text-sm font-semibold text-status-danger">
                    {Number(approveTarget.openingFeeAmount) > 0
                      ? formatMoney(approveTarget.openingFeeAmount)
                      : 'Offerts'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Dépôt sur compte</p>
                  <p className="text-sm font-semibold text-content-secondary">{formatMoney(Number(approveTarget.initialDepositAmount) - Number(approveTarget.openingFeeAmount))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Total</p>
                  <p className="text-sm font-bold text-status-success">
                    {formatMoney(approveTarget.initialDepositAmount)}
                  </p>
                  {Number(approveTarget.openingFeeAmount) > 0 && (
                    <p className="text-[10px] text-content-muted mt-0.5">dont {formatMoney(approveTarget.openingFeeAmount)} de frais</p>
                  )}
                </div>
              </div>

              {approveTarget.produitNom && (
                <p className="text-sm text-content-muted">
                  Produit : <span className="text-content-primary">{approveTarget.produitNom}</span>
                </p>
              )}

              <p className="text-sm text-content-muted">
                Le compte passera en statut <span className="text-accent font-medium">En attente d'activation</span>.
                Le caissier pourra ensuite encaisser le dépôt initial.
              </p>
            </div>
          ) : ''
        }
        confirmText="Approuver l'ouverture"
        variant="success"
        isLoading={!!actionLoading}
      />

      {/* Reject dialog */}
      <ConfirmDialog
        isOpen={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); }}
        onConfirm={handleReject}
        title="Rejeter l'ouverture de compte"
        size="md"
        message={
          <div className="space-y-3">
            <p>
              Le compte{' '}
              <span className="font-mono text-content-primary">{rejectTarget?.numeroCompte || rejectTarget?.compteId.slice(0, 8)}</span>
              {' '}sera annulé et la demande rejetée.
            </p>
            <div className="flex items-start gap-2 px-3 py-2 bg-status-danger-bg border border-status-danger/20 rounded-lg">
              <AlertTriangle size={14} className="text-status-danger mt-0.5 shrink-0" />
              <p className="text-xs text-status-danger">
                Cette action est irréversible. Le client devra recommencer la procédure d'ouverture.
              </p>
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">Motif du rejet *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Raison du rejet..."
                rows={2}
                className="w-full bg-surface-base border border-edge rounded p-2 text-sm text-content-primary resize-none"
              />
            </div>
          </div>
        }
        confirmText="Rejeter"
        variant="danger"
        isLoading={!!actionLoading}
        disabled={rejectReason.trim().length < 3}
      />
    </div>
  );
}
