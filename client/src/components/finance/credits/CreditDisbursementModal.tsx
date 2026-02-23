import React, { useState, useMemo } from 'react';
import {
  X, AlertCircle, DollarSign, Calendar, Wallet, Clock,
  AlertTriangle, ArrowRight, Vault, RefreshCw, Phone,
  Banknote, CreditCard, Smartphone, Info, User, Loader2
} from 'lucide-react';
import { creditApi, isInsufficientFundsError, extractInsufficientFundsData, type InsufficientFundsErrorData } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Button, FormField } from '../../ui';
import { StatutCoffre, DisbursementChannel, DISBURSEMENT_CHANNEL_LABELS, type DisbursementChannelType } from '@shared/enum/status-constants';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import { currencyCode } from '@shared/config/currency';
import OfflineGuard from '../../shared/OfflineGuard';

const MOBILE_OPERATORS = [
  { id: 'MTN', name: 'MTN Mobile Money', color: 'from-status-warning to-status-warning', logo: mtnLogo },
  { id: 'AIRTEL', name: 'Airtel Money', color: 'from-status-danger to-status-danger', logo: airtelLogo },
] as const;

interface Demande {
  id: string;
  numeroDemande: string;
  clientId: string;
  montantDemande: number;
  montantApprouve?: number | null;
  dureeValeur: number;
  dureeUnite: 'Jour' | 'Semaine' | 'Mois';
  nombreEcheances?: number;
  tauxInteret: number;
  typeCredit: string | null;
  objetCredit: string;
  statut: string;
  frequenceRemboursement: string;
  dateDemande: string;
  createdAt?: string;
  clients: {
    nom: string;
    prenom?: string;
    email?: string;
    telephone: string;
    photoProfile?: string;
  };
}

interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  solde: string;
  plafondEncaisse?: string;
  soldeMinimum?: string;
  statut: string;
  agenceNom?: string;
}

interface CreditDisbursementModalProps {
  demande: Demande;
  onClose: () => void;
  onSuccess: () => void;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function CreditDisbursementModal({ demande, onClose, onSuccess }: CreditDisbursementModalProps) {
  const { hasPermission } = usePermissions();
  const canDisburse = hasPermission('credits', 'approve');
  const canCreateTransfer = hasPermission('transferts', 'create');

  // États de base
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // État du workflow de réapprovisionnement
  const [insufficientFundsError, setInsufficientFundsError] = useState<InsufficientFundsErrorData | null>(null);
  const [showReplenishmentForm, setShowReplenishmentForm] = useState(false);
  const [coffres, setCoffres] = useState<CoffreFort[]>([]);
  const [loadingCoffres, setLoadingCoffres] = useState(false);

  // Options de planification du décaissement
  const [decaissementType, setDecaissementType] = useState<'immediat' | 'programme'>('immediat');
  const [dateDecaissement, setDateDecaissement] = useState(new Date().toISOString().split('T')[0]);
  const [delaiJours, setDelaiJours] = useState(0);

  // Canal de décaissement (ACCOUNT, CASH, MOBILE_MONEY)
  const [disbursementChannel, setDisbursementChannel] = useState<DisbursementChannelType>(DisbursementChannel.ACCOUNT);
  const [mobileProvider, setMobileProvider] = useState<string>('');

  // Helper: convert storage key to display URL for avatars
  const getAvatarUrl = (photoUrl: string | null | undefined): string | null => {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http') || photoUrl.startsWith('data:')) {
      return photoUrl;
    }
    return `/api/storage/files/${encodeURIComponent(photoUrl)}`;
  };

  const clientAvatarUrl = useMemo(() => getAvatarUrl(demande.clients.photoProfile), [demande.clients.photoProfile]);

  // Helper: convert V2 duration to days
  const convertDureeEnJours = (valeur: number, unite: string): number => {
    switch (unite) {
      case 'Jour': return valeur;
      case 'Semaine': return valeur * 7;
      case 'Mois': return valeur * 30;
      default: return valeur;
    }
  };

  // Helper: calculate number of payments
  const calculerNombreEcheances = (frequence: string, dureeValeur: number, dureeUnite: string): number => {
    const joursTotal = convertDureeEnJours(dureeValeur, dureeUnite);
    switch (frequence) {
      case 'Journalier': return joursTotal;
      case 'Hebdomadaire': return Math.ceil(joursTotal / 7);
      case 'Bimensuel': return Math.ceil(joursTotal / 15);
      case 'Mensuel': return Math.ceil(joursTotal / 30);
      case 'Trimestriel': return Math.ceil(joursTotal / 90);
      default: return joursTotal;
    }
  };

  // Calculations
  const { montantTotal, mensualite, nombreEcheancesCalc } = useMemo(() => {
    const base = demande.montantApprouve || demande.montantDemande;
    const dureeValeur = demande.dureeValeur || 0;
    const dureeUnite = demande.dureeUnite || 'Mois';
    const frequence = demande.frequenceRemboursement;

    const nombreEcheances = demande.nombreEcheances || calculerNombreEcheances(frequence, dureeValeur, dureeUnite);
    const total = base * (1 + demande.tauxInteret / 100);
    const mens = nombreEcheances > 0 ? total / nombreEcheances : 0;

    return {
      montantTotal: total,
      mensualite: isFinite(mens) ? mens : 0,
      nombreEcheancesCalc: nombreEcheances
    };
  }, [demande]);

  // Calculer la date effective de décaissement
  const dateEffectiveDecaissement = useMemo(() => {
    if (decaissementType === 'immediat') {
      return new Date();
    } else if (delaiJours > 0) {
      const date = new Date();
      date.setDate(date.getDate() + delaiJours);
      return date;
    } else {
      return new Date(dateDecaissement);
    }
  }, [decaissementType, dateDecaissement, delaiJours]);

  // Calculer la date de fin du crédit
  const dateFin = useMemo(() => {
    const joursTotal = convertDureeEnJours(demande.dureeValeur, demande.dureeUnite);
    const date = new Date(dateEffectiveDecaissement);
    date.setDate(date.getDate() + joursTotal);
    return date;
  }, [dateEffectiveDecaissement, demande.dureeValeur, demande.dureeUnite]);

  const montantDecaissement = demande.montantApprouve || demande.montantDemande;

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleDisbursement = async () => {
    setLoading(true);
    setInsufficientFundsError(null);

    try {
      const result = await creditApi.decaissement({
        demandeId: demande.id,
        duree: nombreEcheancesCalc,
        dateDebut: dateEffectiveDecaissement.toISOString().split('T')[0],
        dateFin: dateFin.toISOString().split('T')[0],
        dateSolvabilite: dateFin.toISOString().split('T')[0],
        soldeRestant: montantTotal.toString(),
        decaissementImmediat: decaissementType === 'immediat',
        disbursementChannel,
        provider: disbursementChannel === DisbursementChannel.MOBILE_MONEY ? mobileProvider as 'MTN' | 'AIRTEL' : undefined
      });

      toast.success(result.message || 'Crédit décaissé');

      // Afficher un message différent selon le canal
      if (result.disbursementChannel === 'CASH') {
        toast.info(
          `Le client doit se présenter à la caisse pour récupérer ${formatMoney(montantDecaissement)}`,
          { duration: 6000 }
        );
      } else if (result.compteCourant) {
        toast.info(
          `Compte ${result.compteCourant.numero} crédité - Nouveau solde: ${formatMoney(result.compteCourant.nouveauSolde)}`,
          { duration: 5000 }
        );
      }

      onSuccess();
    } catch (error: any) {
      // Extraire les données d'erreur de solde insuffisant si présentes
      const insufficientFundsData = extractInsufficientFundsData(error);

      if (insufficientFundsData) {
        // Erreur de solde insuffisant → Afficher la vue de réapprovisionnement
        setInsufficientFundsError(insufficientFundsData);
        setShowConfirm(false);
        // Ne pas fermer le modal, l'utilisateur voit la vue de réapprovisionnement
      } else {
        // Autre erreur → Afficher un toast d'erreur
        toast.error(error.message || "Erreur lors du décaissement");
      }
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  // Charger les coffres pour le formulaire de transfert
  const loadCoffres = async () => {
    setLoadingCoffres(true);
    try {
      const response = await fetch('/api/transferts-inter-coffres/coffres', {
        credentials: 'include',
      });
      const result = await response.json();
      if (result.success) {
        setCoffres(result.coffres || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des coffres:', error);
      toast.error('Impossible de charger les coffres');
    } finally {
      setLoadingCoffres(false);
    }
  };

  // Ouvrir le formulaire de transfert
  const handleOpenReplenishmentForm = async () => {
    await loadCoffres();
    setShowReplenishmentForm(true);
  };

  // Succès du transfert
  const handleTransferSuccess = () => {
    setShowReplenishmentForm(false);
    setInsufficientFundsError(null);
    onClose();
    toast.success(
      "Demande d'approvisionnement envoyée. Veuillez attendre la validation des fonds avant de relancer le décaissement.",
      { duration: 6000 }
    );
  };

  // Retour à la vue de décaissement
  const handleBackToDisburse = () => {
    setInsufficientFundsError(null);
  };

  // ============================================================================
  // RENDU : FORMULAIRE DE TRANSFERT INTER-COFFRES
  // ============================================================================

  if (showReplenishmentForm && insufficientFundsError) {
    // Pré-remplir les valeurs pour le formulaire de transfert
    const prefilledProps = {
      coffres,
      onClose: () => setShowReplenishmentForm(false),
      onSuccess: handleTransferSuccess,
      // Props de pré-remplissage
      prefilledDestinationCoffreId: insufficientFundsError.coffreId,
      prefilledMontant: insufficientFundsError.deficit.toString(),
      prefilledMotif: `Approvisionnement pour décaissement crédit - Demande ${demande.numeroDemande} - ${formatClientName(demande.clients.nom, demande.clients.prenom)}`,
    };

    return (
      <TransfertInterCoffresFormWithPrefill {...prefilledProps} />
    );
  }

  // ============================================================================
  // RENDU : VUE DE RÉAPPROVISIONNEMENT (SOLDE INSUFFISANT)
  // ============================================================================

  if (insufficientFundsError) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-xl border border-edge w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-6 border-b border-edge flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-status-warning-bg border border-status-warning/30">
                <AlertTriangle className="text-status-warning" size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-content-primary">Solde Insuffisant</h2>
                <p className="text-content-muted text-sm">Action requise pour continuer</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-content-muted hover:text-content-primary p-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Contenu */}
          <div className="p-6 space-y-6">
            {/* Alerte principale */}
            <div className="bg-status-warning-bg border border-status-warning/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Vault className="text-status-warning flex-shrink-0 mt-0.5" size={20} />
                <div className="space-y-1">
                  <p className="text-status-warning-text font-medium">
                    {insufficientFundsError.code === 'COFFRE_SOLDE_MINIMUM' ? (
                      <>Le coffre ne contient que <span className="text-status-warning font-bold">{formatMoney(insufficientFundsError.current)}</span> — le solde minimum requis est de <span className="text-status-warning font-bold">{formatMoney(insufficientFundsError.soldeMinimum || 0)}</span></>
                    ) : (
                      <>Le coffre {insufficientFundsError.coffreCode} ne contient que <span className="text-status-warning font-bold">{formatMoney(insufficientFundsError.current)}</span></>
                    )}
                  </p>
                  <p className="text-content-secondary text-sm">
                    Il manque{' '}
                    <span className="text-status-danger font-semibold">
                      {formatMoney(insufficientFundsError.deficit)}
                    </span>{' '}
                    pour valider ce décaissement de{' '}
                    <span className="text-content-primary font-semibold">
                      {formatMoney(montantDecaissement)}
                    </span>
                    {insufficientFundsError.code === 'COFFRE_SOLDE_MINIMUM' && (
                      <span className="text-content-muted"> (le solde après l'opération doit rester au-dessus du minimum)</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Résumé du crédit */}
            <div className="bg-surface-elevated/50 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-content-muted uppercase">Crédit en attente</h4>
              <div className="flex justify-between items-center">
                <span className="text-content-secondary">Bénéficiaire</span>
                <span className="text-content-primary font-medium">
                  {formatClientName(demande.clients.nom, demande.clients.prenom)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-content-secondary">Montant à décaisser</span>
                <span className="text-status-success font-bold">{formatMoney(montantDecaissement)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {canCreateTransfer ? (
                <Button
                  onClick={handleOpenReplenishmentForm}
                  disabled={loadingCoffres}
                  className="w-full bg-gradient-to-r from-status-warning to-status-warning hover:from-status-warning hover:to-status-warning text-white font-semibold py-3"
                >
                  {loadingCoffres ? (
                    <>
                      <RefreshCw className="animate-spin mr-2" size={18} />
                      Chargement...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="mr-2" size={18} />
                      Demander un Approvisionnement
                    </>
                  )}
                </Button>
              ) : (
                <div className="bg-surface-elevated/50 border border-edge-strong rounded-xl p-4">
                  <div className="flex items-center gap-3 text-content-secondary">
                    <Phone className="text-content-muted" size={20} />
                    <div>
                      <p className="font-medium">Permission insuffisante</p>
                      <p className="text-sm text-content-muted">
                        Contactez votre chef d'agence pour demander un approvisionnement du coffre.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleBackToDisburse}
                  className="flex-1 border-edge-strong text-content-secondary hover:bg-surface-elevated"
                >
                  Retour
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-edge-strong text-content-secondary hover:bg-surface-elevated"
                >
                  Fermer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDU : VUE NORMALE DE DÉCAISSEMENT
  // ============================================================================

  // ============================================================================
  // RENDU : VUE NORMALE DE DÉCAISSEMENT (REDESIGN V2)
  // ============================================================================

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-surface-base rounded-xl border border-edge w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
          
          {/* === HEADER === */}
          <div className="bg-surface/80 border-b border-edge p-4 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-bold text-content-primary flex items-center gap-2">
                <DollarSign size={18} className="text-status-success" /> 
                Décaissement Crédit
              </h2>
              <p className="text-content-muted text-xs">Validation et transfert des fonds</p>
            </div>
            <button onClick={onClose} className="text-content-muted hover:text-content-primary p-1 rounded hover:bg-surface-elevated transition">
                <X size={20} />
            </button>
          </div>

          <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-1">
            {/* 1. BENEFICIARY & AMOUNT (Horizontal Compact Card) */}
            <div className="bg-surface rounded-xl p-4 border border-edge flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-surface-elevated flex items-center justify-center text-content-muted overflow-hidden">
                        {clientAvatarUrl ? (
                          <img
                            src={clientAvatarUrl}
                            alt={formatClientName(demande.clients.nom, demande.clients.prenom)}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2364748b" stroke-width="1.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')}`;
                            }}
                          />
                        ) : (
                          <User size={20} />
                        )}
                    </div>
                    <div>
                        <div className="text-xs text-content-muted uppercase tracking-wider font-semibold">Bénéficiaire</div>
                        <div className="text-content-primary font-bold text-sm sm:text-base">{formatClientName(demande.clients.nom, demande.clients.prenom)}</div>
                        <div className="text-content-muted text-xs flex items-center gap-1">
                             <Phone size={10} /> {demande.clients.telephone}
                        </div>
                    </div>
                </div>
                <div className="text-left sm:text-right border-t sm:border-t-0 sm:border-l border-edge pt-3 sm:pt-0 pl-0 sm:pl-4">
                     <div className="text-xs text-status-success uppercase tracking-wider font-semibold">Net à Décaisser</div>
                     <div className="text-2xl font-bold text-content-primary tracking-tight">{formatMoney(montantDecaissement)}</div>
                     <div className="text-content-muted text-xs">
                         {nombreEcheancesCalc} échéances de {formatMoney(mensualite)}
                     </div>
                </div>
            </div>

            {/* 2. CHANNEL SELECTOR */}
            <div>
                <h3 className="text-xs font-bold text-content-muted uppercase mb-2 flex items-center gap-2">
                    <Wallet size={14} /> Canal de Versement
                </h3>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setDisbursementChannel(DisbursementChannel.ACCOUNT)}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${
                        disbursementChannel === DisbursementChannel.ACCOUNT
                            ? 'bg-status-success-bg border-status-success text-status-success ring-1 ring-status-success/50'
                            : 'bg-surface border-edge text-content-muted hover:bg-surface-elevated hover:border-edge-strong'
                        }`}
                    >
                        <CreditCard size={20} />
                        <span className="text-xs font-medium">Compte</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setDisbursementChannel(DisbursementChannel.CASH)}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${
                        disbursementChannel === DisbursementChannel.CASH
                            ? 'bg-status-warning-bg border-status-warning text-status-warning ring-1 ring-status-warning/50'
                            : 'bg-surface border-edge text-content-muted hover:bg-surface-elevated hover:border-edge-strong'
                        }`}
                    >
                        <Banknote size={20} />
                        <span className="text-xs font-medium">Espèces</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setDisbursementChannel(DisbursementChannel.MOBILE_MONEY)}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${
                        disbursementChannel === DisbursementChannel.MOBILE_MONEY
                            ? 'bg-status-info-bg border-status-info text-status-info ring-1 ring-status-info/50'
                            : 'bg-surface border-edge text-content-muted hover:bg-surface-elevated hover:border-edge-strong'
                        }`}
                    >
                        {mobileProvider ? (
                          <img src={MOBILE_OPERATORS.find(o => o.id === mobileProvider)?.logo} alt={mobileProvider} className="w-5 h-5 rounded-full object-contain" />
                        ) : (
                          <Smartphone size={20} />
                        )}
                        <span className="text-xs font-medium">Mobile</span>
                    </button>
                </div>

                {/* Contextual Info Box */}
                <div className="mt-2 bg-surface/50 border border-edge p-3 rounded-lg text-xs transition-all">
                    {disbursementChannel === DisbursementChannel.ACCOUNT && (
                        <p className="text-content-secondary">
                             Virement automatique sur le <span className="text-status-success font-semibold">Compte Courant</span> du client. Solde disponible immédiatement.
                        </p>
                    )}
                    {disbursementChannel === DisbursementChannel.CASH && (
                        <p className="text-content-secondary">
                            Génère un ordre de retrait <span className="text-status-warning font-semibold">Caisse</span>. Le client devra présenter sa pièce d'identité au guichet.
                        </p>
                    )}
                    {disbursementChannel === DisbursementChannel.MOBILE_MONEY && (
                         <p className="text-content-secondary">
                             Transfert vers le numéro <span className="text-status-info font-semibold">{demande.clients.telephone}</span>. Des frais opérateur peuvent s'appliquer.
                         </p>
                    )}
                </div>

                {/* Provider selection for Mobile Money */}
                {disbursementChannel === DisbursementChannel.MOBILE_MONEY && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-content-muted uppercase mb-2">Opérateur</label>
                    <div className="grid grid-cols-2 gap-2">
                      {MOBILE_OPERATORS.map(op => (
                        <button
                          key={op.id}
                          type="button"
                          onClick={() => setMobileProvider(op.id)}
                          className={`flex items-center gap-2.5 p-3 rounded-lg border text-sm font-medium transition-all ${
                            mobileProvider === op.id
                              ? `bg-gradient-to-r ${op.color} border-transparent text-white shadow-lg`
                              : 'bg-surface border-edge text-content-secondary hover:bg-surface-elevated hover:border-edge-strong'
                          }`}
                        >
                          <img src={op.logo} alt={op.name} className="w-7 h-7 rounded-full object-contain bg-white/10" />
                          {op.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* 3. SCHEDULING (Compact Segment) */}
            <div className="bg-surface rounded-xl p-1 border border-edge flex text-xs font-semibold">
                <button
                    onClick={() => setDecaissementType('immediat')}
                    className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
                        decaissementType === 'immediat' ? 'bg-surface-elevated text-content-primary shadow' : 'text-content-muted hover:text-content-secondary'
                    }`}
                >
                    <Clock size={14} /> Immédiat
                </button>
                <div className="w-px bg-surface-elevated my-1"></div>
                <button
                    onClick={() => setDecaissementType('programme')}
                    className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-2 transition-all ${
                        decaissementType === 'programme' ? 'bg-surface-elevated text-status-info shadow' : 'text-content-muted hover:text-content-secondary'
                    }`}
                >
                    <Calendar size={14} /> Programmé
                </button>
            </div>

             {decaissementType === 'programme' && (
                <div className="animate-in slide-in-from-top-2 fade-in bg-surface/50 p-3 rounded-lg border border-edge">
                    <div className="grid grid-cols-2 gap-3 items-center">
                         <input
                            type="date"
                            value={dateDecaissement}
                            onChange={(e) => {
                                setDateDecaissement(e.target.value);
                                setDelaiJours(0);
                            }}
                            min={new Date().toISOString().split('T')[0]}
                            className="bg-surface-base border border-edge-strong rounded px-3 py-1.5 text-content-primary text-sm w-full"
                         />
                         <div className="flex gap-1">
                            {[1, 3, 7].map(j => (
                                <button
                                    key={j}
                                    onClick={() => {
                                        setDelaiJours(j);
                                        const d = new Date(); d.setDate(d.getDate() + j);
                                        setDateDecaissement(d.toISOString().split('T')[0]);
                                    }}
                                    className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                                        delaiJours === j ? 'bg-status-info border-status-info text-white' : 'border-edge-strong text-content-muted hover:bg-surface-elevated'
                                    }`}
                                >
                                    +{j}j
                                </button>
                            ))}
                         </div>
                    </div>
                </div>
             )}

            {/* 4. SUMMARY FOOTER CARD */}
            <div className="bg-surface-base/50 border border-edge rounded-lg p-3 text-xs space-y-2">
                 <div className="flex justify-between">
                     <span className="text-content-muted">Date d'effet</span>
                     <span className="text-content-primary">{dateEffectiveDecaissement.toLocaleDateString('fr-FR')}</span>
                 </div>
                 <div className="flex justify-between">
                     <span className="text-content-muted">Première échéance</span>
                     <span className="text-content-primary">
                         {new Date(new Date(dateEffectiveDecaissement).getTime() + 30*24*60*60*1000).toLocaleDateString('fr-FR')} (Est.)
                     </span>
                 </div>
                 <div className="border-t border-edge pt-2 flex justify-between font-bold">
                     <span className="text-content-muted">Total à Rembourser</span>
                     <span className="text-status-warning">{formatMoney(montantTotal)}</span>
                 </div>
            </div>
            
          </div>

          {/* === ACTIONS === */}
          <div className="p-4 bg-surface border-t border-edge flex gap-3 shrink-0">
             <Button variant="outline" onClick={onClose} className="border-edge-strong text-content-secondary hover:bg-surface-elevated">
                 Annuler
             </Button>
             {canDisburse ? (
                 <OfflineGuard blockMode="dialog" offlineMessage="Les décaissements nécessitent une connexion active au serveur.">
                 <Button
                    variant="primary"
                    onClick={() => setShowConfirm(true)}
                    disabled={loading || (disbursementChannel === DisbursementChannel.MOBILE_MONEY && !mobileProvider)}
                    className={`flex-1 font-bold shadow-lg ${
                        disbursementChannel === DisbursementChannel.CASH
                        ? 'bg-status-warning hover:bg-status-warning text-white shadow-status-warning/20'
                        : disbursementChannel === DisbursementChannel.MOBILE_MONEY
                        ? 'bg-status-info hover:bg-status-info text-white shadow-status-info/20'
                        : 'bg-status-success hover:bg-status-success text-white shadow-status-success/20'
                    }`}
                 >
                    {loading ? <Loader2 className="animate-spin" size={18} /> :
                     decaissementType === 'programme' ? 'Valider la Programmation' : 'Confirmer le Décaissement'}
                 </Button>
                 </OfflineGuard>
             ) : (
                 <div className="flex-1 px-4 py-2 bg-surface-elevated text-content-muted rounded-lg text-xs text-center flex items-center justify-center gap-2">
                     <AlertCircle size={14} /> Droit insuffisant
                 </div>
             )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmer le décaissement"
        message={
          disbursementChannel === DisbursementChannel.CASH
            ? `Confirmez-vous l'envoi de cet ordre de paiement à la caisse ? Le client ${formatClientName(demande.clients.nom, demande.clients.prenom)} devra se présenter au guichet pour récupérer ${formatMoney(montantDecaissement)}.`
            : disbursementChannel === DisbursementChannel.MOBILE_MONEY
              ? `Confirmez-vous l'envoi de ${formatMoney(montantDecaissement)} via Mobile Money au numéro ${demande.clients.telephone} ?`
              : decaissementType === 'immediat'
                ? `Confirmez-vous le décaissement immédiat de ${formatMoney(montantDecaissement)} vers le compte courant du client ? Un crédit actif sera créé et le compte sera crédité.`
                : `Confirmez-vous la programmation du décaissement de ${formatMoney(montantDecaissement)} pour le ${dateEffectiveDecaissement.toLocaleDateString('fr-FR')} ?`
        }
        confirmText={
          disbursementChannel === DisbursementChannel.CASH
            ? "Envoyer à la caisse"
            : disbursementChannel === DisbursementChannel.MOBILE_MONEY
              ? "Envoyer via Mobile"
              : decaissementType === 'immediat' ? "Confirmer et Décaisser" : "Programmer"
        }
        onConfirm={handleDisbursement}
        onClose={() => setShowConfirm(false)}
        variant={disbursementChannel === DisbursementChannel.CASH ? "warning" : "success"}
      />
    </>
  );
}

// ============================================================================
// COMPOSANT : FORMULAIRE DE TRANSFERT AVEC PRÉ-REMPLISSAGE
// ============================================================================

interface TransfertFormWithPrefillProps {
  coffres: CoffreFort[];
  onClose: () => void;
  onSuccess: (transfert: any) => void;
  prefilledDestinationCoffreId?: string;
  prefilledMontant?: string;
  prefilledMotif?: string;
}

function TransfertInterCoffresFormWithPrefill({
  coffres,
  onClose,
  onSuccess,
  prefilledDestinationCoffreId,
  prefilledMontant,
  prefilledMotif,
}: TransfertFormWithPrefillProps) {
  const [coffreSourceId, setCoffreSourceId] = useState('');
  const [coffreDestinationId, setCoffreDestinationId] = useState(prefilledDestinationCoffreId || '');
  const [montant, setMontant] = useState(prefilledMontant || '');
  const [motif, setMotif] = useState(prefilledMotif || '');
  const [typeConditionnement, setTypeConditionnement] = useState('Sac scellé');
  const [numeroScelle, setNumeroScelle] = useState('');
  const [dateTransfert, setDateTransfert] = useState(new Date().toISOString().split('T')[0]);
  const [heureDepart, setHeureDepart] = useState('');
  const [agentsTransport, setAgentsTransport] = useState([
    { nom: '', contact: '' },
    { nom: '', contact: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activeCoffres = useMemo(() => {
    return coffres.filter(c => c.statut === StatutCoffre.ACTIVE);
  }, [coffres]);

  const coffreSource = useMemo(() => {
    return activeCoffres.find(c => c.id === coffreSourceId);
  }, [activeCoffres, coffreSourceId]);

  const coffreDestination = useMemo(() => {
    return activeCoffres.find(c => c.id === coffreDestinationId);
  }, [activeCoffres, coffreDestinationId]);

  // Validation
  const validation = useMemo(() => {
    const result: { valid: boolean; warnings: string[]; errors: string[] } = {
      valid: true,
      warnings: [],
      errors: [],
    };

    const montantNum = parseFloat(montant) || 0;

    if (coffreSource && montantNum > 0) {
      const soldeSource = parseFloat(coffreSource.solde) || 0;
      const soldeMinSource = parseFloat(coffreSource.soldeMinimum || '0') || 0;

      if (montantNum > soldeSource) {
        result.errors.push(`Solde insuffisant. Disponible: ${formatMoney(soldeSource)}`);
        result.valid = false;
      } else if (soldeSource - montantNum < soldeMinSource) {
        result.errors.push(`Le solde après transfert serait inférieur au minimum requis (${formatMoney(soldeMinSource)})`);
        result.valid = false;
      }
    }

    if (coffreDestination && montantNum > 0) {
      const soldeDest = parseFloat(coffreDestination.solde) || 0;
      const plafondDest = parseFloat(coffreDestination.plafondEncaisse || '0') || 0;

      if (plafondDest > 0 && soldeDest + montantNum > plafondDest) {
        result.errors.push(`Le plafond du coffre destination serait dépassé (${formatMoney(plafondDest)})`);
        result.valid = false;
      }
    }

    return result;
  }, [coffreSource, coffreDestination, montant]);

  const addAgent = () => {
    setAgentsTransport([...agentsTransport, { nom: '', contact: '' }]);
  };

  const removeAgent = (index: number) => {
    if (agentsTransport.length > 2) {
      setAgentsTransport(agentsTransport.filter((_, i) => i !== index));
    }
  };

  const updateAgent = (index: number, field: 'nom' | 'contact', value: string) => {
    const updated = [...agentsTransport];
    updated[index][field] = value;
    setAgentsTransport(updated);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!coffreSourceId) newErrors.coffreSource = 'Sélectionnez un coffre source';
    if (!coffreDestinationId) newErrors.coffreDestination = 'Sélectionnez un coffre destination';
    if (coffreSourceId === coffreDestinationId) newErrors.coffreDestination = 'Source et destination doivent être différents';

    const montantNum = parseFloat(montant) || 0;
    if (montantNum <= 0) newErrors.montant = 'Le montant doit être positif';

    if (!motif || motif.trim().length < 10) newErrors.motif = 'Le motif doit contenir au moins 10 caractères';

    if (typeConditionnement === 'Sac scellé' && !numeroScelle) {
      newErrors.numeroScelle = 'Le numéro de scellé est obligatoire pour un sac scellé';
    }

    const validAgents = agentsTransport.filter(a => a.nom.trim() && a.contact.trim());
    if (validAgents.length < 2) {
      newErrors.agentsTransport = 'Au moins 2 agents de transport sont requis';
    }

    if (!validation.valid) {
      validation.errors.forEach((err, i) => {
        newErrors[`validation_${i}`] = err;
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent, submitImmediately: boolean = false) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    const loadingId = toast.loading('Création du transfert...');

    try {
      const validAgents = agentsTransport.filter(a => a.nom.trim() && a.contact.trim());

      const response = await fetch('/api/transferts-inter-coffres/transferts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          coffreSourceId,
          coffreDestinationId,
          montant: parseFloat(montant),
          devise: currencyCode(),
          motif: motif.trim(),
          typeConditionnement,
          numeroScelle: typeConditionnement === 'Sac scellé' ? numeroScelle : undefined,
          dateTransfert,
          heureDepart: heureDepart || undefined,
          agentsTransport: validAgents,
        }),
      });

      const result = await response.json();
      toast.dismiss(loadingId);

      if (!result.success) {
        toast.error(result.error || 'Erreur lors de la création');
        return;
      }

      // Si submitImmediately, soumettre aussi le transfert
      if (submitImmediately) {
        const submitLoadingId = toast.loading('Soumission du transfert...');
        const submitResponse = await fetch(`/api/transferts-inter-coffres/transferts/${result.transfert.id}/submit`, {
          method: 'POST',
          credentials: 'include',
        });
        const submitResult = await submitResponse.json();
        toast.dismiss(submitLoadingId);

        if (!submitResult.success) {
          toast.warning('Transfert créé mais non soumis: ' + (submitResult.error || 'Erreur'));
        }
      }

      onSuccess(result.transfert);
    } catch (error) {
      toast.dismiss(loadingId);
      toast.error('Erreur lors de la création du transfert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-base/90 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface-base border border-edge w-full max-w-2xl max-h-[95vh] sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300">
        {/* Header */}
        <header className="p-5 border-b border-edge flex items-center justify-between sticky top-0 bg-surface-base/95 backdrop-blur z-10 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-status-warning/20 to-status-warning/20 border border-status-warning/30">
              <Vault size={20} className="text-status-warning" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary">Demande d'Approvisionnement</h2>
              <p className="text-xs text-content-muted">Transfert inter-coffres pour décaissement crédit</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full text-content-muted hover:text-content-primary h-10 w-10 p-0"
          >
            <X size={20} />
          </Button>
        </header>

        {/* Info pré-remplissage */}
        <div className="px-5 pt-4">
          <div className="bg-status-info-bg border border-status-info/30 rounded-xl p-3 flex items-start gap-3">
            <AlertCircle className="text-status-info flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-status-info-text">
              Montant minimum requis pré-rempli. Vous pouvez augmenter ce montant pour anticiper d'autres opérations.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* Source & Destination */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide flex items-center gap-2">
              <ArrowRight size={16} className="text-accent" />
              Coffres Source et Destination
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Coffre Source *</label>
                <select
                  value={coffreSourceId}
                  onChange={(e) => setCoffreSourceId(e.target.value)}
                  className={`w-full px-4 py-3 bg-surface-base border rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                    errors.coffreSource ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                >
                  <option value="">Sélectionner le coffre source...</option>
                  {activeCoffres.map((coffre) => (
                    <option key={coffre.id} value={coffre.id} disabled={coffre.id === coffreDestinationId}>
                      {coffre.agenceNom || coffre.nom} - {formatMoney(parseFloat(coffre.solde))}
                    </option>
                  ))}
                </select>
                {coffreSource && (
                  <div className="text-xs text-content-muted">
                    Solde: <span className="text-status-success font-medium">{formatMoney(parseFloat(coffreSource.solde))}</span>
                  </div>
                )}
                {errors.coffreSource && <p className="text-xs text-status-danger">{errors.coffreSource}</p>}
              </div>

              {/* Destination (pré-sélectionnée) */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Coffre Destination *</label>
                <select
                  value={coffreDestinationId}
                  onChange={(e) => setCoffreDestinationId(e.target.value)}
                  className={`w-full px-4 py-3 bg-surface-base border rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                    errors.coffreDestination ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                >
                  <option value="">Sélectionner...</option>
                  {activeCoffres.map((coffre) => (
                    <option key={coffre.id} value={coffre.id} disabled={coffre.id === coffreSourceId}>
                      {coffre.agenceNom || coffre.nom} - {formatMoney(parseFloat(coffre.solde))}
                    </option>
                  ))}
                </select>
                {coffreDestination && (
                  <div className="text-xs text-content-muted">
                    Solde actuel: <span className="text-content-primary">{formatMoney(parseFloat(coffreDestination.solde))}</span>
                    {prefilledDestinationCoffreId === coffreDestinationId && (
                      <span className="ml-2 text-status-warning">(Coffre à approvisionner)</span>
                    )}
                  </div>
                )}
                {errors.coffreDestination && <p className="text-xs text-status-danger">{errors.coffreDestination}</p>}
              </div>
            </div>
          </section>

          {/* Montant */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Montant ({currencyCode()}) *</label>
            <div className="relative">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={montant}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontant(v); }}
                placeholder="0"
                className={`w-full pl-4 pr-16 py-4 bg-surface-base border rounded-xl text-2xl font-bold text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                  errors.montant ? 'border-status-danger' : 'border-edge focus:border-accent'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-content-muted">{currencyCode()}</span>
            </div>
            {errors.montant && <p className="text-xs text-status-danger">{errors.montant}</p>}

            {/* Validation messages */}
            {validation.errors.length > 0 && (
              <div className="mt-2 p-3 bg-status-danger-bg border border-status-danger/30 rounded-xl space-y-1">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-status-danger flex items-center gap-2">
                    <AlertTriangle size={12} /> {err}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* Motif */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Motif du transfert *</label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Décrivez la raison de ce transfert..."
              rows={2}
              className={`w-full px-4 py-3 bg-surface-base border rounded-xl text-content-primary placeholder-content-muted focus:ring-2 focus:ring-accent/30 outline-none resize-none transition-all ${
                errors.motif ? 'border-status-danger' : 'border-edge focus:border-accent'
              }`}
            />
            {errors.motif && <p className="text-xs text-status-danger">{errors.motif}</p>}
          </section>

          {/* Date */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Date du transfert *</label>
            <input
              type="date"
              value={dateTransfert}
              onChange={(e) => setDateTransfert(e.target.value)}
              className="w-full px-4 py-3 bg-surface-base border border-edge rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"
            />
          </section>

          {/* Conditionnement */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide">Conditionnement</h3>
            <div className="grid grid-cols-2 gap-2">
              {['Sac scellé', 'Mallette', 'Enveloppe', 'Autre'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeConditionnement(type)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    typeConditionnement === type
                      ? 'bg-accent/10 text-accent border border-accent/50'
                      : 'bg-surface text-content-muted border border-edge hover:border-edge-strong'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {typeConditionnement === 'Sac scellé' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Numéro de scellé *</label>
                <input
                  type="text"
                  value={numeroScelle}
                  onChange={(e) => setNumeroScelle(e.target.value)}
                  placeholder="Ex: SC-2026-00123"
                  className={`w-full px-4 py-3 bg-surface-base border rounded-xl text-content-primary placeholder-content-muted focus:ring-2 focus:ring-accent/30 outline-none ${
                    errors.numeroScelle ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                />
                {errors.numeroScelle && <p className="text-xs text-status-danger">{errors.numeroScelle}</p>}
              </div>
            )}
          </section>

          {/* Agents de Transport */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide">
                Agents de Transport (min. 2)
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addAgent}
                className="text-accent hover:bg-accent/10"
              >
                + Ajouter
              </Button>
            </div>

            {errors.agentsTransport && (
              <p className="text-xs text-status-danger flex items-center gap-1">
                <AlertTriangle size={12} /> {errors.agentsTransport}
              </p>
            )}

            <div className="space-y-3">
              {agentsTransport.map((agent, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={agent.nom}
                      onChange={(e) => updateAgent(index, 'nom', e.target.value)}
                      placeholder="Nom complet"
                      className="w-full px-3 py-2.5 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"
                    />
                    <input
                      type="text"
                      value={agent.contact}
                      onChange={(e) => updateAgent(index, 'contact', e.target.value)}
                      placeholder="Téléphone"
                      className="w-full px-3 py-2.5 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"
                    />
                  </div>
                  {agentsTransport.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAgent(index)}
                      className="text-status-danger hover:bg-status-danger-bg h-10 w-10 p-0 rounded-xl"
                    >
                      <X size={16} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </form>

        {/* Footer */}
        <footer className="p-5 border-t border-edge bg-surface-base/95 backdrop-blur sticky bottom-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto border-edge text-content-secondary hover:bg-surface"
              disabled={loading}
            >
              Annuler
            </Button>
            <div className="flex-1 flex gap-3">
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, false)}
                disabled={loading || !validation.valid}
                className="flex-1 bg-surface-elevated hover:bg-surface-subtle text-content-primary"
              >
                Sauvegarder brouillon
              </Button>
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading || !validation.valid}
                className="flex-1 bg-gradient-to-r from-status-warning to-status-warning hover:from-status-warning hover:to-status-warning text-white shadow-lg shadow-status-warning/20"
              >
                {loading ? 'Traitement...' : 'Soumettre la demande'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
