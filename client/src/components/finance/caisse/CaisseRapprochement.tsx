import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Lock, AlertTriangle, CheckCircle, Calculator, Banknote, Coins, ArrowRight, ArrowLeft, Loader2, Vault, PiggyBank, FileText, UserCheck, ChevronDown, ChevronUp, Scale, FileUp, Save, Sparkles, Smartphone } from 'lucide-react';
import WeightVerificationPanel from './WeightVerificationPanel';
import MobileMoneyReconciliationPanel from './MobileMoneyReconciliationPanel';
import ClosureReportButton from './ClosureReportButton';
import { usePermissions } from '../../auth/ProtectedFeature';
import { Button, Badge, FormField } from '@/components/ui';
import { sessionCaisseApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SessionCaisse } from '../../../types/finance';
import { usePendingSyncCount } from '../../../hooks/finance/usePendingSyncCount';

interface DenominationTemplate {
  id: string;
  nom: string;
  description?: string;
  billetage: Record<string, number>;
  totalCalcule: string;
  typeTemplate: string;
}


interface CaisseRapprochementProps {
  session: SessionCaisse;
  onClose: () => void;
  /** Solde théorique calculé = montantOuverture + totalEntrees - totalSorties */
  soldeTheoriqueCalcule?: number;
}

// Step type for the wizard
type ClosingStep = 'freeze' | 'count' | 'transfer';

const toNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const DENOMINATIONS = [
  { name: 'billets_10000', label: '10 000', value: 10000, type: 'billet' },
  { name: 'billets_5000', label: '5 000', value: 5000, type: 'billet' },
  { name: 'billets_1000', label: '1 000', value: 1000, type: 'billet' },
  { name: 'billets_500', label: '500', value: 500, type: 'billet' },
  { name: 'billets_200', label: '200', value: 200, type: 'piece' },
  { name: 'billets_100', label: '100', value: 100, type: 'piece' },
  { name: 'billets_50', label: '50', value: 50, type: 'piece' },
  { name: 'pieces_20', label: '20', value: 20, type: 'piece' },
  { name: 'pieces_10', label: '10', value: 10, type: 'piece' },
  { name: 'pieces_5', label: '5', value: 5, type: 'piece' },
] as const;

type DenominationName = typeof DENOMINATIONS[number]['name'];

export default function CaisseRapprochement({ session, onClose, soldeTheoriqueCalcule }: CaisseRapprochementProps) {
  const { hasPermission } = usePermissions();
  const canCloseCaisse = hasPermission('caisse', 'close') || hasPermission('caisse', 'manage');

  // Determine initial step based on session status
  const getInitialStep = (): ClosingStep => {
    const statut = session.statut;
    if (statut === 'CLOSING_COUNT') return 'count';
    if (statut === 'CLOSING_VALIDATION') return 'transfer';
    return 'freeze';
  };

  const [step, setStep] = useState<ClosingStep>(getInitialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pending sync guard — prevent closing with unsync'd operations
  const { pendingCount: pendingSyncCount } = usePendingSyncCount();
  const [showPendingSyncWarning, setShowPendingSyncWarning] = useState(false);

  // Step 1: Freeze state
  const [freezeConfirmed, setFreezeConfirmed] = useState(false);

  // Step 2: Count state
  const [billetage, setBilletage] = useState<Record<DenominationName, number>>({
    billets_10000: 0,
    billets_5000: 0,
    billets_1000: 0,
    billets_500: 0,
    billets_200: 0,
    billets_100: 0,
    billets_50: 0,
    pieces_20: 0,
    pieces_10: 0,
    pieces_5: 0,
  });
  const [ecartJustification, setEcartJustification] = useState('');
  const [countSubmitted, setCountSubmitted] = useState(false);

  // Step 3: Transfer decision state
  const [montantVersCoffre, setMontantVersCoffre] = useState<number>(0);
  const [montantReporte, setMontantReporte] = useState<number>(0);
  const [observations, setObservations] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Verification count state
  const [showVerification, setShowVerification] = useState(false);
  const [verificationBilletage, setVerificationBilletage] = useState<Record<DenominationName, number>>({
    billets_10000: 0, billets_5000: 0, billets_1000: 0, billets_500: 0,
    billets_200: 0, billets_100: 0, billets_50: 0, pieces_20: 0, pieces_10: 0, pieces_5: 0,
  });
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ verificationTotal: number; primaryTotal: number; ecartVerification: number; matched: boolean } | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(false);

  // Denomination templates state
  const [denominationTemplates, setDenominationTemplates] = useState<DenominationTemplate[]>([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Auto-suggestion state
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestionInfo, setSuggestionInfo] = useState<{
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string[];
  } | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Mobile Money reconciliation state
  const [mmReconciliation, setMmReconciliation] = useState<{
    providers: Array<{
      provider: 'MTN' | 'AIRTEL';
      expectedBalance: number;
      providerBalance: number | null;
      ecart: number;
      status: 'MATCHED' | 'DISCREPANCY' | 'API_FAILED';
    }>;
    hasDiscrepancy: boolean;
  } | null>(null);
  const [loadingMmReconciliation, setLoadingMmReconciliation] = useState(false);

  // Calculated values
  // Le solde théorique = montant d'ouverture + entrées - sorties
  // Priorité: 1) Backend (après gel), 2) Prop calculée, 3) Fallbacks
  const soldeTheorique = useMemo(() => {
    // 1. Si déjà calculé par le backend (après gel = étape 2+)
    const fromBackend = toNumber(session?.montantFermetureTheorique);
    if (fromBackend > 0) return fromBackend;

    // 2. Utiliser le solde calculé passé en prop (montantOuverture + entrées - sorties)
    // C'est la source de vérité avant le gel
    if (soldeTheoriqueCalcule !== undefined && soldeTheoriqueCalcule > 0) {
      return soldeTheoriqueCalcule;
    }

    // 3. Fallback: solde_theorique de la session
    const soldeTheoriqueField = toNumber(session?.soldeTheorique);
    if (soldeTheoriqueField > 0) return soldeTheoriqueField;

    // 4. Dernier fallback: montant d'ouverture
    return toNumber(session?.montantOuverture || session?.soldeInitial || 0);
  }, [session, soldeTheoriqueCalcule]);

  const soldeCalcule = useMemo(() => {
    return DENOMINATIONS.reduce((total, denom) => {
      return total + (billetage[denom.name] || 0) * denom.value;
    }, 0);
  }, [billetage]);

  // For step 3, use submitted physical count if available
  const montantPhysique = useMemo(() => {
    if (countSubmitted || step === 'transfer') {
      return toNumber(session?.montant_physique || session?.montantPhysique) || soldeCalcule;
    }
    return soldeCalcule;
  }, [session, soldeCalcule, countSubmitted, step]);

  const ecart = useMemo(() => montantPhysique - soldeTheorique, [montantPhysique, soldeTheorique]);

  // Auto-calculate transfer amounts when montant physique changes
  useEffect(() => {
    if (step === 'transfer' && montantPhysique > 0 && montantVersCoffre === 0 && montantReporte === 0) {
      // Default: transfer everything to coffre
      setMontantVersCoffre(montantPhysique);
      setMontantReporte(0);
    }
  }, [step, montantPhysique, montantVersCoffre, montantReporte]);

  const updateBilletage = useCallback((name: DenominationName, value: number) => {
    const sanitizedValue = Math.max(0, Math.floor(value));
    setBilletage(prev => ({ ...prev, [name]: sanitizedValue }));
  }, []);

  // ========== STEP 1: INITIATE CLOSE (Freeze) ==========
  const handleInitiateClose = async () => {
    // Guard: check for pending offline operations before freezing
    if (pendingSyncCount > 0) {
      setShowPendingSyncWarning(true);
      return;
    }
    await executeInitiateClose();
  };

  const executeInitiateClose = async () => {
    setShowPendingSyncWarning(false);
    setLoading(true);
    setError(null);

    try {
      await sessionCaisseApi.initiateClose(session.id);
      toast.success('Session gelée - Procédez au comptage');
      setStep('count');
    } catch (err: unknown) {
      const errorMessage = handleApiError(err, 'Erreur lors du gel de la session');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 2: SUBMIT COUNT ==========
  const handleSubmitCount = async () => {
    // Validate: bloquer seulement si le comptage est à 0 alors que le théorique ne l'est pas
    // (cas légitime: session ouverte à 0 FCFA sans opérations → comptage physique = 0)
    if (soldeCalcule <= 0 && soldeTheorique > 0) {
      toast.warning('Veuillez effectuer le billetage avant de continuer');
      return;
    }

    // If ecart, require justification
    if (Math.abs(soldeCalcule - soldeTheorique) > 0 && !ecartJustification.trim()) {
      setError('Un écart a été détecté. Veuillez fournir une justification.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await sessionCaisseApi.submitCount(session.id, {
        billetage,
        ecartJustification: ecartJustification.trim() || undefined,
      });

      const responseEcart = result.ecart || (soldeCalcule - soldeTheorique);

      if (Math.abs(responseEcart) > 100) {
        toast.warning(`Comptage enregistré avec un écart de ${formatMoney(Math.abs(responseEcart))} - sera audité`);
      } else {
        toast.success('Comptage validé');
      }

      setCountSubmitted(true);
      setStep('transfer');
    } catch (err: unknown) {
      const errorMessage = handleApiError(err, 'Erreur lors de la soumission du comptage');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 3: FINALIZE CLOSE ==========
  const handleFinalizeClose = async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    setError(null);

    try {
      // Validate: sum must equal physical count
      const totalDecision = montantVersCoffre + montantReporte;
      if (Math.abs(totalDecision - montantPhysique) > 1) {
        setError(`La somme (${formatMoney(totalDecision)}) doit être égale au montant physique (${formatMoney(montantPhysique)})`);
        setLoading(false);
        return;
      }

      await sessionCaisseApi.finalizeClose(session.id, {
        montantVersCoffre,
        montantReporte,
        observations: sanitizeInput(observations) || undefined,
      });

      if (montantVersCoffre > 0) {
        toast.success(`Caisse fermée - Transfert de ${formatMoney(montantVersCoffre)} vers le coffre créé`);
      } else {
        toast.success(
          montantReporte > 0
            ? `Caisse fermée - ${formatMoney(montantReporte)} conservé pour demain`
            : 'Caisse fermée'
        );
      }

      onClose();
    } catch (err: unknown) {
      const errorMessage = handleApiError(err, 'Erreur lors de la finalisation');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ========== CANCEL CLOSE (go back to OPEN) ==========
  const handleCancelClose = async () => {
    if (step !== 'count') {
      toast.error('Impossible d\'annuler à ce stade');
      return;
    }

    setLoading(true);
    try {
      await sessionCaisseApi.cancelClose(session.id);
      toast.info('Processus de fermeture annulé');
      onClose();
    } catch (err: unknown) {
      const errorMessage = handleApiError(err, 'Erreur lors de l\'annulation');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Quick actions for transfer amounts
  const handleTransferAll = () => {
    setMontantVersCoffre(montantPhysique);
    setMontantReporte(0);
  };

  const handleKeepAll = () => {
    setMontantVersCoffre(0);
    setMontantReporte(montantPhysique);
  };

  const handleSplitAmount = (keepAmount: number) => {
    const keep = Math.min(keepAmount, montantPhysique);
    setMontantReporte(keep);
    setMontantVersCoffre(montantPhysique - keep);
  };

  // Validation helper
  const isTransferValid = Math.abs((montantVersCoffre + montantReporte) - montantPhysique) <= 1;

  // Verification count helpers
  const verificationTotal = useMemo(() => {
    return DENOMINATIONS.reduce((total, denom) => total + (verificationBilletage[denom.name] || 0) * denom.value, 0);
  }, [verificationBilletage]);

  const updateVerificationBilletage = useCallback((name: DenominationName, value: number) => {
    setVerificationBilletage(prev => ({ ...prev, [name]: Math.max(0, Math.floor(value)) }));
  }, []);

  const handleSubmitVerification = async () => {
    if (verificationTotal <= 0) {
      toast.warning('Veuillez effectuer le billetage de vérification');
      return;
    }
    setLoadingVerification(true);
    try {
      const result = await sessionCaisseApi.submitVerification(session.id, {
        billetage: verificationBilletage,
        observations: 'Comptage de vérification superviseur',
      });
      setVerificationResult(result);
      setVerificationSubmitted(true);
      if (result.matched) {
        toast.success('Les deux comptages concordent');
      } else {
        toast.warning(`Écart de vérification: ${formatMoney(Math.abs(result.ecartVerification))}`);
      }
    } catch (err: unknown) {
      const errorMessage = handleApiError(err, 'Erreur lors du comptage de vérification');
      toast.error(errorMessage);
    } finally {
      setLoadingVerification(false);
    }
  };

  // Fetch existing verification counts on mount in transfer step
  useEffect(() => {
    if (step === 'transfer') {
      sessionCaisseApi.getCounts(session.id).then((counts: Record<string, unknown>) => {
        if (counts.verification) {
          setVerificationResult({
            verificationTotal: counts.verification.total,
            primaryTotal: counts.primary?.total || 0,
            ecartVerification: counts.ecartVerification || 0,
            matched: counts.matched || false,
          });
          setVerificationSubmitted(true);
        }
      }).catch(() => { /* ignore - verification is optional */ });
    }
  }, [step, session.id]);

  // Fetch Mobile Money reconciliation data
  const fetchMmReconciliation = useCallback(async () => {
    if (!session.agenceId) return;

    setLoadingMmReconciliation(true);
    try {
      const res = await fetch(`/api/caisses/sessions/${session.id}/mm-reconciliation`);
      if (res.ok) {
        const data = await res.json();
        setMmReconciliation(data);
      }
    } catch {
      // MM reconciliation is optional, don't block
    } finally {
      setLoadingMmReconciliation(false);
    }
  }, [session.id, session.agenceId]);

  useEffect(() => {
    if (step === 'transfer') {
      fetchMmReconciliation();
    }
  }, [step, fetchMmReconciliation]);

  // Handler for MM override
  const handleMmOverride = async (provider: string, reason: string) => {
    try {
      await fetch(`/api/caisses/sessions/${session.id}/mm-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, reason }),
      });
      toast.success(`Écart ${provider} accepté avec justification`);
      fetchMmReconciliation();
    } catch (err) {
      toast.error(handleApiError(err, 'Erreur lors de la validation'));
    }
  };

  // Fetch denomination templates on count step
  useEffect(() => {
    if (step === 'count') {
      setLoadingTemplates(true);
      sessionCaisseApi.getDenominationTemplates(session.caisseId)
        .then((templates: DenominationTemplate[]) => {
          setDenominationTemplates(templates || []);
        })
        .catch(() => {
          // Templates are optional, ignore errors
        })
        .finally(() => setLoadingTemplates(false));
    }
  }, [step, session.caisseId]);

  // Apply a denomination template
  const handleApplyTemplate = useCallback((template: DenominationTemplate) => {
    const newBilletage = { ...billetage };
    // Reset all values first
    Object.keys(newBilletage).forEach(key => {
      newBilletage[key as DenominationName] = 0;
    });
    // Apply template values
    Object.entries(template.billetage).forEach(([denom, count]) => {
      // Convert template keys (10000, 5000, etc.) to our format (billets_10000, billets_5000, etc.)
      const denomValue = parseInt(denom);
      const matchingDenom = DENOMINATIONS.find(d => d.value === denomValue);
      if (matchingDenom) {
        newBilletage[matchingDenom.name] = count as number;
      }
    });
    setBilletage(newBilletage);
    toast.success(`Modèle "${template.nom}" appliqué`);
  }, [billetage]);

  // Auto-suggest count based on day's operations
  const handleAutoSuggest = useCallback(async () => {
    setLoadingSuggestion(true);
    setSuggestionInfo(null);
    try {
      const result = await sessionCaisseApi.suggestCount(session.id);
      if (result.billetage) {
        const newBilletage = { ...billetage };
        // Reset all values first
        Object.keys(newBilletage).forEach(key => {
          newBilletage[key as DenominationName] = 0;
        });
        // Apply suggested values
        Object.entries(result.billetage).forEach(([key, count]) => {
          // Handle both formats: billets_10000 and 10000
          if (key in newBilletage) {
            newBilletage[key as DenominationName] = count as number;
          } else {
            const denomValue = parseInt(key);
            const matchingDenom = DENOMINATIONS.find(d => d.value === denomValue);
            if (matchingDenom) {
              newBilletage[matchingDenom.name] = count as number;
            }
          }
        });
        setBilletage(newBilletage);
        setSuggestionInfo({
          confidence: result.confidence,
          reasoning: result.reasoning,
        });
        toast.success(`Suggestion appliquée (confiance: ${result.confidence})`);
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la suggestion'));
    } finally {
      setLoadingSuggestion(false);
    }
  }, [session.id, billetage]);

  // Save current count as template
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.warning('Veuillez saisir un nom pour le modèle');
      return;
    }
    if (soldeCalcule <= 0) {
      toast.warning('Veuillez effectuer un billetage avant de sauvegarder');
      return;
    }

    setLoadingTemplates(true);
    try {
      // Convert billetage to template format {10000: count, 5000: count, ...}
      const templateBilletage: Record<string, number> = {};
      DENOMINATIONS.forEach(denom => {
        const count = billetage[denom.name];
        if (count > 0) {
          templateBilletage[String(denom.value)] = count;
        }
      });

      await sessionCaisseApi.createDenominationTemplate({
        nom: templateName.trim(),
        description: templateDescription.trim() || undefined,
        caisseId: session.caisseId,
        billetage: templateBilletage,
        totalCalcule: String(soldeCalcule),
        typeTemplate: 'GENERAL',
      });

      toast.success('Modèle sauvegardé');
      setShowSaveTemplateModal(false);
      setTemplateName('');
      setTemplateDescription('');

      // Refresh templates
      const templates = await sessionCaisseApi.getDenominationTemplates(session.caisseId);
      setDenominationTemplates(templates || []);
    } catch (err: unknown) {
      const errorMessage = handleApiError(err, 'Erreur lors de la sauvegarde du modèle');
      toast.error(errorMessage);
    } finally {
      setLoadingTemplates(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 font-sans animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-base border border-edge-subtle w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/50 flex flex-col">
        {/* Header with Stepper */}
        <header className="shrink-0 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-edge bg-gradient-to-r from-accent/30 to-accent-secondary/30">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-accent/20 rounded-xl border border-accent/30">
                <Lock size={18} className="text-accent" />
              </div>
              <div>
                <h3 className="text-base font-bold text-content-primary leading-tight">Fermeture Sécurisée</h3>
                <p className="text-xs text-content-muted">
                  {step === 'freeze' && 'Étape 1: Gel de la session'}
                  {step === 'count' && 'Étape 2: Comptage physique'}
                  {step === 'transfer' && 'Étape 3: Décision de trésorerie'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface rounded-lg text-content-muted hover:text-content-primary transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-2">
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${step === 'freeze' ? 'bg-white text-accent' : 'bg-accent/50 text-content-primary'}`}>
              <span>1</span>
              <span className="hidden sm:inline">Gel</span>
            </div>
            <ArrowRight className="h-4 w-4 text-accent/80" />
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${step === 'count' ? 'bg-white text-accent' : step === 'transfer' ? 'bg-accent/50 text-content-primary' : 'bg-accent/20 text-accent/80'}`}>
              <span>2</span>
              <span className="hidden sm:inline">Comptage</span>
            </div>
            <ArrowRight className="h-4 w-4 text-accent/80" />
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium ${step === 'transfer' ? 'bg-white text-accent' : 'bg-accent/20 text-accent/80'}`}>
              <span>3</span>
              <span className="hidden sm:inline">Remise</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Error Display */}
          {error && (
            <div className="bg-status-danger-bg border border-status-danger/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="text-status-danger shrink-0" size={20} />
              <div>
                <p className="text-sm font-medium text-status-danger">{error}</p>
              </div>
            </div>
          )}

          {/* ========== STEP 1: FREEZE ========== */}
          {step === 'freeze' && (
            <div className="space-y-4">
              <div className="text-center py-5">
                <div className="mx-auto w-16 h-16 bg-status-warning-bg rounded-full flex items-center justify-center mb-3 ring-2 ring-status-warning/30">
                  <Lock className="w-8 h-8 text-status-warning" />
                </div>
                <h4 className="text-lg font-bold text-content-primary mb-1.5">Prêt à fermer la session ?</h4>
                <p className="text-sm text-content-muted max-w-md mx-auto">
                  Une fois la fermeture initiée, <strong className="text-status-warning">aucune nouvelle transaction</strong> ne sera autorisée.
                  Assurez-vous d'avoir terminé toutes les opérations en cours.
                </p>
              </div>

              <div className="bg-surface/50 rounded-xl p-3 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Solde théorique actuel</span>
                  <span className="font-bold text-content-primary">{formatMoney(soldeTheorique)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-muted">Session ouverte depuis</span>
                  <span className="text-content-secondary">
                    {session.openedAt
                      ? new Date(session.openedAt).toLocaleString('fr-FR')
                      : '-'}
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 bg-surface/30 rounded-xl cursor-pointer hover:bg-surface/50 transition-colors">
                <input
                  type="checkbox"
                  checked={freezeConfirmed}
                  onChange={(e) => setFreezeConfirmed(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-edge-strong bg-surface text-accent focus:ring-accent/50"
                />
                <span className="text-sm text-content-secondary">
                  Je confirme avoir vérifié qu'aucune transaction n'est en attente et souhaite procéder à la fermeture de la caisse.
                </span>
              </label>
            </div>
          )}

          {/* ========== STEP 2: COUNT ========== */}
          {step === 'count' && (
            <div className="space-y-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div className="bg-surface/50 border border-edge-subtle rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wider mb-0.5">Théorique</p>
                  <p className="text-base font-bold text-content-secondary">{formatMoney(soldeTheorique)}</p>
                </div>

                <div className="bg-accent/10 border border-accent/20 rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-accent/80 uppercase tracking-wider mb-0.5">Compté</p>
                  <p className="text-base font-bold text-accent">{formatMoney(soldeCalcule)}</p>
                </div>

                <div className={`col-span-2 md:col-span-1 border rounded-lg p-2.5 ${
                  soldeCalcule === 0 ? 'bg-surface/30 border-edge-subtle' :
                  soldeCalcule - soldeTheorique === 0 ? 'bg-status-success-bg border-status-success/20' :
                  Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'bg-accent/10 border-accent/20' :
                  'bg-status-danger/10 border-status-danger/20'
                }`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
                    soldeCalcule === 0 ? 'text-content-muted' :
                    soldeCalcule - soldeTheorique === 0 ? 'text-status-success' :
                    Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'text-accent' : 'text-status-danger'
                  }`}>Écart</p>
                  <p className={`text-base font-bold ${
                    soldeCalcule === 0 ? 'text-content-muted' :
                    soldeCalcule - soldeTheorique === 0 ? 'text-status-success' :
                    Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'text-accent' : 'text-status-danger'
                  }`}>
                    {soldeCalcule > 0 ? (soldeCalcule - soldeTheorique > 0 ? '+' : '') : ''}{formatMoney(soldeCalcule - soldeTheorique)}
                  </p>
                </div>
              </div>

              {/* Ecart Warning */}
              {soldeCalcule > 0 && Math.abs(soldeCalcule - soldeTheorique) > 0 && (
                <div className={`rounded-xl p-3 flex items-start gap-2.5 border ${
                  Math.abs(soldeCalcule - soldeTheorique) <= 100
                    ? 'bg-status-info-bg border-accent/30 text-status-info'
                    : 'bg-status-danger-bg border-status-danger/30 text-status-danger'
                }`}>
                  <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold mb-2">
                      {Math.abs(soldeCalcule - soldeTheorique) <= 100 ? 'Petit écart détecté' : 'Écart IMPORTANT détecté !'}
                    </p>
                    <p className="text-xs opacity-80 mb-3">
                      {soldeCalcule - soldeTheorique > 0
                        ? `Il y a ${formatMoney(soldeCalcule - soldeTheorique)} de TROP dans le tiroir-caisse.`
                        : `Il MANQUE ${formatMoney(Math.abs(soldeCalcule - soldeTheorique))} dans le tiroir-caisse.`}
                    </p>
                    <textarea
                      value={ecartJustification}
                      onChange={(e) => setEcartJustification(e.target.value)}
                      placeholder="Justification obligatoire de l'écart..."
                      className="w-full px-3 py-2 bg-surface-base/50 border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent/50 focus:ring-1 focus:ring-accent/50 outline-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Billetage */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Calculator size={16} className="text-content-muted" />
                    <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider">Billetage</h4>
                  </div>

                  {/* Template actions */}
                  <div className="flex items-center gap-2">
                    {/* Template selector dropdown */}
                    {denominationTemplates.length > 0 && (
                      <div className="relative">
                        <select
                          className="appearance-none pl-3 pr-8 py-1.5 bg-surface border border-edge rounded-lg text-xs text-content-secondary focus:border-accent/50 focus:outline-none cursor-pointer"
                          onChange={(e) => {
                            const template = denominationTemplates.find(t => t.id === e.target.value);
                            if (template) handleApplyTemplate(template);
                            e.target.value = '';
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>
                            {loadingTemplates ? 'Chargement...' : `📋 Modèles (${denominationTemplates.length})`}
                          </option>
                          {denominationTemplates.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.nom} ({formatMoney(Number(t.totalCalcule))})
                            </option>
                          ))}
                        </select>
                        <FileUp size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
                      </div>
                    )}

                    {/* Auto-suggest button */}
                    <button
                      onClick={handleAutoSuggest}
                      disabled={loadingSuggestion}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-status-warning-bg border border-status-warning/30 rounded-lg text-xs text-status-warning hover:bg-status-warning-bg transition-colors disabled:opacity-50"
                      title="Suggestion automatique basée sur les opérations"
                    >
                      {loadingSuggestion ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      <span className="hidden sm:inline">Suggestion</span>
                    </button>

                    {/* Save as template button */}
                    {soldeCalcule > 0 && (
                      <button
                        onClick={() => setShowSaveTemplateModal(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 border border-accent/30 rounded-lg text-xs text-accent hover:bg-accent/20 transition-colors"
                        title="Sauvegarder comme modèle"
                      >
                        <Save size={12} />
                        <span className="hidden sm:inline">Sauvegarder</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Suggestion info banner */}
                {suggestionInfo && (
                  <div className={`mb-4 p-3 rounded-lg border ${
                    suggestionInfo.confidence === 'HIGH'
                      ? 'bg-status-success-bg border-status-success/30'
                      : suggestionInfo.confidence === 'MEDIUM'
                        ? 'bg-status-warning-bg border-status-warning/30'
                        : 'bg-surface/50 border-edge'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className={
                        suggestionInfo.confidence === 'HIGH' ? 'text-status-success' :
                        suggestionInfo.confidence === 'MEDIUM' ? 'text-status-warning' : 'text-content-muted'
                      } />
                      <span className="text-xs font-medium text-content-primary">
                        Suggestion appliquée (confiance: {suggestionInfo.confidence})
                      </span>
                      <button
                        onClick={() => setSuggestionInfo(null)}
                        className="ml-auto text-content-muted hover:text-content-primary"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <ul className="text-[10px] text-content-muted space-y-0.5 pl-5">
                      {suggestionInfo.reasoning.slice(0, 3).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {DENOMINATIONS.map((denom) => {
                    const count = billetage[denom.name];
                    const total = count * denom.value;
                    return (
                      <div key={denom.name} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            denom.type === 'billet' ? 'bg-surface text-content-secondary' : 'bg-surface/50 text-content-muted'
                          }`}>
                            {denom.type === 'billet' ? <Banknote size={14} /> : <Coins size={14} />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-content-secondary">{denom.label}</p>
                            {count > 0 && <p className="text-[10px] text-accent font-bold">{formatMoney(total)}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-surface-base/50 rounded-lg p-1 border border-edge focus-within:border-accent/50 transition-colors">
                          <button
                            onClick={() => updateBilletage(denom.name, count - 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
                          >-</button>
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={count || ''}
                            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateBilletage(denom.name, v ? parseInt(v) : 0); }}
                            className="w-12 bg-transparent text-center text-sm font-bold text-content-primary focus:outline-none"
                            placeholder="0"
                          />
                          <button
                            onClick={() => updateBilletage(denom.name, count + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Weight Verification */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Scale size={16} className="text-content-muted" />
                  <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider">Vérification par poids</h4>
                  <span className="text-[10px] text-content-muted">(optionnel)</span>
                  <div className="h-px bg-surface flex-1 ml-2" />
                </div>
                <WeightVerificationPanel initialBilletage={billetage} compact />
              </div>
            </div>
          )}

          {/* ========== STEP 3: TRANSFER ========== */}
          {step === 'transfer' && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="bg-gradient-to-br from-status-success/10 to-accent/10 border border-status-success/30 rounded-xl p-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle className="text-status-success" size={20} />
                  <div>
                    <h4 className="text-content-primary font-bold text-sm">Comptage validé</h4>
                    <p className="text-xs text-content-muted">Montant physique total: <strong className="text-status-success">{formatMoney(montantPhysique)}</strong></p>
                  </div>
                </div>
                {Math.abs(ecart) > 0 && (
                  <div className="text-xs text-status-warning flex items-center gap-2 mt-2">
                    <AlertTriangle size={14} />
                    Écart de {formatMoney(ecart)} enregistré
                  </div>
                )}
              </div>

              {/* Mobile Money Reconciliation */}
              {(mmReconciliation || loadingMmReconciliation) && (
                <div className="animate-in fade-in duration-300">
                  {loadingMmReconciliation ? (
                    <div className="bg-surface/40 border border-edge-subtle rounded-xl p-3">
                      <div className="flex items-center gap-2 text-content-muted">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">Vérification des soldes Mobile Money...</span>
                      </div>
                    </div>
                  ) : mmReconciliation && (
                    <MobileMoneyReconciliationPanel
                      providers={mmReconciliation.providers}
                      hasDiscrepancy={mmReconciliation.hasDiscrepancy}
                      onRefresh={fetchMmReconciliation}
                      onOverride={handleMmOverride}
                      isRefreshing={loadingMmReconciliation}
                      showActions={true}
                    />
                  )}
                </div>
              )}

              {/* Verification Count Section */}
              <div className="bg-surface/40 border border-edge-subtle rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowVerification(!showVerification)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-surface/60 transition"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck size={16} className="text-status-info" />
                    <span className="text-sm font-semibold text-content-primary">Comptage de vérification (superviseur)</span>
                    {verificationSubmitted && verificationResult && (
                      <Badge
                        variant={verificationResult.matched ? 'success' : 'danger'}
                        value={verificationResult.matched ? 'Concordant' : `Écart ${formatMoney(Math.abs(verificationResult.ecartVerification))}`}
                        size="sm"
                      />
                    )}
                  </div>
                  {showVerification ? <ChevronUp size={16} className="text-content-muted" /> : <ChevronDown size={16} className="text-content-muted" />}
                </button>

                {showVerification && (
                  <div className="px-3 pb-3 space-y-2 border-t border-edge-subtle">
                    {verificationSubmitted && verificationResult ? (
                      <div className={`mt-3 rounded-lg p-3 ${verificationResult.matched ? 'bg-status-success-bg border border-status-success/30' : 'bg-status-danger-bg border border-status-danger/30'}`}>
                        <p className="text-sm text-content-primary font-medium mb-1">
                          {verificationResult.matched ? 'Les deux comptages concordent' : 'Écart détecté entre les deux comptages'}
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-content-muted">Caissier</span>
                            <p className="text-content-primary font-bold">{formatMoney(verificationResult.primaryTotal)}</p>
                          </div>
                          <div>
                            <span className="text-content-muted">Vérificateur</span>
                            <p className="text-content-primary font-bold">{formatMoney(verificationResult.verificationTotal)}</p>
                          </div>
                          <div>
                            <span className="text-content-muted">Écart</span>
                            <p className={`font-bold ${verificationResult.matched ? 'text-status-success' : 'text-status-danger'}`}>
                              {formatMoney(verificationResult.ecartVerification)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-content-muted mt-3">
                          Un superviseur peut soumettre un comptage indépendant pour valider le comptage du caissier.
                        </p>
                        <div className="grid grid-cols-5 gap-2">
                          {DENOMINATIONS.map(({ name, label, value }) => (
                            <div key={name} className="text-center">
                              <label className="text-[10px] text-content-muted block mb-1">{label}</label>
                              <input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={verificationBilletage[name] || ''}
                                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateVerificationBilletage(name, v ? parseInt(v) : 0); }}
                                className="w-full px-1.5 py-1.5 bg-surface-base/50 border border-edge rounded text-xs text-content-primary text-center focus:border-status-info/50 outline-none [appearance:textfield]"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-content-muted">Total vérification: <strong className="text-content-primary">{formatMoney(verificationTotal)}</strong></span>
                          <Button
                            onClick={handleSubmitVerification}
                            disabled={loadingVerification || verificationTotal <= 0}
                            variant="outline"
                            size="sm"
                            className="border-status-info/30 text-status-info hover:bg-status-info-bg"
                          >
                            {loadingVerification ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                            Soumettre
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Transfer Decision */}
              <div className="space-y-2.5">
                <div>
                  <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} className="text-content-muted" />
                    Décision de trésorerie
                  </h4>
                  <p className="text-xs text-content-muted mt-1">
                    Répartissez le montant physique entre le coffre-fort et le fonds de roulement pour demain.
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleTransferAll}
                    className="px-3 py-1.5 text-xs font-medium bg-accent/10 text-accent border border-accent/30 rounded-lg hover:bg-accent/20 transition-colors"
                  >
                    Tout au coffre
                  </button>
                  <button
                    onClick={handleKeepAll}
                    className="px-3 py-1.5 text-xs font-medium bg-status-warning-bg text-status-warning border border-status-warning/30 rounded-lg hover:bg-status-warning-bg transition-colors"
                  >
                    Tout garder
                  </button>
                  {montantPhysique > 0 && (() => {
                    // Round down to nearest 100k, keep ~50% as suggested amount
                    const suggested = Math.floor(montantPhysique / 2 / 100000) * 100000;
                    if (suggested > 0 && suggested < montantPhysique) {
                      const label = suggested >= 1000000
                        ? `${(suggested / 1000000).toFixed(suggested % 1000000 === 0 ? 0 : 1)}M`
                        : `${suggested / 1000}k`;
                      return (
                        <button
                          onClick={() => handleSplitAmount(suggested)}
                          className="px-3 py-1.5 text-xs font-medium bg-surface-subtle/30 text-content-muted border border-edge-strong/30 rounded-lg hover:bg-surface-subtle/40 transition-colors"
                        >
                          Garder {label}
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Amount Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-surface/50 rounded-xl p-3 border border-edge-subtle">
                    <div className="flex items-center gap-2 mb-2">
                      <Vault className="text-accent" size={16} />
                      <label className="text-xs font-medium text-content-secondary">Vers le Coffre-Fort</label>
                    </div>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={montantVersCoffre || ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        const value = v ? Number(v) : 0;
                        setMontantVersCoffre(Math.max(0, value));
                        setMontantReporte(Math.max(0, montantPhysique - value));
                      }}
                      className="w-full px-3 py-2 bg-surface-base/50 border border-edge rounded-lg text-base font-bold text-content-primary text-right focus:border-accent/50 focus:ring-1 focus:ring-accent/50 outline-none"
                      placeholder="0"
                    />
                    <p className="text-[10px] text-content-muted mt-1.5">Sera en attente de validation</p>
                  </div>

                  <div className="bg-surface/50 rounded-xl p-3 border border-edge-subtle">
                    <div className="flex items-center gap-2 mb-2">
                      <PiggyBank className="text-status-warning" size={16} />
                      <label className="text-xs font-medium text-content-secondary">Fonds Reporté (J+1)</label>
                    </div>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={montantReporte || ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        const value = v ? Number(v) : 0;
                        setMontantReporte(Math.max(0, value));
                        setMontantVersCoffre(Math.max(0, montantPhysique - value));
                      }}
                      className="w-full px-3 py-2 bg-surface-base/50 border border-edge rounded-lg text-base font-bold text-content-primary text-right focus:border-status-warning/50 focus:ring-1 focus:ring-status-warning/50 outline-none"
                      placeholder="0"
                    />
                    <p className="text-[10px] text-content-muted mt-1.5">Disponible à l'ouverture demain</p>
                  </div>
                </div>

                {/* Validation */}
                <div className={`rounded-lg px-3 py-2 flex items-center justify-between ${
                  isTransferValid ? 'bg-status-success-bg border border-status-success/30' : 'bg-status-danger-bg border border-status-danger/30'
                }`}>
                  <span className="text-xs">
                    Total: <strong className={isTransferValid ? 'text-status-success' : 'text-status-danger'}>
                      {formatMoney(montantVersCoffre + montantReporte)}
                    </strong> / {formatMoney(montantPhysique)}
                  </span>
                  {isTransferValid ? (
                    <Badge variant="success" value="✓ Valide" />
                  ) : (
                    <Badge variant="danger" value="✗ Invalide" />
                  )}
                </div>

                {/* Observations */}
                <div>
                  <label className="text-[10px] font-semibold text-content-muted uppercase tracking-wider mb-1 block">
                    Observations (optionnel)
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-base/50 border border-edge rounded-lg text-xs text-content-primary placeholder-content-muted focus:border-accent/50 focus:ring-1 focus:ring-accent/50 outline-none transition-all resize-none"
                    rows={1}
                    placeholder="Une note à ajouter ?"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 border-t border-edge bg-surface-base/95 backdrop-blur flex flex-col sm:flex-row gap-2">
          {step === 'freeze' && (
            <>
              <Button onClick={onClose} variant="outline" className="w-full sm:w-auto border-edge">
                Annuler
              </Button>
              <Button
                onClick={handleInitiateClose}
                disabled={!freezeConfirmed || loading || !canCloseCaisse}
                className="w-full sm:flex-1 bg-status-warning hover:bg-status-warning"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Lock size={16} className="mr-2" />}
                Geler et Commencer
              </Button>
            </>
          )}

          {step === 'count' && (
            <>
              <Button onClick={handleCancelClose} variant="outline" className="w-full sm:w-auto border-edge" disabled={loading}>
                <ArrowLeft size={16} className="mr-2" />
                Annuler
              </Button>
              <Button
                onClick={handleSubmitCount}
                disabled={loading || (soldeCalcule <= 0 && soldeTheorique > 0) || (Math.abs(soldeCalcule - soldeTheorique) > 0 && !ecartJustification.trim())}
                className={`w-full sm:flex-1 ${soldeCalcule - soldeTheorique === 0 ? 'bg-status-success hover:bg-status-success' : 'bg-accent-secondary hover:bg-accent-secondary-hover'}`}
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <ArrowRight size={16} className="mr-2" />}
                Valider le Comptage
              </Button>
            </>
          )}

          {step === 'transfer' && (
            <>
              <Button onClick={onClose} variant="outline" className="w-full sm:w-auto border-edge">
                Annuler
              </Button>
              <ClosureReportButton
                session={session}
                billetage={billetage}
                montantVersCoffre={montantVersCoffre}
                montantReporte={montantReporte}
                ecartJustification={ecartJustification}
                observations={observations}
                mmReconciliation={mmReconciliation?.providers}
                variant="outline"
                size="md"
                className="border-edge"
              />
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={loading || !isTransferValid || !canCloseCaisse}
                className="w-full sm:flex-1 bg-status-success hover:bg-status-success"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Lock size={16} className="mr-2" />}
                Finaliser la Fermeture
              </Button>
            </>
          )}
        </footer>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Confirmer la fermeture"
        message={
          <div className="space-y-3">
            <p>Vous êtes sur le point de fermer définitivement cette session.</p>
            <div className="bg-surface/50 rounded-lg p-3 space-y-2 text-sm">
              {montantVersCoffre > 0 && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Transfert coffre</span>
                  <span className="font-bold text-accent">{formatMoney(montantVersCoffre)}</span>
                </div>
              )}
              {montantReporte > 0 && (
                <div className="flex justify-between">
                  <span className="text-content-muted">Fonds reporté J+1</span>
                  <span className="font-bold text-status-warning">{formatMoney(montantReporte)}</span>
                </div>
              )}
            </div>
            {montantVersCoffre > 0 && (
              <p className="text-xs text-content-muted">
                Le transfert vers le coffre sera en attente de validation par le responsable.
              </p>
            )}
          </div>
        }
        onConfirm={handleFinalizeClose}
        onClose={() => setShowConfirmDialog(false)}
        variant="success"
        confirmText="Confirmer la fermeture"
        cancelText="Annuler"
      />

      {/* Pending Sync Warning — guard against closing with unsync'd offline operations */}
      <ConfirmDialog
        isOpen={showPendingSyncWarning}
        title="Op\u00e9rations non synchronis\u00e9es"
        message={
          <div className="space-y-3">
            <p>
              <strong className="text-status-warning">{pendingSyncCount} op\u00e9ration{pendingSyncCount > 1 ? 's' : ''}</strong> n'{pendingSyncCount > 1 ? 'ont' : 'a'} pas encore \u00e9t\u00e9 synchronis\u00e9{pendingSyncCount > 1 ? 'es' : 'e'} avec le serveur.
            </p>
            <p className="text-content-muted text-sm">
              Fermer la session maintenant pourrait cr\u00e9er un \u00e9cart comptable car ces op\u00e9rations ne seront pas prises en compte dans le solde th\u00e9orique.
            </p>
            <p className="text-content-muted text-sm font-semibold">
              Il est recommand\u00e9 d'attendre que la synchronisation soit termin\u00e9e avant de fermer.
            </p>
          </div>
        }
        onConfirm={executeInitiateClose}
        onClose={() => setShowPendingSyncWarning(false)}
        variant="warning"
        confirmText="Fermer quand m\u00eame"
        cancelText="Attendre la synchronisation"
      />

      {/* Save as Template Modal */}
      {showSaveTemplateModal && (
        <div
          className="fixed inset-0 bg-surface-base/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4"
          onClick={() => setShowSaveTemplateModal(false)}
        >
          <div
            className="bg-surface-base border border-edge-subtle w-full max-w-md rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-edge">
              <h4 className="text-lg font-bold text-content-primary flex items-center gap-2">
                <Save size={18} className="text-accent" />
                Sauvegarder comme modèle
              </h4>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2 block">
                  Nom du modèle *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="ex: Ouverture standard, Fermeture weekend..."
                  className="w-full px-4 py-2.5 bg-surface-base/50 border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent/50 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2 block">
                  Description (optionnel)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Description ou notes pour ce modèle..."
                  className="w-full px-4 py-2.5 bg-surface-base/50 border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent/50 focus:outline-none resize-none"
                  rows={2}
                />
              </div>
              <div className="bg-surface/50 rounded-lg p-3">
                <p className="text-xs text-content-muted mb-2">Billetage à sauvegarder:</p>
                <div className="flex flex-wrap gap-2">
                  {DENOMINATIONS.filter(d => billetage[d.name] > 0).map(d => (
                    <span key={d.name} className="px-2 py-1 bg-surface-elevated/50 rounded text-xs text-content-secondary">
                      {d.label} × {billetage[d.name]}
                    </span>
                  ))}
                </div>
                <p className="text-xs font-bold text-accent mt-2">
                  Total: {formatMoney(soldeCalcule)}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-edge flex justify-end gap-3">
              <Button
                onClick={() => setShowSaveTemplateModal(false)}
                variant="outline"
                className="border-edge"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSaveAsTemplate}
                disabled={loadingTemplates || !templateName.trim()}
                className="bg-accent-secondary hover:bg-accent-secondary-hover"
              >
                {loadingTemplates ? <Loader2 size={14} className="animate-spin mr-2" /> : <Save size={14} className="mr-2" />}
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
