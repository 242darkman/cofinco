/**
 * Tableau de bord Coffre-Fort — coquille de navigation.
 *
 * L'orchestration des données et les vues sont découpées dans ./coffre :
 *   - use-coffre-transferts.ts — requêtes, états et handlers métier ;
 *   - CoffreOperationsTab.tsx — onglet transferts (stats, ouvertures, tableau) ;
 *   - transferts-columns.tsx — colonnes et actions par ligne ;
 *   - confirm-dialog.tsx — contenus des dialogues de confirmation ;
 *   - CancelTransfertModal.tsx / TransfertDetailPanel.tsx / CoffreFortHistorique.tsx.
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, XCircle, ArrowRightLeft, Wallet, Clock, ArrowUpRight, ArrowDownRight, Shield, AlertTriangle, AlertCircle, Settings, Download, MoreHorizontal, Play, Ban, Eye, Vault, User, KeyRound, Info, X } from 'lucide-react';
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


import { TAB_HELP } from './coffre/types';
import { useCoffreTransferts } from './coffre/use-coffre-transferts';
import { getConfirmDialogConfig } from './coffre/confirm-dialog';
import { buildTransfertsColumns, buildRenderRowActions } from './coffre/transferts-columns';
import { CoffreOperationsTab } from './coffre/CoffreOperationsTab';
import { CancelTransfertModal } from './coffre/CancelTransfertModal';
import { CoffreFortHistorique } from './coffre/CoffreFortHistorique';
import { TransfertDetailPanel } from './coffre/TransfertDetailPanel';

interface CoffreFortDashboardProps {
  agenceId: string;
}

/** Row returned by coffreApi.listTransferts — transferts coffre ↔ caisse */

export function CoffreFortDashboard({ agenceId }: CoffreFortDashboardProps) {
  const { currency } = useCurrency();
  const { hasPermission } = usePermissions();
  const canValidate = hasPermission('coffre', 'transfert.validate');
  const canExecute = hasPermission('coffre', 'transfert.execute');
  const canConfigure = hasPermission('coffre', 'config.view') || hasPermission('coffre', 'config.edit');
  const canSupervise = hasPermission('coffre', 'supervision.view') || hasPermission('admin', 'access');
  const canEvacuate = hasPermission('coffre', 'evacuation.view');

  const [activeTab, setActiveTab] = useState('operations');
  const [showHelp, setShowHelp] = useState(false);
  const [showProvisionModal, setShowProvisionModal] = useState(false);

  const coffre = useCoffreTransferts(agenceId);
  const {
    transferts, isLoading, refetch, isRefetchingTransferts,
    statsData, isLoadingStats,
    pendingOpeningRequests, isLoadingOpeningRequests, refetchOpeningRequests,
    pendingCount, todayVolume,
    confirmAction, setConfirmAction, actionLoading,
    selectedTransfert, setSelectedTransfert,
    transfertToCancel, setTransfertToCancel,
    cancelReason, setCancelReason, isCancelling,
    handleCancelTransfert, handleConfirmAction, handleExportTransferts,
  } = coffre;

  const columns = buildTransfertsColumns(currency.symbol);
  const renderRowActions = buildRenderRowActions({
    actionLoading, canValidate, canExecute, setConfirmAction, setTransfertToCancel,
  });
  const dialogConfig = getConfirmDialogConfig(confirmAction, currency.symbol);

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

        {/* Premium Compact Navigation */}
        <nav className="flex-1 min-w-0 overflow-x-auto scrollbar-hide py-1" role="tablist">
          <div className="flex items-center gap-1.5 p-1 bg-surface-muted/20 border border-edge rounded-2xl w-fit">
            {[
              { id: 'operations', label: 'Transferts', icon: ArrowRightLeft },
              { id: 'intercoffres', label: 'Inter-Coffres', icon: Vault },
              ...(canEvacuate ? [{ id: 'evacuation', label: 'Évacuation', icon: ArrowUpRight }] : []),
              { id: 'historique', label: 'Historique', icon: Clock },
              ...(canSupervise ? [{ id: 'supervision', label: 'Supervision', icon: Shield }] : []),
              ...(canConfigure ? [{ id: 'admin', label: 'Admin', icon: Settings }] : [])
            ].map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2 outline-none group
                    ${isActive ? 'text-accent' : 'text-content-muted hover:text-content-primary hover:bg-surface-subtle'}
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-accent/10 border border-accent/20 shadow-sm rounded-xl" />
                  )}
                  <Icon size={14} className={`relative z-10 transition-colors ${isActive ? 'text-accent' : 'opacity-60'}`} />
                  <span className="relative z-10 whitespace-nowrap uppercase tracking-wider">{tab.label}</span>
                  {tab.id === 'operations' && pendingCount > 0 && (
                    <span className={`
                      relative z-10 text-[9px] px-1.5 py-0.5 rounded-full font-black min-w-[16px] text-center
                      ${isActive ? 'bg-accent text-white shadow-sm' : 'bg-surface-elevated border border-edge text-content-muted'}
                    `}>
                      {pendingCount}
                    </span>
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
            <CoffreOperationsTab
              statsData={statsData}
              isLoadingStats={isLoadingStats}
              pendingCount={pendingCount}
              todayVolume={todayVolume}
              pendingOpeningRequests={pendingOpeningRequests}
              isLoadingOpeningRequests={isLoadingOpeningRequests}
              refetchOpeningRequests={refetchOpeningRequests}
              canValidate={canValidate}
              actionLoading={actionLoading}
              setConfirmAction={setConfirmAction}
              transferts={transferts}
              columns={columns}
              renderRowActions={renderRowActions}
              handleExportTransferts={handleExportTransferts}
              refetch={refetch}
              isRefetchingTransferts={isRefetchingTransferts}
              setSelectedTransfert={setSelectedTransfert}
              currencySymbol={currency.symbol}
            />
          )}
      </div>

      {/* Dialogue de confirmation pour les actions */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title={dialogConfig.title}
        message={dialogConfig.message}
        variant={dialogConfig.variant}
        confirmText={dialogConfig.confirmText}
        cancelText="Annuler"
        isLoading={!!actionLoading}
      />

      <ProvisionCoffreModal
        open={showProvisionModal}
        onOpenChange={setShowProvisionModal}
        agenceId={agenceId}
      />

      {transfertToCancel && (
        <CancelTransfertModal
          transfert={transfertToCancel}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          isCancelling={isCancelling}
          onConfirm={handleCancelTransfert}
          onClose={() => setTransfertToCancel(null)}
          currencySymbol={currency.symbol}
        />
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
