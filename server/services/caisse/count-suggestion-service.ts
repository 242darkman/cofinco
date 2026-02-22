/**
 * Service de suggestion automatique du billetage
 *
 * Suggère le billetage basé sur:
 * - Le solde d'ouverture et son billetage
 * - Les opérations de la journée
 * - L'analyse des entrées/sorties par coupure
 */

import { eq, and, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { sessionsCaisse, operationsCaisse } from "@shared/schema/finance";
import { comptageBillets } from "@shared/schema/operations";

// Standard denominations (FCFA)
const DENOMINATIONS = [
  { key: 'billets_10000', value: 10000, type: 'billet' },
  { key: 'billets_5000', value: 5000, type: 'billet' },
  { key: 'billets_2000', value: 2000, type: 'billet' },
  { key: 'billets_1000', value: 1000, type: 'billet' },
  { key: 'billets_500', value: 500, type: 'billet' },
  { key: 'pieces_250', value: 250, type: 'piece' },
  { key: 'pieces_100', value: 100, type: 'piece' },
  { key: 'pieces_50', value: 50, type: 'piece' },
  { key: 'pieces_25', value: 25, type: 'piece' },
] as const;

export interface SuggestedCount {
  billetage: Record<string, number>;
  totalSuggere: number;
  soldeTheorique: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string[];
}

class CountSuggestionService {
  /**
   * Suggère un billetage pour une session
   */
  async suggestDenominations(sessionId: string): Promise<SuggestedCount> {
    const reasoning: string[] = [];

    // 1. Récupérer la session et ses données
    const [session] = await db
      .select()
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error("Session non trouvée");
    }

    // 2. Récupérer le billetage d'ouverture si disponible
    const [openingCount] = await db
      .select()
      .from(comptageBillets)
      .where(and(
        eq(comptageBillets.sessionId, sessionId),
        eq(comptageBillets.typeComptage, "OPENING")
      ))
      .limit(1);

    // 3. Récupérer les opérations du jour
    const operations = await db
      .select({
        typeOperation: operationsCaisse.typeOperation,
        montant: operationsCaisse.montant,
        metadata: operationsCaisse.metadata,
      })
      .from(operationsCaisse)
      .where(eq(operationsCaisse.sessionId, sessionId));

    // 4. Calculer le solde théorique
    const montantOuverture = Number(session.montantOuverture) || 0;
    let totalEntrees = 0;
    let totalSorties = 0;

    operations.forEach(op => {
      const montant = Number(op.montant) || 0;
      // Check for credit operations (money coming in)
      const creditOps = ['SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'SAFE_SUPPLY', 'CREDIT_REPAYMENT', 'TONTINE_CONTRIBUTION', 'MISC_COLLECTION', 'INITIAL_DEPOSIT'];
      // Check for debit operations (money going out)
      const debitOps = ['SAVINGS_WITHDRAWAL', 'WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'WITHDRAWAL_BLOCKED', 'CREDIT_DISBURSEMENT', 'LOAN_DISBURSEMENT', 'TONTINE_WITHDRAWAL', 'MISC_DISBURSEMENT', 'SAFE_DEPOSIT'];

      if (creditOps.includes(op.typeOperation)) {
        totalEntrees += montant;
      } else if (debitOps.includes(op.typeOperation)) {
        totalSorties += montant;
      }
    });

    const soldeTheorique = montantOuverture + totalEntrees - totalSorties;
    reasoning.push(`Solde d'ouverture: ${montantOuverture}`);
    reasoning.push(`Total entrées: ${totalEntrees}`);
    reasoning.push(`Total sorties: ${totalSorties}`);
    reasoning.push(`Solde théorique calculé: ${soldeTheorique}`);

    // 5. Suggérer le billetage
    let billetage: Record<string, number> = {};
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

    if (openingCount) {
      // Si on a un billetage d'ouverture, on l'utilise comme base
      billetage = this.adjustFromOpening(openingCount, operations, soldeTheorique);
      reasoning.push("Suggestion basée sur le billetage d'ouverture ajusté");
      confidence = 'HIGH';
    } else {
      // Sinon, on suggère un billetage optimal
      billetage = this.suggestOptimalDenominations(soldeTheorique);
      reasoning.push("Suggestion basée sur une répartition optimale");
      confidence = 'LOW';
    }

    const totalSuggere = this.calculateTotal(billetage);

    // Ajuster si le total suggéré ne correspond pas au solde théorique
    if (Math.abs(totalSuggere - soldeTheorique) > 0) {
      billetage = this.adjustToTarget(billetage, soldeTheorique);
      reasoning.push(`Ajustement effectué pour atteindre ${soldeTheorique}`);
    }

    return {
      billetage,
      totalSuggere: this.calculateTotal(billetage),
      soldeTheorique,
      confidence,
      reasoning,
    };
  }

  /**
   * Ajuste le billetage d'ouverture en fonction des opérations
   */
  private adjustFromOpening(
    openingCount: Record<string, number>,
    operations: { typeOperation: string; montant: string | null; metadata: unknown }[],
    targetTotal: number
  ): Record<string, number> {
    // Commencer avec le billetage d'ouverture
    const billetage: Record<string, number> = {
      billets_10000: openingCount.billets10000 || 0,
      billets_5000: openingCount.billets5000 || 0,
      billets_2000: openingCount.billets2000 || 0,
      billets_1000: openingCount.billets1000 || 0,
      billets_500: openingCount.billets500 || 0,
      pieces_250: openingCount.pieces250 || 0,
      pieces_100: openingCount.pieces100 || 0,
      pieces_50: openingCount.pieces50 || 0,
      pieces_25: openingCount.pieces25 || 0,
    };

    // Analyser les opérations avec billetage détaillé (stocké dans metadata)
    operations.forEach(op => {
      const metadata = op.metadata as Record<string, any> | null;
      const billetageDetail = metadata?.billetage || metadata?.billetageDetail;
      if (billetageDetail && typeof billetageDetail === 'object') {
        const detail = billetageDetail as Record<string, number>;
        const isEntry = ['SAVINGS_DEPOSIT', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED', 'SAFE_SUPPLY', 'CREDIT_REPAYMENT', 'TONTINE_CONTRIBUTION', 'MISC_COLLECTION', 'INITIAL_DEPOSIT'].includes(op.typeOperation);

        Object.entries(detail).forEach(([key, count]) => {
          const normalizedKey = this.normalizeKey(key);
          if (billetage[normalizedKey] !== undefined) {
            if (isEntry) {
              billetage[normalizedKey] += count;
            } else {
              billetage[normalizedKey] = Math.max(0, billetage[normalizedKey] - count);
            }
          }
        });
      }
    });

    return billetage;
  }

  /**
   * Suggère une répartition optimale pour un montant donné
   */
  private suggestOptimalDenominations(amount: number): Record<string, number> {
    const billetage: Record<string, number> = {};
    let remaining = amount;

    // Du plus grand au plus petit
    for (const denom of DENOMINATIONS) {
      const count = Math.floor(remaining / denom.value);
      billetage[denom.key] = count;
      remaining -= count * denom.value;
    }

    return billetage;
  }

  /**
   * Ajuste le billetage pour atteindre exactement le montant cible
   */
  private adjustToTarget(billetage: Record<string, number>, target: number): Record<string, number> {
    const current = this.calculateTotal(billetage);
    let diff = target - current;

    if (diff === 0) return billetage;

    const result = { ...billetage };

    // Si on doit ajouter
    if (diff > 0) {
      for (const denom of DENOMINATIONS) {
        const toAdd = Math.floor(diff / denom.value);
        if (toAdd > 0) {
          result[denom.key] = (result[denom.key] || 0) + toAdd;
          diff -= toAdd * denom.value;
        }
      }
    }
    // Si on doit retirer
    else {
      diff = Math.abs(diff);
      for (const denom of DENOMINATIONS) {
        const current = result[denom.key] || 0;
        const toRemove = Math.min(current, Math.floor(diff / denom.value));
        if (toRemove > 0) {
          result[denom.key] = current - toRemove;
          diff -= toRemove * denom.value;
        }
      }
    }

    return result;
  }

  /**
   * Calcule le total d'un billetage
   */
  private calculateTotal(billetage: Record<string, number>): number {
    return DENOMINATIONS.reduce((total, denom) => {
      return total + (billetage[denom.key] || 0) * denom.value;
    }, 0);
  }

  /**
   * Normalise une clé de dénomination
   */
  private normalizeKey(key: string): string {
    // Convertit "10000" -> "billets_10000" ou garde tel quel
    const numericMatch = key.match(/^(\d+)$/);
    if (numericMatch) {
      const value = parseInt(numericMatch[1]);
      const denom = DENOMINATIONS.find(d => d.value === value);
      return denom?.key || key;
    }
    return key;
  }
}

export const countSuggestionService = new CountSuggestionService();
