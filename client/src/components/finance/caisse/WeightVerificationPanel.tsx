import React, { useState, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Scale, AlertTriangle, CheckCircle2, Info, Calculator } from 'lucide-react';
import { Card, Button, Badge } from '../../ui';
import { toast } from '../../../lib/toast';

interface WeightResult {
  expectedWeightGrams: number;
  actualWeightGrams: number;
  differenceGrams: number;
  differencePercent: number;
  withinTolerance: boolean;
  status: 'OK' | 'ALERTE_LEGERE' | 'ALERTE_MOYENNE' | 'SUSPECT';
  totalDeclaredValue: number;
  estimatedValueFromWeight: number;
  valueDifference: number;
  breakdown: Array<{
    denomination: string;
    count: number;
    expectedWeightGrams: number;
    value: number;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info'; icon: React.ElementType }> = {
  OK: { label: 'Conforme', variant: 'success', icon: CheckCircle2 },
  ALERTE_LEGERE: { label: 'Ecart léger', variant: 'info', icon: Info },
  ALERTE_MOYENNE: { label: 'Ecart moyen', variant: 'warning', icon: AlertTriangle },
  SUSPECT: { label: 'Suspect', variant: 'error', icon: AlertTriangle },
};

// Standard denomination keys
const DENOMINATION_LABELS: Record<string, string> = {
  billets_10000: '10 000',
  billets_5000: '5 000',
  billets_2000: '2 000',
  billets_1000: '1 000',
  billets_500: '500',
  billets_200: '200',
  billets_100: '100',
  billets_50: '50',
  pieces_500: '500 (pièce)',
  pieces_200: '200 (pièce)',
  pieces_100: '100 (pièce)',
  pieces_50: '50 (pièce)',
  pieces_25: '25 (pièce)',
  pieces_20: '20 (pièce)',
  pieces_10: '10 (pièce)',
  pieces_5: '5 (pièce)',
  pieces_1: '1 (pièce)',
};

const BANKNOTE_KEYS = ['billets_10000', 'billets_5000', 'billets_2000', 'billets_1000', 'billets_500'];

interface Props {
  /** Pre-filled billetage (from session closing or transfer) */
  initialBilletage?: Record<string, number>;
  /** Compact mode (fewer denomination fields) */
  compact?: boolean;
}

export default function WeightVerificationPanel({ initialBilletage, compact = false }: Props) {
  const [billetage, setBilletage] = useState<Record<string, number>>(initialBilletage || {});
  const [actualWeight, setActualWeight] = useState('');
  const [result, setResult] = useState<WeightResult | null>(null);

  const verifyMutation = useMutation({
    mutationFn: async (payload: { billetage: Record<string, number>; actualWeightGrams: number }) => {
      const res = await fetch('/api/caisse/verify-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur vérification');
      }
      return res.json() as Promise<WeightResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.status === 'SUSPECT') {
        toast.error('Ecart de poids suspect détecté !');
      } else if (!data.withinTolerance) {
        toast.warning(`Ecart de poids détecté: ${data.differencePercent}%`);
      } else {
        toast.success('Poids vérifié - conforme');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleVerify = useCallback(() => {
    const weight = parseFloat(actualWeight);
    if (isNaN(weight) || weight <= 0) {
      toast.warning('Veuillez saisir un poids valide');
      return;
    }

    const nonZero = Object.fromEntries(
      Object.entries(billetage).filter(([_, count]) => count > 0)
    );

    if (Object.keys(nonZero).length === 0) {
      toast.warning('Veuillez saisir au moins une dénomination');
      return;
    }

    verifyMutation.mutate({ billetage: nonZero, actualWeightGrams: weight });
  }, [billetage, actualWeight, verifyMutation]);

  const updateDenom = useCallback((key: string, value: string) => {
    const count = parseInt(value) || 0;
    setBilletage(prev => ({ ...prev, [key]: count }));
    setResult(null); // Clear previous result
  }, []);

  // Calculate total value on the fly
  const totalValue = useMemo(() => {
    const VALUES: Record<string, number> = {
      billets_10000: 10000, billets_5000: 5000, billets_2000: 2000, billets_1000: 1000,
      billets_500: 500, billets_200: 200, billets_100: 100, billets_50: 50,
      pieces_500: 500, pieces_200: 200, pieces_100: 100, pieces_50: 50,
      pieces_25: 25, pieces_20: 20, pieces_10: 10, pieces_5: 5, pieces_1: 1,
    };
    return Object.entries(billetage).reduce((sum, [key, count]) => {
      return sum + (VALUES[key] || 0) * (count || 0);
    }, 0);
  }, [billetage]);

  const denomsToShow = compact ? BANKNOTE_KEYS : Object.keys(DENOMINATION_LABELS);

  return (
    <Card padding="sm" className="bg-slate-800/80 border-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <Scale size={16} className="text-cyan-400" />
        <h4 className="text-xs font-bold text-white uppercase tracking-wide">Vérification Poids Billets</h4>
      </div>

      {/* Denomination inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
        {denomsToShow.map(key => (
          <div key={key}>
            <label className="block text-[9px] text-slate-500 mb-0.5">
              {DENOMINATION_LABELS[key] || key}
            </label>
            <input
              type="number"
              min="0"
              value={billetage[key] || ''}
              placeholder="0"
              onChange={(e) => updateDenom(key, e.target.value)}
              className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono focus:ring-1 focus:ring-cyan-500/50 outline-none"
            />
          </div>
        ))}
      </div>

      {/* Total + Weight input */}
      <div className="flex flex-wrap items-end gap-3 mb-3 p-2 bg-slate-900/50 rounded border border-slate-700/50">
        <div>
          <span className="text-[10px] text-slate-500">Valeur déclarée:</span>
          <p className="text-sm font-bold text-white font-mono">
            {totalValue.toLocaleString('fr-FR')} <span className="text-[10px] text-slate-400">CDF</span>
          </p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] text-slate-400 mb-0.5">Poids réel mesuré (g)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={actualWeight}
            placeholder="Ex: 1250.50"
            onChange={(e) => { setActualWeight(e.target.value); setResult(null); }}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-cyan-500/50 outline-none"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Calculator}
          onClick={handleVerify}
          isLoading={verifyMutation.isPending}
          className="h-8 text-xs"
        >
          Vérifier
        </Button>
      </div>

      {/* Result */}
      {result && (
        <div className={`p-3 rounded-lg border ${
          result.status === 'OK' ? 'bg-emerald-500/10 border-emerald-500/30' :
          result.status === 'SUSPECT' ? 'bg-red-500/10 border-red-500/30' :
          'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {(() => {
                const cfg = STATUS_CONFIG[result.status];
                const Icon = cfg.icon;
                return (
                  <>
                    <Icon size={16} className={
                      result.status === 'OK' ? 'text-emerald-400' :
                      result.status === 'SUSPECT' ? 'text-red-400' : 'text-amber-400'
                    } />
                    <Badge variant={cfg.variant} value={cfg.label} size="sm" />
                  </>
                );
              })()}
            </div>
            <span className={`font-mono text-sm font-bold ${
              result.withinTolerance ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {result.differencePercent}% écart
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-500">Poids attendu</span>
              <p className="font-mono text-white">{result.expectedWeightGrams.toLocaleString('fr-FR')} g</p>
            </div>
            <div>
              <span className="text-slate-500">Poids réel</span>
              <p className="font-mono text-white">{result.actualWeightGrams.toLocaleString('fr-FR')} g</p>
            </div>
            <div>
              <span className="text-slate-500">Différence</span>
              <p className={`font-mono ${result.withinTolerance ? 'text-emerald-400' : 'text-amber-400'}`}>
                {result.differenceGrams.toLocaleString('fr-FR')} g
              </p>
            </div>
          </div>

          {result.valueDifference > 0 && (
            <p className="text-[10px] text-slate-400 mt-2">
              Estimation par poids : {result.estimatedValueFromWeight.toLocaleString('fr-FR')} CDF
              (écart valeur : {result.valueDifference.toLocaleString('fr-FR')} CDF)
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
