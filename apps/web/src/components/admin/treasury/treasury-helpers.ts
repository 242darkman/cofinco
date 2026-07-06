/**
 * Treasury Supervision — Shared types, constants & helpers
 */

import { formatMoney } from '@shared/config/currency';

// ============================================================================
// Types
// ============================================================================

export type Period = 'today' | '7d' | '30d' | '1y';

export interface AgencyBreakdown {
  agenceId: string;
  agenceNom: string;
  ville: string;
  solde: number;
}

export interface RankingEntry {
  agenceId: string;
  agenceNom: string;
  ville: string;
  solde: number;
  rank: number;
  share: number;
  delta: number;
  deltaPercent: number;
}

export interface PreviousPeriodData {
  globalBalance: number;
  breakdown: Array<{ agenceId: string; solde: number }>;
}

export interface HistoryPoint {
  date: string;
  balance: number;
  [agencyId: string]: string | number; // dynamic agency keys
}

export interface SupervisionData {
  globalBalance: number;
  breakdown: AgencyBreakdown[];
  history: HistoryPoint[];
  ranking?: RankingEntry[];
  previousPeriod?: PreviousPeriodData;
}

export type InsightSeverity = 'info' | 'warning' | 'danger';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  message: string;
  detail?: string;
}

// ============================================================================
// Constants
// ============================================================================

export const RANKING_TOP_N = 10;

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '1 mois' },
  { value: '1y', label: '1 an' },
];

// Hex colors for Recharts SVG (CSS vars don't resolve in SVG attributes)
export const AGENCY_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
];

export const PRIMARY_CHART_COLOR = '#059669';

// Feature flags
export const ENABLE_TREASURY_SCATTER = false;

// ============================================================================
// Helpers
// ============================================================================

/** Deterministic color from agencyId */
export function getAgencyColor(agencyId: string): string {
  let hash = 0;
  for (let i = 0; i < agencyId.length; i++) {
    hash = agencyId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AGENCY_COLORS[Math.abs(hash) % AGENCY_COLORS.length];
}

/** Format currency without symbol */
export function formatCurrency(val: number): string {
  return formatMoney(val, { showCurrency: false });
}

/** Calculate growth % between two values */
export function calcGrowth(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Format a date for chart axes based on period */
export function formatAxisDate(value: string, period: Period): string {
  const d = new Date(value);
  if (period === 'today') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (period === '1y') return d.toLocaleDateString('fr-FR', { month: 'short' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/** Format a date for tooltip display */
export function formatTooltipDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === 'today') return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + " — Aujourd'hui";
  if (period === '1y') return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ============================================================================
// Insights engine (rule-based)
// ============================================================================

const SEVERITY_ORDER: Record<InsightSeverity, number> = { danger: 0, warning: 1, info: 2 };

export function computeInsights(data: SupervisionData): Insight[] {
  const { breakdown, ranking, previousPeriod, globalBalance } = data;
  
  // Only consider active agencies for insights
  const activeBreakdown = (breakdown || []).filter(a => a.solde > 0);

  if (!activeBreakdown.length) return [];

  // Rule 1: Empty safe (only if they are supposed to be active but empty? 
  // Actually the prompt says "Les agences inactives ou coffres vides ne doivent pas apparaître dans les statistiques globales ni dans les classements."
  // So we skip "Empty safe" alert if we don't even show them. 
  // However, "Les alertes concernent uniquement agences actives"
  // Let's assume an alert is triggered if an active agency drops below a threshold (seuil).
  
  const insights: Insight[] = [];

  // Rule 2: Concentration
  if (activeBreakdown.length >= 5 && globalBalance > 0) {
    const sorted = [...activeBreakdown].sort((a, b) => b.solde - a.solde);
    const top3Sum = sorted.slice(0, 3).reduce((s, a) => s + a.solde, 0);
    const share = (top3Sum / globalBalance) * 100;
    if (share > 80) {
      insights.push({
        id: 'concentration',
        severity: 'warning',
        message: `3 agences concentrent ${share.toFixed(0)}% de la trésorerie`,
        detail: sorted.slice(0, 3).map(a => a.agenceNom).join(', '),
      });
    }
  }

  // Rule 3: Strong variation on a single agency
  if (ranking) {
    const bigSwings = ranking.filter(r => Math.abs(r.deltaPercent) > 50);
    if (bigSwings.length > 0) {
      const worst = bigSwings.sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent))[0];
      const sign = worst.deltaPercent > 0 ? '+' : '';
      insights.push({
        id: 'strong-variation',
        severity: 'warning',
        message: `${worst.agenceNom} : variation de ${sign}${worst.deltaPercent.toFixed(0)}%`,
      });
    }
  }

  // Rule 4: Global downtrend
  if (previousPeriod && globalBalance > 0) {
    const prevBalance = previousPeriod.globalBalance;
    if (prevBalance > 0) {
      const globalDelta = ((globalBalance - prevBalance) / prevBalance) * 100;
      if (globalDelta < -10) {
        insights.push({
          id: 'downtrend',
          severity: 'info',
          message: `Tendance baissière : ${globalDelta.toFixed(1)}% sur la période`,
        });
      }
    }
  }

  // Sort by severity, limit to 3
  return insights
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 3);
}
/** Filter active agencies (solde > 0) */
export function getActiveAgencies<T extends { solde: number }>(items: T[] | undefined): T[] {
  return (items || []).filter(item => item.solde > 0);
}

/** Calculate adjusted stats for active agencies only */
export function calculateActiveStats(data: SupervisionData) {
  const activeAgencies = getActiveAgencies(data.breakdown);
  const activeCount = activeAgencies.length;
  const totalBalance = activeAgencies.reduce((sum, a) => sum + a.solde, 0);
  const averageBalance = activeCount > 0 ? totalBalance / activeCount : 0;
  
  // Find leader among active
  const leader = activeAgencies.length > 0 
    ? [...activeAgencies].sort((a, b) => b.solde - a.solde)[0]
    : null;

  return {
    activeAgencies,
    activeCount,
    totalBalance,
    averageBalance,
    leader
  };
}
