/**
 * Panel de clôture journalière agence (Multi-Caisse)
 * Affiche le statut de toutes les caisses et permet de finaliser la journée
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Lock,
  Unlock,
  RefreshCw,
  ArrowRight,
  Wallet,
  Users,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoney } from '../../../lib/format';

interface ClosureBlocker {
  type: 'CAISSE_OPEN' | 'TRANSFER_PENDING' | 'REMISE_PENDING' | 'ECART_PENDING' | 'MM_DISCREPANCY';
  entityId?: string;
  entityType?: string;
  description: string;
  montant?: number;
}

interface ClosureStatus {
  ready: boolean;
  agenceId: string;
  date: string;
  totalCaisses: number;
  caissesOpen: number;
  caissesClosed: number;
  pendingTransfers: number;
  pendingRemises: number;
  pendingEcarts: number;
  blockers: ClosureBlocker[];
  closure?: {
    id: string;
    statut: string;
    closedAt?: string;
    closedBy?: string;
  };
}

interface AgencyClosurePanelProps {
  agenceId: string;
  agenceNom?: string;
  onClosureComplete?: () => void;
}

const blockerIcons: Record<ClosureBlocker['type'], React.ElementType> = {
  CAISSE_OPEN: Wallet,
  TRANSFER_PENDING: ArrowRight,
  REMISE_PENDING: Users,
  ECART_PENDING: AlertTriangle,
  MM_DISCREPANCY: TrendingUp,
};

const blockerLabels: Record<ClosureBlocker['type'], string> = {
  CAISSE_OPEN: 'Caisse ouverte',
  TRANSFER_PENDING: 'Transfert en attente',
  REMISE_PENDING: 'Remise en attente',
  ECART_PENDING: 'Écart en attente',
  MM_DISCREPANCY: 'Écart Mobile Money',
};

export default function AgencyClosurePanel({ agenceId, agenceNom, onClosureComplete }: AgencyClosurePanelProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [observations, setObservations] = useState('');

  // Récupérer le statut de clôture
  const { data: status, isLoading, refetch } = useQuery<ClosureStatus>({
    queryKey: ['agency-closure-status', agenceId],
    queryFn: async () => {
      const res = await fetch(`/api/caisses/agency/${agenceId}/closure-status`);
      if (!res.ok) throw new Error('Erreur récupération statut');
      return res.json();
    },
    refetchInterval: 15000, // Refresh toutes les 15s
  });

  // Mutation pour finaliser
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/caisses/agency/${agenceId}/finalize-closure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observations: observations || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la finalisation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency-closure-status'] });
      setShowFinalizeModal(false);
      setObservations('');
      onClosureComplete?.();
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-status-info" />
          <span className="text-content-muted">Chargement du statut...</span>
        </div>
      </Card>
    );
  }

  if (!status) return null;

  const progressPercent = status.totalCaisses > 0
    ? Math.round((status.caissesClosed / status.totalCaisses) * 100)
    : 0;

  const isClosed = status.closure?.statut === 'CLOSED';

  return (
    <>
      <Card className="overflow-hidden">
        {/* En-tête compact */}
        <div className={`px-3 py-2 border-b flex items-center justify-between ${
          isClosed
            ? 'bg-status-success-bg border-status-success/20'
            : status.ready
              ? 'bg-status-info-bg border-status-info/20'
              : 'bg-surface/50 border-edge-subtle'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isClosed ? 'bg-status-success-bg' : status.ready ? 'bg-status-info-bg' : 'bg-surface-elevated'
            }`}>
              {isClosed ? (
                <Lock className="w-4 h-4 text-status-success" />
              ) : (
                <Building2 className={`w-4 h-4 ${status.ready ? 'text-status-info' : 'text-content-muted'}`} />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-content-primary">{agenceNom || 'Siège'}</h3>
              <p className="text-[10px] text-content-muted">
                {new Date(status.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[11px] text-content-muted hover:text-content-primary transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
        </div>

        {/* Contenu */}
        <div className="p-3">
          {isClosed ? (
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-status-success-bg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-status-success" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-content-primary">Journée clôturée</h4>
                <p className="text-[10px] text-content-muted">
                  {new Date(status.closure?.closedAt || '').toLocaleString('fr-FR')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Progression + Stats en ligne */}
              <div className="flex items-center gap-3">
                {/* Progress */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-content-muted">Progression des caisses</span>
                    <span className="text-[10px] font-medium text-content-secondary">
                      {status.caissesClosed}/{status.totalCaisses} fermées
                    </span>
                  </div>
                  <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      className={`h-full rounded-full ${progressPercent === 100 ? 'bg-status-success' : 'bg-status-info'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Stats compactes */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-surface/50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-content-primary">{status.totalCaisses}</div>
                  <div className="text-[9px] text-content-muted">Total</div>
                </div>
                <div className="bg-status-success-bg rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-status-success">{status.caissesClosed}</div>
                  <div className="text-[9px] text-content-muted">Fermées</div>
                </div>
                <div className={`rounded-lg p-2 text-center ${status.caissesOpen > 0 ? 'bg-status-warning-bg' : 'bg-surface/50'}`}>
                  <div className={`text-lg font-bold ${status.caissesOpen > 0 ? 'text-status-warning' : 'text-content-muted'}`}>
                    {status.caissesOpen}
                  </div>
                  <div className="text-[9px] text-content-muted">Ouvertes</div>
                </div>
                <div className={`rounded-lg p-2 text-center ${status.pendingEcarts > 0 ? 'bg-status-danger-bg' : 'bg-surface/50'}`}>
                  <div className={`text-lg font-bold ${status.pendingEcarts > 0 ? 'text-status-danger' : 'text-content-muted'}`}>
                    {status.pendingEcarts}
                  </div>
                  <div className="text-[9px] text-content-muted">Écarts</div>
                </div>
              </div>

              {/* Blockers compacts */}
              {status.blockers.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-medium text-content-muted mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-status-warning" />
                    Éléments bloquants ({status.blockers.length})
                  </h4>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {status.blockers.map((blocker, idx) => {
                      const Icon = blockerIcons[blocker.type] || AlertTriangle;
                      return (
                        <div key={idx} className="flex items-center gap-2 p-1.5 bg-surface/50 rounded-lg">
                          <div className="w-6 h-6 rounded bg-status-warning-bg flex items-center justify-center shrink-0">
                            <Icon className="w-3 h-3 text-status-warning" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-content-primary truncate">{blocker.description}</p>
                            <p className="text-[9px] text-content-muted">
                              {blockerLabels[blocker.type]}
                              {blocker.montant && ` - ${formatMoney(blocker.montant)} XOF`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bouton de finalisation */}
              <div className="flex justify-end pt-1">
                <Button
                  variant={status.ready ? 'success' : 'secondary'}
                  size="sm"
                  onClick={() => setShowFinalizeModal(true)}
                  disabled={!status.ready}
                  icon={status.ready ? Lock : Unlock}
                >
                  {status.ready ? 'Finaliser la journée' : 'Clôture impossible'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Modal de confirmation */}
      <AnimatePresence>
        {showFinalizeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowFinalizeModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-surface rounded-xl shadow-xl border border-edge overflow-hidden"
            >
              <div className="px-4 py-3 bg-status-success-bg border-b border-edge">
                <h3 className="font-semibold text-content-primary flex items-center gap-2">
                  <Lock className="w-5 h-5 text-status-success" />
                  Finaliser la clôture
                </h3>
              </div>

              <div className="p-4">
                <p className="text-content-secondary mb-4">
                  Vous allez finaliser la clôture journalière de l'agence.
                  Toutes les caisses sont fermées et les transferts exécutés.
                </p>

                <div className="bg-surface-elevated/30 rounded-lg p-3 mb-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-content-muted">Caisses fermées:</span>
                      <span className="text-content-primary ml-2 font-medium">
                        {status?.caissesClosed}/{status?.totalCaisses}
                      </span>
                    </div>
                    <div>
                      <span className="text-content-muted">Date:</span>
                      <span className="text-content-primary ml-2 font-medium">
                        {status?.date}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-content-muted mb-1">
                    Observations (optionnel)
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Ajouter des observations..."
                    rows={3}
                    className="w-full px-3 py-2 bg-surface-elevated/50 border border-edge-strong rounded-lg text-content-primary placeholder-content-muted focus:border-status-info focus:ring-1 focus:ring-status-info/30"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowFinalizeModal(false)}
                    disabled={finalizeMutation.isPending}
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => finalizeMutation.mutate()}
                    isLoading={finalizeMutation.isPending}
                    icon={Lock}
                  >
                    Confirmer la clôture
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
