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
} as const;
