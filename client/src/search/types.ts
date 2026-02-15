/**
 * Search System Types
 *
 * Defines the core interfaces for the global search/command palette.
 * Every search result carries CASL permission info for access gating.
 */

import type { Action, Subject } from '@shared/ability';
import type { LucideIcon } from 'lucide-react';

// ─── Search Result ──────────────────────────────────────────────────────────

export type SearchResultType = 'navigation' | 'action' | 'entity';

export interface SearchResult {
  /** Unique key for React rendering */
  id: string;
  /** Display title */
  title: string;
  /** Optional subtitle / secondary info */
  subtitle?: string;
  /** Search keywords (matched but not displayed) */
  keywords: string[];
  /** Result category for grouping */
  group: string;
  /** Visual */
  icon: LucideIcon;
  iconBg: string;
  /** What type of result this is */
  type: SearchResultType;
  /** Where to navigate on click */
  href?: string;
  /** Module key for navigation (used with useAppNavigation) */
  moduleKey?: string;
  /** Sub-module key */
  subModule?: string;
  /** Route params (e.g. { id: '123' }) */
  params?: Record<string, string>;
  /** CASL permission required to access this result */
  permission?: { action: Action; subject: Subject };
  /** Computed: is the current user allowed? (filled by the engine) */
  isAllowed?: boolean;
  /** Computed: reason why locked (filled by the engine) */
  lockedReason?: string;
  /** Relevance score (higher = more relevant) */
  score?: number;
}

// ─── Search Provider ────────────────────────────────────────────────────────

export interface SearchProvider {
  /** Unique provider ID */
  id: string;
  /** Display label for the group header */
  label: string;
  /** Icon for the group header */
  icon: LucideIcon;
  /** Icon background CSS classes */
  iconBg: string;
  /** Priority order (lower = shown first) */
  priority: number;
  /**
   * Whether this provider searches client-side (static index)
   * or server-side (API call)
   */
  mode: 'client' | 'server';
  /**
   * Search function. Returns matching results for the query.
   * For server providers, this makes an API call.
   * ctx provides CASL ability and abort signal.
   */
  search: (query: string, ctx: SearchContext) => Promise<SearchResult[]>;
  /**
   * Optional: preload data for client-side providers.
   * Called once when the search modal opens.
   */
  preload?: (ctx: SearchContext) => Promise<void>;
}

// ─── Search Context ─────────────────────────────────────────────────────────

export interface SearchContext {
  /** AbortController signal for cancelling in-flight requests */
  signal: AbortSignal;
  /** Whether to include locked results */
  showLocked: boolean;
}
