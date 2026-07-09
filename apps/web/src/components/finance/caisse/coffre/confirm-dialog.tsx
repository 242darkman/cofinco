/**
 * Configuration des dialogues de confirmation des actions coffre
 * (validation, rejet, exécution, ouverture de caisse).
 */
import React, { useCallback, useState } from 'react';
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
import { type ConfirmAction } from './types';

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

export function getConfirmDialogConfig(confirmAction: ConfirmAction | null, currencySymbol: string) {
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
              { label: 'Montant', value: <>{montantFormatted} <span className="text-xs">{currencySymbol}</span></>, highlight: true },
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
              { label: 'Montant', value: <>{montantFormatted} <span className="text-xs">{currencySymbol}</span></>, highlight: true },
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
              <span className="text-xs sm:text-sm text-content-primary ml-1">{currencySymbol}</span>
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
              <span className="text-xs sm:text-sm text-content-primary ml-1">{currencySymbol}</span>
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
              { label: 'Montant demandé', value: <>{montantFormatted} <span className="text-xs">{currencySymbol}</span></>, highlight: true },
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
}
