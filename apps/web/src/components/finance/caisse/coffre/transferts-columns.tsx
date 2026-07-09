/**
 * Colonnes du tableau des transferts coffre et actions par ligne
 * (valider, rejeter, exécuter, annuler) selon les permissions.
 */
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
import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup, ConfirmDialog, IconButton } from "@/components/ui";
import { StatutTransfertCoffre, getMouvementCoffreLabel } from "@shared/enum/status-constants";
import { ALL_STATUS_LABELS } from "@/lib/status-labels";
import { type TransfertCoffreRow, type ConfirmAction } from './types';

export function buildTransfertsColumns(currencySymbol: string) {
  return [
  {
    key: 'createdAt',
    label: 'Date',
    format: (_: unknown, row: TransfertCoffreRow) => (
      <span className="text-xs text-content-secondary whitespace-nowrap">
         {format(new Date(row.createdAt), "dd/MM HH:mm", { locale: fr })}
      </span>
    ),
    mobileFormat: (_: unknown, row: TransfertCoffreRow) => (
      <span className="text-[10px] text-content-muted">
        {format(new Date(row.createdAt), "dd/MM/yy HH:mm", { locale: fr })}
      </span>
    ),
  },
  {
    key: 'typeTransfert',
    label: 'Type',
    primary: true,
    format: (_: unknown, row: TransfertCoffreRow) => (
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
    mobileFormat: (_: unknown, row: TransfertCoffreRow) => (
      <div className="flex items-center gap-2">
        {row.typeTransfert === "COFFRE_VERS_CAISSE" ? (
          <Badge variant="warning" size="sm" icon={<ArrowUpRight size={10} />} value="Sortie" className="text-[10px]" />
        ) : (
          <Badge variant="success" size="sm" icon={<ArrowDownRight size={10} />} value="Entrée" className="text-[10px]" />
        )}
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-semibold truncate ${row.typeTransfert === "COFFRE_VERS_CAISSE" ? 'text-status-warning' : 'text-status-success'}`}>
            {row.typeTransfert === "COFFRE_VERS_CAISSE" ? '-' : '+'}{Number(row.montant).toLocaleString()} {currencySymbol}
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
    format: (_: unknown, row: TransfertCoffreRow) => (
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
    format: (val: unknown, row: TransfertCoffreRow) => {
      const isSortie = row.typeTransfert === "COFFRE_VERS_CAISSE";
      return (
        <span className={`font-bold font-mono text-xs whitespace-nowrap tabular-nums ${isSortie ? 'text-status-warning' : 'text-status-success'}`}>
            {isSortie ? '-' : '+'}{Number(val).toLocaleString()} <span className="text-[10px]">{currencySymbol}</span>
        </span>
      );
    }
  },
  {
    key: 'requestedByNom',
    label: 'Initié par',
    format: (_: unknown, row: TransfertCoffreRow) => (
      <span className="text-xs text-content-muted truncate max-w-[120px] block" title={`${row.requestedByNom} ${row.requestedByPrenom || ''}`}>
          {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
      </span>
    ),
    mobileFormat: (_: unknown, row: TransfertCoffreRow) => (
      <span className="text-[10px] text-content-muted">
        par {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
      </span>
    ),
  },
  {
    key: 'statut',
    label: 'Statut',
    format: (_: unknown, row: TransfertCoffreRow) => {
      let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
      if (row.statut === StatutTransfertCoffre.VALIDATED || row.statut === StatutTransfertCoffre.EXECUTED) variant = 'success';
      if (row.statut === StatutTransfertCoffre.REQUESTED) variant = 'warning';
      if (row.statut === StatutTransfertCoffre.REJECTED || row.statut === StatutTransfertCoffre.CANCELLED) variant = 'danger';

      return <Badge variant={variant} value={row.statut} className="text-[9px] sm:text-[10px]" />;
    }
  },
];
}

// Fonction d'actions extraite pour être réutilisée dans la prop actions (mobile + desktop)
export interface RowActionsContext {
  actionLoading: string | null;
  canValidate: boolean;
  canExecute: boolean;
  setConfirmAction: (a: ConfirmAction) => void;
  setTransfertToCancel: (t: TransfertCoffreRow) => void;
}

export function buildRenderRowActions(ctx: RowActionsContext) {
  const { actionLoading, canValidate, canExecute, setConfirmAction, setTransfertToCancel } = ctx;
  return (row: TransfertCoffreRow) => {
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
}
