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
      <Card className="p-6">
        <div className="flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-slate-400">Chargement des demandes...</span>
        </div>
      </Card>
    );
  }

  if (!requests?.length) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <CheckCircle className="w-12 h-12 text-emerald-500/50" />
          <p className="text-slate-400 text-center">
            Aucune demande d'approbation en attente
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-white">
              Écarts en attente d'approbation
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              {requests.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            icon={RefreshCw}
          >
            Actualiser
          </Button>
        </div>

        <div className="divide-y divide-slate-700/50">
          {requests.map((request) => {
            const ecart = Number(request.ecart);
            const isDeficit = request.typeEcart === 'DEFICIT';

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* En-tête avec caissier et date */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {request.caissierPrenom} {request.caissierNom}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(request.createdAt).toLocaleString('fr-FR')}
                        </p>
                      </div>
                      <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                        request.niveauRequis === 'N2'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        Niveau {request.niveauRequis}
                      </span>
                    </div>

                    {/* Détails de l'écart */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-xs text-slate-500 mb-0.5">Théorique</p>
                        <p className="font-medium text-white">
                          {formatMoney(Number(request.soldeTheorique))}
                        </p>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-2">
                        <p className="text-xs text-slate-500 mb-0.5">Physique</p>
                        <p className="font-medium text-white">
                          {formatMoney(Number(request.montantPhysique))}
                        </p>
                      </div>
                      <div className={`rounded-lg p-2 ${
                        isDeficit ? 'bg-red-500/10' : 'bg-emerald-500/10'
                      }`}>
                        <p className="text-xs text-slate-500 mb-0.5">Écart</p>
                        <div className="flex items-center gap-1">
                          {isDeficit ? (
                            <TrendingDown className="w-4 h-4 text-red-400" />
                          ) : (
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                          )}
                          <p className={`font-bold ${
                            isDeficit ? 'text-red-400' : 'text-emerald-400'
                          }`}>
                            {isDeficit ? '-' : '+'}{formatMoney(Math.abs(ecart))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Justification */}
                    <div className="bg-slate-800/30 rounded-lg p-3 mb-3">
                      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        Justification
                      </p>
                      <p className="text-sm text-slate-300">
                        {request.justification}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleDecision(request, 'APPROVED')}
                        icon={CheckCircle}
                        disabled={decisionMutation.isPending}
                      >
                        Approuver
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDecision(request, 'REJECTED')}
                        icon={XCircle}
                        disabled={decisionMutation.isPending}
                      >
                        Rejeter
                      </Button>
                    </div>
                  </div>
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
              className="relative w-full max-w-md bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden"
            >
              <div className={`px-4 py-3 border-b border-slate-700 ${
                pendingDecision === 'APPROVED' ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  {pendingDecision === 'APPROVED' ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      Confirmer l'approbation
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-red-500" />
                      Confirmer le rejet
                    </>
                  )}
                </h3>
              </div>

              <div className="p-4">
                <p className="text-slate-300 mb-4">
                  {pendingDecision === 'APPROVED'
                    ? `Vous allez approuver l'écart de ${formatMoney(Math.abs(Number(selectedRequest.ecart)))} XOF.`
                    : `Vous allez rejeter l'écart. Le caissier devra recompter.`
                  }
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-slate-400 mb-1">
                    Commentaire {pendingDecision === 'REJECTED' && '(obligatoire)'}
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Ajouter un commentaire..."
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
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
