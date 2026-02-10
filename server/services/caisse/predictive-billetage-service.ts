/**
 * Service de Suggestion de Billetage Prédictif
 *
 * Analyse l'historique des transactions et des clôtures pour suggérer:
 * - La répartition optimale des coupures pour l'ouverture
 * - Les besoins en petites coupures basés sur le volume de transactions
 * - Les tendances saisonnières (jour de la semaine, fin de mois)
 */

import { db } from "../../db";
import {
  sessionsCaisse,
  operationsCaisse,
  denominationTemplates,
  caisses,
} from "@shared/schema/finance";
import { comptageBillets } from "@shared/schema/operations";
import { agences } from "@shared/schema";
import { eq, and, gte, lte, desc, sql, count, avg, sum } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { DENOMINATION_VALUES } from "@shared/config/denomination-weights";

const logger = createLogger('PredictiveBilletageService');

// ============================================================================
// TYPES
// ============================================================================

export interface BilletageSuggestion {
  denomination: string;
  label: string;
  count: number;
  value: number;
  percentage: number;
  reason?: string;
}

export interface PredictiveSuggestionResult {
  suggestions: BilletageSuggestion[];
  totalAmount: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  basedOn: {
    sessionsAnalyzed: number;
    periodDays: number;
    dayOfWeek?: string;
    isEndOfMonth?: boolean;
  };
  insights: string[];
  alternativeSuggestions?: BilletageSuggestion[];
}

export interface DailyPatternAnalysis {
  dayOfWeek: number; // 0 = Sunday
  avgTransactionCount: number;
  avgTransactionAmount: number;
  avgSmallDenominationUsage: number; // % of small bills needed
  avgLargeDenominationUsage: number;
}

export interface HistoricalPattern {
  avgOpeningAmount: number;
  avgClosingAmount: number;
  avgTransactionsPerSession: number;
  avgTransactionValue: number;
  preferredDenominations: Record<string, number>; // Average count per denomination
  smallDenominationRatio: number; // Ratio of small denominations needed
  peakHourTransactions: Record<number, number>; // Hour -> avg count
}

// ============================================================================
// CONSTANTES
// ============================================================================

// Ordre des dénominations (du plus grand au plus petit)
const DENOMINATION_ORDER = [
  'billets_10000',
  'billets_5000',
  'billets_2000',
  'billets_1000',
  'billets_500',
  'billets_200',
  'billets_100',
  'billets_50',
  'pieces_500',
  'pieces_200',
  'pieces_100',
  'pieces_50',
  'pieces_25',
  'pieces_20',
  'pieces_10',
  'pieces_5',
  'pieces_1',
];

// Labels français pour les dénominations
const DENOMINATION_LABELS: Record<string, string> = {
  billets_10000: '10 000 XOF',
  billets_5000: '5 000 XOF',
  billets_2000: '2 000 XOF',
  billets_1000: '1 000 XOF',
  billets_500: '500 XOF (billet)',
  billets_200: '200 XOF (billet)',
  billets_100: '100 XOF (billet)',
  billets_50: '50 XOF (billet)',
  pieces_500: '500 XOF (pièce)',
  pieces_200: '200 XOF (pièce)',
  pieces_100: '100 XOF (pièce)',
  pieces_50: '50 XOF (pièce)',
  pieces_25: '25 XOF',
  pieces_20: '20 XOF',
  pieces_10: '10 XOF',
  pieces_5: '5 XOF',
  pieces_1: '1 XOF',
};

// Dénominations considérées comme "petites" (pour la monnaie)
const SMALL_DENOMINATIONS = [
  'billets_500',
  'billets_200',
  'billets_100',
  'billets_50',
  'pieces_500',
  'pieces_200',
  'pieces_100',
  'pieces_50',
  'pieces_25',
  'pieces_20',
  'pieces_10',
  'pieces_5',
  'pieces_1',
];

// ============================================================================
// SERVICE
// ============================================================================

export class PredictiveBilletageService {

  /**
   * Génère une suggestion de billetage pour l'ouverture de caisse
   */
  async getSuggestion(params: {
    caisseId: string;
    targetAmount: number;
    options?: {
      prioritizeSmallDenominations?: boolean;
      dayOfWeek?: number;
      isEndOfMonth?: boolean;
    };
  }): Promise<PredictiveSuggestionResult> {
    const { caisseId, targetAmount, options = {} } = params;

    try {
      // 1. Analyser l'historique
      const pattern = await this.analyzeHistoricalPattern(caisseId);
      const dailyPattern = await this.analyzeDailyPattern(caisseId, options.dayOfWeek);

      // 2. Déterminer le besoin en petites coupures
      let smallDenominationRatio = pattern.smallDenominationRatio;

      // Ajuster selon le jour de la semaine
      if (dailyPattern) {
        smallDenominationRatio = dailyPattern.avgSmallDenominationUsage / 100;
      }

      // Fin de mois = plus de petites coupures (salaires)
      if (options.isEndOfMonth) {
        smallDenominationRatio = Math.min(1, smallDenominationRatio * 1.3);
      }

      // Option priorité petites coupures
      if (options.prioritizeSmallDenominations) {
        smallDenominationRatio = Math.min(1, smallDenominationRatio * 1.5);
      }

      // 3. Générer la suggestion
      const suggestions = this.generateOptimalBreakdown(
        targetAmount,
        smallDenominationRatio,
        pattern.preferredDenominations
      );

      // 4. Déterminer la confiance
      const confidence = this.calculateConfidence(pattern.avgTransactionsPerSession);

      // 5. Générer les insights
      const insights = this.generateInsights(pattern, dailyPattern, options);

      // 6. Suggestion alternative (plus de petites coupures)
      const alternativeSuggestions = this.generateOptimalBreakdown(
        targetAmount,
        Math.min(1, smallDenominationRatio * 1.5),
        pattern.preferredDenominations
      );

      return {
        suggestions,
        totalAmount: suggestions.reduce((sum, s) => sum + s.value, 0),
        confidence,
        basedOn: {
          sessionsAnalyzed: Math.round(pattern.avgTransactionsPerSession > 0 ? 30 : 0),
          periodDays: 30,
          dayOfWeek: options.dayOfWeek !== undefined
            ? ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][options.dayOfWeek]
            : undefined,
          isEndOfMonth: options.isEndOfMonth,
        },
        insights,
        alternativeSuggestions: alternativeSuggestions.some(
          (s, i) => s.count !== suggestions[i]?.count
        )
          ? alternativeSuggestions
          : undefined,
      };
    } catch (error: any) {
      logger.error({ err: error, caisseId }, 'Erreur suggestion billetage');

      // Retourner une suggestion par défaut
      return this.getDefaultSuggestion(targetAmount);
    }
  }

  /**
   * Analyse les patterns historiques d'une caisse
   */
  async analyzeHistoricalPattern(caisseId: string): Promise<HistoricalPattern> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Récupérer les sessions des 30 derniers jours
    const sessions = await db.select({
      id: sessionsCaisse.id,
      montantOuverture: sessionsCaisse.montantOuverture,
      montantFermetureTheorique: sessionsCaisse.montantFermetureTheorique,
      billetageOuverture: sessionsCaisse.billetageOuverture,
      billetageFermeture: sessionsCaisse.billetageFermeture,
      openedAt: sessionsCaisse.openedAt,
    })
    .from(sessionsCaisse)
    .where(and(
      eq(sessionsCaisse.caisseId, caisseId),
      eq(sessionsCaisse.statut, 'CLOSED'),
      gte(sessionsCaisse.openedAt, thirtyDaysAgo)
    ))
    .orderBy(desc(sessionsCaisse.openedAt))
    .limit(30);

    if (sessions.length === 0) {
      return this.getDefaultPattern();
    }

    // Calculer les moyennes
    let totalOpeningAmount = 0;
    let totalClosingAmount = 0;
    const allBilletages: Record<string, number[]> = {};

    for (const session of sessions) {
      totalOpeningAmount += Number(session.montantOuverture || 0);
      totalClosingAmount += Number(session.montantFermetureTheorique || 0);

      // Analyser le billetage d'ouverture
      const billetage = session.billetageOuverture as Record<string, number> | null;
      if (billetage) {
        for (const [denom, count] of Object.entries(billetage)) {
          if (!allBilletages[denom]) allBilletages[denom] = [];
          allBilletages[denom].push(count);
        }
      }
    }

    // Calculer les moyennes par dénomination
    const preferredDenominations: Record<string, number> = {};
    let totalSmallValue = 0;
    let totalValue = 0;

    for (const [denom, counts] of Object.entries(allBilletages)) {
      const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
      preferredDenominations[denom] = Math.round(avgCount);

      const denomValue = DENOMINATION_VALUES[denom] || 0;
      const value = avgCount * denomValue;
      totalValue += value;

      if (SMALL_DENOMINATIONS.includes(denom)) {
        totalSmallValue += value;
      }
    }

    // Compter les opérations moyennes par session
    const [opStats] = await db.select({
      avgCount: avg(sql`(
        SELECT COUNT(*) FROM operations_caisse
        WHERE session_id = ${sessionsCaisse.id}
      )`),
      avgValue: avg(sql`(
        SELECT AVG(montant) FROM operations_caisse
        WHERE session_id = ${sessionsCaisse.id}
      )`),
    })
    .from(sessionsCaisse)
    .where(and(
      eq(sessionsCaisse.caisseId, caisseId),
      gte(sessionsCaisse.openedAt, thirtyDaysAgo)
    ));

    return {
      avgOpeningAmount: totalOpeningAmount / sessions.length,
      avgClosingAmount: totalClosingAmount / sessions.length,
      avgTransactionsPerSession: Number(opStats?.avgCount) || 20,
      avgTransactionValue: Number(opStats?.avgValue) || 15000,
      preferredDenominations,
      smallDenominationRatio: totalValue > 0 ? totalSmallValue / totalValue : 0.3,
      peakHourTransactions: {}, // TODO: Implémenter l'analyse par heure
    };
  }

  /**
   * Analyse les patterns par jour de la semaine
   */
  async analyzeDailyPattern(caisseId: string, dayOfWeek?: number): Promise<DailyPatternAnalysis | null> {
    if (dayOfWeek === undefined) {
      dayOfWeek = new Date().getDay();
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Récupérer les sessions du même jour de la semaine
    const sessions = await db.select({
      id: sessionsCaisse.id,
      montantOuverture: sessionsCaisse.montantOuverture,
      billetageOuverture: sessionsCaisse.billetageOuverture,
      openedAt: sessionsCaisse.openedAt,
    })
    .from(sessionsCaisse)
    .where(and(
      eq(sessionsCaisse.caisseId, caisseId),
      eq(sessionsCaisse.statut, 'CLOSED'),
      gte(sessionsCaisse.openedAt, thirtyDaysAgo),
      sql`EXTRACT(DOW FROM ${sessionsCaisse.openedAt}) = ${dayOfWeek}`
    ));

    if (sessions.length < 2) {
      return null;
    }

    // Calculer les métriques
    let totalSmallRatio = 0;
    let totalLargeRatio = 0;

    for (const session of sessions) {
      const billetage = session.billetageOuverture as Record<string, number> | null;
      if (!billetage) continue;

      let smallValue = 0;
      let largeValue = 0;
      let totalValue = 0;

      for (const [denom, count] of Object.entries(billetage)) {
        const denomValue = (DENOMINATION_VALUES[denom] || 0) * count;
        totalValue += denomValue;
        if (SMALL_DENOMINATIONS.includes(denom)) {
          smallValue += denomValue;
        } else {
          largeValue += denomValue;
        }
      }

      if (totalValue > 0) {
        totalSmallRatio += (smallValue / totalValue) * 100;
        totalLargeRatio += (largeValue / totalValue) * 100;
      }
    }

    return {
      dayOfWeek,
      avgTransactionCount: 0, // TODO
      avgTransactionAmount: 0, // TODO
      avgSmallDenominationUsage: totalSmallRatio / sessions.length,
      avgLargeDenominationUsage: totalLargeRatio / sessions.length,
    };
  }

  /**
   * Récupère les templates de billetage fréquemment utilisés
   */
  async getFrequentTemplates(agenceId?: string, caisseId?: string): Promise<{
    id: string;
    nom: string;
    billetage: Record<string, number>;
    totalCalcule: number;
    usageCount: number;
  }[]> {
    const conditions = [];
    if (caisseId) conditions.push(eq(denominationTemplates.caisseId, caisseId));
    else if (agenceId) conditions.push(eq(denominationTemplates.agenceId, agenceId));

    const templates = await db.select({
      id: denominationTemplates.id,
      nom: denominationTemplates.nom,
      billetage: denominationTemplates.billetage,
      totalCalcule: denominationTemplates.totalCalcule,
      usageCount: denominationTemplates.usageCount,
    })
    .from(denominationTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(denominationTemplates.usageCount))
    .limit(5);

    return templates.map(t => ({
      id: t.id,
      nom: t.nom,
      billetage: t.billetage as Record<string, number>,
      totalCalcule: Number(t.totalCalcule),
      usageCount: t.usageCount || 0,
    }));
  }

  /**
   * Sauvegarde un template de billetage personnalisé
   */
  async saveTemplate(params: {
    nom: string;
    description?: string;
    billetage: Record<string, number>;
    agenceId?: string;
    caisseId?: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const totalCalcule = Object.entries(params.billetage).reduce((sum, [denom, count]) => {
      return sum + (DENOMINATION_VALUES[denom] || 0) * count;
    }, 0);

    const [template] = await db.insert(denominationTemplates).values({
      nom: params.nom,
      description: params.description,
      agenceId: params.agenceId || null,
      caisseId: params.caisseId || null,
      billetage: params.billetage,
      totalCalcule: totalCalcule.toString(),
      typeTemplate: 'CUSTOM',
      createdBy: params.createdBy,
    }).returning({ id: denominationTemplates.id });

    logger.info({ templateId: template.id, nom: params.nom }, 'Template billetage sauvegardé');

    return template;
  }

  // ============================================================================
  // MÉTHODES PRIVÉES
  // ============================================================================

  private generateOptimalBreakdown(
    targetAmount: number,
    smallDenominationRatio: number,
    historicalPreferences?: Record<string, number>
  ): BilletageSuggestion[] {
    const suggestions: BilletageSuggestion[] = [];
    let remaining = targetAmount;

    // Calculer la part pour les petites coupures
    const smallDenominationTarget = targetAmount * smallDenominationRatio;
    let smallDenominationRemaining = smallDenominationTarget;

    // D'abord allouer les grandes coupures
    for (const denom of DENOMINATION_ORDER) {
      if (remaining <= 0) break;
      if (SMALL_DENOMINATIONS.includes(denom)) continue;

      const denomValue = DENOMINATION_VALUES[denom] || 0;
      if (denomValue > remaining) continue;

      // Utiliser l'historique si disponible
      let count = 0;
      if (historicalPreferences?.[denom]) {
        count = Math.min(
          historicalPreferences[denom],
          Math.floor(remaining / denomValue)
        );
      } else {
        // Allocation standard: max 70% dans les grosses coupures
        const maxForDenom = (targetAmount - smallDenominationTarget) * 0.5;
        count = Math.floor(Math.min(remaining, maxForDenom) / denomValue);
      }

      if (count > 0) {
        const value = count * denomValue;
        suggestions.push({
          denomination: denom,
          label: DENOMINATION_LABELS[denom] || denom,
          count,
          value,
          percentage: Math.round((value / targetAmount) * 100),
          reason: historicalPreferences?.[denom]
            ? 'Basé sur vos habitudes'
            : 'Allocation standard',
        });
        remaining -= value;
      }
    }

    // Ensuite allouer les petites coupures
    for (const denom of DENOMINATION_ORDER) {
      if (remaining <= 0) break;
      if (!SMALL_DENOMINATIONS.includes(denom)) continue;

      const denomValue = DENOMINATION_VALUES[denom] || 0;
      if (denomValue > remaining) continue;

      let count = 0;
      if (historicalPreferences?.[denom]) {
        count = Math.min(
          historicalPreferences[denom],
          Math.floor(remaining / denomValue)
        );
      } else {
        // Pour les petites coupures, garder un bon stock
        count = Math.min(
          Math.floor(smallDenominationRemaining / denomValue),
          Math.floor(remaining / denomValue),
          20 // Max 20 de chaque petit billet
        );
      }

      if (count > 0) {
        const value = count * denomValue;
        suggestions.push({
          denomination: denom,
          label: DENOMINATION_LABELS[denom] || denom,
          count,
          value,
          percentage: Math.round((value / targetAmount) * 100),
          reason: 'Pour rendre la monnaie',
        });
        remaining -= value;
        smallDenominationRemaining -= value;
      }
    }

    // Compléter avec les grosses coupures si reste
    if (remaining > 0) {
      for (const denom of DENOMINATION_ORDER) {
        if (remaining <= 0) break;

        const denomValue = DENOMINATION_VALUES[denom] || 0;
        if (denomValue > remaining) continue;

        const count = Math.floor(remaining / denomValue);
        if (count > 0) {
          const existing = suggestions.find(s => s.denomination === denom);
          if (existing) {
            existing.count += count;
            existing.value += count * denomValue;
            existing.percentage = Math.round((existing.value / targetAmount) * 100);
          } else {
            suggestions.push({
              denomination: denom,
              label: DENOMINATION_LABELS[denom] || denom,
              count,
              value: count * denomValue,
              percentage: Math.round((count * denomValue / targetAmount) * 100),
              reason: 'Complément',
            });
          }
          remaining -= count * denomValue;
        }
      }
    }

    return suggestions.sort((a, b) => {
      const indexA = DENOMINATION_ORDER.indexOf(a.denomination);
      const indexB = DENOMINATION_ORDER.indexOf(b.denomination);
      return indexA - indexB;
    });
  }

  private calculateConfidence(avgTransactions: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (avgTransactions >= 20) return 'HIGH';
    if (avgTransactions >= 10) return 'MEDIUM';
    return 'LOW';
  }

  private generateInsights(
    pattern: HistoricalPattern,
    dailyPattern: DailyPatternAnalysis | null,
    options: { isEndOfMonth?: boolean }
  ): string[] {
    const insights: string[] = [];

    if (pattern.smallDenominationRatio > 0.4) {
      insights.push('Votre caisse utilise beaucoup de petites coupures - gardez un bon stock');
    }

    if (dailyPattern && dailyPattern.avgSmallDenominationUsage > 40) {
      insights.push(`Ce jour de la semaine nécessite typiquement ${Math.round(dailyPattern.avgSmallDenominationUsage)}% de petites coupures`);
    }

    if (options.isEndOfMonth) {
      insights.push('Fin de mois: prévoyez plus de petites coupures pour les salaires');
    }

    if (pattern.avgTransactionValue > 50000) {
      insights.push('Vos transactions moyennes sont élevées - gardez des grosses coupures');
    }

    if (insights.length === 0) {
      insights.push('Suggestion basée sur les tendances historiques de votre caisse');
    }

    return insights;
  }

  private getDefaultPattern(): HistoricalPattern {
    return {
      avgOpeningAmount: 500000,
      avgClosingAmount: 600000,
      avgTransactionsPerSession: 20,
      avgTransactionValue: 15000,
      preferredDenominations: {},
      smallDenominationRatio: 0.3,
      peakHourTransactions: {},
    };
  }

  private getDefaultSuggestion(targetAmount: number): PredictiveSuggestionResult {
    const suggestions = this.generateOptimalBreakdown(targetAmount, 0.3);

    return {
      suggestions,
      totalAmount: suggestions.reduce((sum, s) => sum + s.value, 0),
      confidence: 'LOW',
      basedOn: {
        sessionsAnalyzed: 0,
        periodDays: 0,
      },
      insights: ['Suggestion par défaut - pas assez d\'historique disponible'],
    };
  }
}

// Export singleton
export const predictiveBilletageService = new PredictiveBilletageService();
