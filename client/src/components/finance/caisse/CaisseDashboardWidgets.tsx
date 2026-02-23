import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart3, Clock, TrendingUp, Hash,
  AlertTriangle, Bell, ChevronRight, Gauge
} from 'lucide-react';
import { isIncomingOperation, isOutgoingOperation, CAISSE_THRESHOLDS } from '@shared/config/caisse-operations';
import { formatMoney, formatMoneyShort } from '@shared/config/currency';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

interface Transaction {
  id: string;
  typeOperation: string;
  montant: number | string;
  createdAt: string | Date;
  description?: string;
  statut?: string;
  clientNom?: string;
}

interface SessionInfo {
  openedAt?: string | Date;
  montantOuverture?: number;
  soldeInitial?: number;
  caisseNom?: string;
}

interface CaisseDashboardWidgetsProps {
  transactions: Transaction[];
  session: SessionInfo | null;
  soldeActuel: number;
  totalEntrees: number;
  totalSorties: number;
  nbEntrees: number;
  nbSorties: number;
  demandesCount: number;
  onNavigate?: (tab: string) => void;
}

// ============================================================================
// OPERATION TYPE LABELS (French)
// ============================================================================

const OP_TYPE_LABELS: Record<string, string> = {
  SAVINGS_DEPOSIT: 'Dépôt Épargne',
  DEPOSIT_SAVINGS: 'Dépôt Épargne',
  DEPOSIT_CURRENT: 'Dépôt Courant',
  DEPOSIT_BLOCKED: 'Dépôt Bloqué',
  INITIAL_DEPOSIT: 'Dépôt Initial',
  CREDIT_REPAYMENT: 'Remb. Crédit',
  LOAN_REPAYMENT: 'Remb. Prêt',
  ENGAGEMENT_FEE: 'Frais Engagement',
  TONTINE_CONTRIBUTION: 'Cotisation Tontine',
  MISC_COLLECTION: 'Encaissement Divers',
  SAFE_SUPPLY: 'Approv. Coffre',
  TRANSFER_IN: 'Transfert Entrant',
  SAVINGS_WITHDRAWAL: 'Retrait Épargne',
  WITHDRAWAL_SAVINGS: 'Retrait Épargne',
  WITHDRAWAL_CURRENT: 'Retrait Courant',
  WITHDRAWAL_BLOCKED: 'Retrait Bloqué',
  TONTINE_WITHDRAWAL: 'Retrait Tontine',
  CREDIT_DISBURSEMENT: 'Décaissement Crédit',
  LOAN_DISBURSEMENT: 'Décaissement Prêt',
  FEE: 'Frais',
  BANK_FEE: 'Frais Bancaires',
  MISC_DISBURSEMENT: 'Décaissement Divers',
  SAFE_DEPOSIT: 'Versement Coffre',
  TRANSFER_OUT: 'Transfert Sortant',
  AGENT_PROVISIONING: 'Approv. Agent',
};

const PIE_COLORS = ['#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#6366f1', '#84cc16'];

// ============================================================================
// HELPER: Compute hourly data from transactions
// ============================================================================

function computeHourlyData(transactions: Transaction[]) {
  const hours: { hour: string; entrees: number; sorties: number }[] = [];
  for (let h = 0; h < 24; h++) {
    hours.push({ hour: `${h.toString().padStart(2, '0')}h`, entrees: 0, sorties: 0 });
  }

  const activeTx = transactions.filter(t => t.statut !== 'REVERSED');
  for (const tx of activeTx) {
    const date = tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt);
    const h = date.getHours();
    const montant = typeof tx.montant === 'string' ? parseFloat(tx.montant) : tx.montant;
    if (!Number.isFinite(montant)) continue;

    const isReversal = tx.description?.startsWith('[ANNULATION]');
    const isIn = isReversal ? isOutgoingOperation(tx.typeOperation) : isIncomingOperation(tx.typeOperation);
    const isOut = isReversal ? isIncomingOperation(tx.typeOperation) : isOutgoingOperation(tx.typeOperation);

    if (isIn) hours[h].entrees += montant;
    if (isOut) hours[h].sorties += montant;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const firstHourWithData = hours.findIndex(h => h.entrees > 0 || h.sorties > 0);
  const start = firstHourWithData >= 0 ? Math.max(0, firstHourWithData - 1) : Math.max(0, 7);
  const end = Math.min(23, currentHour + 1);
  return hours.slice(start, end + 1);
}

// ============================================================================
// HELPER: Compute operation type breakdown
// ============================================================================

function computeTypeBreakdown(transactions: Transaction[]) {
  const activeTx = transactions.filter(t => t.statut !== 'REVERSED');
  const groups: Record<string, { name: string; value: number; count: number }> = {};

  for (const tx of activeTx) {
    const type = tx.typeOperation;
    const montant = typeof tx.montant === 'string' ? parseFloat(tx.montant) : tx.montant;
    if (!Number.isFinite(montant)) continue;

    if (!groups[type]) {
      groups[type] = { name: OP_TYPE_LABELS[type] || type, value: 0, count: 0 };
    }
    groups[type].value += montant;
    groups[type].count += 1;
  }

  return Object.values(groups).sort((a, b) => b.value - a.value).slice(0, 8);
}

// ============================================================================
// HELPER: Format session duration from openedAt to now
// ============================================================================

function computeSessionDuration(openedAt: string | Date | undefined): string {
  if (!openedAt) return '—';
  const start = new Date(openedAt);
  const mins = Math.floor((Date.now() - start.getTime()) / 60000);
  if (mins < 1) return '<1min';
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// ============================================================================
// CUSTOM CHART TOOLTIP
// ============================================================================

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-elevated border border-edge rounded-lg shadow-xl p-2.5 text-xs">
      <div className="font-semibold text-content-primary mb-1">{label}</div>
      {payload.map((entry: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-content-muted">{entry.name}:</span>
          <span className="font-medium text-content-primary">{formatMoney(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload?: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="bg-surface-elevated border border-edge rounded-lg shadow-xl p-2.5 text-xs">
      <div className="font-semibold text-content-primary">{data.name}</div>
      <div className="text-content-muted">{formatMoney(data.value)} ({data.payload.count} op.)</div>
    </div>
  );
}

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

function KpiSkeleton() {
  return (
    <div className="bg-surface/50 border border-edge-subtle rounded-lg p-3 animate-pulse" role="status">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-surface-elevated/50" />
        <div className="h-3 w-16 bg-surface-elevated/50 rounded" />
      </div>
      <div className="h-5 w-20 bg-surface-elevated/50 rounded mb-1" />
      <div className="h-2.5 w-14 bg-surface-elevated/50 rounded" />
      <span className="sr-only">Chargement...</span>
    </div>
  );
}

function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div
      className="w-full flex items-center justify-center bg-surface/30 rounded-lg border border-dashed border-edge animate-pulse"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-1 text-content-muted">
        <BarChart3 className="h-5 w-5 opacity-30" />
        <span className="text-[10px] opacity-50">Chargement...</span>
      </div>
    </div>
  );
}

// ============================================================================
// KPI CARD COMPONENT
// ============================================================================

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

function KpiCard({ label, value, icon: Icon, color, subtitle }: KpiCardProps) {
  return (
    <div className="bg-surface/60 backdrop-blur-sm border border-edge-subtle rounded-lg p-3 min-w-0">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={14} />
        </div>
        <span className="text-[10px] text-content-muted font-medium uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-base font-bold text-content-primary truncate">{value}</div>
      {subtitle && <div className="text-[10px] text-content-muted mt-0.5 truncate">{subtitle}</div>}
    </div>
  );
}

// ============================================================================
// ALERT BANNER COMPONENT
// ============================================================================

interface AlertItem {
  type: 'warning' | 'info' | 'danger';
  message: string;
  tab?: string;
}

function AlertBanner({ alerts, onNavigate }: { alerts: AlertItem[]; onNavigate?: (tab: string) => void }) {
  if (alerts.length === 0) return null;

  const topAlert = alerts[0];
  const colorMap = {
    warning: 'bg-status-warning-bg border-status-warning/20 text-status-warning hover:bg-status-warning/10',
    info: 'bg-status-info-bg border-status-info/20 text-status-info hover:bg-status-info/10',
    danger: 'bg-status-danger-bg border-status-danger/20 text-status-danger hover:bg-status-danger/10',
  };

  const isClickable = !!(topAlert.tab && onNavigate);

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? () => onNavigate!(topAlert.tab!) : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate!(topAlert.tab!); } } : undefined}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${colorMap[topAlert.type]} ${isClickable ? 'cursor-pointer' : ''}`}
    >
      {topAlert.type === 'danger' ? <AlertTriangle size={14} className="shrink-0" /> : <Bell size={14} className="shrink-0" />}
      <span className="flex-1 font-medium truncate">{topAlert.message}</span>
      {alerts.length > 1 && (
        <span className="text-[10px] opacity-70 shrink-0">+{alerts.length - 1}</span>
      )}
      {isClickable && <ChevronRight size={14} className="shrink-0 opacity-70" />}
    </div>
  );
}

// ============================================================================
// MAIN WIDGET COMPONENT
// ============================================================================

export function CaisseDashboardWidgets({
  transactions,
  session,
  soldeActuel,
  totalEntrees,
  totalSorties,
  nbEntrees,
  nbSorties,
  demandesCount,
  onNavigate,
}: CaisseDashboardWidgetsProps) {
  const totalOps = nbEntrees + nbSorties;

  // Live session duration — re-computed every 30s
  const [sessionDuration, setSessionDuration] = useState(() => computeSessionDuration(session?.openedAt));
  useEffect(() => {
    setSessionDuration(computeSessionDuration(session?.openedAt));
    if (!session?.openedAt) return;
    const interval = setInterval(() => {
      setSessionDuration(computeSessionDuration(session.openedAt));
    }, 30_000);
    return () => clearInterval(interval);
  }, [session?.openedAt]);

  // Average transaction amount = (all flux) / nb operations
  const avgAmountDisplay = totalOps > 0
    ? formatMoney(Math.round((totalEntrees + totalSorties) / totalOps))
    : '—';

  // Limit utilization (% of PLAFOND_CAISSE) — 1 decimal for transparency
  const limitPctRaw = Math.min(100, (soldeActuel / CAISSE_THRESHOLDS.PLAFOND_CAISSE) * 100);
  const limitPct = limitPctRaw >= 10 ? Math.round(limitPctRaw) : parseFloat(limitPctRaw.toFixed(1));

  // Hourly data
  const hourlyData = useMemo(() => computeHourlyData(transactions), [transactions]);

  // Type breakdown
  const typeBreakdown = useMemo(() => computeTypeBreakdown(transactions), [transactions]);

  // Alerts
  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    if (demandesCount > 0) {
      items.push({
        type: 'info',
        message: `${demandesCount} demande${demandesCount > 1 ? 's' : ''} en attente de traitement`,
        tab: 'demandes',
      });
    }
    if (soldeActuel > CAISSE_THRESHOLDS.PLAFOND_CAISSE) {
      items.push({
        type: 'warning',
        message: `Solde supérieur au plafond (${formatMoney(CAISSE_THRESHOLDS.PLAFOND_CAISSE)}) — pensez à verser au coffre`,
        tab: 'transferts',
      });
    }
    if (soldeActuel < CAISSE_THRESHOLDS.SOLDE_BAS_ALERTE && soldeActuel > 0) {
      items.push({
        type: 'warning',
        message: `Solde bas (${formatMoney(soldeActuel)}) — pensez à demander un approvisionnement`,
        tab: 'transferts',
      });
    }
    return items;
  }, [demandesCount, soldeActuel]);

  return (
    <div className="space-y-2">
      {/* Alert Banner — entirely clickable */}
      <AlertBanner alerts={alerts} onNavigate={onNavigate} />

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard
          label="Opérations"
          value={totalOps}
          icon={Hash}
          color="bg-accent/10 text-accent"
          subtitle={totalOps > 0 ? `${nbEntrees} entrées • ${nbSorties} sorties` : 'Aucune opération'}
        />
        <KpiCard
          label="Montant Moyen"
          value={avgAmountDisplay}
          icon={TrendingUp}
          color="bg-status-info/10 text-status-info"
          subtitle={totalOps > 0 ? `Flux total: ${formatMoney(totalEntrees + totalSorties)}` : undefined}
        />
        <KpiCard
          label="Durée Session"
          value={sessionDuration}
          icon={Clock}
          color="bg-status-success/10 text-status-success"
          subtitle={session?.openedAt ? `Depuis ${new Date(session.openedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : undefined}
        />
        <KpiCard
          label="Utilisation"
          value={`${limitPct}%`}
          icon={Gauge}
          color={limitPct > 80 ? 'bg-status-warning/10 text-status-warning' : 'bg-content-muted/10 text-content-muted'}
          subtitle={`Plafond: ${formatMoneyShort(CAISSE_THRESHOLDS.PLAFOND_CAISSE)}`}
        />
      </div>

      {/* Charts Row — only shown when there are operations */}
      {totalOps > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
          {/* Hourly Cash Flow - Area Chart */}
          <div className="lg:col-span-3 bg-surface/60 backdrop-blur-sm border border-edge-subtle rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold text-content-primary uppercase tracking-wider">
                Flux Horaire
              </h3>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-status-success" />
                  <span className="text-content-muted">Entrées</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-status-danger" />
                  <span className="text-content-muted">Sorties</span>
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="gradEntrees" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradSorties" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.3} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="entrees"
                  name="Entrées"
                  stroke="var(--color-success)"
                  fill="url(#gradEntrees)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="sorties"
                  name="Sorties"
                  stroke="var(--color-danger)"
                  fill="url(#gradSorties)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Operation Type Breakdown - Donut Chart */}
          <div className="lg:col-span-2 bg-surface/60 backdrop-blur-sm border border-edge-subtle rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-content-primary uppercase tracking-wider mb-2">
              Par Type
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={typeBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {typeBreakdown.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {typeBreakdown.slice(0, 4).map((item, i) => (
                <span key={i} className="flex items-center gap-1 text-[9px] text-content-muted">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="truncate max-w-[80px]">{item.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DASHBOARD SKELETON (for initial loading state)
// ============================================================================

export function CaisseDashboardSkeleton() {
  return (
    <div className="space-y-2 animate-in fade-in duration-300" role="status" aria-label="Chargement du dashboard...">
      {/* Quick actions skeleton */}
      <div className="flex gap-2">
        <div className="flex-1 h-16 rounded-lg bg-surface/50 border border-edge-subtle animate-pulse" />
        <div className="flex-1 h-16 rounded-lg bg-surface/50 border border-edge-subtle animate-pulse" />
      </div>
      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-surface/50 border border-edge-subtle rounded-lg p-3 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3.5 h-3.5 rounded bg-surface-elevated/50" />
              <div className="h-3 w-16 bg-surface-elevated/50 rounded" />
            </div>
            <div className="h-5 w-24 bg-surface-elevated/50 rounded mb-1.5" />
            <div className="h-2.5 w-20 bg-surface-elevated/50 rounded" />
          </div>
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
        <div className="lg:col-span-3">
          <ChartSkeleton height={220} />
        </div>
        <div className="lg:col-span-2">
          <ChartSkeleton height={220} />
        </div>
      </div>
      {/* Transactions skeleton */}
      <div className="bg-surface/50 border border-edge-subtle rounded-lg p-3 animate-pulse">
        <div className="h-4 w-32 bg-surface-elevated/50 rounded mb-3" />
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 py-2.5 border-b border-edge-subtle last:border-0">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated/50" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 bg-surface-elevated/50 rounded" />
              <div className="h-2.5 w-1/2 bg-surface-elevated/50 rounded" />
            </div>
            <div className="h-4 w-20 bg-surface-elevated/50 rounded" />
          </div>
        ))}
      </div>
      <span className="sr-only">Chargement...</span>
    </div>
  );
}
