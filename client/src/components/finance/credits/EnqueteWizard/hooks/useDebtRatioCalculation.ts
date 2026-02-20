import { useMemo } from 'react';
import type { CreditPlanInfo, AutreCredit } from '../types';

interface DebtRatioParams {
  montant: number;
  revenuMensuel: number;
  chargesMensuelles: number;
  autresCredits: AutreCredit[];
  creditPlan: CreditPlanInfo | null;
}

interface DebtRatioResult {
  revenuNet: number;
  echeanceEstimee: number;
  tauxEndettement: number;
  riskLevel: 'good' | 'acceptable' | 'risky';
  dureeLabel: string;
  planMaxRatio: number;
}

function calculerNombreEcheances(frequence: string, dureeValeur: number, dureeUnite: string): number {
  // Convert duration to days
  let dureeTotalJours: number;
  switch (dureeUnite) {
    case 'DAY': dureeTotalJours = dureeValeur; break;
    case 'WEEK': dureeTotalJours = dureeValeur * 7; break;
    case 'MONTH': dureeTotalJours = dureeValeur * 30; break;
    case 'YEAR': dureeTotalJours = dureeValeur * 365; break;
    default: dureeTotalJours = dureeValeur;
  }

  // Number of installments based on frequency
  switch (frequence) {
    case 'DAILY': return dureeTotalJours;
    case 'WEEKLY': return Math.ceil(dureeTotalJours / 7);
    case 'BIWEEKLY': return Math.ceil(dureeTotalJours / 14);
    case 'MONTHLY': return Math.ceil(dureeTotalJours / 30);
    case 'QUARTERLY': return Math.ceil(dureeTotalJours / 90);
    case 'SEMI_ANNUALLY': return Math.ceil(dureeTotalJours / 180);
    case 'ANNUALLY': return Math.ceil(dureeTotalJours / 365);
    default: return Math.ceil(dureeTotalJours / 30);
  }
}

function echeanceMensuelleEquivalente(echeance: number, frequence: string): number {
  // Convert any frequency installment to monthly equivalent for ratio calculation
  switch (frequence) {
    case 'DAILY': return echeance * 26; // 26 working days
    case 'WEEKLY': return echeance * 4.33;
    case 'BIWEEKLY': return echeance * 2.17;
    case 'MONTHLY': return echeance;
    case 'QUARTERLY': return echeance / 3;
    case 'SEMI_ANNUALLY': return echeance / 6;
    case 'ANNUALLY': return echeance / 12;
    default: return echeance;
  }
}

export function useDebtRatioCalculation(params: DebtRatioParams): DebtRatioResult {
  return useMemo(() => {
    const { montant, revenuMensuel, chargesMensuelles, autresCredits, creditPlan } = params;

    const totalAutresCredits = autresCredits.reduce((sum, c) => sum + (parseFloat(c.montant) || 0), 0);
    const revenuNet = revenuMensuel - chargesMensuelles - totalAutresCredits;

    let echeanceEstimee: number;
    let dureeLabel: string;
    let frequence = 'MONTHLY';

    if (creditPlan) {
      const rate = parseFloat(creditPlan.tauxInteret) || 0;
      const dureeValeur = creditPlan.dureeValeur;
      const dureeUnite = creditPlan.dureeUnite;
      frequence = creditPlan.frequenceRemboursement;

      const nombreEcheances = calculerNombreEcheances(frequence, dureeValeur, dureeUnite);

      // Flat interest: total = principal × (1 + rate/100), divided by number of installments
      const totalWithInterest = montant * (1 + rate / 100);
      const echeanceParFrequence = nombreEcheances > 0 ? Math.round(totalWithInterest / nombreEcheances) : 0;

      // Convert to monthly equivalent for ratio
      echeanceEstimee = Math.round(echeanceMensuelleEquivalente(echeanceParFrequence, frequence));

      const uniteLabels: Record<string, string> = { DAY: 'jours', WEEK: 'semaines', MONTH: 'mois', YEAR: 'ans' };
      dureeLabel = `${dureeValeur} ${uniteLabels[dureeUnite] || dureeUnite}`;
    } else {
      // Fallback without plan
      echeanceEstimee = Math.round(montant / 6);
      dureeLabel = '6 mois (estimation)';
    }

    const tauxEndettement = revenuNet > 0 ? (echeanceEstimee / revenuNet) * 100 : 100;

    const planMaxRatio = creditPlan?.maxDebtToIncomeRatio
      ? parseFloat(creditPlan.maxDebtToIncomeRatio)
      : 33;

    let riskLevel: 'good' | 'acceptable' | 'risky';
    if (tauxEndettement < planMaxRatio) riskLevel = 'good';
    else if (tauxEndettement < 45) riskLevel = 'acceptable';
    else riskLevel = 'risky';

    return { revenuNet, echeanceEstimee, tauxEndettement, riskLevel, dureeLabel, planMaxRatio };
  }, [params.montant, params.revenuMensuel, params.chargesMensuelles, params.autresCredits, params.creditPlan]);
}
