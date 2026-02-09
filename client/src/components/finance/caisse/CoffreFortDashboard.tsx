
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRightLeft,
  Wallet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  AlertTriangle,
  AlertCircle,
  Settings,
  MoreHorizontal,
  Play,
  Ban,
  Eye,
  Vault,
  User,
  KeyRound,
  Info,
  X
} from "lucide-react";
import { toast } from 'sonner';

import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { coffreApi, sessionCaisseApi } from "@/lib/api-client";
import { StatutTransfertCoffre, getMouvementCoffreLabel } from "@shared/enum/status-constants";
import { ALL_STATUS_LABELS } from "@/lib/status-labels";
import { SkeletonCard } from '@/components/ui/Skeleton';
import { CoffreAdminPanel } from './CoffreAdminPanel';
import { ProvisionCoffreModal } from './ProvisionCoffreModal';
import { usePermissions } from '../../auth/ProtectedFeature';
import TransfertInterCoffresModule from '../transfert-coffres/TransfertInterCoffresModule';
import { TreasurySupervision } from '../../admin/TreasurySupervision';
import { coffreKeys, caisseKeys } from '../../../lib/query-keys';


interface CoffreFortDashboardProps {
  agenceId: string;
}

// Types pour le dialogue de confirmation
interface ConfirmAction {
  type: 'validate' | 'reject' | 'execute' | 'validate-opening' | 'reject-opening';
  transfert: any;
}

const TAB_HELP: Record<string, string> = {
  operations: 'Demandez, validez et exécutez les transferts entre le coffre et les caisses. Chaque transfert suit un workflow : Demande → Validation → Exécution.',
  intercoffres: 'Envoyez et recevez des fonds entre coffres de différentes agences. Idéal pour les rééquilibrages de trésorerie entre sites.',
  historique: 'Consultez l\'historique complet de tous les mouvements du coffre : entrées, sorties, provisions et compensations.',
  supervision: 'Vue consolidée des soldes et mouvements de toutes les agences. Comparez les performances et exportez les rapports.',
  admin: 'Configurez les seuils d\'alerte, les plafonds de transfert et les règles de validation du coffre-fort.',
};

export function CoffreFortDashboard({ agenceId }: CoffreFortDashboardProps) {
  // Fetch transferts
  const { data: transfertsData, isLoading, refetch, isRefetching: isRefetchingTransferts } = useQuery({
    queryKey: coffreKeys.transferts(agenceId),
    queryFn: () => coffreApi.listTransferts({
      agenceId,
      limit: 50, // Increased limit to ensure recent requests are visible
      page: 1
    }),
    enabled: !!agenceId,
    refetchInterval: 30000,
  });

  const { data: statsData, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: coffreKeys.stats(agenceId),
    queryFn: () => coffreApi.getStats(agenceId),
  });

  // Query for pending opening requests (new secure workflow)
  const { data: pendingOpeningRequests = [], isLoading: isLoadingOpeningRequests, refetch: refetchOpeningRequests } = useQuery({
    queryKey: coffreKeys.pendingOpeningRequests(agenceId),
    queryFn: () => coffreApi.getPendingOpeningRequests(agenceId),
    enabled: !!agenceId,
    refetchInterval: 15000, // Poll more frequently for opening requests
  });

  const queryClient = useQueryClient();

  const { hasPermission } = usePermissions();
  const canValidate = hasPermission('coffre', 'transfert.validate');
  const canExecute = hasPermission('coffre', 'transfert.execute');
  const canConfigure = hasPermission('coffre', 'config.view') || hasPermission('coffre', 'config.edit');
  const canSupervise = hasPermission('coffre', 'supervision.view') || hasPermission('admin', 'access');


  const [activeTab, setActiveTab] = useState('operations');
  const [showHelp, setShowHelp] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [selectedTransfert, setSelectedTransfert] = useState<any>(null);

  // Cancellation states
  const [transfertToCancel, setTransfertToCancel] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const transferts = transfertsData?.data || [];

  const pendingCount = transferts.filter((t: any) => t.statut === StatutTransfertCoffre.REQUESTED).length;
  const todayVolume = transferts
    .filter((t: any) => new Date(t.createdAt).toDateString() === new Date().toDateString())
    .reduce((acc: number, t: any) => acc + Number(t.montant), 0);

  const handleValidate = async (id: string, approved: boolean) => {
    setActionLoading(id);
    try {
      await coffreApi.validateTransfert(id, approved);
      toast.success(approved ? "Transfert validé" : "Transfert rejeté", {
        description: `Le transfert a été ${approved ? "validé" : "rejeté"} avec succès.`
      });
      refetch();
    } catch (e: any) {
      const errorMessage = e.message || "";
      // Mapper les messages d'erreur connus vers des messages utilisateur
      let userMessage = errorMessage;
      if (errorMessage.includes("propre demande") || errorMessage.includes("same user")) {
        userMessage = "Vous ne pouvez pas valider votre propre demande. Un autre utilisateur doit effectuer la validation.";
      } else if (errorMessage.includes("statut")) {
        userMessage = "Ce transfert ne peut pas être validé dans son état actuel.";
      }
      toast.error("Validation impossible", {
        description: userMessage || "Une erreur est survenue."
      });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleExecute = async (id: string) => {
    setActionLoading(id);
    try {
      // Récupérer la session active de l'utilisateur pour lier l'opération
      let sessionId: string | undefined;
      try {
        const activeSession = await sessionCaisseApi.getActive();
        if (activeSession?.id) {
          sessionId = activeSession.id;
        }
      } catch {
        // Pas de session active - la résolution automatique côté backend prendra le relais
      }

      await coffreApi.executeTransfert(id, sessionId);
      toast.success("Transfert exécuté", {
        description: "Les fonds ont été déplacés avec succès."
      });
      refetch();
      refetchStats(); // Mise à jour du solde en temps réel
    } catch (e: any) {
      const errorMessage = e.message || "";
      // Mapper les messages d'erreur connus vers des messages utilisateur
      let userMessage = errorMessage;
      if (errorMessage.toLowerCase().includes("insuffisant") || errorMessage.toLowerCase().includes("insufficient")) {
        userMessage = "Solde insuffisant pour effectuer ce transfert.";
      } else if (errorMessage.includes("statut") || errorMessage.includes("Validé")) {
        userMessage = "Ce transfert doit d'abord être validé avant de pouvoir être exécuté.";
      } else if (errorMessage.toLowerCase().includes("fermée") || errorMessage.toLowerCase().includes("closed")) {
        userMessage = "La caisse concernée est fermée.";
      }
      toast.error("Exécution impossible", {
        description: userMessage || "Une erreur est survenue."
      });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  // Handler for validating/rejecting opening requests (new secure workflow)
  const handleValidateOpeningRequest = async (transfertId: string, approved: boolean, reasonRejection?: string) => {
    setActionLoading(transfertId);
    try {
      await coffreApi.validateOpeningTransfer(transfertId, {
        approved,
        reasonRejection: approved ? undefined : (reasonRejection || 'Demande rejetée par le responsable coffre')
      });
      toast.success(approved ? "Demande d'ouverture validée" : "Demande d'ouverture rejetée", {
        description: approved
          ? "Le caissier peut maintenant confirmer la réception des fonds."
          : "Le caissier a été notifié du rejet."
      });
      refetchOpeningRequests();
      refetch(); // Refresh transferts list
      refetchStats(); // Refresh coffre balance
      // Invalidate session queries to update cashier view
      queryClient.invalidateQueries({ queryKey: caisseKeys.sessions() });
    } catch (e: any) {
      const errorMessage = e.message || "";
      let userMessage = errorMessage;
      if (errorMessage.includes("propre demande") || errorMessage.includes("same user")) {
        userMessage = "Vous ne pouvez pas valider votre propre demande d'ouverture.";
      } else if (errorMessage.toLowerCase().includes("insuffisant")) {
        userMessage = "Solde coffre insuffisant pour cette dotation.";
      }
      toast.error("Action impossible", {
        description: userMessage || "Une erreur est survenue."
      });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  // Handler for cancelling transfers
  const handleCancelTransfert = async () => {
    if (!transfertToCancel || !cancelReason.trim()) {
      toast.error('Veuillez indiquer une raison');
      return;
    }

    setIsCancelling(true);
    try {
      const canBeCancelled = [StatutTransfertCoffre.REQUESTED, StatutTransfertCoffre.VALIDATED].includes(transfertToCancel.statut);
      const canBeReversed = transfertToCancel.statut === StatutTransfertCoffre.EXECUTED && !transfertToCancel.verrouille;
      const canReverseWithin24h = canBeReversed && transfertToCancel.executedAt &&
        (Date.now() - new Date(transfertToCancel.executedAt).getTime()) / (1000 * 60 * 60) < 24;

      if (canBeCancelled) {
        // Simple cancellation for REQUESTED or VALIDATED
        await coffreApi.cancelTransfert(transfertToCancel.id, cancelReason);
        toast.success('Transfert annulé avec succès');
      } else if (canReverseWithin24h) {
        // Cancellation with compensation for EXECUTED
        await coffreApi.reverseTransfert(transfertToCancel.id, { reason: cancelReason });
        toast.success('Transfert annulé avec compensation (transfert inversé créé)');
      } else {
        toast.error('Ce transfert ne peut pas être annulé');
        return;
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: coffreKeys.all });
      queryClient.invalidateQueries({ queryKey: caisseKeys.all });
      refetch();
      refetchStats();

      // Close modal and reset state
      setTransfertToCancel(null);
      setCancelReason('');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;

    const { type, transfert } = confirmAction;
    if (type === 'validate') {
      handleValidate(transfert.id, true);
    } else if (type === 'reject') {
      handleValidate(transfert.id, false);
    } else if (type === 'execute') {
      handleExecute(transfert.id);
    } else if (type === 'validate-opening') {
      handleValidateOpeningRequest(transfert.id, true);
    } else if (type === 'reject-opening') {
      handleValidateOpeningRequest(transfert.id, false);
    }
  };

  const getConfirmDialogConfig = () => {
    if (!confirmAction) return { title: '', message: '', variant: 'info' as const, confirmText: '' };

    const { type, transfert } = confirmAction;
    const montantFormatted = Number(transfert.montant).toLocaleString();
    const caisse = transfert.typeTransfert === "COFFRE_VERS_CAISSE"
      ? transfert.caisseDestinationNom
      : transfert.caisseSourceNom;

    switch (type) {
      case 'validate':
        return {
          title: 'Valider le transfert',
          message: (
            <>
              <span className="block mb-3">Vous êtes sur le point de <strong className="text-emerald-400">valider</strong> ce transfert :</span>
              <span className="block bg-slate-800/50 rounded-lg p-3 space-y-2">
                <span className="flex justify-between">
                  <span className="text-slate-400">Montant</span>
                  <span className="font-bold text-white">{montantFormatted} FCFA</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caisse</span>
                  <span className="text-white">{caisse}</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Demandé par</span>
                  <span className="text-white">{transfert.requestedByNom}</span>
                </span>
              </span>
            </>
          ),
          variant: 'success' as const,
          confirmText: 'Valider le transfert'
        };
      case 'reject':
        return {
          title: 'Rejeter le transfert',
          message: (
            <>
              <span className="block mb-3">Vous êtes sur le point de <strong className="text-red-400">rejeter</strong> ce transfert :</span>
              <span className="block bg-slate-800/50 rounded-lg p-3 space-y-2 mb-3">
                <span className="flex justify-between">
                  <span className="text-slate-400">Montant</span>
                  <span className="font-bold text-white">{montantFormatted} FCFA</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caisse</span>
                  <span className="text-white">{caisse}</span>
                </span>
              </span>
              <span className="text-amber-400 text-sm flex items-center gap-2">
                <AlertTriangle size={14} />
                Cette action est irréversible.
              </span>
            </>
          ),
          variant: 'danger' as const,
          confirmText: 'Rejeter le transfert'
        };
      case 'execute':
        return {
          title: 'Exécuter le transfert',
          message: (
            <>
              <span className="block mb-3">Vous êtes sur le point d'<strong className="text-cyan-400">exécuter</strong> ce transfert :</span>
              <span className="block bg-slate-800/50 rounded-lg p-3 space-y-2 mb-3">
                <span className="flex justify-between">
                  <span className="text-slate-400">Montant</span>
                  <span className="font-bold text-white">{montantFormatted} FCFA</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caisse</span>
                  <span className="text-white">{caisse}</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Type</span>
                  <span className="text-white">
                    {transfert.typeTransfert === "COFFRE_VERS_CAISSE" ? "Coffre → Caisse" : "Caisse → Coffre"}
                  </span>
                </span>
              </span>
              <span className="text-emerald-400 text-sm flex items-center gap-2">
                <CheckCircle2 size={14} />
                Les fonds seront immédiatement transférés.
              </span>
            </>
          ),
          variant: 'info' as const,
          confirmText: 'Exécuter maintenant'
        };
      case 'validate-opening':
        return {
          title: "Valider la demande d'ouverture",
          message: (
            <>
              <span className="block mb-3">Vous êtes sur le point de <strong className="text-emerald-400">valider</strong> cette demande d'ouverture de caisse :</span>
              <span className="block bg-slate-800/50 rounded-lg p-3 space-y-2 mb-3">
                <span className="flex justify-between">
                  <span className="text-slate-400">Montant demandé</span>
                  <span className="font-bold text-white">{montantFormatted} FCFA</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caisse</span>
                  <span className="text-white">{transfert.caisseDestinationNom || caisse}</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caissier</span>
                  <span className="text-white">{transfert.caissierNom || transfert.requestedByNom}</span>
                </span>
              </span>
              <span className="text-emerald-400 text-sm flex items-center gap-2">
                <KeyRound size={14} />
                Le caissier pourra alors confirmer la réception et ouvrir sa session.
              </span>
            </>
          ),
          variant: 'success' as const,
          confirmText: 'Valider et envoyer les fonds'
        };
      case 'reject-opening':
        return {
          title: "Rejeter la demande d'ouverture",
          message: (
            <>
              <span className="block mb-3">Vous êtes sur le point de <strong className="text-red-400">rejeter</strong> cette demande d'ouverture :</span>
              <span className="block bg-slate-800/50 rounded-lg p-3 space-y-2 mb-3">
                <span className="flex justify-between">
                  <span className="text-slate-400">Montant demandé</span>
                  <span className="font-bold text-white">{montantFormatted} FCFA</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caisse</span>
                  <span className="text-white">{transfert.caisseDestinationNom || caisse}</span>
                </span>
                <span className="flex justify-between">
                  <span className="text-slate-400">Caissier</span>
                  <span className="text-white">{transfert.caissierNom || transfert.requestedByNom}</span>
                </span>
              </span>
              <span className="text-amber-400 text-sm flex items-center gap-2">
                <AlertTriangle size={14} />
                Le caissier sera notifié et devra soumettre une nouvelle demande.
              </span>
            </>
          ),
          variant: 'danger' as const,
          confirmText: 'Rejeter la demande'
        };
      default:
        return { title: '', message: '', variant: 'info' as const, confirmText: '' };
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
           {[1, 2, 3].map(i => <SkeletonCard key={i} className="h-24" />)}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  const columns = [
    {
      key: 'createdAt',
      label: 'Date',
      hideOnMobile: true,
      format: (_: any, row: any) => (
        <span className="text-xs sm:text-sm text-slate-300">
           {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", { locale: fr })}
        </span>
      )
    },
    {
      key: 'typeTransfert',
      label: 'Type',
      format: (_: any, row: any) => (
        <div className="flex flex-col xs:flex-row xs:items-center gap-0.5 xs:gap-2">
            {row.typeTransfert === "COFFRE_VERS_CAISSE" ? (
                <Badge variant="warning" size="sm" icon={<ArrowDownRight size={10} />} value="Sortie" className="text-[10px] w-[70px] justify-center" />
            ) : (
                <Badge variant="success" size="sm" icon={<ArrowUpRight size={10} />} value="Entrée" className="text-[10px] w-[70px] justify-center" />
            )}
            <span className="text-[10px] sm:text-xs text-slate-400">
                {row.typeTransfert === "COFFRE_VERS_CAISSE" ? "Vers Caisse" : "De Caisse"}
            </span>
        </div>
      )
    },
    {
      key: 'trajet',
      label: 'Caisse',
      format: (_: any, row: any) => (
        <span className="font-medium text-white text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none block">
          {row.typeTransfert === "COFFRE_VERS_CAISSE" ? row.caisseDestinationNom : row.caisseSourceNom}
        </span>
      )
    },
    {
      key: 'montant',
      label: 'Montant',
      align: 'right' as const,
      format: (val: any) => (
        <span className="font-bold font-mono text-white text-xs sm:text-sm whitespace-nowrap">
            {Number(val).toLocaleString()} <span className="text-[10px] text-slate-400">FCFA</span>
        </span>
      )
    },
    {
      key: 'requestedByNom',
      label: 'Initié par',
      hideOnMobile: true,
      format: (_: any, row: any) => (
        <span className="text-xs sm:text-sm text-slate-400 truncate max-w-[100px] block">
            {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
        </span>
      )
    },
    {
      key: 'statut',
      label: 'Statut',
      format: (_: any, row: any) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
        if (row.statut === StatutTransfertCoffre.VALIDATED || row.statut === StatutTransfertCoffre.EXECUTED) variant = 'success';
        if (row.statut === StatutTransfertCoffre.REQUESTED) variant = 'warning';
        if (row.statut === StatutTransfertCoffre.REJECTED || row.statut === StatutTransfertCoffre.CANCELLED) variant = 'danger';

        return <Badge variant={variant} value={row.statut} className="text-[9px] sm:text-xs w-[80px] justify-center" />;
      }
    },
  ];

  // Fonction d'actions extraite pour être réutilisée dans la prop actions (mobile + desktop)
  const renderRowActions = (row: any) => {
    const isLoading = actionLoading === row.id;

    // Actions pour les transferts en attente de validation
    if (row.statut === StatutTransfertCoffre.REQUESTED) {
      return (
        <div className="flex items-center gap-1 sm:gap-2">
          {canValidate && (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="h-6 sm:h-7 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all"
                onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'validate', transfert: row }); }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={12} className="lg:mr-1" />
                    <span className="hidden lg:inline">Valider</span>
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-6 sm:h-7 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'reject', transfert: row }); }}
                disabled={isLoading}
              >
                <XCircle size={12} className="lg:mr-1" />
                <span className="hidden lg:inline">Rejeter</span>
              </Button>
            </>
          )}
          {!canValidate && (
            <span className="text-[9px] sm:text-xs text-slate-500 italic flex items-center gap-1">
              <Clock size={10} />
              <span className="hidden sm:inline">En attente</span>
            </span>
          )}
          {/* Cancel button available to all (backend enforces permissions) */}
          <Button
            size="sm"
            variant="danger"
            className="h-6 sm:h-7 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setTransfertToCancel(row); }}
            disabled={isLoading}
            title="Annuler ce transfert"
          >
            <Ban size={12} className="lg:mr-1" />
            <span className="hidden lg:inline">Annuler</span>
          </Button>
        </div>
      );
    }

    // Actions pour les transferts validés (prêts à exécuter)
    if (row.statut === StatutTransfertCoffre.VALIDATED) {
      return (
        <div className="flex items-center gap-1 sm:gap-2">
          {canExecute ? (
            <Button
              size="sm"
              variant="primary"
              className="h-6 sm:h-7 px-2 sm:px-3 text-[10px] sm:text-xs font-medium shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all"
              onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'execute', transfert: row }); }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <>
                  <Play size={12} className="lg:mr-1" />
                  <span className="hidden lg:inline">Exécuter</span>
                </>
              )}
            </Button>
          ) : (
            <span className="text-[9px] sm:text-xs text-amber-400/80 flex items-center gap-1 bg-amber-500/10 px-1.5 sm:px-2.5 py-1 rounded-md">
              <Clock size={10} />
              <span className="hidden sm:inline">En attente</span>
            </span>
          )}
          {/* Cancel button available to all (backend enforces permissions) */}
          <Button
            size="sm"
            variant="danger"
            className="h-6 sm:h-7 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setTransfertToCancel(row); }}
            disabled={isLoading}
            title="Annuler ce transfert"
          >
            <Ban size={12} className="lg:mr-1" />
            <span className="hidden lg:inline">Annuler</span>
          </Button>
        </div>
      );
    }

    // Statuts terminaux (Exécuté, Rejeté, Annulé)
    if (row.statut === StatutTransfertCoffre.EXECUTED) {
      return (
        <span className="text-[10px] sm:text-xs text-emerald-400/60 flex items-center gap-1">
          <CheckCircle2 size={10} />
          <span className="hidden sm:inline">Terminé</span>
        </span>
      );
    }

    if (row.statut === StatutTransfertCoffre.REJECTED || row.statut === StatutTransfertCoffre.CANCELLED) {
      return (
        <span className="text-[10px] sm:text-xs text-red-400/60 flex items-center gap-1">
          <Ban size={10} />
          <span className="hidden sm:inline">{ALL_STATUS_LABELS[row.statut] || row.statut}</span>
        </span>
      );
    }

    return null;
  };



  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Nav bar ── */}
      <div className="shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-2 border-b border-slate-800/60">
        {/* Balance chip — always visible */}
        <div className="hidden xs:flex items-center gap-1.5 bg-blue-500/8 border border-blue-500/15 rounded-lg px-2 py-1.5 shrink-0 mr-0.5">
          <Vault size={13} className="text-blue-400" />
          <span className="text-[11px] font-bold text-white font-mono tabular-nums">
            {isLoadingStats ? '···' : (statsData?.solde || 0).toLocaleString()}
          </span>
          <span className="text-[9px] text-slate-500">FCFA</span>
        </div>

        {/* Tabs — underline style, scrollable */}
        <nav className="flex-1 min-w-0 overflow-x-auto scrollbar-hide" role="tablist">
          <div className="flex items-center">
            {[
              { id: 'operations', label: 'Transferts', icon: ArrowRightLeft },
              { id: 'intercoffres', label: 'Inter-Coffres', icon: Vault },
              { id: 'historique', label: 'Historique', icon: Clock },
              ...(canSupervise ? [{ id: 'supervision', label: 'Supervision', icon: Shield }] : []),
              ...(canConfigure ? [{ id: 'admin', label: 'Admin', icon: Settings }] : [])
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium whitespace-nowrap transition-colors
                    ${isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}
                  `}
                >
                  <tab.icon size={13} />
                  {tab.label}
                  {tab.id === 'operations' && pendingCount > 0 && (
                    <span className="px-1 min-w-[16px] text-center rounded-full bg-amber-500 text-white text-[9px] font-bold leading-[16px]">
                      {pendingCount}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 inset-x-1.5 h-[2px] bg-blue-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Help popover */}
        {TAB_HELP[activeTab] && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowHelp(v => !v)}
              className={`p-1.5 rounded-md transition ${showHelp ? 'text-blue-400 bg-blue-500/10' : 'text-slate-600 hover:text-slate-400'}`}
              aria-label="Aide"
            >
              <Info size={14} />
            </button>
            {showHelp && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHelp(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-72 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-[11px] text-slate-300 leading-relaxed">{TAB_HELP[activeTab]}</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Approvisionner */}
        {canConfigure && (
          <button
            onClick={() => setShowProvisionModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 transition whitespace-nowrap"
          >
            <ArrowDownRight size={13} />
            <span className="hidden sm:inline">Approvisionner</span>
          </button>
        )}
      </div>

      {/* ── Content — fills all remaining space ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar space-y-3">
          {activeTab === 'admin' ? (
            <CoffreAdminPanel agenceId={agenceId} />
          ) : activeTab === 'supervision' ? (
            <TreasurySupervision />
          ) : activeTab === 'intercoffres' ? (
            <TransfertInterCoffresModule
              onBack={() => setActiveTab('operations')}
              userAgenceId={agenceId}
            />
          ) : activeTab === 'historique' ? (
             <CoffreFortHistorique agenceId={agenceId} />
          ) : (
            <>
            {/* Header Stats - Compact & Responsive */}
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
               <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2 sm:p-2.5 flex items-center xs:flex-col xs:items-start justify-between xs:justify-center">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest xs:mb-0.5">Solde Coffre</span>
                  <div className="flex items-center gap-1.5">
                     <Wallet className="text-blue-500 hidden xs:block" size={14} />
                     <div className="text-sm sm:text-base font-bold text-white max-w-full truncate" title={isLoadingStats ? "..." : `${(statsData?.solde || 0).toLocaleString()} FCFA`}>
                        {isLoadingStats ? "..." : `${(statsData?.solde || 0).toLocaleString()} FCFA`}
                     </div>
                  </div>
               </div>
               <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2 sm:p-2.5 flex items-center xs:flex-col xs:items-start justify-between xs:justify-center">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest xs:mb-0.5">En Attente</span>
                  <div className="flex items-center gap-1.5">
                     <Clock className="text-amber-500 hidden xs:block" size={14} />
                     <div className="text-sm sm:text-base font-bold text-white">{pendingCount + (pendingOpeningRequests?.length || 0)} FCFA</div>
                  </div>
               </div>
               <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2 sm:p-2.5 flex items-center xs:flex-col xs:items-start justify-between xs:justify-center">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest xs:mb-0.5">Mouvements J</span>
                  <div className="flex items-center gap-1.5">
                     <ArrowRightLeft className="text-emerald-500 hidden xs:block" size={14} />
                     <div className="text-sm sm:text-base font-bold text-white truncate">{todayVolume.toLocaleString()} <span className="text-[10px] text-slate-400">FCFA</span></div>
                  </div>
               </div>
            </div>

            {/* Pending Opening Requests Section - New Secure Workflow */}
            {(pendingOpeningRequests?.length > 0 || isLoadingOpeningRequests) && (
              <Card className="overflow-hidden bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/30">
                <div className="p-2 border-b border-amber-500/20 flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 rounded-lg bg-amber-500/20 shrink-0">
                      <KeyRound className="w-3 h-3 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-[11px] sm:text-xs flex items-center gap-2">
                        <span className="truncate">Ouverture Caisse</span>
                        {pendingOpeningRequests?.length > 0 && (
                          <span className="px-1.5 py-0 rounded-full bg-amber-500 text-white text-[9px] font-bold animate-pulse shrink-0">
                            {pendingOpeningRequests.length}
                          </span>
                        )}
                      </h3>
                      <p className="text-slate-400 text-[9px] sm:text-[10px] hidden xs:block">Caissiers en attente de dotation</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchOpeningRequests()}
                    disabled={isLoadingOpeningRequests}
                    className="h-6 px-2 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10 shrink-0"
                  >
                    <Loader2
                      size={10}
                      className={isLoadingOpeningRequests ? 'animate-spin' : ''}
                    />
                    <span className="hidden sm:inline ml-1">Actualiser</span>
                  </Button>
                </div>

                {isLoadingOpeningRequests ? (
                  <div className="p-2 text-center">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400 mx-auto" />
                    <p className="text-slate-400 mt-1 text-[10px]">Chargement...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-amber-500/10">
                    {pendingOpeningRequests.map((request: any) => (
                      <div
                        key={request.transfert?.id || request.session?.id}
                        className="p-2 hover:bg-amber-500/5 transition-colors"
                      >
                        <div className="flex flex-col gap-2">
                          {/* Request Info */}
                          <div className="flex items-start gap-2">
                            <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
                              <User className="w-3 h-3 text-slate-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-bold text-white text-[11px] sm:text-xs">
                                  {request.caissierNom || request.transfert?.requestedByNom || 'Caissier'}
                                </span>
                                <span className="text-slate-500 text-[9px] sm:text-[10px]">
                                   • {request.caisseNom || request.transfert?.caisseDestinationNom || 'Caisse'}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                                <span className="text-amber-400 font-bold">
                                  {Number(request.montantDemande || request.transfert?.montant || 0).toLocaleString()} FCFA
                                </span>
                                {request.soldeVeille > 0 && (
                                  <span className="text-slate-500 hidden xs:inline">
                                    (+{Number(request.soldeVeille).toLocaleString()} veille)
                                  </span>
                                )}
                                {request.fundsRequestedAt && (
                                  <span className="text-[9px] text-slate-500">
                                    {format(new Date(request.fundsRequestedAt), "dd/MM HH:mm", { locale: fr })}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions - inline on larger screens */}
                            <div className="hidden sm:flex items-center gap-1 shrink-0">
                              {canValidate && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 px-2 text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all"
                                    onClick={() => setConfirmAction({
                                      type: 'validate-opening',
                                      transfert: {
                                        id: request.transfert?.id,
                                        montant: request.montantDemande || request.transfert?.montant,
                                        caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom,
                                        caissierNom: request.caissierNom || request.transfert?.requestedByNom,
                                        requestedByNom: request.transfert?.requestedByNom
                                      }
                                    })}
                                    disabled={actionLoading === request.transfert?.id}
                                  >
                                    {actionLoading === request.transfert?.id ? (
                                      <Loader2 size={10} className="animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle2 size={10} className="mr-1" />
                                        Valider
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 px-2 text-[9px] font-medium bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                                    onClick={() => setConfirmAction({
                                      type: 'reject-opening',
                                      transfert: {
                                        id: request.transfert?.id,
                                        montant: request.montantDemande || request.transfert?.montant,
                                        caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom,
                                        caissierNom: request.caissierNom || request.transfert?.requestedByNom,
                                        requestedByNom: request.transfert?.requestedByNom
                                      }
                                    })}
                                    disabled={actionLoading === request.transfert?.id}
                                  >
                                    <XCircle size={10} className="mr-1" />
                                    Rejeter
                                  </Button>
                                </>
                              )}
                              {!canValidate && (
                                <span className="text-[9px] text-slate-500 italic flex items-center gap-1">
                                  <Clock size={10} />
                                  En attente
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions - mobile only (full width buttons) */}
                          {canValidate && (
                            <div className="flex sm:hidden items-center gap-2 pl-8">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="flex-1 h-7 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                onClick={() => setConfirmAction({
                                  type: 'validate-opening',
                                  transfert: {
                                    id: request.transfert?.id,
                                    montant: request.montantDemande || request.transfert?.montant,
                                    caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom,
                                    caissierNom: request.caissierNom || request.transfert?.requestedByNom,
                                    requestedByNom: request.transfert?.requestedByNom
                                  }
                                })}
                                disabled={actionLoading === request.transfert?.id}
                              >
                                <CheckCircle2 size={12} className="mr-1" />
                                Valider
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="flex-1 h-7 text-[10px] font-medium bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                                onClick={() => setConfirmAction({
                                  type: 'reject-opening',
                                  transfert: {
                                    id: request.transfert?.id,
                                    montant: request.montantDemande || request.transfert?.montant,
                                    caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom,
                                    caissierNom: request.caissierNom || request.transfert?.requestedByNom,
                                    requestedByNom: request.transfert?.requestedByNom
                                  }
                                })}
                                disabled={actionLoading === request.transfert?.id}
                              >
                                <XCircle size={12} className="mr-1" />
                                Rejeter
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card className="overflow-hidden bg-slate-900/50 backdrop-blur border-slate-800">
              <div className="p-2 border-b border-slate-800 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <ArrowRightLeft className="text-blue-500" size={14} />
                      <h3 className="font-bold text-white text-xs">Transferts</h3>
                   </div>
                   <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => refetch()}
                      disabled={isRefetchingTransferts}
                      className="h-7 px-2 text-[10px] text-slate-400 hover:text-white"
                   >
                      <Loader2 
                          size={12} 
                          className={`mr-1 ${isRefetchingTransferts ? 'animate-spin text-blue-400' : 'text-slate-400'}`} 
                      />
                      Act.
                   </Button>
              </div>
              
              <ResponsiveTable
                  data={transferts}
                  columns={columns}
                  emptyMessage="Aucune demande de transfert en cours."
                  density="compact"
                  onRowClick={(row) => setSelectedTransfert(row)}
                  actions={(row) => renderRowActions(row)}
              />
            </Card>
            </>
          )}
      </div>

      {/* Dialogue de confirmation pour les actions */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title={getConfirmDialogConfig().title}
        message={getConfirmDialogConfig().message}
        variant={getConfirmDialogConfig().variant}
        confirmText={getConfirmDialogConfig().confirmText}
        cancelText="Annuler"
        isLoading={!!actionLoading}
      />

      <ProvisionCoffreModal
        open={showProvisionModal}
        onOpenChange={setShowProvisionModal}
        agenceId={agenceId}
      />

      {/* Cancellation Modal */}
      {transfertToCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isCancelling && setTransfertToCancel(null)}
          />
          <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-white text-base mb-1">
                  Annuler ce transfert ?
                </h3>
                <p className="text-sm text-slate-400">
                  {transfertToCancel.statut === StatutTransfertCoffre.EXECUTED
                    ? 'Un transfert compensatoire (sens inverse) sera créé automatiquement pour maintenir la traçabilité comptable.'
                    : 'Cette action annulera définitivement ce transfert.'}
                </p>
              </div>
            </div>

            {/* Transfer details */}
            <div className="p-3 bg-slate-800/50 rounded-lg space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Montant</span>
                <span className="font-mono font-bold text-white">
                  {Number(transfertToCancel.montant).toLocaleString()} FCFA
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Référence</span>
                <span className="font-mono text-slate-300">{transfertToCancel.reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-300">{getMouvementCoffreLabel(transfertToCancel.typeTransfert)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Statut</span>
                <Badge variant="warning" value={transfertToCancel.statut} className="text-xs" />
              </div>
            </div>

            {/* Reason input */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Raison de l'annulation *
              </label>
              <textarea
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 resize-none"
                placeholder="Expliquez pourquoi vous annulez ce transfert..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                disabled={isCancelling}
              />
              <p className="mt-1 text-xs text-slate-500">
                Minimum 10 caractères requis pour la traçabilité
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 h-9 text-xs"
                onClick={() => {
                  setTransfertToCancel(null);
                  setCancelReason('');
                }}
                disabled={isCancelling}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                className="flex-1 h-9 text-xs cursor-pointer"
                onClick={handleCancelTransfert}
                disabled={isCancelling || !cancelReason.trim() || cancelReason.length < 10}
              >
                {isCancelling ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Annulation...
                  </>
                ) : (
                  <>
                    <XCircle size={14} className="mr-1.5" />
                    Confirmer l'annulation
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Slider détails transfert */}
      {selectedTransfert && (
        <TransfertDetailPanel
          transfert={selectedTransfert}
          onClose={() => setSelectedTransfert(null)}
        />
      )}
    </div>
  );
}

function CoffreFortHistorique({ agenceId }: { agenceId: string }) {
    const [selectedMouvement, setSelectedMouvement] = useState<any>(null);

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: coffreKeys.mouvements(agenceId),
        queryFn: () => coffreApi.getMouvements({ agenceId, limit: 100 }),
    });

    const mouvements = data?.data || [];

    const columns = [
        {
            key: 'dateOperation',
            label: 'Date',
            format: (_: any, row: any) => (
                <div className="flex flex-col leading-tight">
                    <span className="text-[11px] text-white font-medium">
                        {format(new Date(row.dateOperation), "dd MMM", { locale: fr })}
                    </span>
                    <span className="text-[9px] text-slate-500">
                        {format(new Date(row.dateOperation), "HH:mm", { locale: fr })}
                    </span>
                </div>
            )
        },
        {
            key: 'type',
            label: 'Type',
            format: (_: any, row: any) => {
                const isCredit = row.sens === 'CREDIT';
                return (
                    <div className="flex items-center gap-1.5">
                        <Badge
                            variant={isCredit ? 'success' : 'warning'}
                            icon={isCredit ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
                            className="px-1 py-0 text-[9px] h-4"
                            value={isCredit ? 'Entrée' : 'Sortie'}
                        />
                        <span className="text-[10px] text-slate-400 hidden sm:inline truncate max-w-[80px]">
                            {getMouvementCoffreLabel(row.typePaiement || row.metadata?.type || row.sourceModule)}
                        </span>
                    </div>
                );
            }
        },
        {
            key: 'description',
            label: 'Description',
            format: (_: any, row: any) => (
                <div className="flex flex-col max-w-[200px]">
                    <span className="text-[11px] text-slate-300 truncate leading-tight">
                        {row.metadata?.description || row.metadata?.motif || row.reference}
                    </span>
                     {row.initiator && (
                        <span className="text-[9px] text-slate-600 truncate">
                            {row.initiator.prenom} {row.initiator.nom}
                        </span>
                    )}
                </div>
            )
        },
        {
            key: 'montant',
            label: 'Montant',
            align: 'right' as const,
            format: (val: any, row: any) => (
                <span className={`font-bold font-mono text-xs ${row.sens === 'CREDIT' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {row.sens === 'CREDIT' ? '+' : '-'} {Number(val).toLocaleString()} FCFA
                </span>
            )
        }
    ];

    if (isLoading) return (
        <div className="grid grid-cols-1 gap-4">
             <SkeletonCard className="h-64" />
        </div>
    );

    return (
        <>
            <Card className="overflow-hidden bg-slate-900/50 backdrop-blur border-slate-800">
                <div className="p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/40">
                    <div className="flex items-center gap-2">
                        <Clock className="text-slate-500" size={14} />
                        <h3 className="font-bold text-white text-xs">Historique</h3>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <Loader2
                            size={10}
                            className={`mr-1 ${isRefetching ? 'animate-spin text-blue-400' : 'text-slate-400'}`}
                        />
                        Act.
                    </Button>
                </div>

                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <ResponsiveTable
                        data={mouvements}
                        columns={columns}
                        emptyMessage="Aucun mouvement."
                        density="compact"
                        className="text-[10px]"
                        onRowClick={(row) => setSelectedMouvement(row)}
                    />
                </div>
            </Card>

            {/* Panneau de détails */}
            {selectedMouvement && (
                <MouvementDetailPanel
                    mouvement={selectedMouvement}
                    onClose={() => setSelectedMouvement(null)}
                />
            )}
        </>
    );
}

/** Slider de détails d'un mouvement coffre */
function MouvementDetailPanel({ mouvement, onClose }: { mouvement: any; onClose: () => void }) {
    const isCredit = mouvement.sens === 'CREDIT';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Slider Panel */}
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-sm bg-slate-900 border-l border-slate-700 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                {/* Header */}
                <div className={`p-3 sm:p-4 border-b border-slate-700 flex items-center justify-between ${isCredit ? 'bg-emerald-500/10' : 'bg-amber-500/10'} shrink-0`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isCredit ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                            {isCredit ? (
                                <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                            ) : (
                                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-white text-sm sm:text-base">
                                {isCredit ? 'Entrée de fonds' : 'Sortie de fonds'}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                                {getMouvementCoffreLabel(mouvement.typePaiement || mouvement.metadata?.type || mouvement.sourceModule)}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <XCircle size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 pb-20">
                    {/* Montant */}
                    <div className="text-center py-3 sm:py-4 bg-slate-800/50 rounded-lg">
                        <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">Montant</span>
                        <div className={`text-xl sm:text-2xl font-bold font-mono ${isCredit ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isCredit ? '+' : '-'} {Number(mouvement.montant).toLocaleString()} FCFA
                        </div>
                    </div>

                    {/* Détails */}
                    <div className="space-y-1">
                        <DetailRow
                            label="Date & Heure"
                            value={format(new Date(mouvement.dateOperation), "dd MMM yyyy HH:mm", { locale: fr })}
                        />

                        {(mouvement.metadata?.description || mouvement.metadata?.motif) && (
                            <DetailRow
                                label="Description"
                                value={mouvement.metadata?.description || mouvement.metadata?.motif}
                            />
                        )}

                        {mouvement.reference && (
                            <DetailRow label="Référence" value={mouvement.reference} mono />
                        )}

                        {mouvement.initiator && (
                            <DetailRow
                                label="Effectué par"
                                value={`${mouvement.initiator.prenom || ''} ${mouvement.initiator.nom || ''}`.trim() || 'Système'}
                            />
                        )}

                        {mouvement.metadata?.numeroPiece && (
                            <DetailRow label="N° Pièce" value={mouvement.metadata.numeroPiece} mono />
                        )}

                        {mouvement.sourceModule && (
                            <DetailRow label="Module" value={mouvement.sourceModule} />
                        )}

                        {mouvement.soldeApres !== undefined && (
                            <DetailRow
                                label="Solde après"
                                value={`${Number(mouvement.soldeApres).toLocaleString()} FCFA`}
                                mono
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 border-t border-slate-700 bg-slate-900">
                    <Button
                        variant="secondary"
                        className="w-full h-9 text-xs"
                        onClick={onClose}
                    >
                        Fermer
                    </Button>
                </div>
            </div>
        </>
    );
}

/** Slider de détails d'un transfert coffre */
function TransfertDetailPanel({ transfert, onClose }: { transfert: any; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [cancelReason, setCancelReason] = useState('');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isSortie = transfert.typeTransfert === 'COFFRE_VERS_CAISSE';
    const statusMap: Record<string, { color: string; bg: string; label: string }> = {
        [StatutTransfertCoffre.REQUESTED]: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'En attente' },
        [StatutTransfertCoffre.VALIDATED]: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Validé' },
        [StatutTransfertCoffre.EXECUTED]: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Exécuté' },
        [StatutTransfertCoffre.REJECTED]: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Rejeté' },
        [StatutTransfertCoffre.CANCELLED]: { color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Annulé' },
    };
    const statusVariant = statusMap[transfert.statut as string] || { color: 'text-slate-400', bg: 'bg-slate-500/10', label: transfert.statut };

    // Déterminer si le transfert peut être annulé
    const canBeCancelled = [StatutTransfertCoffre.REQUESTED, StatutTransfertCoffre.VALIDATED].includes(transfert.statut);
    const canBeReversed = transfert.statut === StatutTransfertCoffre.EXECUTED && !transfert.verrouille;

    // Vérifier si l'annulation est possible dans les 24h pour les transferts exécutés
    const canReverseWithin24h = canBeReversed && transfert.executedAt &&
        (Date.now() - new Date(transfert.executedAt).getTime()) / (1000 * 60 * 60) < 24;

    const handleCancel = async () => {
        if (!cancelReason.trim()) {
            toast.error('Veuillez indiquer une raison');
            return;
        }

        setIsLoading(true);
        try {
            if (canBeCancelled) {
                // Annulation simple pour REQUESTED ou VALIDATED
                await coffreApi.cancelTransfert(transfert.id, cancelReason);
                toast.success('Transfert annulé avec succès');
            } else if (canReverseWithin24h) {
                // Annulation avec compensation pour EXECUTED
                await coffreApi.reverseTransfert(transfert.id, { reason: cancelReason });
                toast.success('Transfert annulé avec compensation (transfert inversé créé)');
            }

            // Rafraîchir les données
            queryClient.invalidateQueries({ queryKey: coffreKeys.all });
            queryClient.invalidateQueries({ queryKey: caisseKeys.all });

            setShowCancelModal(false);
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Erreur lors de l\'annulation');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Slider Panel */}
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-sm bg-slate-900 border-l border-slate-700 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                {/* Header */}
                <div className={`p-3 sm:p-4 border-b border-slate-700 flex items-center justify-between shrink-0 ${isSortie ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isSortie ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
                            {isSortie ? (
                                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                            ) : (
                                <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-white text-sm sm:text-base">
                                {isSortie ? 'Coffre → Caisse' : 'Caisse → Coffre'}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-slate-400">Demande de transfert</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <XCircle size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 pb-20">
                    {/* Statut */}
                    <div className={`text-center py-2 rounded-lg ${statusVariant.bg}`}>
                        <span className={`text-xs sm:text-sm font-semibold ${statusVariant.color}`}>
                            {statusVariant.label}
                        </span>
                    </div>

                    {/* Montant */}
                    <div className="text-center py-3 sm:py-4 bg-slate-800/50 rounded-lg">
                        <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">Montant</span>
                        <div className={`text-xl sm:text-2xl font-bold font-mono ${isSortie ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {Number(transfert.montant).toLocaleString()} FCFA
                        </div>
                    </div>

                    {/* Détails */}
                    <div className="space-y-1">
                        <DetailRow
                            label="Date demande"
                            value={format(new Date(transfert.createdAt), "dd MMM yyyy HH:mm", { locale: fr })}
                        />

                        <DetailRow
                            label="Caisse"
                            value={isSortie ? transfert.caisseDestinationNom : transfert.caisseSourceNom}
                        />

                        <DetailRow
                            label="Demandé par"
                            value={`${transfert.requestedByPrenom || ''} ${transfert.requestedByNom || ''}`.trim() || '-'}
                        />

                        {transfert.validatedByNom && (
                            <DetailRow
                                label="Validé par"
                                value={`${transfert.validatedByPrenom || ''} ${transfert.validatedByNom || ''}`.trim()}
                            />
                        )}

                        {transfert.validatedAt && (
                            <DetailRow
                                label="Date validation"
                                value={format(new Date(transfert.validatedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                            />
                        )}

                        {transfert.executedByNom && (
                            <DetailRow
                                label="Exécuté par"
                                value={`${transfert.executedByPrenom || ''} ${transfert.executedByNom || ''}`.trim()}
                            />
                        )}

                        {transfert.executedAt && (
                            <DetailRow
                                label="Date exécution"
                                value={format(new Date(transfert.executedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                            />
                        )}

                        {transfert.motif && (
                            <DetailRow label="Motif" value={transfert.motif} />
                        )}

                        {transfert.reference && (
                            <DetailRow label="Référence" value={transfert.reference} mono />
                        )}

                        {transfert.rejectionReason && (
                            <div className="mt-3 p-2 sm:p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <span className="text-[10px] sm:text-xs text-red-400 font-medium block mb-1">Motif de rejet</span>
                                <span className="text-xs sm:text-sm text-red-300">{transfert.rejectionReason}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 border-t border-slate-700 bg-slate-900 space-y-2">
                    {/* Bouton d'annulation si applicable */}
                    {(canBeCancelled || canReverseWithin24h) && (
                        <Button
                            variant="danger"
                            className="w-full h-9 text-xs cursor-pointer"
                            onClick={() => setShowCancelModal(true)}
                        >
                            <XCircle size={14} className="mr-1.5" />
                            {canBeReversed ? 'Annuler avec compensation' : 'Annuler le transfert'}
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        className="w-full h-9 text-xs"
                        onClick={onClose}
                    >
                        Fermer
                    </Button>
                </div>
            </div>

            {/* Modal de confirmation d'annulation */}
            {showCancelModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isLoading && setShowCancelModal(false)} />
                    <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-red-500/20 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-red-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-white text-base mb-1">
                                    Annuler ce transfert ?
                                </h3>
                                <p className="text-sm text-slate-400">
                                    {canBeReversed
                                        ? 'Un transfert compensatoire (sens inverse) sera créé automatiquement pour maintenir la traçabilité comptable.'
                                        : 'Cette action annulera définitivement ce transfert.'}
                                </p>
                            </div>
                        </div>

                        {/* Informations du transfert */}
                        <div className="p-3 bg-slate-800/50 rounded-lg space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Montant</span>
                                <span className="font-mono font-bold text-white">
                                    {Number(transfert.montant).toLocaleString()} FCFA
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Référence</span>
                                <span className="font-mono text-slate-300">{transfert.reference}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Statut</span>
                                <span className={statusVariant.color}>{statusVariant.label}</span>
                            </div>
                        </div>

                        {/* Champ raison */}
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-medium">
                                Raison de l'annulation {canBeReversed ? '(min. 10 caractères)' : ''}
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Expliquez pourquoi ce transfert doit être annulé..."
                                className="w-full h-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                className="flex-1 h-9 text-xs"
                                onClick={() => setShowCancelModal(false)}
                                disabled={isLoading}
                            >
                                Fermer
                            </Button>
                            <Button
                                variant="danger"
                                className="flex-1 h-9 text-xs"
                                onClick={handleCancel}
                                disabled={isLoading || !cancelReason.trim() || (canBeReversed && cancelReason.length < 10)}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                                        Annulation...
                                    </>
                                ) : (
                                    'Confirmer l\'annulation'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/** Ligne de détail réutilisable */
function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between items-start gap-2 sm:gap-4 py-1.5 sm:py-2 border-b border-slate-800 last:border-0">
            <span className="text-[10px] sm:text-xs text-slate-500 shrink-0">{label}</span>
            <span className={`text-xs sm:text-sm text-white text-right break-words min-w-0 ${mono ? 'font-mono text-[10px] sm:text-xs' : ''}`}>
                {value}
            </span>
        </div>
    );
}
