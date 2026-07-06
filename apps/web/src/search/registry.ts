/**
 * Search Registry
 *
 * Central registry where search providers register themselves.
 * The engine queries all registered providers in parallel.
 */

import type { SearchProvider } from './types';

const providers: Map<string, SearchProvider> = new Map();

export const searchRegistry = {
  register(provider: SearchProvider) {
    providers.set(provider.id, provider);
  },

  unregister(id: string) {
    providers.delete(id);
  },

  getAll(): SearchProvider[] {
    return Array.from(providers.values()).sort((a, b) => a.priority - b.priority);
  },

  get(id: string): SearchProvider | undefined {
    return providers.get(id);
  },

  clear() {
    providers.clear();
  },
};
