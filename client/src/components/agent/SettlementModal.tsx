import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  CheckCircle,
  AlertTriangle,
  Building2,
  ArrowUpRight,
  Clock,
  X,
  WifiOff,
  CloudOff,
  ChevronDown,
  Send,
} from 'lucide-react';
import { caisseAgentApi, caisseApi } from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { v4 as uuidv4 } from 'uuid';
import { StatutCaisse } from '@shared/enum/status-constants';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agentId: string;
}

export default function SettlementModal({ isOpen, onClose, onSuccess, agentId }: SettlementModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caisses, setCaisses] = useState<any[]>([]);
  const [agentSummary, setAgentSummary] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    destinationCaisseId: '',
    montant: '',
    observations: ''
  });

  useEffect(() => {
    if (isOpen && agentId) {
      loadData();
    }
  }, [isOpen, agentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [caissesData, summary] = await Promise.all([
        caisseApi.getStatus(),
        caisseAgentApi.getCaisseSummary(agentId)
      ]);
      setCaisses(caissesData.filter((c: any) => c.statut === StatutCaisse.OPEN));
      setAgentSummary(summary);
    } catch (error) {
      console.error('Erreur chargement données settlement:', error);
      toast({
        title: t('erreur'),
        description: "Impossible de charger les caisses disponibles.",
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const validate = (allowQueue = false) => {
    const newErrors: Record<string, string> = {};

    if (!formData.destinationCaisseId && !allowQueue) {
      newErrors.destinationCaisseId = "Sélectionnez une caisse";
    }

    const montantNum = parseFloat(formData.montant);
    if (!formData.montant || isNaN(montantNum) || montantNum <= 0) {
      newErrors.montant = "Montant invalide";
    } else if (agentSummary && montantNum > parseFloat(agentSummary.disponible)) {
      newErrors.montant = `Dépasse le solde (${Number(agentSummary.disponible).toLocaleString()} F)`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const { isOnline, addToQueue, pendingCount } = useOfflineQueue();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!hasCaisses || !isOnline) {
      handleQueueSubmit();
      return;
    }

    if (!validate()) return;

    setSubmitting(true);
    try {
      const idempotencyKey = uuidv4();
      await caisseAgentApi.createSettlementCash({
        agentId,
        destinationCaisseId: formData.destinationCaisseId,
        montant: parseFloat(formData.montant),
        observations: formData.observations,
        idempotencyKey
      });

      toast({
        title: t('succes'),
        description: "Demande de remise envoyée.",
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || t('operationEchouee'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQueueSubmit = () => {
    if (!validate(true)) return;

    const idempotencyKey = uuidv4();
    addToQueue('SETTLEMENT_CASH', {
      agentId,
      destinationCaisseId: formData.destinationCaisseId || null,
      montant: parseFloat(formData.montant),
      observations: formData.observations,
      idempotencyKey,
      queuedAt: new Date().toISOString()
    });

    toast({
      title: "Remise en file d'attente",
      description: isOnline
        ? "Sera traitée dès qu'une caisse sera ouverte."
        : "Sera synchronisée au retour du réseau.",
    });

    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  // Fix: use soldeValide instead of valide
  const disponible = agentSummary ? parseFloat(agentSummary.disponible || '0') : 0;
  const soldeValide = agentSummary ? parseFloat(agentSummary.soldeValide || '0') : 0;
  const pendingOut = agentSummary ? parseFloat(agentSummary.pendingOut || '0') : 0;
  const hasCaisses = caisses.length > 0;
  const canSubmitNormally = hasCaisses && isOnline;
  const montantNum = parseFloat(formData.montant) || 0;

  const handleMaxClick = () => {
    if (disponible > 0) {
      setFormData(prev => ({ ...prev, montant: disponible.toString() }));
      if (errors.montant) setErrors(prev => ({ ...prev, montant: '' }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[90vh] bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-2xl sm:rounded-2xl border border-slate-800/50 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

        {/* Header - Compact */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center">
              <ArrowUpRight size={20} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Remise Caisse</h2>
              <p className="text-[10px] text-slate-500">Transférer vos fonds collectés</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">

          {/* Balance Cards - Compact Side by Side */}
          <div className="grid grid-cols-2 gap-2">
            {/* Solde Validé */}
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Encaissé</p>
              <p className="text-lg font-bold text-slate-300 tabular-nums">
                {soldeValide.toLocaleString('fr-FR')}
                <span className="text-[10px] font-normal text-slate-500 ml-1">F</span>
              </p>
            </div>

            {/* Disponible - Hero */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-xl p-3 border border-emerald-500/30">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Disponible
              </p>
              <p className="text-xl font-bold text-emerald-400 tabular-nums">
                {disponible.toLocaleString('fr-FR')}
                <span className="text-xs font-normal text-emerald-400/60 ml-1">F</span>
              </p>
            </div>
          </div>

          {/* Pending Alert - Inline */}
          {pendingOut > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock size={14} className="flex-shrink-0" />
              <span className="text-xs">
                <strong>{pendingOut.toLocaleString('fr-FR')} F</strong> en attente
              </span>
            </div>
          )}

          {/* Caisse Selector */}
          {hasCaisses ? (
            <div>
              <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">
                Caisse destination
              </label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select
                  value={formData.destinationCaisseId}
                  onChange={(e) => {
                    setFormData({ ...formData, destinationCaisseId: e.target.value });
                    if (errors.destinationCaisseId) setErrors(prev => ({ ...prev, destinationCaisseId: '' }));
                  }}
                  className={`
                    w-full h-11 pl-10 pr-8 rounded-lg appearance-none text-sm
                    bg-slate-800/80 border cursor-pointer
                    ${errors.destinationCaisseId ? 'border-red-500/50' : 'border-slate-700/50 focus:border-cyan-500/50'}
                    text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all
                  `}
                >
                  <option value="" className="bg-slate-900">Sélectionner...</option>
                  {caisses.map((c: any) => (
                    <option key={c.id} value={c.id} className="bg-slate-900">
                      {c.nom} {c.caissierNom ? `(${c.caissierNom})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
              {errors.destinationCaisseId && (
                <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                  <AlertTriangle size={10} /> {errors.destinationCaisseId}
                </p>
              )}
            </div>
          ) : (
            /* No Caisse - Queue Mode */
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                {isOnline ? <CloudOff size={16} className="text-amber-400" /> : <WifiOff size={16} className="text-amber-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-300">
                  {isOnline ? 'Aucune caisse ouverte' : 'Mode hors ligne'}
                </p>
                <p className="text-[10px] text-amber-400/70 truncate">
                  {isOnline ? "Remise mise en file d'attente" : "Synchronisation au retour réseau"}
                </p>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">
              Montant à remettre
            </label>
            <div className="relative">
              <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="number"
                inputMode="numeric"
                value={formData.montant}
                onChange={(e) => {
                  setFormData({ ...formData, montant: e.target.value });
                  if (errors.montant) setErrors(prev => ({ ...prev, montant: '' }));
                }}
                placeholder="0"
                max={disponible}
                className={`
                  w-full h-12 pl-10 pr-20 rounded-xl text-lg font-bold
                  bg-slate-800/80 border
                  ${errors.montant ? 'border-red-500/50' : 'border-slate-700/50 focus:border-cyan-500/50'}
                  text-white placeholder-slate-600
                  focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                `}
              />
              <button
                type="button"
                onClick={handleMaxClick}
                disabled={disponible <= 0}
                className={`
                  absolute right-2 top-1/2 -translate-y-1/2
                  px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase
                  transition-all active:scale-95
                  ${disponible > 0
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  }
                `}
              >
                Max
              </button>
            </div>
            {errors.montant && (
              <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                <AlertTriangle size={10} /> {errors.montant}
              </p>
            )}
          </div>

          {/* Notes - Collapsible */}
          <details className="group">
            <summary className="text-[10px] font-medium text-slate-500 uppercase tracking-wider cursor-pointer flex items-center gap-1 select-none">
              <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
              Observations (optionnel)
            </summary>
            <textarea
              value={formData.observations}
              onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              placeholder="Notes..."
              rows={2}
              className="mt-2 w-full px-3 py-2 rounded-lg text-sm bg-slate-800/50 border border-slate-700/30 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-none"
            />
          </details>
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 p-4 border-t border-slate-800/50 bg-slate-900/80 backdrop-blur-sm">
          {/* Preview */}
          {montantNum > 0 && (
            <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <span className="text-xs text-cyan-300">À remettre</span>
              <span className="text-lg font-bold text-cyan-400 tabular-nums">
                {montantNum.toLocaleString('fr-FR')} <span className="text-xs">F</span>
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-12 rounded-xl font-semibold text-slate-400 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disponible <= 0 || submitting || montantNum <= 0}
              className={`
                flex-[2] h-12 rounded-xl font-semibold text-white
                flex items-center justify-center gap-2 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
                ${canSubmitNormally
                  ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 shadow-lg shadow-cyan-500/20'
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-500/20'
                }
              `}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {canSubmitNormally ? <Send size={18} /> : <CloudOff size={18} />}
                  {canSubmitNormally ? 'Confirmer' : 'File d\'attente'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
