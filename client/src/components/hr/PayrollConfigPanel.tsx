import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge } from '../ui';
import { Settings, Plus, Trash2, Save, RefreshCw, AlertTriangle, Percent, DollarSign, Clock, UserCheck, Smartphone } from 'lucide-react';
import { toast } from '../../lib/toast';
import { usePermissions } from '../auth/ProtectedFeature';

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
  lateGraceMinutes: number;
  allowOvertime: boolean;
  defaultHeureDebut: string;
  defaultHeureFin: string;
  defaultPauseMinutes: number;
  mmSalaryFeeOption: string;
}

const formatCurrency = (val: number) => val.toLocaleString('fr-FR') + ' CDF';
const formatPercent = (val: number) => (val * 100).toFixed(1) + '%';

export default function PayrollConfigPanel() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('rh', 'manage') || hasPermission('paie', 'manage');

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
  const [lateGraceMinutes, setLateGraceMinutes] = useState('5');
  const [allowOvertime, setAllowOvertime] = useState(true);
  const [defaultHeureDebut, setDefaultHeureDebut] = useState('08:00');
  const [defaultHeureFin, setDefaultHeureFin] = useState('17:00');
  const [defaultPauseMinutes, setDefaultPauseMinutes] = useState('60');
  const [mmSalaryFeeOption, setMmSalaryFeeOption] = useState<'COMPANY_ABSORBS' | 'EMPLOYEE_PAYS'>('COMPANY_ABSORBS');

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
      setLateGraceMinutes(String(config.lateGraceMinutes ?? 5));
      setAllowOvertime(config.allowOvertime ?? true);
      setDefaultHeureDebut(config.defaultHeureDebut || '08:00');
      setDefaultHeureFin(config.defaultHeureFin || '17:00');
      setDefaultPauseMinutes(String(config.defaultPauseMinutes ?? 60));
      setMmSalaryFeeOption((config.mmSalaryFeeOption as 'COMPANY_ABSORBS' | 'EMPLOYEE_PAYS') || 'COMPANY_ABSORBS');
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
      lateGraceMinutes: parseInt(lateGraceMinutes) || 5,
      allowOvertime,
      defaultHeureDebut,
      defaultHeureFin,
      defaultPauseMinutes: parseInt(defaultPauseMinutes) || 60,
      mmSalaryFeeOption,
    });
  }, [cnssEmployee, cnssEmployer, brackets, transportAllowance, housingAllowance, overtimeRate, nightShiftRate, holidayRate, lateGraceMinutes, allowOvertime, defaultHeureDebut, defaultHeureFin, defaultPauseMinutes, mmSalaryFeeOption, saveMutation]);

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
      <div className="flex items-center justify-center py-12 text-content-muted">
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
          <Settings size={16} className="text-status-warning" />
          <h3 className="font-bold text-content-primary text-sm">Configuration Paie</h3>
          {config && (
            <Badge variant="info" size="sm" value={`Depuis ${new Date(config.effectiveFrom).toLocaleDateString('fr-FR')}`} />
          )}
        </div>
        {canManage && (
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
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* CNSS Rates */}
        <Card padding="sm" className="bg-surface/80 border-edge">
          <h4 className="text-xs font-bold text-status-info uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Percent size={13} />
            Cotisations CNSS
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Part employé (%)</label>
              <input
                inputMode="decimal"
                value={cnssEmployee}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setCnssEmployee(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Part employeur (%)</label>
              <input
                inputMode="decimal"
                value={cnssEmployer}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setCnssEmployer(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info/50 outline-none"
              />
            </div>
          </div>
          <p className="text-[10px] text-content-muted mt-2">
            Total charges sociales : {(parseFloat(cnssEmployee || '0') + parseFloat(cnssEmployer || '0')).toFixed(2)}%
          </p>
        </Card>

        {/* Allowances */}
        <Card padding="sm" className="bg-surface/80 border-edge">
          <h4 className="text-xs font-bold text-status-success uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <DollarSign size={13} />
            Primes & Indemnités
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Transport (CDF)</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={transportAllowance}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setTransportAllowance(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-success/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Logement (CDF)</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={housingAllowance}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setHousingAllowance(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-success/50 outline-none"
              />
            </div>
          </div>
        </Card>

        {/* Politique de Présence */}
        <Card padding="sm" className="bg-surface/80 border-edge">
          <h4 className="text-xs font-bold text-status-warning uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <UserCheck size={13} />
            Politique de Présence
          </h4>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-content-muted mb-1">Tolérance retard (min)</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={lateGraceMinutes}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setLateGraceMinutes(v); }}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setAllowOvertime(!allowOvertime)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      allowOvertime ? 'bg-status-success' : 'bg-edge'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      allowOvertime ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <span className="text-[10px] text-content-muted">Heures supp.</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-content-muted mb-1">Début par défaut</label>
                <input
                  type="time"
                  value={defaultHeureDebut}
                  onChange={(e) => setDefaultHeureDebut(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-content-muted mb-1">Fin par défaut</label>
                <input
                  type="time"
                  value={defaultHeureFin}
                  onChange={(e) => setDefaultHeureFin(e.target.value)}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-content-muted mb-1">Pause (min)</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={defaultPauseMinutes}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setDefaultPauseMinutes(v); }}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-content-muted">
              Horaires par défaut si l'employé n'a pas de planning individuel configuré
            </p>
          </div>
        </Card>

        {/* Frais Mobile Money */}
        <Card padding="sm" className="bg-surface/80 border-edge">
          <h4 className="text-xs font-bold text-accent uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Smartphone size={13} />
            Frais Mobile Money — Paiements salaires
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="mmSalaryFeeOption"
                value="COMPANY_ABSORBS"
                checked={mmSalaryFeeOption === 'COMPANY_ABSORBS'}
                onChange={() => setMmSalaryFeeOption('COMPANY_ABSORBS')}
                className="accent-accent"
              />
              <span className="text-xs text-content-primary group-hover:text-accent transition-colors">
                Absorbés par l'entreprise
              </span>
              <span className="text-[10px] text-content-muted">(GL : D 6272 / C 578x)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="mmSalaryFeeOption"
                value="EMPLOYEE_PAYS"
                checked={mmSalaryFeeOption === 'EMPLOYEE_PAYS'}
                onChange={() => setMmSalaryFeeOption('EMPLOYEE_PAYS')}
                className="accent-accent"
              />
              <span className="text-xs text-content-primary group-hover:text-accent transition-colors">
                Déduits du net de l'employé
              </span>
            </label>
            {mmSalaryFeeOption === 'EMPLOYEE_PAYS' && (
              <div className="bg-status-warning-bg text-status-warning text-[10px] p-2 rounded border border-status-warning/20">
                Les frais seront calculés via le barème Mobile Money et déduits du salaire net.
                Le montant sera explicité sur la fiche de paie et dans le suivi des paiements.
              </div>
            )}
            <p className="text-[10px] text-content-muted">
              Les frais opérateur (pawaPay) sont automatiquement postés en comptabilité lors du webhook.
            </p>
          </div>
        </Card>

        {/* Overtime Rates */}
        <Card padding="sm" className="bg-surface/80 border-edge">
          <h4 className="text-xs font-bold text-status-info uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock size={13} />
            Taux Heures Supplémentaires
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Heures sup. (x)</label>
              <input
                inputMode="decimal"
                value={overtimeRate}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setOvertimeRate(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Nuit (x)</label>
              <input
                inputMode="decimal"
                value={nightShiftRate}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setNightShiftRate(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info/50 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-content-muted mb-1">Jours fériés (x)</label>
              <input
                inputMode="decimal"
                value={holidayRate}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setHolidayRate(v); }}
                className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info/50 outline-none"
              />
            </div>
          </div>
          <p className="text-[10px] text-content-muted mt-2">
            Multiplicateurs appliqués au taux horaire de base
          </p>
        </Card>
      </div>

      {/* IPR Brackets - Full Width */}
      <Card padding="sm" className="bg-surface/80 border-edge">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-status-warning uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle size={13} />
            Barème IPR (Impôt Progressif sur le Revenu)
          </h4>
          <Button variant="ghost" size="sm" icon={Plus} onClick={addBracket} className="h-6 text-[10px] text-status-warning hover:text-status-warning">
            Ajouter tranche
          </Button>
        </div>

        {sortedBrackets.length === 0 ? (
          <div className="text-center py-6 text-content-muted text-xs">
            Aucune tranche configurée. Cliquez sur "Ajouter tranche" pour commencer.
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 text-[10px] text-content-muted uppercase tracking-wide px-1 pb-1 border-b border-edge">
              <span>Minimum (CDF)</span>
              <span>Maximum (CDF)</span>
              <span>Taux (%)</span>
              <span />
            </div>

            {sortedBrackets.map((bracket, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 items-center">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={bracket.min}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateBracket(index, 'min', v); }}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
                />
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={bracket.max ?? ''}
                  placeholder={index === sortedBrackets.length - 1 ? '∞' : ''}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); updateBracket(index, 'max', v); }}
                  disabled={index === sortedBrackets.length - 1}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  inputMode="decimal"
                  value={(bracket.rate * 100).toFixed(1)}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); updateBracket(index, 'rate', v); }}
                  className="w-full px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
                />
                <button
                  onClick={() => removeBracket(index)}
                  className="p-1 text-status-danger/60 hover:text-status-danger hover:bg-status-danger-bg rounded transition-colors"
                  title="Supprimer cette tranche"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {/* IPR simulation */}
            <div className="mt-3 pt-3 border-t border-edge">
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
        <label className="block text-[10px] text-content-muted mb-1">Simuler sur un salaire</label>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={testSalary}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setTestSalary(v); }}
          className="w-44 px-2 py-1.5 bg-surface-base border border-edge rounded text-xs text-content-primary font-mono focus:ring-1 focus:ring-status-warning/50 outline-none"
        />
      </div>
      <div className="text-xs">
        <span className="text-content-muted">IPR : </span>
        <span className="font-bold text-status-warning">{ipr.toLocaleString('fr-FR')} CDF</span>
        <span className="text-content-muted ml-2">({effectiveRate}% effectif)</span>
      </div>
    </div>
  );
}
