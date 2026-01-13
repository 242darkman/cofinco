import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Building2,
  Vault,
  Clock,
  Scale,
  Hash,
  User,
  Camera,
  MessageSquare,
  Shield,
  Truck,
} from 'lucide-react';
import { Button, Badge, Modal } from '@/components/ui';
import { toast } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { transfertInterCoffresApi as api } from './TransfertInterCoffresModule';

interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  ownerId?: string;
  solde: string;
  devise: string;
  agenceNom?: string;
}

interface TransfertInterCoffre {
  id: string;
  reference: string;
  dateTransfert: string;
  coffreSourceId: string;
  coffreDestinationId: string;
  montant: string;
  devise: string;
  typeTransfert: string;
  typeConditionnement: string;
  numeroScelle?: string;
  motif: string;
  statut: string;
  agentsTransport?: Array<{ nom: string; contact: string }>;
  coffreSource?: CoffreFort;
  coffreDestination?: CoffreFort;
  dispatchedAt?: string;
}

interface TransfertInterCoffresReceptionProps {
  transfert: TransfertInterCoffre;
  onClose: () => void;
  onComplete: () => void;
}

export default function TransfertInterCoffresReception({
  transfert,
  onClose,
  onComplete,
}: TransfertInterCoffresReceptionProps) {
  // State
  const [montantRecu, setMontantRecu] = useState(transfert.montant);
  const [conforme, setConforme] = useState<boolean | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [motifEcart, setMotifEcart] = useState('');
  const [heureReception, setHeureReception] = useState(
    new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );
  const [loading, setLoading] = useState(false);
  const [transfertDetails, setTransfertDetails] = useState<any>(null);

  // Calculate ecart
  const montantAttendu = parseFloat(transfert.montant);
  const montantRecuNum = parseFloat(montantRecu) || 0;
  const ecart = montantAttendu - montantRecuNum;
  const hasEcart = Math.abs(ecart) > 0;

  // Load transfer details
  useEffect(() => {
    const loadDetails = async () => {
      try {
        const result = await api.getTransfertDetails(transfert.id);
        if (result.success) {
          setTransfertDetails(result.transfert);
        }
      } catch (error) {
        console.error('Error loading details:', error);
      }
    };
    loadDetails();
  }, [transfert.id]);

  // Auto-set conforme based on ecart
  useEffect(() => {
    if (hasEcart) {
      setConforme(false);
    } else if (montantRecuNum === montantAttendu) {
      setConforme(true);
    }
  }, [montantRecuNum, montantAttendu, hasEcart]);

  // Handle submit
  const handleSubmit = async () => {
    if (conforme === null) {
      toast.error('Veuillez indiquer si le transfert est conforme');
      return;
    }

    if (hasEcart && motifEcart.length < 10) {
      toast.error("Le motif d'écart doit contenir au moins 10 caractères");
      return;
    }

    setLoading(true);
    const loadingId = toast.loading('Réception en cours...');

    try {
      const result = await api.receiveTransfert(transfert.id, {
        montantRecu: montantRecuNum,
        conforme,
        commentaire: commentaire || undefined,
        motifEcart: hasEcart ? motifEcart : undefined,
        heureReception,
      });

      toast.dismiss(loadingId);

      if (result.success) {
        toast.success(
          conforme
            ? 'Transfert réceptionné avec succès'
            : 'Transfert réceptionné avec écart signalé'
        );
        onComplete();
      } else {
        toast.error(result.error || 'Erreur lors de la réception');
      }
    } catch (error) {
      toast.dismiss(loadingId);
      toast.error('Erreur lors de la réception');
    } finally {
      setLoading(false);
    }
  };

  const currentTransfert = transfertDetails || transfert;

  // Format transit duration
  const getTransitDuration = () => {
    if (!currentTransfert.dispatchedAt) return null;
    const dispatchDate = new Date(currentTransfert.dispatchedAt);
    const now = new Date();
    const diffMs = now.getTime() - dispatchDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      const days = Math.floor(diffHours / 24);
      return `${days}j ${diffHours % 24}h`;
    }
    return `${diffHours}h ${diffMinutes}min`;
  };

  return (
    <Modal isOpen onClose={onClose} size="lg" title="">
      <div className="max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-cyan-900/30 to-slate-900/30 border-b border-cyan-700/30 rounded-t-2xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/20">
                <Package size={24} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Réception du transfert</h2>
                <p className="text-sm text-cyan-300">{transfert.reference}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Transit info */}
          <div className="flex items-center gap-4 mt-4 p-3 bg-slate-950/30 rounded-xl">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-amber-400" />
              <span className="text-sm text-slate-400">En transit depuis</span>
            </div>
            <span className="text-sm font-medium text-white">{getTransitDuration()}</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Transfer Summary */}
          <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            {/* Route */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Building2 size={20} className="text-slate-400" />
                </div>
                <p className="text-sm text-white font-medium">
                  {currentTransfert.coffreSource?.agenceNom || currentTransfert.coffreSource?.nom || 'Source'}
                </p>
              </div>
              <ArrowRight size={20} className="text-cyan-400" />
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <Vault size={20} className="text-cyan-400" />
                </div>
                <p className="text-sm text-white font-medium">
                  {currentTransfert.coffreDestination?.agenceNom || currentTransfert.coffreDestination?.nom || 'Destination'}
                </p>
              </div>
            </div>

            {/* Expected amount */}
            <div className="text-center py-3 bg-slate-950/50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Montant attendu</p>
              <p className="text-2xl font-bold text-white">
                {formatMoney(montantAttendu)}
                <span className="text-sm text-slate-400 ml-2">{currentTransfert.devise}</span>
              </p>
            </div>

            {/* Conditionnement & Scellé */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-slate-950/30 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Conditionnement</p>
                <p className="text-sm text-white">{currentTransfert.typeConditionnement}</p>
              </div>
              {currentTransfert.numeroScelle && (
                <div className="bg-slate-950/30 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">N° Scellé à vérifier</p>
                  <p className="text-sm text-cyan-400 font-mono font-bold">
                    {currentTransfert.numeroScelle}
                  </p>
                </div>
              )}
            </div>

            {/* Transport agents */}
            {currentTransfert.agentsTransport && currentTransfert.agentsTransport.length > 0 && (
              <div className="mt-4 p-3 bg-slate-950/30 rounded-lg">
                <p className="text-xs text-slate-500 mb-2">Agents de transport</p>
                <div className="flex flex-wrap gap-2">
                  {currentTransfert.agentsTransport.map((agent: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full"
                    >
                      <User size={12} className="text-slate-400" />
                      <span className="text-sm text-white">{agent.nom}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Reception Form */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
              Informations de réception
            </h3>

            {/* Montant reçu */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Montant effectivement reçu *
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={montantRecu}
                  onChange={(e) => setMontantRecu(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-lg font-bold text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    hasEcart
                      ? 'border-orange-500/50 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                      : 'border-slate-700 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                  }`}
                  placeholder="Entrez le montant reçu"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  {currentTransfert.devise}
                </span>
              </div>

              {/* Ecart indicator */}
              {hasEcart && (
                <div className="mt-3 p-3 bg-orange-950/20 border border-orange-700/30 rounded-lg flex items-start gap-3">
                  <Scale size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-300">
                      Écart détecté: {formatMoney(Math.abs(ecart))} {currentTransfert.devise}
                    </p>
                    <p className="text-xs text-orange-200/70 mt-1">
                      {ecart > 0 ? 'Manquant' : 'Excédentaire'} par rapport au montant attendu
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Heure de réception */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Heure de réception
              </label>
              <input
                type="time"
                value={heureReception}
                onChange={(e) => setHeureReception(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none transition-colors"
              />
            </div>

            {/* Conformité */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Le transfert est-il conforme ? *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConforme(true)}
                  disabled={hasEcart}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    conforme === true
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                      : hasEcart
                      ? 'bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed'
                      : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <CheckCircle size={28} className="mx-auto mb-2" />
                  <p className="font-medium">Conforme</p>
                  <p className="text-xs mt-1 opacity-70">Tout est en ordre</p>
                </button>

                <button
                  type="button"
                  onClick={() => setConforme(false)}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    conforme === false
                      ? 'bg-orange-500/10 border-orange-500 text-orange-400'
                      : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <AlertTriangle size={28} className="mx-auto mb-2" />
                  <p className="font-medium">Non conforme</p>
                  <p className="text-xs mt-1 opacity-70">Écart ou problème</p>
                </button>
              </div>
            </div>

            {/* Motif écart (si non conforme ou écart) */}
            {(conforme === false || hasEcart) && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Motif de l'écart / non-conformité *
                </label>
                <select
                  value={motifEcart.startsWith('Autre:') ? 'autre' : motifEcart}
                  onChange={(e) => {
                    if (e.target.value === 'autre') {
                      setMotifEcart('Autre: ');
                    } else {
                      setMotifEcart(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-950 border border-orange-500/30 rounded-xl text-sm text-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-colors mb-3"
                >
                  <option value="">Sélectionnez un motif</option>
                  <option value="Scellé endommagé">Scellé endommagé</option>
                  <option value="Scellé absent ou différent">Scellé absent ou différent</option>
                  <option value="Billets manquants">Billets manquants</option>
                  <option value="Billets en excès">Billets en excès</option>
                  <option value="Billets falsifiés détectés">Billets falsifiés détectés</option>
                  <option value="Colis endommagé">Colis endommagé</option>
                  <option value="Erreur de comptage au départ">Erreur de comptage au départ</option>
                  <option value="autre">Autre motif...</option>
                </select>

                {motifEcart.startsWith('Autre:') && (
                  <textarea
                    value={motifEcart.replace('Autre: ', '')}
                    onChange={(e) => setMotifEcart('Autre: ' + e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-950 border border-orange-500/30 rounded-xl text-sm text-white placeholder-slate-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-colors"
                    placeholder="Décrivez le motif (minimum 10 caractères)..."
                  />
                )}

                {motifEcart.length > 0 && motifEcart.length < 10 && (
                  <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> Minimum 10 caractères ({motifEcart.length}/10)
                  </p>
                )}
              </div>
            )}

            {/* Commentaire */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Commentaire (optionnel)
              </label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none transition-colors"
                placeholder="Observations sur la réception..."
              />
            </div>
          </section>

          {/* Summary warning */}
          {conforme !== null && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                conforme
                  ? 'bg-emerald-950/20 border-emerald-700/30'
                  : 'bg-orange-950/20 border-orange-700/30'
              }`}
            >
              {conforme ? (
                <CheckCircle size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={20} className="text-orange-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${conforme ? 'text-emerald-300' : 'text-orange-300'}`}>
                  {conforme
                    ? 'Réception conforme'
                    : 'Réception avec anomalie'}
                </p>
                <p className={`text-xs mt-1 ${conforme ? 'text-emerald-200/70' : 'text-orange-200/70'}`}>
                  {conforme
                    ? `Le montant de ${formatMoney(montantRecuNum)} sera crédité au coffre de destination.`
                    : `Une tâche de régularisation sera créée pour l'écart de ${formatMoney(Math.abs(ecart))}.`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50">
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                loading ||
                conforme === null ||
                (hasEcart && motifEcart.length < 10) ||
                (conforme === false && motifEcart.length < 10)
              }
              className={
                conforme
                  ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500'
                  : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500'
              }
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Traitement...
                </>
              ) : (
                <>
                  <Package size={16} className="mr-2" />
                  Confirmer la réception
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
