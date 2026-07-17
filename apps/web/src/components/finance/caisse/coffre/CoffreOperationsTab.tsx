/**
 * Onglet « Transferts » du coffre : statistiques, demandes d'ouverture de
 * caisse en attente et tableau des transferts avec actions.
 */
import React, { useCallback, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
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
import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { buildTransfertsColumns } from './transferts-columns';
import { type TransfertCoffreRow, type OpeningRequest, type ConfirmAction } from './types';

export interface CoffreOperationsTabProps {
  statsData: { solde?: number } | undefined;
  isLoadingStats: boolean;
  pendingCount: number;
  todayVolume: number;
  pendingOpeningRequests: OpeningRequest[];
  isLoadingOpeningRequests: boolean;
  refetchOpeningRequests: () => void;
  canValidate: boolean;
  actionLoading: string | null;
  setConfirmAction: (a: ConfirmAction) => void;
  transferts: TransfertCoffreRow[];
  columns: ReturnType<typeof buildTransfertsColumns>;
  renderRowActions: (row: TransfertCoffreRow) => React.ReactNode;
  handleExportTransferts: () => void;
  refetch: () => void;
  isRefetchingTransferts: boolean;
  setSelectedTransfert: (t: TransfertCoffreRow | null) => void;
  currencySymbol: string;
}

export function CoffreOperationsTab({
  statsData, isLoadingStats, pendingCount, todayVolume,
  pendingOpeningRequests, isLoadingOpeningRequests, refetchOpeningRequests,
  canValidate, actionLoading, setConfirmAction,
  transferts, columns, renderRowActions, handleExportTransferts,
  refetch, isRefetchingTransferts, setSelectedTransfert, currencySymbol,
}: CoffreOperationsTabProps) {
  return (
          <>
          {/* Header Stats - Premium Responsive Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
             <div className="bg-surface-elevated border border-edge rounded-xl p-3 sm:p-4 flex flex-col items-start gap-1 sm:gap-2 shadow-xs transition-colors hover:border-accent/30">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider">
                   <Wallet size={14} className="text-status-info" />
                   <span>Solde Coffre</span>
                </div>
                <div className="text-base sm:text-lg lg:text-xl font-black text-content-primary tabular-nums break-words w-full" title={isLoadingStats ? "..." : `${(statsData?.solde || 0).toLocaleString()} ${currencySymbol}`}>
                   {isLoadingStats ? "..." : <>{(statsData?.solde || 0).toLocaleString()} <span className="text-xs sm:text-sm text-content-muted font-sans font-medium">{currencySymbol}</span></>}
                </div>
             </div>
             {(() => {
                const totalPending = pendingCount + (pendingOpeningRequests?.length || 0);
                const hasPending = totalPending > 0;
                return (
                  <div className={`rounded-xl p-3 sm:p-4 flex flex-col items-start gap-1 sm:gap-2 shadow-xs transition-colors border ${hasPending ? 'bg-status-warning-bg/50 border-status-warning/40 hover:border-status-warning' : 'bg-surface-elevated border-edge hover:border-accent/30'}`}>
                     <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider">
                        <Clock size={14} className={hasPending ? 'text-status-warning' : 'text-content-muted'} />
                        <span>Opérations en attente</span>
                     </div>
                     <div className={`text-base sm:text-lg lg:text-xl font-black tabular-nums break-words w-full ${hasPending ? 'text-status-warning' : 'text-content-primary'}`}>
                        {totalPending}
                     </div>
                  </div>
                );
             })()}
             <div className="bg-surface-elevated border border-edge rounded-xl p-3 sm:p-4 flex flex-col items-start gap-1 sm:gap-2 shadow-xs transition-colors hover:border-accent/30">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider">
                   <ArrowRightLeft size={14} className="text-status-success" />
                   <span>Mouvements du Jour</span>
                </div>
                <div className="text-base sm:text-lg lg:text-xl font-black text-content-primary tabular-nums break-words w-full">
                   {todayVolume.toLocaleString()} <span className="text-xs sm:text-sm text-content-muted font-sans font-medium">{currencySymbol}</span>
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
                  {isLoadingOpeningRequests ? (
                    <Spinner size="xs" tone="current" />
                  ) : (
                    <RefreshCw size={10} />
                  )}
                  <span className="ml-1">Actualiser</span>
                </Button>
              </div>
    
              {isLoadingOpeningRequests ? (
                <div className="p-2 text-center">
                  <Spinner size="xs" tone="current" className="text-status-warning mx-auto" />
                  <p className="text-content-muted mt-1 text-[10px]">Chargement...</p>
                </div>
              ) : (
                <div className="divide-y divide-status-warning/10">
                  {pendingOpeningRequests.map((request: OpeningRequest) => (
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
                                {Number(request.montantDemande || request.transfert?.montant || 0).toLocaleString()} {currencySymbol}
                              </span>
                              {(request.soldeVeille ?? 0) > 0 && (
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
                                      id: request.transfert?.id ?? '',
                                      montant: (request.montantDemande || request.transfert?.montant) ?? 0,
                                      caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom || '',
                                      caissierNom: request.caissierNom || request.transfert?.requestedByNom || '',
                                      requestedByNom: request.transfert?.requestedByNom
                                    } as TransfertCoffreRow
                                  })}
                                  disabled={actionLoading === request.transfert?.id}
                                >
                                  {actionLoading === request.transfert?.id ? (
                                    <Spinner size="xs" tone="current" />
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
                                      id: request.transfert?.id ?? '',
                                      montant: (request.montantDemande || request.transfert?.montant) ?? 0,
                                      caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom || '',
                                      caissierNom: request.caissierNom || request.transfert?.requestedByNom || '',
                                      requestedByNom: request.transfert?.requestedByNom
                                    } as TransfertCoffreRow
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
                                  id: request.transfert?.id ?? '',
                                  montant: (request.montantDemande || request.transfert?.montant) ?? 0,
                                  caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom || '',
                                  caissierNom: request.caissierNom || request.transfert?.requestedByNom || '',
                                  requestedByNom: request.transfert?.requestedByNom
                                } as TransfertCoffreRow
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
                                  id: request.transfert?.id ?? '',
                                  montant: (request.montantDemande || request.transfert?.montant) ?? 0,
                                  caisseDestinationNom: request.caisseNom || request.transfert?.caisseDestinationNom || '',
                                  caissierNom: request.caissierNom || request.transfert?.requestedByNom || '',
                                  requestedByNom: request.transfert?.requestedByNom
                                } as TransfertCoffreRow
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
                      variant="secondary"
                      size="sm"
                      onClick={handleExportTransferts}
                      disabled={transferts.length === 0}
                      className="h-8 px-3 text-[11px] font-medium bg-surface-subtle text-content-primary hover:bg-surface-elevated border border-edge shadow-xs transition-all"
                   >
                      <Download size={13} className="mr-1.5" />
                      <span>Exporter CSV</span>
                   </Button>
                   <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isRefetchingTransferts}
                      className="h-8 px-3 text-[11px] font-medium bg-surface-subtle text-content-primary hover:bg-surface-elevated border border-edge shadow-xs transition-all"
                   >
                      {isRefetchingTransferts ? (
                          <Spinner size="xs" tone="accent" className="mr-1.5" />
                      ) : (
                          <RefreshCw size={13} className="mr-1.5 text-content-muted" />
                      )}
                      <span>Actualiser</span>
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
  );
}
