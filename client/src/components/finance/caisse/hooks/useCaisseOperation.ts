import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { compteEpargneApi } from '@/lib/api-client';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import {
  MethodePaiement,
  METHODE_PAIEMENT_LABELS,
  type MethodePaiementType,
} from '@shared/enum/status-constants';
import type { ReceiptData } from '@/components/ui/printable/ReceiptTemplate';
import { currencySymbol } from '@shared/config/currency';
import { normalizePhone } from '@shared/utils/phone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationType = 'DEPOT' | 'RETRAIT';
export type OperationPhase = 'INPUT' | 'CONFIRMING' | 'RESULT' | 'QUEUED_OFFLINE';

export interface AccountInfo {
  id: string;
  typeCompte?: string;
  numeroCompte?: string;
  soldeCourant?: string | number;
  blocageActif?: boolean;
  blocageMotif?: string;
  statut?: string;
}

export interface SecurityLimits {
  daily: { limit: number; used: number; remaining: number };
  weekly: { limit: number; used: number; remaining: number };
  monthly: { limit: number; used: number; remaining: number };
}

export interface ClientInfo {
  id: string;
  nom: string;
  prenom: string;
  telephone?: string;
  email?: string;
  numeroCompte?: string;
}

interface OperationResult {
  transaction: Record<string, unknown>;
  mouvement_id: string;
  facture: Record<string, unknown> | null;
  message: string;
}

export interface DuplicateWarning {
  message: string;
  duplicates: Array<{
    id: string;
    reference: string;
    montant: string;
    sens: string;
    createdAt: string;
  }>;
  canOverride: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_COMPTE_LABELS: Record<string, string> = {
  CURRENT: 'Courant',
  SAVINGS: 'Épargne',
  BLOCKED: 'Bloqué',
};

export function getAccountType(account: AccountInfo): string {
  return account.typeCompte || 'CURRENT';
}

export function getAccountLabel(account: AccountInfo): string {
  return TYPE_COMPTE_LABELS[getAccountType(account)] || getAccountType(account);
}

export function getAccountNumber(account: AccountInfo): string {
  return account.numeroCompte || '';
}

export function getAccountBalance(account: AccountInfo): number {
  return Number(account.soldeCourant || 0);
}

export function isAccountBlocked(account: AccountInfo): boolean {
  return !!account.blocageActif;
}

export function getBlockReason(account: AccountInfo): string {
  return account.blocageMotif || '';
}

export function canOperateOnAccount(
  account: AccountInfo,
  operationType: OperationType
): { allowed: boolean; reason?: string } {
  const type = getAccountType(account);
  const blocked = isAccountBlocked(account);

  // Deposits always allowed (even on blocked accounts)
  if (operationType === 'DEPOT') return { allowed: true };

  // Withdrawals on blocked accounts are not allowed
  if (type === 'BLOCKED' && blocked) {
    const motif = getBlockReason(account);
    return {
      allowed: false,
      reason: motif
        ? `Compte bloqué (${motif})`
        : 'Compte bloqué — retrait impossible',
    };
  }

  // Closed / suspended
  if (account.statut === 'CLOSED') return { allowed: false, reason: 'Compte clôturé' };
  if (account.statut === 'SUSPENDED') return { allowed: false, reason: 'Compte suspendu' };

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseCaisseOperationParams {
  operationType: OperationType;
  client: ClientInfo | null;
  clientAccounts: AccountInfo[];
  securityLimits?: SecurityLimits | null;
}

export function useCaisseOperation({
  operationType,
  client,
  clientAccounts,
  securityLimits,
}: UseCaisseOperationParams) {
  const queryClient = useQueryClient();

  // --- Form state ---
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<MethodePaiementType>(MethodePaiement.CASH);
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState<'MTN' | 'AIRTEL' | null>(null);
  const [mobileMoneyPhone, setMobileMoneyPhone] = useState(client?.telephone || '');
  const [amount, setAmount] = useState('');
  const [observations, setObservations] = useState('');

  // --- Phase state ---
  const [phase, setPhase] = useState<OperationPhase>('INPUT');

  // --- Result state ---
  const [result, setResult] = useState<OperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4());
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);

  // --- Derived ---
  const selectedAccount = useMemo(
    () => clientAccounts.find((a) => a.id === selectedAccountId) ?? null,
    [clientAccounts, selectedAccountId]
  );

  const parsedAmount = useMemo(() => {
    const n = parseFloat(amount);
    return isNaN(n) ? 0 : n;
  }, [amount]);

  // --- Validation ---
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!selectedAccountId) errors.account = 'Sélectionnez un compte';

    if (!amount || parsedAmount <= 0) {
      errors.amount = 'Montant requis';
    } else if (operationType === 'RETRAIT' && selectedAccount) {
      const solde = getAccountBalance(selectedAccount);
      if (parsedAmount > solde) {
        errors.amount = `Solde insuffisant (${new Intl.NumberFormat('fr-FR').format(solde)} FCFA)`;
      }
    }

    if (operationType === 'RETRAIT' && securityLimits && parsedAmount > 0) {
      if (securityLimits.daily && parsedAmount > securityLimits.daily.remaining) {
        errors.limit = `Limite journalière dépassée (reste: ${new Intl.NumberFormat('fr-FR').format(securityLimits.daily.remaining)} FCFA)`;
      } else if (securityLimits.weekly && parsedAmount > securityLimits.weekly.remaining) {
        errors.limit = `Limite hebdomadaire dépassée (reste: ${new Intl.NumberFormat('fr-FR').format(securityLimits.weekly.remaining)} FCFA)`;
      } else if (securityLimits.monthly && parsedAmount > securityLimits.monthly.remaining) {
        errors.limit = `Limite mensuelle dépassée (reste: ${new Intl.NumberFormat('fr-FR').format(securityLimits.monthly.remaining)} FCFA)`;
      }
    }

    if (selectedAccount) {
      const check = canOperateOnAccount(selectedAccount, operationType);
      if (!check.allowed) {
        errors.account = check.reason || 'Opération non autorisée';
      }
    }

    // Mobile Money validation
    if (paymentMethod === MethodePaiement.MOBILE_MONEY) {
      if (!mobileMoneyProvider) {
        errors.provider = 'Sélectionnez un opérateur';
      }
      if (!mobileMoneyPhone) {
        errors.phone = 'Numéro de téléphone requis';
      } else {
        const cleaned = mobileMoneyPhone.replace(/[\s\-().]/g, '');
        const phoneRegex = /^(?:\+?242)?0?[456]\d{7,8}$/;
        if (cleaned.length < 9 || !phoneRegex.test(cleaned)) {
          errors.phone = 'Format invalide (ex: 06XXXXXXX ou +242 06XXXXXXX)';
        }
      }
    }

    return errors;
  }, [selectedAccountId, selectedAccount, amount, parsedAmount, operationType, securityLimits, paymentMethod, mobileMoneyProvider, mobileMoneyPhone]);

  const canSubmit = Object.keys(validationErrors).length === 0 && parsedAmount > 0 && !!selectedAccountId;

  // --- API Mutation ---
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId) throw new Error('Compte non sélectionné');
      const payload: Record<string, any> = {
        montant: parsedAmount,
        methodePaiement: paymentMethod,
        observations: observations.trim() || undefined,
        idempotencyKey,
      };

      // Add mobile money fields if applicable
      if (paymentMethod === MethodePaiement.MOBILE_MONEY) {
        payload.provider = mobileMoneyProvider;
        payload.phone = normalizePhone(mobileMoneyPhone) || mobileMoneyPhone;
      }

      if (operationType === 'DEPOT') {
        return compteEpargneApi.depot(selectedAccountId, payload);
      } else {
        return compteEpargneApi.retrait(selectedAccountId, payload);
      }
    },
    onSuccess: (data) => {
      // Detect SW offline queue response (202 from Service Worker background sync)
      if (data?.offline && data?.queued) {
        setPhase('QUEUED_OFFLINE');
        toast.info(
          'Opération mise en file d\'attente (hors ligne). Elle sera synchronisée automatiquement au retour du réseau.',
          { duration: 6000 }
        );
        // Generate new idempotency key for next operation
        setIdempotencyKey(uuidv4());
        return;
      }

      setResult(data);
      setPhase('RESULT');
      toast.success(data.message || `${operationType === 'DEPOT' ? 'Dépôt' : 'Retrait'} effectué`);

      // Invalidate relevant queries
      if (client?.id) {
        queryClient.invalidateQueries({ queryKey: ['clients', client.id] });
        queryClient.invalidateQueries({ queryKey: ['comptes', 'client', client.id] });
        queryClient.invalidateQueries({ queryKey: ['transactions', client.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/operations-caisse'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions-caisse'] });
    },
    onError: (error: unknown) => {
      // Detect duplicate warning (409 from duplicate-detection middleware)
      if (error?.status === 409 && error?.data?.error === 'POTENTIAL_DUPLICATE') {
        setDuplicateWarning({
          message: error.data.message,
          duplicates: error.data.duplicates || [],
          canOverride: error.data.canOverride ?? false,
        });
        return;
      }

      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        error?.message ||
        'Erreur lors de l\'opération';
      toast.error(msg);
    },
  });

  // --- Phase transitions ---
  const requestConfirmation = useCallback(() => {
    if (!canSubmit) return false;
    setPhase('CONFIRMING');
    return true;
  }, [canSubmit]);

  const cancelConfirmation = useCallback(() => {
    setPhase('INPUT');
  }, []);

  const executeOperation = useCallback(async () => {
    await mutation.mutateAsync();
  }, [mutation]);

  // Force execute bypassing duplicate check (after user confirms)
  const forceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId) throw new Error('Compte non sélectionné');
      const payload: Record<string, any> = {
        montant: parsedAmount,
        methodePaiement: paymentMethod,
        observations: observations.trim() || undefined,
        idempotencyKey,
        skipDuplicateCheck: true,
      };

      // Add mobile money fields if applicable
      if (paymentMethod === MethodePaiement.MOBILE_MONEY) {
        payload.provider = mobileMoneyProvider;
        payload.phone = normalizePhone(mobileMoneyPhone) || mobileMoneyPhone;
      }

      if (operationType === 'DEPOT') {
        return compteEpargneApi.depot(selectedAccountId, payload);
      } else {
        return compteEpargneApi.retrait(selectedAccountId, payload);
      }
    },
    onSuccess: (data) => {
      setDuplicateWarning(null);
      setResult(data);
      setPhase('RESULT');
      toast.success(data.message || `${operationType === 'DEPOT' ? 'Dépôt' : 'Retrait'} effectué`);

      if (client?.id) {
        queryClient.invalidateQueries({ queryKey: ['clients', client.id] });
        queryClient.invalidateQueries({ queryKey: ['comptes', 'client', client.id] });
        queryClient.invalidateQueries({ queryKey: ['transactions', client.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/operations-caisse'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions-caisse'] });
    },
    onError: (error: unknown) => {
      const msg = error?.message || 'Erreur lors de l\'opération';
      toast.error(msg);
    },
  });

  const forceExecute = useCallback(async () => {
    setDuplicateWarning(null);
    await forceMutation.mutateAsync();
  }, [forceMutation]);

  const dismissDuplicateWarning = useCallback(() => {
    setDuplicateWarning(null);
    setPhase('INPUT');
  }, []);

  const reset = useCallback(() => {
    setSelectedAccountId(null);
    setPaymentMethod(MethodePaiement.CASH);
    setMobileMoneyProvider(null);
    setMobileMoneyPhone(client?.telephone || '');
    setAmount('');
    setObservations('');
    setPhase('INPUT');
    setResult(null);
    setDuplicateWarning(null);
    setIdempotencyKey(uuidv4());
  }, [client?.telephone]);

  // --- Receipt data ---
  const receiptData = useMemo<ReceiptData | null>(() => {
    if (!result || !client || !selectedAccount) return null;

    const accountType = getAccountType(selectedAccount);
    const accountLabel = getAccountLabel(selectedAccount);
    const accountNum = getAccountNumber(selectedAccount);

    return {
      title: operationType === 'DEPOT' ? 'Reçu de Dépôt' : 'Reçu de Retrait',
      reference: result.transaction?.reference || result.transaction?.id || '',
      date: new Date(),
      type: operationType,
      client: {
        nom: client.nom,
        prenom: client.prenom,
        telephone: client.telephone,
        numeroCompte: accountNum,
      },
      total: parsedAmount,
      modePaiement: METHODE_PAIEMENT_LABELS[paymentMethod] || paymentMethod,
      devise: currencySymbol(),
      items: [
        {
          description: `${operationType === 'DEPOT' ? 'Dépôt' : 'Retrait'} — Compte ${accountLabel}`,
          montant: parsedAmount,
        },
      ],
      notes: observations.trim() || undefined,
      transaction: {
        id: result.transaction?.id || '',
        date: new Date(),
        type: operationType,
        amount: parsedAmount,
      },
      details: [
        { label: 'Type de compte', value: accountLabel },
        { label: 'N° Compte', value: accountNum.slice(-8) || '—' },
        { label: 'Méthode', value: METHODE_PAIEMENT_LABELS[paymentMethod] || paymentMethod },
      ],
    };
  }, [result, client, selectedAccount, operationType, parsedAmount, paymentMethod, observations]);

  const factureId = result?.facture?.id || null;

  return {
    // Form state
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

    // Phase
    phase,
    requestConfirmation,
    cancelConfirmation,
    executeOperation,
    reset,

    // Result
    result,
    receiptData,
    factureId,

    // Status
    isSubmitting: mutation.isPending || forceMutation.isPending,
    error: mutation.error,

    // Duplicate detection
    duplicateWarning,
    forceExecute,
    dismissDuplicateWarning,

    // Validation
    validationErrors,
    canSubmit,
  };
}
