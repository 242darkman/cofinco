import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Drawer } from 'vaul';
import {
  X,
  Copy,
  CheckCircle,
  XCircle,
  Hourglass,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  User,
  Calendar,
  AlertTriangle,
  Hash,
  CreditCard,
  Building,
  ArrowRight
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { formatMoney, formatDate } from '../../../lib/format';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { ReceiptActions } from '../shared/ReceiptActions';
import { getStatusLabel, ALL_STATUS_LABELS } from '../../../lib/status-labels';

// --- Types ---

export interface TransactionDetails {
  id: string;
  reference: string;
  amount: number;
  type: string;
  type_operation?: string;
  status: 'Succès' | 'Échec' | 'En attente' | 'Annulé' | 'completed' | 'pending' | 'failed' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' | string;
  date: string | Date;
  client?: {
    name: string;
    phone?: string;
    accountNumber?: string;
  };
  // For transfers
  source?: {
    name: string;
    accountNumber?: string;
  };
  destination?: {
    name: string;
    accountNumber?: string;
  };
  description?: string;
  metadata?: Record<string, any>;
  agent?: string;
  mode_paiement?: string;
  agence?: string;
}

export interface TransactionDetailDrawerProps {
  transaction: TransactionDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onReportProblem?: (transaction: TransactionDetails) => void;
}

// --- Helper Hook for Responsive Design ---

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}

// --- Helper Functions ---

const TYPES_ENTREES = [
  // Labels FR
  'Dépôt', 'Versement', 'Remboursement', 'Remboursement Crédit', 'Encaissement',
  'Cotisation Tontine', 'Approvisionnement coffre', 'Frais Engagement',
  'Dépôt Espèces', 'credit', 'Approvisionnement depuis Coffre-Fort',
  // Codes EN (valeurs stockées en DB)
  'TONTINE_CONTRIBUTION', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED',
  'MISC_COLLECTION', 'LOAN_REPAYMENT', 'CREDIT_REPAYMENT', 'SAFE_SUPPLY',
  'INITIAL_DEPOSIT', 'ENGAGEMENT_FEE', 'FRAIS_ENGAGEMENT', 'DEPOT_ESPECES',
  'SAVINGS_DEPOSIT', 'TRANSFER_IN', 'BANK_FEE'
];

const isEntree = (type: string): boolean => {
  if (!type) return false;
  const typeLower = type.toLowerCase();
  return TYPES_ENTREES.some(t =>
    typeLower.includes(t.toLowerCase()) || t.toLowerCase().includes(typeLower)
  );
};

const normalizeStatus = (status: string): 'Succès' | 'Échec' | 'En attente' | 'Annulé' => {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'succès' || s === 'success') return 'Succès';
  if (s === 'failed' || s === 'échec' || s === 'error') return 'Échec';
  if (s === 'pending' || s === 'en attente' || s === 'en cours') return 'En attente';
  if (s === 'annulé' || s === 'cancelled' || s === 'canceled') return 'Annulé';
  return 'Succès';
};

const getStatusConfig = (status: string) => {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case 'Succès':
      return { icon: CheckCircle, color: 'emerald', label: 'Succès' };
    case 'Échec':
      return { icon: XCircle, color: 'red', label: 'Échec' };
    case 'En attente':
      return { icon: Hourglass, color: 'amber', label: 'En attente' };
    case 'Annulé':
      return { icon: XCircle, color: 'slate', label: 'Annulé' };
    default:
      return { icon: CheckCircle, color: 'emerald', label: 'Succès' };
  }
};

// --- Subcomponent: Detail Row ---
interface DetailRowProps {
  label: string;
  value?: string | React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
  className?: string;
}

function DetailRow({ label, value, icon, mono = false, className = '' }: DetailRowProps) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-dashed border-slate-100 dark:border-slate-700/50 last:border-0">
      <dt className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className={`
        text-sm font-semibold text-slate-900 dark:text-slate-100 text-right max-w-[60%]
        ${mono ? 'font-mono' : ''}
        ${className}
      `}>
        {value}
      </dd>
    </div>
  );
}

// --- Drawer Content Component (memoized to prevent re-renders) ---
interface DrawerContentProps {
  transaction: TransactionDetails;
  receiptData: ReceiptData;
  isDesktop: boolean;
  isCredit: boolean;
  statusConfig: ReturnType<typeof getStatusConfig>;
  isTransfer: boolean;
  showError: boolean;
  copied: boolean;
  onClose: () => void;
  onCopyReference: () => void;
  onReportProblem: () => void;
}

const DrawerContent = React.memo(function DrawerContent({
  transaction,
  receiptData,
  isDesktop,
  isCredit,
  statusConfig,
  isTransfer,
  showError,
  copied,
  onClose,
  onCopyReference,
  onReportProblem
}: DrawerContentProps) {
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-t-[20px] md:rounded-l-2xl md:rounded-tr-none overflow-hidden">
      {/* Hero Header */}
      <div className={`
        relative px-6 pt-8 pb-6 text-center
        ${isCredit
          ? 'bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/20 dark:via-emerald-500/10'
          : 'bg-gradient-to-b from-red-500/10 via-red-500/5 to-transparent dark:from-red-500/20 dark:via-red-500/10'
        }
      `}>
        {/* Close Button (Desktop) */}
        {isDesktop && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Fermer"
          >
            <X size={20} className="text-slate-500" />
          </button>
        )}

        {/* Status Badge */}
        <div className="flex justify-center mb-5">
          <span className={`
            inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide
            bg-${statusConfig.color}-500/15 text-${statusConfig.color}-600 dark:text-${statusConfig.color}-400
            border border-${statusConfig.color}-500/20
          `}>
            <StatusIcon size={14} strokeWidth={2.5} />
            {statusConfig.label}
          </span>
        </div>

        {/* Amount - Hero Display */}
        <div className="mb-2">
          <span className={`
            text-4xl sm:text-5xl font-bold font-mono tracking-tight
            ${isCredit
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
            }
          `}>
            {isCredit ? '+' : '-'}{formatMoney(transaction.amount, { showCurrency: false })}
          </span>
          <span className="text-lg text-slate-400 font-medium ml-2">FCFA</span>
        </div>

        {/* Transaction Type */}
        <p className="text-lg font-medium text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 mb-6">
          {isCredit ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
          {getStatusLabel(transaction.type_operation || transaction.type, ALL_STATUS_LABELS)}
        </p>

        {/* Reference (Copyable) */}
        <button
          onClick={onCopyReference}
          className="mx-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
        >
          <Hash size={14} className="text-slate-400" />
          <span className="text-sm font-mono text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
            {transaction.reference}
          </span>
          {copied ? (
            <CheckCircle size={14} className="text-emerald-500" />
          ) : (
            <Copy size={14} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
          )}
        </button>
      </div>

      {/* Body - Scrollable Details */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-5">

          {/* Transfer Flow (if applicable) */}
          {isTransfer && (
            <section className="mb-6">
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                {/* Source */}
                <div className="text-center flex-1">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">De</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{transaction.source?.name}</p>
                  {transaction.source?.accountNumber && (
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{transaction.source.accountNumber}</p>
                  )}
                </div>

                {/* Arrow */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <ArrowRight size={18} className="text-cyan-500" />
                </div>

                {/* Destination */}
                <div className="text-center flex-1">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Vers</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{transaction.destination?.name}</p>
                  {transaction.destination?.accountNumber && (
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{transaction.destination.accountNumber}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Client Info */}
          {transaction.client && !isTransfer && (
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <User size={14} /> Client
              </h3>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                <DetailRow label="Nom" value={transaction.client.name} />
                {transaction.client.phone && (
                  <DetailRow label="Téléphone" value={transaction.client.phone} />
                )}
                <DetailRow
                  label="Compte"
                  value={transaction.client.accountNumber || 'Espèces'}
                  mono
                />
              </div>
            </section>
          )}

          {/* Transaction Details */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText size={14} /> Détails
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
              <DetailRow
                label="Date & Heure"
                value={formatDate(transaction.date, { format: 'datetime' })}
                icon={<Calendar size={14} className="text-slate-400" />}
              />
              <DetailRow
                label="Mode de paiement"
                value={transaction.mode_paiement || 'Espèces'}
                icon={<CreditCard size={14} className="text-slate-400" />}
              />
              <DetailRow
                label="Agent"
                value={transaction.agent || 'Système'}
                icon={<User size={14} className="text-slate-400" />}
              />
              {transaction.agence && (
                <DetailRow
                  label="Agence"
                  value={transaction.agence}
                  icon={<Building size={14} className="text-slate-400" />}
                />
              )}
              {transaction.description && (
                <DetailRow
                  label="Note"
                  value={transaction.description}
                  className="italic text-slate-500 dark:text-slate-400"
                />
              )}
            </div>
          </section>

          {/* Error message if failed */}
          {showError && (
            <section className="animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    Transaction échouée
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                    {transaction.metadata?.error_message || 'Une erreur est survenue lors du traitement de cette transaction.'}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Receipt Actions - Shared Component */}
          <section>
            <ReceiptActions
              data={receiptData}
              showPreview={false}
              showEmail={true}
              variant="light"
            />
          </section>

          {/* Tertiary Action (Report Problem) */}
          {showError && (
            <button
              onClick={onReportProblem}
              className="w-full py-2 text-sm text-red-500 hover:text-red-400 transition-colors flex items-center justify-center gap-2"
            >
              <AlertTriangle size={14} />
              Signaler un problème
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// --- Main Component ---

export default function TransactionDetailDrawer({
  transaction,
  isOpen,
  onClose,
  onReportProblem
}: TransactionDetailDrawerProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [copied, setCopied] = useState(false);

  // Prepare Receipt Data for ReceiptActions
  const receiptData: ReceiptData | null = useMemo(() => {
    if (!transaction) return null;

    const agentNameParts = (transaction.agent || 'Agent Caisse').split(' ');
    const agentNom = agentNameParts[0];
    const agentPrenom = agentNameParts.slice(1).join(' ');

    const clientNameParts = (transaction.client?.name || 'Client Inconnu').split(' ');
    const clientNom = clientNameParts[0];
    const clientPrenom = clientNameParts.slice(1).join(' ');

    const typeLabel = getStatusLabel(transaction.type_operation || transaction.type, ALL_STATUS_LABELS);

    return {
      title: `Reçu - ${typeLabel}`,
      reference: transaction.reference,
      date: transaction.date,
      type: typeLabel,
      client: {
        nom: clientNom,
        prenom: clientPrenom,
        telephone: transaction.client?.phone,
        numeroCompte: transaction.client?.accountNumber,
      },
      agent: {
        nom: agentNom,
        prenom: agentPrenom,
      },
      items: [
        {
          description: typeLabel,
          details: transaction.description,
          quantite: 1,
          montant: transaction.amount,
        }
      ],
      total: transaction.amount,
      devise: 'FCFA',
      modePaiement: transaction.mode_paiement || 'Espèces',
    };
  }, [transaction]);

  // Copy Reference
  const handleCopyReference = useCallback(() => {
    if (!transaction?.reference) return;
    navigator.clipboard.writeText(transaction.reference);
    setCopied(true);
    toast.success("Référence copiée !", { duration: 2000 });
    setTimeout(() => setCopied(false), 2000);
  }, [transaction?.reference]);

  // Report problem
  const handleReportProblem = useCallback(() => {
    if (onReportProblem && transaction) {
      onReportProblem(transaction);
    } else {
      toast.info('Fonctionnalité de signalement bientôt disponible');
    }
  }, [onReportProblem, transaction]);

  // Don't render if no transaction and closed
  if (!transaction || !isOpen || !receiptData) return null;

  const isCredit = isEntree(transaction.type_operation || transaction.type || '');
  const statusConfig = getStatusConfig(transaction.status || 'Succès');
  const isTransfer = !!(transaction.source && transaction.destination);
  const showError = normalizeStatus(transaction.status || '') === 'Échec';

  // Desktop: Slideover / Side Panel
  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={onClose}
        />

        {/* Slideover Content */}
        <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-300 ease-out flex flex-col border-l border-slate-200 dark:border-slate-800">
          <DrawerContent
            transaction={transaction}
            receiptData={receiptData}
            isDesktop={isDesktop}
            isCredit={isCredit}
            statusConfig={statusConfig}
            isTransfer={isTransfer}
            showError={showError}
            copied={copied}
            onClose={onClose}
            onCopyReference={handleCopyReference}
            onReportProblem={handleReportProblem}
          />
        </div>
      </div>
    );
  }

  // Mobile: Vaul Bottom Drawer
  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
        <Drawer.Content className="bg-white dark:bg-slate-900 flex flex-col rounded-t-[20px] h-[92vh] mt-24 fixed bottom-0 left-0 right-0 z-50 outline-none">
          {/* Handle Bar */}
          <div className="py-3 bg-white dark:bg-slate-900 rounded-t-[20px] flex justify-center shrink-0">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <DrawerContent
              transaction={transaction}
              receiptData={receiptData}
              isDesktop={isDesktop}
              isCredit={isCredit}
              statusConfig={statusConfig}
              isTransfer={isTransfer}
              showError={showError}
              copied={copied}
              onClose={onClose}
              onCopyReference={handleCopyReference}
              onReportProblem={handleReportProblem}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
