/**
 * GlobalSearchModal — Enhanced Command Palette
 *
 * Features:
 * - Cmd+K / Ctrl+K to open
 * - Instant search across pages, actions, and server entities
 * - CASL permission gating (allowed vs locked results)
 * - Keyboard navigation (↑ ↓ Enter Esc)
 * - ARIA accessibility (combobox, listbox, option)
 * - Grouped results with icons and badges
 * - Match highlighting
 * - Recent searches
 * - Quick access shortcuts when empty
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Search, ChevronRight, X, Loader2, Lock,
  Users, CreditCard, DollarSign, MapPin,
  Landmark, Clock, Trash2, CornerDownLeft,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { Card, IconButton } from '../ui';
import { useGlobalSearch } from '@/search';
import type { SearchResult } from '@/search';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (module: string, itemId?: string, itemType?: string) => void;
}

// ─── Quick Access Items (shown when query is empty) ─────────────────────────

const QUICK_ACCESS = [
  { icon: Users, iconBg: 'bg-status-info-bg text-status-info', label: 'Clients', moduleKey: 'clients' },
  { icon: CreditCard, iconBg: 'bg-status-success-bg text-status-success', label: 'Crédits', moduleKey: 'credits' },
  { icon: DollarSign, iconBg: 'bg-status-warning-bg text-status-warning', label: 'Tontines', moduleKey: 'tontines' },
  { icon: MapPin, iconBg: 'bg-accent/10 text-accent', label: 'Agents Terrain', moduleKey: 'agentTerrain' },
  { icon: Landmark, iconBg: 'bg-accent/10 text-accent', label: 'Caisse', moduleKey: 'caisse' },
] as const;

// ─── Highlight Helper ───────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 1) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/20 text-accent rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Type Badge ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: SearchResult['type'] }) {
  const labels: Record<string, string> = {
    navigation: 'Page',
    action: 'Action',
    entity: 'Donnée',
  };
  const colors: Record<string, string> = {
    navigation: 'bg-accent/10 text-accent',
    action: 'bg-status-success-bg text-status-success',
    entity: 'bg-status-info-bg text-status-info',
  };
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${colors[type] || ''}`}>
      {labels[type] || type}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GlobalSearchModal({ isOpen, onClose, onNavigate }: GlobalSearchModalProps) {
  const {
    query,
    setQuery,
    groupedResults,
    flatResults,
    loading,
    activeIndex,
    setActiveIndex,
    selectResult,
    recentSearches,
    clearRecents,
    onKeyDown,
    close,
  } = useGlobalSearch();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync open/close state with hook
  useEffect(() => {
    if (!isOpen) {
      close();
    }
  }, [isOpen, close]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the modal is rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Handle ESC at modal level
  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Handle result selection — bridge to legacy onNavigate
  const handleSelect = useCallback((result: SearchResult) => {
    if (result.isAllowed === false) return;

    // Use the search hook's navigation
    selectResult(result);
    onClose();
  }, [selectResult, onClose]);

  // Handle quick access click
  const handleQuickAccess = useCallback((moduleKey: string) => {
    onNavigate(moduleKey);
    onClose();
  }, [onNavigate, onClose]);

  const hasResults = flatResults.length > 0;
  const hasQuery = query.length >= 1;
  const showRecents = !hasQuery && recentSearches.length > 0;

  // Build global index for keyboard navigation
  let globalIdx = 0;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-10 sm:pt-20 px-4"
      onClick={onClose}
      role="presentation"
    >
      <Card
        variant="elevated"
        padding="none"
        className="w-full max-w-lg bg-surface-elevated/95 backdrop-blur-xl ring-1 ring-white/5 animate-in fade-in slide-in-from-top-4 duration-200 max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* ─── Search Input ────────────────────────────────────────────── */}
        <div className="p-3 border-b border-edge shrink-0">
          <div className="relative" role="combobox" aria-expanded={hasResults} aria-haspopup="listbox" aria-owns="search-results">
            {loading ? (
              <Loader2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent animate-spin" />
            ) : (
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher pages, clients, crédits, actions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-full pl-10 pr-20 py-2.5 bg-surface-base border border-edge rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent placeholder:text-content-muted text-content-primary transition-all"
              role="searchbox"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query ? (
                <IconButton
                  icon={X}
                  size="sm"
                  variant="ghost"
                  onClick={() => setQuery('')}
                  aria-label="Effacer"
                />
              ) : (
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] bg-surface-muted text-content-muted rounded border border-edge font-mono">
                  ESC
                </kbd>
              )}
            </div>
          </div>
        </div>

        {/* ─── Results ─────────────────────────────────────────────────── */}
        <div
          ref={listRef}
          className="p-2 overflow-y-auto grow"
          id="search-results"
          role="listbox"
          aria-label="Résultats de recherche"
        >
          {hasResults ? (
            <div className="space-y-2">
              {groupedResults.map(([group, items]) => {
                const groupIcon = items[0]?.icon;
                const groupIconBg = items[0]?.iconBg || '';

                return (
                  <div key={group}>
                    {/* Group Header */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      {groupIcon && (
                        <div className={`p-0.5 rounded ${groupIconBg}`}>
                          {React.createElement(groupIcon, { size: 10 })}
                        </div>
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">
                        {group} ({items.length})
                      </span>
                    </div>

                    {/* Items */}
                    <div className="space-y-0.5">
                      {items.map((result) => {
                        const idx = globalIdx++;
                        const isActive = idx === activeIndex;
                        const isLocked = result.isAllowed === false;

                        return (
                          <button
                            key={result.id}
                            data-index={idx}
                            id={`search-result-${idx}`}
                            role="option"
                            aria-selected={isActive}
                            aria-disabled={isLocked}
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={`
                              w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors group
                              ${isLocked
                                ? 'opacity-50 cursor-not-allowed'
                                : isActive
                                  ? 'bg-accent/10 text-content-primary'
                                  : 'hover:bg-surface-muted text-content-secondary hover:text-content-primary'
                              }
                            `}
                          >
                            {/* Icon */}
                            <div className={`p-1.5 rounded-lg shrink-0 ${isLocked ? 'bg-surface-subtle text-content-muted' : result.iconBg}`}>
                              {isLocked
                                ? <Lock size={14} />
                                : React.createElement(result.icon, { size: 14 })
                              }
                            </div>

                            {/* Text */}
                            <div className="flex-1 text-left truncate min-w-0">
                              <p className="font-medium truncate">
                                {highlightMatch(result.title, query)}
                              </p>
                              {result.subtitle && (
                                <p className="text-[10px] text-content-muted truncate">
                                  {highlightMatch(result.subtitle, query)}
                                </p>
                              )}
                              {isLocked && result.lockedReason && (
                                <p className="text-[10px] text-status-danger truncate mt-0.5">
                                  {result.lockedReason}
                                </p>
                              )}
                            </div>

                            {/* Badge + Chevron */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <TypeBadge type={result.type} />
                              {!isLocked && (
                                <ChevronRight size={14} className={isActive ? 'opacity-50' : 'opacity-0 group-hover:opacity-50'} />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasQuery && !loading ? (
            /* Empty state */
            <div className="text-center py-8 text-content-muted">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun résultat pour &laquo;{query}&raquo;</p>
              <p className="text-xs mt-1">Essayez un autre terme ou vérifiez l'orthographe</p>
            </div>
          ) : (
            /* Quick Access + Recents */
            <>
              {showRecents && (
                <div className="mb-3">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider flex items-center gap-1">
                      <Clock size={10} /> Recherches récentes
                    </span>
                    <button onClick={clearRecents} className="text-[10px] text-content-muted hover:text-content-secondary flex items-center gap-0.5">
                      <Trash2 size={10} /> Effacer
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {recentSearches.map((recent) => (
                      <button
                        key={recent}
                        onClick={() => setQuery(recent)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-xl text-sm text-content-secondary hover:text-content-primary transition-colors"
                      >
                        <Clock size={14} className="text-content-muted shrink-0" />
                        <span className="truncate">{recent}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider px-2 py-1.5">
                Accès rapide
              </p>
              <div className="space-y-0.5">
                {QUICK_ACCESS.map((qa) => (
                  <button
                    key={qa.moduleKey}
                    onClick={() => handleQuickAccess(qa.moduleKey)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-muted rounded-xl text-sm text-content-secondary hover:text-content-primary transition-colors group"
                  >
                    <div className={`p-1.5 rounded-lg ${qa.iconBg} group-hover:scale-105 transition-transform`}>
                      <qa.icon size={16} />
                    </div>
                    <span>{qa.label}</span>
                    <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ─── Footer ──────────────────────────────────────────────────── */}
        <div className="p-2 border-t border-edge shrink-0">
          <div className="flex items-center justify-between px-2 text-[10px] text-content-muted">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <ArrowUp size={10} /><ArrowDown size={10} /> naviguer
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft size={10} /> ouvrir
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-surface-muted rounded border border-edge font-mono text-[9px]">ESC</kbd> fermer
              </span>
            </div>
            <span className="hidden sm:inline">
              <kbd className="px-1 py-0.5 bg-surface-muted rounded border border-edge font-mono text-[9px]">⌘K</kbd>
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
