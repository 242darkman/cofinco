/**
 * Search Engine
 *
 * Orchestrates parallel search across all registered providers,
 * applies CASL permission gating, and merges/sorts results.
 */

import type { AppAbility } from '@/lib/casl';
import { SUBJECT_LABELS, ACTION_LABELS } from '@shared/ability';
import type { SearchResult, SearchContext } from './types';
import { searchRegistry } from './registry';

export interface SearchEngineOptions {
  ability: AppAbility;
  isAdmin: boolean;
  showLocked?: boolean;
  maxResultsPerProvider?: number;
}

/**
 * Execute search across all providers.
 * Returns results with CASL permissions applied.
 */
export async function executeSearch(
  query: string,
  options: SearchEngineOptions,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const { ability, isAdmin, showLocked = true, maxResultsPerProvider = 5 } = options;
  const providers = searchRegistry.getAll();

  const ctx: SearchContext = {
    signal,
    showLocked,
  };

  // Run all providers in parallel
  const results = await Promise.allSettled(
    providers.map(async (provider) => {
      try {
        const items = await provider.search(query, ctx);
        return items.slice(0, maxResultsPerProvider);
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        console.warn(`Search provider "${provider.id}" failed:`, err);
        return [] as SearchResult[];
      }
    }),
  );

  // Collect successful results
  const allResults: SearchResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }

  // Apply CASL gating
  return applyPermissions(allResults, ability, isAdmin, showLocked);
}

/**
 * Apply CASL permission checks to results.
 * - Allowed results get isAllowed=true
 * - Denied results get isAllowed=false + lockedReason
 * - If showLocked=false, denied results are filtered out
 */
function applyPermissions(
  results: SearchResult[],
  ability: AppAbility,
  isAdmin: boolean,
  showLocked: boolean,
): SearchResult[] {
  const processed: SearchResult[] = [];

  for (const result of results) {
    // No permission required → always allowed
    if (!result.permission) {
      processed.push({ ...result, isAllowed: true });
      continue;
    }

    const { action, subject } = result.permission;

    // Admin can do everything
    if (isAdmin) {
      processed.push({ ...result, isAllowed: true });
      continue;
    }

    const allowed = ability.can(action, subject);

    if (allowed) {
      processed.push({ ...result, isAllowed: true });
    } else if (showLocked) {
      const actionLabel = ACTION_LABELS[action] || action;
      const subjectLabel = SUBJECT_LABELS[subject] || subject;
      processed.push({
        ...result,
        isAllowed: false,
        lockedReason: `Permission requise : ${actionLabel} ${subjectLabel}`,
      });
    }
    // else: skip denied results when showLocked=false
  }

  return processed;
}

/**
 * Simple fuzzy matching score.
 * Returns 0 if no match, higher = better match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match
  if (t === q) return 100;

  // Starts with
  if (t.startsWith(q)) return 80;

  // Contains
  if (t.includes(q)) return 60;

  // Word start match (query matches start of any word)
  const words = t.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(q)) return 70;
  }

  // Character-by-character fuzzy
  let qi = 0;
  let matched = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matched++;
      qi++;
    }
  }

  if (qi === q.length) {
    // All query chars found in order
    return Math.round((matched / t.length) * 40);
  }

  return 0;
}

/**
 * Score a search result against a query.
 * Checks title, subtitle, and keywords.
 */
export function scoreResult(query: string, result: SearchResult): number {
  let best = fuzzyScore(query, result.title);
  if (result.subtitle) {
    best = Math.max(best, fuzzyScore(query, result.subtitle) * 0.8);
  }
  for (const kw of result.keywords) {
    best = Math.max(best, fuzzyScore(query, kw) * 0.7);
  }
  return best;
}
