
import React, { useState, useCallback } from 'react';
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
  Download,
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
import { useCurrency } from '@/contexts/CurrencyContext';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { CoffreAdminPanel } from './CoffreAdminPanel';
import { ProvisionCoffreModal } from './ProvisionCoffreModal';
import { usePermissions } from '../../auth/ProtectedFeature';
import TransfertInterCoffresModule from '../transfert-coffres/TransfertInterCoffresModule';
import EvacuationCoffreModule from '../evacuation-coffre/EvacuationCoffreModule';
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
  evacuation: 'Évacuez les fonds du coffre vers une banque, le coffre central ou un transporteur. Workflow complet avec billetage, transit et réconciliation.',
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

  const { currency } = useCurrency();
  const { hasPermission } = usePermissions();
  const canValidate = hasPermission('coffre', 'transfert.validate');
  const canExecute = hasPermission('coffre', 'transfert.execute');
  const canConfigure = hasPermission('coffre', 'config.view') || hasPermission('coffre', 'config.edit');
  const canSupervise = hasPermission('coffre', 'supervision.view') || hasPermission('admin', 'access');
  const canEvacuate = hasPermission('coffre', 'evacuation.view');

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
        description: `Le transfert a été ${approved ? "validé" : "rejeté"}`
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
        description: "Les fonds ont été déplacés"
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
        toast.success('Transfert annulé');
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

  // --- Shared detail card for confirm dialogs ---
  const accentStyles: Record<string, string> = {
    slate: 'border-edge-strong/20 bg-surface-muted0/5',
    emerald: 'border-status-success/20 bg-status-success-bg/50',
    red: 'border-status-danger/20 bg-status-danger-bg/50',
    cyan: 'border-accent/20 bg-accent/5',
  };
  const TransfertDetailCard = ({ rows, accentColor = 'slate' }: { rows: { label: string; value: React.ReactNode; highlight?: boolean }[]; accentColor?: string }) => (
    <div className={`rounded-xl border overflow-hidden ${accentStyles[accentColor] || accentStyles.slate}`}>
      {rows.map((row, i) => (
        <div key={i} className={`flex items-center justify-between gap-3 px-3 sm:px-4 py-2 sm:py-2.5 ${i > 0 ? 'border-t border-edge/40' : ''}`}>
          <span className="text-[10px] sm:text-xs text-content-muted uppercase tracking-wider shrink-0 whitespace-nowrap">{row.label}</span>
          <span className={`text-xs sm:text-sm font-medium text-right whitespace-nowrap ${row.highlight ? 'text-content-primary font-bold font-mono tabular-nums sm:text-base' : 'text-content-secondary'}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );

  const DirectionBadge = ({ type }: { type: string }) => (
    <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold ${
      type === "COFFRE_VERS_CAISSE"
        ? 'bg-status-warning-bg text-status-warning border border-status-warning/20'
        : 'bg-status-success-bg text-status-success border border-status-success/20'
    }`}>
      {type === "COFFRE_VERS_CAISSE" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {type === "COFFRE_VERS_CAISSE" ? "Coffre → Caisse" : "Caisse → Coffre"}
    </span>
  );

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
            <div className="space-y-3">
              <TransfertDetailCard accentColor="emerald" rows={[
                { label: 'Montant', value: <>{montantFormatted} <span className="text-xs">{currency.symbol}</span></>, highlight: true },
                { label: 'Caisse', value: caisse },
                { label: 'Demandé par', value: transfert.requestedByNom },
              ]} />
              <div className="flex items-center gap-1.5">
                <DirectionBadge type={transfert.typeTransfert} />
              </div>
            </div>
          ),
          variant: 'success' as const,
          confirmText: 'Valider le transfert'
        };
      case 'reject':
        return {
          title: 'Rejeter le transfert',
          message: (
            <div className="space-y-3">
              <TransfertDetailCard accentColor="red" rows={[
                { label: 'Montant', value: <>{montantFormatted} <span className="text-xs">{currency.symbol}</span></>, highlight: true },
                { label: 'Caisse', value: caisse },
                { label: 'Demandé par', value: transfert.requestedByNom },
              ]} />
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-danger-bg/50 border border-status-danger/15">
                <AlertTriangle size={14} className="text-status-danger shrink-0" />
                <span className="text-xs text-status-danger/80">Cette action est irréversible. Le demandeur sera notifié.</span>
              </div>
            </div>
          ),
          variant: 'danger' as const,
          confirmText: 'Rejeter le transfert'
        };
      case 'execute':
        return {
          title: 'Exécuter le transfert',
          message: (
            <div className="space-y-3">
              <div className="text-center py-1.5">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-content-primary">{montantFormatted}</span>
                <span className="text-xs sm:text-sm text-content-primary ml-1">{currency.symbol}</span>
              </div>
              <TransfertDetailCard accentColor="cyan" rows={[
                { label: 'Caisse', value: caisse },
                { label: 'Direction', value: <DirectionBadge type={transfert.typeTransfert} /> },
                ...(transfert.reference ? [{ label: 'Réf.', value: <span className="font-mono text-[10px] text-content-muted">{transfert.reference}</span> }] : []),
              ]} />
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-success-bg/50 border border-status-success/15">
                <Play size={13} className="text-status-success shrink-0" />
                <span className="text-xs text-status-success/80">Les fonds seront immédiatement transférés.</span>
              </div>
            </div>
          ),
          variant: 'info' as const,
          confirmText: 'Exécuter maintenant'
        };
      case 'validate-opening':
        return {
          title: "Valider la demande d'ouverture",
          message: (
            <div className="space-y-3">
              <div className="text-center py-1.5">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-content-primary">{montantFormatted}</span>
                <span className="text-xs sm:text-sm text-content-primary ml-1">{currency.symbol}</span>
              </div>
              <TransfertDetailCard accentColor="emerald" rows={[
                { label: 'Caisse', value: transfert.caisseDestinationNom || caisse },
                { label: 'Caissier', value: transfert.caissierNom || transfert.requestedByNom },
              ]} />
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-success-bg/50 border border-status-success/15">
                <KeyRound size={13} className="text-status-success shrink-0" />
                <span className="text-xs text-status-success/80">Le caissier pourra confirmer la réception et ouvrir sa session.</span>
              </div>
            </div>
          ),
          variant: 'success' as const,
          confirmText: 'Valider et envoyer les fonds'
        };
      case 'reject-opening':
        return {
          title: "Rejeter la demande d'ouverture",
          message: (
            <div className="space-y-3">
              <TransfertDetailCard accentColor="red" rows={[
                { label: 'Montant demandé', value: <>{montantFormatted} <span className="text-xs">{currency.symbol}</span></>, highlight: true },
                { label: 'Caisse', value: transfert.caisseDestinationNom || caisse },
                { label: 'Caissier', value: transfert.caissierNom || transfert.requestedByNom },
              ]} />
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-warning-bg/50 border border-status-warning/15">
                <AlertTriangle size={14} className="text-status-warning shrink-0" />
                <span className="text-xs text-status-warning/80">Le caissier sera notifié et devra soumettre une nouvelle demande.</span>
              </div>
            </div>
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
      format: (_: any, row: any) => (
        <span className="text-xs text-content-secondary whitespace-nowrap">
           {format(new Date(row.createdAt), "dd/MM HH:mm", { locale: fr })}
        </span>
      ),
      mobileFormat: (_: any, row: any) => (
        <span className="text-[10px] text-content-muted">
          {format(new Date(row.createdAt), "dd/MM/yy HH:mm", { locale: fr })}
        </span>
      ),
    },
    {
      key: 'typeTransfert',
      label: 'Type',
      primary: true,
      format: (_: any, row: any) => (
        <div className="flex items-center gap-1.5">
            {row.typeTransfert === "COFFRE_VERS_CAISSE" ? (
                <Badge variant="warning" size="sm" icon={<ArrowUpRight size={10} />} value="Sortie" className="text-[10px] whitespace-nowrap" />
            ) : (
                <Badge variant="success" size="sm" icon={<ArrowDownRight size={10} />} value="Entrée" className="text-[10px] whitespace-nowrap" />
            )}
            <span className="text-[10px] text-content-muted hidden xl:inline">
                {row.typeTransfert === "COFFRE_VERS_CAISSE" ? "Vers Caisse" : "De Caisse"}
            </span>
        </div>
      ),
      mobileFormat: (_: any, row: any) => (
        <div className="flex items-center gap-2">
          {row.typeTransfert === "COFFRE_VERS_CAISSE" ? (
            <Badge variant="warning" size="sm" icon={<ArrowUpRight size={10} />} value="Sortie" className="text-[10px]" />
          ) : (
            <Badge variant="success" size="sm" icon={<ArrowDownRight size={10} />} value="Entrée" className="text-[10px]" />
          )}
          <div className="flex flex-col min-w-0">
            <span className={`text-sm font-semibold truncate ${row.typeTransfert === "COFFRE_VERS_CAISSE" ? 'text-status-warning' : 'text-status-success'}`}>
              {row.typeTransfert === "COFFRE_VERS_CAISSE" ? '-' : '+'}{Number(row.montant).toLocaleString()} {currency.symbol}
            </span>
            <span className="text-[10px] text-content-muted truncate">
              {row.typeTransfert === "COFFRE_VERS_CAISSE" ? row.caisseDestinationNom : row.caisseSourceNom}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'trajet',
      label: 'Caisse',
      hideOnMobile: true,
      format: (_: any, row: any) => (
        <span className="font-medium text-content-primary text-xs truncate max-w-[140px] block" title={row.typeTransfert === "COFFRE_VERS_CAISSE" ? row.caisseDestinationNom : row.caisseSourceNom}>
          {row.typeTransfert === "COFFRE_VERS_CAISSE" ? row.caisseDestinationNom : row.caisseSourceNom}
        </span>
      )
    },
    {
      key: 'montant',
      label: 'Montant',
      align: 'right' as const,
      hideOnMobile: true,
      format: (val: any, row: any) => {
        const isSortie = row.typeTransfert === "COFFRE_VERS_CAISSE";
        return (
          <span className={`font-bold font-mono text-xs whitespace-nowrap tabular-nums ${isSortie ? 'text-status-warning' : 'text-status-success'}`}>
              {isSortie ? '-' : '+'}{Number(val).toLocaleString()} <span className="text-[10px]">{currency.symbol}</span>
          </span>
        );
      }
    },
    {
      key: 'requestedByNom',
      label: 'Initié par',
      format: (_: any, row: any) => (
        <span className="text-xs text-content-muted truncate max-w-[120px] block" title={`${row.requestedByNom} ${row.requestedByPrenom || ''}`}>
            {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
        </span>
      ),
      mobileFormat: (_: any, row: any) => (
        <span className="text-[10px] text-content-muted">
          par {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
        </span>
      ),
    },
    {
      key: 'statut',
      label: 'Statut',
      format: (_: any, row: any) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
        if (row.statut === StatutTransfertCoffre.VALIDATED || row.statut === StatutTransfertCoffre.EXECUTED) variant = 'success';
        if (row.statut === StatutTransfertCoffre.REQUESTED) variant = 'warning';
        if (row.statut === StatutTransfertCoffre.REJECTED || row.statut === StatutTransfertCoffre.CANCELLED) variant = 'danger';

        return <Badge variant={variant} value={row.statut} className="text-[9px] sm:text-[10px]" />;
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
                className="h-6 sm:h-7 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium bg-status-success-bg text-status-success border-status-success/30 hover:bg-status-success-bg hover:border-status-success/50 transition-all"
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
                className="h-6 sm:h-7 px-1.5 sm:px-2.5 text-[10px] sm:text-xs font-medium bg-status-danger-bg text-status-danger border-status-danger/30 hover:bg-status-danger-bg hover:border-status-danger/50 transition-all"
                onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'reject', transfert: row }); }}
                disabled={isLoading}
              >
                <XCircle size={12} className="lg:mr-1" />
                <span className="hidden lg:inline">Rejeter</span>
              </Button>
            </>
          )}
          {!canValidate && (
            <span className="text-[9px] sm:text-xs text-content-muted italic flex items-center gap-1">
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
              className="h-6 sm:h-7 px-2 sm:px-3 text-[10px] sm:text-xs font-medium shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-all"
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
            <span className="text-[9px] sm:text-xs text-status-warning/80 flex items-center gap-1 bg-status-warning-bg px-1.5 sm:px-2.5 py-1 rounded-md">
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
        <span className="text-[10px] sm:text-xs text-status-success/60 flex items-center gap-1">
          <CheckCircle2 size={10} />
          <span className="hidden sm:inline">Terminé</span>
        </span>
      );
    }

    if (row.statut === StatutTransfertCoffre.REJECTED || row.statut === StatutTransfertCoffre.CANCELLED) {
      return (
        <span className="text-[10px] sm:text-xs text-status-danger/60 flex items-center gap-1">
          <Ban size={10} />
          <span className="hidden sm:inline">{ALL_STATUS_LABELS[row.statut] || row.statut}</span>
        </span>
      );
    }

    return null;
  };

  // Export Transferts CSV
  const handleExportTransferts = useCallback(() => {
    if (transferts.length === 0) return;
    const headers = ['Date', 'Type', 'Caisse', 'Montant', 'Statut', 'Initié par'];
    const rows = transferts.map((t: any) => [
      format(new Date(t.createdAt), 'dd/MM/yyyy HH:mm', { locale: fr }),
      t.typeTransfert === 'COFFRE_VERS_CAISSE' ? 'Sortie' : 'Entrée',
      t.typeTransfert === 'COFFRE_VERS_CAISSE' ? t.caisseDestinationNom : t.caisseSourceNom,
      `${t.typeTransfert === 'COFFRE_VERS_CAISSE' ? '-' : '+'}${Number(t.montant).toLocaleString('fr-FR')}`,
      t.statut,
      `${t.requestedByNom || ''} ${t.requestedByPrenom || ''}`.trim(),
    ]);
    const bom = '\uFEFF';
    const csvContent = [headers.join(';'), ...rows.map((r: string[]) => r.join(';'))].join('\n');
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `transferts_coffre_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  }, [transferts]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Nav bar ── */}
      <div className="shrink-0 flex items-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-2 border-b border-edge/60">
        {/* Balance chip — always visible */}
        <div className="hidden xs:flex items-center gap-1.5 bg-status-info-bg border border-status-info/15 rounded-lg px-2 py-1.5 shrink-0 mr-0.5">
          <Vault size={13} className="text-status-info" />
          <span className="text-[11px] font-bold text-content-primary font-mono tabular-nums">
            {isLoadingStats ? '···' : (statsData?.solde || 0).toLocaleString()}
          </span>
          <span className="text-[9px] text-content-muted">{currency.symbol}</span>
        </div>

        {/* Tabs — underline style, scrollable */}
        <nav className="flex-1 min-w-0 overflow-x-auto scrollbar-hide" role="tablist">
          <div className="flex items-center">
            {[
              { id: 'operations', label: 'Transferts', icon: ArrowRightLeft },
              { id: 'intercoffres', label: 'Inter-Coffres', icon: Vault },
              ...(canEvacuate ? [{ id: 'evacuation', label: 'Évacuation', icon: ArrowUpRight }] : []),
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
                    ${isActive ? 'text-status-info' : 'text-content-muted hover:text-content-secondary'}
                  `}
                >
                  <tab.icon size={13} />
                  {tab.label}
                  {tab.id === 'operations' && pendingCount > 0 && (
                    <span className="px-1 min-w-[16px] text-center rounded-full bg-status-warning text-white text-[9px] font-bold leading-[16px]">
                      {pendingCount}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 inset-x-1.5 h-[2px] bg-accent rounded-full" />
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
              className={`p-1.5 rounded-md transition ${showHelp ? 'text-status-info bg-status-info-bg' : 'text-content-muted hover:text-content-muted'}`}
              aria-label="Aide"
            >
              <Info size={14} />
            </button>
            {showHelp && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHelp(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-72 p-3 bg-surface border border-edge rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-[11px] text-content-secondary leading-relaxed">{TAB_HELP[activeTab]}</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Approvisionner */}
        {canConfigure && (
          <button
            onClick={() => setShowProvisionModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-[11px] font-semibold text-status-success border border-status-success/30 rounded-lg hover:bg-status-success-bg transition whitespace-nowrap"
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
          ) : activeTab === 'evacuation' ? (
            <EvacuationCoffreModule
              onBack={() => setActiveTab('operations')}
              userAgenceId={agenceId}
            />
          ) : activeTab === 'historique' ? (
             <CoffreFortHistorique agenceId={agenceId} />
          ) : (
            <>
            {/* Header Stats - Compact & Responsive */}
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
               <div className="bg-surface/40 border border-edge-subtle rounded-lg p-2.5 sm:p-3 flex items-center xs:flex-col xs:items-start justify-between xs:justify-center gap-1">
                  <span className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest xs:mb-0.5">Solde Coffre</span>
                  <div className="flex items-center gap-1.5">
                     <Wallet className="text-status-info shrink-0" size={15} />
                     <div className="text-sm sm:text-base lg:text-lg font-bold text-content-primary font-mono tabular-nums max-w-full truncate" title={isLoadingStats ? "..." : `${(statsData?.solde || 0).toLocaleString()} ${currency.symbol}`}>
                        {isLoadingStats ? "..." : <>{(statsData?.solde || 0).toLocaleString()} <span className="text-[10px] sm:text-xs text-content-muted font-sans">{currency.symbol}</span></>}
                     </div>
                  </div>
               </div>
               {(() => {
                  const totalPending = pendingCount + (pendingOpeningRequests?.length || 0);
                  const hasPending = totalPending > 0;
                  return (
                    <div className={`rounded-lg p-2.5 sm:p-3 flex items-center xs:flex-col xs:items-start justify-between xs:justify-center gap-1 border transition-colors ${hasPending ? 'bg-status-warning-bg border-status-warning/40' : 'bg-surface/40 border-edge-subtle'}`}>
                       <span className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest xs:mb-0.5">Opérations en attente</span>
                       <div className="flex items-center gap-1.5">
                          <Clock className={`shrink-0 ${hasPending ? 'text-status-warning' : 'text-content-muted'}`} size={15} />
                          <div className={`text-sm sm:text-base lg:text-lg font-bold font-mono tabular-nums ${hasPending ? 'text-status-warning' : 'text-content-primary'}`}>{totalPending}</div>
                       </div>
                    </div>
                  );
               })()}
               <div className="bg-surface/40 border border-edge-subtle rounded-lg p-2.5 sm:p-3 flex items-center xs:flex-col xs:items-start justify-between xs:justify-center gap-1">
                  <span className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest xs:mb-0.5">Mouvements du Jour</span>
                  <div className="flex items-center gap-1.5">
                     <ArrowRightLeft className="text-status-success shrink-0" size={15} />
                     <div className="text-sm sm:text-base lg:text-lg font-bold text-content-primary font-mono tabular-nums max-w-full truncate">{todayVolume.toLocaleString()} <span className="text-[10px] sm:text-xs text-content-muted font-sans">{currency.symbol}</span></div>
                  </div>
               </div>
            </div>

            {/* Pending Opening Requests Section - New Secure Workflow */}
            {(pendingOpeningRequests?.length > 0 || isLoadingOpeningRequests) && (
              <Card className="overflow-hidden bg-gradient-to-br from-status-warning-bg/50 to-status-warning-bg/50 border-status-warning/30">
                <div className="p-2 border-b border-status-warning/20 flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 rounded-lg bg-status-warning-bg shrink-0">
                      <KeyRound className="w-3 h-3 text-status-warning" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-content-primary text-[11px] sm:text-xs flex items-center gap-2">
                        <span className="truncate">Ouverture Caisse</span>
                        {pendingOpeningRequests?.length > 0 && (
                          <span className="px-1.5 py-0 rounded-full bg-status-warning text-white text-[9px] font-bold animate-pulse shrink-0">
                            {pendingOpeningRequests.length}
                          </span>
                        )}
                      </h3>
                      <p className="text-content-muted text-[9px] sm:text-[10px] hidden xs:block">Caissiers en attente de dotation</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchOpeningRequests()}
                    disabled={isLoadingOpeningRequests}
                    className="h-6 px-2 text-[10px] border-status-warning/30 text-status-warning hover:bg-status-warning-bg shrink-0"
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
                    <Loader2 className="w-4 h-4 animate-spin text-status-warning mx-auto" />
                    <p className="text-content-muted mt-1 text-[10px]">Chargement...</p>
                  </div>
                ) : (
                  <div className="divide-y divide-status-warning/10">
                    {pendingOpeningRequests.map((request: any) => (
                      <div
                        key={request.transfert?.id || request.session?.id}
                        className="p-2 hover:bg-status-warning-bg/50 transition-colors"
                      >
                        <div className="flex flex-col gap-2">
                          {/* Request Info */}
                          <div className="flex items-start gap-2">
                            <div className="p-1.5 rounded-lg bg-surface border border-edge shrink-0">
                              <User className="w-3 h-3 text-content-muted" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-bold text-content-primary text-[11px] sm:text-xs">
                                  {request.caissierNom || request.transfert?.requestedByNom || 'Caissier'}
                                </span>
                                <span className="text-content-muted text-[9px] sm:text-[10px]">
                                   • {request.caisseNom || request.transfert?.caisseDestinationNom || 'Caisse'}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                                <span className="text-status-warning font-bold">
                                  {Number(request.montantDemande || request.transfert?.montant || 0).toLocaleString()} {currency.symbol}
                                </span>
                                {request.soldeVeille > 0 && (
                                  <span className="text-content-muted hidden xs:inline">
                                    (+{Number(request.soldeVeille).toLocaleString()} veille)
                                  </span>
                                )}
                                {request.fundsRequestedAt && (
                                  <span className="text-[9px] text-content-muted">
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
                                    className="h-6 px-2 text-[9px] font-medium bg-status-success-bg text-status-success border-status-success/30 hover:bg-status-success-bg hover:border-status-success/50 transition-all"
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
                                    className="h-6 px-2 text-[9px] font-medium bg-status-danger-bg text-status-danger border-status-danger/30 hover:bg-status-danger-bg hover:border-status-danger/50 transition-all"
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
                                <span className="text-[9px] text-content-muted italic flex items-center gap-1">
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
                                className="flex-1 h-7 text-[10px] font-medium bg-status-success-bg text-status-success border-status-success/30 hover:bg-status-success-bg"
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
                                className="flex-1 h-7 text-[10px] font-medium bg-status-danger-bg text-status-danger border-status-danger/30 hover:bg-status-danger-bg"
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

            <Card className="overflow-hidden bg-surface-base/50 backdrop-blur border-edge">
              <div className="p-2.5 border-b border-edge flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <ArrowRightLeft className="text-status-info" size={14} />
                      <h3 className="font-bold text-content-primary text-xs sm:text-sm">Transferts</h3>
                      {transferts.length > 0 && (
                        <span className="text-[9px] text-content-muted font-medium">{transferts.length}</span>
                      )}
                   </div>
                   <div className="flex items-center gap-1">
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleExportTransferts}
                        disabled={transferts.length === 0}
                        className="h-7 px-2 text-[10px] text-content-muted hover:text-content-primary"
                        title="Exporter en CSV"
                     >
                        <Download size={12} className="mr-1" />
                        <span className="hidden xs:inline">CSV</span>
                     </Button>
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isRefetchingTransferts}
                        className="h-7 px-2 text-[10px] text-content-muted hover:text-content-primary"
                     >
                        <Loader2
                            size={12}
                            className={`mr-1 ${isRefetchingTransferts ? 'animate-spin text-status-info' : 'text-content-muted'}`}
                        />
                        <span className="hidden xs:inline">Actualiser</span>
                        <span className="xs:hidden">Act.</span>
                     </Button>
                   </div>
              </div>

              <ResponsiveTable
                  data={transferts}
                  columns={columns}
                  emptyMessage="Aucune demande de transfert en cours."
                  density="compact"
                  mobileBreakpoint="md"
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
          <div className="relative bg-surface-base border border-edge rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-status-danger-bg rounded-lg">
                <AlertCircle className="w-5 h-5 text-status-danger" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-content-primary text-base mb-1">
                  Annuler ce transfert ?
                </h3>
                <p className="text-sm text-content-muted">
                  {transfertToCancel.statut === StatutTransfertCoffre.EXECUTED
                    ? 'Un transfert compensatoire (sens inverse) sera créé automatiquement pour maintenir la traçabilité comptable.'
                    : 'Cette action annulera définitivement ce transfert.'}
                </p>
              </div>
            </div>

            {/* Transfer details */}
            <div className="p-3 bg-surface/50 rounded-lg space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-content-muted">Montant</span>
                <span className="font-mono font-bold text-content-primary">
                  {Number(transfertToCancel.montant).toLocaleString()} {currency.symbol}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-content-muted">Référence</span>
                <span className="font-mono text-content-secondary">{transfertToCancel.reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-content-muted">Type</span>
                <span className="text-content-secondary">{getMouvementCoffreLabel(transfertToCancel.typeTransfert)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-content-muted">Statut</span>
                <Badge variant="warning" value={transfertToCancel.statut} className="text-xs" />
              </div>
            </div>

            {/* Reason input */}
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1.5">
                Raison de l'annulation *
              </label>
              <textarea
                className="w-full px-3 py-2 bg-surface border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-status-danger/50 focus:border-status-danger resize-none"
                placeholder="Expliquez pourquoi vous annulez ce transfert..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                disabled={isCancelling}
              />
              <p className="mt-1 text-xs text-content-muted">
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
    const { currency } = useCurrency();
    const [selectedMouvement, setSelectedMouvement] = useState<any>(null);

    // Date range filter — defaults to last 30 days
    const today = format(new Date(), 'yyyy-MM-dd');
    const thirtyDaysAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
    const [dateTo, setDateTo] = useState(today);

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: [...coffreKeys.mouvements(agenceId), dateFrom, dateTo],
        queryFn: () => coffreApi.getMouvements({ agenceId, limit: 500, dateFrom, dateTo }),
    });

    const mouvements = data?.data || [];

    // Export CSV
    const handleExportCSV = () => {
      if (mouvements.length === 0) return;
      const headers = ['Date', 'Type', 'Sens', 'Description', 'Montant', 'Effectué par'];
      const rows = mouvements.map((m: any) => [
        format(new Date(m.dateOperation), 'dd/MM/yyyy HH:mm', { locale: fr }),
        getMouvementCoffreLabel(m.typePaiement || m.metadata?.type || m.sourceModule),
        m.sens === 'CREDIT' ? 'Entrée' : 'Sortie',
        (m.metadata?.description || m.metadata?.motif || m.reference || '').replace(/,/g, ' '),
        `${m.sens === 'CREDIT' ? '+' : '-'}${Number(m.montant).toLocaleString('fr-FR')}`,
        m.initiator ? `${m.initiator.prenom || ''} ${m.initiator.nom || ''}`.trim() : '',
      ]);
      const bom = '\uFEFF';
      const csvContent = [headers.join(';'), ...rows.map((r: string[]) => r.join(';'))].join('\n');
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `historique_coffre_${dateFrom}_${dateTo}.csv`;
      link.click();
    };

    const columns = [
        {
            key: 'dateOperation',
            label: 'Date',
            format: (_: any, row: any) => (
                <div className="flex flex-col leading-tight">
                    <span className="text-[11px] text-content-primary font-medium">
                        {format(new Date(row.dateOperation), "dd MMM", { locale: fr })}
                    </span>
                    <span className="text-[9px] text-content-muted">
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
                        <span className="text-[10px] text-content-muted hidden sm:inline truncate max-w-[80px]">
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
                    <span className="text-[11px] text-content-secondary truncate leading-tight">
                        {row.metadata?.description || row.metadata?.motif || row.reference}
                    </span>
                     {row.initiator && (
                        <span className="text-[9px] text-content-muted truncate">
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
                <span className={`font-bold font-mono text-xs ${row.sens === 'CREDIT' ? 'text-status-success' : 'text-status-warning'}`}>
                    {row.sens === 'CREDIT' ? '+' : '-'} {Number(val).toLocaleString()} {currency.symbol}
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
            <Card className="overflow-hidden bg-surface-base/50 backdrop-blur border-edge">
                <div className="p-2 border-b border-edge space-y-2 bg-surface-base/40">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Clock className="text-content-muted" size={14} />
                            <h3 className="font-bold text-content-primary text-xs">Historique</h3>
                            {mouvements.length > 0 && (
                              <span className="text-[9px] text-content-muted">{mouvements.length}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleExportCSV}
                                disabled={mouvements.length === 0}
                                className="h-6 px-2 text-[10px] text-content-muted hover:text-content-primary hover:bg-surface"
                                title="Exporter en CSV"
                            >
                                <Download size={10} className="mr-1" />
                                CSV
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refetch()}
                                disabled={isRefetching}
                                className="h-6 px-2 text-[10px] text-content-muted hover:text-content-primary hover:bg-surface"
                            >
                                <Loader2
                                    size={10}
                                    className={`mr-1 ${isRefetching ? 'animate-spin text-status-info' : 'text-content-muted'}`}
                                />
                                Act.
                            </Button>
                        </div>
                    </div>
                    {/* Date Range Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                            <label className="text-[10px] text-content-muted shrink-0">Du</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="px-1.5 py-1 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary w-[110px]"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <label className="text-[10px] text-content-muted shrink-0">Au</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                max={today}
                                className="px-1.5 py-1 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary w-[110px]"
                            />
                        </div>
                    </div>
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
    const { currency } = useCurrency();
    const isCredit = mouvement.sens === 'CREDIT';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Slider Panel */}
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-sm bg-surface-base border-l border-edge shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                {/* Header */}
                <div className={`p-3 sm:p-4 border-b border-edge flex items-center justify-between ${isCredit ? 'bg-status-success-bg' : 'bg-status-warning-bg'} shrink-0`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isCredit ? 'bg-status-success-bg' : 'bg-status-warning-bg'}`}>
                            {isCredit ? (
                                <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                            ) : (
                                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-content-primary text-sm sm:text-base">
                                {isCredit ? 'Entrée de fonds' : 'Sortie de fonds'}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-content-muted truncate">
                                {getMouvementCoffreLabel(mouvement.typePaiement || mouvement.metadata?.type || mouvement.sourceModule)}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors shrink-0"
                    >
                        <XCircle size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 pb-20">
                    {/* Montant */}
                    <div className="text-center py-3 sm:py-4 bg-surface/50 rounded-lg">
                        <span className="text-[10px] sm:text-xs text-content-muted uppercase tracking-wide">Montant</span>
                        <div className={`text-xl sm:text-2xl font-bold font-mono ${isCredit ? 'text-status-success' : 'text-status-warning'}`}>
                            {isCredit ? '+' : '-'} {Number(mouvement.montant).toLocaleString()} {currency.symbol}
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
                                value={`${Number(mouvement.soldeApres).toLocaleString()} ${currency.symbol}`}
                                mono
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 border-t border-edge bg-surface-base">
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
    const { currency } = useCurrency();
    const queryClient = useQueryClient();
    const [cancelReason, setCancelReason] = useState('');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isSortie = transfert.typeTransfert === 'COFFRE_VERS_CAISSE';
    const statusMap: Record<string, { color: string; bg: string; label: string }> = {
        [StatutTransfertCoffre.REQUESTED]: { color: 'text-status-warning', bg: 'bg-status-warning-bg', label: 'En attente' },
        [StatutTransfertCoffre.VALIDATED]: { color: 'text-status-info', bg: 'bg-status-info-bg', label: 'Validé' },
        [StatutTransfertCoffre.EXECUTED]: { color: 'text-status-success', bg: 'bg-status-success-bg', label: 'Exécuté' },
        [StatutTransfertCoffre.REJECTED]: { color: 'text-status-danger', bg: 'bg-status-danger-bg', label: 'Rejeté' },
        [StatutTransfertCoffre.CANCELLED]: { color: 'text-content-muted', bg: 'bg-surface-subtle/30', label: 'Annulé' },
    };
    const statusVariant = statusMap[transfert.statut as string] || { color: 'text-content-muted', bg: 'bg-surface-subtle/30', label: transfert.statut };

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
                toast.success('Transfert annulé');
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
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-sm bg-surface-base border-l border-edge shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                {/* Header */}
                <div className={`p-3 sm:p-4 border-b border-edge flex items-center justify-between shrink-0 ${isSortie ? 'bg-status-warning-bg' : 'bg-status-success-bg'}`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isSortie ? 'bg-status-warning-bg' : 'bg-status-success-bg'}`}>
                            {isSortie ? (
                                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                            ) : (
                                <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-content-primary text-sm sm:text-base">
                                {isSortie ? 'Coffre → Caisse' : 'Caisse → Coffre'}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-content-muted">Demande de transfert</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors shrink-0"
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
                    <div className="text-center py-3 sm:py-4 bg-surface/50 rounded-lg">
                        <span className="text-[10px] sm:text-xs text-content-muted uppercase tracking-wide">Montant</span>
                        <div className={`text-xl sm:text-2xl font-bold font-mono ${isSortie ? 'text-status-warning' : 'text-status-success'}`}>
                            {Number(transfert.montant).toLocaleString()} {currency.symbol}
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
                            <div className="mt-3 p-2 sm:p-3 bg-status-danger-bg border border-status-danger/20 rounded-lg">
                                <span className="text-[10px] sm:text-xs text-status-danger font-medium block mb-1">Motif de rejet</span>
                                <span className="text-xs sm:text-sm text-status-danger/80">{transfert.rejectionReason}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 border-t border-edge bg-surface-base space-y-2">
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
                    <div className="relative bg-surface-base border border-edge rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-status-danger-bg rounded-lg">
                                <AlertCircle className="w-5 h-5 text-status-danger" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-content-primary text-base mb-1">
                                    Annuler ce transfert ?
                                </h3>
                                <p className="text-sm text-content-muted">
                                    {canBeReversed
                                        ? 'Un transfert compensatoire (sens inverse) sera créé automatiquement pour maintenir la traçabilité comptable.'
                                        : 'Cette action annulera définitivement ce transfert.'}
                                </p>
                            </div>
                        </div>

                        {/* Informations du transfert */}
                        <div className="p-3 bg-surface/50 rounded-lg space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-content-muted">Montant</span>
                                <span className="font-mono font-bold text-content-primary">
                                    {Number(transfert.montant).toLocaleString()} {currency.symbol}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-content-muted">Référence</span>
                                <span className="font-mono text-content-secondary">{transfert.reference}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-content-muted">Statut</span>
                                <span className={statusVariant.color}>{statusVariant.label}</span>
                            </div>
                        </div>

                        {/* Champ raison */}
                        <div className="space-y-2">
                            <label className="text-xs text-content-muted font-medium">
                                Raison de l'annulation {canBeReversed ? '(min. 10 caractères)' : ''}
                            </label>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Expliquez pourquoi ce transfert doit être annulé..."
                                className="w-full h-20 px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-status-danger/50"
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
        <div className="flex justify-between items-start gap-2 sm:gap-4 py-1.5 sm:py-2 border-b border-edge last:border-0">
            <span className="text-[10px] sm:text-xs text-content-muted shrink-0">{label}</span>
            <span className={`text-xs sm:text-sm text-content-primary text-right break-words min-w-0 ${mono ? 'font-mono text-[10px] sm:text-xs' : ''}`}>
                {value}
            </span>
        </div>
    );
}
