import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, XCircle, Clock, User, Loader2, RefreshCw,
  Banknote, Smartphone, CreditCard, AlertTriangle, FileText,
  Search, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card, Badge, ConfirmDialog } from '../ui';
import { toast, handleApiError } from '../../lib/toast';
import { type ClosurePayoutMethodType } from '@shared/enum/status-constants';

interface ClosureRequest {
  id: string;
  compteId: string;
  initiatedBy: string;
  initiatedAt: string;
  status: string;
  reason: string;
  payoutMethod: ClosurePayoutMethodType;
  payoutAmount: string;
  payoutPhoneNumber?: string;
  balanceAtInitiation: string;
  closingFeeAmount: string;
  // Joined fields
  numeroCompte?: string;
  clientNom?: string;
  initiatorName?: string;
}

interface ClosureApprovalsProps {
  agenceId?: string;
}

const PAGE_SIZE = 10;

function formatMoney(value: string | number): string {
  return Number(value).toLocaleString('fr-FR');
}

function PayoutMethodBadge({ method, phoneNumber }: { method: ClosurePayoutMethodType; phoneNumber?: string }) {
  if (method === 'CASH') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-status-warning-bg border border-status-warning/20 text-status-warning text-xs font-medium">
        <Banknote size={14} />
        Espèces — via Caisse
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-status-info-bg border border-status-info/20 text-status-info text-xs font-medium">
      <Smartphone size={14} />
      Mobile Money{phoneNumber ? ` — ${phoneNumber}` : ''}
    </span>
  );
}

export default function ClosureApprovals({ agenceId }: ClosureApprovalsProps) {
  const [requests, setRequests] = useState<ClosureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<ClosureRequest | null>(null);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<ClosureRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    fetchPending();
  }, [agenceId]);

  // Real-time: listen for closure-update DOM events (from WS bridge or same-tab)
  useEffect(() => {
    const handleClosureUpdate = () => {
      fetchPending();
    };
    window.addEventListener('closure-update', handleClosureUpdate);
    return () => window.removeEventListener('closure-update', handleClosureUpdate);
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const url = agenceId
        ? `/api/closure-requests/pending?agenceId=${agenceId}`
        : '/api/closure-requests/pending';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement demandes');
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading closure requests:', error);
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
      (r.initiatorName || '').toLowerCase().includes(q)
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
      const res = await fetch(`/api/closure-requests/${approveTarget.id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de l\'approbation');
      }
      toast.success('Clôture approuvée et exécutée avec succès.');
      setApproveTarget(null);
      fetchPending();
      window.dispatchEvent(new CustomEvent('closure-update'));
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'approbation'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setActionLoading(cancelTarget.id);
    try {
      const res = await fetch(`/api/closure-requests/${cancelTarget.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cancelReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de l\'annulation');
      }
      toast.success('Demande de clôture annulée. Le compte est réactivé.');
      setCancelTarget(null);
      setCancelReason('');
      fetchPending();
      window.dispatchEvent(new CustomEvent('closure-update'));
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'annulation'));
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
          <p className="text-content-muted text-sm">Aucune demande de clôture en attente</p>
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
          Clôtures en attente
          <Badge value={String(requests.length)} size="sm" />
        </h4>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="N° compte, client..."
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
          const balance = Number(req.balanceAtInitiation);
          const fee = Number(req.closingFeeAmount);
          const payout = Number(req.payoutAmount);
          const isCash = req.payoutMethod === 'CASH';

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
                  <PayoutMethodBadge method={req.payoutMethod} phoneNumber={req.payoutPhoneNumber} />
                </div>

                {/* Financial details grid */}
                <div className="grid grid-cols-3 gap-3 bg-surface/40 rounded-lg p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-content-muted mb-0.5">Solde au moment</p>
                    <p className="text-sm font-semibold text-content-secondary">{formatMoney(balance)} <span className="text-[10px] text-content-muted">FCFA</span></p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-content-muted mb-0.5">Frais de clôture</p>
                    <p className={`text-sm font-semibold ${fee > 0 ? 'text-status-danger' : 'text-content-secondary'}`}>
                      {fee > 0 ? `- ${formatMoney(fee)}` : '0'} <span className="text-[10px] text-content-muted">FCFA</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-content-muted mb-0.5">Net à restituer</p>
                    <p className="text-sm font-bold text-status-success">{formatMoney(payout)} <span className="text-[10px] text-content-muted">FCFA</span></p>
                  </div>
                </div>

                {/* Cash caisse notice */}
                {isCash && payout > 0 && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-status-warning/5 border border-status-warning/15 rounded-lg">
                    <AlertTriangle size={14} className="text-status-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-status-warning/90">
                      La restitution en espèces sera traitée en caisse. Le caissier devra confirmer la remise physique des fonds.
                    </p>
                  </div>
                )}

                {/* Reason */}
                <div className="flex items-start gap-2 text-xs text-content-muted">
                  <FileText size={12} className="mt-0.5 shrink-0 text-content-muted" />
                  <span><span className="text-content-muted">Motif :</span> {req.reason}</span>
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
                      onClick={() => setCancelTarget(req)}
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
        title="Approuver la clôture"
        size="md"
        message={
          approveTarget ? (
            <div className="space-y-3">
              <p>
                Vous allez approuver la clôture du compte{' '}
                <span className="font-mono text-content-primary font-semibold">{approveTarget.numeroCompte || approveTarget.compteId.slice(0, 8)}</span>
                {approveTarget.clientNom && (
                  <> du client <span className="text-content-primary">{approveTarget.clientNom}</span></>
                )}.
              </p>

              {/* Financial summary in dialog */}
              <div className="grid grid-cols-3 gap-2 bg-surface/60 rounded-lg p-3 text-center">
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Solde</p>
                  <p className="text-sm font-semibold text-content-secondary">{formatMoney(approveTarget.balanceAtInitiation)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Frais</p>
                  <p className={`text-sm font-semibold ${Number(approveTarget.closingFeeAmount) > 0 ? 'text-status-danger' : 'text-content-secondary'}`}>
                    {Number(approveTarget.closingFeeAmount) > 0 ? `- ${formatMoney(approveTarget.closingFeeAmount)}` : '0'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Net</p>
                  <p className="text-sm font-bold text-status-success">{formatMoney(approveTarget.payoutAmount)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-content-muted">Restitution par :</span>
                <PayoutMethodBadge method={approveTarget.payoutMethod} phoneNumber={approveTarget.payoutPhoneNumber} />
              </div>

              {approveTarget.payoutMethod === 'CASH' && Number(approveTarget.payoutAmount) > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 bg-status-warning-bg border border-status-warning/20 rounded-lg">
                  <AlertTriangle size={14} className="text-status-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-status-warning">
                    La restitution en espèces devra être confirmée en caisse par le caissier.
                  </p>
                </div>
              )}

              <p className="text-status-warning text-sm flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Cette action est irréversible.
              </p>
            </div>
          ) : ''
        }
        confirmText={approveTarget?.payoutMethod === 'CASH' && Number(approveTarget?.payoutAmount) > 0
          ? "Approuver et envoyer en caisse"
          : "Approuver et exécuter"
        }
        variant="success"
        isLoading={!!actionLoading}
      />

      {/* Cancel dialog */}
      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        onConfirm={handleCancel}
        title="Rejeter la clôture"
        size="md"
        message={
          <div className="space-y-3">
            <p>
              Le compte{' '}
              <span className="font-mono text-content-primary">{cancelTarget?.numeroCompte || cancelTarget?.compteId.slice(0, 8)}</span>
              {' '}sera réactivé et la demande annulée.
            </p>
            <div>
              <label className="block text-xs text-content-muted mb-1">Motif du rejet *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
        disabled={cancelReason.trim().length < 3}
      />
    </div>
  );
}
