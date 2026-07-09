/**
 * Hook d'orchestration des transferts coffre ↔ caisses : requêtes (transferts,
 * stats, demandes d'ouverture), états d'action et handlers métier (validation,
 * exécution, annulation avec compensation, export CSV).
 */
import React, { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from 'sonner';

import { coffreApi, sessionCaisseApi } from "@/lib/api-client";
import { StatutTransfertCoffre, getMouvementCoffreLabel } from "@shared/enum/status-constants";
import { coffreKeys, caisseKeys } from '../../../../lib/query-keys';


import { type TransfertCoffreRow, type ConfirmAction } from './types';

export function useCoffreTransferts(agenceId: string) {
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
  
  
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedTransfert, setSelectedTransfert] = useState<any>(null);
  
  // Cancellation states
  const [transfertToCancel, setTransfertToCancel] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  
  const transferts = transfertsData?.data || [];
  
  const pendingCount = transferts.filter((t: TransfertCoffreRow) => t.statut === StatutTransfertCoffre.REQUESTED).length;
  const todayVolume = transferts
    .filter((t: TransfertCoffreRow) => new Date(t.createdAt).toDateString() === new Date().toDateString())
    .reduce((acc: number, t: TransfertCoffreRow) => acc + Number(t.montant), 0);
  
  const handleValidate = async (id: string, approved: boolean) => {
    setActionLoading(id);
    try {
      await coffreApi.validateTransfert(id, approved);
      toast.success(approved ? "Transfert validé" : "Transfert rejeté", {
        description: `Le transfert a été ${approved ? "validé" : "rejeté"}`
      });
      refetch();
    } catch (e: unknown) {
      const errorMessage = (e instanceof Error ? e.message : "");
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
    } catch (e: unknown) {
      const errorMessage = (e instanceof Error ? e.message : "");
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
    } catch (e: unknown) {
      const errorMessage = (e instanceof Error ? e.message : "");
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
    } catch (error: unknown) {
      toast.error((error as Error).message || 'Erreur lors de l\'annulation');
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
  
  // Export Transferts CSV
  const handleExportTransferts = useCallback(() => {
    if (transferts.length === 0) return;
    const headers = ['Date', 'Type', 'Caisse', 'Montant', 'Statut', 'Initié par'];
    const rows = transferts.map((t: TransfertCoffreRow) => [
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

  return {
    transferts, isLoading, refetch, isRefetchingTransferts,
    statsData, isLoadingStats, refetchStats,
    pendingOpeningRequests, isLoadingOpeningRequests, refetchOpeningRequests,
    pendingCount, todayVolume,
    confirmAction, setConfirmAction,
    actionLoading,
    selectedTransfert, setSelectedTransfert,
    transfertToCancel, setTransfertToCancel,
    cancelReason, setCancelReason, isCancelling,
    handleCancelTransfert, handleConfirmAction, handleExportTransferts,
  };
}
