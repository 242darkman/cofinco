import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DecisionComite, DecisionComiteType } from '@shared/enum/status-constants';
import { formatMoney } from '@/lib/format';

interface DecisionModalProps {
  reevaluationId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DECISION_OPTIONS = [
  { value: DecisionComite.APPROVED, label: 'Approuver', active: 'bg-status-success-bg border-status-success/50 text-status-success' },
  { value: DecisionComite.REDUCED_AMOUNT, label: 'Réduire', active: 'bg-status-warning-bg border-status-warning/50 text-status-warning' },
  { value: DecisionComite.REJECTED, label: 'Rejeter', active: 'bg-status-danger-bg border-status-danger/50 text-status-danger' },
] as const;

export function DecisionModal({ reevaluationId, onClose, onSuccess }: DecisionModalProps) {
  const [decision, setDecision] = useState<DecisionComiteType>(DecisionComite.APPROVED);
  const [montantApprouve, setMontantApprouve] = useState<number | undefined>();
  const [commentaire, setCommentaire] = useState('');
  const [conditionsSpeciales, setConditionsSpeciales] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (commentaire.length < 10) {
      toast.error('Le commentaire doit contenir au moins 10 caractères');
      return;
    }

    if (decision === DecisionComite.REDUCED_AMOUNT && !montantApprouve) {
      toast.error('Veuillez spécifier le montant approuvé');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/reevaluations/${reevaluationId}/committee-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          decision,
          montantApprouve: decision === DecisionComite.APPROVED ? undefined : montantApprouve,
          commentaire,
          membresPresents: [],
          conditionsSpeciales: conditionsSpeciales || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || "Erreur lors de l'enregistrement");
      }

      if (decision === DecisionComite.APPROVED) {
        toast.success('Réévaluation approuvée ! Le crédit peut être décaissé.');
      } else if (decision === DecisionComite.REDUCED_AMOUNT) {
        toast.success(`Réévaluation approuvée avec montant réduit: ${formatMoney(montantApprouve!)}`);
      } else {
        toast.error('Réévaluation rejetée définitivement.');
      }

      onSuccess();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-base rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="p-6 border-b border-edge">
          <h3 className="text-xl font-bold text-content-primary flex items-center gap-2">
            <Users className="text-status-warning" size={24} />
            Décision du Comité
          </h3>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Decision type */}
          <div>
            <label className="text-sm text-content-muted mb-2 block">Décision</label>
            <div className="grid grid-cols-3 gap-2">
              {DECISION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDecision(opt.value)}
                  className={`px-4 py-3 rounded-lg border transition ${
                    decision === opt.value
                      ? opt.active
                      : 'bg-surface border-edge text-content-secondary hover:border-edge-strong'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Montant if reduced */}
          {decision === DecisionComite.REDUCED_AMOUNT && (
            <div>
              <label className="text-sm text-content-muted mb-2 block">Montant approuvé</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={montantApprouve || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setMontantApprouve(v ? parseFloat(v) : undefined);
                }}
                placeholder="Montant en FCFA"
                className="w-full bg-surface border border-edge rounded-lg px-4 py-3 text-content-primary focus:outline-none focus:border-status-warning"
              />
            </div>
          )}

          {/* Commentaire */}
          <div>
            <label className="text-sm text-content-muted mb-2 block">Commentaire du comité *</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Justification de la décision (min 10 caractères)..."
              rows={3}
              className="w-full bg-surface border border-edge rounded-lg px-4 py-3 text-content-primary focus:outline-none focus:border-accent"
            />
            <div className={`text-xs mt-1 ${commentaire.length >= 10 ? 'text-status-success' : 'text-content-muted'}`}>
              {commentaire.length}/10 caractères minimum
            </div>
          </div>

          {/* Conditions spéciales */}
          {decision !== DecisionComite.REJECTED && (
            <div>
              <label className="text-sm text-content-muted mb-2 block">Conditions spéciales (optionnel)</label>
              <input
                type="text"
                value={conditionsSpeciales}
                onChange={(e) => setConditionsSpeciales(e.target.value)}
                placeholder="Ex: Garantie supplémentaire requise..."
                className="w-full bg-surface border border-edge rounded-lg px-4 py-3 text-content-primary focus:outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-edge flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-surface-elevated hover:bg-surface-subtle text-content-primary rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || commentaire.length < 10}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 disabled:opacity-50 ${
              decision === DecisionComite.REJECTED
                ? 'bg-status-danger hover:bg-status-danger text-white'
                : 'bg-status-success hover:bg-status-success text-white'
            }`}
          >
            {submitting ? <Spinner size="sm" tone="current" /> : <CheckCircle size={18} />}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
