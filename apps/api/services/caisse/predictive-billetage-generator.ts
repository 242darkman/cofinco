import { DENOMINATION_VALUES } from "@shared/config/denomination-weights";
import { 
  BilletageSuggestion, 
  PredictiveSuggestionResult, 
  DailyPatternAnalysis, 
  HistoricalPattern,
  DENOMINATION_ORDER,
  DENOMINATION_LABELS,
  SMALL_DENOMINATIONS
} from "./predictive-billetage-types";

export class PredictiveBilletageGenerator {

  public generateOptimalBreakdown(
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

  public calculateConfidence(avgTransactions: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (avgTransactions >= 20) return 'HIGH';
    if (avgTransactions >= 10) return 'MEDIUM';
    return 'LOW';
  }

  public generateInsights(
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

  public getDefaultPattern(): HistoricalPattern {
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

  public getDefaultSuggestion(targetAmount: number): PredictiveSuggestionResult {
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

export const predictiveBilletageGenerator = new PredictiveBilletageGenerator();
