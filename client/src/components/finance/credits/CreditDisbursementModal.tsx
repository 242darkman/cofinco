import React, { useState, useMemo } from 'react';
import { X, AlertCircle, DollarSign, Calendar, Wallet, Clock } from 'lucide-react';
import { creditApi } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Button, FormField } from '../../ui';

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

interface CreditDisbursementModalProps {
  demande: Demande;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreditDisbursementModal({ demande, onClose, onSuccess }: CreditDisbursementModalProps) {
  const { hasPermission } = usePermissions();
  const canDisburse = hasPermission('credits', 'approve');

  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const handleDisbursement = async () => {
    setLoading(true);
    try {
      // Appeler la nouvelle API de décaissement qui:
      // 1. Crée le crédit
      // 2. Crédite le compte courant du client
      // 3. Crée le mouvement financier dans le ledger
      // 4. Met à jour le statut de la demande
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
    } catch (error) {
      handleApiError(error, "Erreur lors du décaissement");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const montantDecaissement = demande.montant_approuve || demande.montant_demande;

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
                <p className="text-white font-semibold text-lg">{demande.clients.nom} {demande.clients.prenom}</p>
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
