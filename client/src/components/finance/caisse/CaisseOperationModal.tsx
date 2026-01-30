import React, { useEffect, useRef } from 'react';
import {
  X, ArrowDownToLine, ArrowUpFromLine, Banknote,
  Smartphone, Loader2, CheckCircle2, Lock, AlertTriangle,
  Copy, Printer, ArrowRight,
} from 'lucide-react';
import { formatMoney } from '@/lib/format';
import {
  MethodePaiement,
  METHODE_PAIEMENT_LABELS,
  type MethodePaiementType,
} from '@shared/enum/status-constants';
import {
  useCaisseOperation,
  getAccountType,
  getAccountLabel,
  getAccountNumber,
  getAccountBalance,
  isAccountBlocked,
  canOperateOnAccount,
  type OperationType,
  type AccountInfo,
  type SecurityLimits,
  type ClientInfo,
} from './hooks/useCaisseOperation';
import { ReceiptActions } from '../shared/ReceiptActions';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_METHODS: { id: MethodePaiementType; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: MethodePaiement.CASH, label: 'Espèces', icon: Banknote },
  { id: MethodePaiement.MOBILE_MONEY, label: 'Mobile Money', icon: Smartphone },
];

const MOBILE_MONEY_PROVIDERS = [
  { id: 'MTN', label: 'MTN MoMo', color: 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400' },
  { id: 'AIRTEL', label: 'Airtel Money', color: 'bg-red-500/10 border-red-500/40 text-red-400' },
] as const;

type MobileMoneyProvider = typeof MOBILE_MONEY_PROVIDERS[number]['id'];

const ACCOUNT_COLORS: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  CURRENT: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', ring: 'ring-blue-500' },
  SAVINGS: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', ring: 'ring-emerald-500' },
  BLOCKED: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', ring: 'ring-amber-500' },
};

const DEFAULT_COLORS = { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-400', ring: 'ring-slate-500' };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CaisseOperationModalProps {
  isOpen: boolean;
  onClose: () => void;
  operationType: OperationType;
  client: ClientInfo;
  clientAccounts: AccountInfo[];
  securityLimits?: SecurityLimits | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CaisseOperationModal({
  isOpen,
  onClose,
  operationType,
  client,
  clientAccounts,
  securityLimits,
}: CaisseOperationModalProps) {
  const amountRef = useRef<HTMLInputElement>(null);

  const {
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    paymentMethod,
    setPaymentMethod,
    mobileMoneyProvider,
    setMobileMoneyProvider,
    mobileMoneyPhone,
    setMobileMoneyPhone,
    amount,
    setAmount,
    observations,
    setObservations,
    phase,
    requestConfirmation,
    cancelConfirmation,
    executeOperation,
    reset,
    result,
    receiptData,
    factureId,
    isSubmitting,
    validationErrors,
    canSubmit,
    duplicateWarning,
    forceExecute,
    dismissDuplicateWarning,
  } = useCaisseOperation({ operationType, client, clientAccounts, securityLimits });

  // Auto-select single account & focus amount on open
  useEffect(() => {
    if (!isOpen) return;
    reset();
    if (clientAccounts.length === 1) {
      const check = canOperateOnAccount(clientAccounts[0], operationType);
      if (check.allowed) {
        setSelectedAccountId(clientAccounts[0].id);
        requestAnimationFrame(() => amountRef.current?.focus());
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'CONFIRMING') cancelConfirmation();
        else if (phase === 'INPUT') onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, phase, cancelConfirmation, onClose]);

  if (!isOpen) return null;

  const isDepot = operationType === 'DEPOT';

  // ----- HANDLERS -----

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (canSubmit) requestConfirmation();
  };

  const handleConfirm = async () => {
    try {
      await executeOperation();
    } catch {
      // error handled in mutation
    }
  };

  const handleForceConfirm = async () => {
    try {
      await forceExecute();
    } catch {
      // error handled in mutation
    }
  };

  const handleNewOperation = () => {
    reset();
  };

  const handleCopyRef = async () => {
    const ref = result?.transaction?.reference || result?.transaction?.id;
    if (ref) {
      await navigator.clipboard.writeText(ref);
      toast.success('Référence copiée');
    }
  };

  // ----- RENDER -----

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={(e) => { if (e.target === e.currentTarget && phase === 'INPUT') onClose(); }}
    >
      <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-lg w-full shadow-2xl relative overflow-hidden">

        {/* ─── HEADER ─── */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-slate-800`}>
          <div className="flex items-center gap-3">
            <span className={`p-2 rounded-lg ${isDepot ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
              {isDepot
                ? <ArrowDownToLine size={20} className="text-emerald-400" />
                : <ArrowUpFromLine size={20} className="text-rose-400" />}
            </span>
            <div>
              <h3 className={`text-lg font-bold ${isDepot ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isDepot ? 'Dépôt' : 'Retrait'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {client.prenom} {client.nom}
              </p>
            </div>
          </div>
          <button
            onClick={phase === 'CONFIRMING' ? cancelConfirmation : onClose}
            className="text-slate-500 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* ─── PHASE: INPUT ─── */}
        {phase === 'INPUT' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* COMPTE */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Compte
              </label>
              <div className="flex flex-wrap gap-2">
                {clientAccounts.map((account) => {
                  const type = getAccountType(account);
                  const label = getAccountLabel(account);
                  const solde = getAccountBalance(account);
                  const numero = getAccountNumber(account).slice(-6);
                  const colors = ACCOUNT_COLORS[type] || DEFAULT_COLORS;
                  const selected = selectedAccountId === account.id;
                  const check = canOperateOnAccount(account, operationType);
                  const disabled = !check.allowed;

                  return (
                    <button
                      key={account.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        requestAnimationFrame(() => amountRef.current?.focus());
                      }}
                      className={`
                        relative px-3 py-2 rounded-xl border text-left transition-all text-xs
                        ${disabled
                          ? 'opacity-40 cursor-not-allowed border-slate-700 bg-slate-900/50'
                          : selected
                            ? `${colors.bg} ${colors.border} ring-1 ${colors.ring}`
                            : `bg-slate-900/50 border-slate-700 hover:border-slate-500`
                        }
                      `}
                      title={disabled ? check.reason : undefined}
                    >
                      <div className="flex items-center gap-2">
                        {disabled && <Lock size={12} className="text-slate-500" />}
                        <span className={`font-semibold ${selected ? colors.text : 'text-slate-300'}`}>
                          {label}
                        </span>
                        <span className={`font-mono font-bold ${selected ? colors.text : 'text-slate-400'}`}>
                          {new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 }).format(solde)}
                        </span>
                      </div>
                      {numero && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {numero}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {validationErrors.account && (
                <p className="text-xs text-rose-400 mt-1">{validationErrors.account}</p>
              )}
            </div>

            {/* METHODE DE PAIEMENT */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Méthode de paiement
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => {
                  const selected = paymentMethod === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(id);
                        if (id !== MethodePaiement.MOBILE_MONEY) {
                          setMobileMoneyProvider(null);
                          setMobileMoneyPhone('');
                        }
                      }}
                      className={`
                        flex flex-col items-center gap-1 py-3 px-2 rounded-lg border text-xs transition-all
                        ${selected
                          ? isDepot
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 ring-1 ring-emerald-500/40'
                            : 'bg-rose-500/10 border-rose-500/40 text-rose-400 ring-1 ring-rose-500/40'
                          : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-500'
                        }
                      `}
                    >
                      <Icon size={18} />
                      <span className="font-medium leading-none">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MOBILE MONEY PROVIDER SELECTION */}
            {paymentMethod === MethodePaiement.MOBILE_MONEY && (
              <div className="space-y-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Opérateur Mobile Money
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MOBILE_MONEY_PROVIDERS.map(({ id, label, color }) => {
                      const selected = mobileMoneyProvider === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMobileMoneyProvider(id)}
                          className={`
                            flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all
                            ${selected
                              ? `${color} ring-1`
                              : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-500'
                            }
                          `}
                        >
                          {id === 'MTN' && (
                            <span className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-[10px] font-bold text-black">M</span>
                          )}
                          {id === 'AIRTEL' && (
                            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white">A</span>
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {validationErrors.provider && (
                    <p className="text-xs text-rose-400 mt-1">{validationErrors.provider}</p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Numéro de téléphone
                  </label>
                  <input
                    type="tel"
                    className={`
                      w-full px-3 py-2.5 bg-slate-950 border rounded-lg text-white text-sm font-mono
                      focus:ring-1 outline-none transition-all
                      ${validationErrors.phone
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/40'
                        : 'border-slate-700 focus:border-slate-500 focus:ring-slate-500/40'
                      }
                    `}
                    value={mobileMoneyPhone}
                    onChange={(e) => setMobileMoneyPhone(e.target.value)}
                    placeholder="Ex: 066123456 ou 055123456"
                  />
                  {validationErrors.phone && (
                    <p className="text-xs text-rose-400 mt-1">{validationErrors.phone}</p>
                  )}
                </div>
              </div>
            )}

            {/* MONTANT */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Montant (FCFA)
              </label>
              <input
                ref={amountRef}
                type="number"
                className={`
                  w-full px-4 py-3 bg-slate-950 border rounded-xl text-white text-2xl font-mono font-bold
                  focus:ring-1 outline-none transition-all
                  ${validationErrors.amount
                    ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/40'
                    : isDepot
                      ? 'border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/40'
                      : 'border-slate-700 focus:border-rose-500 focus:ring-rose-500/40'
                  }
                `}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="1"
              />
              {(validationErrors.amount || validationErrors.limit) && (
                <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {validationErrors.amount || validationErrors.limit}
                </p>
              )}
            </div>

            {/* NOTE */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Note <span className="text-slate-600">(optionnel)</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:border-slate-500 outline-none transition-all"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Motif de l'opération..."
              />
            </div>

            {/* WITHDRAWAL LIMIT */}
            {operationType === 'RETRAIT' && securityLimits?.daily && (
              <div className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                <span className="text-xs text-rose-400 font-medium">Limite journalière</span>
                <span className="text-sm text-white font-bold font-mono">
                  {formatMoney(securityLimits.daily.remaining)}
                </span>
              </div>
            )}

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={`
                w-full py-3.5 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2
                transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                ${isDepot
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20 text-white'
                }
              `}
            >
              <ArrowRight size={16} />
              Confirmer le {isDepot ? 'Dépôt' : 'Retrait'}
            </button>
          </form>
        )}

        {/* ─── PHASE: CONFIRMING ─── */}
        {phase === 'CONFIRMING' && selectedAccount && !duplicateWarning && (
          <div className="p-6 space-y-5">
            <div className={`p-4 rounded-xl border ${isDepot ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-3">Récapitulatif</p>
              <div className="space-y-2.5">
                <Row label="Opération" value={isDepot ? 'Dépôt' : 'Retrait'} />
                <Row label="Compte" value={`${getAccountLabel(selectedAccount)} (${getAccountNumber(selectedAccount).slice(-6)})`} />
                <Row label="Méthode" value={METHODE_PAIEMENT_LABELS[paymentMethod]} />
                {observations.trim() && <Row label="Note" value={observations.trim()} />}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400 font-bold">Montant</span>
                    <span className={`text-2xl font-black font-mono ${isDepot ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatMoney(parseFloat(amount))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={cancelConfirmation}
                disabled={isSubmitting}
                className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition disabled:opacity-50"
              >
                Modifier
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className={`
                  px-4 py-3 rounded-xl text-white font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-50
                  flex items-center justify-center gap-2
                  ${isDepot
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20'
                  }
                `}
              >
                {isSubmitting
                  ? <Loader2 size={18} className="animate-spin" />
                  : <CheckCircle2 size={18} />}
                {isSubmitting ? 'Traitement...' : 'Confirmer'}
              </button>
            </div>
          </div>
        )}

        {/* ─── DUPLICATE WARNING OVERLAY ─── */}
        {duplicateWarning && phase === 'CONFIRMING' && (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-bold text-amber-300">Doublon potentiel</p>
                  <p className="text-xs text-amber-200/80">{duplicateWarning.message}</p>
                  {duplicateWarning.duplicates.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {duplicateWarning.duplicates.map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-xs bg-slate-800/50 rounded-lg px-3 py-2">
                          <span className="text-slate-400 font-mono">{d.reference || d.id.slice(0, 8)}</span>
                          <span className="text-slate-500">
                            {new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={dismissDuplicateWarning}
                className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              {duplicateWarning.canOverride && (
                <button
                  onClick={handleForceConfirm}
                  disabled={isSubmitting}
                  className="px-4 py-3 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                  {isSubmitting ? 'Traitement...' : 'Continuer'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── PHASE: RESULT ─── */}
        {phase === 'RESULT' && result && (
          <div className="p-6 space-y-5">
            {/* Success header */}
            <div className="text-center space-y-2">
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${isDepot ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                <CheckCircle2 size={32} className={isDepot ? 'text-emerald-400' : 'text-rose-400'} />
              </div>
              <p className={`text-2xl font-black font-mono ${isDepot ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isDepot ? '+' : '-'}{formatMoney(parseFloat(amount))}
              </p>
              {result.transaction?.reference && (
                <button
                  onClick={handleCopyRef}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors font-mono"
                >
                  <Copy size={12} />
                  {result.transaction.reference}
                </button>
              )}
            </div>

            {/* Compact details */}
            {selectedAccount && (
              <div className="bg-slate-950/50 rounded-lg border border-slate-800 p-3 space-y-1.5 text-xs">
                <Row label="Compte" value={`${getAccountLabel(selectedAccount)} (${getAccountNumber(selectedAccount).slice(-6)})`} />
                <Row label="Méthode" value={METHODE_PAIEMENT_LABELS[paymentMethod]} />
                <Row label="Client" value={`${client.prenom} ${client.nom}`} />
                {observations.trim() && <Row label="Note" value={observations.trim()} />}
              </div>
            )}

            {/* Receipt actions */}
            {receiptData && (
              <ReceiptActions
                data={receiptData}
                showPreview={false}
                variant="compact"
                showReference={false}
                factureId={factureId || undefined}
              />
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleNewOperation}
                className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition text-sm"
              >
                Nouvelle opération
              </button>
              <button
                onClick={onClose}
                className={`
                  px-4 py-3 rounded-xl text-white font-bold shadow-lg transition-all text-sm
                  ${isDepot
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20'
                  }
                `}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-200 text-xs font-medium">{value}</span>
    </div>
  );
}
