import React, { useState, useMemo } from 'react';
import { X, CheckCircle, AlertCircle, FileText, User, DollarSign, Calendar, Shield } from 'lucide-react';
import { creditApi, demandeCreditApi } from '../../../lib/api-client';
import { usePermissions } from '../../auth/ProtectedFeature';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Button } from '../../ui';

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
  const canDisburse = hasPermission('credits', 'approve'); // Using approve permission for disbursement as well

  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  const handleDisbursement = async () => {
    setLoading(true);
    try {
      const numeroSequence = Date.now().toString().slice(-8);
      const numeroCredit = `CRD-${numeroSequence}`;

      const dateDeblocage = new Date();
      const frequence = demande.frequence_remboursement;
      const joursTotal = convertDureeEnJours(demande.duree_valeur, demande.duree_unite);
      
      const datePremiereEcheance = new Date(dateDeblocage);
      if (frequence === 'Journalier') {
          datePremiereEcheance.setDate(datePremiereEcheance.getDate() + 1);
      } else if (frequence === 'Hebdomadaire') {
          datePremiereEcheance.setDate(datePremiereEcheance.getDate() + 7);
      } else {
          datePremiereEcheance.setMonth(datePremiereEcheance.getMonth() + 1);
      }

      const dateDerniereEcheance = new Date(dateDeblocage);
      dateDerniereEcheance.setDate(dateDerniereEcheance.getDate() + joursTotal);

      // Create Active Credit
      const creditData = {
        clientId: demande.client_id,
        montant: demande.montant_approuve || demande.montant_demande,
        taux: demande.taux_interet,
        duree: nombreEcheancesCalc,
        typeCredit: demande.type_credit || 'Standard',
        objetCredit: demande.objet_credit,
        statut: 'Actif',
        echeance: frequence,
        dateDebut: dateDeblocage.toISOString().split('T')[0],
        dateFin: dateDerniereEcheance.toISOString().split('T')[0],
        dateSolvabilite: dateDerniereEcheance.toISOString().split('T')[0],
        soldeRestant: montantTotal,
        numero_credit: numeroCredit,
        demande_id: demande.id,
        montant_total: montantTotal,
        montant_echeance: mensualite,
        date_premiere_echeance: datePremiereEcheance.toISOString().split('T')[0],
        // Note: Guarantees and other details would be carried over from approval if needed, 
        // but for now we assume they are handled or not strictly required for disbursement step logic unless we fetch them.
        // In a real scenario, we might want to fetch the "Approuvée" state details if they stored temp guarantees.
      };

      await creditApi.create(creditData);
      await demandeCreditApi.update(demande.id, { statut: 'Décaissée' }); // or 'Décaissée' depending on exact enum match

      toast.success(`Crédit ${numeroCredit} décaissé avec succès`);
      onSuccess();
    } catch (error) {
      handleApiError(error, "Erreur lors du décaissement");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl">
          <div className="p-6 border-b border-slate-700 flex justify-between items-center">
             <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                   <DollarSign className="text-emerald-400" /> Commission Crédit - Décaissement
                </h2>
                <p className="text-slate-400 text-sm mt-1">Validation finale pour décaissement des fonds</p>
             </div>
             <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
          </div>

          <div className="p-6 space-y-6">
             <div className="bg-slate-700/50 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                <div>
                   <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Bénéficiaire</h3>
                   <p className="text-white font-semibold text-lg">{demande.clients.nom} {demande.clients.prenom}</p>
                   <p className="text-slate-400">{demande.clients.phone}</p>
                </div>
                <div>
                   <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Crédit Approuvé</h3>
                   <p className="text-emerald-400 font-bold text-2xl">{formatMoney(demande.montant_approuve || demande.montant_demande)}</p>
                   <p className="text-slate-300 text-sm">{nombreEcheancesCalc} échéances de {formatMoney(mensualite)}</p>
                </div>
             </div>

             <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={onClose} className="flex-1">Annuler</Button>
                {canDisburse ? (
                  <Button variant="primary" onClick={() => setShowConfirm(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-500">
                     Décaisser les fonds
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
        message={`Confirmez-vous le décaissement immédiat de ${formatMoney(demande.montant_approuve || demande.montant_demande)} pour ce client ? Un crédit actif sera créé.`}
        confirmText="Confirmer et Décaisser"
        onConfirm={handleDisbursement}
        onClose={() => setShowConfirm(false)}
        variant="success"
      />
    </>
  );
}
