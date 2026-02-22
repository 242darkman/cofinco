import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, User, FileText, Users, CreditCard, ArrowDownLeft, ArrowUpRight, Loader2, Banknote, CheckCircle, Building2, Wallet } from 'lucide-react';
import mtnMomoLogo from '../../../assets/logos/mtn-logo.png';
import airtelMoneyLogo from '../../../assets/logos/airtel-logo.png';
import SearchableSelect from '../../ui/SearchableSelect';
import { saveToLoge } from '../../../lib/loge-storage';
import { usePermissions } from '../../auth/ProtectedFeature';
import { clientApi, transactionApi, echeanceCreditApi, tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { currencySymbol } from '@shared/config/currency';
import { useBranding } from '@/contexts/BrandingContext';
import { v4 as uuidv4 } from 'uuid';
import {
  TypeOperationCaisse,
  MethodePaiement,
  MethodePaiementType,
  isOperationCaisseEntree,
  normalizeOperationType,
  isActiveStatus,
  getOperationCaisseLabel,
  METHODE_PAIEMENT_LABELS,
  FREQUENCE_TONTINE_LABELS,
} from '@shared/enum/status-constants';
import { getStatusLabel, ACCOUNT_TYPE_LABELS } from '../../../lib/status-labels';
import { useClientOperations, type ClientTontineInfo, type ClientCreditInfo } from './hooks/useClientOperations';
import { normalizePhone } from '@shared/utils/phone';

interface CaissePaiementModalProps {
  sessionId: string;
  onClose: () => void;
  onSuccess: () => void;
  initialType?: string;
  /** ID du compte pré-sélectionné (pour activation depuis PendingActivationDrawer) */
  preSelectedAccountId?: string;
  /** Montant pré-rempli (pour activation depuis PendingActivationDrawer) */
  preFilledAmount?: number;
  /** ID du client pré-sélectionné (pour activation depuis PendingActivationDrawer) */
  preSelectedClientId?: string;
}

interface FormData {
  client_id: string;
  montant: string;
  mode_paiement: MethodePaiementType;
  type_operation: string;
  numero_telephone: string;
  numero_transaction: string;
  reference: string;
  description: string;
  banque_origine: string;
  numero_compte_origine: string;
  reference_virement: string;
}

export default function CaissePaiementModal({
  sessionId,
  onClose,
  onSuccess,
  initialType,
  preSelectedAccountId,
  preFilledAmount,
  preSelectedClientId
}: CaissePaiementModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const { branding } = useBranding();
  const canCreatePayments = hasPermission('caisse', 'create') || hasPermission('paiements', 'create');

  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [selectedTontine, setSelectedTontine] = useState<ClientTontineInfo | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);
  const [factureId, setFactureId] = useState<string | undefined>(undefined);
  const [mobileProvider, setMobileProvider] = useState<'MTN' | 'AIRTEL' | null>(null);
  const [feeOption, setFeeOption] = useState<'CLIENT_PAYS' | 'FEES_DEDUCTED' | ''>('');
  const [feeEstimate, setFeeEstimate] = useState<{
    feeAmount: number;
    feeRate: number;
    montantBrut: number;
    montantNet: number;
    feeOption: string;
  } | null>(null);
  const [loadingFeeEstimate, setLoadingFeeEstimate] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  // Credit selection state
  const [selectedCredit, setSelectedCredit] = useState<ClientCreditInfo | null>(null);
  const [prochaineEcheance, setProchaineEcheance] = useState<{ montantTotal: number; dateEcheance?: string } | null>(null);
  const [loadingEcheance, setLoadingEcheance] = useState(false);

  // Tontine retirable amount
  const [retirableAmount, setRetirableAmount] = useState<number | null>(null);
  const [loadingRetirable, setLoadingRetirable] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    client_id: preSelectedClientId || '',
    montant: preFilledAmount ? preFilledAmount.toString() : '',
    mode_paiement: MethodePaiement.CASH,
    type_operation: normalizeOperationType(initialType),
    numero_telephone: '',
    numero_transaction: '',
    reference: '',
    description: '',
    // Champs pour virements
    banque_origine: '',
    numero_compte_origine: '',
    reference_virement: ''
  });

  // Pré-sélectionner le compte et définir la description si fourni (activation depuis drawer)
  useEffect(() => {
    if (preSelectedAccountId) {
      setSelectedAccountId(preSelectedAccountId);
    }
    if (preSelectedAccountId && preFilledAmount && !formData.description) {
      setFormData(prev => ({
        ...prev,
        description: `Dépôt initial - Activation de compte`
      }));
    }
  }, [preSelectedAccountId, preFilledAmount]);
  
  // Synchroniser le type d'opération si initialType change
  useEffect(() => {
    if (initialType) {
      const normalized = normalizeOperationType(initialType);
      setFormData(prev => ({
        ...prev,
        type_operation: normalized
      }));
    }
  }, [initialType]);

  // Client operations hook — provides filtered operations + client data
  const {
    clientCredits,
    clientTontines,
    clientAccounts,
    activeTontinesCount,
    loading: loadingClientData,
    hasCredits,
    hasCreditsForDisbursement,
    hasTontines,
    hasAccountType,
    availableCaisseOperations,
  } = useClientOperations(formData.client_id || null);

  const idempotencyKey = useMemo(() => uuidv4(), []);

  const isOperationEntree = useCallback((typeOp: string) => {
    return isOperationCaisseEntree(typeOp);
  }, []);

  // Debounced fee estimate when amount + feeOption change
  useEffect(() => {
    if (formData.mode_paiement !== MethodePaiement.MOBILE_MONEY || !feeOption || !formData.montant) {
      setFeeEstimate(null);
      return;
    }

    const amount = parseFloat(formData.montant);
    if (isNaN(amount) || amount <= 0) {
      setFeeEstimate(null);
      return;
    }

    const provider = mobileProvider || 'MTN';
    const direction = isOperationEntree(formData.type_operation) ? 'COLLECTION' : 'PAYOUT';

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
        // fee estimate failed silently
      } finally {
        setLoadingFeeEstimate(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.montant, formData.mode_paiement, formData.numero_telephone, formData.type_operation, feeOption, isOperationEntree, mobileProvider]);

  const isTontineOperation =
    formData.type_operation === TypeOperationCaisse.TONTINE_CONTRIBUTION ||
    formData.type_operation === TypeOperationCaisse.TONTINE_WITHDRAWAL;

  const isAccountOperation = ([
    TypeOperationCaisse.DEPOSIT_SAVINGS,
    TypeOperationCaisse.WITHDRAWAL_SAVINGS,
    TypeOperationCaisse.DEPOSIT_CURRENT,
    TypeOperationCaisse.WITHDRAWAL_CURRENT,
    TypeOperationCaisse.DEPOSIT_BLOCKED,
    TypeOperationCaisse.WITHDRAWAL_BLOCKED
  ] as readonly string[]).includes(formData.type_operation);

  const isCreditOperation =
    formData.type_operation === TypeOperationCaisse.LOAN_REPAYMENT ||
    formData.type_operation === TypeOperationCaisse.CREDIT_DISBURSEMENT;

  const loadClients = useCallback(async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data.filter((c: { statut?: string; status?: string }) => isActiveStatus(c.statut) || isActiveStatus(c.status)));
    } catch {
      setClients([]);
    }
  }, []);

  useEffect(() => {
    if (canCreatePayments) {
      loadClients();
    }
  }, [loadClients, canCreatePayments]);

  const selectTontine = useCallback(async (tontine: ClientTontineInfo) => {
    setSelectedTontine(tontine);
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.montant;
      delete newErrors.tontine;
      return newErrors;
    });

    if (formData.type_operation === TypeOperationCaisse.TONTINE_CONTRIBUTION) {
      // Pre-fill with cotisation amount
      const montantCotisation = tontine.tontine.montantCotisation;
      setFormData(prev => ({
        ...prev,
        montant: montantCotisation,
        description: sanitizeInput(`Cotisation ${tontine.tontine.nom} - ${(FREQUENCE_TONTINE_LABELS as Record<string, string>)[tontine.tontine.frequence] || tontine.tontine.frequence}`)
      }));
    } else if (formData.type_operation === TypeOperationCaisse.TONTINE_WITHDRAWAL) {
      // Fetch retirable amount for withdrawal
      setLoadingRetirable(true);
      setRetirableAmount(null);
      try {
        const result = await tontineApi.getRetirable(tontine.tontineId, tontine.id);
        const amount = typeof result === 'number' ? result : parseFloat(result?.montant || result?.amount || '0');
        setRetirableAmount(amount);
        if (amount > 0) {
          setFormData(prev => ({
            ...prev,
            montant: amount.toString(),
            description: sanitizeInput(`Retrait ${tontine.tontine.nom}`)
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            montant: '',
            description: sanitizeInput(`Retrait ${tontine.tontine.nom}`)
          }));
        }
      } catch {
        setRetirableAmount(0);
        setFormData(prev => ({
          ...prev,
          description: sanitizeInput(`Retrait ${tontine.tontine.nom}`)
        }));
      } finally {
        setLoadingRetirable(false);
      }
    }
  }, [formData.type_operation]);

  // Auto-fill phone from selected client
  useEffect(() => {
    if (formData.client_id) {
      const selectedCl = clients.find(c => c.id === formData.client_id);
      if (selectedCl?.telephone && !formData.numero_telephone) {
        setFormData(prev => ({ ...prev, numero_telephone: selectedCl.telephone }));
      }
    }
  }, [formData.client_id, clients]);

  // Reset selections when client changes
  useEffect(() => {
    setSelectedTontine(null);
    setSelectedCredit(null);
    setProchaineEcheance(null);
    setRetirableAmount(null);
    if (!formData.client_id) {
      setSelectedAccountId('');
      setSelectedAccount(null);
    }
  }, [formData.client_id]);

  // Reset operation type if it becomes unavailable for new client
  useEffect(() => {
    if (!formData.client_id || loadingClientData) return;
    const currentOp = formData.type_operation;
    const isAvailable = availableCaisseOperations.some(op => op.value === currentOp);
    if (!isAvailable && availableCaisseOperations.length > 0) {
      setFormData(prev => ({ ...prev, type_operation: availableCaisseOperations[0].value }));
    }
  }, [formData.client_id, availableCaisseOperations, loadingClientData]);

  // Auto-select account when hook data loads (for pre-selected accounts or single account)
  useEffect(() => {
    if (preSelectedAccountId && clientAccounts.length > 0) {
      const preSelected = clientAccounts.find(c => c.id === preSelectedAccountId);
      if (preSelected) {
        setSelectedAccountId(preSelectedAccountId);
        setSelectedAccount(preSelected);
      }
    }
  }, [preSelectedAccountId, clientAccounts]);

  // Auto-select single tontine when applicable
  useEffect(() => {
    if (isTontineOperation && clientTontines.length === 1 && !selectedTontine) {
      selectTontine(clientTontines[0]);
    }
  }, [isTontineOperation, clientTontines, selectedTontine, selectTontine]);

  const filteredAccounts = useMemo(() => {
     if (!clientAccounts) return [];
     const op = formData.type_operation;
     
     if (([TypeOperationCaisse.DEPOSIT_SAVINGS, TypeOperationCaisse.WITHDRAWAL_SAVINGS] as readonly string[]).includes(op)) {
         return clientAccounts.filter(a => (a.typeCompte) === 'SAVINGS');
     } else if (([TypeOperationCaisse.DEPOSIT_CURRENT, TypeOperationCaisse.WITHDRAWAL_CURRENT] as readonly string[]).includes(op)) {
         return clientAccounts.filter(a => (a.typeCompte) === 'CURRENT');
     } else if (([TypeOperationCaisse.DEPOSIT_BLOCKED, TypeOperationCaisse.WITHDRAWAL_BLOCKED] as readonly string[]).includes(op)) {
         return clientAccounts.filter(a => (a.typeCompte) === 'BLOCKED');
     }
     return [];
  }, [clientAccounts, formData.type_operation]);

  useEffect(() => {
     if (isAccountOperation && filteredAccounts.length === 1) {
         const acc = filteredAccounts[0];
         setSelectedAccountId(acc.id);
         setSelectedAccount(acc);
     } else if (isAccountOperation && selectedAccountId) {
         const isValid = filteredAccounts.find(a => a.id === selectedAccountId);
         if (!isValid) {
             setSelectedAccountId('');
             setSelectedAccount(null);
         }
     }
  }, [isAccountOperation, filteredAccounts, selectedAccountId]);

  // Credit selection: load next instalment when credit is selected
  const selectCredit = useCallback(async (credit: ClientCreditInfo) => {
    setSelectedCredit(credit);
    setErrors(prev => { const { credit: _, ...rest } = prev; return rest; });

    if (formData.type_operation === TypeOperationCaisse.LOAN_REPAYMENT) {
      setLoadingEcheance(true);
      try {
        const echeance = await echeanceCreditApi.getProchaine(credit.id);
        if (echeance) {
          setProchaineEcheance(echeance);
          setFormData(prev => ({
            ...prev,
            montant: echeance.montantTotal.toString(),
            description: sanitizeInput(`Remboursement crédit #${credit.numeroCredit}`)
          }));
        } else {
          setProchaineEcheance(null);
          setFormData(prev => ({
            ...prev,
            description: sanitizeInput(`Remboursement crédit #${credit.numeroCredit}`)
          }));
        }
      } catch {
        setProchaineEcheance(null);
      } finally {
        setLoadingEcheance(false);
      }
    } else if (formData.type_operation === TypeOperationCaisse.CREDIT_DISBURSEMENT) {
      const montant = parseFloat(String(credit.montant || '0'));
      if (montant > 0) {
        setFormData(prev => ({
          ...prev,
          montant: montant.toString(),
          description: sanitizeInput(`Décaissement crédit #${credit.numeroCredit}`)
        }));
      }
    }
  }, [formData.type_operation]);

  // Auto-select single credit when applicable
  useEffect(() => {
    if (isCreditOperation && clientCredits.length === 1 && !selectedCredit) {
      selectCredit(clientCredits[0]);
    }
  }, [isCreditOperation, clientCredits, selectedCredit, selectCredit]);

  // Reset selections + form fields when operation type changes
  useEffect(() => {
    setSelectedTontine(null);
    setSelectedCredit(null);
    setProchaineEcheance(null);
    setRetirableAmount(null);
    setSelectedAccountId('');
    setSelectedAccount(null);
    setFormData(prev => ({ ...prev, montant: '', description: '' }));
    setErrors({});
  }, [formData.type_operation]);

  const genererReference = useCallback(() => {
    const date = new Date();
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    return `PAY-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, 6).toUpperCase()}`;
  }, []);

  // Auto-generate reference when switching to Mobile Money
  useEffect(() => {
    if (formData.mode_paiement === MethodePaiement.MOBILE_MONEY && !formData.numero_transaction) {
      setFormData(prev => ({ ...prev, numero_transaction: genererReference() }));
    }
  }, [formData.mode_paiement, formData.numero_transaction, genererReference]);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) {
      newErrors.client_id = 'Client requis';
    }

    const montant = parseFloat(formData.montant);
    if (!formData.montant || isNaN(montant) || montant <= 0) {
      newErrors.montant = 'Le montant doit être supérieur à 0';
    } else if (montant > VALIDATION_LIMITS.MAX_AMOUNT) {
      newErrors.montant = `Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`;
    } else if (montant < VALIDATION_LIMITS.MIN_AMOUNT) {
      newErrors.montant = `Le montant minimum est ${formatMoney(VALIDATION_LIMITS.MIN_AMOUNT)}`;
    }

    if (formData.mode_paiement === MethodePaiement.MOBILE_MONEY) {
      if (!formData.numero_telephone) {
        newErrors.numero_telephone = 'Numéro requis';
      }
    }

    if (formData.mode_paiement === MethodePaiement.TRANSFER) {
      if (!formData.banque_origine?.trim()) {
        newErrors.banque_origine = "Banque d'origine requise";
      }
      if (!formData.reference_virement?.trim()) {
        newErrors.reference_virement = 'Référence virement requise';
      }
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description requise';
    }
    if (isTontineOperation && !selectedTontine) {
      newErrors.tontine = 'Veuillez sélectionner une tontine';
    }
    if (isCreditOperation && !selectedCredit) {
      newErrors.credit = 'Veuillez sélectionner un crédit';
    }
    if (isAccountOperation && !selectedAccountId) {
      newErrors.account = 'Veuillez sélectionner un compte';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, isTontineOperation, selectedTontine, isCreditOperation, selectedCredit, isAccountOperation, selectedAccountId]);

  const generateReceiptHTML = useCallback((data: ReceiptData) => {
    const now = new Date();
    const safeReference = escapeHtml(data.reference);
    const safeClientName = escapeHtml(`${data.client?.nom || ''} ${data.client?.prenom || ''}`.trim() || 'Client');
    const safeType = escapeHtml(data.type);
    const safeMode = escapeHtml(data.modePaiement);
    
    return `
      <html>
        <head>
          <title>Reçu de Paiement - ${safeReference}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #4f46e5; }
            .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding: 5px 0; }
            .montant { font-size: 24px; font-bold; text-align: center; margin: 20px 0; color: #059669; }
          </style>
        </head>
        <body>
          <div class="header"><h1>${branding.appName}</h1><p>Reçu de Transaction</p></div>
          <div class="row"><span>Réf:</span><strong>${safeReference}</strong></div>
          <div class="row"><span>Date:</span><strong>${now.toLocaleString()}</strong></div>
          <div class="row"><span>Client:</span><strong>${safeClientName}</strong></div>
          <div class="row"><span>Type:</span><strong>${safeType}</strong></div>
          <div class="row"><span>Mode:</span><strong>${safeMode}</strong></div>
          <div class="montant">${formatMoney(data.total)}</div>
        </body>
      </html>
    `;
  }, []);

  const saveReceiptToLoge = useCallback(async (data: ReceiptData) => {
    const html = generateReceiptHTML(data);
    try {
      const blob = new Blob([html], { type: 'text/html' });
      await saveToLoge(blob, {
        nom: `Recu_${data.reference}.html`,
        description: `Reçu transaction ${data.reference}`,
        categorie: 'general',
        referenceType: 'recu_caisse',
        referenceId: data.reference
      });
    } catch {
      // loge save is best-effort
    }
  }, [generateReceiptHTML]);

  const executeOperationDirect = useCallback(async (operationData: Record<string, unknown>) => {
    try {
      setLoading(true);
      
      // Call Unified Global Transaction Service
      const response = await transactionApi.process({
        clientId: formData.client_id,
        amount: Number(formData.montant),
        paymentMethod: formData.mode_paiement,
        natureOperation: formData.type_operation,
        targetId: selectedTontine?.tontineId || selectedCredit?.id || selectedAccountId || undefined,
        description: sanitizeInput(formData.description),

        // Specific fields
        tontineId: selectedTontine?.tontineId,
        membreId: selectedTontine?.id,
        creditId: selectedCredit?.id,
        compteId: selectedAccountId,
        
        // Metadata
        referenceExterne: formData.reference_virement,
        numeroTransaction: formData.numero_transaction,
        numeroTelephone: normalizePhone(formData.numero_telephone) || formData.numero_telephone,
        mobileProvider: mobileProvider || undefined
      });
      
      const rData: ReceiptData = {
        title: `Reçu de ${formData.type_operation}`,
        reference: operationData.reference,
        date: new Date(),
        type: getOperationCaisseLabel(formData.type_operation),
        client: {
          nom: clients.find(c => c.id === formData.client_id)?.nom || 'Client',
          prenom: clients.find(c => c.id === formData.client_id)?.prenom || '',
          telephone: formData.numero_telephone
        },
        items: [
          { description: formData.description, montant: operationData.amount, quantite: 1 },
          ...(feeEstimate && feeOption ? [{ description: `Frais Mobile Money (${feeEstimate.feeRate}%)`, montant: feeEstimate.feeAmount, quantite: 1 }] : []),
        ],
        total: Number(formData.montant),
        modePaiement: formData.mode_paiement === MethodePaiement.MOBILE_MONEY && mobileProvider
          ? (mobileProvider === 'MTN' ? 'MTN MoMo' : 'Airtel Money')
          : (METHODE_PAIEMENT_LABELS[formData.mode_paiement as MethodePaiementType] || formData.mode_paiement),
        devise: currencySymbol(),
        agent: { nom: 'Caissier', prenom: '' }
      };

      await saveReceiptToLoge(rData);
      setReceiptData(rData);
      
      // Use the transaction ID or returned object for invoice link if available
      if (response && response.result && response.result.id) {
          // If needed, we can try to fetch the invoice ID, but the new service returns the transaction/operation object
          // For now, we rely on the receipt generation above
      }
      
      setShowReceipt(true);

      // Émettre l'événement pour rafraîchir le dashboard en temps réel
      window.dispatchEvent(new CustomEvent('refresh-dashboard'));
      window.dispatchEvent(new CustomEvent('transaction-created'));

      toast.success('Transaction réussie !');
    } catch (error) {
      const msg = handleApiError(error, 'Erreur de transaction');
      toast.error(msg);
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  }, [formData, selectedTontine, selectedAccountId, clients, saveReceiptToLoge, mobileProvider, feeEstimate, feeOption]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    
    // We pass minimal data here as the real payload is constructed in executeOperationDirect
    // based on state
    await executeOperationDirect({
       reference: formData.reference || genererReference(),
       amount: Number(formData.montant) 
    });
  }, [validate, formData, genererReference, executeOperationDirect]);

  const handleCloseReceipt = useCallback(() => {
    setShowReceipt(false);
    setReceiptData(undefined);
    setFactureId(undefined);
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  const formattedMontant = useMemo(() => {
    const value = parseFloat(formData.montant);
    if (isNaN(value) || value <= 0) return null;
    return formatMoney(value);
  }, [formData.montant]);

  const selectedClient = useMemo(() => 
    clients.find(c => c.id === formData.client_id),
    [clients, formData.client_id]
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-surface-base rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-edge flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        
        {/* HEADER FIXE */}
        <header className="px-4 sm:px-6 py-3 sm:py-4 bg-surface-base/80 border-b border-edge backdrop-blur flex justify-between items-center">
           <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${isOperationEntree(formData.type_operation) ? 'bg-status-success-bg text-status-success' : 'bg-status-danger/10 text-status-danger'}`}>
                 {isOperationEntree(formData.type_operation) ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              </div>
              <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-content-primary truncate">Nouvelle Transaction</h2>
                 <p className="text-[10px] sm:text-xs text-content-muted hidden sm:block">Opération rapide et sécurisée</p>
              </div>
           </div>
           <button
             onClick={onClose}
             className="p-1.5 sm:p-2 bg-surface hover:bg-surface-elevated rounded-full text-content-muted hover:text-content-primary transition-colors shrink-0"
           >
              <X size={18} />
           </button>
        </header>
  
        {/* BODY SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-edge scrollbar-track-transparent">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 items-start">
             <div className="space-y-1.5">
                <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1 flex items-center gap-1.5">
                   <User size={11}/> Client / Membre
                </label>
                <SearchableSelect
                   label=""
                   name="client_id"
                   value={formData.client_id}
                   onChange={(value) => setFormData(prev => ({ ...prev, client_id: String(value) }))}
                   options={clients.map(c => ({
                     value: c.id,
                     label: `${c.nom || ''} ${c.prenom || ''}`.trim() || 'Sans Nom',
                     subLabel: [c.telephone, c.email].filter(Boolean).join(' • '),
                     image: c.photoProfile || c.photo_profile
                   }))}
                   placeholder="Rechercher un client..."
                   error={errors.client_id}
                   className="h-11 sm:h-12"
                   variant="dark"
                   showAvatarInTrigger
                />
             </div>

             <div className="space-y-1.5">
                <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1 flex items-center gap-1.5">
                   <FileText size={11}/> Nature Opération
                </label>
                <SearchableSelect
                   label=""
                   name="type_operation"
                   value={formData.client_id ? formData.type_operation : ''}
                   onChange={(value) => setFormData(prev => ({ ...prev, type_operation: String(value) }))}
                   options={availableCaisseOperations.map(op => ({
                     value: op.value,
                     label: op.label,
                     subLabel: op.group === 'tontines' ? 'Tontines' : op.group === 'credits' ? 'Crédits' : op.group === 'comptes' ? 'Comptes' : 'Divers',
                     hideAvatar: true,
                   }))}
                   placeholder={!formData.client_id ? "Sélectionnez d'abord un client" : 'Rechercher une opération...'}
                   disabled={!formData.client_id || loadingClientData}
                   isLoading={loadingClientData}
                   className="h-11 sm:h-12"
                   variant="dark"
                   showAvatarInTrigger={false}
                   icon={FileText}
                />
             </div>
          </div>
  
          {formData.client_id && (
             <div className="bg-surface-base/50 border border-edge rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-accent flex items-center justify-center font-bold text-white text-base sm:text-lg border-2 border-edge shrink-0">
                   {selectedClient?.nom?.charAt(0) || 'C'}
                </div>
                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-l border-edge pl-3 sm:pl-4">
                   <div className="min-w-0 flex-1">
                      <div className="text-[9px] sm:text-[10px] font-black text-content-muted uppercase tracking-widest">Client</div>
                      <div className="text-xs sm:text-sm font-bold text-content-primary">
                         {selectedClient?.nom || 'Client'} {selectedClient?.prenom || ''}
                      </div>
                   </div>
                   <div className="flex gap-4 shrink-0">
                      <div>
                        <div className="text-[9px] sm:text-[10px] font-black text-content-muted uppercase tracking-widest">Crédits</div>
                        <div className="text-xs sm:text-sm font-bold text-status-warning flex items-center gap-1"><CreditCard size={11}/> {clientCredits.length}</div>
                      </div>
                      <div>
                        <div className="text-[9px] sm:text-[10px] font-black text-content-muted uppercase tracking-widest">Tontines</div>
                        <div className="text-xs sm:text-sm font-bold text-status-success flex items-center gap-1"><Users size={11}/> {activeTontinesCount}</div>
                      </div>
                      <div>
                        <div className="text-[9px] sm:text-[10px] font-black text-content-muted uppercase tracking-widest">Comptes</div>
                        <div className="text-xs sm:text-sm font-bold text-accent flex items-center gap-1"><Wallet size={11}/> {clientAccounts.length}</div>
                      </div>
                   </div>
                </div>
             </div>
          )}
  
          {/* Tontine selection */}
          {formData.client_id && isTontineOperation && (
             <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1 mb-1.5 block">
                   Sélection Tontine
                </label>
                <div className="h-11 sm:h-12">
                  <SearchableSelect
                    label=""
                    name="tontine_id"
                    value={selectedTontine?.id || ''}
                    onChange={(val) => {
                        const t = clientTontines.find(ct => ct.id === val);
                        if (t) selectTontine(t);
                    }}
                    options={clientTontines.map(ct => ({
                        value: ct.id,
                        label: `${ct.tontine.nom} (${formatMoney(parseFloat(ct.tontine.montantCotisation))})`,
                        subLabel: (FREQUENCE_TONTINE_LABELS as Record<string, string>)[ct.tontine.frequence] || ct.tontine.frequence
                    }))}
                    placeholder="Sélectionner une tontine..."
                    error={errors.tontine}
                    className="h-full w-full bg-surface-base border-edge rounded-xl"
                  />
                </div>
                {errors.tontine && <p className="text-status-danger text-xs mt-1">{errors.tontine}</p>}
                {/* Tontine info card */}
                {selectedTontine && (
                  <div className="mt-2 p-2.5 rounded-lg border border-edge bg-surface-base/50 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-content-muted">Cotisation</span>
                      <span className="font-bold text-content-primary">{formatMoney(parseFloat(selectedTontine.tontine.montantCotisation))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Fréquence</span>
                      <span className="text-content-secondary">{(FREQUENCE_TONTINE_LABELS as Record<string, string>)[selectedTontine.tontine.frequence] || selectedTontine.tontine.frequence}</span>
                    </div>
                    {formData.type_operation === TypeOperationCaisse.TONTINE_WITHDRAWAL && (
                      <div className="flex justify-between pt-1 border-t border-edge">
                        <span className="text-content-muted">Montant retirable</span>
                        {loadingRetirable ? (
                          <Loader2 size={12} className="animate-spin text-accent" />
                        ) : (
                          <span className={`font-bold ${retirableAmount && retirableAmount > 0 ? 'text-status-success' : 'text-status-warning'}`}>
                            {retirableAmount != null ? (retirableAmount > 0 ? formatMoney(retirableAmount) : 'Aucun') : '—'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
             </div>
          )}

          {/* Credit selection */}
          {formData.client_id && isCreditOperation && clientCredits.length > 0 && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1 mb-1.5 block">
                Sélection Crédit
              </label>
              <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-thin scrollbar-thumb-edge">
                {clientCredits.map((credit) => (
                  <div
                    key={credit.id}
                    onClick={() => selectCredit(credit)}
                    className={`min-w-[160px] p-2.5 rounded-xl border cursor-pointer transition-all shrink-0 ${
                      selectedCredit?.id === credit.id
                        ? 'border-status-info/50 bg-status-info-bg shadow-lg'
                        : 'border-edge bg-surface-base/50 hover:border-edge-strong'
                    }`}
                  >
                    <div className="text-xs font-bold text-content-secondary"># {escapeHtml(credit.numeroCredit)}</div>
                    <div className="text-[10px] text-content-muted mt-0.5">
                      Reste: <span className="text-status-info font-bold">{formatMoney(parseFloat(String(credit.solde_restant || credit.soldeRestant || 0)))}</span>
                    </div>
                  </div>
                ))}
              </div>
              {errors.credit && <p className="text-status-danger text-xs mt-1">{errors.credit}</p>}
              {/* Credit info card */}
              {selectedCredit && prochaineEcheance && (
                <div className="mt-2 p-2.5 rounded-lg border border-edge bg-surface-base/50 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Prochaine échéance</span>
                    <span className="font-bold text-content-primary">{formatMoney(prochaineEcheance.montantTotal)}</span>
                  </div>
                  {prochaineEcheance.dateEcheance && (
                    <div className="flex justify-between">
                      <span className="text-content-muted">Date</span>
                      <span className="text-content-secondary">{new Date(prochaineEcheance.dateEcheance).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                </div>
              )}
              {loadingEcheance && (
                <div className="mt-2 flex items-center gap-2 text-xs text-content-muted">
                  <Loader2 size={12} className="animate-spin" /> Chargement échéance...
                </div>
              )}
            </div>
          )}

          {/* Account selection */}
          {formData.client_id && isAccountOperation && (
             <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1 mb-1.5 block">
                   Sélection Compte
                </label>
                <div className="h-11 sm:h-12">
                  <div className="relative h-full">
                    <select
                        className="w-full h-full bg-surface-base border border-edge rounded-xl px-4 text-content-primary appearance-none focus:border-accent outline-none transition-all"
                        value={selectedAccountId}
                        onChange={(e) => {
                            setSelectedAccountId(e.target.value);
                            setSelectedAccount(filteredAccounts.find(a => a.id === e.target.value));
                        }}
                    >
                        <option value="">Sélectionner un compte...</option>
                        {filteredAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                                {acc.numeroCompte} - {getStatusLabel(acc.typeCompte, ACCOUNT_TYPE_LABELS)} ({formatMoney(acc.solde || acc.soldeCourant || 0)})
                            </option>
                        ))}
                    </select>
                    <ArrowDownLeft size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none rotate-[-45deg]" />
                  </div>
                </div>
                {errors.account && <p className="text-status-danger text-xs mt-1">{errors.account}</p>}
             </div>
          )}
  
          {formData.client_id && formData.type_operation && (<>
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
             <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1">Mode de paiement</label>
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                   { id: MethodePaiement.CASH, provider: null, label: 'Espèces', icon: Banknote, selectedBorder: 'border-status-success/50', selectedBg: 'bg-status-success/10' },
                   { id: MethodePaiement.MOBILE_MONEY, provider: 'MTN' as const, label: 'MTN MoMo', img: mtnMomoLogo, selectedBorder: 'border-status-warning/50', selectedBg: 'bg-status-warning/10' },
                   { id: MethodePaiement.MOBILE_MONEY, provider: 'AIRTEL' as const, label: 'Airtel Money', img: airtelMoneyLogo, selectedBorder: 'border-status-danger/50', selectedBg: 'bg-status-danger/10' },
                   { id: MethodePaiement.TRANSFER, provider: null, label: 'Virement', icon: Building2, selectedBorder: 'border-accent/50', selectedBg: 'bg-accent/10' },
                ].map((m) => {
                   const isSelected = formData.mode_paiement === m.id && (m.provider ? mobileProvider === m.provider : true);
                   const Icon = m.icon;

                   return (
                     <button
                        key={m.provider || m.id}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({...prev, mode_paiement: m.id as MethodePaiementType}));
                          setMobileProvider(m.provider);
                        }}
                        className={`h-14 sm:h-16 rounded-xl sm:rounded-2xl border-2 flex flex-col items-center justify-center gap-1 sm:gap-1.5 transition-all relative ${
                           isSelected
                           ? `${m.selectedBorder} ${m.selectedBg} shadow-lg ring-1 ring-accent/20`
                           : 'border-edge bg-surface-base text-content-muted hover:border-edge-strong'
                        }`}
                     >
                        {m.img ? <img src={m.img} alt={m.label} className="h-5 sm:h-6 object-contain" /> : (Icon && <Icon size={20} className="sm:w-6 sm:h-6" />)}
                        <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-wider ${isSelected ? 'text-content-primary' : 'text-content-muted'}`}>{m.label}</span>
                     </button>
                   )
                })}
             </div>
          </div>

          {formData.mode_paiement === MethodePaiement.MOBILE_MONEY && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest">
                  Téléphone <span className="text-status-danger">*</span>
                </label>
                <input
                  type="text"
                  className={`w-full h-10 sm:h-11 bg-surface-base border rounded-lg sm:rounded-xl px-3 sm:px-4 text-sm text-content-primary focus:border-accent outline-none ${
                    errors.numero_telephone ? 'border-status-danger' : 'border-edge'
                  }`}
                  value={formData.numero_telephone}
                  onChange={(e) => setFormData(p => ({ ...p, numero_telephone: e.target.value }))}
                  placeholder="Ex: 050000000"
                />
                {errors.numero_telephone && <p className="text-status-danger text-xs">{errors.numero_telephone}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest">
                  Référence
                </label>
                <input
                  type="text"
                  readOnly
                  className="w-full h-10 sm:h-11 bg-surface/50 border border-edge rounded-lg sm:rounded-xl px-3 sm:px-4 text-sm text-content-muted cursor-not-allowed"
                  value={formData.numero_transaction}
                />
              </div>
            </div>
          )}

          {formData.mode_paiement === MethodePaiement.TRANSFER && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest">
                  Banque <span className="text-status-danger">*</span>
                </label>
                <input
                  type="text"
                  className={`w-full h-10 sm:h-11 bg-surface-base border rounded-lg sm:rounded-xl px-3 sm:px-4 text-sm text-content-primary focus:border-accent outline-none ${
                    errors.banque_origine ? 'border-status-danger' : 'border-edge'
                  }`}
                  value={formData.banque_origine}
                  onChange={(e) => setFormData(p => ({ ...p, banque_origine: e.target.value }))}
                />
                {errors.banque_origine && <p className="text-status-danger text-xs">{errors.banque_origine}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[10px] font-bold text-content-muted uppercase tracking-widest">
                  Référence virement <span className="text-status-danger">*</span>
                </label>
                <input
                  type="text"
                  className={`w-full h-10 sm:h-11 bg-surface-base border rounded-lg sm:rounded-xl px-3 sm:px-4 text-sm text-content-primary focus:border-accent outline-none ${
                    errors.reference_virement ? 'border-status-danger' : 'border-edge'
                  }`}
                  value={formData.reference_virement}
                  onChange={(e) => setFormData(p => ({ ...p, reference_virement: e.target.value }))}
                />
                {errors.reference_virement && <p className="text-status-danger text-xs">{errors.reference_virement}</p>}
              </div>
            </div>
          )}
  
          <div className="space-y-2">
            <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1">Montant <span className="text-status-danger">*</span></label>
            <div className="relative group">
               <span className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-content-muted group-focus-within:text-accent transition-colors">
                  <Banknote size={22} className="sm:w-7 sm:h-7" />
               </span>
               <input
                  type="text"
                  inputMode="numeric"
                  className={`w-full h-14 sm:h-16 bg-surface-base border-2 rounded-xl sm:rounded-2xl pl-12 sm:pl-14 pr-14 sm:pr-16 text-2xl sm:text-3xl font-black text-content-primary outline-none focus:border-accent transition-all font-mono ${errors.montant ? 'border-status-danger' : 'border-edge'}`}
                  placeholder="0"
                  value={formData.montant}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setFormData(prev => ({ ...prev, montant: val }));
                    if (errors.montant) setErrors(prev => { const { montant, ...rest } = prev; return rest; });
                  }}
               />
               <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-content-muted font-bold text-xs sm:text-sm">FCFA</span>
            </div>
            {errors.montant && <p className="text-status-danger text-xs mt-1">{errors.montant}</p>}
          </div>

          {/* Fee Option Selector (Mobile Money only — after montant) */}
          {formData.mode_paiement === MethodePaiement.MOBILE_MONEY && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-3">
              <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1">
                Option frais Mobile Money
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFeeOption(feeOption === 'CLIENT_PAYS' ? '' : 'CLIENT_PAYS')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    feeOption === 'CLIENT_PAYS'
                      ? 'border-accent/50 bg-accent/10'
                      : 'border-edge bg-surface-base hover:border-edge-strong'
                  }`}
                >
                  <p className={`text-xs font-bold ${feeOption === 'CLIENT_PAYS' ? 'text-accent' : 'text-content-primary'}`}>
                    Client paie en plus
                  </p>
                  <p className="text-[9px] text-content-muted mt-0.5">Frais ajoutés au montant</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFeeOption(feeOption === 'FEES_DEDUCTED' ? '' : 'FEES_DEDUCTED')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    feeOption === 'FEES_DEDUCTED'
                      ? 'border-accent/50 bg-accent/10'
                      : 'border-edge bg-surface-base hover:border-edge-strong'
                  }`}
                >
                  <p className={`text-xs font-bold ${feeOption === 'FEES_DEDUCTED' ? 'text-accent' : 'text-content-primary'}`}>
                    Frais déduits
                  </p>
                  <p className="text-[9px] text-content-muted mt-0.5">Frais déduits du montant</p>
                </button>
              </div>

              {/* Fee Preview */}
              {feeOption && feeEstimate && (
                <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Montant opération</span>
                    <span className="text-content-primary font-medium">{Number(formData.montant).toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-content-muted">Frais MM ({feeEstimate.feeRate}%)</span>
                    <span className="text-status-warning font-medium">{feeEstimate.feeAmount.toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1.5 border-t border-accent/20">
                    <span className="text-content-muted font-semibold">
                      {isOperationEntree(formData.type_operation)
                        ? (feeOption === 'CLIENT_PAYS' ? 'Total débité du téléphone' : 'Crédité au compte')
                        : (feeOption === 'CLIENT_PAYS' ? 'Débité du compte' : 'Reçu au téléphone')}
                    </span>
                    <span className="text-content-primary font-bold">
                      {(feeOption === 'CLIENT_PAYS' ? feeEstimate.montantBrut : feeEstimate.montantNet).toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              )}
              {feeOption && loadingFeeEstimate && (
                <div className="flex items-center gap-2 text-xs text-content-muted">
                  <Loader2 size={12} className="animate-spin" />
                  Calcul des frais...
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-xs font-bold text-content-muted uppercase tracking-wider ml-1">
              Note <span className="text-status-danger">*</span>
            </label>
            <textarea
              className={`w-full min-h-[60px] sm:min-h-[70px] bg-surface-base border rounded-lg sm:rounded-xl p-3 text-sm text-content-primary focus:border-accent outline-none resize-none transition-all ${errors.description ? 'border-status-danger' : 'border-edge'}`}
              placeholder="Commentaire..."
              value={formData.description}
              onChange={(e) => {
                setFormData(p => ({ ...p, description: e.target.value }));
                if (errors.description) setErrors(prev => { const { description, ...rest } = prev; return rest; });
              }}
            />
            {errors.description && <p className="text-status-danger text-xs mt-1">{errors.description}</p>}
          </div>
          </>)}
        </div>

        <div className="p-4 sm:p-5 bg-surface-base border-t border-edge flex flex-col gap-3">
           <button
             onClick={handleSubmit}
             disabled={loading}
             className="w-full h-11 sm:h-12 bg-accent hover:bg-accent-primary-hover disabled:opacity-50 text-white rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all"
           >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <CheckCircle size={18} />
                  Valider la Transaction
                  {formattedMontant && (
                    <span className="font-black">
                      ({feeEstimate && feeOption === 'CLIENT_PAYS'
                        ? formatMoney(feeEstimate.montantBrut)
                        : formattedMontant})
                    </span>
                  )}
                </>
              )}
           </button>
           <button onClick={onClose} className="text-[10px] sm:text-xs font-bold text-content-muted hover:text-content-secondary transition-colors uppercase tracking-widest">
             Annuler
           </button>
        </div>
      </div>

      <UniversalPaymentSuccessModal
        isOpen={showReceipt}
        onClose={handleCloseReceipt}
        term="Terminer"
        data={receiptData}
        factureId={factureId}
      />
    </div>
  );
}
