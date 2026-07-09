/**
 * KPI Shared Utilities — Formatting helpers, delta components, and KPI descriptions
 */
import type { KpiDelta } from '@shared/schema/kpi';
import { formatMoney, formatMoneyShort } from '@shared/config/currency';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Formatting — delegates to global currency system
// ---------------------------------------------------------------------------

/** Format a number with French locale */
export function fmtNum(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('fr-FR');
}

/** Format a number as currency using the app's active currency */
export function fmtMoney(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return formatMoney(n);
}

/** Compact format for stat cards: "1.2M FCFA", "350K FCFA" */
export function fmtMoneyShort(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return formatMoneyShort(n);
}

/** Format a number as percentage */
export function fmtPercent(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Format a ratio (e.g. 0.67 clients/agent) */
export function fmtRatio(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Delta → StatCard trend props
// ---------------------------------------------------------------------------

export function deltaToTrend(delta?: KpiDelta): { trend: string; trendUp?: boolean } {
  if (!delta || (delta.value === 0 && delta.percent === 0)) return { trend: '' };
  const sign = delta.percent > 0 ? '+' : '';
  return {
    trend: `${sign}${delta.percent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%`,
    trendUp: delta.percent > 0 ? true : delta.percent < 0 ? false : undefined,
  };
}

export function deltaToTrendInverse(delta?: KpiDelta): { trend: string; trendUp?: boolean } {
  const result = deltaToTrend(delta);
  if (result.trendUp !== undefined) {
    result.trendUp = !result.trendUp;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inline Delta Badges
// ---------------------------------------------------------------------------

export function DeltaBadge({ delta }: { delta?: KpiDelta }) {
  if (!delta || (delta.value === 0 && delta.percent === 0)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-content-muted">
        <Minus size={12} />
        0%
      </span>
    );
  }
  const isPositive = delta.percent > 0;
  const sign = isPositive ? '+' : '';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const color = isPositive ? 'text-status-success' : 'text-status-danger';

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon size={12} />
      {sign}{delta.percent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%
    </span>
  );
}

export function DeltaBadgeInverse({ delta }: { delta?: KpiDelta }) {
  if (!delta || (delta.value === 0 && delta.percent === 0)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-content-muted">
        <Minus size={12} />
        0%
      </span>
    );
  }
  const isPositive = delta.percent > 0;
  const sign = isPositive ? '+' : '';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const color = isPositive ? 'text-status-danger' : 'text-status-success';

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon size={12} />
      {sign}{delta.percent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section header (improved with icon support)
// ---------------------------------------------------------------------------

export function SectionHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      {Icon && (
        <div className="mt-0.5 w-5 h-5 rounded flex items-center justify-center bg-accent/10 shrink-0">
          <Icon size={12} className="text-accent" />
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
        {subtitle && <p className="text-xs text-content-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero metric card (for key metrics displayed larger)
// ---------------------------------------------------------------------------

export function HeroMetric({
  label,
  value,
  icon: Icon,
  color = 'accent',
  delta,
  description,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: 'accent' | 'success' | 'danger' | 'warning';
  delta?: KpiDelta;
  description?: string;
}) {
  const bgMap = {
    accent: 'bg-accent/10',
    success: 'bg-status-success-bg',
    danger: 'bg-status-danger-bg',
    warning: 'bg-status-warning-bg',
  };
  const iconMap = {
    accent: 'text-accent',
    success: 'text-status-success',
    danger: 'text-status-danger',
    warning: 'text-status-warning',
  };

  return (
    <div className="bg-surface/60 backdrop-blur-sm border border-edge-subtle rounded-xl p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${bgMap[color]} flex items-center justify-center shrink-0`}>
          <Icon size={22} className={iconMap[color]} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-[11px] font-medium text-content-muted uppercase tracking-wider mb-1">
            {label}
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-xl sm:text-2xl font-bold text-content-primary leading-tight">
              {value}
            </p>
            {delta && <DeltaBadge delta={delta} />}
          </div>
          {description && (
            <p className="text-[10px] sm:text-[11px] text-content-muted mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAR color coding
// ---------------------------------------------------------------------------

export function parColor(par: number): 'success' | 'warning' | 'danger' {
  if (par < 5) return 'success';
  if (par < 10) return 'warning';
  return 'danger';
}
