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

// Ordre des dénominations (du plus grand au plus petit)
export const DENOMINATION_ORDER = [
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
export const DENOMINATION_LABELS: Record<string, string> = {
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
export const SMALL_DENOMINATIONS = [
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
