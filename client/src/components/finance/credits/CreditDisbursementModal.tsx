import React, { useState, useMemo } from 'react';
import {
  X, AlertCircle, DollarSign, Calendar, Wallet, Clock,
  AlertTriangle, ArrowRight, Vault, RefreshCw, Phone
} from 'lucide-react';
import { creditApi, isInsufficientFundsError, extractInsufficientFundsData, type InsufficientFundsErrorData } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast } from '../../../lib/toast';
import { formatMoney, formatClientName } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Button, FormField } from '../../ui';
import { StatutCoffre } from '@shared/enum/status-constants';

interface Demande {
  id: string;
  numero_demande: string;
  client_id: string;
  montant_demande: number;
  montant_approuve?: number | null;
  duree_valeur: number;
  duree_unite: 'Jour' | 'Semaine' | 'Mois';
  nombre_echeances?: number;
  taux_interet: number;
  type_credit: string | null;
  objet_credit: string;
  statut: string;
  frequence_remboursement: string;
  date_demande: string;
  created_at?: string;
  clients: {
    nom: string;
    prenom?: string;
    email?: string;
    phone: string;
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
    const base = demande.montant_approuve || demande.montant_demande;
    const dureeValeur = demande.duree_valeur || 0;
    const dureeUnite = demande.duree_unite || 'Mois';
    const frequence = demande.frequence_remboursement;

    const nombreEcheances = demande.nombre_echeances || calculerNombreEcheances(frequence, dureeValeur, dureeUnite);
    const total = base * (1 + demande.taux_interet / 100);
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
    const joursTotal = convertDureeEnJours(demande.duree_valeur, demande.duree_unite);
    const date = new Date(dateEffectiveDecaissement);
    date.setDate(date.getDate() + joursTotal);
    return date;
  }, [dateEffectiveDecaissement, demande.duree_valeur, demande.duree_unite]);

  const montantDecaissement = demande.montant_approuve || demande.montant_demande;

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
        decaissementImmediat: decaissementType === 'immediat'
      });

      toast.success(result.message || 'Crédit décaissé avec succès');

      if (result.compteCourant) {
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
      prefilledMotif: `Approvisionnement pour décaissement crédit - Demande ${demande.numero_demande} - ${formatClientName(demande.clients.nom, demande.clients.prenom)}`,
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
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-6 border-b border-slate-700 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
                <AlertTriangle className="text-amber-400" size={24} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Solde Insuffisant</h2>
                <p className="text-slate-400 text-sm">Action requise pour continuer</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Contenu */}
          <div className="p-6 space-y-6">
            {/* Alerte principale */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Vault className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="space-y-1">
                  <p className="text-amber-200 font-medium">
                    Le coffre {insufficientFundsError.coffreCode} ne contient que{' '}
                    <span className="text-amber-400 font-bold">
                      {formatMoney(insufficientFundsError.current)}
                    </span>
                  </p>
                  <p className="text-slate-300 text-sm">
                    Il manque{' '}
                    <span className="text-red-400 font-semibold">
                      {formatMoney(insufficientFundsError.deficit)}
                    </span>{' '}
                    pour valider ce décaissement de{' '}
                    <span className="text-white font-semibold">
                      {formatMoney(insufficientFundsError.required)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Résumé du crédit */}
            <div className="bg-slate-700/50 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-semibold text-slate-400 uppercase">Crédit en attente</h4>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Bénéficiaire</span>
                <span className="text-white font-medium">
                  {formatClientName(demande.clients.nom, demande.clients.prenom)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">Montant à décaisser</span>
                <span className="text-emerald-400 font-bold">{formatMoney(montantDecaissement)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {canCreateTransfer ? (
                <Button
                  onClick={handleOpenReplenishmentForm}
                  disabled={loadingCoffres}
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold py-3"
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
                <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                  <div className="flex items-center gap-3 text-slate-300">
                    <Phone className="text-slate-400" size={20} />
                    <div>
                      <p className="font-medium">Permission insuffisante</p>
                      <p className="text-sm text-slate-400">
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
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Retour
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
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

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-800">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <DollarSign className="text-emerald-400" /> Commission Crédit - Décaissement
              </h2>
              <p className="text-slate-400 text-sm mt-1">Validation finale et versement des fonds</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
          </div>

          <div className="p-6 space-y-6">
            {/* Info Bénéficiaire */}
            <div className="bg-slate-700/50 rounded-lg p-4 grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Bénéficiaire</h3>
                <p className="text-white font-semibold text-lg">{formatClientName(demande.clients.nom, demande.clients.prenom)}</p>
                <p className="text-slate-400">{demande.clients.phone}</p>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Crédit Approuvé</h3>
                <p className="text-emerald-400 font-bold text-2xl">{formatMoney(montantDecaissement)}</p>
                <p className="text-slate-300 text-sm">{nombreEcheancesCalc} échéances de {formatMoney(mensualite)}</p>
              </div>
            </div>

            {/* Destination des fonds */}
            <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="text-emerald-400" size={20} />
                <h3 className="text-sm font-bold text-emerald-400 uppercase">Destination des fonds</h3>
              </div>
              <p className="text-slate-300">
                Le montant de <span className="text-emerald-400 font-semibold">{formatMoney(montantDecaissement)}</span> sera
                crédité sur le <span className="text-white font-semibold">compte courant</span> du client.
              </p>
            </div>

            {/* Options de planification */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase flex items-center gap-2">
                <Clock size={16} /> Planification du décaissement
              </h3>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDecaissementType('immediat')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                    decaissementType === 'immediat'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-semibold">Immédiat</div>
                  <div className="text-xs text-slate-400 mt-1">Décaisser maintenant</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDecaissementType('programme')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                    decaissementType === 'programme'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-semibold">Programmé</div>
                  <div className="text-xs text-slate-400 mt-1">Choisir une date</div>
                </button>
              </div>

              {decaissementType === 'programme' && (
                <div className="grid md:grid-cols-2 gap-4 p-4 bg-slate-700/30 rounded-lg">
                  <FormField
                    name="dateDecaissement"
                    label="Date de décaissement"
                    type="date"
                    value={dateDecaissement}
                    onChange={(e) => {
                      setDateDecaissement(e.target.value);
                      setDelaiJours(0);
                    }}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Ou dans X jours</label>
                    <div className="flex gap-2">
                      {[1, 3, 7, 14, 30].map(jours => (
                        <button
                          key={jours}
                          type="button"
                          onClick={() => {
                            setDelaiJours(jours);
                            const d = new Date();
                            d.setDate(d.getDate() + jours);
                            setDateDecaissement(d.toISOString().split('T')[0]);
                          }}
                          className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                            delaiJours === jours
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                          }`}
                        >
                          {jours}j
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Résumé */}
            <div className="bg-slate-700/30 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Date de décaissement:</span>
                <span className="text-white font-medium flex items-center gap-2">
                  <Calendar size={14} />
                  {dateEffectiveDecaissement.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Date de fin du crédit:</span>
                <span className="text-white font-medium">
                  {dateFin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Montant total à rembourser:</span>
                <span className="text-amber-400 font-semibold">{formatMoney(montantTotal)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={onClose} className="flex-1">Annuler</Button>
              {canDisburse ? (
                <Button
                  variant="primary"
                  onClick={() => setShowConfirm(true)}
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                >
                  {loading ? 'Traitement...' : decaissementType === 'immediat' ? 'Décaisser maintenant' : 'Programmer le décaissement'}
                </Button>
              ) : (
                <div className="flex-1 px-6 py-2 bg-slate-700 text-slate-400 rounded-lg text-center flex items-center justify-center gap-2 text-sm">
                  <AlertCircle size={16} aria-hidden="true" />
                  Permission requise
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmer le décaissement"
        message={
          decaissementType === 'immediat'
            ? `Confirmez-vous le décaissement immédiat de ${formatMoney(montantDecaissement)} vers le compte courant du client ? Un crédit actif sera créé et le compte sera crédité.`
            : `Confirmez-vous la programmation du décaissement de ${formatMoney(montantDecaissement)} pour le ${dateEffectiveDecaissement.toLocaleDateString('fr-FR')} ? Le crédit sera créé et le compte courant du client sera crédité à cette date.`
        }
        confirmText={decaissementType === 'immediat' ? "Confirmer et Décaisser" : "Programmer"}
        onConfirm={handleDisbursement}
        onClose={() => setShowConfirm(false)}
        variant="success"
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
          devise: 'XAF',
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
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl max-h-[95vh] sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300">
        {/* Header */}
        <header className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <Vault size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Demande d'Approvisionnement</h2>
              <p className="text-xs text-slate-400">Transfert inter-coffres pour décaissement crédit</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full text-slate-400 hover:text-white h-10 w-10 p-0"
          >
            <X size={20} />
          </Button>
        </header>

        {/* Info pré-remplissage */}
        <div className="px-5 pt-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-start gap-3">
            <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-blue-200">
              Montant minimum requis pré-rempli. Vous pouvez augmenter ce montant pour anticiper d'autres opérations.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* Source & Destination */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <ArrowRight size={16} className="text-cyan-400" />
              Coffres Source et Destination
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Coffre Source *</label>
                <select
                  value={coffreSourceId}
                  onChange={(e) => setCoffreSourceId(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${
                    errors.coffreSource ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
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
                  <div className="text-xs text-slate-500">
                    Solde: <span className="text-emerald-400 font-medium">{formatMoney(parseFloat(coffreSource.solde))}</span>
                  </div>
                )}
                {errors.coffreSource && <p className="text-xs text-red-400">{errors.coffreSource}</p>}
              </div>

              {/* Destination (pré-sélectionnée) */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Coffre Destination *</label>
                <select
                  value={coffreDestinationId}
                  onChange={(e) => setCoffreDestinationId(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${
                    errors.coffreDestination ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
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
                  <div className="text-xs text-slate-500">
                    Solde actuel: <span className="text-white">{formatMoney(parseFloat(coffreDestination.solde))}</span>
                    {prefilledDestinationCoffreId === coffreDestinationId && (
                      <span className="ml-2 text-amber-400">(Coffre à approvisionner)</span>
                    )}
                  </div>
                )}
                {errors.coffreDestination && <p className="text-xs text-red-400">{errors.coffreDestination}</p>}
              </div>
            </div>
          </section>

          {/* Montant */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase">Montant (XAF) *</label>
            <div className="relative">
              <input
                type="number"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0"
                className={`w-full pl-4 pr-16 py-4 bg-slate-950 border rounded-xl text-2xl font-bold text-white focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${
                  errors.montant ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">XAF</span>
            </div>
            {errors.montant && <p className="text-xs text-red-400">{errors.montant}</p>}

            {/* Validation messages */}
            {validation.errors.length > 0 && (
              <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl space-y-1">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-400 flex items-center gap-2">
                    <AlertTriangle size={12} /> {err}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* Motif */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase">Motif du transfert *</label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Décrivez la raison de ce transfert..."
              rows={2}
              className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 outline-none resize-none transition-all ${
                errors.motif ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
              }`}
            />
            {errors.motif && <p className="text-xs text-red-400">{errors.motif}</p>}
          </section>

          {/* Date */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase">Date du transfert *</label>
            <input
              type="date"
              value={dateTransfert}
              onChange={(e) => setDateTransfert(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
            />
          </section>

          {/* Conditionnement */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Conditionnement</h3>
            <div className="grid grid-cols-2 gap-2">
              {['Sac scellé', 'Mallette', 'Enveloppe', 'Autre'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeConditionnement(type)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    typeConditionnement === type
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {typeConditionnement === 'Sac scellé' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Numéro de scellé *</label>
                <input
                  type="text"
                  value={numeroScelle}
                  onChange={(e) => setNumeroScelle(e.target.value)}
                  placeholder="Ex: SC-2026-00123"
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 outline-none ${
                    errors.numeroScelle ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {errors.numeroScelle && <p className="text-xs text-red-400">{errors.numeroScelle}</p>}
              </div>
            )}
          </section>

          {/* Agents de Transport */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Agents de Transport (min. 2)
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addAgent}
                className="text-cyan-400 hover:bg-cyan-500/10"
              >
                + Ajouter
              </Button>
            </div>

            {errors.agentsTransport && (
              <p className="text-xs text-red-400 flex items-center gap-1">
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
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                    />
                    <input
                      type="text"
                      value={agent.contact}
                      onChange={(e) => updateAgent(index, 'contact', e.target.value)}
                      placeholder="Téléphone"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                    />
                  </div>
                  {agentsTransport.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAgent(index)}
                      className="text-red-400 hover:bg-red-500/10 h-10 w-10 p-0 rounded-xl"
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
        <footer className="p-5 border-t border-slate-800 bg-slate-900/95 backdrop-blur sticky bottom-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={loading}
            >
              Annuler
            </Button>
            <div className="flex-1 flex gap-3">
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, false)}
                disabled={loading || !validation.valid}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white"
              >
                Sauvegarder brouillon
              </Button>
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading || !validation.valid}
                className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20"
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
