import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, Search, Calendar, User, CreditCard, Check, X, Smartphone, Banknote, FileCheck, Building, ReceiptText, AlertTriangle, Loader2, Printer, WifiOff } from 'lucide-react';
import PaymentValidationModal from '../operations/PaymentValidationModal';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { usePermissions } from '../../auth/ProtectedFeature';
import { creditApi, remboursementApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { Button } from '../../ui';
import { ReceiptTemplate } from '../../ui/printable/ReceiptTemplate';
import { InvoiceTemplate } from '../../ui/printable/InvoiceTemplate';
import { usePrinter } from '../../../hooks/useReceiptPrinter';
import { StatutCredit, StatutEcheanceCredit, STATUT_ECHEANCE_CREDIT_LABELS } from '@shared/enum/status-constants';
import { useNetworkStatus } from '../../../contexts/NetworkContext';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { executeOfflineOperation } from '../../../lib/offline-treasury';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-yellow-500', prefix: '+242 05/06', logo: mtnLogo },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-red-500', prefix: '+242 04', logo: airtelLogo }
] as const;

const PAYMENT_MODES = [
  { id: 'Cash', icon: Banknote, label: 'Cash', disabled: false },
  { id: 'Mobile Money', icon: Smartphone, label: 'Mobile', disabled: false },
  { id: 'Virement', icon: Building, label: 'Virement', disabled: false },
  { id: 'Chèque', icon: FileCheck, label: 'Chèque', disabled: false },
  { id: 'Prélèvement', icon: ReceiptText, label: 'Prélèvement', disabled: false },
] as const;

interface Credit {
  id: string;
  numeroCredit: string;
  clientId: string;
  montantPrincipal: number;
  montantEcheance: number;
  soldeRestant: number;
  nombreEcheancesPayees: number;
  nombreEcheancesTotal: number;
  joursRetard: number;
  penalitesRetard: number;
  totalPaye?: number;
  totalInteretsPayes?: number;
  statut?: string;
  clients: {
    nom: string;
    prenom?: string;
    email: string;
    phone: string;
    telephone?: string;
    numeroCompte?: string;
  };
  echeances?: Echeance[];
}

interface Echeance {
  id: string;
  numeroEcheance: number;
  dateEcheance: string;
  montantTotal: number;
  montantPrincipal: number;
  montantInteret: number;
  montantPaye: number;
  statut: string;
  joursRetard: number;
  penalite: number;
}

export default function CreditRemboursement() {
  const { mobileMoneyEnabled, mobileMoneyMessage } = useFeatureFlags();
  const { componentRef, printData, print, isPrinting } = usePrinter();
  const {
    componentRef: invoiceRef,
    printData: invoicePrintData,
    print: printInvoice,
    isPrinting: isInvoicePrinting
  } = usePrinter();

  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreatePayments = hasPermission('remboursements', 'create') || hasPermission('credits', 'edit');

  // Offline support
  const networkStatus = useNetworkStatus();
  const { user } = useUserProfile();
  const isOffline = networkStatus === 'offline';

  const [credits, setCredits] = useState<Credit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [loadingEcheances, setLoadingEcheances] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmPayment, setShowConfirmPayment] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<'mobile_money' | 'especes'>('especes');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastPaymentRef, setLastPaymentRef] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastPaymentAmount, setLastPaymentAmount] = useState<number>(0);
  const [lastPenaltiesPaid, setLastPenaltiesPaid] = useState<number>(0);
  const [lastEcheanceAmount, setLastEcheanceAmount] = useState<number | null>(null);
  const [lastSoldeAvant, setLastSoldeAvant] = useState<number | null>(null);

  const [paymentData, setPaymentData] = useState({
    montant: '',
    mode_paiement: 'Cash',
    reference_paiement: '',
    notes: ''
  });

  useEffect(() => {
    loadCredits();
  }, []);

  const loadCredits = useCallback(async () => {
    setLoadingCredits(true);
    try {
      const data = await creditApi.getAll();
      // Filter active credits
      const activeCredits = data.filter((c: Credit) =>
        c.statut === StatutCredit.ACTIVE || c.statut === StatutCredit.LATE
      );
      setCredits(activeCredits);
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du chargement des crédits');
      toast.error(errorMessage);
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  const loadEcheances = useCallback(async (creditId: string) => {
    setLoadingEcheances(true);
    try {
      const credit = await creditApi.getById(creditId);
      const data = credit.echeances || [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const updatedData = data.map((ech: any) => {
        const dateEch = new Date(ech.dateEcheance);
        dateEch.setHours(0, 0, 0, 0);
        const joursRetard = ech.statut === StatutEcheanceCredit.UPCOMING && dateEch < today
          ? Math.floor((today.getTime() - dateEch.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const penalite = joursRetard > 0 ? joursRetard * 500 : 0;

        return {
          ...ech,
          montantPaye: ech.montantPaye || 0,
          joursRetard: joursRetard,
          penalite,
          statut: joursRetard > 0 ? StatutEcheanceCredit.LATE : ech.statut
        };
      });

      setEcheances(updatedData);
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors du chargement des échéances');
      toast.error(errorMessage);
      setEcheances([]);
    } finally {
      setLoadingEcheances(false);
    }
  }, []);

  const handleSelectCredit = useCallback(async (credit: Credit) => {
    setSelectedCredit(credit);
    await loadEcheances(credit.id);
    setShowPaymentForm(false);
    setPaymentData({ montant: '', mode_paiement: 'Cash', reference_paiement: '', notes: '' });
    setSelectedOperator('');
    setErrors({});
  }, [loadEcheances]);

  // Memoized payment distribution calculation (unchanged)
  const calculatePaymentDistribution = useCallback((montant: number) => {
    const unpaidEcheances = echeances
      .filter(e => e.statut !== 'Payé')
      .sort((a, b) => a.numeroEcheance - b.numeroEcheance);

    if (unpaidEcheances.length === 0) return [];

    const distribution = [];
    let remaining = montant;

    for (const echeance of unpaidEcheances) {
      if (remaining <= 0) break;

      const totalDue = echeance.montantTotal + echeance.penalite;
      const payment = Math.min(remaining, totalDue);

      const penalitePayment = Math.min(payment, echeance.penalite);
      const principalInteretPayment = payment - penalitePayment;

      const ratioInteret = echeance.montantInteret / echeance.montantTotal;
      const interetPayment = principalInteretPayment * ratioInteret;
      const principalPayment = principalInteretPayment - interetPayment;

      distribution.push({
        echeance_id: echeance.id,
        numero_echeance: echeance.numeroEcheance,
        montant_principal: principalPayment,
        montant_interet: interetPayment,
        penalites: penalitePayment,
        montant_total: payment,
        nouveau_statut: payment >= totalDue ? 'Payé' : 'Partiel'
      });

      remaining -= payment;
    }

    return distribution;
  }, [echeances]);

  // Memoized filtered credits
  const filteredCredits = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return credits.filter(c =>
      (c.numeroCredit ?? '').toLowerCase().includes(term) ||
      (c.clients?.nom ?? '').toLowerCase().includes(term)
    );
  }, [credits, searchTerm]);

  // Memoized next echeance and montant prevu
  const { nextEcheance, montantPrevu } = useMemo(() => {
    const next = echeances.find(e => e.statut !== 'Payé');
    const prevu = next
      ? next.montantTotal + next.penalite
      : selectedCredit?.montantEcheance || 0;
    return { nextEcheance: next, montantPrevu: prevu };
  }, [echeances, selectedCredit]);

  const validatePaymentForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    const montant = parseFloat(paymentData.montant);

    // Validate amount
    const amountValidation = validateAmount(montant, {
      min: 100,
      max: Math.min(selectedCredit?.soldeRestant || VALIDATION_LIMITS.MAX_CREDIT, VALIDATION_LIMITS.MAX_CREDIT),
    });

    if (!amountValidation.isValid) {
      newErrors.montant = amountValidation.error || 'Montant invalide';
    }

    // Validate operator for mobile money
    if (paymentData.mode_paiement === 'Mobile Money' && !selectedOperator) {
      newErrors.operateur = 'Veuillez sélectionner un opérateur';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [paymentData, selectedCredit, selectedOperator]);

  const handlePayment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCredit) return;

    if (!validatePaymentForm()) {
      toast.warning('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    // Show payment validation modal for cash or mobile money
    if (paymentData.mode_paiement === 'Mobile Money') {
      setPaymentModalType('mobile_money');
      setShowPaymentModal(true);
      return;
    } else if (paymentData.mode_paiement === 'Cash') {
      setPaymentModalType('especes');
      setShowPaymentModal(true);
      return;
    }

    // For other payment modes, show confirmation dialog
    setShowConfirmPayment(true);
  }, [selectedCredit, paymentData, validatePaymentForm]);

  const processPayment = useCallback(async (paymentRef?: string, operator?: string) => {
    if (!selectedCredit) return;

    const montant = parseFloat(paymentData.montant);
    setLoading(true);

    try {
      const distribution = calculatePaymentDistribution(montant);
      const penalitesPayees = distribution.reduce((sum, item) => sum + (item.penalites || 0), 0);
      const echeanceAmount = nextEcheance?.montantTotal ?? selectedCredit.montantEcheance ?? montant;

      setLastSoldeAvant(selectedCredit.soldeRestant);
      setLastPenaltiesPaid(penalitesPayees);
      setLastEcheanceAmount(echeanceAmount);

      const finalRef = sanitizeInput(paymentRef || paymentData.reference_paiement || `REF-${Date.now()}`);

      // Offline path: route through journal for Cash payments when offline
      if (isOffline && paymentData.mode_paiement === 'Cash' && user?.id) {
        const result = await executeOfflineOperation({
          type: 'LOAN_REPAYMENT',
          amount: montant,
          agentId: parseInt(user.id, 10),
          agenceId: user.agenceId || '',
          payload: {
            creditId: selectedCredit.id,
            clientId: selectedCredit.clientId,
            montant,
            distribution,
            referencePaiement: finalRef,
            notes: sanitizeInput(paymentData.notes),
          },
        });

        setLastPaymentRef(result.operationRef || finalRef);
        setLastPaymentAmount(montant);
        setPaymentData({ montant: '', mode_paiement: 'Cash', reference_paiement: '', notes: '' });
        setSelectedOperator('');
        setShowPaymentForm(false);
        setShowPaymentModal(false);
        setShowConfirmPayment(false);
        setErrors({});
        toast.success(`Remboursement de ${formatMoney(montant)} enregistré hors ligne (réf: ${result.operationRef})`);
        setShowSuccessModal(true);
        return;
      }

      const remboursementData = {
        credit_id: selectedCredit.id,
        date_remboursement: new Date().toISOString().split('T')[0],
        montant: montant,
        mode_paiement: paymentData.mode_paiement,
        reference_paiement: finalRef,
        operateur_mobile: operator || selectedOperator || null,
        notes: sanitizeInput(paymentData.notes),
        distribution: distribution
      };

      await remboursementApi.create(remboursementData);

      // Store payment info for receipt
      setLastPaymentRef(finalRef);
      setLastPaymentAmount(montant);

      // Reset form
      setPaymentData({ montant: '', mode_paiement: 'Cash', reference_paiement: '', notes: '' });
      setSelectedOperator('');
      setShowPaymentForm(false);
      setShowPaymentModal(false);
      setShowConfirmPayment(false);
      setErrors({});

      // Show Success Modal instead of just toast
      setShowSuccessModal(true);

      // Reload data
      await loadCredits();
      if (selectedCredit) {
        try {
          const updated = await creditApi.getById(selectedCredit.id);
          setSelectedCredit(updated);
          await loadEcheances(updated.id);
        } catch {
          // Credit may be fully paid, just reload list
          setSelectedCredit(null);
          setEcheances([]);
        }
      }
    } catch (error) {
      const errorMessage = handleApiError(error, "Erreur lors de l'enregistrement du remboursement");
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [
    selectedCredit,
    paymentData,
    selectedOperator,
    calculatePaymentDistribution,
    loadCredits,
    loadEcheances,
    nextEcheance,
    isOffline,
    user,
  ]);

  const handlePaymentValidation = useCallback((paymentRef: string, operator?: string) => {
    processPayment(paymentRef, operator);
  }, [processPayment]);

  const buildReceiptData = useCallback(() => {
    if (!selectedCredit) return null;

    const soldeAvant =
      lastSoldeAvant ?? (selectedCredit.soldeRestant + lastPaymentAmount);
    const nouveauSolde = Math.max(soldeAvant - lastPaymentAmount, 0);
    const echeanceAmount =
      lastEcheanceAmount ?? nextEcheance?.montantTotal ?? selectedCredit.montantEcheance ?? lastPaymentAmount;

    return {
      title: 'REÇU DE REMBOURSEMENT',
      reference: lastPaymentRef || 'N/A',
      date: new Date(),
      type: 'Remboursement Crédit',
      transaction: {
        id: lastPaymentRef || 'N/A',
        date: new Date(),
        type: 'REMBOURSEMENT',
        amount: lastPaymentAmount,
        cashierName: 'Agent Crédit'
      },
      client: {
        nom: formatClientName(selectedCredit.clients.nom, selectedCredit.clients.prenom),
        email: selectedCredit.clients.email,
        telephone: selectedCredit.clients.phone || selectedCredit.clients.telephone,
        numeroCompte: selectedCredit.clients.numeroCompte
      },
      agent: {
        nom: 'Agent',
        prenom: 'Crédit'
      },
      details: [
        { label: 'Montant Échéance', value: formatMoney(echeanceAmount) },
        { label: 'Pénalités payées', value: formatMoney(lastPenaltiesPaid) },
        { label: 'Reste à payer', value: formatMoney(nouveauSolde), isBold: true }
      ],
      items: [{
        description: `Remboursement Crédit ${selectedCredit.numeroCredit}`,
        details: `Solde avant paiement: ${formatMoney(soldeAvant)}`,
        montant: lastPaymentAmount,
        quantite: 1
      }],
      total: lastPaymentAmount,
      modePaiement: paymentData.mode_paiement || 'Espèces',
      devise: 'FCFA'
    };
  }, [
    selectedCredit,
    lastPaymentRef,
    lastPaymentAmount,
    lastSoldeAvant,
    lastEcheanceAmount,
    lastPenaltiesPaid,
    nextEcheance,
    paymentData.mode_paiement
  ]);

  const handlePrintTicket = useCallback(() => {
    const data = buildReceiptData();
    if (!data) return;
    print(data);
  }, [buildReceiptData, print]);

  const handlePrintInvoice = useCallback(() => {
    const data = buildReceiptData();
    if (!data) return;
    printInvoice(data);
  }, [buildReceiptData, printInvoice]);

  const handleModeChange = useCallback((mode: string) => {
    setPaymentData(prev => ({ ...prev, mode_paiement: mode }));
    if (mode !== 'Mobile Money') {
      setSelectedOperator('');
    }
    if (errors.operateur) {
      setErrors(prev => ({ ...prev, operateur: '' }));
    }
  }, [errors]);

  const handleInputChange = useCallback((field: string, value: string) => {
    setPaymentData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  // Safe escaped values
  const safeClientName = selectedCredit ? escapeHtml(selectedCredit.clients?.nom || '') : '';

  return (
    <div className="space-y-6 relative">

      {/* Offline Indicator */}
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
          <WifiOff size={16} />
          <span>Mode hors ligne — Seuls les paiements en espèces sont disponibles. Les données seront synchronisées au retour du réseau.</span>
        </div>
      )}

      {/* Hidden Receipt Template for Printing (offscreen, not display:none) */}
      {printData && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: '210mm',
            background: 'white',
            zIndex: -1,
          }}
        >
          <ReceiptTemplate ref={componentRef} data={printData} />
        </div>
      )}
      {invoicePrintData && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: '210mm',
            background: 'white',
            zIndex: -1,
          }}
        >
          <InvoiceTemplate ref={invoiceRef} data={invoicePrintData} />
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-green-500/10">
              <Check size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Remboursement Enregistré !</h3>
            <p className="text-slate-400 mb-6">
              Le remboursement de <strong className="text-white">{formatMoney(lastPaymentAmount)}</strong> a été validé avec succès.
            </p>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="secondary" 
                  onClick={handlePrintTicket}
                  className="flex items-center justify-center gap-2"
                  disabled={isPrinting}
                >
                  <Printer size={18} /> Reçu Ticket
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={handlePrintInvoice}
                  className="flex items-center justify-center gap-2"
                  disabled={isInvoicePrinting}
                >
                  <Printer size={18} /> Facture A4
                </Button>
              </div>
              <Button 
                variant="primary" 
                onClick={() => setShowSuccessModal(false)}
              >
                Continuer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Search Section */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">Rechercher un Crédit</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Numéro de crédit ou nom du client..."
            className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            aria-label="Rechercher un crédit"
          />
        </div>

        {searchTerm && (
          <div className="mt-4 max-h-60 overflow-y-auto space-y-2" role="listbox" aria-label="Résultats de recherche">
            {loadingCredits ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin text-cyan-400" size={24} />
                <span className="ml-2 text-slate-400">Chargement...</span>
              </div>
            ) : filteredCredits.length > 0 ? (
              filteredCredits.map(credit => (
                <button
                  key={credit.id}
                  type="button"
                  role="option"
                  aria-selected={selectedCredit?.id === credit.id}
                  onClick={() => handleSelectCredit(credit)}
                  className={`w-full p-3 rounded-lg cursor-pointer transition text-left focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                    selectedCredit?.id === credit.id
                      ? 'bg-cyan-600/20 border border-cyan-500'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-cyan-400 font-mono font-bold">{credit.numeroCredit}</div>
                      <div className="text-white text-sm">{formatClientName(credit.clients?.nom || '', credit.clients?.prenom)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold">{formatMoney(credit.soldeRestant)}</div>
                      <div className="text-xs text-slate-400">Solde restant</div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-4 text-slate-400">Aucun crédit trouvé</div>
            )}
          </div>
        )}
      </div>

      {/* Selected Credit Details */}
      {selectedCredit && (
        <>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{selectedCredit.numeroCredit}</h3>
                <p className="text-slate-400 mt-1">{formatClientName(selectedCredit.clients?.nom || '', selectedCredit.clients?.prenom)}</p>
              </div>
              {canCreatePayments && (
                <button
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  disabled={loading}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {showPaymentForm ? 'Annuler' : 'Encaisser Échéance'}
                </button>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Statistiques du crédit">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Solde Restant</div>
                <div className="text-xl md:text-2xl font-bold text-white break-words">
                  {formatMoney(selectedCredit.soldeRestant)}
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Mensualité</div>
                <div className="text-xl md:text-2xl font-bold text-green-400 break-words">
                  {formatMoney(selectedCredit.montantEcheance)}
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Échéances</div>
                <div className="text-2xl font-bold text-cyan-400">
                  {selectedCredit.nombreEcheancesPayees}/{selectedCredit.nombreEcheancesTotal}
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="text-slate-400 text-sm mb-1">Pénalités</div>
                <div className="text-xl md:text-2xl font-bold text-amber-400 break-words">
                  {formatMoney(selectedCredit.penalitesRetard || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          {showPaymentForm && (
            <form
              onSubmit={handlePayment}
              className="bg-gradient-to-br from-green-500/10 to-green-600/10 border border-green-500/50 rounded-lg p-6"
            >
              <h3 className="text-lg font-bold text-white mb-4">Nouveau Paiement</h3>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                {/* Amount */}
                <div>
                  <label htmlFor="montant" className="block text-sm font-semibold text-slate-300 mb-2">
                    Montant (FCFA) <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="montant"
                    type="number"
                    inputMode="numeric"
                    min="100"
                    max={selectedCredit.soldeRestant}
                    value={paymentData.montant}
                    onChange={(e) => handleInputChange('montant', e.target.value)}
                    className={`w-full bg-slate-700 border ${errors.montant ? 'border-red-500' : 'border-slate-600'} rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500`}
                    placeholder={`Montant prévu: ${formatMoney(montantPrevu)}`}
                    disabled={loading}
                    aria-invalid={!!errors.montant}
                    aria-describedby={errors.montant ? 'montant-error' : 'montant-help'}
                  />
                  {errors.montant ? (
                    <p id="montant-error" className="text-red-400 text-xs mt-1" role="alert">{errors.montant}</p>
                  ) : (
                    <p id="montant-help" className="text-xs text-slate-400 mt-1">
                      Maximum: {formatMoney(selectedCredit.soldeRestant)}
                    </p>
                  )}
                </div>

                {/* Payment Mode */}
                <fieldset>
                  <legend className="block text-sm font-semibold text-slate-300 mb-2">
                    Mode de Paiement <span className="text-red-400">*</span>
                  </legend>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup">
                    {PAYMENT_MODES.map(({ id, icon: Icon, label, disabled }) => {
                      const isDisabled = isOffline ? id !== 'Cash' : (id === 'Mobile Money' ? !mobileMoneyEnabled : disabled);
                      const isSelected = paymentData.mode_paiement === id;

                      return (
                        <div key={id} className="relative group">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-disabled={isDisabled}
                            onClick={() => !isDisabled && handleModeChange(id)}
                            disabled={isDisabled || loading}
                            className={`flex flex-col items-center justify-center p-2 rounded-lg border transition w-full focus:outline-none focus:ring-2 focus:ring-green-500 ${
                              isDisabled
                                ? 'opacity-50 cursor-not-allowed bg-slate-700 border-slate-600 text-slate-500'
                                : isSelected
                                ? 'bg-green-600 border-green-500 text-white'
                                : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            <Icon size={18} className="mb-1" aria-hidden="true" />
                            <span className="text-xs">{label}</span>
                            {id === 'Mobile Money' && !mobileMoneyEnabled && (
                              <span className="absolute -top-1 -right-1 px-1 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] rounded border border-amber-500/30">
                                Bientôt
                              </span>
                            )}
                          </button>
                          {id === 'Mobile Money' && !mobileMoneyEnabled && (
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-amber-400 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 border border-amber-500/30 pointer-events-none">
                              {mobileMoneyMessage}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Mobile Operator Selection */}
                {paymentData.mode_paiement === 'Mobile Money' && (
                  <fieldset className="md:col-span-2">
                    <legend className="block text-sm font-semibold text-slate-300 mb-2">
                      <Smartphone size={16} className="inline mr-2" aria-hidden="true" />
                      Opérateur <span className="text-red-400">*</span>
                    </legend>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup">
                      {MOBILE_OPERATORS.map(op => (
                        <button
                          key={op.id}
                          type="button"
                          role="radio"
                          aria-checked={selectedOperator === op.id}
                          onClick={() => {
                            setSelectedOperator(op.id);
                            if (errors.operateur) setErrors(prev => ({ ...prev, operateur: '' }));
                          }}
                          disabled={loading}
                          className={`flex items-center gap-2 p-3 rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-green-500 ${
                            selectedOperator === op.id
                              ? `${op.color} border-white text-white`
                              : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                          } disabled:opacity-50`}
                        >
                          <img src={op.logo} alt={op.name} className="w-8 h-8 rounded-full object-contain bg-white/10" />
                          <div className="text-left">
                            <p className="font-semibold text-sm">{op.name.split(' ')[0]}</p>
                            <p className="text-xs opacity-75">{op.prefix}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {errors.operateur && (
                      <p className="text-red-400 text-xs mt-1" role="alert">{errors.operateur}</p>
                    )}
                  </fieldset>
                )}

                {/* Reference */}
                <div>
                  <label htmlFor="reference" className="block text-sm font-semibold text-slate-300 mb-2">
                    Référence Paiement
                  </label>
                  <input
                    id="reference"
                    type="text"
                    value={paymentData.reference_paiement}
                    onChange={(e) => handleInputChange('reference_paiement', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="N° transaction, chèque..."
                    maxLength={100}
                    disabled={loading}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-semibold text-slate-300 mb-2">
                    Notes
                  </label>
                  <input
                    id="notes"
                    type="text"
                    value={paymentData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Informations additionnelles..."
                    maxLength={500}
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                    Enregistrement...
                  </>
                ) : (
                  'Confirmer le Paiement'
                )}
              </button>
            </form>
          )}

          {/* Echeancier */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-lg font-bold text-white">Échéancier</h3>
            </div>

            <div className="divide-y divide-slate-700" role="list" aria-label="Liste des échéances">
              {loadingEcheances ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : echeances.length > 0 ? (
                echeances.map(echeance => {
                  const resteAPayer = echeance.montantTotal - echeance.montantPaye + echeance.penalite;
                  return (
                  <div
                    key={echeance.id}
                    role="listitem"
                    className="p-4 hover:bg-slate-700/30 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            echeance.statut === StatutEcheanceCredit.PAID ? 'bg-green-500/20 text-green-400' :
                            echeance.statut === StatutEcheanceCredit.LATE ? 'bg-red-500/20 text-red-400' :
                            'bg-cyan-500/20 text-cyan-400'
                          }`}
                          aria-hidden="true"
                        >
                          {echeance.statut === StatutEcheanceCredit.PAID ? <Check size={20} /> : echeance.numeroEcheance}
                        </div>

                        <div>
                          <div className="text-white font-semibold">Échéance #{echeance.numeroEcheance}</div>
                          <div className="text-sm text-slate-400">
                            {new Date(echeance.dateEcheance).toLocaleDateString('fr-FR')}
                          </div>
                          <div className="text-xs text-cyan-400 mt-0.5">Remboursement Crédit</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 ml-14 sm:ml-0">
                        {/* Montant Payé */}
                        <div className="text-center min-w-[80px]">
                          <div className="text-xs text-slate-500 mb-0.5">Payé</div>
                          <div className={`font-semibold ${echeance.montantPaye > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                            {formatMoney(echeance.montantPaye)}
                          </div>
                        </div>

                        {/* Reste à payer */}
                        <div className="text-center min-w-[80px]">
                          <div className="text-xs text-slate-500 mb-0.5">Reste</div>
                          <div className={`font-semibold ${resteAPayer > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                            {formatMoney(Math.max(0, resteAPayer))}
                          </div>
                        </div>

                        {echeance.joursRetard > 0 && (
                          <div className="flex items-center gap-1 text-red-400 text-sm">
                            <AlertTriangle size={14} aria-hidden="true" />
                            <span>{echeance.joursRetard}j · +{formatMoney(echeance.penalite)}</span>
                          </div>
                        )}

                        <div className="text-right min-w-[100px]">
                          <div className="text-white font-bold">{formatMoney(echeance.montantTotal)}</div>
                          <div className={`text-xs ${
                            echeance.statut === StatutEcheanceCredit.PAID ? 'text-green-400' :
                            echeance.statut === StatutEcheanceCredit.LATE ? 'text-red-400' :
                            'text-slate-400'
                          }`}>
                            {STATUT_ECHEANCE_CREDIT_LABELS[echeance.statut as keyof typeof STATUT_ECHEANCE_CREDIT_LABELS] || echeance.statut}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-400">
                  Aucune échéance disponible
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Payment Validation Modal */}
      <PaymentValidationModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onValidate={handlePaymentValidation}
        montant={parseFloat(paymentData.montant) || 0}
        type={paymentModalType}
        initialOperator={selectedOperator}
        loading={loading}
      />

      {/* Confirmation Dialog for non-cash/mobile payments */}
      <ConfirmDialog
        isOpen={showConfirmPayment}
        title="Confirmer le remboursement"
        message={`Vous êtes sur le point d'enregistrer un remboursement de ${formatMoney(parseFloat(paymentData.montant) || 0)} pour le crédit ${selectedCredit?.numeroCredit}. Mode de paiement: ${paymentData.mode_paiement}.`}
        confirmText="Confirmer le paiement"
        cancelText="Annuler"
        onConfirm={() => processPayment()}
        onClose={() => setShowConfirmPayment(false)}
        variant="success"
      />
    </div>
  );
}
