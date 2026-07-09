/**
 * Provider Registry
 * Singleton registry pour le provider Mobile Money (pawaPay uniquement)
 */

import type { IMobileMoneyProvider } from "./types";
import { createLogger } from "../../lib/logger";

const logger = createLogger('ProviderRegistry');

class ProviderRegistry {
  private providers: Map<string, IMobileMoneyProvider> = new Map();

  /**
   * Enregistre un provider dans le registry
   */
  register(provider: IMobileMoneyProvider): void {
    if (this.providers.has(provider.code)) {
      logger.warn({ providerCode: provider.code }, 'Provider already registered, replacing');
    }
    this.providers.set(provider.code, provider);
    logger.info({ providerName: provider.name, providerCode: provider.code }, 'Registered provider');
  }

  /**
   * Récupère un provider par son code
   */
  get(code: string): IMobileMoneyProvider | undefined {
    return this.providers.get(code.toUpperCase());
  }

  /**
   * Récupère un provider par son code, lève une erreur si non trouvé
   */
  getOrThrow(code: string): IMobileMoneyProvider {
    const provider = this.get(code);
    if (!provider) {
      throw new Error(`Provider ${code} not found in registry`);
    }
    return provider;
  }

  /**
   * Récupère le provider pawaPay (raccourci)
   */
  getPawaPay(): IMobileMoneyProvider {
    return this.getOrThrow("PAWAPAY");
  }

  /**
   * Liste tous les providers enregistrés
   */
  getAll(): IMobileMoneyProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Vérifie si un provider est enregistré
   */
  has(code: string): boolean {
    return this.providers.has(code.toUpperCase());
  }

  /**
   * Liste les codes des providers enregistrés
   */
  getCodes(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

/**
 * Initialise le provider pawaPay
 * À appeler au démarrage de l'application
 */
export async function initializeProviders(): Promise<void> {
  logger.info('Initializing pawaPay provider');

  try {
    const { PawaPayProvider } = await import("./providers/pawapay/pawapay-provider");

    const pawaPayProvider = new PawaPayProvider();
    providerRegistry.register(pawaPayProvider);

    logger.info({ count: providerRegistry.getCodes().length, providers: providerRegistry.getCodes() }, 'Providers initialized');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize pawaPay provider');
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
  }
}

export default providerRegistry;
