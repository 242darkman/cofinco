import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge } from '../ui';
import { Settings, Plus, Trash2, Save, RefreshCw, AlertTriangle, Percent, DollarSign, Clock } from 'lucide-react';
import { toast } from '../../lib/toast';

interface IprBracket {
  min: number;
  max: number | null;
  rate: number;
}

interface PayrollConfig {
  id: string;
  agenceId: string | null;
  cnssEmployeeRate: string;
  cnssEmployerRate: string;
  iprBrackets: IprBracket[];
  transportAllowance: number;
  housingAllowance: number;
  overtimeRate: string;
  nightShiftRate: string;
  holidayRate: string;
  effectiveFrom: string;
  isActive: boolean;
  updatedAt: string;
}

const formatCurrency = (val: number) => val.toLocaleString('fr-FR') + ' CDF';
const formatPercent = (val: number) => (val * 100).toFixed(1) + '%';

export default function PayrollConfigPanel() {
  const queryClient = useQueryClient();

  // Fetch current config
  const { data: config, isLoading, error } = useQuery<PayrollConfig>({
    queryKey: ['payroll-config'],
    queryFn: async () => {
      const res = await fetch('/api/hr/paie/config');
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Erreur chargement configuration');
      }
      const json = await res.json();
      return json.data || json;
    },
  });

  // Form state
  const [cnssEmployee, setCnssEmployee] = useState('5.00');
  const [cnssEmployer, setCnssEmployer] = useState('9.00');
  const [brackets, setBrackets] = useState<IprBracket[]>([]);
  const [transportAllowance, setTransportAllowance] = useState('50000');
  const [housingAllowance, setHousingAllowance] = useState('0');
  const [overtimeRate, setOvertimeRate] = useState('1.50');
  const [nightShiftRate, setNightShiftRate] = useState('1.25');
  const [holidayRate, setHolidayRate] = useState('2.00');

  // Populate form when config loads
  useEffect(() => {
    if (config) {
      setCnssEmployee((parseFloat(config.cnssEmployeeRate) * 100).toFixed(2));
      setCnssEmployer((parseFloat(config.cnssEmployerRate) * 100).toFixed(2));
      setBrackets(config.iprBrackets || []);
      setTransportAllowance(String(config.transportAllowance ?? 50000));
      setHousingAllowance(String(config.housingAllowance ?? 0));
      setOvertimeRate(config.overtimeRate || '1.50');
      setNightShiftRate(config.nightShiftRate || '1.25');
      setHolidayRate(config.holidayRate || '2.00');
    }
  }, [config]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/hr/paie/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || 'Erreur sauvegarde');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-config'] });
      toast.success('Configuration paie sauvegardée');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSave = useCallback(() => {
    // Validate brackets
    const sortedBrackets = [...brackets].sort((a, b) => a.min - b.min);
    if (sortedBrackets.length > 0) {
      const lastBracket = sortedBrackets[sortedBrackets.length - 1];
      if (lastBracket.max !== null) {
        toast.error('La dernière tranche IPR doit avoir un maximum illimité (vide)');
        return;
      }
      for (let i = 0; i < sortedBrackets.length - 1; i++) {
        if (sortedBrackets[i].max === null) {
          toast.error('Seule la dernière tranche peut avoir un maximum illimité');
          return;
        }
      }
    }

    saveMutation.mutate({
      cnssEmployeeRate: parseFloat(cnssEmployee) / 100,
      cnssEmployerRate: parseFloat(cnssEmployer) / 100,
      iprBrackets: sortedBrackets,
      transportAllowance: parseInt(transportAllowance) || 0,
      housingAllowance: parseInt(housingAllowance) || 0,
      overtimeRate: parseFloat(overtimeRate),
      nightShiftRate: parseFloat(nightShiftRate),
      holidayRate: parseFloat(holidayRate),
    });
  }, [cnssEmployee, cnssEmployer, brackets, transportAllowance, housingAllowance, overtimeRate, nightShiftRate, holidayRate, saveMutation]);

  // Bracket helpers
  const addBracket = useCallback(() => {
    const sorted = [...brackets].sort((a, b) => a.min - b.min);
    const lastMax = sorted.length > 0 ? (sorted[sorted.length - 1].max ?? sorted[sorted.length - 1].min + 1000000) : 0;
    // Set previous last bracket's max if it was null
    const updated = sorted.map((b, i) => {
      if (i === sorted.length - 1 && b.max === null) {
        return { ...b, max: lastMax > b.min ? lastMax : b.min + 1000000 };
      }
      return b;
    });
    updated.push({ min: (updated.length > 0 ? (updated[updated.length - 1].max! + 1) : 0), max: null, rate: 0 });
    setBrackets(updated);
  }, [brackets]);

  const removeBracket = useCallback((index: number) => {
    const sorted = [...brackets].sort((a, b) => a.min - b.min);
    sorted.splice(index, 1);
    // Ensure last bracket has null max
    if (sorted.length > 0) {
      sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], max: null };
    }
    setBrackets(sorted);
  }, [brackets]);

  const updateBracket = useCallback((index: number, field: keyof IprBracket, value: string) => {
    const sorted = [...brackets].sort((a, b) => a.min - b.min);
    const bracket = { ...sorted[index] };
    if (field === 'rate') {
      bracket.rate = parseFloat(value) / 100 || 0;
    } else if (field === 'min') {
      bracket.min = parseInt(value) || 0;
    } else if (field === 'max') {
      bracket.max = value === '' ? null : (parseInt(value) || 0);
    }
    sorted[index] = bracket;
    setBrackets(sorted);
  }, [brackets]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <RefreshCw className="animate-spin mr-2" size={16} />
        Chargement configuration...
      </div>
    );
  }

  const sortedBrackets = [...brackets].sort((a, b) => a.min - b.min);

  return (
    <div className="space-y-4 p-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-amber-400" />
          <h3 className="font-bold text-white text-sm">Configuration Paie</h3>
          {config && (
            <Badge variant="info" size="sm" value={`Depuis ${new Date(config.effectiveFrom).toLocaleDateString('fr-FR')}`} />
          )}
        </div>
        <Button
          variant="success"
          size="sm"
          icon={Save}
          onClick={handleSave}
          isLoading={saveMutation.isPending}
          className="h-7 text-xs"
        >
          Sauvegarder
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* CNSS Rates */}
        <Card padding="sm" className="bg-slate-800/80 border-slate-700">
          <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Percent size={13} />
            Cotisations CNSS
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Part employé (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={cnssEmployee}
                onChange={(e) => setCnssEmployee(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-blue-500/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Part employeur (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={cnssEmployer}
                onChange={(e) => setCnssEmployer(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-blue-500/50 outline-none"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Total charges sociales : {(parseFloat(cnssEmployee || '0') + parseFloat(cnssEmployer || '0')).toFixed(2)}%
          </p>
        </Card>

        {/* Allowances */}
        <Card padding="sm" className="bg-slate-800/80 border-slate-700">
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <DollarSign size={13} />
            Primes & Indemnités
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Transport (CDF)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={transportAllowance}
                onChange={(e) => setTransportAllowance(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-emerald-500/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Logement (CDF)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={housingAllowance}
                onChange={(e) => setHousingAllowance(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-emerald-500/50 outline-none"
              />
            </div>
          </div>
        </Card>

        {/* Overtime Rates */}
        <Card padding="sm" className="bg-slate-800/80 border-slate-700">
          <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock size={13} />
            Taux Heures Supplémentaires
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Heures sup. (x)</label>
              <input
                type="number"
                step="0.05"
                min="1"
                value={overtimeRate}
                onChange={(e) => setOvertimeRate(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-purple-500/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Nuit (x)</label>
              <input
                type="number"
                step="0.05"
                min="1"
                value={nightShiftRate}
                onChange={(e) => setNightShiftRate(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-purple-500/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Jours fériés (x)</label>
              <input
                type="number"
                step="0.05"
                min="1"
                value={holidayRate}
                onChange={(e) => setHolidayRate(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:ring-1 focus:ring-purple-500/50 outline-none"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Multiplicateurs appliqués au taux horaire de base
          </p>
        </Card>
      </div>

      {/* IPR Brackets - Full Width */}
      <Card padding="sm" className="bg-slate-800/80 border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle size={13} />
            Barème IPR (Impôt Progressif sur le Revenu)
          </h4>
          <Button variant="ghost" size="sm" icon={Plus} onClick={addBracket} className="h-6 text-[10px] text-amber-400 hover:text-amber-300">
            Ajouter tranche
          </Button>
        </div>

        {sortedBrackets.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            Aucune tranche configurée. Cliquez sur "Ajouter tranche" pour commencer.
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 text-[10px] text-slate-500 uppercase tracking-wide px-1 pb-1 border-b border-slate-700">
              <span>Minimum (CDF)</span>
              <span>Maximum (CDF)</span>
              <span>Taux (%)</span>
              <span />
            </div>

            {sortedBrackets.map((bracket, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  value={bracket.min}
                  onChange={(e) => updateBracket(index, 'min', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono focus:ring-1 focus:ring-amber-500/50 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  value={bracket.max ?? ''}
                  placeholder={index === sortedBrackets.length - 1 ? '∞' : ''}
                  onChange={(e) => updateBracket(index, 'max', e.target.value)}
                  disabled={index === sortedBrackets.length - 1}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono focus:ring-1 focus:ring-amber-500/50 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={(bracket.rate * 100).toFixed(1)}
                  onChange={(e) => updateBracket(index, 'rate', e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono focus:ring-1 focus:ring-amber-500/50 outline-none"
                />
                <button
                  onClick={() => removeBracket(index)}
                  className="p-1 text-red-500/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Supprimer cette tranche"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {/* IPR simulation */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <IprSimulator brackets={sortedBrackets} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Small inline IPR calculator for previewing bracket impact */
function IprSimulator({ brackets }: { brackets: IprBracket[] }) {
  const [testSalary, setTestSalary] = useState('1000000');

  const calculateIPR = (base: number): number => {
    let impot = 0;
    let remaining = base;
    const sorted = [...brackets].sort((a, b) => a.min - b.min);
    for (const bracket of sorted) {
      if (remaining <= 0) break;
      const rangeSize = bracket.max !== null ? bracket.max - bracket.min + 1 : remaining;
      const taxable = Math.min(remaining, rangeSize);
      impot += taxable * bracket.rate;
      remaining -= taxable;
    }
    return Math.round(impot);
  };

  const salary = parseInt(testSalary) || 0;
  const ipr = calculateIPR(salary);
  const effectiveRate = salary > 0 ? ((ipr / salary) * 100).toFixed(2) : '0.00';

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[10px] text-slate-500 mb-1">Simuler sur un salaire</label>
        <input
          type="number"
          min="0"
          step="100000"
          value={testSalary}
          onChange={(e) => setTestSalary(e.target.value)}
          className="w-44 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono focus:ring-1 focus:ring-amber-500/50 outline-none"
        />
      </div>
      <div className="text-xs">
        <span className="text-slate-400">IPR : </span>
        <span className="font-bold text-amber-400">{ipr.toLocaleString('fr-FR')} CDF</span>
        <span className="text-slate-500 ml-2">({effectiveRate}% effectif)</span>
      </div>
    </div>
  );
}
