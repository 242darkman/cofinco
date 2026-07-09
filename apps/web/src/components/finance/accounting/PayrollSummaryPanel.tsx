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
          <RefreshCw className="w-5 h-5 animate-spin text-content-muted" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <Users className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content-primary">Masse Salariale</h3>
            <p className="text-[10px] text-content-muted">{monthLabel}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-surface-elevated rounded transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className="w-3.5 h-3.5 text-content-muted" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-accent/10 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingDown className="w-3 h-3 text-accent" />
            <span className="text-[9px] text-accent uppercase">Charges</span>
          </div>
          <span className="text-sm font-bold text-accent">{formatMoney(stats.totalBrut + stats.totalChargesPatronales, { compact: true })}</span>
        </div>

        <div className="bg-status-warning-bg rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock className="w-3 h-3 text-status-warning" />
            <span className="text-[9px] text-status-warning uppercase">À payer</span>
          </div>
          <span className="text-sm font-bold text-status-warning">{formatMoney(isPaid ? 0 : stats.totalNet, { compact: true })}</span>
        </div>

        <div className="bg-status-success-bg rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <CheckCircle className="w-3 h-3 text-status-success" />
            <span className="text-[9px] text-status-success uppercase">Payés</span>
          </div>
          <span className="text-sm font-bold text-status-success">{formatMoney(isPaid ? stats.totalNet : 0, { compact: true })}</span>
        </div>

        <div className="bg-surface-elevated/50 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Wallet className="w-3 h-3 text-content-muted" />
            <span className="text-[9px] text-content-muted uppercase">Bulletins</span>
          </div>
          <span className="text-sm font-bold text-content-primary">{stats.employeeCount}</span>
          <span className="text-[9px] text-content-muted ml-1">ce mois</span>
        </div>
      </div>

      {/* Details */}
      {stats.status && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between py-1 px-2 bg-surface/50 rounded">
            <span className="text-content-muted">Brut total</span>
            <span className="font-mono text-content-primary">{formatMoney(stats.totalBrut)}</span>
          </div>
          <div className="flex justify-between py-1 px-2 bg-surface/50 rounded">
            <span className="text-content-muted">Charges salariales</span>
            <span className="font-mono text-status-danger">{formatMoney(stats.totalChargesSalariales)}</span>
          </div>
          <div className="flex justify-between py-1 px-2 bg-surface/50 rounded">
            <span className="text-content-muted">Charges patronales</span>
            <span className="font-mono text-content-secondary">{formatMoney(stats.totalChargesPatronales)}</span>
          </div>
          <div className="flex justify-between py-1 px-2 bg-status-success-bg rounded font-bold">
            <span className="text-status-success">Net à payer</span>
            <span className="font-mono text-status-success">{formatMoney(stats.totalNet)}</span>
          </div>
        </div>
      )}

      {!stats.status && (
        <div className="text-center py-4 text-content-muted text-xs">
          Aucun run de paie ce mois
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-edge-subtle flex items-center justify-between text-[10px] text-content-muted">
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
