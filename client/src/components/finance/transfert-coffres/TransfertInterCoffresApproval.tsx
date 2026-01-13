import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldX,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Building2,
  Vault,
  Clock,
  FileText,
  User,
  MessageSquare,
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
  createdAt: string;
  approvedByN1?: string;
  approvedAtN1?: string;
  approbateurN1?: { nom: string; prenom: string };
}

interface TransfertInterCoffresApprovalProps {
  transfert: TransfertInterCoffre;
  onClose: () => void;
  onComplete: () => void;
}

export default function TransfertInterCoffresApproval({
  transfert,
  onClose,
  onComplete,
}: TransfertInterCoffresApprovalProps) {
  // Determine approval level
  const approvalLevel = transfert.statut === 'Soumis' ? 1 : 2;

  // State
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);
  const [transfertDetails, setTransfertDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

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
      } finally {
        setLoadingDetails(false);
      }
    };
    loadDetails();
  }, [transfert.id]);

  // Handle approval/rejection
  const handleSubmit = async () => {
    if (!action) return;

    if (action === 'reject' && commentaire.length < 10) {
      toast.error('Le motif de rejet doit contenir au moins 10 caractères');
      return;
    }

    setLoading(true);
    const loadingId = toast.loading(
      action === 'approve'
        ? `Approbation N${approvalLevel} en cours...`
        : 'Rejet en cours...'
    );

    try {
      const data: any = { commentaire };
      if (action === 'reject') {
        data.reject = true;
        data.motifRejet = commentaire;
      }

      const result = await api.approveTransfert(transfert.id, approvalLevel as 1 | 2, data);
      toast.dismiss(loadingId);

      if (result.success) {
        toast.success(
          action === 'approve'
            ? `Transfert approuvé (Niveau ${approvalLevel})`
            : 'Transfert rejeté'
        );
        onComplete();
      } else {
        toast.error(result.error || "Erreur lors de l'opération");
      }
    } catch (error) {
      toast.dismiss(loadingId);
      toast.error("Erreur lors de l'opération");
    } finally {
      setLoading(false);
    }
  };

  const currentTransfert = transfertDetails || transfert;

  return (
    <Modal isOpen onClose={onClose} size="lg" title="">
      <div className="max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-indigo-900/30 to-slate-900/30 border-b border-indigo-700/30 rounded-t-2xl">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-indigo-500/20">
                <Shield size={24} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Approbation Niveau {approvalLevel}
                </h2>
                <p className="text-sm text-indigo-300">
                  {transfert.reference}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Level indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div
              className={`flex-1 h-2 rounded-full ${
                approvalLevel >= 1 ? 'bg-indigo-500' : 'bg-slate-700'
              }`}
            />
            <div
              className={`flex-1 h-2 rounded-full ${
                approvalLevel >= 2 ? 'bg-indigo-500' : 'bg-slate-700'
              }`}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span className={approvalLevel === 1 ? 'text-indigo-400 font-medium' : ''}>
              Niveau 1 (Responsable)
            </span>
            <span className={approvalLevel === 2 ? 'text-indigo-400 font-medium' : ''}>
              Niveau 2 (Direction)
            </span>
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

            {/* Amount */}
            <div className="text-center py-4 bg-slate-950/50 rounded-lg">
              <p className="text-3xl font-bold text-white">
                {formatMoney(parseFloat(currentTransfert.montant))}
              </p>
              <p className="text-sm text-slate-400">{currentTransfert.devise}</p>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-slate-950/30 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Date de transfert</p>
                <p className="text-sm text-white">
                  {new Date(currentTransfert.dateTransfert).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <div className="bg-slate-950/30 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Type</p>
                <p className="text-sm text-white">{currentTransfert.typeTransfert.replace(/_/g, ' → ')}</p>
              </div>
              <div className="bg-slate-950/30 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Conditionnement</p>
                <p className="text-sm text-white">{currentTransfert.typeConditionnement}</p>
              </div>
              {currentTransfert.numeroScelle && (
                <div className="bg-slate-950/30 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">N° Scellé</p>
                  <p className="text-sm text-cyan-400 font-mono">{currentTransfert.numeroScelle}</p>
                </div>
              )}
            </div>

            {/* Motif */}
            {currentTransfert.motif && (
              <div className="mt-4 p-3 bg-slate-950/30 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Motif du transfert</p>
                <p className="text-sm text-slate-300">{currentTransfert.motif}</p>
              </div>
            )}

            {/* Transport agents */}
            {currentTransfert.agentsTransport && currentTransfert.agentsTransport.length > 0 && (
              <div className="mt-4 p-3 bg-slate-950/30 rounded-lg">
                <p className="text-xs text-slate-500 mb-2">Agents de transport</p>
                <div className="flex flex-wrap gap-2">
                  {currentTransfert.agentsTransport.map((agent: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full">
                      <User size={12} className="text-slate-400" />
                      <span className="text-sm text-white">{agent.nom}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Previous Approval (for N2) */}
          {approvalLevel === 2 && currentTransfert.approbateurN1 && (
            <section className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">Approbation N1 validée</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  Par {currentTransfert.approbateurN1.prenom} {currentTransfert.approbateurN1.nom}
                </span>
                <span className="text-slate-500">
                  {currentTransfert.approvedAtN1 &&
                    new Date(currentTransfert.approvedAtN1).toLocaleString('fr-FR')}
                </span>
              </div>
            </section>
          )}

          {/* Action Selection */}
          <section>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">
              Votre décision
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAction('approve')}
                disabled={loading}
                className={`p-4 rounded-xl border-2 transition-all ${
                  action === 'approve'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                    : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <ShieldCheck size={32} className="mx-auto mb-2" />
                <p className="font-medium">Approuver</p>
                <p className="text-xs mt-1 opacity-70">Valider ce transfert</p>
              </button>

              <button
                type="button"
                onClick={() => setAction('reject')}
                disabled={loading}
                className={`p-4 rounded-xl border-2 transition-all ${
                  action === 'reject'
                    ? 'bg-red-500/10 border-red-500 text-red-400'
                    : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <ShieldX size={32} className="mx-auto mb-2" />
                <p className="font-medium">Rejeter</p>
                <p className="text-xs mt-1 opacity-70">Refuser ce transfert</p>
              </button>
            </div>
          </section>

          {/* Comment/Reason */}
          {action && (
            <section className="animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-slate-400 mb-2">
                {action === 'reject' ? 'Motif de rejet *' : 'Commentaire (optionnel)'}
              </label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={3}
                className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  action === 'reject'
                    ? 'border-red-500/30 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                    : 'border-slate-700 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                }`}
                placeholder={
                  action === 'reject'
                    ? 'Indiquez la raison du rejet (minimum 10 caractères)...'
                    : 'Ajoutez un commentaire si nécessaire...'
                }
              />
              {action === 'reject' && commentaire.length > 0 && commentaire.length < 10 && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> Minimum 10 caractères ({commentaire.length}/10)
                </p>
              )}
            </section>
          )}

          {/* Warning */}
          {action === 'approve' && approvalLevel === 2 && (
            <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">Approbation finale</p>
                <p className="text-xs text-amber-200/70 mt-1">
                  Après cette approbation, le transfert pourra être dispatché et les fonds seront débités du coffre source.
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
              disabled={!action || loading || (action === 'reject' && commentaire.length < 10)}
              className={
                action === 'approve'
                  ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500'
                  : action === 'reject'
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-slate-700'
              }
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Traitement...
                </>
              ) : action === 'approve' ? (
                <>
                  <ShieldCheck size={16} className="mr-2" />
                  Approuver N{approvalLevel}
                </>
              ) : action === 'reject' ? (
                <>
                  <ShieldX size={16} className="mr-2" />
                  Rejeter
                </>
              ) : (
                'Sélectionnez une action'
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
