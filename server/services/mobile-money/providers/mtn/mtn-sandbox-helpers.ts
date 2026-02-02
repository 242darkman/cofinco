/**
 * MTN MoMo Sandbox Helpers
 *
 * Utilitaires pour gérer les spécificités du sandbox MTN MoMo
 * Basé sur: https://momodeveloper.mtn.com/api-documentation/testing
 */

/**
 * Numéros de test MTN sandbox et leurs comportements attendus
 * Source: Documentation officielle MTN MoMo Sandbox
 */
export const MTN_SANDBOX_TEST_NUMBERS = {
  // Numéros d'erreur
  FAILED: '46733123450',
  REJECTED: '46733123451',
  TIMEOUT: '46733123452',

  // Numéros de succès
  SUCCESS_IMMEDIATE: '56733123453',  // Succès immédiat
  SUCCESS_DELAYED: '46733123454',     // Succès après 30 secondes
} as const;

/**
 * Pattern pour détecter si un numéro est un numéro de test sandbox
 */
export function isMtnSandboxTestNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^\d]/g, '');
  const testNumbers = Object.values(MTN_SANDBOX_TEST_NUMBERS);

  // Vérifier si le numéro (avec ou sans indicatif) correspond à un numéro de test
  return testNumbers.some(testNum =>
    cleaned.endsWith(testNum) || cleaned === testNum
  );
}

/**
 * Retourne le type de comportement attendu pour un numéro de test sandbox
 */
export function getMtnSandboxBehavior(phone: string): {
  isTestNumber: boolean;
  expectedStatus?: 'FAILED' | 'SUCCESSFUL';
  expectedDelay?: number;
  reason?: string;
} {
  const cleaned = phone.replace(/[^\d]/g, '');

  if (cleaned.endsWith(MTN_SANDBOX_TEST_NUMBERS.FAILED) || cleaned === MTN_SANDBOX_TEST_NUMBERS.FAILED) {
    return {
      isTestNumber: true,
      expectedStatus: 'FAILED',
      reason: 'INTERNAL_PROCESSING_ERROR'
    };
  }

  if (cleaned.endsWith(MTN_SANDBOX_TEST_NUMBERS.REJECTED) || cleaned === MTN_SANDBOX_TEST_NUMBERS.REJECTED) {
    return {
      isTestNumber: true,
      expectedStatus: 'FAILED',
      reason: 'APPROVAL_REJECTED'
    };
  }

  if (cleaned.endsWith(MTN_SANDBOX_TEST_NUMBERS.TIMEOUT) || cleaned === MTN_SANDBOX_TEST_NUMBERS.TIMEOUT) {
    return {
      isTestNumber: true,
      expectedStatus: 'FAILED',
      reason: 'EXPIRED'
    };
  }

  if (cleaned.endsWith(MTN_SANDBOX_TEST_NUMBERS.SUCCESS_IMMEDIATE) || cleaned === MTN_SANDBOX_TEST_NUMBERS.SUCCESS_IMMEDIATE) {
    return {
      isTestNumber: true,
      expectedStatus: 'SUCCESSFUL',
      expectedDelay: 2000 // ~2 secondes
    };
  }

  if (cleaned.endsWith(MTN_SANDBOX_TEST_NUMBERS.SUCCESS_DELAYED) || cleaned === MTN_SANDBOX_TEST_NUMBERS.SUCCESS_DELAYED) {
    return {
      isTestNumber: true,
      expectedStatus: 'SUCCESSFUL',
      expectedDelay: 30000 // ~30 secondes
    };
  }

  // Pas un numéro de test connu
  return { isTestNumber: false };
}

/**
 * Valide un numéro de téléphone pour le sandbox
 * Retourne un avertissement si le numéro n'est pas un numéro de test
 */
export function validateSandboxPhoneNumber(phone: string): {
  isValid: boolean;
  warning?: string;
  suggestion?: string;
} {
  const behavior = getMtnSandboxBehavior(phone);

  if (behavior.isTestNumber) {
    return { isValid: true };
  }

  // Numéro réel utilisé en sandbox
  return {
    isValid: true,  // On autorise quand même
    warning: 'Ce numéro n\'est pas un numéro de test sandbox. Le paiement pourrait rester bloqué en PENDING indéfiniment.',
    suggestion: `Utilisez un numéro de test comme ${MTN_SANDBOX_TEST_NUMBERS.SUCCESS_IMMEDIATE} (succès immédiat) ou ${MTN_SANDBOX_TEST_NUMBERS.SUCCESS_DELAYED} (succès après 30s)`
  };
}

/**
 * Retourne un timeout adapté selon l'environnement et le numéro
 */
export function getSandboxTimeout(phone: string, defaultTimeout: number): number {
  const behavior = getMtnSandboxBehavior(phone);

  if (behavior.isTestNumber && behavior.expectedDelay) {
    // Ajouter une marge de sécurité (2x le délai attendu)
    return Math.max(behavior.expectedDelay * 2, defaultTimeout);
  }

  // Pour les numéros non-test en sandbox, utiliser un timeout plus court
  // car ils ne se résoudront jamais
  if (!behavior.isTestNumber) {
    return Math.min(60000, defaultTimeout); // Max 1 minute
  }

  return defaultTimeout;
}

/**
 * Message d'aide pour l'utilisateur en sandbox
 */
export function getSandboxHelpMessage(environment: 'sandbox' | 'production'): string | null {
  if (environment !== 'sandbox') {
    return null;
  }

  return `
    Mode Sandbox MTN MoMo - Numéros de test disponibles :

    • ${MTN_SANDBOX_TEST_NUMBERS.SUCCESS_IMMEDIATE} - Paiement réussi immédiat (~2s)
    • ${MTN_SANDBOX_TEST_NUMBERS.SUCCESS_DELAYED} - Paiement réussi après 30 secondes
    • ${MTN_SANDBOX_TEST_NUMBERS.FAILED} - Paiement échoué (erreur interne)
    • ${MTN_SANDBOX_TEST_NUMBERS.REJECTED} - Paiement rejeté
    • ${MTN_SANDBOX_TEST_NUMBERS.TIMEOUT} - Paiement expiré

    ⚠️ Les numéros réels resteront en PENDING indéfiniment en sandbox.
  `.trim();
}
