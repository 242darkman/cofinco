/**
 * Fonctions pures de formatage pawaPay : MSISDN, montants et
 * statementDescription. Extraites de pawapay-provider (code inchangé).
 */

/**
 * Normalise le numéro de téléphone au format MSISDN pour le Congo
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  // Congo Brazzaville: assurer le préfixe 242
  if (!cleaned.startsWith("242")) {
    if (cleaned.startsWith("0")) {
      cleaned = cleaned.substring(1);
    }
    cleaned = "242" + cleaned;
  }
  return cleaned;
}

/**
 * Formate le montant selon les contraintes pawaPay
 * XAF = pas de décimales
 */
export function formatAmount(amount: number, currency: string): string {
  if (currency === "XAF") {
    return Math.round(amount).toString();
  }
  return amount.toString();
}

/**
 * Construit le statementDescription (4-22 chars alphanumériques)
 */
export function buildCustomerMessage(prefix: string, description?: string): string {
  if (!description) return prefix;

  // Nettoyer: garder uniquement alphanumériques et espaces
  const clean = `${prefix} ${description}`.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  // Tronquer à 22 chars
  return clean.substring(0, 22) || prefix;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
