import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Wallet, Clock, CheckCircle, RefreshCw, TrendingDown } from 'lucide-react';
import { Card, Badge } from '../../ui';
import { formatMoney } from '../../../lib/format';

interface PayrollSummaryPanelProps {
  className?: string;
}

/**
 * Panel compact montrant la masse salariale.
 * Lit directement les payroll runs du mois en cours.
 */
export default function PayrollSummaryPanel({ className = '' }: PayrollSummaryPanelProps) {
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const { data: runs = [], isLoading, refetch } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: async () => {
      const res = await fetch('/api/hr/paie/runs');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || json;
    },
    staleTime: 30000,
  });

  const stats = useMemo(() => {
    // Filter runs for the current month, only latest version (non-cancelled)
    const monthRuns = (runs as any[]).filter(
      (r: any) => r.period === currentPeriod && r.status !== 'CANCELLED'
    );

    // Take the highest version run
    const latestRun = monthRuns.sort((a: any, b: any) => b.version - a.version)[0];

    if (!latestRun) {
      return { totalBrut: 0, totalNet: 0, totalChargesPatronales: 0, totalChargesSalariales: 0, employeeCount: 0, status: null as string | null };
    }

    return {
      totalBrut: Number(latestRun.totalBrut) || 0,
      totalNet: Number(latestRun.totalNet) || 0,
      totalChargesPatronales: Number(latestRun.totalChargesPatronales) || 0,
      totalChargesSalariales: Number(latestRun.totalChargesSalariales) || 0,
      employeeCount: latestRun.employeeCount || 0,
      status: latestRun.status as string | null,
    };
  }, [runs, currentPeriod]);

  const isPaid = stats.status === 'PAID';
  const isValidated = stats.status === 'VALIDATED';

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10">
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Masse Salariale</h3>
            <p className="text-[10px] text-slate-500">{monthLabel}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-indigo-500/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingDown className="w-3 h-3 text-indigo-400" />
            <span className="text-[9px] text-indigo-400 uppercase">Charges</span>
          </div>
          <span className="text-sm font-bold text-indigo-400">{formatMoney(stats.totalBrut + stats.totalChargesPatronales, { compact: true })}</span>
        </div>

        <div className="bg-amber-500/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] text-amber-400 uppercase">À payer</span>
          </div>
          <span className="text-sm font-bold text-amber-400">{formatMoney(isPaid ? 0 : stats.totalNet, { compact: true })}</span>
        </div>

        <div className="bg-emerald-500/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span className="text-[9px] text-emerald-400 uppercase">Payés</span>
          </div>
          <span className="text-sm font-bold text-emerald-400">{formatMoney(isPaid ? stats.totalNet : 0, { compact: true })}</span>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Wallet className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] text-slate-400 uppercase">Bulletins</span>
          </div>
          <span className="text-sm font-bold text-white">{stats.employeeCount}</span>
          <span className="text-[9px] text-slate-500 ml-1">ce mois</span>
        </div>
      </div>

      {/* Details */}
      {stats.status && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between py-1 px-2 bg-slate-800/50 rounded">
            <span className="text-slate-400">Brut total</span>
            <span className="font-mono text-white">{formatMoney(stats.totalBrut)}</span>
          </div>
          <div className="flex justify-between py-1 px-2 bg-slate-800/50 rounded">
            <span className="text-slate-400">Charges salariales</span>
            <span className="font-mono text-red-400">{formatMoney(stats.totalChargesSalariales)}</span>
          </div>
          <div className="flex justify-between py-1 px-2 bg-slate-800/50 rounded">
            <span className="text-slate-400">Charges patronales</span>
            <span className="font-mono text-slate-300">{formatMoney(stats.totalChargesPatronales)}</span>
          </div>
          <div className="flex justify-between py-1 px-2 bg-emerald-500/10 rounded font-bold">
            <span className="text-emerald-400">Net à payer</span>
            <span className="font-mono text-emerald-400">{formatMoney(stats.totalNet)}</span>
          </div>
        </div>
      )}

      {!stats.status && (
        <div className="text-center py-4 text-slate-500 text-xs">
          Aucun run de paie ce mois
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500">
        <span>GL: 6611 (Charges) / 4211 (Dettes)</span>
        <Badge
          value={isPaid ? 'Payé' : isValidated ? 'Validé' : stats.status === 'DRAFT' ? 'Brouillon' : 'À jour'}
          variant={isPaid ? 'success' : isValidated ? 'info' : 'warning'}
          size="xs"
        />
      </div>
    </Card>
  );
}
