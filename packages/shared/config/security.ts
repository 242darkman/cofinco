/**
 * Configuration de sécurité pour les opérations financières
 *
 * OTP_ENABLED: Active/désactive la validation OTP pour toutes les opérations
 * - Si false: bypass complet de l'OTP (utile quand pas d'API SMS)
 * - Si true: OTP requis selon les règles définies
 *
 * REQUIRE_ACCOUNT_HOLDER_PRESENCE: Exige la présence du titulaire pour les retraits
 * - Remplace l'OTP par une confirmation de présence physique
 */

export interface SecurityConfig {
  /**
   * Active/désactive globalement la validation OTP
   * @default false - Désactivé car pas d'API SMS disponible
   */
  OTP_ENABLED: boolean;

  /**
   * Exige la confirmation de présence du titulaire pour les retraits
   * @default true
   */
  REQUIRE_ACCOUNT_HOLDER_PRESENCE: boolean;

  /**
   * Types d'opérations nécessitant la présence du titulaire
   */
  OPERATIONS_REQUIRING_PRESENCE: string[];

  /**
   * Montant minimum déclenchant la vérification de présence (en FCFA)
   * @default 0 - Toujours vérifier
   */
  PRESENCE_VERIFICATION_THRESHOLD: number;
}

export const SECURITY_CONFIG: SecurityConfig = {
  // Désactivé par défaut car pas d'API SMS
  OTP_ENABLED: false,

  // Exiger la présence du titulaire pour les retraits
  REQUIRE_ACCOUNT_HOLDER_PRESENCE: true,

  // Types d'opérations nécessitant la présence physique du titulaire
  OPERATIONS_REQUIRING_PRESENCE: [
    'Retrait',
    'Retrait Compte Courant',
    'Retrait Épargne',
    'Décaissement Crédit',
    'Distribution Tontine'
  ],

  // Seuil de montant pour la vérification (0 = toujours vérifier)
  PRESENCE_VERIFICATION_THRESHOLD: 0
};

/**
 * Vérifie si une opération nécessite la présence du titulaire
 */
export function requiresAccountHolderPresence(
  operationType: string,
  subType?: string,
  amount?: number
): boolean {
  if (!SECURITY_CONFIG.REQUIRE_ACCOUNT_HOLDER_PRESENCE) {
    return false;
  }

  const threshold = SECURITY_CONFIG.PRESENCE_VERIFICATION_THRESHOLD;
  if (amount !== undefined && threshold > 0 && amount < threshold) {
    return false;
  }

  const typeToCheck = subType || operationType;
  return SECURITY_CONFIG.OPERATIONS_REQUIRING_PRESENCE.some(
    op => op.toLowerCase() === typeToCheck.toLowerCase() ||
          operationType.toLowerCase() === 'retrait'
  );
}

/**
 * Vérifie si l'OTP est requis pour une opération
 */
export function isOtpRequired(): boolean {
  return SECURITY_CONFIG.OTP_ENABLED;
}
