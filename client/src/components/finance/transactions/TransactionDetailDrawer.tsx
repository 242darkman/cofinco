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
  ArrowRight,
  RotateCcw,
  Loader2
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { currencySymbol } from '@shared/config/currency';
import { formatMoney, formatDate } from '../../../lib/format';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { ReceiptActions } from '../shared/ReceiptActions';
import { getStatusLabel, ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { caisseOperationApi } from '../../../lib/api-client';

// --- Types ---

export interface TransactionDetails {
  id: string;
  reference: string;
  amount: number;
  type: string;
  typeOperation?: string;
  status: 'Succès' | 'Échec' | 'En attente' | 'Annulé' | 'completed' | 'pending' | 'failed' | 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' | string;
  date: string | Date;
  client?: {
    name: string;
    telephone?: string;
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
  modePaiement?: string;
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
  if (s === 'completed' || s === 'succès' || s === 'success' || s === 'posted') return 'Succès';
  if (s === 'failed' || s === 'échec' || s === 'error') return 'Échec';
  if (s === 'pending' || s === 'en attente' || s === 'en cours') return 'En attente';
  if (s === 'annulé' || s === 'cancelled' || s === 'canceled' || s === 'reversed') return 'Annulé';
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
    <div className="flex items-start justify-between py-1.5 border-b border-dashed border-edge-subtle-subtle last:border-0">
      <dt className="flex items-center gap-2 text-sm text-content-muted">
        {icon}
        {label}
      </dt>
      <dd className={`
        text-sm font-semibold text-content-primary text-right max-w-[60%]
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
  // Cancellation
  canReverse: boolean;
  showCancelConfirm: boolean;
  cancelReason: string;
  isCancelling: boolean;
  onCancelReasonChange: (reason: string) => void;
  onCancelConfirmOpen: () => void;
  onCancelConfirmClose: () => void;
  onCancelSubmit: () => void;
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
  onReportProblem,
  canReverse,
  showCancelConfirm,
  cancelReason,
  isCancelling,
  onCancelReasonChange,
  onCancelConfirmOpen,
  onCancelConfirmClose,
  onCancelSubmit
}: DrawerContentProps) {
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex flex-col h-full bg-surface rounded-t-[20px] md:rounded-l-2xl md:rounded-tr-none overflow-hidden">
      {/* Hero Header */}
      <div className={`
        relative px-6 pt-8 pb-6 text-center
        ${isCredit
          ? 'bg-gradient-to-b from-status-success/20 via-emerald-500/10 to-transparent'
          : 'bg-gradient-to-b from-status-danger/20 via-red-500/10 to-transparent'
        }
      `}>
        {/* Close Button (Desktop) */}
        {isDesktop && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Fermer"
          >
            <X size={20} className="text-content-muted" />
          </button>
        )}

        {/* Status Badge */}
        <div className="flex justify-center mb-5">
          <span className={`
            inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide
            bg-${statusConfig.color}-500/15 text-${statusConfig.color}-400
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
              ? 'text-status-success'
              : 'text-status-danger'
            }
          `}>
            {isCredit ? '+' : '-'}{formatMoney(transaction.amount, { showCurrency: false })}
          </span>
          <span className="text-lg text-content-muted font-medium ml-2">FCFA</span>
        </div>

        {/* Transaction Type */}
        <p className="text-lg font-medium text-content-muted flex items-center justify-center gap-2 mb-6">
          {isCredit ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
          {getStatusLabel(transaction.typeOperation || transaction.type, ALL_STATUS_LABELS)}
        </p>

        {/* Reference (Copyable) */}
        <button
          onClick={onCopyReference}
          className="mx-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-muted hover:bg-surface-subtle-elevated transition-colors group"
        >
          <Hash size={14} className="text-content-muted" />
          <span className="text-sm font-mono text-content-muted group-hover:text-content-primary">
            {transaction.reference}
          </span>
          {copied ? (
            <CheckCircle size={14} className="text-status-success" />
          ) : (
            <Copy size={14} className="text-content-muted group-hover:text-content-secondary" />
          )}
        </button>
      </div>

      {/* Body - Scrollable Details */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-5">

          {/* Transfer Flow (if applicable) */}
          {isTransfer && (
            <section className="mb-6">
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-muted/50">
                {/* Source */}
                <div className="text-center flex-1">
                  <p className="text-xs text-content-muted uppercase tracking-wider mb-1">De</p>
                  <p className="text-sm font-semibold text-content-primary">{transaction.source?.name}</p>
                  {transaction.source?.accountNumber && (
                    <p className="text-xs text-content-muted font-mono mt-0.5">{transaction.source.accountNumber}</p>
                  )}
                </div>

                {/* Arrow */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <ArrowRight size={18} className="text-accent" />
                </div>

                {/* Destination */}
                <div className="text-center flex-1">
                  <p className="text-xs text-content-muted uppercase tracking-wider mb-1">Vers</p>
                  <p className="text-sm font-semibold text-content-primary">{transaction.destination?.name}</p>
                  {transaction.destination?.accountNumber && (
                    <p className="text-xs text-content-muted font-mono mt-0.5">{transaction.destination.accountNumber}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Client Info */}
          {transaction.client && !isTransfer && (
            <section>
              <h3 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <User size={14} /> Client
              </h3>
              <div className="bg-surface-muted/50 rounded-xl p-4 space-y-3">
                <DetailRow label="Nom" value={transaction.client.name} />
                {transaction.client.telephone && (
                  <DetailRow label="Téléphone" value={transaction.client.telephone} />
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
            <h3 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText size={14} /> Détails
            </h3>
            <div className="bg-surface-muted/50 rounded-xl p-4 space-y-3">
              <DetailRow
                label="Date & Heure"
                value={formatDate(transaction.date, { format: 'datetime' })}
                icon={<Calendar size={14} className="text-content-muted" />}
              />
              <DetailRow
                label="Mode de paiement"
                value={transaction.modePaiement || 'Espèces'}
                icon={<CreditCard size={14} className="text-content-muted" />}
              />
              <DetailRow
                label="Agent"
                value={transaction.agent || 'Système'}
                icon={<User size={14} className="text-content-muted" />}
              />
              {transaction.agence && (
                <DetailRow
                  label="Agence"
                  value={transaction.agence}
                  icon={<Building size={14} className="text-content-muted" />}
                />
              )}
              {transaction.description && (
                <DetailRow
                  label="Note"
                  value={transaction.description}
                  className="italic text-content-muted"
                />
              )}
            </div>
          </section>

          {/* Error message if failed */}
          {showError && (
            <section className="animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-status-danger-bg border border-status-danger/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={20} className="text-status-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-status-danger">
                    Transaction échouée
                  </p>
                  <p className="text-xs text-status-danger/80 mt-1">
                    {transaction.metadata?.errorMessage || 'Une erreur est survenue lors du traitement de cette transaction.'}
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

          {/* Cancel/Reverse Operation */}
          {canReverse && !showCancelConfirm && (
            <section>
              <button
                onClick={onCancelConfirmOpen}
                className="w-full py-3 px-4 text-sm font-medium text-status-danger border border-status-danger/30 rounded-xl hover:bg-status-danger-bg transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Annuler cette opération
              </button>
            </section>
          )}

          {showCancelConfirm && (
            <section className="border border-status-warning/30 bg-status-warning-bg rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 mb-3 text-status-warning">
                <AlertTriangle size={18} />
                <span className="font-semibold text-sm">Confirmer l'annulation</span>
              </div>
              <textarea
                value={cancelReason}
                onChange={(e) => onCancelReasonChange(e.target.value)}
                placeholder="Motif d'annulation (obligatoire, min. 3 caractères)..."
                className="w-full p-3 text-sm border border-status-warning/50 rounded-lg bg-surface text-content-primary placeholder-content-muted focus:ring-2 focus:ring-status-warning focus:border-transparent resize-none"
                rows={2}
                autoFocus
              />
              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 h-10 rounded-lg text-sm font-medium border border-edge text-content-secondary hover:bg-surface-subtle transition-colors"
                  onClick={onCancelConfirmClose}
                  disabled={isCancelling}
                >
                  Retour
                </button>
                <button
                  className="flex-1 h-10 rounded-lg text-sm font-medium bg-status-danger hover:bg-status-danger/90 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  onClick={onCancelSubmit}
                  disabled={isCancelling || cancelReason.trim().length < 3}
                >
                  {isCancelling ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Annulation...
                    </>
                  ) : (
                    "Confirmer l'annulation"
                  )}
                </button>
              </div>
            </section>
          )}

          {/* Tertiary Action (Report Problem) */}
          {showError && (
            <button
              onClick={onReportProblem}
              className="w-full py-2 text-sm text-status-danger hover:text-status-danger transition-colors flex items-center justify-center gap-2"
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

  // --- Cancel/Reverse Operation ---
  const [canReverse, setCanReverse] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!transaction?.id || !isOpen) {
      setCanReverse(false);
      setShowCancelConfirm(false);
      setCancelReason('');
      return;
    }
    let cancelled = false;
    caisseOperationApi.canReverse(transaction.id)
      .then((result) => {
        if (!cancelled) setCanReverse(result.reversible);
      })
      .catch(() => {
        if (!cancelled) setCanReverse(false);
      });
    return () => { cancelled = true; };
  }, [transaction?.id, isOpen]);

  const handleCancelSubmit = useCallback(async () => {
    if (!transaction?.id || cancelReason.trim().length < 3) return;
    setIsCancelling(true);
    try {
      const result = await caisseOperationApi.cancel(transaction.id, {
        reason: cancelReason.trim(),
      });
      toast.success(result.message || 'Opération annulée avec succès');
      setShowCancelConfirm(false);
      setCancelReason('');
      setCanReverse(false);
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur lors de l'annulation";
      toast.error(message);
    } finally {
      setIsCancelling(false);
    }
  }, [transaction?.id, cancelReason, onClose]);

  // Prepare Receipt Data for ReceiptActions
  const receiptData: ReceiptData | null = useMemo(() => {
    if (!transaction) return null;

    const agentNameParts = (transaction.agent || 'Agent Caisse').split(' ');
    const agentNom = agentNameParts[0];
    const agentPrenom = agentNameParts.slice(1).join(' ');

    const clientNameParts = (transaction.client?.name || 'Client Inconnu').split(' ');
    const clientNom = clientNameParts[0];
    const clientPrenom = clientNameParts.slice(1).join(' ');

    const typeLabel = getStatusLabel(transaction.typeOperation || transaction.type, ALL_STATUS_LABELS);

    return {
      title: `Reçu - ${typeLabel}`,
      reference: transaction.reference,
      date: transaction.date,
      type: typeLabel,
      client: {
        nom: clientNom,
        prenom: clientPrenom,
        telephone: transaction.client?.telephone,
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
      devise: currencySymbol(),
      modePaiement: transaction.modePaiement || 'Espèces',
    };
  }, [transaction]);

  // Copy Reference
  const handleCopyReference = useCallback(() => {
    if (!transaction?.reference) return;
    navigator.clipboard.writeText(transaction.reference);
    setCopied(true);
    toast.success("Copié", { duration: 1500 });
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

  const isCredit = isEntree(transaction.typeOperation || transaction.type || '');
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
        <div className="relative w-full max-w-md h-full bg-surface shadow-2xl animate-in slide-in-from-right duration-300 ease-out flex flex-col border-l border-edge">
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
            canReverse={canReverse}
            showCancelConfirm={showCancelConfirm}
            cancelReason={cancelReason}
            isCancelling={isCancelling}
            onCancelReasonChange={setCancelReason}
            onCancelConfirmOpen={() => setShowCancelConfirm(true)}
            onCancelConfirmClose={() => { setShowCancelConfirm(false); setCancelReason(''); }}
            onCancelSubmit={handleCancelSubmit}
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
        <Drawer.Content className="bg-surface flex flex-col rounded-t-[20px] h-[92vh] mt-24 fixed bottom-0 left-0 right-0 z-50 outline-none">
          {/* Handle Bar */}
          <div className="py-3 bg-surface rounded-t-[20px] flex justify-center shrink-0">
            <div className="w-12 h-1.5 bg-surface-subtle-elevated rounded-full" />
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
              canReverse={canReverse}
              showCancelConfirm={showCancelConfirm}
              cancelReason={cancelReason}
              isCancelling={isCancelling}
              onCancelReasonChange={setCancelReason}
              onCancelConfirmOpen={() => setShowCancelConfirm(true)}
              onCancelConfirmClose={() => { setShowCancelConfirm(false); setCancelReason(''); }}
              onCancelSubmit={handleCancelSubmit}
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
