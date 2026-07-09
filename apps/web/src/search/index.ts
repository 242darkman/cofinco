/**
 * Search Module - Public API
 *
 * Registers all providers and exports the hook + types.
 */

export { useGlobalSearch } from './hooks/useGlobalSearch';
export { searchRegistry } from './registry';
export type { SearchResult, SearchProvider, SearchContext } from './types';

// ─── Provider Registration ────────────────────────────────────────────────

import { searchRegistry } from './registry';
import { navigationProvider } from './providers/navigation';
import { actionsProvider } from './providers/actions';
import { clientsProvider, creditsProvider, tontinesProvider, agentsProvider } from './providers/entities';

// Register all built-in providers
searchRegistry.register(navigationProvider);
searchRegistry.register(actionsProvider);
searchRegistry.register(clientsProvider);
searchRegistry.register(creditsProvider);
searchRegistry.register(tontinesProvider);
searchRegistry.register(agentsProvider);
