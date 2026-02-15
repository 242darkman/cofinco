import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  X,
  Building2,
  ChevronDown,
  AlertTriangle,
  Loader2,
  Banknote,
  CheckCircle,
} from 'lucide-react';
import { caisseAgentApi, caisseApi } from '@/lib/api-client';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/format';
import BilletageInput, { computeBilletageTotal } from './offline/BilletageInput';
import { StatutCaisse } from '@shared/enum/status-constants';

interface CloseSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agentId: string;
  agenceId?: string;
  sessionId: string;
  soldeTheorique: number;
}

export default function CloseSessionModal({
  isOpen,
  onClose,
  onSuccess,
  agentId,
  agenceId,
  sessionId,
  soldeTheorique,
}: CloseSessionModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caisses, setCaisses] = useState<any[]>([]);
  const [billetage, setBilletage] = useState<Record<string, number>>({});
  const [destinationCaisseId, setDestinationCaisseId] = useState('');
  const [ecartJustification, setEcartJustification] = useState('');
  const [observations, setObservations] = useState('');

  const billetageTotal = computeBilletageTotal(billetage);
  const ecart = billetageTotal - soldeTheorique;
  const hasEcart = billetageTotal > 0 && ecart !== 0;
  const isDeficit = ecart < 0;

  useEffect(() => {
    if (isOpen && agenceId) {
      setLoading(true);
      caisseApi.getStatus(agenceId)
        .then((data: any[]) => {
          setCaisses((data || []).filter((c: any) => c.type === 'PHYSICAL' && c.statut === StatutCaisse.OPEN));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, agenceId]);

  const updateBilletage = useCallback((denomination: string, count: number) => {
    setBilletage(prev => ({ ...prev, [denomination]: Math.max(0, count) }));
  }, []);

  const handleSubmit = async () => {
    if (billetageTotal <= 0 && soldeTheorique > 0) {
      toast.error('Veuillez saisir le billetage physique');
      return;
    }
    if (!destinationCaisseId) {
      toast.error('Veuillez sélectionner la caisse de destination');
      return;
    }
    if (hasEcart && Math.abs(ecart) > soldeTheorique * 0.1 && !ecartJustification.trim()) {
      toast.error('Veuillez justifier l\'écart significatif');
      return;
    }

    setSubmitting(true);
    try {
      await caisseAgentApi.closeWithRemise(sessionId, {
        montantPhysique: billetageTotal,
        billetage,
        destinationCaisseId,
        observations: observations || undefined,
        ecartJustification: ecartJustification || undefined,
      });

      toast.success('Session clôturée', {
        description: `Remise de ${formatMoney(billetageTotal)} effectuée. Opérations clients validées.`,
      });

      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la clôture');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[90vh] bg-surface-base rounded-t-2xl sm:rounded-2xl border border-edge/50 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-edge/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-status-warning-bg border border-status-warning/30 flex items-center justify-center">
              <ShieldCheck size={20} className="text-status-warning" />
            </div>
            <div>
              <h2 className="text-base font-bold text-content-primary">Clôture de session</h2>
              <p className="text-[10px] text-content-muted">Remise de fin de journée</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-surface text-content-muted hover:text-content-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">

          {/* Info: operations will be validated */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-status-info-bg border border-status-info/20">
            <CheckCircle size={14} className="shrink-0 mt-0.5 text-status-info" />
            <p className="text-[11px] text-status-info leading-snug">
              La clôture validera automatiquement toutes les opérations clients en attente
              (dépôts, remboursements, tontines).
            </p>
          </div>

          {/* Theoretical balance = minimum */}
          <div className="bg-surface/40 rounded-xl p-3 border border-edge-subtle">
            <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1">Solde théorique (minimum attendu)</p>
            <p className="text-xl font-bold text-content-primary tabular-nums">
              {formatMoney(soldeTheorique)}
            </p>
          </div>

          {/* Billetage */}
          <div className="bg-surface rounded-xl border border-edge p-4 space-y-3">
            <h4 className="font-bold text-content-primary flex items-center gap-2 text-sm">
              <Banknote size={16} className="text-status-warning" />
              Comptage physique
            </h4>
            <BilletageInput billetage={billetage} onChange={updateBilletage} total={billetageTotal} />
          </div>

          {/* Ecart display */}
          {hasEcart && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border ${
              isDeficit
                ? 'bg-status-danger-bg border-status-danger/20'
                : 'bg-status-success-bg border-status-success/20'
            }`}>
              <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${isDeficit ? 'text-status-danger' : 'text-status-success'}`} />
              <div>
                <p className={`text-sm font-bold ${isDeficit ? 'text-status-danger' : 'text-status-success'}`}>
                  Écart : {ecart > 0 ? '+' : ''}{formatMoney(ecart)}
                </p>
                <p className="text-[10px] text-content-muted mt-0.5">
                  {isDeficit ? 'Déficit de caisse' : 'Surplus de caisse'}
                </p>
              </div>
            </div>
          )}

          {/* Ecart justification */}
          {hasEcart && (
            <div>
              <label className="text-[10px] font-medium text-content-muted uppercase tracking-wider mb-1.5 block">
                Justification de l'écart {Math.abs(ecart) > soldeTheorique * 0.1 ? '*' : ''}
              </label>
              <textarea
                value={ecartJustification}
                onChange={(e) => setEcartJustification(e.target.value)}
                placeholder="Expliquez l'écart..."
                className="w-full bg-surface/80 border border-edge-subtle rounded-lg px-3 py-2 text-sm text-content-primary placeholder-content-muted focus:border-status-warning focus:outline-none resize-none"
                rows={2}
              />
            </div>
          )}

          {/* Caisse destination */}
          <div>
            <label className="text-[10px] font-medium text-content-muted uppercase tracking-wider mb-1.5 block">
              Caisse de destination (retour fonds) *
            </label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <select
                value={destinationCaisseId}
                onChange={(e) => setDestinationCaisseId(e.target.value)}
                className="w-full h-11 pl-10 pr-8 rounded-lg appearance-none text-sm bg-surface/80 border border-edge-subtle text-content-primary focus:outline-none focus:ring-2 focus:ring-status-warning/20 focus:border-status-warning/50 transition-all cursor-pointer"
              >
                <option value="">Sélectionner une caisse</option>
                {caisses.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nom || c.code || c.id}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none" />
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="text-[10px] font-medium text-content-muted uppercase tracking-wider mb-1.5 block">
              Observations (optionnel)
            </label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notes de fin de journée..."
              className="w-full bg-surface/80 border border-edge-subtle rounded-lg px-3 py-2 text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none resize-none"
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-edge/50 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg font-medium transition"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loading || (billetageTotal <= 0 && soldeTheorique > 0) || !destinationCaisseId}
            className="flex-[2] py-2.5 bg-status-warning hover:bg-status-warning/90 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <ShieldCheck size={16} />
                Clôturer ({formatMoney(billetageTotal)})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
