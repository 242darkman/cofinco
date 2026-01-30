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
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-slate-400">Chargement du statut...</span>
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
        {/* En-tête */}
        <div className={`px-4 py-3 border-b flex items-center justify-between ${
          isClosed
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : status.ready
              ? 'bg-blue-500/10 border-blue-500/20'
              : 'bg-slate-800/50 border-slate-700/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isClosed
                ? 'bg-emerald-500/20'
                : status.ready
                  ? 'bg-blue-500/20'
                  : 'bg-slate-700'
            }`}>
              {isClosed ? (
                <Lock className="w-5 h-5 text-emerald-500" />
              ) : (
                <Building2 className={`w-5 h-5 ${status.ready ? 'text-blue-500' : 'text-slate-400'}`} />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {agenceNom || 'Clôture Agence'}
              </h3>
              <p className="text-xs text-slate-400">
                {new Date(status.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              icon={RefreshCw}
            >
              Actualiser
            </Button>
          </div>
        </div>

        {/* Contenu */}
        <div className="p-4">
          {/* Statut fermé */}
          {isClosed ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h4 className="text-lg font-semibold text-white mb-1">
                Journée clôturée
              </h4>
              <p className="text-slate-400 text-sm">
                Clôturée le {new Date(status.closure?.closedAt || '').toLocaleString('fr-FR')}
              </p>
            </div>
          ) : (
            <>
              {/* Progression */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Progression des caisses</span>
                  <span className="text-sm font-medium text-white">
                    {status.caissesClosed}/{status.totalCaisses} fermées
                  </span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    className={`h-full rounded-full ${
                      progressPercent === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                  />
                </div>
              </div>

              {/* Statistiques */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-white">{status.totalCaisses}</div>
                  <div className="text-xs text-slate-400">Total caisses</div>
                </div>
                <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{status.caissesClosed}</div>
                  <div className="text-xs text-slate-400">Fermées</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${
                  status.caissesOpen > 0 ? 'bg-amber-500/10' : 'bg-slate-800/50'
                }`}>
                  <div className={`text-2xl font-bold ${
                    status.caissesOpen > 0 ? 'text-amber-400' : 'text-slate-400'
                  }`}>{status.caissesOpen}</div>
                  <div className="text-xs text-slate-400">Ouvertes</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${
                  status.pendingEcarts > 0 ? 'bg-red-500/10' : 'bg-slate-800/50'
                }`}>
                  <div className={`text-2xl font-bold ${
                    status.pendingEcarts > 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>{status.pendingEcarts}</div>
                  <div className="text-xs text-slate-400">Écarts</div>
                </div>
              </div>

              {/* Blockers */}
              {status.blockers.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Éléments bloquants ({status.blockers.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {status.blockers.map((blocker, idx) => {
                      const Icon = blockerIcons[blocker.type] || AlertTriangle;
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {blocker.description}
                            </p>
                            <p className="text-xs text-slate-500">
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
              <div className="flex justify-end">
                <Button
                  variant={status.ready ? 'success' : 'secondary'}
                  size="lg"
                  onClick={() => setShowFinalizeModal(true)}
                  disabled={!status.ready}
                  icon={status.ready ? Lock : Unlock}
                >
                  {status.ready ? 'Finaliser la journée' : 'Clôture impossible'}
                </Button>
              </div>
            </>
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
              className="relative w-full max-w-md bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden"
            >
              <div className="px-4 py-3 bg-emerald-500/10 border-b border-slate-700">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-emerald-500" />
                  Finaliser la clôture
                </h3>
              </div>

              <div className="p-4">
                <p className="text-slate-300 mb-4">
                  Vous allez finaliser la clôture journalière de l'agence.
                  Toutes les caisses sont fermées et les transferts exécutés.
                </p>

                <div className="bg-slate-700/30 rounded-lg p-3 mb-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-slate-400">Caisses fermées:</span>
                      <span className="text-white ml-2 font-medium">
                        {status?.caissesClosed}/{status?.totalCaisses}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Date:</span>
                      <span className="text-white ml-2 font-medium">
                        {status?.date}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm text-slate-400 mb-1">
                    Observations (optionnel)
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Ajouter des observations..."
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
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
