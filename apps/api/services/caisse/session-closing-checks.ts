import { db } from "../../db";
import {
  sessionsCaisse,
  mmBalanceReconciliations,
  remisesTerrain,
  users,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { getDigitalCaisseSummary } from "../mobile-money/mm-caisse-service";
import { providerRegistry } from "../mobile-money/provider-registry";

const logger = createLogger('SessionClosingChecks');

export interface PendingRemiseInfo {
  id: string;
  reference: string;
  agentId: string;
  agentNom: string;
  montantDeclare: number;
  statut: string;
  createdAt: Date;
}

export interface MMReconciliationInfo {
  hasDiscrepancy: boolean;
  providers: {
    provider: 'MTN' | 'AIRTEL';
    expectedBalance: number;
    providerBalance: number | null;
    ecart: number;
    status: 'MATCHED' | 'DISCREPANCY' | 'API_FAILED';
  }[];
}

// Seuil d'écart Mobile Money pour avertissement (en FCFA)
export const MM_DISCREPANCY_THRESHOLD = 1000;

/**
 * Vérifie s'il y a des remises terrain en attente pour cette caisse
 */
export async function checkPendingAgentRemises(caisseId: string): Promise<{
  hasPending: boolean;
  count: number;
  totalAmount: number;
  remises: PendingRemiseInfo[];
}> {
  try {
    // Chercher les remises non réglées destinées à cette caisse
    const pendingRemises = await db.select({
      id: remisesTerrain.id,
      reference: remisesTerrain.reference,
      agentId: remisesTerrain.agentId,
      montantDeclare: remisesTerrain.montantDeclare,
      statut: remisesTerrain.statut,
      createdAt: remisesTerrain.createdAt,
      agentNom: users.nom,
    })
    .from(remisesTerrain)
    .leftJoin(users, eq(remisesTerrain.agentId, users.id))
    .where(and(
      eq(remisesTerrain.caisseDestinationId, caisseId),
      inArray(remisesTerrain.statut, ['DRAFT', 'PENDING', 'VALIDATED'])
    ));

    const totalAmount = pendingRemises.reduce(
      (sum, r) => sum + Number(r.montantDeclare || 0),
      0
    );

    return {
      hasPending: pendingRemises.length > 0,
      count: pendingRemises.length,
      totalAmount,
      remises: pendingRemises.map(r => ({
        id: r.id,
        reference: r.reference || '',
        agentId: r.agentId,
        agentNom: r.agentNom || 'Agent inconnu',
        montantDeclare: Number(r.montantDeclare || 0),
        statut: r.statut || '',
        createdAt: r.createdAt || new Date(),
      })),
    };
  } catch (error) {
    logger.warn({ err: error, caisseId }, 'Erreur vérification remises terrain');
    // En cas d'erreur, on ne bloque pas la clôture
    return { hasPending: false, count: 0, totalAmount: 0, remises: [] };
  }
}

/**
 * Vérifie les soldes Mobile Money et compare avec les fournisseurs
 */
export async function checkMobileMoneyBalances(sessionId: string, agenceId: string): Promise<MMReconciliationInfo> {
  try {
    // Récupérer les soldes des caisses digitales
    const summary = await getDigitalCaisseSummary(agenceId);

    const providers: MMReconciliationInfo['providers'] = [];
    let hasDiscrepancy = false;

    // Récupérer les balances pawaPay par correspondent (MTN_MOMO_COG, AIRTEL_COG)
    let pawaPayBalances: Record<string, number> | null = null;
    let balanceApiResponseTime = 0;
    let balanceApiFailed = false;
    let balanceApiError = '';

    try {
      const pawaPayProvider = providerRegistry.getPawaPay();
      const provider = pawaPayProvider as { getBalancePerCorrespondent?: () => Promise<Array<{ correspondent: string; balance: string }>> };
      if (typeof provider.getBalancePerCorrespondent === 'function') {
        const startTime = Date.now();
        const balanceResult = await provider.getBalancePerCorrespondent();
        balanceApiResponseTime = Date.now() - startTime;

        // Map correspondent balances to operators
        pawaPayBalances = {};
        if (balanceResult) {
          for (const entry of Array.isArray(balanceResult) ? balanceResult : [balanceResult]) {
            const correspondent = entry.correspondent || '';
            if (correspondent.includes('MTN')) {
              pawaPayBalances['MTN'] = (pawaPayBalances['MTN'] || 0) + Number(entry.balance || 0);
            } else if (correspondent.includes('AIRTEL')) {
              pawaPayBalances['AIRTEL'] = (pawaPayBalances['AIRTEL'] || 0) + Number(entry.balance || 0);
            }
          }
        }
      }
    } catch (error: unknown) {
      balanceApiFailed = true;
      balanceApiError = (error as Error).message;
      logger.warn({ err: error }, 'Erreur récupération balances pawaPay');
    }

    // Vérifier MTN
    if (summary.mtn.total > 0) {
      const expectedBalance = summary.mtn.total;

      if (balanceApiFailed) {
        providers.push({
          provider: 'MTN',
          expectedBalance,
          providerBalance: null,
          ecart: 0,
          status: 'API_FAILED',
        });
        await db.insert(mmBalanceReconciliations).values({
          sessionId,
          provider: 'MTN',
          expectedBalance: expectedBalance.toString(),
          ecart: '0',
          apiCallSuccess: false,
          apiErrorMessage: balanceApiError,
          statut: 'API_FAILED',
        });
      } else if (pawaPayBalances) {
        const providerBalance = pawaPayBalances['MTN'] ?? 0;
        const ecart = providerBalance - expectedBalance;
        const status = Math.abs(ecart) > MM_DISCREPANCY_THRESHOLD ? 'DISCREPANCY' : 'MATCHED';
        if (status === 'DISCREPANCY') hasDiscrepancy = true;

        providers.push({ provider: 'MTN', expectedBalance, providerBalance, ecart, status });
        await db.insert(mmBalanceReconciliations).values({
          sessionId,
          provider: 'MTN',
          expectedBalance: expectedBalance.toString(),
          providerBalance: providerBalance.toString(),
          ecart: ecart.toString(),
          apiCallSuccess: true,
          apiResponseTimeMs: balanceApiResponseTime.toString(),
          statut: status,
        });
      }
    }

    // Vérifier Airtel
    if (summary.airtel.total > 0) {
      const expectedBalance = summary.airtel.total;

      if (balanceApiFailed) {
        providers.push({
          provider: 'AIRTEL',
          expectedBalance,
          providerBalance: null,
          ecart: 0,
          status: 'API_FAILED',
        });
        await db.insert(mmBalanceReconciliations).values({
          sessionId,
          provider: 'AIRTEL',
          expectedBalance: expectedBalance.toString(),
          ecart: '0',
          apiCallSuccess: false,
          apiErrorMessage: balanceApiError,
          statut: 'API_FAILED',
        });
      } else if (pawaPayBalances) {
        const providerBalance = pawaPayBalances['AIRTEL'] ?? 0;
        const ecart = providerBalance - expectedBalance;
        const status = Math.abs(ecart) > MM_DISCREPANCY_THRESHOLD ? 'DISCREPANCY' : 'MATCHED';
        if (status === 'DISCREPANCY') hasDiscrepancy = true;

        providers.push({ provider: 'AIRTEL', expectedBalance, providerBalance, ecart, status });
        await db.insert(mmBalanceReconciliations).values({
          sessionId,
          provider: 'AIRTEL',
          expectedBalance: expectedBalance.toString(),
          providerBalance: providerBalance.toString(),
          ecart: ecart.toString(),
          apiCallSuccess: true,
          apiResponseTimeMs: balanceApiResponseTime.toString(),
          statut: status,
        });
      }
    }

    // Log le statut de réconciliation
    const mmStatus = hasDiscrepancy ? 'DISCREPANCY' : (providers.length > 0 ? 'MATCHED' : 'SKIPPED');
    logger.info({ sessionId, mmStatus }, 'MM reconciliation status computed');

    return { hasDiscrepancy, providers };
  } catch (error) {
    logger.error({ err: error, sessionId, agenceId }, 'Erreur vérification balances MM');
    return { hasDiscrepancy: false, providers: [] };
  }
}
