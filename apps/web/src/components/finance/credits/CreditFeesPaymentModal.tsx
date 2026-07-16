import React, { useState, useEffect, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { DollarSign, AlertCircle, CheckCircle, X, Wallet, Shield, CreditCard, Smartphone, ChevronRight, User, FileText, Banknote, Sparkles, ArrowLeft, Lock, CheckCircle2, KeyRound, Phone, Clock } from 'lucide-react';
import { Modal, Button, Badge } from '../../ui';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { computeSessionStatus, formatMoney, formatPhoneInput, stripPhoneFormat } from '../../../lib/format';
import { toast } from 'sonner';
import { sessionCaisseApi, authApi, caisseAccessControlApi } from '../../../lib/api-client';
import { UniversalPaymentSuccessModal } from '../caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { usePermissions } from '@/components/auth/ProtectedFeature';
import { MethodePaiement, METHODE_PAIEMENT_LABELS, type MethodePaiementType } from '@shared/enum/status-constants';
import mtnMomoLogo from '@/assets/logos/mtn-logo.png';
import airtelMoneyLogo from '@/assets/logos/airtel-logo.png';
import { currencySymbol } from '@shared/config/currency';
import { useEnabledPaymentMethods } from '../../../contexts/FeatureFlagsContext';

interface CreditFeesPaymentModalProps {
  demande: any;
  onClose: () => void;
  onSuccess: () => void;
  onNavigate?: (module: string, sub?: string, data?: any) => void;
}

type PaymentStep = 'caisse' | 'pin' | 'payment' | 'confirm' | 'waiting';

// Mobile Money providers
type MobileMoneyProvider = 'mtn' | 'airtel';

const PAYMENT_METHODS = [
  { value: MethodePaiement.CASH, label: 'Espèces', icon: Banknote, color: 'emerald' },
  { value: 'mtn' as const, label: 'MTN MoMo', img: mtnMomoLogo, color: 'yellow' },
  { value: 'airtel' as const, label: 'Airtel Money', img: airtelMoneyLogo, color: 'red' },
];

export default function CreditFeesPaymentModal({ demande, onClose, onSuccess }: CreditFeesPaymentModalProps) {
  const { payerFrais, envoyerEnCaisse } = useDemandes();
  const enabledPayments = useEnabledPaymentMethods();

  // Calculer le montant des frais
  const feeAmount = useMemo(() => {
    if (demande.montantFraisEngagement) {
      return parseFloat(demande.montantFraisEngagement);
    }
    return (demande.montantDemande || 0) * 0.10;
  }, [demande]);

  const feeSource = useMemo(() => {
    if (demande.montantFraisEngagement) return 'demande';
    return 'calculated';
  }, [demande]);

  const [method, setMethod] = useState<MethodePaiementType | MobileMoneyProvider>(MethodePaiement.CASH);

  // Helper to get actual payment method for API
  const getPaymentMethod = (): MethodePaiementType => {
    if (method === 'mtn' || method === 'airtel') {
      return MethodePaiement.MOBILE_MONEY;
    }
    return method as MethodePaiementType;
  };

  // Helper to get provider label
  const getMethodLabel = (): string => {
    if (method === 'mtn') return 'MTN MoMo';
    if (method === 'airtel') return 'Airtel Money';
    return METHODE_PAIEMENT_LABELS[method as MethodePaiementType] || method;
  };
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<PaymentStep>('caisse');

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [paidFacture, setPaidFacture] = useState<any>(null);

  // Session State
  const [checkingSession, setCheckingSession] = useState(true);
  const [userSession, setUserSession] = useState<any>(null);
  const [takenSession, setTakenSession] = useState<any>(null);
  // Caisse List State
  const [agencyCaisses, setAgencyCaisses] = useState<any[]>([]);
  const [loadingCaisses, setLoadingCaisses] = useState(false);

  // PIN Auth State (for opening closed caisse)
  const [selectedCaisse, setSelectedCaisse] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Dynamic PIN status check
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean | null>(null);
  const [checkingPinStatus, setCheckingPinStatus] = useState(false);

  // Code d'accès (requis si pas de PIN)
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeValidated, setAccessCodeValidated] = useState(false);
  const [accessCodeLoading, setAccessCodeLoading] = useState(false);
  const [accessCodeError, setAccessCodeError] = useState('');

  // Mobile Money state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [paymentIntent, setPaymentIntent] = useState<any>(null);

  // Check if mobile money is selected
  const isMobileMoney = method === 'mtn' || method === 'airtel';

  // Auto-fill phone number when selecting Mobile Money
  useEffect(() => {
    if (isMobileMoney && !phoneNumber) {
      const clientPhone = demande.clients?.telephone || '';
      if (clientPhone) {
        setPhoneNumber(clientPhone.replace(/\D/g, ''));
      }
    }
  }, [isMobileMoney, demande.clients]);

  useEffect(() => {
    // Skip caisse session check — CASH goes through queue, MoMo is async
    setCheckingSession(false);
    setStep('payment');
  }, []);

  const activeSession = takenSession || userSession;
  const { isAdmin } = usePermissions();

  const fetchAgencyCaisses = async () => {
    const agenceId = demande.clients?.agenceId;
    if (!agenceId) {
      toast.error("Agence du client introuvable");
      return;
    }

    setLoadingCaisses(true);
    try {
      const response = await fetch(`/api/caisses/status?agenceId=${agenceId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setAgencyCaisses(data);
      }
    } catch (e) {
      console.error("Error fetching caisses", e);
      toast.error("Erreur chargement caisses");
    } finally {
      setLoadingCaisses(false);
    }
  };

  // Check PIN status when entering PIN step
  useEffect(() => {
    if (step === 'pin' && hasPinConfigured === null) {
      const checkPinStatus = async () => {
        setCheckingPinStatus(true);
        try {
          const result = await authApi.checkPinStatus();
          setHasPinConfigured(result.hasPinConfigured);
        } catch (err) {
          setHasPinConfigured(false);
        } finally {
          setCheckingPinStatus(false);
        }
      };
      checkPinStatus();
    }
  }, [step, hasPinConfigured]);

  const handleSelectCaisse = (caisse: any) => {
    if (caisse.activeSession) {
      // Caisse already open - take control directly
      setTakenSession(caisse.activeSession);
      setStep('payment');
      toast.success(`Caisse "${caisse.nom}" sélectionnée`);
    } else {
      // Caisse closed - need PIN to open
      setSelectedCaisse(caisse);
      setPin('');
      setPinError('');
      setAccessCode('');
      setAccessCodeValidated(false);
      setAccessCodeError('');
      setStep('pin');
    }
  };

  // Validate access code
  const handleValidateAccessCode = async () => {
    if (accessCode.length < 6) return;

    setAccessCodeLoading(true);
    setAccessCodeError('');

    try {
      const result = await caisseAccessControlApi.validateCode(
        accessCode,
        selectedCaisse?.id,
        demande.clients?.agenceId
      );

      if (result.success) {
        setAccessCodeValidated(true);
        toast.success('Code d\'accès validé');
      } else {
        setAccessCodeError(result.error || 'Code invalide');
      }
    } catch (err: any) {
      setAccessCodeError(err.message || 'Erreur de validation');
    } finally {
      setAccessCodeLoading(false);
    }
  };

  // Open caisse with PIN or access code validation
  const handleOpenCaisseWithPin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCaisse) {
      setPinError("Aucune caisse sélectionnée");
      return;
    }

    // Validation: soit PIN valide, soit code d'accès validé
    if (!accessCodeValidated) {
      if (!hasPinConfigured) {
        setPinError("Veuillez valider un code d'accès pour continuer.");
        return;
      }
      if (!pin || pin.length < 4) {
        setPinError("Veuillez entrer votre PIN à 6 chiffres");
        return;
      }
    }

    setPinLoading(true);
    setPinError('');

    try {
      // 1. Verify PIN (sauf si code d'accès validé)
      if (!accessCodeValidated) {
        const pinRes = await fetch('/api/auth/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pin })
        });

        const pinData = await pinRes.json();
        if (!pinRes.ok) {
          if (pinData?.requirePinSetup) {
            setPinError('Aucun PIN configuré. Utilisez un code d\'accès.');
          } else {
            setPinError(pinData?.error || 'PIN incorrect');
          }
          setPinLoading(false);
          return;
        }
      }

      // 2. Open caisse directly (with existing balance if any)
      const result = await sessionCaisseApi.openDirect({
        caisseId: selectedCaisse.id,
        agenceId: demande.clients?.agenceId,
        observations: `Ouverture pour paiement frais - ${demande.numeroDemande}`,
        ...(accessCodeValidated && { supervisorOverride: true }),
      });

      // 3. Set session and proceed to payment
      const newSession = {
        ...result.session,
        caisse_nom: selectedCaisse.nom,
        caissier_nom: 'Moi'
      };

      setTakenSession(newSession);
      setStep('payment');
      toast.success(`Caisse "${selectedCaisse.nom}" ouverte`);

    } catch (err: any) {
      setPinError(err.message || "Erreur lors de l'ouverture de la caisse");
    } finally {
      setPinLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    try {
      // ══════════════════════════════════════════════════════════
      // CASH → Envoyer en Caisse (queue)
      // ══════════════════════════════════════════════════════════
      if (!isMobileMoney) {
        const result = await envoyerEnCaisse(demande.id);
        if (result.success) {
          toast.success('Demande envoyée en caisse', {
            description: `${formatMoney(feeAmount)} — le caissier traitera le paiement`,
          });
          onSuccess();
          onClose();
        } else {
          toast.error(result.message || "Erreur lors de l'envoi en caisse");
        }
        return;
      }

      // ══════════════════════════════════════════════════════════
      // MOBILE MONEY → Paiement instantané (async)
      // ══════════════════════════════════════════════════════════
      if (!phoneNumber.trim()) {
        toast.error('Veuillez entrer le numéro de téléphone Mobile Money');
        setLoading(false);
        return;
      }

      const provider = (method === 'mtn' || method === 'airtel') ? method : undefined;
      const result = await payerFrais(
        demande.id,
        feeAmount,
        getPaymentMethod(),
        undefined, // no caisse session needed for MoMo
        provider,
        phoneNumber
      );

      if (result.success) {
        if (result.paymentPending && result.paymentIntent) {
          setPaymentIntent(result.paymentIntent);
          setStep('waiting');
          toast.info(result.message || 'Veuillez confirmer le paiement sur votre téléphone');
          return;
        }

        toast.success(`Frais de ${formatMoney(feeAmount)} encaissés`);
        if (result.facture) {
          setPaidFacture(result.facture);
          setShowSuccessModal(true);
        }
        onSuccess();
        if (!result.facture) {
          onClose();
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erreur lors du paiement des frais");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    onClose();
  };

  // Client info
  const clientName = [demande.clients?.nom, demande.clients?.prenom].filter(Boolean).join(' ') || 'Client';
  const clientAgence = demande.clients?.agence || 'Siège';

  // Step count for indicators (pin step is part of caisse flow)
  const getStepIndex = () => {
    if (step === 'caisse' || step === 'pin') return 0;
    if (step === 'payment') return 1;
    return 2;
  };

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title="" size="md" className="overflow-hidden">
        <div className="relative">
          {/* Header avec montant */}
          <div className="bg-gradient-to-br from-status-success/20 via-emerald-500/10 to-transparent -mx-6 -mt-6 px-6 pt-5 pb-4 border-b border-status-success/20">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full bg-status-success-bg flex items-center justify-center">
                    <FileText size={16} className="text-status-success" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-content-primary">Frais d'Engagement</h2>
                    <p className="text-[10px] text-status-success/70">{demande.numeroDemande}</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-status-success">{formatMoney(feeAmount)}</div>
                <p className="text-[9px] text-content-muted uppercase tracking-wide">
                  {feeSource === 'demande' ? 'Montant fixe' : '10% du crédit'}
                </p>
              </div>
            </div>

            {/* Client info */}
            <div className="mt-3 flex items-center gap-2 bg-surface-base/50 rounded-lg p-2">
              <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center">
                <User size={14} className="text-content-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-content-primary truncate">{clientName}</p>
                <p className="text-[10px] text-content-muted">Crédit: {formatMoney(demande.montantDemande)}</p>
              </div>
              <Badge value={clientAgence} variant="neutral" className="text-[9px]" />
            </div>
          </div>

          {/* Content */}
          <div className="py-4 min-h-[220px]">
            {checkingSession ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Spinner size="sm" tone="accent" />
                <p className="text-sm text-content-muted">Vérification de la caisse...</p>
              </div>
            ) : step === 'caisse' ? (
              /* Étape 1: Sélection de caisse */
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-status-warning-bg border border-status-warning/20 flex items-center justify-center mx-auto mb-2">
                    <Wallet size={20} className="text-status-warning" />
                  </div>
                  <h3 className="text-sm font-bold text-content-primary">Aucune caisse active</h3>
                  <p className="text-xs text-content-muted mt-0.5">Sélectionnez une caisse pour encaisser</p>
                </div>

                {loadingCaisses ? (
                  <div className="flex items-center justify-center py-4">
                    <Spinner size="sm" tone="current" className="text-content-muted" />
                  </div>
                ) : agencyCaisses.length === 0 ? (
                  <div className="text-center py-4 text-content-muted text-sm">
                    Aucune caisse disponible
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {agencyCaisses.map(c => {
                      const lastKnownBalance = parseFloat(c.solde || '0');
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer bg-surface/50 border-edge-subtle hover:border-edge-strong"
                          onClick={() => handleSelectCaisse(c)}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              c.activeSession ? 'bg-status-success-bg' : 'bg-surface-elevated/50'
                            }`}>
                              <CreditCard size={14} className={c.activeSession ? 'text-status-success' : 'text-content-muted'} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-content-primary">{c.nom}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${c.activeSession ? 'bg-status-success' : 'bg-surface-muted0'}`} />
                                <span className={`text-[10px] ${c.activeSession ? 'text-status-success' : 'text-content-muted'}`}>
                                  {c.activeSession ? 'Ouverte' : 'Fermée'}
                                </span>
                                {c.activeSession?.caissierNom && (
                                  <span className="text-[10px] text-content-muted">• {c.activeSession.caissierNom}</span>
                                )}
                                {/* Afficher le solde reporté pour les caisses fermées */}
                                {!c.activeSession && lastKnownBalance > 0 && (
                                  <span className="text-[10px] text-accent font-medium">
                                    • Solde: {formatMoney(lastKnownBalance)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-content-muted" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : step === 'pin' ? (
              /* Étape PIN: Authentification pour ouvrir une caisse fermée */
              <form onSubmit={handleOpenCaisseWithPin} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="text-center mb-2">
                  <div className="w-12 h-12 rounded-full bg-status-success-bg border border-status-success/20 flex items-center justify-center mx-auto mb-2">
                    <Shield size={20} className="text-status-success" />
                  </div>
                  <h3 className="text-sm font-bold text-content-primary">Ouverture Sécurisée</h3>
                  <p className="text-xs text-content-muted mt-0.5">
                    Caisse: <span className="text-content-primary font-medium">{selectedCaisse?.nom}</span>
                  </p>
                </div>

                {/* Affichage du solde reporté */}
                {selectedCaisse && (
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-accent/70 uppercase tracking-wide mb-1">Solde Reporté</p>
                    <p className="text-lg font-bold text-accent">
                      {formatMoney(parseFloat(selectedCaisse.solde || '0'))}
                    </p>
                    <p className="text-[10px] text-content-muted mt-1">
                      La caisse s'ouvrira avec ce montant (fonds existant)
                    </p>
                  </div>
                )}

                {/* Authentification dynamique */}
                {checkingPinStatus ? (
                  <div className="flex items-center justify-center py-4">
                    <Spinner size="sm" tone="current" className="text-content-muted" />
                    <span className="ml-2 text-xs text-content-muted">Vérification...</span>
                  </div>
                ) : hasPinConfigured ? (
                  <>
                    {/* Utilisateur avec PIN - Afficher champ PIN */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-content-muted uppercase">Code PIN Agent</label>
                        {accessCodeValidated && (
                          <span className="text-[10px] text-status-success font-medium">Bypass activé</span>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
                        <input
                          type="password"
                          placeholder={accessCodeValidated ? "Non requis" : "••••••"}
                          maxLength={6}
                          value={pin}
                          onChange={(e) => { setPin(e.target.value); setPinError(''); }}
                          disabled={accessCodeValidated}
                          autoFocus
                          className={`w-full bg-surface-base border border-edge rounded-xl pl-12 pr-4 py-3.5 text-content-primary tracking-[0.5em] font-mono text-xl text-center focus:border-status-success outline-none transition-all placeholder-content-muted ${accessCodeValidated ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {pin.length === 6 && !accessCodeValidated && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-status-success animate-in zoom-in">
                            <CheckCircle2 size={20} />
                          </div>
                        )}
                        {accessCodeValidated && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-status-success animate-in zoom-in">
                            <Shield size={20} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Code d'accès (fallback) */}
                    <div className="border-t border-edge pt-3">
                      <p className="text-[10px] text-content-muted mb-2">
                        Pas accès à votre PIN ? Utilisez un code d'accès.
                      </p>
                      <div className="relative flex gap-2">
                        <div className="relative flex-1">
                          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                          <input
                            type="text"
                            placeholder="Code d'accès (8 car.)"
                            maxLength={8}
                            value={accessCode}
                            onChange={(e) => {
                              setAccessCode(e.target.value.toUpperCase());
                              setAccessCodeValidated(false);
                              setAccessCodeError('');
                            }}
                            disabled={accessCodeValidated}
                            className="w-full bg-surface-base border border-edge rounded-xl pl-10 pr-3 py-2.5 text-content-primary font-mono tracking-widest text-sm focus:border-status-warning outline-none transition-all placeholder-content-muted disabled:opacity-50"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleValidateAccessCode}
                          disabled={accessCodeLoading || accessCodeValidated || accessCode.length < 6}
                          className="px-4 py-2 bg-status-warning hover:bg-status-warning disabled:bg-surface disabled:text-content-muted text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                        >
                          {accessCodeLoading ? (
                            <Spinner size="xs" tone="current" />
                          ) : accessCodeValidated ? (
                            <CheckCircle size={14} />
                          ) : (
                            'Valider'
                          )}
                        </button>
                      </div>
                      {accessCodeError && (
                        <p className="text-xs text-status-danger flex items-center gap-1 mt-1">
                          <AlertCircle size={12} />
                          {accessCodeError}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Utilisateur SANS PIN - Afficher uniquement code d'accès */}
                    <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-3 mb-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-status-warning">PIN non configuré</p>
                          <p className="text-[10px] text-status-warning/70 mt-0.5">
                            Utilisez un code d'accès pour ouvrir la caisse.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-status-warning uppercase flex items-center gap-2">
                        <KeyRound size={14} />
                        Code d'accès requis
                      </label>
                      <div className="relative flex gap-2">
                        <div className="relative flex-1">
                          <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-status-warning" size={16} />
                          <input
                            type="text"
                            placeholder="XXXXXXXX"
                            maxLength={8}
                            value={accessCode}
                            onChange={(e) => {
                              setAccessCode(e.target.value.toUpperCase());
                              setAccessCodeValidated(false);
                              setAccessCodeError('');
                            }}
                            disabled={accessCodeValidated}
                            autoFocus
                            className={`w-full bg-surface-base border rounded-xl pl-10 pr-3 py-3 text-content-primary font-mono tracking-[0.3em] text-lg focus:ring-2 focus:ring-status-warning/20 outline-none transition-all placeholder-content-muted disabled:opacity-50 ${
                              accessCodeValidated ? 'border-status-success' : 'border-status-warning/50 focus:border-status-warning'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleValidateAccessCode}
                          disabled={accessCodeLoading || accessCodeValidated || accessCode.length < 6}
                          className="px-4 py-2.5 bg-status-warning hover:bg-status-warning disabled:bg-surface disabled:text-content-muted text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2"
                        >
                          {accessCodeLoading ? (
                            <Spinner size="xs" tone="current" />
                          ) : accessCodeValidated ? (
                            <>
                              <CheckCircle size={14} />
                              OK
                            </>
                          ) : (
                            'Valider'
                          )}
                        </button>
                      </div>
                      {accessCodeError && (
                        <p className="text-xs text-status-danger flex items-center gap-1">
                          <AlertCircle size={12} />
                          {accessCodeError}
                        </p>
                      )}
                      {accessCodeValidated && (
                        <p className="text-xs text-status-success flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Code validé - Vous pouvez ouvrir la caisse
                        </p>
                      )}
                    </div>
                  </>
                )}

                {pinError && (
                  <p className="text-xs text-status-danger flex items-center gap-1">
                    <AlertCircle size={12} />
                    {pinError}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setStep('caisse'); setSelectedCaisse(null); }}
                    disabled={pinLoading}
                    className="flex-1"
                  >
                    <ArrowLeft size={14} className="mr-1" />
                    Retour
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={
                      pinLoading ||
                      checkingPinStatus ||
                      (!accessCodeValidated && (hasPinConfigured ? pin.length < 4 : true))
                    }
                    isLoading={pinLoading}
                    className="flex-1 bg-status-success hover:bg-status-success"
                  >
                    <Lock size={14} className="mr-1" />
                    Ouvrir la caisse
                  </Button>
                </div>
              </form>
            ) : step === 'payment' ? (
              /* Étape: Méthode de paiement */
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                {/* Méthodes de paiement */}
                <div>
                  <label className="text-xs font-semibold text-content-muted mb-2 block">Mode de paiement</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.filter((m) => {
                      const key = m.value === 'mtn' || m.value === 'airtel' ? 'MOBILE_MONEY' : m.value;
                      return enabledPayments[key as keyof typeof enabledPayments] !== false;
                    }).map((m) => {
                      const isSelected = method === m.value;
                      const Icon = 'icon' in m ? m.icon : undefined;
                      const img = 'img' in m ? m.img : undefined;

                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setMethod(m.value as any)}
                          className={`relative p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? `border-${m.color}-500 bg-${m.color}-500/10`
                              : 'border-edge bg-surface/50 hover:border-edge-strong'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full mx-auto mb-1.5 flex items-center justify-center ${
                            isSelected ? `bg-${m.color}-500/20` : 'bg-surface-elevated/50'
                          }`}>
                            {img ? (
                              <img src={img} alt={m.label} className="h-6 w-6 object-contain" />
                            ) : Icon ? (
                              <Icon size={18} className={isSelected ? `text-${m.color}-400` : 'text-content-muted'} />
                            ) : null}
                          </div>
                          <p className={`text-[10px] font-semibold ${isSelected ? 'text-content-primary' : 'text-content-muted'}`}>
                            {m.label}
                          </p>
                          {isSelected && (
                            <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-${m.color}-400`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Phone input for Mobile Money */}
                {isMobileMoney && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="text-xs font-semibold text-content-muted mb-2 block">Numéro de téléphone {method === 'mtn' ? 'MTN' : 'Airtel'}</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                      <input
                        type="tel"
                        value={formatPhoneInput(phoneNumber)}
                        onChange={(e) => setPhoneNumber(stripPhoneFormat(e.target.value))}
                        placeholder="+242 06 XXX XX XX"
                        className="w-full bg-surface-base border border-edge rounded-lg pl-10 pr-4 py-2.5 text-content-primary text-sm placeholder-content-muted focus:border-status-warning outline-none transition-all"
                      />
                    </div>
                    <p className="text-[10px] text-content-muted mt-1">
                      Le client recevra une notification pour confirmer le paiement
                    </p>
                  </div>
                )}


                {/* Récapitulatif */}
                <div className="bg-surface/50 rounded-lg p-3 border border-edge-subtle">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-content-muted">Montant à encaisser</span>
                    <span className="text-lg font-bold text-status-success">{formatMoney(feeAmount)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={onClose} className="flex-1">
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setStep('confirm')}
                    className="flex-1 bg-status-success hover:bg-status-success"
                    disabled={isMobileMoney && !phoneNumber.trim()}
                  >
                    Continuer
                    <ChevronRight size={14} className="ml-1" />
                  </Button>
                </div>
              </div>
            ) : step === 'waiting' ? (
              /* Étape Waiting: Attente confirmation Mobile Money */
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-status-warning-bg border border-status-warning/20 flex items-center justify-center mx-auto mb-3">
                    <div className="relative">
                      <Smartphone size={28} className="text-status-warning" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-status-warning rounded-full flex items-center justify-center animate-pulse">
                        <Clock size={10} className="text-content-primary" />
                      </div>
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-content-primary">Confirmation en attente</h3>
                  <p className="text-xs text-content-muted mt-1">
                    Veuillez confirmer le paiement sur votre téléphone {method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}
                  </p>
                </div>

                <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-status-warning-bg flex items-center justify-center">
                      {method === 'mtn' ? (
                        <img src={mtnMomoLogo} alt="MTN" className="h-6 w-6 object-contain" />
                      ) : (
                        <img src={airtelMoneyLogo} alt="Airtel" className="h-6 w-6 object-contain" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-content-primary">{phoneNumber}</p>
                      <p className="text-[10px] text-status-warning">En attente de validation</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-status-warning/20">
                    <span className="text-xs text-content-muted">Montant</span>
                    <span className="text-lg font-bold text-status-warning">{formatMoney(feeAmount)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-content-muted text-xs">
                  <Spinner size="xs" tone="current" />
                  <span>Veuillez patienter...</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStep('payment'); setPaymentIntent(null); }}
                  className="w-full"
                >
                  <ArrowLeft size={14} className="mr-1" />
                  Annuler et réessayer
                </Button>
              </div>
            ) : (
              /* Étape 3: Confirmation */
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-status-success-bg border border-status-success/20 flex items-center justify-center mx-auto mb-3">
                    <Sparkles size={24} className="text-status-success" />
                  </div>
                  <h3 className="text-base font-bold text-content-primary">
                    {isMobileMoney ? 'Confirmer le paiement' : 'Envoyer en Caisse'}
                  </h3>
                  <p className="text-xs text-content-muted mt-1">
                    {isMobileMoney ? 'Vérifiez les informations avant de payer' : 'Le caissier traitera le paiement en espèces'}
                  </p>
                </div>

                <div className="bg-surface/50 rounded-lg border border-edge-subtle divide-y divide-edge/50">
                  <div className="flex justify-between items-center p-3">
                    <span className="text-xs text-content-muted">Client</span>
                    <span className="text-sm font-medium text-content-primary">{clientName}</span>
                  </div>
                  <div className="flex justify-between items-center p-3">
                    <span className="text-xs text-content-muted">Référence</span>
                    <span className="text-sm font-mono text-content-secondary">{demande.numeroDemande}</span>
                  </div>
                  <div className="flex justify-between items-center p-3">
                    <span className="text-xs text-content-muted">Mode de paiement</span>
                    <Badge value={getMethodLabel()} variant="neutral" className="text-[10px]" />
                  </div>
                  {/* Mobile Money phone */}
                  {isMobileMoney && (
                    <div className="flex justify-between items-center p-3 bg-status-warning/5">
                      <span className="text-xs text-content-muted">Téléphone</span>
                      <span className="text-sm font-mono text-status-warning">{phoneNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center p-3 bg-status-success/5">
                    <span className="text-sm font-semibold text-content-primary">
                      {isMobileMoney ? 'Total à payer' : 'Total à envoyer'}
                    </span>
                    <span className="text-xl font-black text-status-success">{formatMoney(feeAmount)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep('payment')}
                    disabled={loading}
                    className="flex-1"
                  >
                    <ArrowLeft size={14} className="mr-1" />
                    Retour
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePayment}
                    isLoading={loading}
                    className="flex-1 bg-status-success hover:bg-status-success"
                  >
                    <CheckCircle size={14} className="mr-1" />
                    {isMobileMoney ? `Payer ${formatMoney(feeAmount)}` : 'Envoyer en Caisse'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Step indicators */}
          {!checkingSession && (
            <div className="flex justify-center gap-1.5 pb-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    getStepIndex() === i ? 'w-6 bg-status-success' :
                    getStepIndex() > i ? 'w-2 bg-status-success/50' : 'w-2 bg-surface-elevated'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Success Modal */}
      {showSuccessModal && paidFacture && (
        <UniversalPaymentSuccessModal
          isOpen={showSuccessModal}
          onClose={handleSuccessClose}
          data={{
            title: 'Reçu de Paiement',
            reference: paidFacture.numero || `FRAIS-${demande.numeroDemande}`,
            date: paidFacture.dateFacture || new Date(),
            type: 'Frais d\'Engagement',
            client: demande.clients ? {
              nom: demande.clients.nom || '',
              prenom: demande.clients.prenom || '',
              telephone: demande.clients.telephone,
            } : undefined,
            items: [{
              description: `Frais d'engagement - Demande de crédit N° ${demande.numeroDemande}`,
              montant: parseFloat(paidFacture.montantTotal || feeAmount),
            }],
            total: parseFloat(paidFacture.montantTotal || feeAmount),
            modePaiement: getMethodLabel(),
            devise: currencySymbol(),
            notes: `Demande de crédit: ${formatMoney(demande.montantDemande)}`,
          } as ReceiptData}
        />
      )}
    </>
  );
}
