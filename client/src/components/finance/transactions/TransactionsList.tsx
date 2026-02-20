import React, { useCallback, useMemo, type CSSProperties, type ReactElement } from 'react';
import { List as VirtualList } from 'react-window';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  CheckCircle,
  XCircle,
  Hourglass,
  FileText,
  ChevronRight
} from 'lucide-react';
import { formatMoney } from '../../../lib/format';
import { Badge } from '../../ui';
import { getStatusLabel, OPERATION_STATUS_LABELS, ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { isIncomingOperation } from '@shared/config/caisse-operations';

// --- Types ---

/** Operation status - strict EN values */
export type OperationStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';

export interface TransactionItem {
  id: string;
  reference: string;
  amount: number;
  type: string;
  typeOperation?: string;
  status: OperationStatus | string;
  date: string | Date;
  description?: string;
  client?: {
    name: string;
    phone?: string;
    accountNumber?: string;
  };
  agent?: string;
  modePaiement?: string;
  createdAt?: string;
}

export interface TransactionsListProps {
  transactions: TransactionItem[];
  onTransactionClick?: (transaction: TransactionItem) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  showHeader?: boolean;
  headerTitle?: string;
  onViewAll?: () => void;
  maxItems?: number;
  className?: string;
  compactMode?: boolean;
  /** When provided, overrides the default 600px VirtualList height cap */
  listHeight?: number;
}

// --- Helper Functions ---

/** Détermine si une opération est une entrée (crédit pour la caisse) */
const isEntree = (type: string): boolean => isIncomingOperation(type);

/** Normalize DB status to canonical display values */
const normalizeStatus = (status: string): OperationStatus => {
  const s = status.toUpperCase();
  if (s === 'POSTED' || s === 'SUCCESS' || s === 'COMPLETED') return 'SUCCESS';
  if (s === 'FAILED' || s === 'ERROR') return 'FAILED';
  if (s === 'PENDING') return 'PENDING';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
  return 'SUCCESS';
};

/** Formats the description: translates raw enum codes to French labels */
const formatDescription = (description: string): string => {
  if (!description) return '';
  // If it's a raw enum value (ALL_CAPS_WITH_UNDERSCORES), translate via label map
  if (/^[A-Z][A-Z0-9_]+$/.test(description) && ALL_STATUS_LABELS[description]) {
    return ALL_STATUS_LABELS[description];
  }
  return description
    .replace(/\bSAVINGS\b/g, 'ÉPARGNE')
    .replace(/\bCURRENT\b/g, 'COURANT')
    .replace(/\bACTIVE\b/g, 'ACTIF');
};

/** Get status configuration with proper colors and icon */
const getStatusConfig = (status: string) => {
  const normalized = normalizeStatus(status);
  const label = getStatusLabel(normalized, OPERATION_STATUS_LABELS);

  const configs: Record<OperationStatus, { icon: typeof CheckCircle; color: string; bg: string; badgeVariant: 'success' | 'danger' | 'warning' | 'neutral' }> = {
    SUCCESS: {
      icon: CheckCircle,
      color: 'text-status-success',
      bg: 'bg-status-success-bg',
      badgeVariant: 'success'
    },
    FAILED: {
      icon: XCircle,
      color: 'text-status-danger',
      bg: 'bg-status-danger-bg',
      badgeVariant: 'danger'
    },
    PENDING: {
      icon: Hourglass,
      color: 'text-status-warning',
      bg: 'bg-status-warning-bg',
      badgeVariant: 'warning'
    },
    CANCELLED: {
      icon: XCircle,
      color: 'text-content-muted',
      bg: 'bg-surface-subtle/30',
      badgeVariant: 'neutral'
    }
  };

  return { ...configs[normalized], label };
};

// --- Row Props Type for react-window ---
interface TransactionRowProps {
  transactions: TransactionItem[];
  onTransactionClick?: (transaction: TransactionItem) => void;
  compactMode?: boolean;
}

// --- Row Component for virtualized list ---
function MobileTransactionRow({
  index,
  style,
  transactions,
  onTransactionClick,
  compactMode,
}: {
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
  index: number;
  style: CSSProperties;
} & TransactionRowProps): ReactElement | null {
  const tx = transactions[index];
  if (!tx) return null;

  const isCredit = isEntree(tx.typeOperation || tx.type);
  const statusConfig = getStatusConfig(tx.status);
  const StatusIcon = statusConfig.icon;
  const dateObj = new Date(tx.createdAt || tx.date);
  const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  const handleClick = () => onTransactionClick?.(tx);

  const paddingClass = compactMode ? 'p-2' : 'p-4';
  const iconSizeClass = compactMode ? 'w-9 h-9' : 'w-11 h-11';
  const iconInnerSize = compactMode ? 16 : 20;

  return (
    <div
      style={style}
      onClick={handleClick}
      className={`${paddingClass} active:bg-surface/50 transition-colors cursor-pointer border-b border-edge`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="flex items-start gap-3">
        <div className={`
          ${iconSizeClass} rounded-full flex items-center justify-center shrink-0
          ${isCredit ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'}
        `}>
          {isCredit ? <ArrowDownLeft size={iconInnerSize} /> : <ArrowUpRight size={iconInnerSize} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content-primary truncate">
                {formatDescription(tx.description || tx.typeOperation || tx.type)}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-content-muted">{timeStr}</span>
                <span className="text-content-muted">·</span>
                <span className="text-xs text-content-muted">{dateStr}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-base font-bold font-mono ${isCredit ? 'text-status-success' : 'text-status-danger'}`}>
                {isCredit ? '+' : '-'}{formatMoney(tx.amount)}
              </p>
              {normalizeStatus(tx.status) !== 'SUCCESS' && (
                <div className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
                  <StatusIcon size={10} />
                  {statusConfig.label}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function TransactionsList({
  transactions,
  onTransactionClick,
  isLoading = false,
  emptyMessage = 'Aucune transaction',
  showHeader = true,
  headerTitle = 'Transactions Récentes',
  onViewAll,
  maxItems,
  className = '',
  compactMode = false,
  listHeight
}: TransactionsListProps) {
  const displayedTransactions = maxItems ? transactions.slice(0, maxItems) : transactions;

  const handleClick = useCallback((transaction: TransactionItem) => {
    onTransactionClick?.(transaction);
  }, [onTransactionClick]);

  const VIRTUALIZATION_THRESHOLD = 50;
  const useVirtualization = displayedTransactions.length > VIRTUALIZATION_THRESHOLD;

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`bg-surface border border-edge rounded-xl overflow-hidden ${className}`}>
        {showHeader && (
          <div className="p-4 border-b border-edge flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-accent" />
              <span className="text-sm font-bold text-content-primary">{headerTitle}</span>
            </div>
          </div>
        )}
        <div className="divide-y divide-edge">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-elevated" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-elevated rounded w-3/4" />
                  <div className="h-3 bg-surface-elevated/50 rounded w-1/2" />
                </div>
                <div className="h-5 bg-surface-elevated rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (displayedTransactions.length === 0) {
    return (
      <div className={`bg-surface border border-edge rounded-xl overflow-hidden ${className}`}>
        {showHeader && (
          <div className="p-4 border-b border-edge flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-accent" />
              <span className="text-sm font-bold text-content-primary">{headerTitle}</span>
            </div>
          </div>
        )}
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface/50 flex items-center justify-center">
            <FileText size={28} className="text-content-muted" />
          </div>
          <p className="text-content-muted text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border border-edge rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="px-3 py-2 border-b border-edge flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h3 className="text-xs font-bold text-content-primary">{headerTitle}</h3>
          </div>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="text-[10px] font-medium text-accent hover:text-accent transition-colors flex items-center gap-1"
            >
              Voir tout
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden">
        {useVirtualization ? (
          <VirtualList<TransactionRowProps>
            style={{ height: listHeight ?? Math.min(displayedTransactions.length * (compactMode ? 64 : 88), 600), width: '100%' }}
            rowCount={displayedTransactions.length}
            rowHeight={compactMode ? 64 : 88}
            className="divide-y divide-edge"
            rowComponent={MobileTransactionRow}
            rowProps={useMemo(() => ({
              transactions: displayedTransactions,
              onTransactionClick,
              compactMode
            }), [displayedTransactions, onTransactionClick, compactMode])}
          />
        ) : (
          <div className="divide-y divide-edge">
            {displayedTransactions.map((tx) => {
              const isCredit = isEntree(tx.typeOperation || tx.type);
              const statusConfig = getStatusConfig(tx.status);
              const StatusIcon = statusConfig.icon;
              const dateObj = new Date(tx.createdAt || tx.date);
              const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              const dateStr = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

              const paddingClass = compactMode ? 'p-2' : 'p-4';
              const iconSizeClass = compactMode ? 'w-9 h-9' : 'w-11 h-11';
              const iconInnerSize = compactMode ? 16 : 20;

              return (
                <div
                  key={tx.id}
                  onClick={() => handleClick(tx)}
                  className={`${paddingClass} active:bg-surface/50 transition-colors cursor-pointer`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleClick(tx)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`
                      ${iconSizeClass} rounded-full flex items-center justify-center shrink-0
                      ${isCredit ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'}
                    `}>
                      {isCredit ? <ArrowDownLeft size={iconInnerSize} /> : <ArrowUpRight size={iconInnerSize} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-content-primary truncate">
                            {formatDescription(tx.description || tx.typeOperation || tx.type)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-content-muted">{timeStr}</span>
                            <span className="text-content-muted">·</span>
                            <span className="text-xs text-content-muted">{dateStr}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold font-mono ${isCredit ? 'text-status-success' : 'text-status-danger'}`}>
                            {isCredit ? '+' : '-'}{formatMoney(tx.amount)}
                          </p>
                          {normalizeStatus(tx.status) !== 'SUCCESS' && (
                            <div className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
                              <StatusIcon size={10} />
                              {statusConfig.label}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="bg-surface/30 border-b border-edge">
              <th className={`text-left ${compactMode ? 'py-1' : 'py-2'} px-3 text-[10px] font-bold text-content-muted uppercase tracking-wider`}>Date</th>
              <th className={`text-left ${compactMode ? 'py-1' : 'py-2'} px-3 text-[10px] font-bold text-content-muted uppercase tracking-wider`}>Type</th>
              <th className={`text-left ${compactMode ? 'py-1' : 'py-2'} px-3 text-[10px] font-bold text-content-muted uppercase tracking-wider`}>Référence</th>
              <th className={`text-right ${compactMode ? 'py-1' : 'py-2'} px-3 text-[10px] font-bold text-content-muted uppercase tracking-wider`}>Montant</th>
              <th className={`text-center ${compactMode ? 'py-1' : 'py-2'} px-3 text-[10px] font-bold text-content-muted uppercase tracking-wider`}>Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {displayedTransactions.map((tx) => {
              const isCredit = isEntree(tx.typeOperation || tx.type);
              const statusConfig = getStatusConfig(tx.status);
              const dateObj = new Date(tx.createdAt || tx.date);

              return (
                <tr
                  key={tx.id}
                  onClick={() => handleClick(tx)}
                  className="hover:bg-surface/30 transition-colors cursor-pointer group"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleClick(tx)}
                >
                  <td className={`${compactMode ? 'py-1' : 'py-2'} px-3`}>
                    <div className="flex items-center gap-2">
                       <span className="text-xs text-content-primary">
                        {dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-content-muted text-nowrap">
                        {dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </td>
                  <td className={`${compactMode ? 'py-1' : 'py-2'} px-3`}>
                    <div className="flex items-center gap-2">
                      <div className={`
                        ${compactMode ? 'w-5 h-5' : 'w-6 h-6'} rounded-full flex items-center justify-center shrink-0
                        ${isCredit ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'}
                      `}>
                        {isCredit ? <ArrowDownLeft size={compactMode ? 10 : 12} /> : <ArrowUpRight size={compactMode ? 10 : 12} />}
                      </div>
                      <span className="text-xs font-medium text-content-primary group-hover:text-accent transition-colors truncate max-w-[150px] block">
                        {formatDescription(tx.description || tx.typeOperation || tx.type)}
                      </span>
                    </div>
                  </td>
                  <td className={`${compactMode ? 'py-1' : 'py-2'} px-3`}>
                    <span className="text-[10px] font-mono text-content-muted group-hover:text-content-muted transition-colors truncate max-w-[120px] block">
                      {tx.reference}
                    </span>
                  </td>
                  <td className={`${compactMode ? 'py-1' : 'py-2'} px-3 text-right`}>
                    <span className={`text-xs font-bold font-mono ${isCredit ? 'text-status-success' : 'text-status-danger'}`}>
                      {isCredit ? '+' : '-'}{formatMoney(tx.amount)}
                    </span>
                  </td>
                  <td className={`${compactMode ? 'py-1' : 'py-2'} px-3 text-center`}>
                    <Badge value={statusConfig.label} variant={statusConfig.badgeVariant} size="sm" className="text-[10px] py-0 px-1.5 h-5" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
