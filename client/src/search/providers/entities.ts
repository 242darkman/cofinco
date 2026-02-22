/**
 * Entity Search Providers (Server-side)
 *
 * Makes API calls to search business entities:
 * clients, crédits, comptes, tontines, agents terrain.
 *
 * Uses the existing GET /api/search endpoint and extends it.
 */

import {
  Users, CreditCard, Wallet, DollarSign, MapPin,
} from 'lucide-react';
import { Actions, Subjects } from '@shared/ability';
import type { SearchProvider, SearchResult, SearchContext } from '../types';

// ─── API Response Types ─────────────────────────────────────────────────────

interface ApiSearchResults {
  clients: Array<{ id: string; nom: string; email?: string; telephone?: string; statut?: string; type: string }>;
  credits: Array<{ id: string; typeCredit?: string; montant?: string; statut?: string; clientNom?: string; type: string }>;
  tontines: Array<{ id: string; nom: string; statut?: string; montantCotisation?: string; type: string }>;
  agents: Array<{ id: string; nom: string; prenom?: string; zoneAffectation?: string; statut?: string; type: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let cachedResults: Map<string, { data: ApiSearchResults; timestamp: number }> = new Map();
const CACHE_TTL = 30_000; // 30s cache

async function fetchSearchResults(query: string, signal: AbortSignal): Promise<ApiSearchResults> {
  const cacheKey = query.toLowerCase().trim();
  const cached = cachedResults.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error(`Search API returned ${response.status}`);

  const data: ApiSearchResults = await response.json();

  // Cache the result
  cachedResults.set(cacheKey, { data, timestamp: Date.now() });

  // Evict old entries
  if (cachedResults.size > 50) {
    const oldest = Array.from(cachedResults.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) cachedResults.delete(oldest[0]);
  }

  return data;
}

function formatAmount(amount: string | number | undefined): string {
  if (!amount) return '';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return isNaN(n) ? '' : `${n.toLocaleString('fr-FR')} FCFA`;
}

// ─── Clients Provider ───────────────────────────────────────────────────────

export const clientsProvider: SearchProvider = {
  id: 'clients',
  label: 'Clients',
  icon: Users,
  iconBg: 'bg-status-info-bg text-status-info',
  priority: 10,
  mode: 'server',

  async search(query: string, ctx: SearchContext): Promise<SearchResult[]> {
    if (query.length < 2) return [];
    const data = await fetchSearchResults(query, ctx.signal);

    return data.clients.map((c) => ({
      id: `client-${c.id}`,
      title: c.nom,
      subtitle: c.telephone || c.email,
      keywords: [c.nom, c.telephone || '', c.email || ''],
      group: 'Clients',
      icon: Users,
      iconBg: 'bg-status-info-bg text-status-info',
      type: 'entity' as const,
      moduleKey: 'clients',
      subModule: 'details',
      params: { id: c.id },
      permission: { action: Actions.VIEW, subject: Subjects.CLIENT },
    }));
  },
};

// ─── Credits Provider ───────────────────────────────────────────────────────

export const creditsProvider: SearchProvider = {
  id: 'credits',
  label: 'Crédits',
  icon: CreditCard,
  iconBg: 'bg-status-success-bg text-status-success',
  priority: 11,
  mode: 'server',

  async search(query: string, ctx: SearchContext): Promise<SearchResult[]> {
    if (query.length < 2) return [];
    const data = await fetchSearchResults(query, ctx.signal);

    return data.credits.map((c) => ({
      id: `credit-${c.id}`,
      title: c.clientNom || c.typeCredit || 'Crédit',
      subtitle: [formatAmount(c.montant), c.statut].filter(Boolean).join(' · '),
      keywords: [c.clientNom || '', c.typeCredit || '', c.statut || ''],
      group: 'Crédits',
      icon: CreditCard,
      iconBg: 'bg-status-success-bg text-status-success',
      type: 'entity' as const,
      moduleKey: 'credits',
      subModule: 'credits',
      params: { id: c.id },
      permission: { action: Actions.VIEW, subject: Subjects.CREDIT },
    }));
  },
};

// ─── Tontines Provider ──────────────────────────────────────────────────────

export const tontinesProvider: SearchProvider = {
  id: 'tontines',
  label: 'Tontines',
  icon: DollarSign,
  iconBg: 'bg-status-warning-bg text-status-warning',
  priority: 12,
  mode: 'server',

  async search(query: string, ctx: SearchContext): Promise<SearchResult[]> {
    if (query.length < 2) return [];
    const data = await fetchSearchResults(query, ctx.signal);

    return data.tontines.map((t) => ({
      id: `tontine-${t.id}`,
      title: t.nom,
      subtitle: t.statut || undefined,
      keywords: [t.nom, t.statut || ''],
      group: 'Tontines',
      icon: DollarSign,
      iconBg: 'bg-status-warning-bg text-status-warning',
      type: 'entity' as const,
      moduleKey: 'tontines',
      params: { id: t.id },
      permission: { action: Actions.VIEW, subject: Subjects.TONTINE },
    }));
  },
};

// ─── Agents Terrain Provider ────────────────────────────────────────────────

export const agentsProvider: SearchProvider = {
  id: 'agents',
  label: 'Agents Terrain',
  icon: MapPin,
  iconBg: 'bg-accent/10 text-accent',
  priority: 13,
  mode: 'server',

  async search(query: string, ctx: SearchContext): Promise<SearchResult[]> {
    if (query.length < 2) return [];
    const data = await fetchSearchResults(query, ctx.signal);

    return data.agents.map((a) => ({
      id: `agent-${a.id}`,
      title: `${a.nom} ${a.prenom || ''}`.trim(),
      subtitle: a.zoneAffectation || undefined,
      keywords: [a.nom, a.prenom || '', a.zoneAffectation || ''],
      group: 'Agents Terrain',
      icon: MapPin,
      iconBg: 'bg-accent/10 text-accent',
      type: 'entity' as const,
      moduleKey: 'agentModules',
      params: { id: a.id },
      permission: { action: Actions.VIEW, subject: Subjects.AGENT_TERRAIN },
    }));
  },
};
