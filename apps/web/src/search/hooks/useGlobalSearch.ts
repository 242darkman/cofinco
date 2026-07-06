/**
 * useGlobalSearch Hook
 *
 * Main hook for the global search system.
 * Handles:
 * - Debounced search across all providers
 * - AbortController for cancellation
 * - CASL permission gating
 * - Keyboard navigation (↑↓ Enter)
 * - Cmd+K / Ctrl+K shortcut
 * - Recent searches (localStorage)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAbility, useAbilityContext } from '@/contexts/AbilityContext';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { executeSearch } from '../engine';
import type { SearchResult } from '../types';

const DEBOUNCE_MS = 200;
const MAX_RECENTS = 5;
const RECENTS_KEY = 'microflex_search_recents';

interface UseGlobalSearchReturn {
  /** Current query string */
  query: string;
  /** Set the query */
  setQuery: (q: string) => void;
  /** Grouped search results (entries: [group, results[]]) */
  groupedResults: [string, SearchResult[]][];
  /** Flat results list (for keyboard nav) */
  flatResults: SearchResult[];
  /** Whether a search is in progress */
  loading: boolean;
  /** Currently highlighted index (keyboard) */
  activeIndex: number;
  /** Set active index */
  setActiveIndex: (i: number) => void;
  /** Open state */
  isOpen: boolean;
  /** Open the palette */
  open: () => void;
  /** Close the palette */
  close: () => void;
  /** Toggle */
  toggle: () => void;
  /** Navigate to a result */
  selectResult: (result: SearchResult) => void;
  /** Recent searches */
  recentSearches: string[];
  /** Clear recent searches */
  clearRecents: () => void;
  /** Handle keyboard event on the input */
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function useGlobalSearch(): UseGlobalSearchReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const ability = useAbility();
  const { isAdmin } = useAbilityContext();
  const { navigateToModule, navigateToPath } = useAppNavigation();
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recents from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENTS_KEY);
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setActiveIndex(-1);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (query.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const searchResults = await executeSearch(
          query,
          { ability, isAdmin, showLocked: true },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setResults(searchResults);
          setActiveIndex(-1);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Search error:', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, ability, isAdmin]);

  // Group results by group field
  const groupedResults = useMemo((): [string, SearchResult[]][] => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const group = r.group;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(r);
    }
    return Array.from(groups.entries());
  }, [results]);

  // Flat results for keyboard navigation
  const flatResults = useMemo(() => results, [results]);

  // Save to recents
  const saveRecent = useCallback((q: string) => {
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((r) => r !== q)].slice(0, MAX_RECENTS);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Navigate to a result
  const selectResult = useCallback((result: SearchResult) => {
    if (result.isAllowed === false) return; // Locked

    if (query.length >= 2) saveRecent(query);

    if (result.href) {
      navigateToPath(result.href);
    } else if (result.moduleKey) {
      navigateToModule(result.moduleKey, result.subModule, undefined, result.params);
    }

    setIsOpen(false);
  }, [query, navigateToModule, navigateToPath, saveRecent]);

  // Keyboard handler
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const len = flatResults.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < len - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : len - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < len) {
          selectResult(flatResults[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  }, [activeIndex, flatResults, selectResult]);

  return {
    query,
    setQuery,
    groupedResults,
    flatResults,
    loading,
    activeIndex,
    setActiveIndex,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
    selectResult,
    recentSearches,
    clearRecents: () => {
      setRecentSearches([]);
      try { localStorage.removeItem(RECENTS_KEY); } catch { /* ignore */ }
    },
    onKeyDown,
  };
}
