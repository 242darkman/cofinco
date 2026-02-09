/**
 * Types, constantes et helpers pour les rapports de clôture de session caisse.
 * Le rendu est désormais assuré par ClosingReportTemplate (React+Tailwind)
 * et le PDF par useReceiptPDF (html2canvas).
 */

export interface BilletageRow {
  denomination: number;
  count: number;
  total: number;
}

export interface ClosureReportData {
  // Session info
  sessionId: string;
  caisseNom: string;
  agenceNom: string;
  agenceCode?: string;

  // Cashier info
  caissierNom: string;
  caissierId: string;

  // Timing
  openedAt: string;
  closedAt: string;

  // Balances
  soldeOuverture: number;
  totalEntrees: number;
  totalSorties: number;
  soldeTheorique: number;
  soldePhysique: number;
  ecart: number;
  ecartJustification?: string;

  // Billetage
  billetage: Record<string, number>;

  // Transfers
  montantVersCoffre: number;
  montantReporte: number;

  // Mobile Money
  mmReconciliation?: {
    provider: string;
    expectedBalance: number;
    providerBalance: number | null;
    ecart: number;
    status: string;
  }[];

  // Signature
  signatureNumérique?: string;
  observations?: string;
}

export const DENOMINATIONS = [
  { key: 'billets_10000', value: 10000, label: '10 000 FCFA' },
  { key: 'billets_5000', value: 5000, label: '5 000 FCFA' },
  { key: 'billets_1000', value: 1000, label: '1 000 FCFA' },
  { key: 'billets_500', value: 500, label: '500 FCFA' },
  { key: 'billets_200', value: 200, label: '200 FCFA' },
  { key: 'billets_100', value: 100, label: '100 FCFA' },
  { key: 'billets_50', value: 50, label: '50 FCFA' },
  { key: 'pieces_20', value: 20, label: '20 FCFA' },
  { key: 'pieces_10', value: 10, label: '10 FCFA' },
  { key: 'pieces_5', value: 5, label: '5 FCFA' },
];

export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount) + ' FCFA';
};

export const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Generate a digital signature hash for audit purposes
 */
export const generateSignature = (data: ClosureReportData): string => {
  const signatureData = `${data.sessionId}|${data.closedAt}|${data.soldePhysique}|${data.ecart}`;
  let hash = 0;
  for (let i = 0; i < signatureData.length; i++) {
    const char = signatureData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
};
