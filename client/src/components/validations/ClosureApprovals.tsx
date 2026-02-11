import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, User, Loader2, RefreshCw } from 'lucide-react';
import { Card, Badge, ConfirmDialog } from '../ui';
import { toast, handleApiError } from '../../lib/toast';
import { CLOSURE_PAYOUT_METHOD_LABELS, type ClosurePayoutMethodType } from '@shared/enum/status-constants';

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

export default function ClosureApprovals({ agenceId }: ClosureApprovalsProps) {
  const [requests, setRequests] = useState<ClosureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<ClosureRequest | null>(null);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<ClosureRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    fetchPending();
  }, [agenceId]);

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
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card variant="default" padding="lg" className="border-dashed border-slate-700 bg-transparent">
        <div className="text-center py-8">
          <CheckCircle className="text-emerald-500 mx-auto mb-2" size={32} />
          <p className="text-slate-400 text-sm">Aucune demande de clôture en attente</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-400 uppercase flex items-center gap-2">
          <Clock size={14} />
          Clôtures en attente
          <Badge value={String(requests.length)} size="sm" />
        </h4>
        <button
          onClick={fetchPending}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          title="Rafraîchir"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {requests.map((req) => (
        <Card key={req.id} variant="default" padding="sm" className="border-purple-500/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-mono text-sm">{req.numeroCompte || req.compteId.slice(0, 8)}</span>
                <Badge value="Clôture" size="sm" />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <User size={12} />
                  {req.initiatorName || req.initiatedBy.slice(0, 8)}
                </span>
                <span>
                  {new Date(req.initiatedAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>
                  {CLOSURE_PAYOUT_METHOD_LABELS[req.payoutMethod]}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{req.reason}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-500">Montant</p>
                <p className="text-sm font-bold text-white">
                  {Number(req.payoutAmount).toLocaleString()} FCFA
                </p>
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
                  onClick={() => setCancelTarget(req)}
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
      ))}

      {/* Approve dialog */}
      <ConfirmDialog
        isOpen={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="Approuver la clôture"
        message={
          approveTarget ? (
            <div className="space-y-2">
              <p>
                Vous allez approuver la clôture du compte{' '}
                <span className="font-mono text-white">{approveTarget.numeroCompte || approveTarget.compteId.slice(0, 8)}</span>.
              </p>
              <p>
                Le montant de <span className="text-emerald-400 font-bold">{Number(approveTarget.payoutAmount).toLocaleString()} FCFA</span>{' '}
                sera restitué par <span className="text-white">{CLOSURE_PAYOUT_METHOD_LABELS[approveTarget.payoutMethod]}</span>.
              </p>
              <p className="text-amber-400 text-sm">Cette action est irréversible.</p>
            </div>
          ) : ''
        }
        confirmText="Approuver et exécuter"
        variant="success"
        isLoading={!!actionLoading}
      />

      {/* Cancel dialog */}
      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        onConfirm={handleCancel}
        title="Rejeter la clôture"
        message={
          <div className="space-y-3">
            <p>Le compte sera réactivé et la demande annulée.</p>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Motif du rejet *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
        disabled={cancelReason.trim().length < 3}
      />
    </div>
  );
}
