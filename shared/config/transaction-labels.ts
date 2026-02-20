/**
 * Transaction Labels - Libellés bancaires pour l'historique des opérations
 *
 * Ce fichier centralise tous les libellés affichés dans l'historique des comptes.
 * Les libellés suivent un style bancaire professionnel, facilement compréhensible.
 *
 * @module transaction-labels
 */

// Types d'opérations considérées comme CREDIT (entrée d'argent)
export const CREDIT_TYPES = new Set([
  'TRANSFER_IN',
  'DEPOSIT_SAVINGS',
  'DEPOSIT_CURRENT',
  'DEPOSIT_BLOCKED',
  'INITIAL_DEPOSIT',
  'SAVINGS_DEPOSIT',
  'INTEREST_PAYMENT',
  'CREDIT_DISBURSEMENT',
  'TONTINE_WITHDRAWAL',
  'TONTINE_DISTRIBUTION',
  'MOBILE_MONEY_DEPOSIT',
  'ENTREE_COFFRE_RECEPTION',
  'SAFE_SUPPLY',
  'RESTITUTION_CAISSE',
  'MISC_COLLECTION',
]);

// Types d'opérations considérées comme DEBIT (sortie d'argent)
export const DEBIT_TYPES = new Set([
  'TRANSFER_OUT',
  'INTERNAL_TRANSFER',
  'WITHDRAWAL_SAVINGS',
  'WITHDRAWAL_CURRENT',
  'WITHDRAWAL_BLOCKED',
  'SAVINGS_WITHDRAWAL',
  'CREDIT_REPAYMENT',
  'LOAN_REPAYMENT',
  'TONTINE_CONTRIBUTION',
  'ENGAGEMENT_FEE',
  'BANK_FEE',
  'MOBILE_MONEY_WITHDRAWAL',
  'SORTIE_COFFRE_TRANSIT',
  'SAFE_DEPOSIT',
  'MISC_DISBURSEMENT',
  'LIQUIDATION',
  'CASH_TRANSFER',
  'ADJUSTMENT', // Généralement débit (correction)
  'CLOSURE_PAYOUT', // Retrait de clôture
]);

/**
 * Détermine le sens (CREDIT/DEBIT) d'une opération à partir de son type
 */
export function deriveSensFromType(typePaiement: string | null | undefined): 'CREDIT' | 'DEBIT' {
  if (!typePaiement) return 'DEBIT';

  if (CREDIT_TYPES.has(typePaiement)) {
    return 'CREDIT';
  }

  // Détection par pattern pour les types non listés
  if (
    typePaiement.includes('DEPOSIT') ||
    typePaiement.includes('VERSEMENT') ||
    typePaiement.includes('ENTREE') ||
    typePaiement.includes('_IN') ||
    typePaiement.includes('RECU') ||
    typePaiement.includes('DISBURSEMENT')
  ) {
    return 'CREDIT';
  }

  return 'DEBIT';
}

/**
 * Métadonnées optionnelles pour enrichir les libellés
 */
interface TransactionMetadata {
  compteDestNumero?: string;
  compteSourceNumero?: string;
  numeroCredit?: string;
  tontineName?: string;
  motif?: string;
  clientName?: string;
  agentName?: string;
  provider?: string;
  [key: string]: unknown;
}

/**
 * Mapping des types de paiement vers des libellés bancaires
 * Les fonctions permettent d'inclure des détails contextuels (numéro compte, etc.)
 */
const TRANSACTION_LABEL_GENERATORS: Record<string, (metadata?: TransactionMetadata) => string> = {
  // ═══════════════════════════════════════════════════════════════════
  // VIREMENTS
  // ═══════════════════════════════════════════════════════════════════
  TRANSFER_OUT: (m) =>
    m?.compteDestNumero
      ? `VIR ÉMIS vers ${m.compteDestNumero}`
      : 'VIR ÉMIS',

  TRANSFER_IN: (m) =>
    m?.compteSourceNumero
      ? `VIR REÇU de ${m.compteSourceNumero}`
      : 'VIR REÇU',

  INTERNAL_TRANSFER: (m) =>
    m?.compteDestNumero
      ? `VIR INTERNE vers ${m.compteDestNumero}`
      : 'VIR INTERNE',

  // ═══════════════════════════════════════════════════════════════════
  // DÉPÔTS / VERSEMENTS
  // ═══════════════════════════════════════════════════════════════════
  DEPOSIT_SAVINGS: () => 'VERSEMENT ÉPARGNE',
  DEPOSIT_CURRENT: () => 'VERSEMENT COURANT',
  DEPOSIT_BLOCKED: () => 'VERSEMENT BLOQUÉ',
  INITIAL_DEPOSIT: () => 'VERSEMENT INITIAL OUVERTURE',
  SAVINGS_DEPOSIT: () => 'VERSEMENT ÉPARGNE',

  // ═══════════════════════════════════════════════════════════════════
  // RETRAITS
  // ═══════════════════════════════════════════════════════════════════
  WITHDRAWAL_SAVINGS: () => 'RETRAIT ÉPARGNE',
  WITHDRAWAL_CURRENT: () => 'RETRAIT COURANT',
  WITHDRAWAL_BLOCKED: () => 'RETRAIT BLOQUÉ',
  SAVINGS_WITHDRAWAL: () => 'RETRAIT ÉPARGNE',

  // ═══════════════════════════════════════════════════════════════════
  // CRÉDITS
  // ═══════════════════════════════════════════════════════════════════
  CREDIT_REPAYMENT: (m) =>
    m?.numeroCredit
      ? `REMB. CRÉDIT N°${m.numeroCredit}`
      : 'REMB. CRÉDIT',

  LOAN_REPAYMENT: (m) =>
    m?.numeroCredit
      ? `REMB. PRÊT N°${m.numeroCredit}`
      : 'REMB. PRÊT',

  CREDIT_DISBURSEMENT: (m) =>
    m?.numeroCredit
      ? `DÉCAISSEMENT CRÉDIT N°${m.numeroCredit}`
      : 'DÉCAISSEMENT CRÉDIT',

  ENGAGEMENT_FEE: () => 'FRAIS DOSSIER CRÉDIT',

  // ═══════════════════════════════════════════════════════════════════
  // TONTINES
  // ═══════════════════════════════════════════════════════════════════
  TONTINE_CONTRIBUTION: (m) =>
    m?.tontineName
      ? `COTISATION TONTINE ${m.tontineName}`
      : 'COTISATION TONTINE',

  TONTINE_WITHDRAWAL: (m) =>
    m?.tontineName
      ? `BÉNÉFICE TONTINE ${m.tontineName}`
      : 'BÉNÉFICE TONTINE',

  TONTINE_DISTRIBUTION: (m) =>
    m?.tontineName
      ? `DISTRIBUTION TONTINE ${m.tontineName}`
      : 'DISTRIBUTION TONTINE',

  // ═══════════════════════════════════════════════════════════════════
  // INTÉRÊTS & FRAIS
  // ═══════════════════════════════════════════════════════════════════
  INTEREST_PAYMENT: () => 'INTÉRÊTS CRÉDITEURS',
  BANK_FEE: () => 'FRAIS BANCAIRES',

  // ═══════════════════════════════════════════════════════════════════
  // COFFRE / CAISSE
  // ═══════════════════════════════════════════════════════════════════
  SAFE_SUPPLY: () => 'APPROVISIONNEMENT COFFRE',
  SAFE_DEPOSIT: () => 'VERSEMENT AU COFFRE',
  CASH_TRANSFER: () => 'MOUVEMENT DE FONDS',
  SORTIE_COFFRE_TRANSIT: () => 'ENVOI TRANSIT INTER-AGENCE',
  ENTREE_COFFRE_RECEPTION: () => 'RÉCEPTION TRANSIT INTER-AGENCE',
  RESTITUTION_COFFRE: () => 'RESTITUTION COFFRE',
  RESTITUTION_CAISSE: () => 'RESTITUTION CAISSE',

  // ═══════════════════════════════════════════════════════════════════
  // MOBILE MONEY
  // ═══════════════════════════════════════════════════════════════════
  MOBILE_MONEY_DEPOSIT: (m) =>
    m?.provider
      ? `DÉPÔT MOBILE ${m.provider.toUpperCase()}`
      : 'DÉPÔT MOBILE MONEY',

  MOBILE_MONEY_WITHDRAWAL: (m) =>
    m?.provider
      ? `RETRAIT MOBILE ${m.provider.toUpperCase()}`
      : 'RETRAIT MOBILE MONEY',

  // ═══════════════════════════════════════════════════════════════════
  // OPÉRATIONS SPÉCIALES
  // ═══════════════════════════════════════════════════════════════════
  ADJUSTMENT: (m) =>
    m?.motif
      ? `RÉGULARISATION: ${m.motif}`
      : 'RÉGULARISATION COMPTABLE',

  LIQUIDATION: () => 'SOLDE CLÔTURE COMPTE',

  MISC_COLLECTION: (m) =>
    m?.motif
      ? `ENCAISSEMENT: ${m.motif}`
      : 'ENCAISSEMENT DIVERS',

  MISC_DISBURSEMENT: (m) =>
    m?.motif
      ? `DÉCAISSEMENT: ${m.motif}`
      : 'DÉCAISSEMENT DIVERS',

  CLOSURE_PAYOUT: () => 'RETRAIT CLÔTURE COMPTE',

  // ═══════════════════════════════════════════════════════════════════
  // FRAIS D'OUVERTURE / CLÔTURE
  // ═══════════════════════════════════════════════════════════════════
  OPENING_FEE: () => "FRAIS D'OUVERTURE",
  CLOSING_FEE: () => 'FRAIS DE CLÔTURE',
  MAINTENANCE_FEE: () => 'FRAIS DE TENUE DE COMPTE',

  // ═══════════════════════════════════════════════════════════════════
  // COMMISSIONS & PRIMES
  // ═══════════════════════════════════════════════════════════════════
  COMMISSION: () => 'COMMISSION',
  AGENT_COMMISSION: () => 'COMMISSION AGENT',
  PROSPECTION_PRIME: () => 'PRIME DE PROSPECTION',
  FEE_REFUND: () => 'REMBOURSEMENT DE FRAIS',
  SALARY_PAYMENT: () => 'PAIEMENT SALAIRE',

  // ═══════════════════════════════════════════════════════════════════
  // OPÉRATIONS AGENTS / SESSIONS
  // ═══════════════════════════════════════════════════════════════════
  AGENT_PROVISIONING: () => 'APPROVISIONNEMENT AGENT',
  AGENT_SETTLEMENT: () => 'REMISE AGENT TERRAIN',
  AGENT_SESSION_CLOSE: () => 'CLÔTURE SESSION AGENT',
  SESSION_CLOSING_TRANSFER: () => 'TRANSFERT CLÔTURE SESSION',

  // ═══════════════════════════════════════════════════════════════════
  // MOBILE MONEY - FRAIS
  // ═══════════════════════════════════════════════════════════════════
  OPERATOR_FEE: () => 'FRAIS OPÉRATEUR MOBILE',
  MM_FEE_REVENUE: () => 'REVENU FRAIS MOBILE MONEY',

  // ═══════════════════════════════════════════════════════════════════
  // TRANSIT COFFRE
  // ═══════════════════════════════════════════════════════════════════
  COFFRE_TRANSIT_OUT: () => 'ENVOI TRANSIT COFFRE',
  COFFRE_TRANSIT_IN: () => 'RÉCEPTION TRANSIT COFFRE',
};

/**
 * Obtient le libellé bancaire pour un type de paiement
 *
 * @param typePaiement - Code du type de paiement (ex: "TRANSFER_IN")
 * @param metadata - Données contextuelles optionnelles (numéro compte, etc.)
 * @returns Libellé formaté style bancaire
 *
 * @example
 * getTransactionLabel('TRANSFER_IN', { compteSourceNumero: '001-0012345' })
 * // => "VIR REÇU de 001-0012345"
 *
 * @example
 * getTransactionLabel('DEPOSIT_SAVINGS')
 * // => "VERSEMENT ÉPARGNE"
 */
export function getTransactionLabel(
  typePaiement: string | null | undefined,
  metadata?: TransactionMetadata
): string {
  if (!typePaiement) {
    return 'OPÉRATION';
  }

  const generator = TRANSACTION_LABEL_GENERATORS[typePaiement];
  if (generator) {
    return generator(metadata);
  }

  // Fallback: Humaniser le code technique
  // "SOME_TYPE_CODE" → "Some Type Code"
  return typePaiement
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Formatage complet d'une transaction pour affichage
 * Combine libellé + observations utilisateur si présentes
 */
export function formatTransactionDescription(
  typePaiement: string | null | undefined,
  observations: string | null | undefined,
  metadata?: TransactionMetadata
): string {
  const label = getTransactionLabel(typePaiement, metadata);

  // Si des observations existent et sont différentes du label généré
  if (observations && observations.trim() && observations !== typePaiement) {
    // Nettoyer les observations des préfixes techniques
    const cleanObs = observations
      .replace(/^Virement (vers|depuis|programmé)/i, '')
      .replace(/^Versement /i, '')
      .replace(/^Retrait /i, '')
      .trim();

    if (cleanObs && cleanObs !== label) {
      return `${label} - ${cleanObs}`;
    }
  }

  return label;
}

export default {
  CREDIT_TYPES,
  DEBIT_TYPES,
  deriveSensFromType,
  getTransactionLabel,
  formatTransactionDescription,
};
