import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldX,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Building2,
  Vault,
  User,
  MessageSquare,
  Calendar,
  Tag,
  Package,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui';
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

  // Determine step statuses for stepper
  const getStepStatus = (step: number) => {
    if (step < approvalLevel) return 'completed';
    if (step === approvalLevel) return 'active';
    return 'inactive';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="
            pointer-events-auto
            w-full max-w-3xl lg:max-w-4xl
            bg-slate-900 border border-slate-700/50 rounded-2xl
            shadow-2xl shadow-black/50
            flex flex-col
            max-h-[90vh]
            animate-in fade-in zoom-in-95 duration-200
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* ═══════════════════════════════════════════════════════════════════
              HEADER & STEPPER
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-shrink-0 p-6 bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-b border-slate-700/50 rounded-t-2xl">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30">
                  <Shield size={28} className="text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Approbation Niveau {approvalLevel}
                  </h2>
                  <p className="text-sm text-slate-400 font-mono mt-0.5">
                    {transfert.reference}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700/50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Stepper - Full Width Progress */}
            <div className="flex items-center gap-3">
              {/* Step 1 */}
              <div className="flex-1">
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    getStepStatus(1) === 'completed'
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : getStepStatus(1) === 'active'
                      ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 animate-pulse'
                      : 'bg-slate-700'
                  }`}
                />
                <p
                  className={`text-xs mt-2 font-medium ${
                    getStepStatus(1) === 'completed'
                      ? 'text-emerald-400'
                      : getStepStatus(1) === 'active'
                      ? 'text-cyan-400'
                      : 'text-slate-500'
                  }`}
                >
                  {getStepStatus(1) === 'completed' && <CheckCircle size={12} className="inline mr-1 -mt-0.5" />}
                  Niveau 1 (Responsable)
                </p>
              </div>

              {/* Connector */}
              <div className="w-8 h-0.5 bg-slate-700 mt-[-1rem]" />

              {/* Step 2 */}
              <div className="flex-1">
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    getStepStatus(2) === 'completed'
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      : getStepStatus(2) === 'active'
                      ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 animate-pulse'
                      : 'bg-slate-700'
                  }`}
                />
                <p
                  className={`text-xs mt-2 font-medium text-right ${
                    getStepStatus(2) === 'completed'
                      ? 'text-emerald-400'
                      : getStepStatus(2) === 'active'
                      ? 'text-cyan-400'
                      : 'text-slate-500'
                  }`}
                >
                  Niveau 2 (Direction)
                  {getStepStatus(2) === 'completed' && <CheckCircle size={12} className="inline ml-1 -mt-0.5" />}
                </p>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SCROLLABLE CONTENT (single overflow container)
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ─────────────────────────────────────────────────────────────────
                HERO SECTION - Transfer Visualization
            ───────────────────────────────────────────────────────────────── */}
            <section className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
              {/* Transfer Flow - Horizontal */}
              <div className="flex items-center justify-center gap-4 sm:gap-8 mb-6">
                {/* Source */}
                <div className="text-center flex-shrink-0">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center shadow-lg">
                    <Building2 size={32} className="text-slate-300" />
                  </div>
                  <p className="text-sm sm:text-base text-white font-semibold max-w-[120px] sm:max-w-[160px] truncate">
                    {currentTransfert.coffreSource?.nom || 'Coffre Source'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentTransfert.coffreSource?.agenceNom || 'Source'}
                  </p>
                </div>

                {/* Animated Arrow */}
                <div className="flex-shrink-0 relative">
                  <div className="w-16 sm:w-24 h-1 bg-gradient-to-r from-cyan-500/50 via-cyan-400 to-cyan-500/50 rounded-full" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="p-2 rounded-full bg-cyan-500/20 border border-cyan-500/40 animate-pulse">
                      <ArrowRightLeft size={20} className="text-cyan-400" />
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="text-center flex-shrink-0">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 border border-cyan-600/50 flex items-center justify-center shadow-lg shadow-cyan-500/10">
                    <Vault size={32} className="text-cyan-400" />
                  </div>
                  <p className="text-sm sm:text-base text-white font-semibold max-w-[120px] sm:max-w-[160px] truncate">
                    {currentTransfert.coffreDestination?.nom || 'Coffre Destination'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentTransfert.coffreDestination?.agenceNom || 'Destination'}
                  </p>
                </div>
              </div>

              {/* Amount - Massive & Centered */}
              <div className="text-center py-6 bg-slate-950/60 rounded-xl border border-slate-800">
                <p className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight">
                  {formatMoney(parseFloat(currentTransfert.montant))}
                </p>
                <p className="text-sm sm:text-base text-slate-400 mt-2 font-medium uppercase tracking-wider">
                  {currentTransfert.devise}
                </p>
              </div>
            </section>

            {/* ─────────────────────────────────────────────────────────────────
                INFORMATION GRID - Responsive 3 columns
            ───────────────────────────────────────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Date de transfert */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Calendar size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Date de transfert</p>
                  <p className="text-base text-white font-medium">
                    {new Date(currentTransfert.dateTransfert).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Type */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Tag size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Type</p>
                  <p className="text-base text-white font-medium">
                    {currentTransfert.typeTransfert.replace(/_/g, ' → ')}
                  </p>
                </div>
              </div>

              {/* Conditionnement */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Package size={18} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Conditionnement</p>
                  <p className="text-base text-white font-medium">{currentTransfert.typeConditionnement}</p>
                </div>
              </div>

              {/* N° Scellé (if exists) */}
              {currentTransfert.numeroScelle && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Lock size={18} className="text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">N° Scellé</p>
                    <p className="text-base text-cyan-400 font-mono font-medium">{currentTransfert.numeroScelle}</p>
                  </div>
                </div>
              )}

              {/* Motif (spans full width on larger screens) */}
              {currentTransfert.motif && (
                <div className="sm:col-span-2 lg:col-span-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    <MessageSquare size={18} className="text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Motif du transfert</p>
                    <p className="text-base text-slate-300">{currentTransfert.motif}</p>
                  </div>
                </div>
              )}
            </section>

            {/* Transport agents */}
            {currentTransfert.agentsTransport && currentTransfert.agentsTransport.length > 0 && (
              <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Agents de transport</p>
                <div className="flex flex-wrap gap-2">
                  {currentTransfert.agentsTransport.map((agent: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-full border border-slate-600/50">
                      <User size={14} className="text-slate-400" />
                      <span className="text-sm text-white font-medium">{agent.nom}</span>
                      {agent.contact && (
                        <span className="text-xs text-slate-500">({agent.contact})</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Previous Approval (for N2) */}
            {approvalLevel === 2 && currentTransfert.approbateurN1 && (
              <section className="bg-emerald-950/30 border border-emerald-700/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <CheckCircle size={18} className="text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-emerald-300">Approbation N1 validée</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm ml-11">
                  <span className="text-slate-300">
                    Par <span className="text-white font-medium">{currentTransfert.approbateurN1.prenom} {currentTransfert.approbateurN1.nom}</span>
                  </span>
                  <span className="text-slate-500">
                    {currentTransfert.approvedAtN1 &&
                      new Date(currentTransfert.approvedAtN1).toLocaleString('fr-FR')}
                  </span>
                </div>
              </section>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                ACTION SELECTION
            ───────────────────────────────────────────────────────────────── */}
            <section>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Votre décision
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setAction('approve')}
                  disabled={loading}
                  className={`p-5 rounded-xl border-2 transition-all duration-200 ${
                    action === 'approve'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  <ShieldCheck size={36} className="mx-auto mb-3" />
                  <p className="font-semibold text-lg">Approuver</p>
                  <p className="text-xs mt-1 opacity-70">Valider ce transfert</p>
                </button>

                <button
                  type="button"
                  onClick={() => setAction('reject')}
                  disabled={loading}
                  className={`p-5 rounded-xl border-2 transition-all duration-200 ${
                    action === 'reject'
                      ? 'bg-red-500/15 border-red-500 text-red-400 shadow-lg shadow-red-500/10'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800'
                  }`}
                >
                  <ShieldX size={36} className="mx-auto mb-3" />
                  <p className="font-semibold text-lg">Rejeter</p>
                  <p className="text-xs mt-1 opacity-70">Refuser ce transfert</p>
                </button>
              </div>
            </section>

            {/* Comment/Reason */}
            {action && (
              <section className="animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm font-semibold text-slate-400 mb-3">
                  {action === 'reject' ? 'Motif de rejet *' : 'Commentaire (optionnel)'}
                </label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={3}
                  className={`w-full px-4 py-3 bg-slate-950 border-2 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
                    action === 'reject'
                      ? 'border-red-500/40 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                      : 'border-slate-700 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10'
                  }`}
                  placeholder={
                    action === 'reject'
                      ? 'Indiquez la raison du rejet (minimum 10 caractères)...'
                      : 'Ajoutez un commentaire si nécessaire...'
                  }
                />
                {action === 'reject' && commentaire.length > 0 && commentaire.length < 10 && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Minimum 10 caractères ({commentaire.length}/10)
                  </p>
                )}
              </section>
            )}

            {/* Warning for N2 */}
            {action === 'approve' && approvalLevel === 2 && (
              <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-4 flex items-start gap-4">
                <div className="p-2 rounded-lg bg-amber-500/20 flex-shrink-0">
                  <AlertTriangle size={20} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-300">Approbation finale</p>
                  <p className="text-sm text-amber-200/70 mt-1">
                    Après cette approbation, le transfert pourra être dispatché et les fonds seront débités du coffre source.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              STICKY FOOTER - Action Buttons
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="flex-shrink-0 p-6 border-t border-slate-700/50 bg-slate-900/95 backdrop-blur rounded-b-2xl">
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={loading}
                className="sm:min-w-[120px]"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!action || loading || (action === 'reject' && commentaire.length < 10)}
                className={`sm:min-w-[180px] ${
                  action === 'approve'
                    ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/20'
                    : action === 'reject'
                    ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/20'
                    : 'bg-slate-700'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Traitement...
                  </>
                ) : action === 'approve' ? (
                  <>
                    <ShieldCheck size={18} className="mr-2" />
                    Approuver N{approvalLevel}
                  </>
                ) : action === 'reject' ? (
                  <>
                    <ShieldX size={18} className="mr-2" />
                    Rejeter
                  </>
                ) : (
                  'Sélectionnez une action'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
