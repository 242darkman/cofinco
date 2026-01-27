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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationType = 'DEPOT' | 'RETRAIT';
export type OperationPhase = 'INPUT' | 'CONFIRMING' | 'RESULT';

export interface AccountInfo {
  id: string;
  typeCompte?: string;
  type_compte?: string;
  numeroCompte?: string;
  numero_compte?: string;
  soldeCourant?: string | number;
  solde_courant?: string | number;
  blocageActif?: boolean;
  blocage_actif?: boolean;
  blocageMotif?: string;
  blocage_motif?: string;
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
  transaction: any;
  mouvement_id: string;
  facture: any | null;
  message: string;
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
  return account.typeCompte || account.type_compte || 'CURRENT';
}

export function getAccountLabel(account: AccountInfo): string {
  return TYPE_COMPTE_LABELS[getAccountType(account)] || getAccountType(account);
}

export function getAccountNumber(account: AccountInfo): string {
  return account.numeroCompte || account.numero_compte || '';
}

export function getAccountBalance(account: AccountInfo): number {
  return Number(account.soldeCourant || account.solde_courant || 0);
}

export function isAccountBlocked(account: AccountInfo): boolean {
  return !!(account.blocageActif || account.blocage_actif);
}

export function getBlockReason(account: AccountInfo): string {
  return account.blocageMotif || account.blocage_motif || '';
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
  const [amount, setAmount] = useState('');
  const [observations, setObservations] = useState('');

  // --- Phase state ---
  const [phase, setPhase] = useState<OperationPhase>('INPUT');

  // --- Result state ---
  const [result, setResult] = useState<OperationResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4());

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

    if (operationType === 'RETRAIT' && securityLimits?.daily && parsedAmount > 0) {
      if (parsedAmount > securityLimits.daily.remaining) {
        errors.limit = `Limite journalière dépassée (reste: ${new Intl.NumberFormat('fr-FR').format(securityLimits.daily.remaining)} FCFA)`;
      }
    }

    if (selectedAccount) {
      const check = canOperateOnAccount(selectedAccount, operationType);
      if (!check.allowed) {
        errors.account = check.reason || 'Opération non autorisée';
      }
    }

    return errors;
  }, [selectedAccountId, selectedAccount, amount, parsedAmount, operationType, securityLimits]);

  const canSubmit = Object.keys(validationErrors).length === 0 && parsedAmount > 0 && !!selectedAccountId;

  // --- API Mutation ---
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccountId) throw new Error('Compte non sélectionné');
      const payload = {
        montant: parsedAmount,
        methodePaiement: paymentMethod,
        observations: observations.trim() || undefined,
        idempotencyKey,
      };

      if (operationType === 'DEPOT') {
        return compteEpargneApi.depot(selectedAccountId, payload);
      } else {
        return compteEpargneApi.retrait(selectedAccountId, payload);
      }
    },
    onSuccess: (data) => {
      setResult(data);
      setPhase('RESULT');
      toast.success(data.message || `${operationType === 'DEPOT' ? 'Dépôt' : 'Retrait'} effectué avec succès`);

      // Invalidate relevant queries
      if (client?.id) {
        queryClient.invalidateQueries({ queryKey: ['clients', client.id] });
        queryClient.invalidateQueries({ queryKey: ['comptes', 'client', client.id] });
        queryClient.invalidateQueries({ queryKey: ['transactions', client.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/operations-caisse'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions-caisse'] });
    },
    onError: (error: any) => {
      const msg =
        error?.response?.data?.message ||
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

  const reset = useCallback(() => {
    setSelectedAccountId(null);
    setPaymentMethod(MethodePaiement.CASH);
    setAmount('');
    setObservations('');
    setPhase('INPUT');
    setResult(null);
    setIdempotencyKey(uuidv4());
  }, []);

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
      devise: 'FCFA',
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
    isSubmitting: mutation.isPending,
    error: mutation.error,

    // Validation
    validationErrors,
    canSubmit,
  };
}
