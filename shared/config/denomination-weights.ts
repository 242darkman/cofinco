/**
 * Denomination Weight Reference
 *
 * Poids de référence des billets et pièces en grammes.
 * Utilisé pour vérifier la cohérence entre le billetage déclaré
 * et le poids physique mesuré (balance de comptage).
 *
 * Source: Spécifications BEAC (Banque des États de l'Afrique Centrale)
 * Note: Les poids sont approximatifs et varient légèrement selon l'usure.
 */

// Poids moyen en grammes par billet
export const BANKNOTE_WEIGHTS: Record<string, number> = {
  billets_10000: 1.15,
  billets_5000: 1.12,
  billets_2000: 0.92,
  billets_1000: 0.87,
  billets_500: 0.85,
  billets_200: 0.80,
  billets_100: 0.78,
  billets_50: 0.75,
};

// Poids moyen en grammes par pièce
export const COIN_WEIGHTS: Record<string, number> = {
  pieces_500: 8.0,
  pieces_200: 7.0,
  pieces_100: 7.0,
  pieces_50: 2.8,
  pieces_25: 3.5,
  pieces_20: 3.0,
  pieces_10: 3.0,
  pieces_5: 2.5,
  pieces_1: 2.0,
};

// Toutes les dénominations avec leur poids
export const ALL_DENOMINATION_WEIGHTS: Record<string, number> = {
  ...BANKNOTE_WEIGHTS,
  ...COIN_WEIGHTS,
};

// Valeurs monétaires par dénomination
export const DENOMINATION_VALUES: Record<string, number> = {
  billets_10000: 10000,
  billets_5000: 5000,
  billets_2000: 2000,
  billets_1000: 1000,
  billets_500: 500,
  billets_200: 200,
  billets_100: 100,
  billets_50: 50,
  pieces_500: 500,
  pieces_200: 200,
  pieces_100: 100,
  pieces_50: 50,
  pieces_25: 25,
  pieces_20: 20,
  pieces_10: 10,
  pieces_5: 5,
  pieces_1: 1,
};

// Tolérance de poids (en pourcentage) pour les billets usagés
const WEIGHT_TOLERANCE_PERCENT = 5; // 5% de marge

export interface WeightVerificationResult {
  expectedWeightGrams: number;
  actualWeightGrams: number;
  differenceGrams: number;
  differencePercent: number;
  withinTolerance: boolean;
  status: 'OK' | 'ALERTE_LEGERE' | 'ALERTE_MOYENNE' | 'SUSPECT';
  totalDeclaredValue: number;
  estimatedValueFromWeight: number;
  valueDifference: number;
  breakdown: Array<{
    denomination: string;
    count: number;
    expectedWeightGrams: number;
    value: number;
  }>;
}

/**
 * Calcule le poids attendu d'un billetage et compare avec le poids réel
 */
export function verifyBilletageWeight(
  billetage: Record<string, number>,
  actualWeightGrams: number
): WeightVerificationResult {
  let expectedWeight = 0;
  let totalValue = 0;
  const breakdown: WeightVerificationResult['breakdown'] = [];

  for (const [denom, count] of Object.entries(billetage)) {
    if (count <= 0) continue;

    // Normalize key
    const normalizedKey = denom.replace(/[^a-z0-9_]/gi, '');
    const weight = ALL_DENOMINATION_WEIGHTS[normalizedKey] || ALL_DENOMINATION_WEIGHTS[denom];
    const value = DENOMINATION_VALUES[normalizedKey] || DENOMINATION_VALUES[denom];

    if (weight && value) {
      const denomWeight = weight * count;
      expectedWeight += denomWeight;
      totalValue += value * count;
      breakdown.push({
        denomination: denom,
        count,
        expectedWeightGrams: denomWeight,
        value: value * count,
      });
    }
  }

  const difference = Math.abs(actualWeightGrams - expectedWeight);
  const differencePercent = expectedWeight > 0
    ? (difference / expectedWeight) * 100
    : (actualWeightGrams > 0 ? 100 : 0);

  // Estimate value from weight (using average weight per value unit)
  const avgWeightPerUnit = expectedWeight > 0 ? expectedWeight / totalValue : 0;
  const estimatedValue = avgWeightPerUnit > 0
    ? Math.round(actualWeightGrams / avgWeightPerUnit)
    : 0;

  let status: WeightVerificationResult['status'] = 'OK';
  if (differencePercent > 15) {
    status = 'SUSPECT';
  } else if (differencePercent > 10) {
    status = 'ALERTE_MOYENNE';
  } else if (differencePercent > WEIGHT_TOLERANCE_PERCENT) {
    status = 'ALERTE_LEGERE';
  }

  return {
    expectedWeightGrams: Math.round(expectedWeight * 100) / 100,
    actualWeightGrams,
    differenceGrams: Math.round(difference * 100) / 100,
    differencePercent: Math.round(differencePercent * 100) / 100,
    withinTolerance: differencePercent <= WEIGHT_TOLERANCE_PERCENT,
    status,
    totalDeclaredValue: totalValue,
    estimatedValueFromWeight: estimatedValue,
    valueDifference: Math.abs(totalValue - estimatedValue),
    breakdown,
  };
}

/**
 * Calcule uniquement le poids attendu d'un billetage
 */
export function calculateExpectedWeight(billetage: Record<string, number>): number {
  let total = 0;
  for (const [denom, count] of Object.entries(billetage)) {
    if (count <= 0) continue;
    const normalizedKey = denom.replace(/[^a-z0-9_]/gi, '');
    const weight = ALL_DENOMINATION_WEIGHTS[normalizedKey] || ALL_DENOMINATION_WEIGHTS[denom] || 0;
    total += weight * count;
  }
  return Math.round(total * 100) / 100;
}
