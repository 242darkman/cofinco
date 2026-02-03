/**
 * Panel de Transfert de Garde (Handover)
 *
 * Permet aux caissiers de:
 * - Initier un transfert vers un autre caissier
 * - Confirmer la réception d'un transfert
 * - Voir les transferts en attente
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  Check,
  X,
  Clock,
  AlertTriangle,
  RefreshCw,
  Calculator,
  MessageSquare,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoney } from '../../../lib/format';

interface PendingHandover {
  id: string;
  sessionId: string;
  caisseId: string;
  caisseNom: string;
  fromCaissierNom: string;
  toCaissierNom: string;
  montantTheorique: number;
  statut: string;
  initiatedAt: string;
}

interface HandoverDetail {
  id: string;
  sessionId: string;
  caisseId: string;
  fromCaissierId: string;
  toCaissierId: string;
  montantTheorique: string;
  montantCompte: string;
  ecart: string;
  billetageSortant?: Record<string, number>;
  statut: string;
  motif?: string;
  observationsSortant?: string;
  initiatedAt: string;
}

interface CaisseHandoverPanelProps {
  sessionId: string;
  caisseId: string;
  currentCaissierId: string;
  currentSolde: number;
  onHandoverComplete?: () => void;
}

interface CaissierOption {
  id: string;
  nom: string;
  prenom: string;
}

const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'En attente', color: 'text-amber-400 bg-amber-500/10', icon: Clock },
  COUNTING: { label: 'Comptage en cours', color: 'text-blue-400 bg-blue-500/10', icon: Calculator },
  CONFIRMED: { label: 'Confirmé', color: 'text-emerald-400 bg-emerald-500/10', icon: Check },
  CANCELLED: { label: 'Annulé', color: 'text-red-400 bg-red-500/10', icon: X },
  DISPUTED: { label: 'En attente approbation', color: 'text-orange-400 bg-orange-500/10', icon: AlertTriangle },
};

export default function CaisseHandoverPanel({
  sessionId,
  caisseId,
  currentCaissierId,
  currentSolde,
  onHandoverComplete,
}: CaisseHandoverPanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<PendingHandover | null>(null);
  const [showCancelModal, setShowCancelModal] = useState<PendingHandover | null>(null);

  // État pour l'initiation
  const [selectedCaissier, setSelectedCaissier] = useState<string>('');
  const [declaredAmount, setDeclaredAmount] = useState<number>(currentSolde);
  const [initiateMotif, setInitiateMotif] = useState('');
  const [initiateObservations, setInitiateObservations] = useState('');

  // État pour la confirmation
  const [verifiedAmount, setVerifiedAmount] = useState<number>(0);
  const [confirmObservations, setConfirmObservations] = useState('');
  const [ecartJustification, setEcartJustification] = useState('');

  // État pour l'annulation
  const [cancelReason, setCancelReason] = useState('');

  // Récupérer les transferts en attente
  const { data: pendingHandovers, isLoading } = useQuery<PendingHandover[]>({
    queryKey: ['pending-handovers'],
    queryFn: async () => {
      const res = await fetch('/api/caisses/handovers/pending');
      if (!res.ok) throw new Error('Erreur');
      return res.json();
    },
    refetchInterval: 30000, // 30s - optimized for slow connections (was 10s)
  });

  // Récupérer la liste des caissiers disponibles
  const { data: availableCaissiers } = useQuery<CaissierOption[]>({
    queryKey: ['available-caissiers', caisseId],
    queryFn: async () => {
      // TODO: Endpoint pour récupérer les caissiers disponibles
      const res = await fetch(`/api/caisses/${caisseId}/available-caissiers`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showInitiateModal,
  });

  // Mutation initier transfert
  const initiateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/caisses/handovers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          toCaissierId: selectedCaissier,
          montantCompte: declaredAmount,
          motif: initiateMotif || undefined,
          observations: initiateObservations || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-handovers'] });
      setShowInitiateModal(false);
      resetInitiateState();
    },
  });

  // Mutation démarrer comptage
  const startCountingMutation = useMutation({
    mutationFn: async (handoverId: string) => {
      const res = await fetch(`/api/caisses/handovers/${handoverId}/start-counting`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Erreur');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-handovers'] });
    },
  });

  // Mutation confirmer transfert
  const confirmMutation = useMutation({
    mutationFn: async (handoverId: string) => {
      const res = await fetch(`/api/caisses/handovers/${handoverId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montantVerifie: verifiedAmount,
          observations: confirmObservations || undefined,
          ecartJustification: ecartJustification || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pending-handovers'] });
      setShowConfirmModal(null);
      resetConfirmState();
      if (!data.requiresApproval && onHandoverComplete) {
        onHandoverComplete();
      }
    },
  });

  // Mutation annuler transfert
  const cancelMutation = useMutation({
    mutationFn: async (handoverId: string) => {
      const res = await fetch(`/api/caisses/handovers/${handoverId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) throw new Error('Erreur');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-handovers'] });
      setShowCancelModal(null);
      setCancelReason('');
    },
  });

  const resetInitiateState = () => {
    setSelectedCaissier('');
    setDeclaredAmount(currentSolde);
    setInitiateMotif('');
    setInitiateObservations('');
  };

  const resetConfirmState = () => {
    setVerifiedAmount(0);
    setConfirmObservations('');
    setEcartJustification('');
  };

  // Filtrer les transferts
  const incomingHandovers = pendingHandovers?.filter(h => h.fromCaissierNom !== currentCaissierId) || [];
  const outgoingHandovers = pendingHandovers?.filter(h => h.fromCaissierNom === currentCaissierId) || [];

  const hasActiveHandover = pendingHandovers && pendingHandovers.length > 0;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Transfert de garde</h3>
              <p className="text-xs text-slate-400">Changement de caissier</p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowInitiateModal(true)}
            icon={UserPlus}
            disabled={hasActiveHandover}
          >
            Transférer
          </Button>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : !hasActiveHandover ? (
            <div className="text-center py-6 text-slate-400">
              <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun transfert en cours</p>
              <p className="text-xs mt-1">Cliquez sur "Transférer" pour passer la main</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingHandovers?.map((handover) => {
                const status = statusLabels[handover.statut] || statusLabels.PENDING;
                const StatusIcon = status.icon;
                const isIncoming = handover.fromCaissierNom !== currentCaissierId;

                return (
                  <motion.div
                    key={handover.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-800/50 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {isIncoming ? (
                          <UserPlus className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <UserMinus className="w-4 h-4 text-amber-400" />
                        )}
                        <span className="text-sm text-white">
                          {isIncoming ? 'Transfert entrant' : 'Transfert sortant'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                          <StatusIcon className="w-3 h-3 inline mr-1" />
                          {status.label}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(handover.initiatedAt).toLocaleTimeString('fr-FR')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <span className="text-slate-500">De:</span>
                        <span className="text-white ml-2">{handover.fromCaissierNom}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">À:</span>
                        <span className="text-white ml-2">{handover.toCaissierNom}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">Montant:</span>
                        <span className="text-white ml-2 font-medium">
                          {formatMoney(handover.montantTheorique)} XOF
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                      {isIncoming && handover.statut === 'PENDING' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => startCountingMutation.mutate(handover.id)}
                          isLoading={startCountingMutation.isPending}
                          icon={Calculator}
                        >
                          Commencer le comptage
                        </Button>
                      )}
                      {isIncoming && handover.statut === 'COUNTING' && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => {
                            setVerifiedAmount(handover.montantTheorique);
                            setShowConfirmModal(handover);
                          }}
                          icon={Check}
                        >
                          Confirmer
                        </Button>
                      )}
                      {['PENDING', 'COUNTING'].includes(handover.statut) && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setShowCancelModal(handover)}
                          icon={X}
                        >
                          Annuler
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Modal Initier Transfert */}
      <AnimatePresence>
        {showInitiateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowInitiateModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden"
            >
              <div className="px-4 py-3 bg-purple-500/10 border-b border-slate-700">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-purple-400" />
                  Initier un transfert de garde
                </h3>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Caissier entrant
                  </label>
                  <select
                    value={selectedCaissier}
                    onChange={(e) => setSelectedCaissier(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="">Sélectionner un caissier</option>
                    {availableCaissiers?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prenom} {c.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Montant compté (XOF)
                  </label>
                  <input
                    type="number"
                    value={declaredAmount}
                    onChange={(e) => setDeclaredAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Solde théorique: {formatMoney(currentSolde)} XOF
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Motif (optionnel)
                  </label>
                  <input
                    type="text"
                    value={initiateMotif}
                    onChange={(e) => setInitiateMotif(e.target.value)}
                    placeholder="Ex: Pause déjeuner, fin de service..."
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Observations (optionnel)
                  </label>
                  <textarea
                    value={initiateObservations}
                    onChange={(e) => setInitiateObservations(e.target.value)}
                    placeholder="Notes pour le caissier entrant..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                  <Button variant="ghost" onClick={() => setShowInitiateModal(false)}>
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => initiateMutation.mutate()}
                    isLoading={initiateMutation.isPending}
                    disabled={!selectedCaissier || declaredAmount <= 0}
                    icon={ChevronRight}
                  >
                    Initier le transfert
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Confirmer Transfert */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowConfirmModal(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden"
            >
              <div className="px-4 py-3 bg-emerald-500/10 border-b border-slate-700">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-400" />
                  Confirmer le transfert
                </h3>
              </div>

              <div className="p-4 space-y-4">
                <div className="bg-slate-700/30 rounded-lg p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">Montant déclaré:</span>
                    <span className="text-white font-medium">
                      {formatMoney(showConfirmModal.montantTheorique)} XOF
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">De:</span>
                    <span className="text-white">{showConfirmModal.fromCaissierNom}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Montant vérifié (XOF)
                  </label>
                  <input
                    type="number"
                    value={verifiedAmount}
                    onChange={(e) => setVerifiedAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white"
                  />
                  {verifiedAmount !== showConfirmModal.montantTheorique && (
                    <p className={`text-xs mt-1 ${
                      Math.abs(verifiedAmount - showConfirmModal.montantTheorique) > 5000
                        ? 'text-red-400'
                        : 'text-amber-400'
                    }`}>
                      Écart: {formatMoney(verifiedAmount - showConfirmModal.montantTheorique)} XOF
                    </p>
                  )}
                </div>

                {verifiedAmount !== showConfirmModal.montantTheorique && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Justification de l'écart
                    </label>
                    <textarea
                      value={ecartJustification}
                      onChange={(e) => setEcartJustification(e.target.value)}
                      placeholder="Expliquez la raison de l'écart..."
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Observations (optionnel)
                  </label>
                  <textarea
                    value={confirmObservations}
                    onChange={(e) => setConfirmObservations(e.target.value)}
                    placeholder="Notes supplémentaires..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                  <Button variant="ghost" onClick={() => setShowConfirmModal(null)}>
                    Annuler
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => confirmMutation.mutate(showConfirmModal.id)}
                    isLoading={confirmMutation.isPending}
                    disabled={verifiedAmount <= 0}
                    icon={Check}
                  >
                    Confirmer la prise en charge
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Annuler */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCancelModal(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden"
            >
              <div className="px-4 py-3 bg-red-500/10 border-b border-slate-700">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <X className="w-5 h-5 text-red-400" />
                  Annuler le transfert
                </h3>
              </div>

              <div className="p-4">
                <p className="text-slate-300 text-sm mb-4">
                  Êtes-vous sûr de vouloir annuler ce transfert ? Cette action ne peut pas être annulée.
                </p>

                <div className="mb-4">
                  <label className="block text-sm text-slate-400 mb-1">
                    Raison de l'annulation
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Indiquez la raison..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setShowCancelModal(null)}>
                    Retour
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => cancelMutation.mutate(showCancelModal.id)}
                    isLoading={cancelMutation.isPending}
                    disabled={cancelReason.length < 5}
                    icon={X}
                  >
                    Annuler le transfert
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
