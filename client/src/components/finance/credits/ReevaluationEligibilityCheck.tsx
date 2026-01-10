import React, { useEffect, useState } from 'react';
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
          onEligibilityChange?.(data.estEligible);
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
  }, [demandeId, onEligibilityChange]);

  if (loading) {
    return (
      <div className="animate-pulse h-20 bg-slate-700/50 rounded-lg mt-3 flex items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" size={20} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  if (!eligibility) return null;

  const StatusIcon = ({ ok }: { ok: boolean }) => (
    ok ? (
      <Check size={14} className="text-emerald-400" />
    ) : (
      <X size={14} className="text-red-400" />
    )
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="text-sm font-medium text-slate-300">Vérification d'éligibilité:</div>
      
      <div className="grid grid-cols-3 gap-2">
        {/* Délai */}
        <div className={`p-2 rounded-lg text-center ${
          eligibility.delaiOk 
            ? 'bg-emerald-500/20 border border-emerald-500/30' 
            : 'bg-red-500/20 border border-red-500/30'
        }`}>
          <div className="flex justify-center">
            <StatusIcon ok={eligibility.delaiOk} />
          </div>
          <div className="text-xs text-slate-400 mt-1">Délai</div>
          <div className={`text-sm font-bold ${
            eligibility.delaiOk ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {eligibility.joursDepuisRejet}j / {eligibility.delaiMinimum}j
          </div>
        </div>
        
        {/* Nombre réévaluations */}
        <div className={`p-2 rounded-lg text-center ${
          eligibility.nombreOk 
            ? 'bg-emerald-500/20 border border-emerald-500/30' 
            : 'bg-red-500/20 border border-red-500/30'
        }`}>
          <div className="flex justify-center">
            <StatusIcon ok={eligibility.nombreOk} />
          </div>
          <div className="text-xs text-slate-400 mt-1">Tentatives</div>
          <div className={`text-sm font-bold ${
            eligibility.nombreOk ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {eligibility.nombreReevaluations} / {eligibility.maxAutorise}
          </div>
        </div>
        
        {/* Motif */}
        <div className={`p-2 rounded-lg text-center ${
          !eligibility.motifBlackliste 
            ? 'bg-emerald-500/20 border border-emerald-500/30' 
            : 'bg-red-500/20 border border-red-500/30'
        }`}>
          <div className="flex justify-center">
            <StatusIcon ok={!eligibility.motifBlackliste} />
          </div>
          <div className="text-xs text-slate-400 mt-1">Motif</div>
          <div className={`text-sm font-bold ${
            !eligibility.motifBlackliste ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {!eligibility.motifBlackliste ? 'Éligible' : 'Bloqué'}
          </div>
        </div>
      </div>

      {eligibility.reevaluationEnCours && (
        <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            Une réévaluation est déjà en cours
          </p>
        </div>
      )}
      
      {!eligibility.estEligible && eligibility.motifRefus && !eligibility.reevaluationEnCours && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400">
            {eligibility.motifRefus}
          </p>
        </div>
      )}
    </div>
  );
}

export default ReevaluationEligibilityCheck;
