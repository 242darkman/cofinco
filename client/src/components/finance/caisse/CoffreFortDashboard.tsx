
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Settings,
  MoreHorizontal,
  Play,
  Ban,
  Eye,
  Vault
} from "lucide-react";
import { toast } from 'sonner';

import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { coffreApi, sessionCaisseApi } from "@/lib/api-client";
import { SkeletonCard } from '@/components/ui/Skeleton';
import { CoffreAdminPanel } from './CoffreAdminPanel';
import { ProvisionCoffreModal } from './ProvisionCoffreModal';
import { usePermissions } from '../../auth/ProtectedFeature';
import TransfertInterCoffresModule from '../transfert-coffres/TransfertInterCoffresModule';
import { TreasurySupervision } from '../../admin/TreasurySupervision';


interface CoffreFortDashboardProps {
  agenceId: string;
}

// Types pour le dialogue de confirmation
interface ConfirmAction {
  type: 'validate' | 'reject' | 'execute';
  transfert: any;
}

export function CoffreFortDashboard({ agenceId }: CoffreFortDashboardProps) {
  // Fetch transferts
  const { data: transfertsData, isLoading, refetch } = useQuery({
    queryKey: ['transferts-coffre', agenceId],
    queryFn: () => coffreApi.listTransferts({
      agenceId,
      limit: 50, // Increased limit to ensure recent requests are visible
      page: 1
    }),
    enabled: !!agenceId,
    refetchInterval: 30000,
  });

  const { data: statsData, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ["coffre-stats", agenceId],
    queryFn: () => coffreApi.getStats(agenceId),
  });

  const { hasPermission } = usePermissions();
  const canValidate = hasPermission('coffre', 'transfert.validate');
  const canExecute = hasPermission('coffre', 'transfert.execute');
  const canConfigure = hasPermission('coffre', 'config.view') || hasPermission('coffre', 'config.edit');
  const canSupervise = hasPermission('coffre', 'supervision.view') || hasPermission('admin', 'access');


  const [activeTab, setActiveTab] = useState('operations');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showProvisionModal, setShowProvisionModal] = useState(false);

  const transferts = transfertsData?.data || [];

  const pendingCount = transferts.filter((t: any) => t.statut === 'Demandé' || t.statut === 'En attente').length;
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

  const handleConfirmAction = () => {
    if (!confirmAction) return;

    const { type, transfert } = confirmAction;
    if (type === 'validate') {
      handleValidate(transfert.id, true);
    } else if (type === 'reject') {
      handleValidate(transfert.id, false);
    } else if (type === 'execute') {
      handleExecute(transfert.id);
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
        <span className="text-sm text-slate-300">
           {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", { locale: fr })}
        </span>
      )
    },
    { 
      key: 'typeTransfert', 
      label: 'Type',
      format: (_: any, row: any) => (
        <div className="flex items-center gap-2">
            {row.typeTransfert === "COFFRE_VERS_CAISSE" ? (
                <Badge variant="warning" size="sm" icon={<ArrowDownRight size={12} />} value="Sortie" />
            ) : (
                <Badge variant="success" size="sm" icon={<ArrowUpRight size={12} />} value="Entrée" />
            )}
            <span className="text-xs text-slate-400 hidden sm:inline">
                {row.typeTransfert === "COFFRE_VERS_CAISSE" ? "Vers Caisse" : "De Caisse"}
            </span>
        </div>
      )
    },
    { 
      key: 'trajet', 
      label: 'Caisse Concernée',
      format: (_: any, row: any) => (
        <span className="font-medium text-white">
          {row.typeTransfert === "COFFRE_VERS_CAISSE" ? row.caisseDestinationNom : row.caisseSourceNom}
        </span>
      )
    },
    { 
      key: 'montant', 
      label: 'Montant',
      align: 'right' as const,
      format: (val: any) => (
        <span className="font-bold font-mono text-white">
            {Number(val).toLocaleString()} FCFA
        </span>
      )
    },
    { 
      key: 'requestedByNom', 
      label: 'Initié par',
      format: (_: any, row: any) => (
        <span className="text-sm text-slate-400">
            {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
        </span>
      )
    },
    { 
      key: 'statut', 
      label: 'Statut',
      format: (_: any, row: any) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
        if (row.statut === 'Validé' || row.statut === 'Exécuté') variant = 'success';
        if (row.statut === 'Demandé' || row.statut === 'En attente') variant = 'warning';
        if (row.statut === 'Rejeté' || row.statut === 'Annulé') variant = 'danger';

        return <Badge variant={variant} value={row.statut} />;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right' as const,
      format: (_: any, row: any) => {
        const isLoading = actionLoading === row.id;

        // Actions pour les transferts en attente de validation
        if (row.statut === 'Demandé' || row.statut === 'En attente') {
          return (
            <div className="flex justify-end items-center gap-2">
              {canValidate && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all"
                    onClick={() => setConfirmAction({ type: 'validate', transfert: row })}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="mr-1.5" />
                        Valider
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs font-medium bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                    onClick={() => setConfirmAction({ type: 'reject', transfert: row })}
                    disabled={isLoading}
                  >
                    <XCircle size={14} className="mr-1.5" />
                    Rejeter
                  </Button>
                </>
              )}
              {!canValidate && (
                <span className="text-xs text-slate-500 italic flex items-center gap-1.5">
                  <Clock size={12} />
                  En attente de validation
                </span>
              )}
            </div>
          );
        }

        // Actions pour les transferts validés (prêts à exécuter)
        if (row.statut === 'Validé') {
          return (
            <div className="flex justify-end items-center gap-2">
              {canExecute ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="h-8 px-4 text-xs font-medium shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all"
                  onClick={() => setConfirmAction({ type: 'execute', transfert: row })}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Play size={14} className="mr-1.5" />
                      Exécuter
                    </>
                  )}
                </Button>
              ) : (
                <span className="text-xs text-amber-400/80 flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1.5 rounded-md">
                  <Clock size={12} />
                  En attente d'exécution
                </span>
              )}
            </div>
          );
        }

        // Statuts terminaux (Exécuté, Rejeté, Annulé)
        if (row.statut === 'Exécuté') {
          return (
            <span className="text-xs text-emerald-400/60 flex items-center justify-end gap-1.5">
              <CheckCircle2 size={12} />
              Terminé
            </span>
          );
        }

        if (row.statut === 'Rejeté' || row.statut === 'Annulé') {
          return (
            <span className="text-xs text-red-400/60 flex items-center justify-end gap-1.5">
              <Ban size={12} />
              {row.statut}
            </span>
          );
        }

        return <span className="text-slate-600">-</span>;
      }
    }
  ];



  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
             <h2 className="text-2xl font-bold tracking-tight">Coffre-Fort</h2>
             {canConfigure && (
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => setShowProvisionModal(true)}
                >
                    <ArrowDownRight size={14} className="mr-2" />
                    Approvisionner
                </Button>
             )}
        </div>
        
        {/* Simple Tab Switcher if TabGroup not suitable or for quick toggle */}
        <div className="flex space-x-1 sm:space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto">
           <button
             onClick={() => setActiveTab('operations')}
             className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'operations' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <ArrowRightLeft size={16} />
               <span className="hidden sm:inline">Transferts</span>
               <span className="sm:hidden">Caisse</span>
             </div>
           </button>
           <button
             onClick={() => setActiveTab('intercoffres')}
             className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'intercoffres' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <Vault size={16} />
               <span className="hidden sm:inline">Inter-Coffres</span>
               <span className="sm:hidden">Coffres</span>
             </div>
           </button>
           <button
             onClick={() => setActiveTab('historique')}
             className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'historique' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <Clock size={16} />
               Historique
             </div>
           </button>
           {canSupervise && (
           <button
             onClick={() => setActiveTab('supervision')}
             className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'supervision' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <Shield size={16} />
               <span className="hidden sm:inline">Supervision</span>
               <span className="sm:hidden">Sup.</span>
             </div>
           </button>
           )}
           {canConfigure && (
           <button
             onClick={() => setActiveTab('admin')}
             className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === 'admin' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <Settings size={16} />
               <span className="hidden sm:inline">Administration</span>
               <span className="sm:hidden">Admin</span>
             </div>
           </button>
           )}
        </div>
      </div>

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
        {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard 
            title="Solde Coffre"
            value={isLoadingStats ? "..." : `${(statsData?.solde || 0).toLocaleString()} FCFA`}
            icon={Wallet}
            color="primary"
        />
        <StatCard 
            title="En Attente"
            value={pendingCount}
            variant="default"
            color="warning"
            icon={Clock}
        />
        <StatCard 
            title="Mouvements J"
            value={todayVolume}
            variant="default"
            color="primary" // Changed from info to primary
            icon={ArrowRightLeft}
        />
      </div>

      <Card className="overflow-hidden bg-slate-900/50 backdrop-blur border-slate-800">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
             <div>
                <h3 className="font-bold text-white text-lg">Demandes de Transfert</h3>
                <p className="text-slate-400 text-sm">Gestion des mouvements de fonds agence</p>
             </div>
             <Button variant="outline" size="sm" onClick={() => refetch()}>
                <Loader2 size={14} className="mr-2" />
                Actualiser
             </Button>
        </div>
        
        <ResponsiveTable 
            data={transferts}
            columns={columns}
            emptyMessage="Aucune demande de transfert en cours."
        />
      </Card>
      </>
      )}

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
    </div>
  );
}

function CoffreFortHistorique({ agenceId }: { agenceId: string }) {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['coffre-mouvements', agenceId],
        queryFn: () => coffreApi.getMouvements({ agenceId, limit: 100 }),
    });

    const mouvements = data?.data || [];

    const columns = [
        {
            key: 'dateOperation',
            label: 'Date',
            format: (_: any, row: any) => (
                <div className="flex flex-col">
                    <span className="text-sm text-white font-medium">
                        {format(new Date(row.dateOperation), "dd MMM yyyy", { locale: fr })}
                    </span>
                    <span className="text-xs text-slate-400">
                        {format(new Date(row.dateOperation), "HH:mm", { locale: fr })}
                    </span>
                </div>
            )
        },
        {
            key: 'type',
            label: 'Type',
            format: (_: any, row: any) => {
                const isCredit = row.sens === 'Crédit';
                return (
                    <div className="flex items-center gap-2">
                        <Badge 
                            variant={isCredit ? 'success' : 'warning'} 
                            icon={isCredit ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                            value={isCredit ? 'Entrée' : 'Sortie'}
                        />
                        <span className="text-sm text-slate-300">
                            {row.typePaiement || row.metadata?.type || row.sourceModule}
                        </span>
                    </div>
                );
            }
        },
        {
            key: 'description', 
            label: 'Description',
            format: (_: any, row: any) => (
                <div className="flex flex-col max-w-[300px]">
                    <span className="text-sm text-white truncate">
                        {row.metadata?.description || row.metadata?.motif || row.reference}
                    </span>
                     {row.initiator && (
                        <span className="text-xs text-slate-500">
                            Par {row.initiator.prenom} {row.initiator.nom}
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
                <span className={`font-bold font-mono ${row.sens === 'Crédit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {row.sens === 'Crédit' ? '+' : '-'} {Number(val).toLocaleString()} FCFA
                </span>
            )
        }
    ];

    if (isLoading) return (
        <div className="grid grid-cols-1 gap-4">
             <SkeletonCard className="h-96" />
        </div>
    );

    return (
        <Card className="overflow-hidden bg-slate-900/50 backdrop-blur border-slate-800">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-white text-lg">Historique des Mouvements</h3>
                    <p className="text-slate-400 text-sm">Traçabilité complète des opérations du coffre</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <Loader2 size={14} className="mr-2" />
                    Actualiser
                </Button>
            </div>
            
            <ResponsiveTable 
                data={mouvements}
                columns={columns}
                emptyMessage="Aucun mouvement enregistré."
            />
        </Card>
    );
}
