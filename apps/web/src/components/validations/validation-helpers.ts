import { type Agence } from '@/lib/api-client';
import { StatutAgence } from '@shared/enum/status-constants';
import type { OperationTerrainWithRelations } from '@shared/schema';

/**
 * Filter agencies that are strictly in ACTIVE status.
 */
export function filterActiveAgencies(agencies: Agence[]): Agence[] {
  return agencies.filter(a => (a as any).statut === StatutAgence.ACTIVE);
}

export interface AgentPerformance {
  name: string;
  count: number;
}

export interface ValidationAlert {
  type: 'warning' | 'info';
  title: string;
  description: string;
}

export interface ValidationStats {
  pendingCount: number;
  totalAmount: number;
  activeAgenciesCount: number;
  averagePerValidation: number;
  agentPerformances: AgentPerformance[];
  alerts: ValidationAlert[];
  otpRequiredCount: number;
}

/**
 * Calculate statistics for a list of operations, considering only active agencies.
 */
export function calculateValidationStats(
  operations: OperationTerrainWithRelations[],
  activeAgencies: Agence[]
): ValidationStats {
  const activeAgencyIds = new Set(activeAgencies.map(a => a.id));
  const filteredOps = operations.filter(op => op.agenceId && activeAgencyIds.has(op.agenceId));

  const pendingCount = filteredOps.length;
  const totalAmount = filteredOps.reduce((sum, op) => sum + parseFloat(String(op.montant || 0)), 0);
  const averagePerValidation = pendingCount > 0 ? totalAmount / pendingCount : 0;

  // Agent performances (top 5 by count)
  const agentCounts = new Map<string, number>();
  for (const op of filteredOps) {
    const name = [op.agent?.nom, op.agent?.prenom].filter(Boolean).join(' ') || 'Agent inconnu';
    agentCounts.set(name, (agentCounts.get(name) || 0) + 1);
  }
  const agentPerformances = Array.from(agentCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // OTP required count
  const otpRequiredCount = filteredOps.filter(op => (op as any).validationOTP === 'REQUIRED').length;

  // Alerts based on real data
  const alerts: ValidationAlert[] = [];
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const staleCount = filteredOps.filter(op => {
    const created = new Date(op.createdAt || '').getTime();
    return now - created > TWO_HOURS;
  }).length;

  if (staleCount > 0) {
    alerts.push({
      type: 'warning',
      title: `Validations en attente depuis > 2h`,
      description: `${staleCount} collecte${staleCount > 1 ? 's' : ''} nécessite${staleCount > 1 ? 'nt' : ''} une attention immédiate.`,
    });
  }

  if (otpRequiredCount > 0) {
    alerts.push({
      type: 'info',
      title: 'Validation OTP requise',
      description: `${otpRequiredCount} demande${otpRequiredCount > 1 ? 's' : ''} sécurisée${otpRequiredCount > 1 ? 's' : ''} en attente.`,
    });
  }

  return {
    pendingCount,
    totalAmount,
    activeAgenciesCount: activeAgencies.length,
    averagePerValidation,
    agentPerformances,
    alerts,
    otpRequiredCount,
  };
}

/**
 * Group operations by agency.
 */
export function groupOperationsByAgency(
  operations: OperationTerrainWithRelations[],
  activeAgencies: Agence[]
) {
  const activeAgencyIds = new Set(activeAgencies.map(a => a.id));

  const grouped = new Map<string, { agency: Agence; operations: OperationTerrainWithRelations[]; totalAmount: number }>();

  activeAgencies.forEach(agency => {
    grouped.set(agency.id, { agency, operations: [], totalAmount: 0 });
  });

  operations.forEach(op => {
    if (op.agenceId && activeAgencyIds.has(op.agenceId)) {
      const group = grouped.get(op.agenceId)!;
      group.operations.push(op);
      group.totalAmount += parseFloat(String(op.montant || 0));
    }
  });

  return Array.from(grouped.values()).filter(g => g.operations.length > 0);
}
