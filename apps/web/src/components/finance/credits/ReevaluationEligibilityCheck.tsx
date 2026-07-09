import React, { useEffect, useState, useRef } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

interface EligibilityResult {
  estEligible: boolean;
  delaiOk: boolean;
  nombreOk: boolean;
  motifBlackliste: boolean;
  reevaluationEnCours: boolean;
  joursDepuisRejet: number;
  delaiMinimum: number;
  nombreReevaluations: number;
  maxAutorise: number;
  motifRefus?: string;
}

interface Props {
  demandeId: string;
  onEligibilityChange?: (eligible: boolean) => void;
}

export function ReevaluationEligibilityCheck({ demandeId, onEligibilityChange }: Props) {
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to store callback to avoid re-fetching when callback changes
  const onEligibilityChangeRef = useRef(onEligibilityChange);
  useEffect(() => {
    onEligibilityChangeRef.current = onEligibilityChange;
  }, [onEligibilityChange]);

  useEffect(() => {
    const checkEligibility = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/demandes/${demandeId}/reevaluation-eligibility`, {
          credentials: 'include'
        });
        const data = await response.json();

        if (data.success) {
          setEligibility(data);
          onEligibilityChangeRef.current?.(data.estEligible);
        } else {
          setError(data.error?.message || 'Erreur lors de la vérification');
        }
      } catch (err) {
        setError('Erreur de connexion');
      } finally {
        setLoading(false);
      }
    };

    if (demandeId) {
      checkEligibility();
    }
  }, [demandeId]);

  if (loading) {
    return (
      <div className="animate-pulse h-20 bg-surface-elevated/50 rounded-lg mt-3 flex items-center justify-center">
        <Loader2 className="animate-spin text-content-muted" size={20} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 p-2 bg-status-danger-bg border border-status-danger/30 rounded-lg">
        <p className="text-xs text-status-danger">{error}</p>
      </div>
    );
  }

  if (!eligibility) return null;

  const StatusIcon = ({ ok }: { ok: boolean }) => (
    ok ? (
      <Check size={14} className="text-status-success" />
    ) : (
      <X size={14} className="text-status-danger" />
    )
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="text-sm font-medium text-content-secondary">Vérification d'éligibilité:</div>
      
      <div className="grid grid-cols-3 gap-2">
        {/* Délai */}
        <div className={`p-2 rounded-lg text-center ${
          eligibility.delaiOk 
            ? 'bg-status-success-bg border border-status-success/30' 
            : 'bg-status-danger-bg border border-status-danger/30'
        }`}>
          <div className="flex justify-center">
            <StatusIcon ok={eligibility.delaiOk} />
          </div>
          <div className="text-xs text-content-muted mt-1">Délai</div>
          <div className={`text-sm font-bold ${
            eligibility.delaiOk ? 'text-status-success' : 'text-status-danger'
          }`}>
            {eligibility.delaiMinimum > 0 
              ? `${eligibility.joursDepuisRejet}j / ${eligibility.delaiMinimum}j` 
              : 'Immédiat'}
          </div>
        </div>
        
        {/* Nombre réévaluations */}
        <div className={`p-2 rounded-lg text-center ${
          eligibility.nombreOk 
            ? 'bg-status-success-bg border border-status-success/30' 
            : 'bg-status-danger-bg border border-status-danger/30'
        }`}>
          <div className="flex justify-center">
            <StatusIcon ok={eligibility.nombreOk} />
          </div>
          <div className="text-xs text-content-muted mt-1">Tentatives</div>
          <div className={`text-sm font-bold ${
            eligibility.nombreOk ? 'text-status-success' : 'text-status-danger'
          }`}>
            {eligibility.nombreReevaluations} / {eligibility.maxAutorise}
          </div>
        </div>
        
        {/* Motif */}
        <div className={`p-2 rounded-lg text-center ${
          !eligibility.motifBlackliste 
            ? 'bg-status-success-bg border border-status-success/30' 
            : 'bg-status-danger-bg border border-status-danger/30'
        }`}>
          <div className="flex justify-center">
            <StatusIcon ok={!eligibility.motifBlackliste} />
          </div>
          <div className="text-xs text-content-muted mt-1">Motif</div>
          <div className={`text-sm font-bold ${
            !eligibility.motifBlackliste ? 'text-status-success' : 'text-status-danger'
          }`}>
            {!eligibility.motifBlackliste ? 'Éligible' : 'Bloqué'}
          </div>
        </div>
      </div>

      {eligibility.reevaluationEnCours && (
        <div className="p-2 bg-status-info-bg border border-status-info/30 rounded-lg">
          <p className="text-xs text-status-info flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Une réévaluation est déjà en cours
          </p>
        </div>
      )}
    </div>
  );
}

export default ReevaluationEligibilityCheck;
