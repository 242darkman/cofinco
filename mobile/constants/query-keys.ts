/**
 * Centralized TanStack Query keys.
 * Using a factory pattern for type-safe, consistent keys.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  branding: ['branding'] as const,
  settings: ['settings'] as const,
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    clientProfile: (userId: string) => ['accounts', 'client-profile', userId] as const,
    detail: (id: string) => ['accounts', id] as const,
    transactions: (id: string) => ['accounts', id, 'transactions'] as const,
  },
  transactions: {
    detail: (id: string) => ['transactions', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
  credits: {
    all: ['credits'] as const,
    detail: (id: string) => ['credits', id] as const,
  },
  agent: {
    me: ['agent', 'me'] as const,
    session: ['agent', 'session'] as const,
    caisse: ['agent', 'caisse'] as const,
    operations: (params?: Record<string, string>) => ['agent', 'operations', params] as const,
    kpis: (agentId: string) => ['agent', 'kpis', agentId] as const,
    objectifs: (agentId: string, periode?: string) => ['agent', 'objectifs', agentId, periode] as const,
    commissions: (agentId: string, periode?: string) => ['agent', 'commissions', agentId, periode] as const,
    planning: (agentId: string, date?: string) => ['agent', 'planning', agentId, date] as const,
    leaderboard: (period: string) => ['agent', 'leaderboard', period] as const,
    incidents: (agentId: string) => ['agent', 'incidents', agentId] as const,
    formations: ['agent', 'formations'] as const,
    formationsSuivi: (agentId: string) => ['agent', 'formations-suivi', agentId] as const,
    materiel: (agentId: string) => ['agent', 'materiel', agentId] as const,
    rapports: (agentId: string) => ['agent', 'rapports', agentId] as const,
    communications: (agentId: string) => ['agent', 'communications', agentId] as const,
    enquetes: ['agent', 'enquetes'] as const,
    prospections: (params?: Record<string, string>) => ['agent', 'prospections', params] as const,
    prospection: (id: string) => ['agent', 'prospection', id] as const,
    prospectionStats: (agentId: string) => ['agent', 'prospection-stats', agentId] as const,
  },
} as const;
