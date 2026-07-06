/**
 * Panel d'approbation des écarts de caisse pour les superviseurs
 * Affiche les demandes en attente et permet d'approuver/rejeter
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  User,
  MessageSquare,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoney } from '../../../lib/format';

interface EcartApprovalRequest {
  id: string;
  sessionId: string;
  caissierId: string;
  soldeTheorique: string;
  montantPhysique: string;
  ecart: string;
  typeEcart: 'SURPLUS' | 'DEFICIT';
  justification: string;
  niveauRequis: 'N1' | 'N2';
  statut: string;
  createdAt: string;
  caissierNom?: string;
  caissierPrenom?: string;
}

interface EcartApprovalPanelProps {
  agenceId: string;
  onApprovalComplete?: () => void;
}

export default function EcartApprovalPanel({ agenceId, onApprovalComplete }: EcartApprovalPanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<EcartApprovalRequest | null>(null);
  const [comment, setComment] = useState('');
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);

  // Récupérer les demandes en attente
  const { data: requests, isLoading, refetch } = useQuery<EcartApprovalRequest[]>({
    queryKey: ['ecart-approvals', agenceId],
    queryFn: async () => {
      const res = await fetch(`/api/caisses/ecart-approvals?agenceId=${agenceId}&statut=PENDING_APPROVAL`);
      if (!res.ok) throw new Error('Erreur récupération demandes');
      return res.json();
    },
    refetchInterval: 30000, // Refresh toutes les 30s
  });

  // Mutation pour approuver/rejeter
  const decisionMutation = useMutation({
    mutationFn: async ({ requestId, decision, comment }: { requestId: string; decision: 'APPROVED' | 'REJECTED'; comment?: string }) => {
      const res = await fetch(`/api/caisses/ecart-approvals/${requestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors du traitement');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecart-approvals'] });
      setShowDecisionModal(false);
      setSelectedRequest(null);
      setComment('');
      setPendingDecision(null);
      onApprovalComplete?.();
    },
  });

  const handleDecision = (request: EcartApprovalRequest, decision: 'APPROVED' | 'REJECTED') => {
    setSelectedRequest(request);
    setPendingDecision(decision);
    setShowDecisionModal(true);
  };

  const confirmDecision = () => {
    if (!selectedRequest || !pendingDecision) return;
    decisionMutation.mutate({
      requestId: selectedRequest.id,
      decision: pendingDecision,
      comment: comment || undefined,
    });
  };

  if (isLoading) {
    return (
      <Card className="p-3">
        <div className="flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-status-info" />
          <span className="text-sm text-content-muted">Chargement...</span>
        </div>
      </Card>
    );
  }

  if (!requests?.length) {
    return (
      <Card className="p-3">
        <div className="flex items-center justify-center gap-2 py-3">
          <CheckCircle className="w-5 h-5 text-status-success/50" />
          <p className="text-sm text-content-muted">
            Aucune demande d'approbation en attente
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="px-3 py-2 bg-status-warning-bg border-b border-status-warning/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-status-warning-bg flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-status-warning" />
            </div>
            <h3 className="text-sm font-semibold text-content-primary">
              Écarts en attente
            </h3>
            <span className="px-1.5 py-0.5 rounded-full bg-status-warning-bg text-status-warning text-[10px] font-medium">
              {requests.length}
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[11px] text-content-muted hover:text-content-primary transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
        </div>

        <div className="divide-y divide-edge/50 max-h-64 overflow-y-auto">
          {requests.map((request) => {
            const ecart = Number(request.ecart);
            const isDeficit = request.typeEcart === 'DEFICIT';

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-2.5 hover:bg-surface/50 transition-colors"
              >
                {/* En-tête avec caissier, niveau et date */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-surface-elevated flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-content-muted" />
                  </div>
                  <p className="text-xs font-medium text-content-primary truncate">
                    {request.caissierPrenom} {request.caissierNom}
                  </p>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    request.niveauRequis === 'N2'
                      ? 'bg-status-danger-bg text-status-danger'
                      : 'bg-status-warning-bg text-status-warning'
                  }`}>
                    {request.niveauRequis}
                  </span>
                  <span className="ml-auto text-[10px] text-content-muted">
                    {new Date(request.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>

                {/* Montants en ligne */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 bg-surface/50 rounded px-2 py-1">
                    <span className="text-[10px] text-content-muted">Théo.</span>
                    <span className="ml-1 text-xs font-medium text-content-primary">
                      {formatMoney(Number(request.soldeTheorique))}
                    </span>
                  </div>
                  <div className="flex-1 bg-surface/50 rounded px-2 py-1">
                    <span className="text-[10px] text-content-muted">Phys.</span>
                    <span className="ml-1 text-xs font-medium text-content-primary">
                      {formatMoney(Number(request.montantPhysique))}
                    </span>
                  </div>
                  <div className={`flex-1 rounded px-2 py-1 flex items-center gap-1 ${
                    isDeficit ? 'bg-status-danger-bg' : 'bg-status-success-bg'
                  }`}>
                    {isDeficit ? (
                      <TrendingDown className="w-3 h-3 text-status-danger" />
                    ) : (
                      <TrendingUp className="w-3 h-3 text-status-success" />
                    )}
                    <span className={`text-xs font-bold ${
                      isDeficit ? 'text-status-danger' : 'text-status-success'
                    }`}>
                      {isDeficit ? '-' : '+'}{formatMoney(Math.abs(ecart))}
                    </span>
                  </div>
                </div>

                {/* Justification compacte */}
                <div className="bg-surface/30 rounded px-2 py-1.5 mb-2">
                  <p className="text-[10px] text-content-muted flex items-center gap-1">
                    <MessageSquare className="w-2.5 h-2.5" />
                    {request.justification}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleDecision(request, 'APPROVED')}
                    disabled={decisionMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-status-success-bg hover:bg-status-success/30 text-status-success rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Approuver
                  </button>
                  <button
                    onClick={() => handleDecision(request, 'REJECTED')}
                    disabled={decisionMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-status-danger-bg hover:bg-status-danger/30 text-status-danger rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3 h-3" />
                    Rejeter
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Card>

      {/* Modal de confirmation */}
      <AnimatePresence>
        {showDecisionModal && selectedRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDecisionModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-surface rounded-xl shadow-xl border border-edge overflow-hidden"
            >
              <div className={`px-4 py-3 border-b border-edge ${
                pendingDecision === 'APPROVED' ? 'bg-status-success-bg' : 'bg-status-danger-bg'
              }`}>
                <h3 className="font-semibold text-content-primary flex items-center gap-2">
                  {pendingDecision === 'APPROVED' ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-status-success" />
                      Confirmer l'approbation
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-status-danger" />
                      Confirmer le rejet
                    </>
                  )}
                </h3>
              </div>

              <div className="p-4">
                <p className="text-content-secondary mb-4">
                  {pendingDecision === 'APPROVED'
                    ? `Vous allez approuver l'écart de ${formatMoney(Math.abs(Number(selectedRequest.ecart)))} XOF.`
                    : `Vous allez rejeter l'écart. Le caissier devra recompter.`
                  }
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-content-muted mb-1">
                    Commentaire {pendingDecision === 'REJECTED' && '(obligatoire)'}
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ajouter un commentaire..."
                    rows={3}
                    className="w-full px-3 py-2 bg-surface-elevated/50 border border-edge-strong rounded-lg text-content-primary placeholder-content-muted focus:border-status-info focus:ring-1 focus:ring-status-info/30"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowDecisionModal(false);
                      setComment('');
                    }}
                    disabled={decisionMutation.isPending}
                  >
                    Annuler
                  </Button>
                  <Button
                    variant={pendingDecision === 'APPROVED' ? 'success' : 'danger'}
                    onClick={confirmDecision}
                    isLoading={decisionMutation.isPending}
                    disabled={pendingDecision === 'REJECTED' && !comment.trim()}
                  >
                    {pendingDecision === 'APPROVED' ? 'Approuver' : 'Rejeter'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
