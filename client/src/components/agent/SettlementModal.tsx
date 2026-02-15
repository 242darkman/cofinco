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
import { useIsOnline } from '@/contexts/NetworkContext';
import { addOfflineOperation } from '@/lib/offline-db';
import { v4 as uuidv4 } from 'uuid';
import { StatutCaisse } from '@shared/enum/status-constants';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agentId: string;
  agenceId?: string;
}

export default function SettlementModal({ isOpen, onClose, onSuccess, agentId, agenceId }: SettlementModalProps) {
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
        caisseApi.getStatus(agenceId),
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

  const isOnline = useIsOnline();

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

  const handleQueueSubmit = async () => {
    if (!validate(true)) return;

    const idempotencyKey = uuidv4();
    await addOfflineOperation(
      'remise',
      '/api/caisse-agent/settlement-cash',
      'POST',
      {
        agentId,
        destinationCaisseId: formData.destinationCaisseId || null,
        montant: parseFloat(formData.montant),
        observations: formData.observations,
        idempotencyKey,
      }
    );

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
      <div className="relative w-full max-w-md max-h-[90vh] bg-gradient-to-b from-surface-base to-surface-base rounded-t-2xl sm:rounded-2xl border border-edge/50 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

        {/* Header - Compact */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-edge/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-status-success/20 border border-accent/30 flex items-center justify-center">
              <ArrowUpRight size={20} className="text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold text-content-primary">Remise Caisse</h2>
              <p className="text-[10px] text-content-muted">Transférer vos fonds collectés</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">

          {/* Balance Cards - Compact Side by Side */}
          <div className="grid grid-cols-2 gap-2">
            {/* Solde Validé */}
            <div className="bg-surface/40 rounded-xl p-3 border border-edge-subtle">
              <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1">Encaissé</p>
              <p className="text-lg font-bold text-content-secondary tabular-nums">
                {soldeValide.toLocaleString('fr-FR')}
                <span className="text-[10px] font-normal text-content-muted ml-1">F</span>
              </p>
            </div>

            {/* Disponible - Hero */}
            <div className="bg-gradient-to-br from-status-success/10 to-accent/10 rounded-xl p-3 border border-status-success/30">
              <p className="text-[10px] text-status-success uppercase tracking-wider mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                Disponible
              </p>
              <p className="text-xl font-bold text-status-success tabular-nums">
                {disponible.toLocaleString('fr-FR')}
                <span className="text-xs font-normal text-status-success/60 ml-1">F</span>
              </p>
            </div>
          </div>

          {/* Pending Alert - Inline */}
          {pendingOut > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-status-warning-bg border border-status-warning/20 text-status-warning">
              <Clock size={14} className="flex-shrink-0" />
              <span className="text-xs">
                <strong>{pendingOut.toLocaleString('fr-FR')} F</strong> en attente
              </span>
            </div>
          )}

          {/* Caisse Selector */}
          {hasCaisses ? (
            <div>
              <label className="text-[10px] font-medium text-content-muted uppercase tracking-wider mb-1.5 block">
                Caisse destination
              </label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                <select
                  value={formData.destinationCaisseId}
                  onChange={(e) => {
                    setFormData({ ...formData, destinationCaisseId: e.target.value });
                    if (errors.destinationCaisseId) setErrors(prev => ({ ...prev, destinationCaisseId: '' }));
                  }}
                  className={`
                    w-full h-11 pl-10 pr-8 rounded-lg appearance-none text-sm
                    bg-surface/80 border cursor-pointer
                    ${errors.destinationCaisseId ? 'border-status-danger/50' : 'border-edge-subtle focus:border-accent/50'}
                    text-content-primary focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all
                  `}
                >
                  <option value="" className="bg-surface-base">Sélectionner...</option>
                  {caisses.map((c: any) => (
                    <option key={c.id} value={c.id} className="bg-surface-base">
                      {c.nom} {c.caissierNom ? `(${c.caissierNom})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
              </div>
              {errors.destinationCaisseId && (
                <p className="text-[10px] text-status-danger mt-1 flex items-center gap-1">
                  <AlertTriangle size={10} /> {errors.destinationCaisseId}
                </p>
              )}
            </div>
          ) : (
            /* No Caisse - Queue Mode */
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-status-warning-bg border border-status-warning/20">
              <div className="w-8 h-8 rounded-lg bg-status-warning-bg flex items-center justify-center flex-shrink-0">
                {isOnline ? <CloudOff size={16} className="text-status-warning" /> : <WifiOff size={16} className="text-status-warning" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-status-warning">
                  {isOnline ? 'Aucune caisse ouverte' : 'Mode hors ligne'}
                </p>
                <p className="text-[10px] text-status-warning/70 truncate">
                  {isOnline ? "Remise mise en file d'attente" : "Synchronisation au retour réseau"}
                </p>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="text-[10px] font-medium text-content-muted uppercase tracking-wider mb-1.5 block">
              Montant à remettre
            </label>
            <div className="relative">
              <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
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
                  bg-surface/80 border
                  ${errors.montant ? 'border-status-danger/50' : 'border-edge-subtle focus:border-accent/50'}
                  text-content-primary placeholder-content-muted
                  focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all
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
                    ? 'bg-accent/10 border border-accent/40 text-accent hover:bg-accent/10'
                    : 'bg-surface-elevated/50 text-content-muted cursor-not-allowed'
                  }
                `}
              >
                Max
              </button>
            </div>
            {errors.montant && (
              <p className="text-[10px] text-status-danger mt-1 flex items-center gap-1">
                <AlertTriangle size={10} /> {errors.montant}
              </p>
            )}
          </div>

          {/* Notes - Collapsible */}
          <details className="group">
            <summary className="text-[10px] font-medium text-content-muted uppercase tracking-wider cursor-pointer flex items-center gap-1 select-none">
              <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
              Observations (optionnel)
            </summary>
            <textarea
              value={formData.observations}
              onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              placeholder="Notes..."
              rows={2}
              className="mt-2 w-full px-3 py-2 rounded-lg text-sm bg-surface/50 border border-edge-subtle text-content-primary placeholder-content-muted focus:outline-none focus:border-accent/50 resize-none"
            />
          </details>
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 p-4 border-t border-edge/50 bg-surface-base/80 backdrop-blur-sm">
          {/* Preview */}
          {montantNum > 0 && (
            <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
              <span className="text-xs text-accent">À remettre</span>
              <span className="text-lg font-bold text-accent tabular-nums">
                {montantNum.toLocaleString('fr-FR')} <span className="text-xs">F</span>
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-12 rounded-xl font-semibold text-content-muted bg-surface/50 hover:bg-surface border border-edge-subtle transition-all disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disponible <= 0 || submitting || montantNum <= 0}
              className={`
                flex-[2] h-12 rounded-xl font-semibold text-content-primary
                flex items-center justify-center gap-2 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]
                ${canSubmitNormally
                  ? 'bg-gradient-to-r from-accent to-status-success hover:from-accent hover:to-status-success shadow-lg shadow-accent/20'
                  : 'bg-gradient-to-r from-status-warning to-status-warning hover:from-status-warning hover:to-status-warning shadow-lg shadow-status-warning/20'
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
