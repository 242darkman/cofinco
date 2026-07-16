import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Search, User, CheckCircle, XCircle, Wallet, ArrowUpRight, ArrowDownLeft, Loader, Coins, Phone, AlertCircle, Shield } from 'lucide-react';
import { PhysicalConfirmationStep, PhysicalConfirmationData } from '../../auth/PhysicalConfirmationStep';
import AccountHolderPresenceModal, { PresenceConfirmationData } from '../../auth/AccountHolderPresenceModal';
import { Card, Button, Badge } from '@/components/ui';
import {
  clientSearchApi, creditApi, tontineApi, sessionCaisseApi,
  operationCaisseApi, echeanceCreditApi, compteEpargneApi,
  securityConfigApi, SecurityConfigResponse
} from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, formatPhoneInput, stripPhoneFormat } from '../../../lib/format';
import { VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { PaymentStatusModal, PaymentStatus } from '../payments';
import { useEnabledPaymentMethods } from '../../../contexts/FeatureFlagsContext';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { authService } from '../../../lib/auth';
import { StatutCredit, TypeCompte, TypeOperationCaisse, FREQUENCE_TONTINE_LABELS } from '@shared/enum/status-constants';
import { isIncomingOperation } from '@shared/config/caisse-operations';
import { useOperationInfo } from './hooks/useOperationInfo';
import { useClientOperations } from './hooks/useClientOperations';
import { currencySymbol } from '@shared/config/currency';
import { normalizePhone } from '@shared/utils/phone';
import type { CaisseTransaction } from '../../../types/finance';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import mtnLogo from '@/assets/logos/mtn-logo.png';

// ─── Types ──────────────────────────────────────────────
interface Client {
  id: string;
  nom: string;
  prenom: string;
  numeroCompte?: string;
  numero_compte?: string;
  telephone: string;
  email?: string;
  phone?: string;
  photo_url?: string;
  securityLimits?: {
    daily: { limit: number; used: number; remaining: number };
    weekly: { limit: number; used: number; remaining: number };
    monthly: { limit: number; used: number; remaining: number };
  };
}

type TypeOperation = 'Dépôt' | 'Retrait';
type TypeDepot = 'Compte Courant' | 'Compte Épargne' | 'Compte Bloqué' | 'Cotisation Tontine' | 'Remboursement Crédit';
type TypeRetrait = 'Retrait Compte Courant' | 'Retrait Épargne' | 'Décaissement Crédit' | 'Distribution Tontine';
type MoyenPaiement = 'CASH' | 'MTN' | 'AIRTEL';

interface PaymentIntent {
  id: string;
  externalRef: string;
  provider: 'MTN' | 'AIRTEL';
  type: 'COLLECTION' | 'PAYOUT';
  status: PaymentStatus;
  amount: string;
  phone: string;
  providerTxnId?: string;
  errorMessage?: string;
  createdAt: string;
  confirmedAt?: string;
}

// Lightweight types for API responses (may use snake_case or camelCase keys)
interface CreditInfo {
  id: string;
  numeroCredit: string;
  montant?: string | number;
  solde_restant?: string | number;
  soldeRestant?: string | number;
  statut?: string;
  [key: string]: unknown;
}

interface TontineInfo {
  id: string;
  nom?: string;
  montantCotisation?: string | number;
  [key: string]: unknown;
}

interface CompteInfo {
  id: string;
  typeCompte?: string;
  soldeCourant?: string | number;
  numeroCompte?: string;
  statut?: string;
  [key: string]: unknown;
}

interface EcheanceInfo {
  id: string;
  montantTotal: number;
  montantPaye?: number;
  dateEcheance?: string;
  status?: string;
  [key: string]: unknown;
}

interface CaisseOperationPayload {
  session_id: string;
  client_id: string;
  compte_id?: string;
  type_operation: string;
  montant: number;
  methode_paiement: string;
  reference: string;
  description: string;
  metadata: Record<string, unknown>;
  physical_confirmation?: PhysicalConfirmationData;
}

interface LastOperationInfo {
  reference: string;
  typeOperation: TypeOperation | null;
  typeDetaille: TypeDepot | TypeRetrait | null;
  montant: number;
  client: Client | null;
  date: Date;
  modePaiement: string;
}

// ─── Helpers ────────────────────────────────────────────

/** Validate Congo phone number: +242 or 242 prefix + 9 digits, or local 9 digits starting with 0[456] */
const PHONE_REGEX = /^(?:\+?242)?0?[456]\d{7,8}$/;
const isValidPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return cleaned.length >= 9 && PHONE_REGEX.test(cleaned);
};

const mapToOperationEnum = (typeOp: string | null, typeDetaille: string | null): string => {
  if (!typeDetaille) return TypeOperationCaisse.MISC_COLLECTION;
  const detail = typeDetaille.toLowerCase();

  if (detail.includes('épargne') || detail.includes('epargne'))
    return typeOp === 'Retrait' ? TypeOperationCaisse.WITHDRAWAL_SAVINGS : TypeOperationCaisse.DEPOSIT_SAVINGS;
  if (detail.includes('courant'))
    return typeOp === 'Retrait' ? TypeOperationCaisse.WITHDRAWAL_CURRENT : TypeOperationCaisse.DEPOSIT_CURRENT;
  if (detail.includes('bloqué') || detail.includes('bloque'))
    return typeOp === 'Retrait' ? TypeOperationCaisse.WITHDRAWAL_BLOCKED : TypeOperationCaisse.DEPOSIT_BLOCKED;
  if (detail.includes('tontine') && detail.includes('cotisation'))
    return TypeOperationCaisse.TONTINE_CONTRIBUTION;
  if (detail.includes('tontine') && detail.includes('distribution'))
    return TypeOperationCaisse.TONTINE_WITHDRAWAL;
  if (detail.includes('remboursement') || detail.includes('crédit'))
    return TypeOperationCaisse.LOAN_REPAYMENT;
  if (detail.includes('décaissement') || detail.includes('decaissement'))
    return TypeOperationCaisse.LOAN_DISBURSEMENT;

  return typeOp === 'Retrait' ? TypeOperationCaisse.MISC_DISBURSEMENT : TypeOperationCaisse.MISC_COLLECTION;
};

const getPaymentIntentType = (typeOperation: TypeOperation, subType: string): string => {
  if (typeOperation === 'Dépôt') {
    switch (subType) {
      case 'Remboursement Crédit': return 'CREDIT_REPAYMENT';
      case 'Cotisation Tontine': return 'TONTINE_CONTRIBUTION';
      default: return 'DEPOSIT';
    }
  } else {
    switch (subType) {
      case 'Décaissement Crédit': return 'CREDIT_DISBURSEMENT';
      case 'Distribution Tontine': return 'TONTINE_DISTRIBUTION';
      default: return 'WITHDRAWAL';
    }
  }
};

const DENOMINATIONS = [
  { value: 10000, label: '10.000' },
  { value: 5000, label: '5.000' },
  { value: 2000, label: '2.000' },
  { value: 1000, label: '1.000' },
  { value: 500, label: '500' },
  { value: 100, label: '100' },
];

const PROVIDERS = [
  { id: 'MTN' as const, name: 'MTN MoMo', logo: mtnLogo, color: 'text-status-warning', bg: 'bg-status-warning-bg', border: 'border-status-warning/50' },
  { id: 'AIRTEL' as const, name: 'Airtel Money', logo: airtelLogo, color: 'text-status-danger', bg: 'bg-status-danger-bg', border: 'border-status-danger/50' },
];

// ─── Component ──────────────────────────────────────────
interface CaisseOperationsProps {
  sessionId: string;
  soldeSession?: number;
  recentTransactions?: CaisseTransaction[];
  onTransactionComplete?: () => void;
}

export default function CaisseOperations({ sessionId, soldeSession, recentTransactions, onTransactionComplete }: CaisseOperationsProps) {
  const user = authService.getCurrentUser();
  const enabledPayments = useEnabledPaymentMethods();

  // ── Client Search ──
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // ── Operation Form ──
  const [typeOperation, setTypeOperation] = useState<TypeOperation | null>(null);
  const [typeDepot, setTypeDepot] = useState<TypeDepot | null>(null);
  const [typeRetrait, setTypeRetrait] = useState<TypeRetrait | null>(null);
  const [moyenPaiement, setMoyenPaiement] = useState<MoyenPaiement | null>(null);
  const [montant, setMontant] = useState('');
  const [montantError, setMontantError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Cash-specific ──
  const [showBilletage, setShowBilletage] = useState(false);
  const [billetage, setBilletage] = useState<Record<number, number>>({});
  const [showPhysicalConfirmation, setShowPhysicalConfirmation] = useState(false);
  const [pendingOperationData, setPendingOperationData] = useState<CaisseOperationPayload | null>(null);
  const [confirmationData, setConfirmationData] = useState<PhysicalConfirmationData | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // ── Mobile Money-specific ──
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('CREATED');
  const [showPaymentStatusModal, setShowPaymentStatusModal] = useState(false);
  const [paymentTimeLeft, setPaymentTimeLeft] = useState<number | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [securityConfig, setSecurityConfig] = useState<SecurityConfigResponse | null>(null);
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const [sandboxInfo, setSandboxInfo] = useState<{
    isSandbox: boolean;
    testNumbers?: Record<string, string>;
    helpMessage?: string;
  } | null>(null);
  const [phoneValidation, setPhoneValidation] = useState<{
    warning?: string;
    suggestion?: string;
    behavior?: { expectedStatus: string; expectedDelay?: number };
  } | null>(null);

  // ── Fee estimation (mobile money) ──
  const [feeOption, setFeeOption] = useState<'CLIENT_PAYS' | 'FEES_DEDUCTED' | ''>('');
  const [feeEstimate, setFeeEstimate] = useState<{
    feeAmount: number;
    feeRate: number;
    montantBrut: number;
    montantNet: number;
    feeOption: string;
  } | null>(null);
  const [loadingFeeEstimate, setLoadingFeeEstimate] = useState(false);

  // ── Credit / Tontine / Comptes Data (via hook) ──
  const {
    clientCredits: creditsActifs,
    clientTontines: hookTontines,
    clientAccounts: comptesClient,
    loading: loadingClientOps,
    hasCredits: clientHasCredits,
    hasCreditsForDisbursement: clientHasCreditsForDisbursement,
    hasTontines: clientHasTontines,
    hasAccountType: clientHasAccountType,
  } = useClientOperations(selectedClient?.id);

  // Map hook tontine shape to local TontineInfo for useOperationInfo compatibility
  const tontinesActives = useMemo<TontineInfo[]>(() =>
    hookTontines.map(t => ({ id: t.tontineId, nom: t.tontine.nom, montantCotisation: t.tontine.montantCotisation })),
    [hookTontines]
  );

  const [creditSelectionne, setCreditSelectionne] = useState<CreditInfo | null>(null);
  const [prochaineEcheance, setProchaineEcheance] = useState<EcheanceInfo | null>(null);
  const [tontineSelectionnee, setTontineSelectionnee] = useState<TontineInfo | null>(null);

  // ── Receipt & Success ──
  const [lastOperationData, setLastOperationData] = useState<LastOperationInfo | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);

  // ── Filtered sub-type pills based on client data ──
  const availableDepotSubTypes = useMemo<TypeDepot[]>(() => {
    if (!selectedClient) return [];
    const types: TypeDepot[] = [];
    if (clientHasAccountType('CURRENT')) types.push('Compte Courant');
    if (clientHasAccountType('SAVINGS')) types.push('Compte Épargne');
    if (clientHasAccountType('BLOCKED')) types.push('Compte Bloqué');
    if (clientHasTontines) types.push('Cotisation Tontine');
    if (clientHasCredits) types.push('Remboursement Crédit');
    return types;
  }, [selectedClient, clientHasAccountType, clientHasTontines, clientHasCredits]);

  const availableRetraitSubTypes = useMemo<TypeRetrait[]>(() => {
    if (!selectedClient) return [];
    const types: TypeRetrait[] = [];
    if (clientHasAccountType('CURRENT')) types.push('Retrait Compte Courant');
    if (clientHasAccountType('SAVINGS')) types.push('Retrait Épargne');
    if (clientHasCreditsForDisbursement) types.push('Décaissement Crédit');
    if (clientHasTontines) types.push('Distribution Tontine');
    return types;
  }, [selectedClient, clientHasAccountType, clientHasCreditsForDisbursement, clientHasTontines]);

  // Reset sub-type if it becomes unavailable after client change
  useEffect(() => {
    if (typeOperation === 'Dépôt' && typeDepot && !availableDepotSubTypes.includes(typeDepot)) {
      setTypeDepot(null);
      setMontant('');
      setMontantError(null);
    }
    if (typeOperation === 'Retrait' && typeRetrait && !availableRetraitSubTypes.includes(typeRetrait)) {
      setTypeRetrait(null);
      setMontant('');
      setMontantError(null);
    }
  }, [availableDepotSubTypes, availableRetraitSubTypes, typeOperation, typeDepot, typeRetrait]);

  // ── Dynamic Info Hook ──
  const { infoCardData, suggestedAmount, loading: infoLoading } = useOperationInfo({
    clientId: selectedClient?.id,
    typeOperation,
    subType: typeOperation === 'Dépôt' ? typeDepot : typeRetrait,
    selectedClient: selectedClient as any,
    tontinesActives,
    creditsActifs,
    comptesClient
  });

  // ── Auto-fill amount from suggestion ──
  // Depend on typeDepot/typeRetrait too so re-selecting the same sub-type still applies
  const currentSubTypeKey = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
  useEffect(() => {
    if (suggestedAmount) {
      setMontant(suggestedAmount);
      setMontantError(null);
    }
  }, [suggestedAmount, currentSubTypeKey]);

  // ── Auto-fill phone from client ──
  useEffect(() => {
    if (selectedClient) {
      setPhoneNumber(selectedClient.telephone || '');
    }
  }, [selectedClient]);

  // ── Load security config (for mobile money presence checks) ──
  useEffect(() => {
    const loadSecurityConfig = async () => {
      try {
        const config = await securityConfigApi.getConfig();
        setSecurityConfig(config);
      } catch {
        setSecurityConfig({
          otpEnabled: false,
          requireAccountHolderPresence: true,
          operationsRequiringPresence: ['Retrait', 'Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine'],
          presenceVerificationThreshold: 0
        });
      }
    };
    loadSecurityConfig();
  }, []);

  // ── Load sandbox info ──
  useEffect(() => {
    const loadSandboxInfo = async () => {
      try {
        const res = await fetch('/api/payments/sandbox-info', { credentials: 'include' });
        if (res.ok) setSandboxInfo(await res.json());
      } catch { /* silent */ }
    };
    loadSandboxInfo();
  }, []);

  // ── Payment status polling with client-side timeout ──
  const CLIENT_PAYMENT_TIMEOUT = 5 * 60; // 5 minutes

  // Start countdown when payment modal opens (timestamp-based for tab-switch resilience)
  useEffect(() => {
    if (!showPaymentStatusModal || !paymentIntent) {
      setPaymentTimeLeft(null);
      return;
    }
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'REVERSED'].includes(paymentStatus)) return;

    const deadline = Date.now() + CLIENT_PAYMENT_TIMEOUT * 1000;
    setPaymentTimeLeft(CLIENT_PAYMENT_TIMEOUT);

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setPaymentTimeLeft(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [showPaymentStatusModal, paymentIntent?.id]);

  // Polling effect
  useEffect(() => {
    if (!paymentIntent || !showPaymentStatusModal) return;
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'REVERSED'].includes(paymentStatus)) return;

    let cancelled = false;
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/payments/${paymentIntent.id}`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const intent: PaymentIntent = await res.json();
        if (cancelled) return;
        setPaymentStatus(intent.status);
        setPaymentIntent(intent);

        if (intent.status === 'SUCCESS') {
          clearInterval(pollInterval);
          handlePaymentSuccess(intent);
        } else if (['FAILED', 'EXPIRED', 'REVERSED'].includes(intent.status)) {
          clearInterval(pollInterval);
          toast.error(`Paiement ${intent.status === 'FAILED' ? 'échoué' : intent.status === 'EXPIRED' ? 'expiré' : 'annulé'}`);
        }
      } catch {
        // Polling failure is non-critical, will retry next interval
      }
    }, 5000);

    return () => { cancelled = true; clearInterval(pollInterval); };
  }, [paymentIntent?.id, paymentStatus, showPaymentStatusModal]);

  // ── Phone validation (sandbox) ──
  useEffect(() => {
    if (!phoneNumber || !sandboxInfo?.isSandbox || moyenPaiement !== 'MTN') {
      setPhoneValidation(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch('/api/payments/validate-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone: phoneNumber, provider: moyenPaiement })
        });
        if (res.ok) setPhoneValidation(await res.json());
      } catch { /* silent */ }
    }, 500);
    return () => clearTimeout(timeout);
  }, [phoneNumber, sandboxInfo, moyenPaiement]);

  // ── Reset fee state when payment method changes ──
  useEffect(() => {
    setFeeOption('');
    setFeeEstimate(null);
  }, [moyenPaiement]);

  // ── Debounced fee estimation (mobile money) ──
  useEffect(() => {
    if (!moyenPaiement || moyenPaiement === 'CASH' || !feeOption || !montant) {
      setFeeEstimate(null);
      return;
    }

    const amount = parseFloat(montant);
    if (isNaN(amount) || amount <= 0) {
      setFeeEstimate(null);
      return;
    }

    const provider = moyenPaiement as 'MTN' | 'AIRTEL';
    const direction = typeOperation === 'Dépôt' ? 'COLLECTION' : 'PAYOUT';

    const timer = setTimeout(async () => {
      setLoadingFeeEstimate(true);
      try {
        const params = new URLSearchParams({
          amount: amount.toString(),
          provider,
          direction,
          feeOption,
        });
        const res = await fetch(`/api/payments/fee-estimate?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setFeeEstimate(data);
        }
      } catch {
        // Fee estimate failure is non-critical
      } finally {
        setLoadingFeeEstimate(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [montant, moyenPaiement, typeOperation, feeOption]);

  // ── Auto-show receipt ──
  useEffect(() => {
    if (lastOperationData) handleShowReceipt();
  }, [lastOperationData]);

  // ─── Billetage ────────────────────────────────────────
  const totalBilletage = useMemo(() =>
    Object.entries(billetage).reduce((acc, [val, qty]) => acc + (parseInt(val) * qty), 0),
    [billetage]
  );

  const toggleBilletage = useCallback(() => {
    setShowBilletage(prev => {
      const willHide = prev;
      // Warn if toggling off with a discrepancy
      if (willHide && totalBilletage > 0 && montant && parseInt(montant) !== totalBilletage) {
        setMontantError(`Attention : le montant (${formatMoney(parseInt(montant))}) diffère du billetage (${formatMoney(totalBilletage)})`);
      }
      return !prev;
    });
  }, [totalBilletage, montant]);

  const updateBilletage = useCallback((value: number, count: number) => {
    const sanitizedCount = Math.max(0, Math.floor(count));
    const newBilletage = { ...billetage, [value]: sanitizedCount };
    setBilletage(newBilletage);

    const total = Object.entries(newBilletage).reduce((acc, [val, qty]) => acc + (parseInt(val) * qty), 0);
    if (total > 0) {
      setMontant(total.toString());
      setMontantError(null);
    }
  }, [billetage]);

  // ─── Validation ───────────────────────────────────────
  const validateMontant = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setMontantError('Le montant doit être supérieur à 0');
      return false;
    }
    if (numValue > VALIDATION_LIMITS.MAX_AMOUNT) {
      setMontantError(`Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`);
      return false;
    }
    if (numValue < VALIDATION_LIMITS.MIN_AMOUNT) {
      setMontantError(`Le montant minimum est ${formatMoney(VALIDATION_LIMITS.MIN_AMOUNT)}`);
      return false;
    }
    setMontantError(null);
    return true;
  }, []);

  // ─── Client Search ────────────────────────────────────
  const rechercherClient = useCallback(async () => {
    const trimmedSearch = sanitizeInput(searchTerm.trim());
    if (!trimmedSearch) {
      toast.warning('Veuillez entrer un terme de recherche');
      return;
    }

    setSearchLoading(true);
    try {
      const response = await clientSearchApi.search(trimmedSearch, { page: 1, perPage: 10 });
      const data = response.data?.length ? response.data[0] : null;

      if (data) {
        setSelectedClient(data);
        // Credits, tontines, comptes are now loaded by useClientOperations hook
        toast.success(`Client ${escapeHtml(data.nom)} ${escapeHtml(data.prenom || '')} sélectionné`);
      } else {
        toast.warning('Aucun client trouvé avec ces critères');
      }
    } catch (error) {
      handleApiError(error, 'Erreur lors de la recherche');
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm]);

  // ─── Account ID Resolution ───────────────────────────
  const getCompteIdForOperation = useCallback((typeOp: TypeDepot | TypeRetrait | null): string | undefined => {
    if (!comptesClient.length) return undefined;
    let targetType: string | null = null;
    if (typeOp === 'Compte Courant' || typeOp === 'Retrait Compte Courant') targetType = TypeCompte.CURRENT;
    else if (typeOp === 'Compte Épargne' || typeOp === 'Retrait Épargne') targetType = TypeCompte.SAVINGS;
    else if (typeOp === 'Compte Bloqué') targetType = TypeCompte.BLOCKED;

    if (targetType) {
      const compte = comptesClient.find((c) => c.typeCompte === targetType);
      return compte?.id;
    }
    return undefined;
  }, [comptesClient]);

  // ─── Credit schedule loader ───────────────────────────
  const chargerProchaineEcheance = useCallback(async (creditId: string) => {
    try {
      const echeance = await echeanceCreditApi.getProchaine(creditId);
      if (echeance) {
        setProchaineEcheance(echeance);
        setMontant(echeance.montantTotal.toString());
        setMontantError(null);
      } else {
        setProchaineEcheance(null);
      }
    } catch {
      setProchaineEcheance(null);
    }
  }, []);

  // ─── Physical Confirmation Check ─────────────────────
  const requiresPhysicalConfirmation = useCallback((opType: string, amount: number): boolean => {
    if (opType === 'Retrait') return true;
    if (amount >= 500_000) return true;
    return false;
  }, []);

  // ─── Mobile Money: Presence Check ────────────────────
  const requiresPresenceVerification = useCallback((opType: string, subType?: string): boolean => {
    if (!securityConfig?.requireAccountHolderPresence) return false;
    const typeToCheck = subType || opType;
    return securityConfig.operationsRequiringPresence.some(
      op => op.toLowerCase() === typeToCheck.toLowerCase() || opType.toLowerCase() === 'retrait'
    );
  }, [securityConfig]);

  // ═══════════════════════════════════════════════════════
  // CASH FLOW
  // ═══════════════════════════════════════════════════════
  const preparerOperationCash = useCallback(async () => {
    if (!typeOperation || !montant) {
      toast.warning("Sélectionnez un type d'opération et entrez un montant");
      return;
    }
    if (!validateMontant(montant)) return;

    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    if (!subType) {
      toast.warning(`Sélectionnez la ${typeOperation === 'Dépôt' ? 'destination' : 'source'}`);
      return;
    }
    setShowConfirmDialog(true);
  }, [typeOperation, montant, typeDepot, typeRetrait, validateMontant]);

  const confirmerPreparationCash = useCallback(async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      const reference = `ESP-${Date.now()}`;
      const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
      const compteId = getCompteIdForOperation(typeDetaille);
      const parsedMontant = parseFloat(montant);
      const typeOperationEnum = mapToOperationEnum(typeOperation, typeDetaille);

      const operationData = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        compte_id: compteId,
        type_operation: typeOperationEnum,
        montant: parsedMontant,
        methode_paiement: 'CASH',
        reference,
        description: `${typeOperation} - ${typeDetaille}`,
        metadata: {
          sous_type_operation: typeDetaille,
          type_paiement: 'CASH',
          details_billetage: Object.keys(billetage).length > 0 ? billetage : undefined,
          client_info: {
            nom: selectedClient!.nom,
            prenom: selectedClient!.prenom,
            telephone: selectedClient!.telephone
          }
        }
      };

      setPendingOperationData(operationData);

      if (requiresPhysicalConfirmation(typeOperation!, parsedMontant)) {
        setShowPhysicalConfirmation(true);
        setLoading(false);
      } else {
        setLoading(false);
        await executeCashOperation(operationData);
      }
    } catch (error) {
      handleApiError(error, 'Erreur lors de la préparation');
      setLoading(false);
    }
  }, [typeOperation, typeDepot, typeRetrait, sessionId, selectedClient, montant, billetage, getCompteIdForOperation, requiresPhysicalConfirmation]);

  const executeCashOperation = useCallback(async (operationData: CaisseOperationPayload, loadingId?: string | number) => {
    try {
      const result = await operationCaisseApi.create(operationData);

      // Detect SW offline queue response (202 from Service Worker background sync)
      if (result?.offline && result?.queued) {
        if (loadingId) toast.dismiss(loadingId);
        toast.info(
          'Opération mise en file d\'attente (hors ligne). Elle sera synchronisée automatiquement au retour du réseau.',
          { duration: 6000 }
        );
        // Don't execute secondary ops — they'll be handled on sync
        return true;
      }

      const montantAjout = typeOperation === 'Dépôt' ? parseFloat(montant) : -parseFloat(montant);
      await sessionCaisseApi.update(sessionId, { montant_ajout: montantAjout });

      // Credit repayment secondary ops
      if (typeDepot === 'Remboursement Crédit' && prochaineEcheance && creditSelectionne) {
        const montantPaye = parseFloat(montant);
        await echeanceCreditApi.update(prochaineEcheance.id, {
          montant_paye: (prochaineEcheance.montantPaye || 0) + montantPaye,
          status: montantPaye >= prochaineEcheance.montantTotal ? 'Payée' : 'Partielle',
          date_paiement: montantPaye >= prochaineEcheance.montantTotal ? new Date().toISOString().split('T')[0] : null
        });
        await creditApi.addPayment(creditSelectionne.id, { montant: montantPaye });
      }

      // Tontine contribution secondary ops
      if (typeDepot === 'Cotisation Tontine' && tontineSelectionnee && selectedClient) {
        await tontineApi.addContribution(tontineSelectionnee.id, {
          client_id: selectedClient.id,
          montant: parseFloat(montant),
          date_contribution: new Date().toISOString().split('T')[0]
        });
      }

      if (loadingId) toast.dismiss(loadingId);
      toast.success(`${typeOperation} de ${formatMoney(parseFloat(montant))} effectué`);

      setLastOperationData({
        reference: operationData.reference,
        typeOperation,
        typeDetaille: typeOperation === 'Dépôt' ? typeDepot : typeRetrait,
        montant: parseFloat(montant),
        client: selectedClient,
        date: new Date(),
        modePaiement: 'CASH'
      });

      // Refresh solde and transactions immediately (don't wait for modal close)
      onTransactionComplete?.();

      return true;
    } catch (error) {
      if (loadingId) toast.dismiss(loadingId);
      handleApiError(error, "Erreur lors de l'opération");
      return false;
    }
  }, [typeOperation, typeDepot, montant, sessionId, prochaineEcheance, creditSelectionne, tontineSelectionnee, selectedClient, typeRetrait, onTransactionComplete]);

  const validerOperationDirect = useCallback(async (operationData: CaisseOperationPayload) => {
    const loadingId = toast.loading("Traitement de l'opération en cours...");
    setLoading(true);
    try {
      await executeCashOperation(operationData, loadingId);
    } finally {
      setLoading(false);
    }
  }, [executeCashOperation]);

  const validerOperationAvecConfirmation = useCallback(async (physicalData: PhysicalConfirmationData) => {
    const loadingId = toast.loading("Traitement de l'opération en cours...");
    setShowPhysicalConfirmation(false);
    setConfirmationData(physicalData);
    setLoading(true);
    try {
      const operationAvecConfirmation = { ...pendingOperationData!, physical_confirmation: physicalData };
      await executeCashOperation(operationAvecConfirmation as CaisseOperationPayload, loadingId);
    } finally {
      setLoading(false);
    }
  }, [pendingOperationData, executeCashOperation]);

  // ═══════════════════════════════════════════════════════
  // MOBILE MONEY FLOW
  // ═══════════════════════════════════════════════════════
  const handlePaymentSuccess = useCallback(async (intent: PaymentIntent) => {
    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    const provider = moyenPaiement as 'MTN' | 'AIRTEL';

    const rData: ReceiptData = {
      title: `Reçu ${typeOperation} Mobile Money`,
      reference: intent.externalRef,
      date: new Date(intent.confirmedAt || intent.createdAt),
      type: typeOperation || '',
      client: {
        nom: selectedClient?.nom || '',
        prenom: selectedClient?.prenom || '',
        telephone: intent.phone,
        numeroCompte: selectedClient?.numeroCompte
      },
      items: [{
        description: `${typeOperation} - ${subType}`,
        details: `Via ${provider} Mobile Money`,
        montant: parseFloat(intent.amount),
        quantite: 1
      }],
      total: parseFloat(intent.amount),
      modePaiement: `${provider} Mobile Money`,
      notes: intent.providerTxnId ? `ID Transaction: ${intent.providerTxnId}` : undefined,
      agent: { nom: user?.nom || 'Caissier', prenom: user?.prenom || '' }
    };

    setReceiptData(rData);
    setShowPaymentStatusModal(false);
    setShowSuccessModal(true);
    onTransactionComplete?.();
  }, [typeOperation, typeDepot, typeRetrait, moyenPaiement, selectedClient, user, onTransactionComplete]);

  // ── Manual status check (after client timeout) ──
  const handleCheckStatus = useCallback(async () => {
    if (!paymentIntent?.id) return;
    setIsCheckingStatus(true);
    try {
      const res = await fetch(`/api/payments/${paymentIntent.id}`, { credentials: 'include' });
      if (res.ok) {
        const intent: PaymentIntent = await res.json();
        setPaymentStatus(intent.status);
        setPaymentIntent(intent);
        if (intent.status === 'SUCCESS') {
          handlePaymentSuccess(intent);
        } else if (['FAILED', 'EXPIRED', 'REVERSED'].includes(intent.status)) {
          toast.error(`Paiement ${intent.status === 'FAILED' ? 'échoué' : intent.status === 'EXPIRED' ? 'expiré' : 'annulé'}`);
        } else {
          toast.info('Le paiement est toujours en attente');
        }
      }
    } catch {
      toast.error('Impossible de vérifier le statut');
    } finally {
      setIsCheckingStatus(false);
    }
  }, [paymentIntent?.id, handlePaymentSuccess]);

  const initiatePayment = useCallback(async (presenceData?: PresenceConfirmationData) => {
    if (!selectedClient || !typeOperation || !montant || parseFloat(montant) <= 0 || !phoneNumber) {
      toast.warning('Veuillez remplir tous les champs requis');
      return;
    }
    if (!isValidPhone(phoneNumber)) {
      toast.warning('Numéro de téléphone invalide');
      setPhoneError('Format invalide (ex: 06XXXXXXX ou +242 06XXXXXXX)');
      return;
    }
    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    if (!subType) {
      toast.warning(`Sélectionnez le type de ${typeOperation.toLowerCase()}`);
      return;
    }

    const provider = moyenPaiement as 'MTN' | 'AIRTEL';
    setLoading(true);
    try {
      const isCollection = typeOperation === 'Dépôt';
      const endpoint = isCollection ? '/api/payments/collect' : '/api/payments/payout';
      const paymentType = getPaymentIntentType(typeOperation, subType);
      const idempotencyKey = crypto.randomUUID();

      const payload: Record<string, unknown> = {
        provider,
        amount: parseFloat(montant),
        phone: normalizePhone(phoneNumber) || phoneNumber,
        clientId: selectedClient.id,
        agenceId: user?.agenceId,
        idempotencyKey,
        type: paymentType,
        metadata: { sessionId, subType, presenceVerification: presenceData },
        feeOption: feeOption || undefined
      };

      if ((subType === 'Remboursement Crédit' || subType === 'Décaissement Crédit') && creditSelectionne) {
        payload.creditId = creditSelectionne.id;
      }
      if ((subType === 'Cotisation Tontine' || subType === 'Distribution Tontine') && tontineSelectionnee) {
        payload.tontineId = tontineSelectionnee.id;
      }
      if (comptesClient.length > 0 && !payload.creditId && !payload.tontineId) {
        payload.compteId = comptesClient[0].id;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur lors du paiement');
      }

      const intent: PaymentIntent = await res.json();
      setPaymentIntent(intent);
      setPaymentStatus(intent.status);
      setShowPaymentStatusModal(true);

      toast.info(isCollection
        ? 'Demande envoyée. Le client doit valider sur son téléphone.'
        : 'Décaissement en cours...');
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : "Erreur lors de l'initiation du paiement"));
    } finally {
      setLoading(false);
    }
  }, [selectedClient, typeOperation, typeDepot, typeRetrait, montant, phoneNumber, moyenPaiement, user, sessionId, creditSelectionne, tontineSelectionnee, comptesClient]);

  const handleMoMoSubmit = useCallback(async () => {
    const subType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    if (requiresPresenceVerification(typeOperation!, subType || undefined)) {
      setShowPresenceModal(true);
    } else {
      await initiatePayment();
    }
  }, [typeOperation, typeDepot, typeRetrait, requiresPresenceVerification, initiatePayment]);

  const handlePresenceConfirm = useCallback(async (presenceData: PresenceConfirmationData) => {
    setShowPresenceModal(false);
    await initiatePayment(presenceData);
  }, [initiatePayment]);

  // ─── Receipt ──────────────────────────────────────────
  const handleShowReceipt = useCallback(() => {
    if (!lastOperationData) return;

    const rData: ReceiptData = {
      title: `Reçu de ${lastOperationData.typeOperation}`,
      reference: lastOperationData.reference,
      date: lastOperationData.date,
      type: lastOperationData.typeDetaille || lastOperationData.typeOperation || undefined,
      client: {
        nom: lastOperationData.client?.nom || '',
        prenom: lastOperationData.client?.prenom || '',
        telephone: lastOperationData.client?.telephone || '',
        numeroCompte: lastOperationData.client?.numeroCompte
      },
      agent: { nom: user?.nom || 'Agent', prenom: user?.prenom || '', id: user?.id },
      items: [{
        description: `${lastOperationData.typeOperation} - ${lastOperationData.typeDetaille || lastOperationData.modePaiement}`,
        montant: lastOperationData.montant,
        quantite: 1
      }],
      total: lastOperationData.montant,
      modePaiement: lastOperationData.modePaiement || 'CASH',
      devise: currencySymbol()
    };

    setReceiptData(rData);
    setShowSuccessModal(true);
  }, [lastOperationData, user]);

  // ─── Form Reset ───────────────────────────────────────
  const reinitialiserFormulaire = useCallback(() => {
    setSelectedClient(null);
    setTypeOperation(null);
    setTypeDepot(null);
    setTypeRetrait(null);
    setMoyenPaiement(null);
    setMontant('');
    setSearchTerm('');
    setPendingOperationData(null);
    setCreditSelectionne(null);
    setTontineSelectionnee(null);
    setProchaineEcheance(null);
    setBilletage({});
    setShowBilletage(false);
    setMontantError(null);
    setConfirmationData(null);
    setShowPhysicalConfirmation(false);
    setShowPresenceModal(false);
    setPhoneNumber('');
    setPhoneError(null);
    setPaymentIntent(null);
    setPaymentStatus('CREATED');
    setFeeOption('');
    setFeeEstimate(null);
  }, []);

  // ─── Keyboard Shortcuts ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || showSuccessModal || showPaymentStatusModal || confirmationData || showPhysicalConfirmation || showPresenceModal || showConfirmDialog) return;

      // Step 1: If search has text, clear it first
      if (searchTerm) {
        e.preventDefault();
        setSearchTerm('');
        return;
      }
      // Step 2: If a client is selected, reset the whole form
      if (selectedClient) {
        e.preventDefault();
        reinitialiserFormulaire();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchTerm, selectedClient, showSuccessModal, showPaymentStatusModal, confirmationData, showPhysicalConfirmation, showPresenceModal, showConfirmDialog, reinitialiserFormulaire]);

  // ─── Submit Dispatch ──────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (moyenPaiement === 'CASH') {
      preparerOperationCash();
    } else {
      handleMoMoSubmit();
    }
  }, [moyenPaiement, preparerOperationCash, handleMoMoSubmit]);

  // ─── Confirmation Message ─────────────────────────────
  const confirmationMessage = useMemo(() => {
    if (!selectedClient || !typeOperation || !montant) return '';
    const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    return `Vous êtes sur le point d'effectuer un ${typeOperation?.toLowerCase()} de ${formatMoney(parseFloat(montant))} pour ${escapeHtml(selectedClient.nom)} ${escapeHtml(selectedClient.prenom || '')}${typeDetaille ? ` (${typeDetaille})` : ''}.`;
  }, [selectedClient, typeOperation, typeDepot, typeRetrait, montant]);

  // ─── Derived: current sub-type selected ───────────────
  const currentSubType = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
  const isFormComplete = !!selectedClient && !!typeOperation && !!currentSubType && !!moyenPaiement && !!montant && parseFloat(montant) > 0 && !montantError;

  // ─── Limits ───────────────────────────────────────────
  const limits = selectedClient?.securityLimits;

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full font-sans selection:bg-accent-secondary/30 p-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">

        {/* ── LEFT PANEL: Client Search + Profile ── */}
        <div className="lg:col-span-4 flex flex-col gap-2 h-full overflow-hidden">
          {/* Search */}
          <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge p-3 shrink-0">
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-content-muted shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                placeholder="Nom, téléphone, compte..."
                className="flex-1 bg-transparent border-none text-sm text-content-primary focus:ring-0 placeholder:text-content-muted p-0 outline-none"
                autoFocus
              />
              <button
                onClick={rechercherClient}
                disabled={searchLoading || !searchTerm.trim()}
                className="text-[9px] bg-accent-secondary hover:bg-accent-secondary disabled:bg-surface-elevated text-white px-2 py-1 rounded font-bold transition-colors shrink-0"
              >
                {searchLoading ? <Spinner size="xs" tone="current" /> : 'OK'}
              </button>
            </div>
          </Card>

          {/* Client Profile */}
          {selectedClient ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 custom-scrollbar">
              <Card className="bg-surface/50 border border-edge-subtle p-3 relative animate-in fade-in zoom-in-95 duration-300">
                <button
                  onClick={reinitialiserFormulaire}
                  className="absolute top-2 right-2 text-content-muted hover:text-status-danger transition"
                >
                  <XCircle size={14} />
                </button>

                {/* Avatar + Name */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-status-success to-accent shadow-lg shadow-status-success/20 p-0.5 shrink-0">
                    <div className="w-full h-full rounded-full overflow-hidden bg-surface-base flex items-center justify-center text-content-primary">
                      <User size={18} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-content-primary truncate">
                      {escapeHtml(selectedClient.nom)} {escapeHtml(selectedClient.prenom || '')}
                    </h3>
                    <p className="text-xs text-content-muted truncate">{escapeHtml(selectedClient.telephone || '')}</p>
                  </div>
                </div>

                {selectedClient.numeroCompte && (
                  <Badge variant="neutral" size="sm" className="bg-surface border-edge text-content-secondary text-[10px] mb-2" value={escapeHtml(selectedClient.numeroCompte)} />
                )}

                {/* Security Limits */}
                {limits && (
                  <div className="space-y-2 pt-2 border-t border-edge/50">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield size={10} className="text-content-muted" />
                      <span className="text-[9px] uppercase tracking-wider text-content-muted font-bold">Limites retrait</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-content-muted">Jour</span>
                        <span className="font-mono text-content-secondary">{new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(limits.daily.remaining)}</span>
                      </div>
                      <div className="h-1 bg-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (limits.daily.used / limits.daily.limit) > 0.8 ? 'bg-status-danger' :
                            (limits.daily.used / limits.daily.limit) > 0.5 ? 'bg-status-warning' : 'bg-status-success'
                          }`}
                          style={{ width: `${Math.min(1, limits.daily.used / limits.daily.limit) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[8px] text-content-muted mb-0.5">Hebdo</p>
                        <div className="h-0.5 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-status-info/70" style={{ width: `${Math.min(1, limits.weekly.used / limits.weekly.limit) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[8px] text-content-muted mb-0.5">Mensuel</p>
                        <div className="h-0.5 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-status-info/70" style={{ width: `${Math.min(1, limits.monthly.used / limits.monthly.limit) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* Info Card */}
              {infoCardData && (
                <div className={`p-2.5 rounded-lg border text-center transition-all duration-300 ${
                  infoCardData.amount !== null && infoCardData.amount > 0
                    ? 'bg-status-info-bg border-status-info/30'
                    : 'bg-surface-base/50 border-edge'
                }`}>
                  <p className="text-[9px] text-content-muted uppercase tracking-wider mb-0.5 truncate">{infoCardData.title}</p>
                  {infoLoading ? (
                    <Loader className="w-3 h-3 animate-spin mx-auto text-accent" />
                  ) : (
                    <>
                      <p className={`font-mono text-sm font-bold ${infoCardData.amount !== null ? 'text-content-primary' : 'text-content-muted'}`}>
                        {infoCardData.amount !== null ? formatMoney(infoCardData.amount) : '-'}
                      </p>
                      {infoCardData.subtitle && <p className="text-[8px] text-content-muted truncate">{infoCardData.subtitle}</p>}
                    </>
                  )}
                </div>
              )}

              {!infoCardData && currentSubType && (
                <div className="p-2 rounded bg-surface-base/30 border border-edge/50 text-center">
                  <p className="text-[10px] text-content-muted">Chargement...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 rounded-xl border-2 border-dashed border-edge bg-surface-base/20 flex flex-col items-center justify-center text-content-muted space-y-3 p-6">
              <User size={28} className="opacity-20" />
              <div className="text-center">
                <p className="text-xs font-medium">Recherchez un client</p>
                <p className="text-[10px] text-content-muted mt-0.5">pour commencer une opération</p>
              </div>
            </div>
          )}

          {/* Mini-historique: last session operations */}
          {recentTransactions && recentTransactions.length > 0 && (
            <Card className="bg-surface/50 border border-edge-subtle p-2 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Dernières opérations</span>
                <span className="text-[9px] text-content-muted">{recentTransactions.length}</span>
              </div>
              <div className="divide-y divide-edge-subtle">
                {recentTransactions.map((tx) => {
                  const isReversalTx = tx.description?.startsWith('[ANNULATION]');
                  const isReversed = tx.statut === 'REVERSED';
                  const incoming = isIncomingOperation(tx.typeOperation || tx.type_operation);
                  const isEntree = isReversalTx ? !incoming : incoming;
                  const isCancelled = isReversed || isReversalTx;
                  return (
                    <div key={tx.id} className={`py-1 flex items-center justify-between ${isCancelled ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          isCancelled ? 'bg-surface-subtle text-content-muted' :
                          isEntree ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'
                        }`}>
                          {isEntree ? <ArrowDownLeft size={10}/> : <ArrowUpRight size={10}/>}
                        </div>
                        <span className={`text-[10px] truncate ${isCancelled ? 'text-content-muted line-through' : 'text-content-secondary'}`}>
                          {tx.clientNom || tx.typeOperation}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold shrink-0 ${
                        isCancelled ? 'text-content-muted line-through' :
                        isEntree ? 'text-status-success' : 'text-status-danger'
                      }`}>
                        {isEntree ? '+' : '-'}{Number(tx.montant).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* ── RIGHT PANEL: Operation Form ── */}
        <div className="lg:col-span-8 h-full flex flex-col">
          {selectedClient ? (
            <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge h-full p-0 flex flex-col overflow-hidden relative animate-in slide-in-from-right-4 duration-300">

              {/* Step 1: Direction */}
              <div className="p-3 border-b border-edge bg-surface-base/30 shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold text-content-primary flex items-center gap-2">
                      <Coins className="text-accent" size={16} />
                      Opération
                    </h2>
                    {soldeSession != null && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded border border-edge-subtle">
                        <Wallet size={11} className="text-accent" />
                        <span className="text-[10px] text-content-muted">Solde</span>
                        <span className="text-[10px] font-mono font-bold text-content-primary">{soldeSession.toLocaleString('fr-FR')} F</span>
                      </div>
                    )}
                  </div>
                  <div className="flex bg-surface-base p-0.5 rounded-lg border border-edge">
                    {(['Dépôt', 'Retrait'] as TypeOperation[]).map(type => (
                      <button
                        key={type}
                        onClick={() => {
                          setTypeOperation(type);
                          setTypeDepot(null);
                          setTypeRetrait(null);
                          setMoyenPaiement(null);
                          setShowBilletage(false);
                          setMontantError(null);
                          setMontant('');
                          setConfirmationData(null);
                        }}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                          typeOperation === type
                            ? type === 'Dépôt' ? 'bg-status-success text-white shadow-lg' : 'bg-status-danger text-white shadow-lg'
                            : 'text-content-muted hover:text-content-secondary hover:bg-white/5'
                        }`}
                      >
                        {type === 'Dépôt' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Sub-type pills (filtered by client data) */}
                {typeOperation && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="text-[9px] uppercase tracking-wider text-content-muted font-bold mb-1.5 block">
                      {typeOperation === 'Dépôt' ? 'Destination' : 'Source'}
                    </label>
                    {loadingClientOps ? (
                      <div className="flex items-center gap-2 text-xs text-content-muted py-1">
                        <Spinner size="xs" tone="current" /> Chargement...
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {(typeOperation === 'Dépôt' ? availableDepotSubTypes : availableRetraitSubTypes
                        ).map((subType: string) => (
                          <button
                            key={subType}
                            onClick={() => {
                              if (typeOperation === 'Dépôt') setTypeDepot(subType as TypeDepot);
                              else setTypeRetrait(subType as TypeRetrait);
                              setCreditSelectionne(null);
                              setTontineSelectionnee(null);
                              setMontant('');
                              setMontantError(null);
                              setMoyenPaiement(null);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-all ${
                              (typeDepot === subType || typeRetrait === subType)
                                ? 'bg-surface-elevated text-content-primary border-edge-strong shadow-sm'
                                : 'bg-transparent border-edge text-content-muted hover:border-edge'
                            }`}
                          >
                            {subType}
                          </button>
                        ))}
                        {(typeOperation === 'Dépôt' ? availableDepotSubTypes : availableRetraitSubTypes).length === 0 && (
                          <p className="text-[10px] text-content-muted py-1">Aucune opération disponible pour ce type</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Main Form Content */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {/* Step 3: Payment Method */}
                {currentSubType && (
                  <div className="animate-in fade-in slide-in-from-bottom-2">
                    <label className="text-[9px] uppercase tracking-wider text-content-muted font-bold mb-2 block">Moyen de paiement</label>
                    <div className="flex gap-2">
                      {/* Cash */}
                      {enabledPayments.CASH && (
                      <button
                        onClick={() => { setMoyenPaiement('CASH'); setPhoneNumber(''); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                          moyenPaiement === 'CASH'
                            ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10'
                            : 'border-edge bg-surface-base/50 hover:border-edge-strong'
                        }`}
                      >
                        <Coins size={18} className={moyenPaiement === 'CASH' ? 'text-accent' : 'text-content-muted'} />
                        <span className={`text-xs font-bold ${moyenPaiement === 'CASH' ? 'text-content-primary' : 'text-content-muted'}`}>Espèces</span>
                      </button>
                      )}

                      {/* Mobile Money providers */}
                      {enabledPayments.MOBILE_MONEY && PROVIDERS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setMoyenPaiement(p.id);
                            if (selectedClient) setPhoneNumber(selectedClient.telephone || '');
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                            moyenPaiement === p.id
                              ? `${p.border} ${p.bg} shadow-lg`
                              : 'border-edge bg-surface-base/50 hover:border-edge-strong'
                          }`}
                        >
                          <img src={p.logo} className="w-5 h-5 object-contain" alt="" />
                          <span className={`text-xs font-bold ${moyenPaiement === p.id ? p.color : 'text-content-muted'}`}>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Details (dynamic based on payment method) */}
                {moyenPaiement && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4">

                    {/* Credits selector */}
                    {typeDepot === 'Remboursement Crédit' && creditsActifs.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-content-muted uppercase tracking-wider">Crédit à rembourser</label>
                        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-thin scrollbar-thumb-edge">
                          {creditsActifs.map((credit) => (
                            <div
                              key={credit.id}
                              onClick={() => {
                                setCreditSelectionne(credit);
                                chargerProchaineEcheance(credit.id);
                              }}
                              className={`min-w-[160px] p-2.5 rounded-xl border cursor-pointer transition-all ${
                                creditSelectionne?.id === credit.id
                                  ? 'border-status-info/50 bg-status-info-bg shadow-lg'
                                  : 'border-edge bg-surface-base/50 hover:border-edge-strong'
                              }`}
                            >
                              <div className="text-xs font-bold text-content-secondary"># {escapeHtml(credit.numeroCredit)}</div>
                              <div className="text-[10px] text-content-muted mt-0.5">Reste: <span className="text-status-info font-bold">{formatMoney(credit.solde_restant)}</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tontine selector */}
                    {((typeDepot === 'Cotisation Tontine') || (typeRetrait === 'Distribution Tontine')) && tontinesActives.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-content-muted uppercase tracking-wider">Tontine</label>
                        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-thin scrollbar-thumb-edge">
                          {hookTontines.map((t) => {
                            const tInfo = tontinesActives.find(ta => ta.id === t.tontineId);
                            return (
                              <div
                                key={t.tontineId}
                                onClick={() => tInfo && setTontineSelectionnee(tInfo)}
                                className={`min-w-[160px] p-2.5 rounded-xl border cursor-pointer transition-all ${
                                  tontineSelectionnee?.id === t.tontineId
                                    ? 'border-accent/50 bg-accent/5 shadow-lg'
                                    : 'border-edge bg-surface-base/50 hover:border-edge-strong'
                                }`}
                              >
                                <div className="text-xs font-bold text-content-secondary truncate">{escapeHtml(t.tontine.nom)}</div>
                                <div className="text-[10px] text-content-muted mt-0.5">
                                  {formatMoney(t.tontine.montantCotisation)}/
                                  {FREQUENCE_TONTINE_LABELS[t.tontine.frequence as keyof typeof FREQUENCE_TONTINE_LABELS] || t.tontine.frequence}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Mobile Money: Phone input */}
                    {(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') && (
                      <div>
                        <label className="text-[10px] text-content-muted font-medium mb-1 block">Numéro Mobile</label>
                        <div className="relative">
                          <Phone size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
                          <input
                            type="tel"
                            value={formatPhoneInput(phoneNumber)}
                            onChange={(e) => {
                              const val = stripPhoneFormat(e.target.value);
                              setPhoneNumber(val);
                              if (val && !isValidPhone(val)) {
                                setPhoneError('Format invalide (ex: 06XXXXXXX ou +242 06XXXXXXX)');
                              } else {
                                setPhoneError(null);
                              }
                            }}
                            className={`w-full bg-surface-base border rounded-lg py-2 pl-8 pr-3 text-sm text-content-primary focus:ring-1 focus:ring-accent/50 outline-none font-mono ${
                              phoneError ? 'border-status-danger/50' : phoneValidation?.warning ? 'border-status-warning/50' : 'border-edge'
                            }`}
                            placeholder="+242 06 XXX XX XX"
                          />
                          {phoneError && (
                            <p className="text-[9px] text-status-danger mt-0.5">{phoneError}</p>
                          )}
                        </div>
                        {phoneValidation?.warning && (
                          <div className="mt-1 p-1.5 rounded bg-status-warning-bg border border-status-warning/20 text-[9px] text-status-warning">
                            <span className="font-bold">Sandbox:</span> {phoneValidation.warning}
                            {phoneValidation.suggestion && <span className="block font-mono">{phoneValidation.suggestion}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sandbox Banner */}
                    {(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') && sandboxInfo?.isSandbox && (
                      <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg px-3 py-1.5 flex items-center gap-2">
                        <AlertCircle size={12} className="text-status-warning shrink-0" />
                        <p className="text-[9px] text-status-warning">
                          <span className="font-bold">Sandbox:</span> Test avec {sandboxInfo.testNumbers?.SUCCESS_IMMEDIATE} (immédiat) ou {sandboxInfo.testNumbers?.SUCCESS_DELAYED} (30s)
                        </p>
                      </div>
                    )}

                    {/* Amount Input */}
                    <div className="bg-surface-base p-3 rounded-xl border border-edge">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium text-content-muted">Montant (FCFA)</label>
                        {moyenPaiement === 'CASH' && (
                          <button
                            onClick={toggleBilletage}
                            className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                              showBilletage ? 'text-status-success bg-status-success-bg' : 'text-content-muted hover:text-status-success'
                            }`}
                          >
                            <Coins size={11} />
                            {showBilletage ? 'Masquer' : 'Billetage'}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={montant}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setMontant(val);
                          if (val) validateMontant(val);
                          else setMontantError(null);
                        }}
                        disabled={typeDepot === 'Cotisation Tontine' || showBilletage}
                        placeholder="0"
                        className={`w-full py-2 text-3xl font-bold bg-transparent border-b-2 outline-none text-center transition-all font-mono ${
                          montantError ? 'border-status-danger text-status-danger' : 'border-edge text-content-primary focus:border-accent'
                        }`}
                      />
                      {montantError && <p className="text-[10px] text-status-danger text-center mt-1">{montantError}</p>}
                    </div>

                    {/* Fee Options (Mobile Money only) */}
                    {(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') && montant && parseFloat(montant) > 0 && (
                      <div className="animate-in fade-in slide-in-from-bottom-2">
                        <label className="text-[9px] uppercase tracking-wider text-content-muted font-bold mb-2 block">Gestion des frais</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFeeOption(feeOption === 'CLIENT_PAYS' ? '' : 'CLIENT_PAYS')}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              feeOption === 'CLIENT_PAYS'
                                ? 'border-accent/50 bg-accent/10'
                                : 'border-edge bg-surface-base hover:border-edge-strong'
                            }`}
                          >
                            <p className={`text-[11px] font-bold ${feeOption === 'CLIENT_PAYS' ? 'text-accent' : 'text-content-primary'}`}>
                              Client paie en plus
                            </p>
                            <p className="text-[9px] text-content-muted mt-0.5">Frais ajoutés au montant</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFeeOption(feeOption === 'FEES_DEDUCTED' ? '' : 'FEES_DEDUCTED')}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              feeOption === 'FEES_DEDUCTED'
                                ? 'border-accent/50 bg-accent/10'
                                : 'border-edge bg-surface-base hover:border-edge-strong'
                            }`}
                          >
                            <p className={`text-[11px] font-bold ${feeOption === 'FEES_DEDUCTED' ? 'text-accent' : 'text-content-primary'}`}>
                              Frais déduits
                            </p>
                            <p className="text-[9px] text-content-muted mt-0.5">Frais déduits du montant</p>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Fee Estimate Preview (Mobile Money) */}
                    {(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') && feeOption && feeEstimate && (
                      <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-1.5 animate-in fade-in">
                        <div className="flex justify-between text-xs">
                          <span className="text-content-muted">Montant opération</span>
                          <span className="text-content-primary font-medium">{Number(montant).toLocaleString()} {currencySymbol()}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-content-muted">Frais {moyenPaiement} ({feeEstimate.feeRate}%)</span>
                          <span className="text-status-warning font-medium">{feeEstimate.feeAmount.toLocaleString()} {currencySymbol()}</span>
                        </div>
                        <div className="flex justify-between text-xs pt-1.5 border-t border-accent/20">
                          <span className="text-content-muted font-semibold">
                            {typeOperation === 'Dépôt'
                              ? (feeOption === 'CLIENT_PAYS' ? 'Total débité du téléphone' : 'Crédité au compte')
                              : (feeOption === 'CLIENT_PAYS' ? 'Débité du compte' : 'Reçu au téléphone')}
                          </span>
                          <span className="text-content-primary font-bold">
                            {(feeOption === 'CLIENT_PAYS' ? feeEstimate.montantBrut : feeEstimate.montantNet).toLocaleString()} {currencySymbol()}
                          </span>
                        </div>
                      </div>
                    )}
                    {(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') && feeOption && loadingFeeEstimate && (
                      <div className="flex items-center gap-2 text-xs text-content-muted">
                        <Spinner size="xs" tone="current" />
                        Calcul des frais...
                      </div>
                    )}

                    {/* Billetage Grid (Cash only) */}
                    {moyenPaiement === 'CASH' && showBilletage && (
                      <div className="bg-surface-base/50 border border-edge rounded-xl p-3 animate-in fade-in slide-in-from-right-4">
                        <div className="grid grid-cols-2 gap-2">
                          {DENOMINATIONS.map((denom) => (
                            <div key={denom.value} className="flex items-center gap-2">
                              <span className="text-[10px] text-content-muted w-12 text-right font-mono">{denom.label}</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={billetage[denom.value] || ''}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  updateBilletage(denom.value, parseInt(val) || 0);
                                }}
                                className="flex-1 py-1 px-2 text-xs bg-surface-base border border-edge rounded text-right text-content-primary focus:border-accent outline-none font-mono"
                              />
                            </div>
                          ))}
                        </div>
                        {totalBilletage > 0 && (
                          <div className="mt-2 pt-2 border-t border-edge flex justify-between items-center">
                            <span className="text-[10px] text-content-muted">Total billetage</span>
                            <span className="text-xs font-bold font-mono text-content-primary">{formatMoney(totalBilletage)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Physical Confirmation Indicator */}
                    {moyenPaiement === 'CASH' && confirmationData && (
                      <div className="bg-status-info-bg border border-status-info/20 rounded-xl p-2.5 flex items-start gap-2">
                        <CheckCircle size={14} className="text-status-info mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-status-info">Identité Confirmée</p>
                          <p className="text-[10px] text-content-muted capitalize">Méthode: {confirmationData.verificationMethod.replace('_', ' ')}</p>
                        </div>
                      </div>
                    )}

                    {/* MoMo confirmation info */}
                    {(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') && typeOperation && montant && parseFloat(montant) > 0 && (
                      <div className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                        typeOperation === 'Dépôt' ? 'bg-status-success/5 border-status-success/20' : 'bg-status-danger/5 border-status-danger/20'
                      }`}>
                        <AlertCircle size={14} className={`shrink-0 mt-0.5 ${typeOperation === 'Dépôt' ? 'text-status-success' : 'text-status-danger'}`} />
                        <p className="text-[10px] text-content-muted leading-relaxed">
                          {typeOperation === 'Dépôt'
                            ? `Collecte de ${formatMoney(feeEstimate && feeOption === 'CLIENT_PAYS' ? feeEstimate.montantBrut : parseFloat(montant))} sur ${phoneNumber || '...'}. Validation PIN ${moyenPaiement} requise.`
                            : `Envoi de ${formatMoney(feeEstimate && feeOption === 'FEES_DEDUCTED' ? feeEstimate.montantNet : parseFloat(montant))} vers ${phoneNumber || '...'}. Vérifiez l'identité du bénéficiaire.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 5: Summary + Confirm (sticky bottom) */}
              {isFormComplete && (
                <div className="p-3 border-t border-edge bg-surface-base/50 mt-auto shrink-0 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                  {/* Summary line */}
                  <p className="text-[10px] text-content-muted text-center truncate">
                    {typeOperation} <span className="font-bold text-content-secondary">{formatMoney(parseFloat(montant))}</span> → {currentSubType} via{' '}
                    <span className="font-bold">{moyenPaiement === 'CASH' ? 'Espèces' : moyenPaiement === 'MTN' ? 'MTN MoMo' : 'Airtel Money'}</span>
                    {feeEstimate && feeOption && moyenPaiement !== 'CASH' && (
                      <span className="text-status-warning"> (frais: {formatMoney(feeEstimate.feeAmount)})</span>
                    )}
                  </p>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading || (moyenPaiement !== 'CASH' && (!phoneNumber || !!phoneError))}
                    className={`w-full py-3 text-sm font-bold tracking-wide shadow-xl transition-all ${
                      typeOperation === 'Retrait'
                        ? 'bg-status-danger hover:bg-status-danger shadow-status-danger/20'
                        : 'bg-status-success hover:bg-status-success shadow-status-success/20'
                    }`}
                  >
                    {loading ? (
                      <Loader className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        {moyenPaiement === 'CASH'
                          ? `CONFIRMER ${typeOperation?.toUpperCase()}`
                          : typeOperation === 'Dépôt' ? 'LANCER LA COLLECTE' : "CONFIRMER L'ENVOI"}
                        {montant && parseFloat(montant) > 0 && (
                          <span className="font-black">
                            ({formatMoney(
                              feeEstimate && feeOption === 'CLIENT_PAYS' ? feeEstimate.montantBrut
                              : parseFloat(montant)
                            )})
                          </span>
                        )}
                        {moyenPaiement !== 'CASH' && <ArrowUpRight size={16} />}
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <div className="h-full rounded-xl border-2 border-dashed border-edge bg-surface-base/20 flex flex-col items-center justify-center text-content-muted space-y-4 p-6">
              <div className="w-16 h-16 rounded-full bg-surface-base flex items-center justify-center ring-4 ring-edge/50">
                <Wallet size={24} className="opacity-50" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-content-muted">En attente de client</p>
                <p className="text-xs text-content-muted mt-1">Utilisez la recherche à gauche pour commencer</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Cash: Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={`Confirmer le ${typeOperation?.toLowerCase() || 'opération'}`}
        message={confirmationMessage}
        onConfirm={confirmerPreparationCash}
        onClose={() => setShowConfirmDialog(false)}
        variant={typeOperation === 'Retrait' ? 'danger' : 'success'}
        confirmText="Confirmer"
        cancelText="Annuler"
      />

      {/* Cash: Physical Confirmation */}
      {showPhysicalConfirmation && pendingOperationData && selectedClient && (
        <PhysicalConfirmationStep
          isOpen={showPhysicalConfirmation}
          onClose={() => setShowPhysicalConfirmation(false)}
          onConfirm={validerOperationAvecConfirmation}
          clientName={`${selectedClient.nom} ${selectedClient.prenom || ''}`}
          clientPhone={selectedClient.telephone}
          operationType={typeRetrait || typeDepot || typeOperation || 'Opération'}
          amount={parseFloat(montant)}
          isLoading={loading}
        />
      )}

      {/* Mobile Money: Presence Verification */}
      {showPresenceModal && selectedClient && (
        <AccountHolderPresenceModal
          isOpen={showPresenceModal}
          onClose={() => setShowPresenceModal(false)}
          onConfirm={handlePresenceConfirm}
          clientName={`${selectedClient.nom} ${selectedClient.prenom}`}
          clientPhone={selectedClient.telephone}
          operationType={typeOperation || 'Retrait'}
          amount={parseFloat(montant)}
          isLoading={loading}
        />
      )}

      {/* Mobile Money: Payment Status Polling */}
      <PaymentStatusModal
        isOpen={showPaymentStatusModal}
        onClose={() => {
          setShowPaymentStatusModal(false);
          if (paymentStatus === 'PENDING' || paymentStatus === 'CREATED') {
            toast.info('Le paiement est toujours en attente de confirmation');
          }
        }}
        status={paymentStatus}
        provider={(moyenPaiement === 'MTN' || moyenPaiement === 'AIRTEL') ? moyenPaiement : 'MTN'}
        amount={parseFloat(montant) || 0}
        phone={phoneNumber}
        reference={paymentIntent?.externalRef}
        providerTxnId={paymentIntent?.providerTxnId}
        errorMessage={paymentIntent?.errorMessage}
        timeLeft={paymentTimeLeft ?? undefined}
        onCheckStatus={handleCheckStatus}
        isCheckingStatus={isCheckingStatus}
        onRetry={() => {
          setShowPaymentStatusModal(false);
          setPaymentIntent(null);
          setPaymentStatus('CREATED');
        }}
        onViewDetails={() => setShowPaymentStatusModal(false)}
      />

      {/* Universal Success / Receipt Modal */}
      <UniversalPaymentSuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          setLastOperationData(null);
          reinitialiserFormulaire();
          onTransactionComplete?.();
        }}
        term="Terminer"
        data={receiptData}
      />
    </div>
  );
}
