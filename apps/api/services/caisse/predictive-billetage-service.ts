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
} from "@shared/schema/finance";
import { eq, and, gte, desc, sql, count, avg } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { DENOMINATION_VALUES } from "@shared/config/denomination-weights";

import { 
  PredictiveSuggestionResult, 
  DailyPatternAnalysis, 
  HistoricalPattern,
  SMALL_DENOMINATIONS
} from "./predictive-billetage-types";

import { predictiveBilletageGenerator } from "./predictive-billetage-generator";

const logger = createLogger('PredictiveBilletageService');

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
      const suggestions = predictiveBilletageGenerator.generateOptimalBreakdown(
        targetAmount,
        smallDenominationRatio,
        pattern.preferredDenominations
      );

      // 4. Déterminer la confiance
      const confidence = predictiveBilletageGenerator.calculateConfidence(pattern.avgTransactionsPerSession);

      // 5. Générer les insights
      const insights = predictiveBilletageGenerator.generateInsights(pattern, dailyPattern, options);

      // 6. Suggestion alternative (plus de petites coupures)
      const alternativeSuggestions = predictiveBilletageGenerator.generateOptimalBreakdown(
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
    } catch (error: unknown) {
      logger.error({ err: error, caisseId }, 'Erreur suggestion billetage');

      // Retourner une suggestion par défaut
      return predictiveBilletageGenerator.getDefaultSuggestion(targetAmount);
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
      return predictiveBilletageGenerator.getDefaultPattern();
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
      peakHourTransactions: await this.analyzePeakHours(caisseId, thirtyDaysAgo),
    };
  }

  /**
   * Analyse les heures de pointe par nombre moyen de transactions
   */
  private async analyzePeakHours(caisseId: string, since: Date): Promise<Record<number, number>> {
    try {
      const rows = await db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${operationsCaisse.createdAt})`.as('hour'),
        cnt: count().as('cnt'),
      })
      .from(operationsCaisse)
      .innerJoin(sessionsCaisse, eq(operationsCaisse.sessionId, sessionsCaisse.id))
      .where(and(
        eq(sessionsCaisse.caisseId, caisseId),
        gte(operationsCaisse.createdAt, since),
      ))
      .groupBy(sql`EXTRACT(HOUR FROM ${operationsCaisse.createdAt})`);

      const sessionCount = (await db.select({ cnt: count() })
        .from(sessionsCaisse)
        .where(and(eq(sessionsCaisse.caisseId, caisseId), gte(sessionsCaisse.openedAt, since)))
      )[0]?.cnt || 1;

      const result: Record<number, number> = {};
      for (const row of rows) {
        result[Number(row.hour)] = Math.round(Number(row.cnt) / Number(sessionCount));
      }
      return result;
    } catch {
      return {};
    }
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

    // Calculer les moyennes de transactions pour ces sessions
    const sessionIds = sessions.map(s => s.id);
    const [txStats] = sessionIds.length > 0
      ? await db.select({
          avgCount: sql<number>`COUNT(*)::float / ${sessions.length}`,
          avgAmount: avg(operationsCaisse.montant),
        })
        .from(operationsCaisse)
        .where(sql`${operationsCaisse.sessionId} = ANY(${sessionIds})`)
      : [{ avgCount: 0, avgAmount: null }];

    return {
      dayOfWeek,
      avgTransactionCount: Number(txStats?.avgCount) || 0,
      avgTransactionAmount: Number(txStats?.avgAmount) || 0,
      avgSmallDenominationUsage: totalSmallRatio / sessions.length,
      avgLargeDenominationUsage: totalLargeRatio / sessions.length,
    };
  }
}

// Export singleton
export const predictiveBilletageService = new PredictiveBilletageService();
