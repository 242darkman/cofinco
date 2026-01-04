
export interface ScoringFactors {
  revenuMensuel: number;
  chargesMensuelles: number;
  montantDemande: number;
  dureeMois: number;
  pointsFidelite?: number; // 0-1000+
  valeurGaranties?: number;
  historiqueCredits?: { statut: string; retards: number }[];
}

export interface ScoringResult {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  recommendation: 'APPROVE' | 'REVIEW_REQUIRED' | 'REJECT';
  capaciteRemboursement: number;
  tauxEndettement: number;
  details: {
    capaciteScore: number;
    historiqueScore: number;
    garantieScore: number;
  };
}

export function calculateCreditScore(factors: ScoringFactors): ScoringResult {
  const { 
    revenuMensuel, 
    chargesMensuelles, 
    montantDemande, 
    dureeMois,
    pointsFidelite = 0,
    valeurGaranties = 0
  } = factors;

  // 1. Capacité de Remboursement (40%)
  const revenuNet = revenuMensuel - chargesMensuelles;
  const echeanceEstimee = montantDemande / dureeMois; // Simple calc without interest for base capacity
  // Taux d'endettement idéal < 33%, acceptable < 45%
  const tauxEndettement = revenuNet > 0 ? (echeanceEstimee / revenuNet) * 100 : 100;
  
  let capaciteScore = 0;
  if (tauxEndettement <= 30) capaciteScore = 100;
  else if (tauxEndettement <= 40) capaciteScore = 80;
  else if (tauxEndettement <= 50) capaciteScore = 50;
  else if (tauxEndettement <= 60) capaciteScore = 20;
  else capaciteScore = 0;

  // 2. Historique & Fidélité (30%)
  // Base 50 + points (100 pts fidelité = +10 score)
  let historiqueScore = Math.min(100, 50 + (pointsFidelite / 10)); 
  // If we had credit history passed, we would adjust heavily here
  if (factors.historiqueCredits && factors.historiqueCredits.length > 0) {
      const badCredits = factors.historiqueCredits.filter(c => c.statut === 'en_retard' || c.retards > 0).length;
      if (badCredits > 0) historiqueScore -= (badCredits * 30);
  }
  historiqueScore = Math.max(0, historiqueScore);

  // 3. Garanties (30%)
  // Coverage ratio
  const coverageRatio = (valeurGaranties / montantDemande) * 100;
  let garantieScore = 0;
  if (coverageRatio >= 150) garantieScore = 100;
  else if (coverageRatio >= 100) garantieScore = 90;
  else if (coverageRatio >= 80) garantieScore = 70;
  else if (coverageRatio >= 50) garantieScore = 50;
  else if (coverageRatio >= 20) garantieScore = 30;
  else garantieScore = 10;

  // Total Score Weighted
  const totalScore = Math.round(
    (capaciteScore * 0.4) + 
    (historiqueScore * 0.3) + 
    (garantieScore * 0.3)
  );

  let grade: ScoringResult['grade'] = 'E';
  let recommendation: ScoringResult['recommendation'] = 'REJECT';

  if (totalScore >= 80) { grade = 'A'; recommendation = 'APPROVE'; }
  else if (totalScore >= 70) { grade = 'B'; recommendation = 'APPROVE'; }
  else if (totalScore >= 50) { grade = 'C'; recommendation = 'REVIEW_REQUIRED'; }
  else if (totalScore >= 40) { grade = 'D'; recommendation = 'REVIEW_REQUIRED'; }
  else { grade = 'E'; recommendation = 'REJECT'; }

  return {
    score: totalScore,
    grade,
    recommendation,
    capaciteRemboursement: revenuNet,
    tauxEndettement: Math.round(tauxEndettement),
    details: {
      capaciteScore,
      historiqueScore,
      garantieScore
    }
  };
}
