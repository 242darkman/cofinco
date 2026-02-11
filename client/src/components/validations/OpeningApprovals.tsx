import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, XCircle, Clock, User, Loader2, RefreshCw,
  Banknote, CreditCard, AlertTriangle,
  Search, ChevronLeft, ChevronRight, PiggyBank, Lock, Wallet,
} from 'lucide-react';
import { Card, Badge, ConfirmDialog } from '../ui';
import { toast, handleApiError } from '../../lib/toast';

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

function formatMoney(value: string | number): string {
  return Number(value).toLocaleString('fr-FR');
}

const TYPE_LABEL: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  SAVINGS: { label: 'Épargne', icon: PiggyBank, className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  CURRENT: { label: 'Courant', icon: Wallet, className: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  BLOCKED: { label: 'Bloqué', icon: Lock, className: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
};

function AccountTypeBadge({ typeCompte }: { typeCompte?: string }) {
  const config = TYPE_LABEL[typeCompte || ''] || { label: typeCompte || '—', icon: CreditCard, className: 'bg-slate-500/10 border-slate-500/20 text-slate-400' };
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
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card variant="default" padding="lg" className="border-dashed border-slate-700 bg-transparent">
        <div className="text-center py-8">
          <CheckCircle className="text-emerald-500 mx-auto mb-2" size={32} />
          <p className="text-slate-400 text-sm">Aucune demande d'ouverture en attente</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-400 uppercase flex items-center gap-2">
          <Clock size={14} />
          Ouvertures en attente
          <Badge value={String(requests.length)} size="sm" />
        </h4>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="N° compte, client, produit..."
              className="pl-8 pr-3 py-1.5 w-48 sm:w-56 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition"
            />
          </div>
          <button
            onClick={fetchPending}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Rafraîchir"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Search result count when filtering */}
      {searchQuery.trim() && (
        <p className="text-xs text-slate-500">
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''} sur {requests.length}
        </p>
      )}

      {/* Cards */}
      {paginated.length === 0 ? (
        <Card variant="default" padding="md" className="border-dashed border-slate-700 bg-transparent">
          <p className="text-center text-sm text-slate-500 py-4">
            Aucun résultat pour « {searchQuery} »
          </p>
        </Card>
      ) : (
        paginated.map((req) => {
          const fee = Number(req.openingFeeAmount);
          const deposit = Number(req.initialDepositAmount);
          const total = fee + deposit;

          return (
            <Card key={req.id} variant="default" padding="md" className="border-purple-500/20">
              <div className="space-y-4">
                {/* Top: Account + Client */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CreditCard size={16} className="text-purple-400" />
                      <span className="text-white font-mono text-sm font-semibold">
                        {req.numeroCompte || req.compteId.slice(0, 8)}
                      </span>
                    </div>
                    {req.clientNom && (
                      <p className="text-sm text-slate-300 pl-6">{req.clientNom}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <AccountTypeBadge typeCompte={req.typeCompte} />
                    {req.produitNom && (
                      <span className="text-xs text-slate-400 bg-slate-800/60 px-2 py-1 rounded-md border border-slate-700/50">
                        {req.produitNom}
                      </span>
                    )}
                  </div>
                </div>

                {/* Financial details grid */}
                <div className="grid grid-cols-3 gap-3 bg-slate-800/40 rounded-lg p-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Frais d'ouverture</p>
                    <p className="text-sm font-semibold text-red-400">
                      {fee > 0 ? `${formatMoney(fee)}` : 'Offerts'} <span className="text-[10px] text-slate-500">FCFA</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Dépôt initial</p>
                    <p className="text-sm font-semibold text-slate-200">
                      {formatMoney(deposit)} <span className="text-[10px] text-slate-500">FCFA</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Total à verser</p>
                    <p className="text-sm font-bold text-emerald-400">
                      {formatMoney(total)} <span className="text-[10px] text-slate-500">FCFA</span>
                    </p>
                  </div>
                </div>

                {/* Info notice */}
                <div className="flex items-start gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/15 rounded-lg">
                  <Banknote size={14} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-400/90">
                    Après approbation, le caissier pourra encaisser le dépôt initial de {formatMoney(total)} FCFA.
                  </p>
                </div>

                {/* Footer: Initiator + Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <User size={12} />
                    <span>
                      Initié par <span className="text-slate-300">{req.initiatorName || req.initiatedBy.slice(0, 8)}</span>
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
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <CheckCircle size={14} />
                      Approuver
                    </button>
                    <button
                      onClick={() => setRejectTarget(req)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
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
          <p className="text-xs text-slate-500">
            {(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, filtered.length)} sur {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                  page === safeCurrentPage
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition"
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
        message={
          approveTarget ? (
            <div className="space-y-3">
              <p>
                Vous allez approuver l'ouverture du compte{' '}
                <span className="font-mono text-white font-semibold">{approveTarget.numeroCompte || approveTarget.compteId.slice(0, 8)}</span>
                {approveTarget.clientNom && (
                  <> du client <span className="text-white">{approveTarget.clientNom}</span></>
                )}.
              </p>

              {/* Financial summary in dialog */}
              <div className="grid grid-cols-3 gap-2 bg-slate-800/60 rounded-lg p-3 text-center">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Frais ouverture</p>
                  <p className="text-sm font-semibold text-red-400">
                    {Number(approveTarget.openingFeeAmount) > 0
                      ? formatMoney(approveTarget.openingFeeAmount)
                      : 'Offerts'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Dépôt initial</p>
                  <p className="text-sm font-semibold text-slate-200">{formatMoney(approveTarget.initialDepositAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Total</p>
                  <p className="text-sm font-bold text-emerald-400">
                    {formatMoney(Number(approveTarget.openingFeeAmount) + Number(approveTarget.initialDepositAmount))}
                  </p>
                </div>
              </div>

              {approveTarget.produitNom && (
                <p className="text-sm text-slate-400">
                  Produit : <span className="text-white">{approveTarget.produitNom}</span>
                </p>
              )}

              <p className="text-sm text-slate-400">
                Le compte passera en statut <span className="text-cyan-400 font-medium">En attente d'activation</span>.
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
        message={
          <div className="space-y-3">
            <p>
              Le compte{' '}
              <span className="font-mono text-white">{rejectTarget?.numeroCompte || rejectTarget?.compteId.slice(0, 8)}</span>
              {' '}sera annulé et la demande rejetée.
            </p>
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">
                Cette action est irréversible. Le client devra recommencer la procédure d'ouverture.
              </p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Motif du rejet *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Raison du rejet..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white resize-none"
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
