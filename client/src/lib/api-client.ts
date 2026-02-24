// API Client for COFIN&CO-M Backend
// Security-enhanced with automatic 401 detection and session invalidation
// Multi-agency support with automatic X-Agence-Id header injection
// Cross-tab logout synchronization via BroadcastChannel
// Device fingerprinting for stolen cookie detection

import { getOrCreateFingerprint, clearStoredFingerprint } from './device-fingerprint';
import { getCriticalOperation } from './criticalOperations';
import { networkManager } from './networkManager';

const API_BASE = '/api';

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface PaginationMeta {
  pagination: {
    page: number;
    perPage: number;
    totalItems: number;
    totalPages: number;
  };
  filters?: Record<string, unknown>;
}

export interface PaginationLinks {
  self: string;
  next: string | null;
  prev: string | null;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
  links: PaginationLinks;
}

// Callback pour session expirée (injecté depuis authService)
let onUnauthorizedCallback: (() => void) | null = null;

// ============================================
// SESSION REVALIDATION GUARD
// Prevents false logouts by verifying /me before disconnecting
// ============================================

let revalidationInFlight: Promise<boolean> | null = null;
let lastRevalidationTime = 0;
const REVALIDATION_COOLDOWN_MS = 3000; // 3s between revalidation attempts

/**
 * Revalidates session via /api/auth/me before triggering logout.
 * Debounced singleton: multiple concurrent 401s trigger only ONE /me check.
 * Returns true if session is actually invalid (confirmed 401 from /me).
 */
async function revalidateSessionBeforeLogout(reason: string): Promise<boolean> {
  // If already revalidating, reuse the in-flight promise
  if (revalidationInFlight) {
    return revalidationInFlight;
  }

  // Cooldown: don't re-check if we just checked
  const now = Date.now();
  if (now - lastRevalidationTime < REVALIDATION_COOLDOWN_MS) {
    return false; // Assume still valid, we just checked
  }

  revalidationInFlight = (async () => {
    try {
      lastRevalidationTime = Date.now();
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        // Session is VALID — the 401 was transient or endpoint-specific
        if (import.meta.env.DEV) console.log('[API] Session revalidation: OK — ignoring transient 401');
        return false;
      }

      if (response.status === 401) {
        // Session is truly invalid — proceed with logout
        console.warn(`[API] Session revalidation: CONFIRMED invalid (reason: ${reason})`);
        broadcastSessionInvalid(reason);
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
        return true;
      }

      // Server error (5xx) — DON'T logout, assume session might still be valid
      console.warn(`[API] Session revalidation: server error ${response.status} — keeping session`);
      return false;
    } catch (error) {
      // Network error — DON'T logout
      console.warn('[API] Session revalidation: network error — keeping session', error);
      return false;
    } finally {
      revalidationInFlight = null;
    }
  })();

  return revalidationInFlight;
}

// ID de l'agence actuellement sélectionnée (injecté depuis AgenceContext)
let currentAgenceId: string | null = null;

// ============================================
// CROSS-TAB LOGOUT SYNCHRONIZATION
// ============================================

/**
 * BroadcastChannel for cross-tab logout synchronization
 * When one tab logs out, all other tabs are notified and also logout
 */
const LOGOUT_CHANNEL_NAME = 'cofinco-auth-channel';
let logoutChannel: BroadcastChannel | null = null;

// Initialize BroadcastChannel if supported
if (typeof BroadcastChannel !== 'undefined') {
  try {
    logoutChannel = new BroadcastChannel(LOGOUT_CHANNEL_NAME);
    logoutChannel.onmessage = (event) => {
      if (event.data?.type === 'LOGOUT') {
        if (import.meta.env.DEV) console.log('[API] Cross-tab logout received, invalidating session');
        // Trigger local logout without broadcasting (to avoid loop)
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
      } else if (event.data?.type === 'SESSION_INVALID') {
        if (import.meta.env.DEV) console.log('[API] Cross-tab session invalidation received:', event.data.reason);
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
      }
    };
    if (import.meta.env.DEV) console.log('[API] BroadcastChannel initialized for cross-tab logout sync');
  } catch (e) {
    console.warn('[API] BroadcastChannel not available:', e);
  }
}

/**
 * Broadcast logout to all other tabs
 */
export function broadcastLogout(): void {
  if (logoutChannel) {
    try {
      logoutChannel.postMessage({ type: 'LOGOUT', timestamp: Date.now() });
    } catch (e) {
      console.warn('[API] Failed to broadcast logout:', e);
    }
  }
}

/**
 * Broadcast session invalidation to all other tabs
 */
export function broadcastSessionInvalid(reason: string): void {
  if (logoutChannel) {
    try {
      logoutChannel.postMessage({ type: 'SESSION_INVALID', reason, timestamp: Date.now() });
    } catch (e) {
      console.warn('[API] Failed to broadcast session invalidation:', e);
    }
  }
}

/**
 * Configurer le callback d'erreur 401
 */
export function setOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

/**
 * Définir l'agence sélectionnée pour les requêtes API
 * Appelé par AgenceContext lors de la sélection d'une agence
 */
export function setCurrentAgenceId(agenceId: string | null) {
  currentAgenceId = agenceId;
}

/**
 * Obtenir l'agence actuellement sélectionnée
 */
export function getCurrentAgenceId(): string | null {
  return currentAgenceId;
}

// Convert snake_case keys to camelCase for API requests
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertKeysToCamelCase(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj;
  
  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = snakeToCamel(key);
      newObj[camelKey] = obj[key];
    }
  }
  return newObj;
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    const normalizedKey = key === 'perPage' ? 'per_page' : key;

    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(normalizedKey, String(entry)));
    } else {
      search.set(normalizedKey, String(value));
    }
  }

  return search.toString();
}

/**
 * Gestion centralisée des réponses HTTP
 * Détecte les 401 et déclenche la déconnexion automatique
 * Utilise ApiError pour préserver les données structurées des erreurs business
 * Broadcasts session invalidation to other tabs via BroadcastChannel
 */
async function handleResponse<T>(response: Response, endpoint: string): Promise<T> {
  // Détection session expirée (401 Unauthorized)
  if (response.status === 401) {
    // Si c'est une 401 sur le login, c'est une erreur de credentials, pas de session
    if (endpoint.includes('/auth/login')) {
       // On laisse passer vers le bloc !response.ok standard qui va extraire le message du body
       // ou on throw direct ici
       const errorData = await response.json().catch(() => ({ message: 'Identifiants invalides' }));
       throw new ApiError(errorData.message || 'Identifiants invalides', 401, errorData);
    }

    // Try to extract reason from response body
    let reason = 'session_expired';
    try {
      const errorData = await response.clone().json();
      if (errorData.reason) reason = errorData.reason;
      if (errorData.code === 'SESSION_INVALID') reason = errorData.reason || 'session_invalid';
    } catch {
      // Ignore JSON parse errors
    }

    // Pour les autres routes, c'est potentiellement une expiration de session
    // Exclure les endpoints d'auth qui peuvent retourner 401 normalement
    const isAuthEndpoint = endpoint.includes('/auth/me') ||
                           endpoint.includes('/auth/session-info') ||
                           endpoint.includes('/auth/refresh');
    if (!isAuthEndpoint) {
      // NE PAS logout immédiatement — revalider via /me d'abord
      // La revalidation est debounced (singleton) : N requêtes 401 simultanées
      // ne déclenchent qu'UN seul appel /me
      console.warn(`[API] 401 reçu sur ${endpoint} — revalidation session en cours...`);
      revalidateSessionBeforeLogout(reason);
    }
    throw new ApiError('Session expirée - veuillez vous reconnecter', 401, { reason });
  }

  // Détection compte bloqué/désactivé (403 Forbidden)
  if (response.status === 403) {
    const errorData = await response.json().catch(() => ({ message: 'Accès refusé' }));
    throw new ApiError(errorData.message || 'Accès refusé', 403, errorData);
  }

  // Autres erreurs - préserver les données structurées pour les erreurs business
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    const message = errorData.error?.message || errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(message, response.status, errorData);
  }

  // No content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// ETag cache for conditional requests (304 Not Modified)
// ============================================================================
const etagCache = new Map<string, { etag: string; data: any }>();
const MAX_ETAG_CACHE = 200;

/**
 * Requête HTTP sécurisée avec credentials et gestion d'erreur centralisée
 * Injecte automatiquement le header X-Agence-Id si une agence est sélectionnée
 * Injecte automatiquement les headers de device fingerprint pour la sécurité
 * Supporte les ETags pour les requêtes GET (304 Not Modified)
 */
async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  // Block critical operations with 'block' policy when offline/api_down
  const method = options?.method || 'GET';
  if (method !== 'GET') {
    const critOp = getCriticalOperation(endpoint, method);
    if (critOp?.offlinePolicy === 'block') {
      const netState = networkManager.getState();
      if (netState.status === 'offline' || netState.status === 'api_down') {
        throw new ApiError(
          0,
          `${critOp.name} nécessite une connexion active au serveur.`,
          { blocked: true, offlinePolicy: 'block', operation: critOp.name }
        );
      }
    }
  }

  // Construire les headers avec X-Agence-Id si disponible
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  // Injecter X-Agence-Id automatiquement (sauf pour certains endpoints)
  if (currentAgenceId && !endpoint.startsWith('/auth/') && !endpoint.startsWith('/me/agences')) {
    headers['X-Agence-Id'] = currentAgenceId;
  }

  // Injecter les headers de device fingerprint pour la vérification de sécurité
  // (sauf pour les endpoints d'authentification qui gèrent le fingerprint différemment)
  if (!endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/register')) {
    try {
      const fingerprint = getOrCreateFingerprint();
      headers['X-Device-Fingerprint'] = fingerprint.full;
      headers['X-Device-Fingerprint-Partial'] = fingerprint.partial;
    } catch {
      // Ignore fingerprint errors - security check is optional
    }
  }

  // ETag: send If-None-Match for GET requests
  const isGet = !options?.method || options.method === 'GET';
  const cacheKey = `${currentAgenceId || ''}:${endpoint}`;
  if (isGet) {
    const cached = etagCache.get(cacheKey);
    if (cached) {
      headers['If-None-Match'] = cached.etag;
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Toujours envoyer les cookies de session
  });

  // ETag: handle 304 Not Modified
  if (response.status === 304 && isGet) {
    const cached = etagCache.get(cacheKey);
    if (cached) {
      return cached.data as T;
    }
  }

  const result = await handleResponse<T>(response, endpoint);

  // ETag: store response with etag for future conditional requests
  if (isGet && response.headers.has('etag')) {
    const etag = response.headers.get('etag')!;
    // Evict oldest if cache is full
    if (etagCache.size >= MAX_ETAG_CACHE) {
      const firstKey = etagCache.keys().next().value;
      if (firstKey) etagCache.delete(firstKey);
    }
    etagCache.set(cacheKey, { etag, data: result });
  }

  return result;
}

async function requestPaginated<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: RequestInit
): Promise<PaginatedResponse<T>> {
  const query = buildQuery(params);
  const path = query ? `${endpoint}?${query}` : endpoint;
  return request<PaginatedResponse<T>>(path, options);
}

export async function requestAllPages<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: RequestInit
): Promise<T[]> {
  const perPage = typeof params?.perPage === 'number' ? params.perPage : 200;
  let page = 1;
  let totalPages = 1;
  const results: T[] = [];

  do {
    const response = await requestPaginated<T>(endpoint, { ...params, page, perPage }, options);
    results.push(...(response.data || []));
    totalPages = response.meta?.pagination?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);

  return results;
}

export async function requestListAll<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: RequestInit
): Promise<T[]> {
  const query = buildQuery(params);
  const path = query ? `${endpoint}?${query}` : endpoint;
  const payload = await request<any>(path, options);

  if (Array.isArray(payload)) return payload as T[];
  if (payload?.data && Array.isArray(payload.data)) {
    const totalPages = Number(payload.meta?.pagination?.totalPages ?? 1);
    if (!Number.isFinite(totalPages) || totalPages <= 1) {
      return payload.data as T[];
    }
    return requestAllPages<T>(endpoint, params, options);
  }

  return [];
}

// Auth User type
export interface AuthUser {
  id: string;
  username: string;
  nom: string;
  prenom: string | null;
  role: string;
  agence: string | null;
  agenceId?: string;
  email?: string;
  statut?: string;
  photoProfile?: string | null;
  mustChangePassword?: boolean;
}

// Permissions response type (from login)
export interface PermissionsData {
  role: string;
  permissions: Record<string, string[]>;
  isAdmin: boolean;
}

// Login response wrapper type
interface LoginResponse {
  user: AuthUser;
  message: string;
  mustChangePassword: boolean;
  permissions?: PermissionsData; // Inclus pour éviter race condition
}

// Full login result with permissions
export interface LoginResult {
  user: AuthUser;
  permissions?: PermissionsData;
}

// Session validation response type
export interface SessionCheckResponse extends AuthUser {
  sessionValid?: boolean;
}

// Auth API
export const authApi = {
  login: async (username: string, password: string, rememberMe: boolean = false): Promise<LoginResult> => {
    // Generate device fingerprint for security
    const fingerprint = getOrCreateFingerprint();

    const response = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        deviceFingerprint: fingerprint.full,
        deviceFingerprintPartial: fingerprint.partial,
        rememberMe,
      }),
    });
    return {
      user: response.user,
      permissions: response.permissions
    };
  },
  /**
   * Logout and broadcast to other tabs
   */
  logout: async () => {
    const result = await request<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
    // Clear device fingerprint on logout
    clearStoredFingerprint();
    // Broadcast logout to other tabs
    broadcastLogout();
    return result;
  },
  getMe: () => request<SessionCheckResponse>('/auth/me'),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  register: (data: { username: string; password: string; nom: string; prenom?: string; email?: string; role?: string; agence?: string }) =>
    request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getUsers: () => request<any[]>('/users'),
  setCaissePin: (data: { currentPassword: string; newPin: string }) =>
    request<any>('/auth/caisse-pin', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  /**
   * Check if current user has a PIN configured (without sending PIN)
   */
  checkPinStatus: () => request<{ hasPinConfigured: boolean }>('/auth/pin-status'),
  /**
   * Validate current session - returns true if valid, false only on confirmed 401
   * Network errors / 5xx → assume valid (server is source of truth, not errors)
   */
  validateSession: async (): Promise<{ valid: boolean; user?: AuthUser; reason?: string }> => {
    try {
      const user = await request<SessionCheckResponse>('/auth/me');
      return { valid: true, user };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return { valid: false, reason: error.data?.reason || 'session_invalid' };
      }
      // Network/5xx errors: DON'T invalidate — session cookie may still be valid
      return { valid: true, reason: 'network_error' };
    }
  },

  /**
   * Refresh session using remember-me token
   * Attempts to get a new session using the refresh token cookie
   * Returns the new user if successful, null otherwise
   */
  refreshSession: async (): Promise<{ success: boolean; user?: AuthUser; permissions?: PermissionsData }> => {
    try {
      // Get fingerprint for the new session
      const fingerprint = getOrCreateFingerprint();

      const response = await request<LoginResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({
          deviceFingerprint: fingerprint.full,
          deviceFingerprintPartial: fingerprint.partial,
        }),
      });

      return {
        success: true,
        user: response.user,
        permissions: response.permissions,
      };
    } catch (error) {
      // Refresh failed - likely no valid token or token expired
      return { success: false };
    }
  },
};

// Generic API
export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, data?: any) => request<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  patch: <T>(endpoint: string, data?: any) => request<T>(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: <T>(endpoint: string) => request<T>(endpoint, {
    method: 'DELETE',
  }),
};

// Interfaces pour l'historique de caisse
export interface CaisseHistoriqueFilters {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  typeOperation?: string;
  methodePaiement?: string;
}

export interface CaisseHistoriqueOperation {
  id: string;
  typeOperation: string;
  montant: string;
  modePaiement: string;
  reference: string;
  description: string;
  statut: string;
  createdAt: string;
  clientNom: string | null;
  clientPrenom: string | null;
  clientTelephone: string | null;
  sessionId: string;
  caissierNom: string | null;
  metadata?: Record<string, any> | null;
}

export interface CaisseHistoriqueSummary {
  totalOperations: number;
  totalEntrees: number;
  totalSorties: number;
  montantEntrees: number;
  montantSorties: number;
  soldeNet: number;
  operationsParType: Record<string, number>;
  operationsParMode: Record<string, number>;
}

export interface CaisseHistoriqueResult {
  operations: CaisseHistoriqueOperation[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  summary: CaisseHistoriqueSummary;
}

// Caisse API (Admin Management)
export const caisseApi = {
  liquidate: (id: string) => request<any>(`/caisses/${id}/liquidate`, {
    method: 'POST',
  }),
  getStatus: (agenceId?: string) => {
    const query = agenceId ? `?agenceId=${agenceId}` : '';
    return request<any[]>(`/caisses/status${query}`);
  },
  delete: (id: string) => request<void>(`/caisses/${id}`, {
    method: 'DELETE',
  }),
  /**
   * Récupérer l'historique global d'une caisse avec pagination et filtres
   */
  getHistorique: (caisseId: string, filters?: CaisseHistoriqueFilters) =>
    request<CaisseHistoriqueResult>(`/caisses/${caisseId}/historique${buildQuery(filters as Record<string, unknown>) ? `?${buildQuery(filters as Record<string, unknown>)}` : ''}`),
  /**
   * Récupérer le résumé de l'historique d'une caisse
   */
  getHistoriqueSummary: (caisseId: string) =>
    request<CaisseHistoriqueSummary>(`/caisses/${caisseId}/historique/summary`),
  /**
   * Mettre à jour les horaires d'ouverture d'une caisse
   */
  updateOperatingHours: (caisseId: string, data: {
    operatingHoursEnabled?: boolean;
    operatingHoursStart?: string;
    operatingHoursEnd?: string;
    operatingDays?: number[];
  }) => request<any>(`/caisses/${caisseId}/operating-hours`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Client Stats Response Type
export interface ClientStatsResponse {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  suspendedClients: number;
  newClientsThisMonth: number;
  segmentDistribution: {
    vip: number;
    premium: number;
    standard: number;
  };
  financialSummary: {
    totalCredit: number;
    totalEpargne: number;
    avgRepaymentRate: number;
    totalLoyaltyPoints: number;
  };
}

// Client API
export const clientApi = {
  getAll: (params?: { page?: number; perPage?: number; statut?: string; segment?: string; search?: string }) =>
    requestPaginated<any>('/clients', params),
  getAllList: (params?: { perPage?: number; statut?: string; segment?: string; search?: string }) =>
    requestAllPages<any>('/clients', params),
  getById: (id: string) => request<any>(`/clients/${id}`),
  // Statistiques agrégées (optimisé - SQL COUNT)
  getStats: () => request<ClientStatsResponse>('/clients/stats'),
  // Clients éligibles au crédit (avec compte courant actif dans l'agence)
  getEligibleForCredit: (params?: { page?: number; perPage?: number }) =>
    requestPaginated<any>('/clients/eligible-credit', params),
  getEligibleForCreditList: (params?: { perPage?: number }) =>
    requestAllPages<any>('/clients/eligible-credit', params),
  create: (data: any) => request<any>('/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  search: (query: string, params?: { page?: number; perPage?: number }) =>
    requestPaginated<any>('/clients/search', { q: query, ...params }),
  getWithLocation: (params?: { page?: number; perPage?: number }) =>
    requestPaginated<any>('/clients/with-location', params),
  delete: (id: string) => request<void>(`/clients/${id}`, {
    method: 'DELETE',
  }),

  // Scoring
  getScoreState: (clientId: string) => request<ClientScoreState>(`/clients/${clientId}/score-state`),
  getScoreHistory: (clientId: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return request<ScoreHistoryResponse>(`/clients/${clientId}/score-history${q ? `?${q}` : ''}`);
  },
  recalculateScore: (clientId: string, reason?: string) =>
    request<ScoreResult>(`/clients/${clientId}/score`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  addScoreBonus: (clientId: string, data: { points: number; description: string }) =>
    request<{ success: boolean; message: string; scoreGlobal: number; segment: string }>(
      `/clients/${clientId}/score-bonus`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
  getScoreTrend: (clientId: string, months?: number) =>
    request<ScoreTrendPoint[]>(`/clients/${clientId}/score-trend${months ? `?months=${months}` : ''}`),
  getScorePercentile: (clientId: string) =>
    request<ScorePercentile>(`/clients/${clientId}/score-percentile`),
  getAgencyScoreStats: (agenceId?: string) =>
    request<AgencyScoreStats[]>(`/scoring/agency-stats${agenceId ? `?agenceId=${agenceId}` : ''}`),
};

// ============================================================================
// SCORING TYPES
// ============================================================================

export interface ScoreResult {
  scoreGlobal: number;
  segment: string;
  scorePayment: number;
  scoreLoyalty: number;
  scoreEngagement: number;
  scoreCompliance: number;
  tauxRemboursement: string;
  totalPointsFidelite: number;
}

export interface ClientScoreState {
  id: string;
  clientId: string;
  agenceId?: string;
  scorePayment: number;
  scoreLoyalty: number;
  scoreEngagement: number;
  scoreCompliance: number;
  scoreGlobal: number;
  segment: string;
  tauxRemboursement: string;
  totalPointsFidelite: number;
  totalCreditsRembourses: number;
  totalIncidents: number;
  totalEpargneDepots: number;
  lastEventAt?: string;
  lastRecalcAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientScoreEvent {
  id: string;
  clientId: string;
  agenceId?: string;
  eventType: string;
  refId: string;
  refType: string;
  pointsDelta: number;
  montant?: string;
  reason?: string;
  metadata?: any;
  createdBy?: string;
  createdAt: string;
}

export interface ScoreHistoryResponse {
  rows: ClientScoreEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScoreTrendPoint {
  month: string;
  pointsDelta: number;
  eventCount: number;
}

export interface ScorePercentile {
  rank: number;
  total: number;
  percentile: number;
  agenceId?: string;
}

export interface AgencyScoreStats {
  agenceId: string;
  totalClients: number;
  avgScore: number;
  avgPayment: number;
  avgLoyalty: number;
  avgEngagement: number;
  avgCompliance: number;
  segments: {
    VIP: number;
    Premium: number;
    Standard: number;
    Risque: number;
  };
}

// ============================================================================
// ADMIN SCORING API
// ============================================================================

export interface AdminScoreEventsFilter {
  agenceId?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  limit?: number;
  offset?: number;
}

export interface AdminScoreEvent extends ClientScoreEvent {
  clientNom?: string;
  clientPrenom?: string;
}

export interface AdminScoreEventsResponse {
  rows: AdminScoreEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminScoreStatesFilter {
  agenceId?: string;
  segment?: string;
  limit?: number;
  offset?: number;
}

export interface AdminScoreStateRow extends ClientScoreState {
  clientNom?: string;
  clientPrenom?: string;
}

export interface AdminScoreStatesResponse {
  rows: AdminScoreStateRow[];
  total: number;
  limit: number;
  offset: number;
}

export const scoringAdminApi = {
  getEvents: (filters: AdminScoreEventsFilter = {}) => {
    const qs = new URLSearchParams();
    if (filters.agenceId) qs.set('agenceId', filters.agenceId);
    if (filters.eventType) qs.set('eventType', filters.eventType);
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) qs.set('dateTo', filters.dateTo);
    if (filters.clientId) qs.set('clientId', filters.clientId);
    if (filters.limit) qs.set('limit', String(filters.limit));
    if (filters.offset) qs.set('offset', String(filters.offset));
    const q = qs.toString();
    return request<AdminScoreEventsResponse>(`/admin/scoring/events${q ? `?${q}` : ''}`);
  },

  getStates: (filters: AdminScoreStatesFilter = {}) => {
    const qs = new URLSearchParams();
    if (filters.agenceId) qs.set('agenceId', filters.agenceId);
    if (filters.segment) qs.set('segment', filters.segment);
    if (filters.limit) qs.set('limit', String(filters.limit));
    if (filters.offset) qs.set('offset', String(filters.offset));
    const q = qs.toString();
    return request<AdminScoreStatesResponse>(`/admin/scoring/states${q ? `?${q}` : ''}`);
  },

  getEventTypes: () => request<Record<string, string>>('/admin/scoring/event-types'),

  exportEventsUrl: (filters: AdminScoreEventsFilter = {}) => {
    const qs = new URLSearchParams();
    if (filters.agenceId) qs.set('agenceId', filters.agenceId);
    if (filters.eventType) qs.set('eventType', filters.eventType);
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) qs.set('dateTo', filters.dateTo);
    if (filters.clientId) qs.set('clientId', filters.clientId);
    const q = qs.toString();
    return `/api/admin/scoring/events/export${q ? `?${q}` : ''}`;
  },

  exportStatesUrl: (filters: AdminScoreStatesFilter = {}) => {
    const qs = new URLSearchParams();
    if (filters.agenceId) qs.set('agenceId', filters.agenceId);
    if (filters.segment) qs.set('segment', filters.segment);
    const q = qs.toString();
    return `/api/admin/scoring/states/export${q ? `?${q}` : ''}`;
  },

  exportAgencyStatsUrl: (agenceId?: string) => {
    return `/api/admin/scoring/agency-stats/export${agenceId ? `?agenceId=${agenceId}` : ''}`;
  },
};

// ============================================================================
// TYPES D'ERREURS STRUCTURÉES
// ============================================================================

/**
 * Erreur de solde insuffisant pour décaissement crédit
 * Utilisé pour le workflow de réapprovisionnement intelligent
 */
export interface InsufficientFundsErrorData {
  code: "INSUFFICIENT_FUNDS" | "COFFRE_SOLDE_MINIMUM" | "COFFRE_INSUFFICIENT_FUNDS";
  message: string;
  required: number;
  current: number;
  deficit: number;
  coffreId: string;
  coffreCode: string;
  coffreName?: string;
  soldeMinimum?: number;
}

/**
 * Classe d'erreur API qui préserve les données structurées
 * Permet de propager les erreurs business avec leur contexte complet
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/** Codes d'erreur qui déclenchent le workflow de réapprovisionnement */
const FUNDS_ERROR_CODES = ["INSUFFICIENT_FUNDS", "COFFRE_SOLDE_MINIMUM", "COFFRE_INSUFFICIENT_FUNDS"];

/**
 * Type guard pour vérifier si une erreur est une ApiError avec données de solde insuffisant
 */
export function isInsufficientFundsError(error: unknown): error is ApiError & { data: { error: InsufficientFundsErrorData } } {
  if (error instanceof ApiError && FUNDS_ERROR_CODES.includes(error.data?.error?.code)) {
    return true;
  }
  if (typeof error === "object" && error !== null) {
    const e = error as any;
    return FUNDS_ERROR_CODES.includes(e?.error?.code) || FUNDS_ERROR_CODES.includes(e?.data?.error?.code);
  }
  return false;
}

/**
 * Normalise une erreur coffre guard en format InsufficientFundsErrorData
 */
function normalizeCoffreError(raw: any): InsufficientFundsErrorData | null {
  if (raw?.code === "COFFRE_SOLDE_MINIMUM") {
    return {
      code: "COFFRE_SOLDE_MINIMUM",
      message: `Le solde minimum du coffre (${Number(raw.soldeMinimum).toLocaleString('fr-FR')} FCFA) ne serait pas respecté après cette opération`,
      coffreId: raw.coffreId,
      coffreCode: raw.coffreCode || "—",
      current: raw.soldeBefore ?? (raw.soldeApresOperation + (raw.amount ?? 0)),
      required: (raw.amount ?? 0) + raw.soldeMinimum,
      deficit: raw.deficit ?? (raw.soldeMinimum - raw.soldeApresOperation),
      soldeMinimum: raw.soldeMinimum,
    };
  }
  if (raw?.code === "COFFRE_INSUFFICIENT_FUNDS") {
    return {
      code: "COFFRE_INSUFFICIENT_FUNDS",
      message: `Solde du coffre insuffisant`,
      coffreId: raw.coffreId,
      coffreCode: raw.coffreCode || "—",
      current: raw.available,
      required: raw.requested,
      deficit: raw.deficit,
    };
  }
  return null;
}

/**
 * Extraire les données d'erreur de solde insuffisant d'une erreur
 */
export function extractInsufficientFundsData(error: unknown): InsufficientFundsErrorData | null {
  // Extract raw error object
  let raw: any = null;
  if (error instanceof ApiError) {
    raw = error.data?.error;
  } else if (typeof error === "object" && error !== null) {
    const e = error as any;
    raw = e?.error || e?.data?.error;
  }
  if (!raw?.code) return null;

  // Direct INSUFFICIENT_FUNDS format
  if (raw.code === "INSUFFICIENT_FUNDS") return raw;

  // Coffre guard errors → normalize to InsufficientFundsErrorData
  return normalizeCoffreError(raw);
}

// Credit API
export const creditApi = {
  getAll: async (params?: { clientId?: string; statut?: string; includeEcheances?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.clientId) queryParams.append('clientId', params.clientId);
    if (params?.statut) queryParams.append('statut', params.statut);
    if (params?.includeEcheances) queryParams.append('include_echeances', 'true');
    const query = queryParams.toString();
    const response = await request<{ data: any[]; pagination?: any }>(`/credits${query ? `?${query}` : ''}`);
    // Handle both paginated response {data: [...]} and direct array
    return Array.isArray(response) ? response : (response?.data || []);
  },
  getById: (id: string) => request<any>(`/credits/${id}`),
  getByClient: (clientId: string) => request<any[]>(`/clients/${clientId}/credits`),
  create: (data: any) => request<any>('/credits', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // Décaissement: crée le crédit et crédite le compte courant du client
  decaissement: (data: {
    demandeId: string;
    duree?: number;
    dateDebut?: string;
    dateFin?: string;
    dateSolvabilite?: string;
    soldeRestant?: string;
    decaissementImmediat?: boolean;
    disbursementChannel?: 'ACCOUNT' | 'CASH' | 'MOBILE_MONEY';
    provider?: 'MTN' | 'AIRTEL';
  }) =>
    request<any>('/credits/decaissement', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) => request<any>(`/credits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  addPayment: (creditId: string, data: any) => request<any>(`/credits/${creditId}/payments`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // Scoring
  getScoring: (demandeId: string) => request<any>(`/demandes-credit/${demandeId}/scoring`),
  recalculerScore: (demandeId: string) => request<any>(`/demandes-credit/${demandeId}/recalculer-score`, {
    method: 'POST',
  }),
};

// Credit Plans API
export const creditPlanApi = {
  getAll: (params?: { isActive?: boolean; agenceId?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.isActive !== undefined) queryParams.append('isActive', String(params.isActive));
    if (params?.agenceId) queryParams.append('agenceId', params.agenceId);
    const query = queryParams.toString();
    return request<any[]>(`/credit-plans${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => request<any>(`/credit-plans/${id}`),
  create: (data: any) => request<any>('/credit-plans', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/credit-plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/credit-plans/${id}`, {
    method: 'DELETE',
  }),
};

// Demandes de crédit API
export const demandeCreditApi = {
  getAll: () => request<any[]>('/demandes-credit'),
  getByClient: (clientId: string) => request<any[]>(`/clients/${clientId}/demandes-credit`),
  create: (data: any) => request<any>('/demandes-credit', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/demandes-credit/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Enquête Credit API
export const enqueteCreditApi = {
  getAll: () => request<any[]>('/enquetes-credit'),
  getByClient: (clientId: string) => request<any[]>(`/clients/${clientId}/enquetes-credit`),
  create: (data: any) => request<any>('/enquetes-credit', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/enquetes-credit/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Remboursement API
export const remboursementApi = {
  getByCredit: (creditId: string) => request<any[]>(`/credits/${creditId}/remboursements`),
  create: (data: any) => request<any>('/remboursements', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Payments API (Mobile Money via pawaPay)
export const paymentsApi = {
  /** Get fee estimate for MM transaction */
  feeEstimate: (params: { amount: number; provider: 'MTN' | 'AIRTEL'; direction: 'COLLECTION' | 'PAYOUT'; feeOption: 'CLIENT_PAYS' | 'FEES_DEDUCTED' }) => {
    const qs = new URLSearchParams({
      amount: String(params.amount),
      provider: params.provider,
      direction: params.direction,
      feeOption: params.feeOption,
    });
    return request<{ feeAmount: number; feeRate: number; feeFixed: number; montantBrut: number; montantNet: number; feeOption: string }>(`/payments/fee-estimate?${qs}`);
  },

  /** Initiate a collection (money-in) */
  collect: (data: {
    provider: 'MTN' | 'AIRTEL';
    amount: number;
    phone: string;
    clientId: string;
    compteId?: string;
    description?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    feeOption?: 'CLIENT_PAYS' | 'FEES_DEDUCTED';
  }) => request<any>('/payments/collect', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /** Get payment intent by ID (for polling) */
  getIntent: (id: string) => request<any>(`/payments/${id}`),

  /** Validate a phone number and resolve operator */
  validatePhone: (phone: string) => request<{ isValid: boolean; operator: string | null; message: string }>('/payments/validate-phone', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }),
};

// Compte Epargne API (uses unified /api/comptes endpoint)
export const compteEpargneApi = {
  getAll: (params?: { search?: string; page?: number; limit?: number; typeCompte?: string; statut?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.typeCompte) queryParams.append('typeCompte', params.typeCompte);
    if (params?.statut) queryParams.append('statut', params.statut);
    const query = queryParams.toString();
    return request<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>(
      `/comptes${query ? `?${query}` : ''}`
    );
  },
  getStats: () =>
    request<{
      total: number;
      epargne: number;
      courant: number;
      bloque: number;
      totalSolde: number;
      tauxMoyenGlobal: number;
      tauxMoyenEpargne: number;
      tauxMoyenCourant: number;
      tauxMoyenBloque: number;
    }>('/comptes/stats'),
  getProduits: (params?: { typeCompte?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.typeCompte) queryParams.append('typeCompte', params.typeCompte);
    const query = queryParams.toString();
    return request<any[]>(`/produits-compte${query ? `?${query}` : ''}`);
  },
  checkAccountNumber: (accountNumber: string) =>
    request<{ found: boolean; ownerName?: string }>(
      `/accounts/check/${encodeURIComponent(accountNumber)}`
    ),
  getByClient: (clientId: string) => request<any[]>(`/clients/${clientId}/comptes`),
  getById: (id: string) => request<any>(`/comptes/${id}`),
  create: (data: any) => request<any>('/comptes', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/comptes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  depot: (id: string, data: any) => request<any>(`/comptes/${id}/depot`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  depotInitial: (id: string, data: any) => request<any>(`/comptes/${id}/depot-initial`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  retrait: (id: string, data: any) => request<any>(`/comptes/${id}/retrait`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  crediterInterets: (id: string, data: { montant: number; periode: string; tauxInteret: number; observations?: string }) =>
    request<{ transaction: any; mouvement_id: string; message: string }>(`/comptes/${id}/crediter-interets`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  debloquer: (id: string, data?: { motif?: string }) => request<any>(`/comptes/${id}/debloquer`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  }),
  createTransfer: (data: {
    sourceCompteId: string;
    destinationCompteId?: string;
    destinationAccountNumber?: string;
    montant: number;
    scheduled?: boolean;
    frequence?: 'once' | 'daily' | 'weekly' | 'monthly';
    prochaineExecution?: string; // ISO datetime for Cron start date
  }) =>
    request<any>('/comptes/transferts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getScheduledTransfers: (params?: { search?: string; page?: number; limit?: number; actif?: boolean; statut?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.actif !== undefined) queryParams.append('actif', String(params.actif));
    if (params?.statut) queryParams.append('statut', params.statut);
    const query = queryParams.toString();
    return request<{
      data: any[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/comptes/transferts-programmes${query ? `?${query}` : ''}`);
  },
  updateScheduledTransfer: (
    id: string,
    data: { montant?: number; frequence?: 'once' | 'daily' | 'weekly' | 'monthly'; prochaineExecution?: string | null; actif?: boolean }
  ) =>
    request<any>(`/comptes/transferts-programmes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getScheduledTransferStats: () =>
    request<{
      totalCount: number;
      activeCount: number;
      pausedCount: number;
      failedCount: number;
      totalVolume: number;
      nextExecution: string | null;
      trend?: number;
      trendUp?: boolean;
    }>('/comptes/transferts-programmes/stats'),

  // PR3: Nouveaux endpoints production-ready

  /** Suppression soft d'un virement programmé */
  deleteScheduledTransfer: (id: string) =>
    request<{ success: boolean }>(`/comptes/transferts-programmes/${id}`, {
      method: 'DELETE',
    }),

  /** Exécution manuelle immédiate d'un virement programmé */
  runScheduledTransferNow: (id: string) =>
    request<{
      success: boolean;
      mouvementId?: string;
      error?: string;
    }>(`/comptes/transferts-programmes/${id}/run-now`, {
      method: 'POST',
    }),

  /** Historique des exécutions d'un virement programmé */
  getScheduledTransferHistory: (id: string, params?: { page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    const query = queryParams.toString();
    return request<{
      data: Array<{
        id: string;
        executionKey: string;
        status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
        startedAt: string | null;
        completedAt: string | null;
        mouvementId: string | null;
        errorMessage: string | null;
        attemptNumber: number;
        createdAt: string;
      }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/comptes/transferts-programmes/${id}/history${query ? `?${query}` : ''}`);
  },

  /** Santé du système de virements programmés */
  getScheduledTransfersHealth: () =>
    request<{
      totalSchedules: number;
      activeSchedules: number;
      pausedSchedules: number;
      schedulesWithFailures: number;
      totalRuns: number;
      successRuns: number;
      failedRuns: number;
      skippedRuns: number;
      staleProcessingLocks: number;
      oldestPendingSchedule: string | null;
      avgExecutionTimeMs: number | null;
    }>('/comptes/transferts-programmes/health'),

  /** Historique des virements instantanés avec pagination et filtres */
  getTransferHistory: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    statut?: string;
    from?: string;
    to?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.search) queryParams.append('search', params.search);
    if (params?.statut) queryParams.append('statut', params.statut);
    if (params?.from) queryParams.append('from', params.from);
    if (params?.to) queryParams.append('to', params.to);
    const query = queryParams.toString();
    return request<{
      data: Array<{
        id: string;
        reference: string;
        montant: string;
        statut: string;
        dateOperation: string;
        createdAt: string;
        metadata: any;
        reversalOfId: string | null;
        sourceCompteId: string | null;
        sourceNumero: string | null;
        sourceType: string | null;
        sourceSoldeApres: string | null;
        destCompteId: string | null;
        destNumero: string | null;
        destType: string | null;
        destSoldeApres: string | null;
        sourceUserNom: string | null;
        sourceUserPrenom: string | null;
        destUserNom: string | null;
        destUserPrenom: string | null;
        createdBy: string | null;
      }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/comptes/transferts/historique${query ? `?${query}` : ''}`);
  },

  /** Statistiques des virements instantanés */
  getTransferStats: () =>
    request<{
      totalCount: number;
      totalAmount: number;
      postedCount: number;
      reversedCount: number;
      monthCount: number;
      monthAmount: number;
      trend: number;
      trendUp: boolean;
    }>('/comptes/transferts/stats'),

  // Batch activation of pending accounts
  batchActivate: (accountIds: string[], sessionCaisseId: string) =>
    request<{
      success: boolean;
      activated: number;
      failed: number;
      results: Array<{ id: string; success: boolean; error?: string }>;
    }>('/comptes/batch-activate', {
      method: 'POST',
      body: JSON.stringify({ accountIds, sessionCaisseId }),
    }),
};

// Transaction Epargne API
export interface PaginatedTransactions {
  data: any[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const transactionEpargneApi = {
  getByCompte: (compteId: string, opts?: { limit?: number; cursor?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString();
    return request<PaginatedTransactions>(`/comptes/${compteId}/transactions${qs ? `?${qs}` : ''}`);
  },
  create: (data: any) => request<any>('/transactions-epargne', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Tontine API
export const tontineApi = {
  getAll: (params?: { statut?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.statut) queryParams.append('statut', params.statut);
    const query = queryParams.toString();
    return request<any[]>(`/tontines${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => request<any>(`/tontines/${id}`),
  getByClient: (clientId: string) => request<any[]>(`/clients/${clientId}/tontines`),
  create: (data: any) => request<any>('/tontines', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/tontines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/tontines/${id}`, {
    method: 'DELETE',
  }),
  getMembres: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/membres`),
  addMembre: (tontineId: string, data: any) => request<any>(`/tontines/${tontineId}/membres`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteMembre: (tontineId: string, membreId: string) => request<void>(`/tontines/${tontineId}/membres/${membreId}`, {
    method: 'DELETE',
  }),
  getContributions: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/contributions`),
  addContribution: (tontineId: string, data: any) => request<any>(`/tontines/${tontineId}/contributions`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // ============================================================================
  // V2 PRODUCTION-READY ENDPOINTS
  // ============================================================================

  // Cycles
  getCycles: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/cycles`),
  getCycle: (tontineId: string, cycleId: string) => request<any>(`/tontines/${tontineId}/cycles/${cycleId}`),
  generateCycle: (tontineId: string, data?: { startDate?: string; randomSeed?: number }) =>
    request<any>(`/tontines/${tontineId}/cycles/generate`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  closeCycle: (tontineId: string, cycleId: string) =>
    request<any>(`/tontines/${tontineId}/cycles/${cycleId}/close`, { method: 'POST' }),

  // Turns
  getTurns: (tontineId: string, cycleId: string) =>
    request<any[]>(`/tontines/${tontineId}/cycles/${cycleId}/turns`),
  reorderTurns: (tontineId: string, cycleId: string, data: { newOrder: Array<{ turnNumber: number; memberId: string }>; reason: string }) =>
    request<any>(`/tontines/${tontineId}/cycles/${cycleId}/turns/reorder`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTurnAudit: (tontineId: string, cycleId: string) =>
    request<any[]>(`/tontines/${tontineId}/cycles/${cycleId}/audit`),
  lockTurn: (tontineId: string, turnId: string, lock: boolean, reason?: string) =>
    request<any>(`/tontines/${tontineId}/turns/${turnId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ lock, reason }),
    }),
  skipTurn: (tontineId: string, cycleId: string, turnId: string, reason: string) =>
    request<any>(`/tontines/${tontineId}/cycles/${cycleId}/turns/${turnId}/skip`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  requestSwap: (tontineId: string, cycleId: string, turnIdA: string, turnIdB: string, reason: string) =>
    request<any>(`/tontines/${tontineId}/cycles/${cycleId}/turns/swap`, {
      method: 'POST',
      body: JSON.stringify({ turnIdA, turnIdB, reason }),
    }),
  approveSwap: (tontineId: string, auditId: string) =>
    request<any>(`/tontines/${tontineId}/swap/${auditId}/approve`, { method: 'POST' }),

  // Cycle report
  getCycleReport: (tontineId: string, cycleId: string) =>
    request<any>(`/tontines/${tontineId}/cycles/${cycleId}/report`),

  // Join fee
  payJoinFee: (tontineId: string, membreId: string, data?: { sessionCaisseId?: string; methodePaiement?: string }) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/pay-join-fee`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  // Schedules
  getSchedules: (tontineId: string, cycleId: string) =>
    request<any[]>(`/tontines/${tontineId}/cycles/${cycleId}/schedules`),

  // Retirable (calcul du montant retirable)
  getRetirable: (tontineId: string, memberId: string) =>
    request<any>(`/tontines/${tontineId}/retirable/${memberId}`),

  // Distribution Requests (V2 workflow)
  getDistributionRequests: (tontineId: string, params?: { cycleId?: string; status?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.cycleId) queryParams.append('cycleId', params.cycleId);
    if (params?.status) queryParams.append('status', params.status);
    const query = queryParams.toString();
    return request<any[]>(`/tontines/${tontineId}/distribution-requests${query ? `?${query}` : ''}`);
  },
  createDistributionRequest: (tontineId: string, data: {
    cycleId: string;
    turnId: string;
    beneficiaryMemberId: string;
    payoutMethod: 'CASH' | 'MOBILE_MONEY' | 'WALLET';
    provider?: string;
    targetMsisdn?: string;
    targetWalletAccountId?: string;
    notes?: string;
  }) => request<any>(`/tontines/${tontineId}/distribution-requests`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  approveDistribution: (tontineId: string, requestId: string) =>
    request<any>(`/tontines/${tontineId}/distribution-requests/${requestId}/approve`, { method: 'POST' }),
  cancelDistribution: (tontineId: string, requestId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/distribution-requests/${requestId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Dashboard
  getDashboard: (tontineId: string) => request<any>(`/tontines/${tontineId}/dashboard`),

  // Lifecycle
  activate: (tontineId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/activate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  pause: (tontineId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/pause`, { method: 'POST', body: JSON.stringify({ reason }) }),
  resume: (tontineId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/resume`, { method: 'POST', body: JSON.stringify({ reason }) }),
  complete: (tontineId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/complete`, { method: 'POST', body: JSON.stringify({ reason }) }),
  cancel: (tontineId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Member workflow
  requestMemberExit: (tontineId: string, membreId: string) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/request-exit`, { method: 'POST' }),
  approveMemberExit: (tontineId: string, membreId: string) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/approve-exit`, { method: 'POST' }),
  replaceMember: (tontineId: string, membreId: string, newClientId: string) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/replace`, {
      method: 'POST', body: JSON.stringify({ newClientId }),
    }),
  assignMemberRole: (tontineId: string, membreId: string, role: string | null) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/role`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    }),
  midCycleJoin: (tontineId: string, clientId: string) =>
    request<any>(`/tontines/${tontineId}/mid-cycle-join`, {
      method: 'POST', body: JSON.stringify({ clientId }),
    }),
  suspendMember: (tontineId: string, membreId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  reinstateMember: (tontineId: string, membreId: string) =>
    request<any>(`/tontines/${tontineId}/membres/${membreId}/reinstate`, { method: 'POST' }),

  // Penalties
  getPenalties: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/penalites`),
  createPenalty: (tontineId: string, data: { membreId: string; montant: number; penaltyType?: string; motif?: string; dateFaute?: string }) =>
    request<any>(`/tontines/${tontineId}/penalites`, { method: 'POST', body: JSON.stringify(data) }),
  payPenalty: (tontineId: string, penaliteId: string) =>
    request<any>(`/tontines/${tontineId}/penalites/${penaliteId}/pay`, { method: 'POST' }),
  waivePenalty: (penaliteId: string, reason?: string) =>
    request<any>(`/tontine-penalites/${penaliteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'WAIVED', waive_reason: reason }),
    }),

  // Reconciliation
  getReconciliation: (tontineId: string) => request<any>(`/tontines/${tontineId}/reconciliation`),

  // Calendar / Echeances
  getEcheances: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/echeances`),

  // Reject swap
  rejectSwap: (tontineId: string, auditId: string, reason?: string) =>
    request<any>(`/tontines/${tontineId}/swap/${auditId}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
};

// Tontine Plans API
export const tontinePlanApi = {
  getAll: () => request<any[]>('/tontine-plans'),
  getById: (id: string) => request<any>(`/tontine-plans/${id}`),
  create: (data: any) => request<any>('/tontine-plans', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/tontine-plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/tontine-plans/${id}`, {
    method: 'DELETE',
  }),
};

// Session Caisse API
export const sessionCaisseApi = {
  getAll: () => requestListAll<any>('/sessions-caisse'),
  get: (id: string) => request<any>(`/sessions-caisse/${id}`),
  getByCaissier: (caissierId: string) => requestListAll<any>(`/sessions-caisse/caissier/${caissierId}`),
  getActive: () => request<any>('/sessions-caisse/active'),
  // Récupérer les caisses assignées à l'utilisateur avec leur solde disponible
  getMyCaisses: () => request<any[]>('/sessions-caisse/my-caisses'),
  update: (id: string, data: any) => request<any>(`/sessions-caisse/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  getOperations: (sessionId: string) => requestListAll<any>(`/sessions-caisse/${sessionId}/operations`),
  addOperation: (data: any) => request<any>('/operations-caisse', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      montant: String(data.montant)
    }),
  }),
  close: (id: string, data: any) => request<any>(`/sessions-caisse/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // Heartbeat - mise à jour de l'activité de la session (pour éviter le timeout)
  heartbeat: (id: string) => request<{ success: boolean; timestamp: string }>(`/sessions-caisse/${id}/heartbeat`, {
    method: 'POST',
  }),
  // Routes de monitoring (admin)
  getRisky: () => requestListAll<any>('/sessions-caisse/risky'),
  getEcarts: (threshold?: number) => requestListAll<any>(`/sessions-caisse/ecarts${threshold ? `?threshold=${threshold}` : ''}`),
  closeExpired: (timeoutHours?: number) => request<any>('/sessions-caisse/close-expired', {
    method: 'POST',
    body: JSON.stringify({ timeoutHours }),
  }),
  forceClose: (id: string, reason?: string) => request<any>(`/sessions-caisse/${id}/force-close`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  // ========== WORKFLOW SECURISE D'OUVERTURE (Coffre → Caisse) ==========
  // Phase A: Demande d'ouverture
  requestOpening: (data: { caisseId: string; montantDemande: number; agenceId?: string; observations?: string; supervisorOverride?: boolean }) =>
    request<{ session: any; transfert: any }>('/sessions-caisse/request-opening', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Récupérer la session en attente (REQUESTING_FUNDS ou FUNDS_DISPATCHED)
  getPending: () => request<any>('/sessions-caisse/pending'),
  // Phase C: Confirmer la réception des fonds et ouvrir la session
  receiveFunds: (id: string, data: { billetageReception: Record<string, number>; observations?: string }) =>
    request<any>(`/sessions-caisse/${id}/receive-funds`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Annuler une demande d'ouverture (uniquement si REQUESTING_FUNDS)
  cancelRequest: (id: string, reason?: string) =>
    request<{ success: boolean }>(`/sessions-caisse/${id}/cancel-request`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  // Ouverture directe avec fonds reporté existant (sans passer par le coffre)
  openDirect: (data: { caisseId: string; agenceId?: string; observations?: string; supervisorOverride?: boolean }) =>
    request<{ session: any }>('/sessions-caisse/open-direct', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ========== WORKFLOW SECURISE DE FERMETURE (Caisse → Coffre) ==========
  // Phase A: Initier la fermeture (gèle la session)
  initiateClose: (id: string) =>
    request<{ session: any }>(`/sessions-caisse/${id}/initiate-close`, {
      method: 'POST',
    }),

  // Phase B: Soumettre le comptage physique (blind count)
  submitCount: (id: string, data: {
    billetage: Record<string, number>;
    ecartJustification?: string;
  }) =>
    request<{ session: any; ecart: number }>(`/sessions-caisse/${id}/submit-count`, {
      method: 'POST',
      body: JSON.stringify({
        billetageFermeture: data.billetage,
        ecartJustification: data.ecartJustification,
      }),
    }),

  // Phase C: Finaliser la clôture (décision transfert coffre + report)
  finalizeClose: (id: string, data: {
    montantVersCoffre: number;
    montantReporte: number;
    observations?: string;
  }) =>
    request<{ session: any; transfert?: any }>(`/sessions-caisse/${id}/finalize-close`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Annuler la fermeture (uniquement si CLOSING_COUNT)
  cancelClose: (id: string, reason?: string) =>
    request<{ success: boolean }>(`/sessions-caisse/${id}/cancel-close`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Soumettre un comptage de vérification (second compteur)
  submitVerification: (id: string, data: { billetage: Record<string, number>; observations?: string }) =>
    request<any>(`/sessions-caisse/${id}/submit-verification`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Récupérer les comptages d'une session (primaire + vérification)
  getCounts: (id: string) =>
    request<any>(`/sessions-caisse/${id}/counts`),

  // Récupérer les sessions en cours de fermeture (pour supervision)
  getClosingSessions: (agenceId?: string) => {
    const query = agenceId ? `?agenceId=${agenceId}` : '';
    return request<any[]>(`/sessions-caisse/closing${query}`);
  },

  // ========== DENOMINATION TEMPLATES ==========
  getDenominationTemplates: (caisseId?: string) => {
    const query = caisseId ? `?caisseId=${caisseId}` : '';
    return request<any[]>(`/caisses/denomination-templates${query}`);
  },

  createDenominationTemplate: (data: {
    nom: string;
    description?: string;
    caisseId?: string;
    agenceId?: string;
    billetage: Record<string, number>;
    totalCalcule: string;
    typeTemplate?: string;
  }) =>
    request<any>('/caisses/denomination-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDenominationTemplate: (id: string, data: Partial<{
    nom: string;
    description?: string;
    billetage: Record<string, number>;
    totalCalcule: string;
    typeTemplate?: string;
  }>) =>
    request<any>(`/caisses/denomination-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteDenominationTemplate: (id: string) =>
    request<{ success: boolean }>(`/caisses/denomination-templates/${id}`, {
      method: 'DELETE',
    }),

  // ========== COUNT SUGGESTION ==========
  suggestCount: (sessionId: string) =>
    request<{
      billetage: Record<string, number>;
      totalSuggere: number;
      soldeTheorique: number;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      reasoning: string[];
    }>(`/sessions-caisse/${sessionId}/suggest-count`),

  // ========== DUAL COUNT CONFIG ==========
  getDualCountConfig: (agenceId?: string) => {
    const query = agenceId ? `?agenceId=${agenceId}` : '';
    return request<any>(`/caisses/dual-count-config${query}`);
  },

  setDualCountConfig: (data: {
    agenceId?: string;
    thresholdMontant?: number;
    alwaysRequiredForClosing?: boolean;
  }) =>
    request<any>('/caisses/dual-count-config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Operations Caisse API
export const caisseOperationApi = {
  getAll: () => requestListAll<any>('/operations-caisse'),
  getToday: () => requestListAll<any>('/operations-caisse/today'),
  create: (data: any) => request<any>('/operations-caisse', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      montant: String(data.montant)
    }),
  }),
  update: (id: string, data: any) => request<any>(`/operations-caisse/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  canReverse: (id: string) => request<{ reversible: boolean; reason?: string }>(`/comptes/operations/${id}/can-reverse`),
  cancel: (id: string, data: { reason: string; sessionCaisseId?: string }) =>
    request<{ success: boolean; reversal: any; original: any; message: string }>(`/comptes/operations/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sendReceipt: (id: string, data: { channel: "SMS" | "EMAIL"; recipient: string }) =>
    request<{ success: boolean; message: string; correlationId: string }>(`/comptes/operations/${id}/send-receipt`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getChain: (id: string) =>
    request<any[]>(`/comptes/operations/${id}/chain`),
};

// Alias for backward compatibility
export const operationCaisseApi = caisseOperationApi;

// Scheduled Caisse Transfers API (inter-agency)
export const scheduledCaisseTransfersApi = {
  getAll: (filters?: { agenceSourceId?: string; agenceDestId?: string; statut?: string }) => {
    const params = new URLSearchParams();
    if (filters?.agenceSourceId) params.append('agenceSourceId', filters.agenceSourceId);
    if (filters?.agenceDestId) params.append('agenceDestId', filters.agenceDestId);
    if (filters?.statut) params.append('statut', filters.statut);
    const q = params.toString();
    return request<any[]>(`/caisses/scheduled-transfers${q ? `?${q}` : ''}`);
  },

  getById: (id: string) => request<any>(`/caisses/scheduled-transfers/${id}`),

  create: (data: {
    agenceSourceId: string;
    agenceDestId: string;
    montant: number;
    datePrevue: string;
    frequence?: string;
    jourSemaine?: number;
    jourMois?: number;
    motif?: string;
    maxExecutions?: number;
  }) =>
    request<any>('/caisses/scheduled-transfers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{
    montant: number;
    datePrevue: string;
    frequence: string;
    jourSemaine: number;
    jourMois: number;
    motif: string;
    maxExecutions: number;
  }>) =>
    request<any>(`/caisses/scheduled-transfers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  cancel: (id: string) =>
    request<{ success: boolean }>(`/caisses/scheduled-transfers/${id}/cancel`, {
      method: 'POST',
    }),

  execute: (id: string) =>
    request<any>(`/caisses/scheduled-transfers/${id}/execute`, {
      method: 'POST',
    }),
};

// Caisses Separees API
export const caisseSepareeApi = {
  getBySession: (sessionId: string) => request<any[]>(`/sessions-caisse/${sessionId}/caisses-separees`),
};

// Agent Terrain API
export const agentTerrainApi = {
  getAll: (params?: { page?: number; perPage?: number; statut?: string }) =>
    requestPaginated<any>('/agents-terrain', params),
  getAllList: (params?: { perPage?: number; statut?: string }) =>
    requestAllPages<any>('/agents-terrain', params),
  /** Get the agent terrain profile for the currently logged-in user */
  getMe: () => request<{ data: any | null; message?: string }>('/agents-terrain/me'),
  getById: (id: string) => request<any>(`/agents-terrain/${id}`),
  create: (data: any) => request<any>('/agents-terrain', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/agents-terrain/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  getProspections: (agentId: string) => request<any[]>(`/agents-terrain/${agentId}/prospections`),
  getVisites: (agentId: string) => request<any[]>(`/agents-terrain/${agentId}/visites`),
  getPaiements: (agentId: string) => request<any[]>(`/agents-terrain/${agentId}/paiements`),
};

// Prospection API
export const prospectionApi = {
  getAll: (params?: { page?: number; perPage?: number; statut?: string; arrondissementId?: string; marcheId?: string; agentId?: string }) =>
    requestPaginated<any>('/prospections', params),
  getById: (id: string) => request<any>(`/prospections/${id}`),
  create: (data: any) => request<any>('/prospections', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/prospections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  convert: (id: string, data?: any) => request<any>(`/prospections/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  }),
  getStats: (agentId: string, params?: { period?: string }) =>
    request<any>(`/agents/${agentId}/prospection-stats${params?.period ? `?period=${params.period}` : ''}`),
  getFollowups: (agentId: string) =>
    request<any[]>(`/agents/${agentId}/prospection-followups`),
  countAll: (params?: { agentId?: string }) =>
    request<{ count: number }>(`/prospections/count${params?.agentId ? `?agentId=${params.agentId}` : ''}`),
  countActive: (params?: { agentId?: string }) =>
    request<{ count: number }>(`/prospections/count?statut=REGISTERED,INTERESTED,TO_FOLLOW_UP${params?.agentId ? `&agentId=${params.agentId}` : ''}`),
  countNew: (params?: { agentId?: string }) =>
    request<{ count: number }>(`/prospections/count?statut=REGISTERED${params?.agentId ? `&agentId=${params.agentId}` : ''}`),
};

// Arrondissements & Marchés API
export const arrondissementApi = {
  getAll: (params?: { actif?: boolean; villeId?: string }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any[]>(`/arrondissements${q ? `?${q}` : ''}`);
  },
  create: (data: any) => request<any>('/arrondissements', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/arrondissements/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<any>(`/arrondissements/${id}`, { method: 'DELETE' }),
};

export const marcheApi = {
  getAll: (params?: { arrondissementId?: string; actif?: boolean }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any[]>(`/marches${q ? `?${q}` : ''}`);
  },
  create: (data: any) => request<any>('/marches', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/marches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<any>(`/marches/${id}`, { method: 'DELETE' }),
};

// Régions (ADM1) API
export const regionApi = {
  getAll: (params?: { paysId?: string; actif?: boolean }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any[]>(`/regions${q ? `?${q}` : ''}`);
  },
  getById: (id: string) => request<any>(`/regions/${id}`),
};

// Départements (ADM2) API
export const departementApi = {
  getAll: (params?: { regionId?: string; paysId?: string; actif?: boolean }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any[]>(`/departements${q ? `?${q}` : ''}`);
  },
};

// Villes API (mondial, avec support autocomplete)
export const paysApi = {
  getAll: (params?: { actif?: boolean; search?: string }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any[]>(`/pays${q ? `?${q}` : ''}`);
  },
};

export const villeApi = {
  getAll: (params?: { regionId?: string; paysId?: string; actif?: boolean; search?: string; limit?: number }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any[]>(`/villes${q ? `?${q}` : ''}`);
  },
  getById: (id: string) => request<any>(`/villes/${id}`),
};

export interface LocalityOption {
  id: string;
  type: 'CITY' | 'DISTRICT';
  name: string;
  regionName: string | null;
  population: number | null;
  isChefLieu: boolean;
}

export const localityApi = {
  getAll: (params: { paysId: string; search?: string; limit?: number }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<LocalityOption[]>(`/localities${q ? `?${q}` : ''}`);
  },
};

// Prospection Primes API
export const prospectionPrimeApi = {
  getAll: (params?: { page?: number; perPage?: number; agentId?: string; statut?: string; periode?: string; agenceId?: string }) =>
    requestPaginated<any>('/prospection-primes', params),
  getById: (id: string) => request<any>(`/prospection-primes/${id}`),
  approve: (id: string) => request<any>(`/prospection-primes/${id}/approve`, { method: 'POST' }),
  reject: (id: string, data?: { rejectionReason?: string }) => request<any>(`/prospection-primes/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  }),
  pay: (id: string) => request<any>(`/prospection-primes/${id}/pay`, { method: 'POST' }),
  getConfig: (params?: { agenceId?: string }) =>
    request<any[]>(`/prospection-prime-config${params?.agenceId ? `?agence_id=${params.agenceId}` : ''}`),
  updateConfig: (id: string, data: any) => request<any>(`/prospection-prime-config/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  createConfig: (data: any) => request<any>('/prospection-prime-config', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Supervision API
export const supervisionApi = {
  getProspectionPerformance: (params?: { agenceId?: string; period?: string }) => {
    const q = buildQuery(params as Record<string, unknown>);
    return request<any>(`/supervision/prospection-performance${q ? `?${q}` : ''}`);
  },
};

// Visite Terrain API
export const visiteTerrainApi = {
  getAll: (params?: { page?: number; perPage?: number }) =>
    requestPaginated<any>('/visites-terrain', params),
  create: (data: any) => request<any>('/visites-terrain', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/visites-terrain/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Paiement Terrain API
export const paiementTerrainApi = {
  getAll: (params?: { page?: number; perPage?: number; agenceId?: string }) =>
    requestPaginated<any>('/paiements-terrain', params),
  create: (data: any) => request<any>('/paiements-terrain', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/paiements-terrain/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Zones API
export const zonesApi = {
  getAll: () => request<any[]>('/zones'),
  create: (data: any) => request<any>('/zones', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Objectifs Épargne API
export const objectifEpargneApi = {
  getByCompte: (compteId: string) => request<any[]>(`/comptes-epargne/${compteId}/objectifs`),
  create: (compteId: string, data: any) => request<any>(`/comptes-epargne/${compteId}/objectifs`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/objectifs-epargne/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/objectifs-epargne/${id}`, {
    method: 'DELETE',
  }),
};

// Tontine Membres API (extended)
export const tontineMembreApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/membres`),
  add: (tontineId: string, data: any) => request<any>(`/tontines/${tontineId}/membres`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  remove: (tontineId: string, membreId: string) => request<void>(`/tontines/${tontineId}/membres/${membreId}`, {
    method: 'DELETE',
  }),
  update: (tontineId: string, membreId: string, data: any) => request<any>(`/tontines/${tontineId}/membres/${membreId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Contributions Tontine API
export const contributionTontineApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/contributions`),
  create: (data: any) => request<any>('/contributions-tontine', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Tontine Schedule API
export const tontineScheduleApi = {
  preview: (data: any) => request<any>('/tontine-schedule/preview', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Échéances Crédit API
export const echeanceCreditApi = {
  getByCredit: (creditId: string) => request<any[]>(`/credits/${creditId}/echeances`),
  getProchaine: (creditId: string) => request<any>(`/credits/${creditId}/echeances/prochaine`),
  getAll: (params?: { statut?: string; dateDebut?: string; dateFin?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.statut) queryParams.append('statut', params.statut);
    if (params?.dateDebut) queryParams.append('dateDebut', params.dateDebut);
    if (params?.dateFin) queryParams.append('dateFin', params.dateFin);
    const query = queryParams.toString();
    return request<any[]>(`/echeances${query ? `?${query}` : ''}`);
  },
  update: (id: string, data: any) => request<any>(`/echeances/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Agences API
export const agenceApi = {
  getAll: (params?: Record<string, string>) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
    }
    const query = queryParams.toString();
    return request<any[]>(`/agences${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => request<any>(`/agences/${id}`),
  create: (data: any) => request<any>('/agences', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/agences/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/agences/${id}`, {
    method: 'DELETE',
  }),
  // Workflow transitions
  submit: (id: string, data?: { comment?: string }) => request<any>(`/agences/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(data || {}),
  }),
  activate: (id: string) => request<any>(`/agences/${id}/activate`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  reject: (id: string, data: { reason: string }) => request<any>(`/agences/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  suspend: (id: string, data: { reason: string }) => request<any>(`/agences/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  close: (id: string, data: { reason: string }) => request<any>(`/agences/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getChecklist: (id: string) => request<any>(`/agences/${id}/checklist`),
  getStatusHistory: (id: string) => request<any[]>(`/agences/${id}/status-history`),
};

// Transferts Caisse API
export const caisseTransfertApi = {
  getAll: () => request<any[]>('/caisse-transferts'),
  getByAgence: (agenceId: string) => request<any[]>(`/agences/${agenceId}/caisse-transferts`),
  create: (data: any) => request<any>('/caisse-transferts', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/caisse-transferts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  receive: (id: string) => request<any>(`/caisse-transferts/${id}/receive`, {
    method: 'POST',
  }),
  cancel: (id: string) => request<any>(`/caisse-transferts/${id}/cancel`, {
    method: 'POST',
  }),
};

// Coffre-Fort API
export const coffreApi = {
  createTransfert: (data: any) => request<any>('/coffre/transferts', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  validateTransfert: (id: string, approved: boolean, reasonRejection?: string) => request<any>(`/coffre/transferts/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify({ approved, reasonRejection }),
  }),
  executeTransfert: (id: string, sessionId?: string, billetage?: Record<string, number>) => request<any>(`/coffre/transferts/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, billetage }),
  }),
  cancelTransfert: (id: string, reason: string) => request<any>(`/coffre/transferts/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  reverseTransfert: (id: string, data: { reason: string }) => request<any>(`/coffre/transferts/${id}/reverse`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  listTransferts: (params: any) => {
    const queryParams = new URLSearchParams();
    if (params.agenceId) queryParams.append('agenceId', params.agenceId);
    if (params.statut) queryParams.append('statut', params.statut);
    if (params.typeTransfert) queryParams.append('typeTransfert', params.typeTransfert);
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.page) queryParams.append('page', String(params.page));
    const query = queryParams.toString();
    return request<any>(`/coffre/transferts${query ? `?${query}` : ''}`);
  },
  getTransfertDetails: (id: string) => request<any>(`/coffre/transferts/${id}`),
  getStats: (agenceId: string) => request<any>(`/coffre/stats?agenceId=${agenceId}`),
  getConfig: (agenceId: string) => request<any>(`/coffre/config?agenceId=${agenceId}`),
  updateConfig: (data: any) => request<any>('/coffre/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  provision: (data: any) => request<any>('/coffre/approvisionnement', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getMouvements: (params: { agenceId: string; page?: number; limit?: number; dateFrom?: string; dateTo?: string }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('agenceId', params.agenceId);
    if (params.page) queryParams.append('page', String(params.page));
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params.dateTo) queryParams.append('dateTo', params.dateTo);
    return request<any>(`/coffre/mouvements?${queryParams.toString()}`);
  },
  // ========== WORKFLOW SECURISE D'OUVERTURE (Coffre → Caisse) ==========
  // Récupérer les demandes d'ouverture en attente
  getPendingOpeningRequests: (agenceId: string) =>
    request<any[]>(`/coffre/pending-opening-requests?agenceId=${agenceId}`),
  // Phase B: Valider ou rejeter une demande d'ouverture
  validateOpeningTransfer: (id: string, data: { approved: boolean; reasonRejection?: string; billetage?: Record<string, number> }) =>
    request<{ success: boolean; session: any; transfert: any }>(`/coffre/transferts/${id}/validate-opening`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Incidents Caisse API
export const caisseIncidentApi = {
  getAll: () => request<any[]>('/caisse-incidents'),
  getBySession: (sessionId: string) => request<any[]>(`/sessions-caisse/${sessionId}/incidents`),
  create: (data: any) => request<any>('/caisse-incidents', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// System Settings API
export const systemSettingsApi = {
  get: () => request<any>('/system-settings'),
  update: (data: any) => request<any>('/system-settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
};

// Client Search API
export const clientSearchApi = {
  search: (query: string, params?: { page?: number; perPage?: number }) =>
    requestPaginated<any>('/clients/search', { q: query, ...params }),
  getLimits: (clientId: string) => request<any>(`/clients/${clientId}/limits`),
  getTontines: (clientId: string) => request<any[]>(`/clients/${clientId}/tontines`),
  getCredits: (clientId: string, params?: { statut?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.statut) queryParams.append('statut', params.statut);
    const query = queryParams.toString();
    return request<any[]>(`/clients/${clientId}/credits${query ? `?${query}` : ''}`);
  },
};

// Factures API
export const factureApi = {
  getAll: (params?: { type?: string; client_id?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.client_id) queryParams.append('client_id', params.client_id);
    const query = queryParams.toString();
    return request<any[]>(`/factures${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => request<any>(`/factures/${id}`),
  create: (data: any) => request<any>('/factures', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Validation OTP API
export const validationOtpApi = {
  create: (data: any) => request<any>('/validations-otp', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (operationId: string, data: any) => request<any>(`/validations-otp/${operationId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  verify: (operationId: string, code: string) => request<any>(`/validations-otp/${operationId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  }),
};

// Comptes Bloqués API
// Comptes Bloqués API
export const compteBloqueApi = {
  // Use specific endpoint for list (returns transformed data for UI)
  getAll: () => request<any[]>('/comptes-bloques'),
  // Use specific endpoint for detail (returns transformed data for UI)
  getById: (id: string) => request<any>(`/comptes-bloques/${id}`),
  // Use generic create endpoint (payload must include typeCompte: 'BLOCKED')
  create: (data: any) => request<any>('/comptes', {
    method: 'POST',
    body: JSON.stringify({ ...data, typeCompte: 'BLOCKED' }),
  }),
  update: (id: string, data: any) => request<any>(`/comptes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  // This specific endpoint needs to be implemented on server if missing
  // For now, redirecting to generic retrait but this might not handle penalty logic
  withdraw: (id: string, data: any) => request<any>(`/comptes-bloques/${id}/withdraw`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  // Use generic transactions endpoint (returns paginated envelope)
  getTransactions: (compteId: string) => request<PaginatedTransactions>(`/comptes/${compteId}/transactions`),
};

// HR Presence API
export const hrPresenceApi = {
  getToday: () => request<any>('/hr/presence/today'),
  getByStatus: (status: string) => request<any[]>(`/hr/presence/by-status/${status}`),
  checkIn: (gps?: { latitude?: number | null; longitude?: number | null; accuracy?: number | null; gpsSource?: string }) =>
    request<any>('/hr/presence/checkin', {
      method: 'POST',
      ...(gps ? { body: JSON.stringify(gps) } : {}),
    }),
  checkOut: () => request<any>('/hr/presence/checkout', { method: 'POST' }),
  startBreak: () => request<any>('/hr/presence/start-break', { method: 'POST' }),
  endBreak: () => request<any>('/hr/presence/end-break', { method: 'POST' }),
  manualEntry: (data: {
    employeId: string; date?: string;
    heureArrivee: string; heureDepart?: string;
    pauseDebut?: string; pauseFin?: string;
    commentaire?: string;
  }) => request<any>('/hr/presence/manual', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// HR Salary Advances API
export const hrAvancesApi = {
  getAll: (params?: { employeId?: string; statut?: string }) => {
    const qp = new URLSearchParams();
    if (params?.employeId) qp.append('employeId', params.employeId);
    if (params?.statut) qp.append('statut', params.statut);
    const q = qp.toString();
    return request<any[]>(`/hr/avances${q ? `?${q}` : ''}`);
  },
  create: (data: { employeId: string; montant: number; motif: string; dateRemboursement?: string }) =>
    request<any>('/hr/avances', { method: 'POST', body: JSON.stringify(data) }),
  approve: (id: string) =>
    request<any>(`/hr/avances/${id}/approve`, { method: 'PATCH' }),
  reject: (id: string, motif: string) =>
    request<any>(`/hr/avances/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ motif }) }),
  pay: (id: string) =>
    request<any>(`/hr/avances/${id}/pay`, { method: 'PATCH' }),
  deduct: (id: string, moisDeduction?: string) =>
    request<any>(`/hr/avances/${id}/deduct`, { method: 'PATCH', body: JSON.stringify({ moisDeduction }) }),
};

// Audit Logs API (Enhanced)
export const auditApi = {
  getAll: (params?: Record<string, string>) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
    }
    const query = queryParams.toString();
    return request<any>(`/audit/logs${query ? `?${query}` : ''}`);
  },
  getPaginated: (params?: { page?: number; limit?: number; search?: string; entity_type?: string; action?: string }) => {
    const apiParams = {
      ...params,
      perPage: params?.limit,
    };
    return requestPaginated<any>('/audit/logs', apiParams);
  },
  create: (data: any) => request<any>('/audit-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  rollback: (auditLogId: string) => request<{ success: boolean; error?: string }>(`/audit/${auditLogId}/rollback`, {
    method: 'POST',
  }),
  getSettingsHistory: (settingsType: string, limit?: number) => {
    const params = limit ? `?limit=${limit}` : '';
    return request<any[]>(`/settings/history/${settingsType}${params}`);
  },
  restoreSettingsVersion: (settingsType: string, version: number) =>
    request<{ success: boolean; snapshot?: Record<string, any>; error?: string }>(
      `/settings/history/${settingsType}/restore/${version}`,
      { method: 'POST' }
    ),
  getPermissionAuditHistory: (params?: { entityType?: string; entityId?: string; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.entityType) queryParams.append('entityType', params.entityType);
    if (params?.entityId) queryParams.append('entityId', params.entityId);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return request<any[]>(`/audit/permissions${query ? `?${query}` : ''}`);
  },
  getImportBatches: (params?: { importType?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.importType) queryParams.append('importType', params.importType);
    const query = queryParams.toString();
    return request<any[]>(`/import/batches${query ? `?${query}` : ''}`);
  },
  rollbackImportBatch: (batchId: string) =>
    request<{ success: boolean; deletedCount: number; error?: string }>(`/import/batches/${batchId}/rollback`, {
      method: 'POST',
    }),
};

// System Alerts API
export const alertsApi = {
  getAll: (unreadOnly?: boolean) => {
    const params = unreadOnly ? '?unreadOnly=true' : '';
    return request<any[]>(`/alerts${params}`);
  },
  create: (data: { type: string; title: string; message: string; targetAudience?: string; targetUserIds?: string[]; expiresAt?: string }) =>
    request<any>('/alerts', { method: 'POST', body: JSON.stringify(data) }),
  markAsRead: (id: string) => request<{ success: boolean }>(`/alerts/${id}/read`, { method: 'POST' }),
  delete: (id: string) => request<{ success: boolean }>(`/alerts/${id}`, { method: 'DELETE' }),
};

// Settings Extended API
export const settingsExtendedApi = {
  // Blocking Rules
  getBlockingRules: () => request<any[]>('/settings/blocking-rules'),
  createBlockingRule: (data: { ruleType: string; pattern: string; description?: string; reason?: string; expiresAt?: string | null }) =>
    request<any>('/settings/blocking-rules', { method: 'POST', body: JSON.stringify(data) }),
  updateBlockingRule: (id: string, data: Partial<{ ruleType: string; pattern: string; description: string; reason: string; expiresAt: string | null; isActive: boolean }>) =>
    request<any>(`/settings/blocking-rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBlockingRule: (id: string) => request<{ success: boolean }>(`/settings/blocking-rules/${id}`, { method: 'DELETE' }),

  // Maintenance Schedules
  getMaintenanceSchedules: () => request<any[]>('/settings/maintenance-schedules'),
  createMaintenanceSchedule: (data: {
    title: string;
    description?: string;
    scheduledStart: string;
    scheduledEnd: string;
    affectedModules?: string[];
    notifyAt?: string[];
  }) => request<any>('/settings/maintenance-schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateMaintenanceSchedule: (id: string, data: any) =>
    request<any>(`/settings/maintenance-schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Holiday Calendars (for tontine selectors)
  getHolidayCalendars: () => request<{ id: string; nom: string; description: string | null }[]>('/holiday-calendars'),

  // Holiday Exceptions
  getHolidays: (agenceId?: string) => {
    const params = agenceId ? `?agenceId=${agenceId}` : '';
    return request<any[]>(`/settings/holidays${params}`);
  },
  createHoliday: (data: {
    date: string;
    name: string;
    isRecurring?: boolean;
    agenceId?: string;
    affectsAllCaisses?: boolean;
    caisseIds?: string[];
  }) => request<any>('/settings/holidays', { method: 'POST', body: JSON.stringify(data) }),
  deleteHoliday: (id: string) => request<{ success: boolean }>(`/settings/holidays/${id}`, { method: 'DELETE' }),

  // Role Templates
  getRoleTemplates: () => request<any[]>('/settings/role-templates'),
  createRoleTemplate: (data: { code: string; name: string; description?: string; permissions: string[] }) =>
    request<any>('/settings/role-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateRoleTemplate: (id: string, data: any) =>
    request<any>(`/settings/role-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRoleTemplate: (id: string) => request<{ success: boolean }>(`/settings/role-templates/${id}`, { method: 'DELETE' }),

  // Regularization Rules
  getRegularizationRules: () => request<any[]>('/settings/regularization-rules'),
  createRegularizationRule: (data: {
    name: string;
    description?: string;
    triggerCondition: string;
    conditionValue?: Record<string, any>;
    action: string;
    actionConfig?: Record<string, any>;
    priority?: number;
  }) => request<any>('/settings/regularization-rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRegularizationRule: (id: string, data: any) =>
    request<any>(`/settings/regularization-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRegularizationRule: (id: string) =>
    request<{ success: boolean }>(`/settings/regularization-rules/${id}`, { method: 'DELETE' }),
};

// Comptabilité API
interface CompteResultatResponse {
  exercice: string;
  charges: Array<{ numeroCompte: string; intitule: string; montant: number }>;
  produits: Array<{ numeroCompte: string; intitule: string; montant: number }>;
  totalCharges: number;
  totalProduits: number;
  resultatNet: number;
  margeNette: number;
  type: 'benefice' | 'perte';
}

interface CompteOHADAApi {
  id: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: 'Actif' | 'Passif' | 'Charge' | 'Produit' | 'Capitaux';
  sensNormal: 'Débit' | 'Crédit';
  niveau: number;
  actif: boolean;
  description: string;
  soldeActuel: number;
}

interface JournalApi {
  id: string;
  code: string;
  intitule: string;
  typeJournal?: string;
  actif?: boolean;
}

interface EntryDetailsResponse {
  id: string;
  dateEcriture: string;
  numeroPiece: string;
  libelle: string;
  statut: string;
  journal: { id: string; code: string; intitule: string } | null;
  lignes: Array<{
    id: string;
    compteId: string;
    numeroCompte: string;
    compteIntitule: string;
    libelle: string;
    debit: string;
    credit: string;
    refExterne?: string;
  }>;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

interface GlPeriodApi {
  id: string;
  agenceId: string;
  year: number;
  month: number;
  status: string;
  closedAt?: string;
  closedBy?: string;
  notes?: string;
}

interface PostedEntryApi {
  id: string;
  dateEcriture: string;
  numeroPiece: string;
  libelle: string;
  statut: string;
  sourceType: string;
  sourceId: string;
  journalCode: string;
  journalIntitule: string;
}

export interface DeclarationTVAApi {
  id: string;
  mois: number;
  annee: number;
  tvaCollectee: number;
  tvaDeductible: number;
  tvaAPayer: number;
  creditTva: number;
  statut: "DRAFT" | "VALIDATED" | "PAID" | "LATE";
  numeroQuittance?: string;
  dateDepot?: string;
  createdBy?: string;
  createdAt?: string;
}

export const comptabiliteApi = {
  // Compte de Résultat
  getCompteResultat: (exercice: string) => request<CompteResultatResponse>(`/comptabilite/compte-resultat?exercice=${exercice}`),

  // Déclarations TVA
  getDeclarationsTVA: () => request<DeclarationTVAApi[]>('/comptabilite/declarations-tva'),
  createDeclarationTVA: (data: Record<string, unknown>) => request<DeclarationTVAApi>('/comptabilite/declarations-tva', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Plan OHADA (comptes)
  getPlanOhada: () => request<CompteOHADAApi[]>('/comptabilite/plan-ohada'),

  // Journaux
  getJournaux: () => request<JournalApi[]>('/comptabilite/journaux'),

  // Grand Livre (with running balance and pagination)
  getGrandLivre: (compteId: string, params: { dateDebut: string; dateFin: string; page?: number; pageSize?: number }) =>
    request<{
      compteId: string;
      numeroCompte: string;
      intitule: string;
      classe: number;
      typeCompte: string;
      sensNormal: string;
      soldeOuverture: number;
      totalDebits: number;
      totalCredits: number;
      soldeFinal: number;
      entries: Array<{
        id: string;
        dateEcriture: string;
        numeroPiece: string;
        journalCode: string;
        journalIntitule: string;
        ecritureLibelle: string;
        ligneLibelle: string;
        debit: number;
        credit: number;
        soldeProgressif: number;
        sourceType?: string;
        sourceId?: string;
        refExterne?: string;
      }>;
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/comptabilite/v2/grand-livre/${compteId}?dateDebut=${params.dateDebut}&dateFin=${params.dateFin}&page=${params.page || 1}&pageSize=${params.pageSize || 50}`),

  // Balance Générale (enhanced with totals)
  getBalance: (params: { dateDebut: string; dateFin: string; classe?: number }) =>
    request<{
      entries: Array<{
        compteId: string;
        numeroCompte: string;
        intitule: string;
        classe: number;
        typeCompte: string;
        sensNormal: string;
        totalDebit: number;
        totalCredit: number;
        soldeDebiteur: number;
        soldeCrediteur: number;
      }>;
      totals: {
        totalDebits: number;
        totalCredits: number;
        totalSoldeDebiteur: number;
        totalSoldeCrediteur: number;
        isBalanced: boolean;
      };
      dateDebut: string;
      dateFin: string;
    }>(`/comptabilite/v2/balance?dateDebut=${params.dateDebut}&dateFin=${params.dateFin}${params.classe ? `&classe=${params.classe}` : ''}`),

  // Périodes
  getPeriods: (year?: number) =>
    request<GlPeriodApi[]>(`/comptabilite/periods${year ? `?year=${year}` : ''}`),

  closePeriod: (data: { year: number; month: number; notes?: string }) =>
    request<{ success: boolean; message: string }>('/comptabilite/periods/close', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Extourne (reversal)
  reverseEntry: (ecritureId: string, reason: string) =>
    request<{ originalEcritureId: string; reversalEcritureId: string; numeroPiece: string }>(
      `/comptabilite/entries/${ecritureId}/reverse`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    ),

  // Entry details
  getEntryDetails: (ecritureId: string) =>
    request<EntryDetailsResponse>(`/comptabilite/entries/${ecritureId}`),

  // Check posting status
  getPostingStatus: (sourceType: string, sourceId: string) =>
    request<{ posted: boolean; ecritureId?: string; numeroPiece?: string; statut?: string; dateEcriture?: string }>(
      `/comptabilite/posting-status/${sourceType}/${sourceId}`
    ),

  // Get entries by source type
  getEntriesBySource: (sourceType: string, params?: { page?: number; pageSize?: number }) =>
    request<PostedEntryApi[]>(`/comptabilite/entries-by-source/${sourceType}?page=${params?.page || 1}&pageSize=${params?.pageSize || 50}`),

  // OHADA GL Reports
  getJournalCentralisateur: (params: { year: number; month: number }) =>
    request<any>(`/comptabilite/reports/journal-centralisateur?year=${params.year}&month=${params.month}`),

  getBilanOHADA: (dateArret: string) =>
    request<any>(`/comptabilite/reports/bilan?dateArret=${dateArret}`),

  getCompteResultatOHADA: (params: { dateDebut: string; dateFin: string }) =>
    request<any>(`/comptabilite/reports/compte-resultat?dateDebut=${params.dateDebut}&dateFin=${params.dateFin}`),

  getLivreInventaire: (dateInventaire: string) =>
    request<any>(`/comptabilite/reports/livre-inventaire?dateInventaire=${dateInventaire}`),

  // Create manual entry (v2)
  createEntry: (data: {
    journalCode: string;
    dateEcriture: string;
    libelle: string;
    lignes: Array<{
      numeroCompte?: string;
      compteId?: string;
      libelle?: string;
      debit?: number;
      credit?: number;
      refExterne?: string;
    }>;
  }) =>
    request<{ success: boolean; ecritureId: string; numeroPiece: string; totalDebit: number; totalCredit: number }>(
      '/comptabilite/v2/ecritures',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
};

// Users API
export const userApi = {
  getAll: () => request<any[]>('/users'),
  getById: (id: string) => request<any>(`/users/${id}`),
  create: (data: any) => request<any>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<any>(`/users/${id}`, { method: 'DELETE' }),
  getPermissions: (id: string) => request<any>(`/users/${id}/permissions`),
  updatePermissions: (id: string, data: any) => request<any>(`/users/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  setCaissePin: (userId: string, pin: string) => request<any>(`/users/${userId}/caisse-pin`, {
    method: 'PUT',
    body: JSON.stringify({ pin }),
  }),
};



// Sessions API
export const sessionApi = {
  getActive: () => request<any[]>('/sessions/active'),
  terminate: (userId: string) => request<any>(`/sessions/${userId}/terminate`, { method: 'POST' }),
};

// Roles API
export const roleApi = {
  getAll: () => request<any[]>('/roles'),
};

// System Health API
export const healthApi = {
  check: () => request<any>('/health'),
};

// Admin API
export const adminApi = {
  // P1.3: Consolidated dashboard stats endpoint (replaces 3 separate calls)
  getDashboardStats: () => request<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    todayLogins: number;
    todayOperations: number;
    activeRoles: Record<string, number>;
    recentActivity: Array<{
      id: string;
      userName: string;
      action: string;
      details: string;
      createdAt: string;
      ipAddress?: string;
    }>;
    systemHealth: {
      database: 'healthy' | 'warning' | 'error';
      security: 'secure' | 'warning' | 'critical';
      dbResponseTime: number;
      serverUptime: string;
      memoryPercent: number;
    };
  }>('/admin/dashboard-stats'),
  resetPlatform: (data: any) => request<any>('/admin/reset-platform', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  resetAgence: (agenceId: string, data: { confirmation: string; deleteEmployees?: boolean }) =>
    request<any>(`/admin/reset-agence/${agenceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  previewResetAgence: (agenceId: string) =>
    request<{
      agenceId: string;
      agenceName: string;
      agenceCode: string;
      categories: Array<{ label: string; icon: string; count: number }>;
      totalRows: number;
      clientsDeleted: number;
      employeesCount: number;
      configReseeded: string[];
    }>(`/admin/reset-agence/${agenceId}/preview`),
};

// Notifications API
export const notificationApi = {
  getAll: (params?: { type?: string; unread?: boolean; since?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.unread) queryParams.append('unread', 'true');
    if (params?.since) queryParams.append('since', params.since);
    const query = queryParams.toString();
    return request<any[]>(`/notifications${query ? `?${query}` : ''}`);
  },
  markAsRead: (id: string) => request<any>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllAsRead: () => request<any>('/notifications/read-all', { method: 'POST' }),
};

// Maintenance Mode API
export const maintenanceApi = {
  getStatus: () => request<any>('/maintenance-mode'),
  toggleModule: (moduleId: string, data: any) => request<any>(`/maintenance-mode/${moduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  togglePlatform: (moduleId: string, data: any) => request<any>(`/maintenance-mode/${moduleId}/platform`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// SMS API
export const smsApi = {
  getStatus: () => request<any>('/sms/status'),
  getLogs: (limit?: number) => request<any[]>(`/sms/logs${limit ? `?limit=${limit}` : ''}`),
  configureProvider: (data: any) => request<any>('/sms/configure-provider', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  testSend: (data: { provider: string; phoneNumber: string; message: string }) =>
    request<{ success: boolean; error?: string }>('/sms/test-send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Catalog API (sectors, professions, activity types)
export const catalogApi = {
  getOptions: (filters?: { professionId?: string; sectorId?: string; activityTypeId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.professionId) params.set('profession_id', filters.professionId);
    if (filters?.sectorId) params.set('sector_id', filters.sectorId);
    if (filters?.activityTypeId) params.set('activity_type_id', filters.activityTypeId);
    const qs = params.toString();
    return request<any>(`/catalog/options${qs ? `?${qs}` : ''}`);
  },
  search: (q: string, type: 'profession' | 'sector' = 'profession', limit = 20) =>
    request<any[]>(`/catalog/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`),
};



// Password Reset API
export const passwordResetApi = {
  resetPassword: (userId: string, data: any) => request<any>(`/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Caisse Access Codes API
export const caisseAccessCodeApi = {
  getAll: (agenceId?: string) => request<any[]>(`/caisse/access-codes${agenceId ? `?agenceId=${agenceId}` : ''}`),
  generate: (data: {
    agenceId?: string;
    caisseId?: string;
    codeType?: 'EMERGENCY' | 'DAILY' | 'PERMANENT';
    maxUsages?: number;
    authorizationDurationHours?: number;
    expiresInHours?: number;
    description?: string;
  }) => request<{ success: boolean; code: string; codeId: string; expiresAt: string }>('/caisse/access-codes/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deactivate: (codeId: string) => request<{ success: boolean }>(`/caisse/access-codes/${codeId}`, { method: 'DELETE' }),
};

// Caisse Access Control API (Operating Hours + Authorizations)
export const caisseAccessControlApi = {
  /**
   * Vérifie si la caisse est accessible selon les horaires d'ouverture
   */
  checkAccess: (caisseId?: string, agenceId?: string) => {
    const params = new URLSearchParams();
    if (caisseId) params.append('caisseId', caisseId);
    if (agenceId) params.append('agenceId', agenceId);
    const query = params.toString();
    return request<{
      accessible: boolean;
      reason: 'WITHIN_HOURS' | 'OUTSIDE_HOURS' | 'DISABLED' | 'AUTHORIZED';
      message: string;
      operatingHours?: { open: string; close: string };
      nextOpening?: { day: string; time: string };
      closingTime?: string;
    }>(`/access/status/caisse${query ? `?${query}` : ''}`);
  },
  /**
   * Vérifie si l'utilisateur a une autorisation valide
   */
  checkAuthorization: (caisseId?: string, agenceId?: string) => {
    const params = new URLSearchParams();
    if (caisseId) params.append('caisseId', caisseId);
    if (agenceId) params.append('agenceId', agenceId);
    const query = params.toString();
    return request<{
      authorized: boolean;
      reason: 'VALID_AUTHORIZATION' | 'NO_AUTHORIZATION' | 'EXPIRED' | 'REVOKED';
      expiresAt?: string;
      grantedAt?: string;
    }>(`/caisse/authorization-status${query ? `?${query}` : ''}`);
  },
  /**
   * Valide un code de sécurité et obtient une autorisation temporaire
   */
  validateCode: (code: string, caisseId?: string, agenceId?: string) =>
    request<{
      success: boolean;
      error?: string;
      authorization?: { id: string; expiresAt: string };
    }>('/caisse/access-codes/validate', {
      method: 'POST',
      body: JSON.stringify({ code, caisseId, agenceId }),
    }),
  /**
   * Liste les autorisations actives pour une agence
   */
  getAuthorizations: (agenceId?: string) =>
    request<any[]>(`/caisse/authorizations${agenceId ? `?agenceId=${agenceId}` : ''}`),
  /**
   * Révoque une autorisation active
   */
  revokeAuthorization: (authorizationId: string, reason?: string) =>
    request<{ success: boolean }>(`/caisse/authorizations/${authorizationId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

// Import Logs API
export const importLogApi = {
  create: (data: any) => request<any>('/admin-import-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// ============================================
// NOUVELLE ARCHITECTURE - EMPLOYES API
// ============================================

import type {
  EmployeWithUser,
  CreateEmployeWithUserData,
  UpdateEmployeWithUserData,
  ClientWithUser,
  CreateClientWithUserData,
} from '../types/entities';

/**
 * API pour la gestion des employés (nouvelle architecture users/employes)
 */
export const employeApi = {
  /**
   * Récupérer tous les employés avec leurs données utilisateur
   */
  getAll: (agenceId?: string) => {
    const params = agenceId ? `?agenceId=${agenceId}` : '';
    return request<EmployeWithUser[]>(`/employes${params}`);
  },

  /**
   * Récupérer un employé par son ID
   */
  getById: (id: string) => request<EmployeWithUser>(`/employes/${id}`),

  /**
   * Récupérer un employé par son userId
   */
  getByUserId: (userId: string) => request<EmployeWithUser>(`/employes/by-user/${userId}`),

  /**
   * Créer un nouvel employé (crée aussi le user associé)
   */
  create: (data: CreateEmployeWithUserData) => request<EmployeWithUser>('/employes', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * Créer un profil employé pour un utilisateur existant
   */
  createFromUser: (userId: string, data: Omit<CreateEmployeWithUserData, 'nom' | 'prenom' | 'email' | 'telephone' | 'sexe' | 'username' | 'password'>) =>
    request<EmployeWithUser>(`/employes/from-user/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Mettre à jour un employé (met à jour user et employe)
   */
  update: (id: string, data: UpdateEmployeWithUserData) => request<EmployeWithUser>(`/employes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  /**
   * Supprimer un employé (soft delete du user associé)
   */
  delete: (id: string) => request<{ message: string }>(`/employes/${id}`, {
    method: 'DELETE',
  }),
};

// ============================================
// NOUVELLES ROUTES CLIENTS (avec user)
// ============================================

/**
 * Extensions de l'API clients pour la nouvelle architecture
 */
export const clientExtApi = {
  /**
   * Récupérer un client par son userId
   */
  getByUserId: (userId: string) => request<any>(`/clients/by-user/${userId}`),

  /**
   * Récupérer un client avec ses données utilisateur
   */
  getWithUser: (id: string) => request<ClientWithUser>(`/clients/${id}/with-user`),

  /**
   * Créer un client avec un compte utilisateur (pour portail client)
   */
  createWithUser: (data: CreateClientWithUserData) => request<{ user: any; client: any }>('/clients/with-user', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  /**
   * Créer un profil client pour un utilisateur existant
   */
  createFromUser: (userId: string, data: any) =>
    request<any>(`/clients/from-user/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => request<any>('/dashboard/stats'),
  // Lightweight stats for slow connections (3G) - ~5KB vs ~50KB
  getStatsLight: () => request<any>('/dashboard/stats-light'),
  getBalanceHistory: (period: string = '30d') => request<any[]>(`/dashboard/balance-history?period=${period}`),
};

// Security Config API
export interface SecurityConfigResponse {
  otpEnabled: boolean;
  requireAccountHolderPresence: boolean;
  operationsRequiringPresence: string[];
  presenceVerificationThreshold: number;
}

export interface PresenceCheckResponse {
  presenceRequired: boolean;
  otpRequired: boolean;
  message: string;
}

export const securityConfigApi = {
  /**
   * Récupérer la configuration de sécurité actuelle
   */
  getConfig: () => request<SecurityConfigResponse>('/config/security'),

  /**
   * Vérifier si une opération nécessite la présence du titulaire ou un OTP
   */
  checkPresenceRequired: (data: { operationType: string; subType?: string; amount?: number }) =>
    request<PresenceCheckResponse>('/config/security/check-presence-required', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ============================================
// CAISSE AGENT API - Workflow d'approbation
// ============================================

import type {
  CaisseAgentSummary,
  OperationTerrainWithRelations,
  CreateCollectCashInput,
  CreateSettlementCashInput,
} from "@shared/schema";

/**
 * Types pour les réponses API caisse agent
 */
export interface OperationTerrainListResponse {
  operations: OperationTerrainWithRelations[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface OperationTerrainFilters {
  agentId?: string;
  clientId?: string;
  type?: 'COLLECT_CASH' | 'SETTLEMENT_CASH';
  statut?: 'SUBMITTED' | 'APPROVED' | 'PENDING_SETTLEMENT' | 'SETTLED' | 'REJECTED' | 'CANCELLED';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * API pour la gestion des caisses agent et workflow d'approbation
 */
export const caisseAgentApi = {
  // ============ Opérations Terrain ============

  /**
   * Créer une opération terrain (collecte ou remise)
   */
  createOperation: (data: CreateCollectCashInput | CreateSettlementCashInput & { type: 'COLLECT_CASH' | 'SETTLEMENT_CASH' }) =>
    request<OperationTerrainWithRelations>('/caisse-agent/operations-terrain', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Créer une collecte cash (agent collecte argent d'un client)
   */
  createCollectCash: (data: CreateCollectCashInput) =>
    request<OperationTerrainWithRelations>('/caisse-agent/operations-terrain', {
      method: 'POST',
      body: JSON.stringify({ ...data, type: 'COLLECT_CASH' }),
    }),

  /**
   * Créer une remise cash (agent remet argent à l'agence)
   */
  createSettlementCash: (data: CreateSettlementCashInput) =>
    request<OperationTerrainWithRelations>('/caisse-agent/operations-terrain', {
      method: 'POST',
      body: JSON.stringify({ ...data, type: 'SETTLEMENT_CASH' }),
    }),

  /**
   * Lister les opérations terrain avec filtres
   */
  listOperations: (filters?: OperationTerrainFilters) => {
    const queryParams = new URLSearchParams();
    if (filters?.agentId) queryParams.append('agentId', filters.agentId);
    if (filters?.clientId) queryParams.append('clientId', filters.clientId);
    if (filters?.type) queryParams.append('type', filters.type);
    if (filters?.statut) queryParams.append('statut', filters.statut);
    if (filters?.dateFrom) queryParams.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) queryParams.append('dateTo', filters.dateTo);
    if (filters?.limit) queryParams.append('limit', String(filters.limit));
    if (filters?.offset) queryParams.append('offset', String(filters.offset));
    const query = queryParams.toString();
    return request<OperationTerrainListResponse>(`/caisse-agent/operations-terrain${query ? `?${query}` : ''}`);
  },

  /**
   * Obtenir les détails d'une opération terrain
   */
  getOperation: (operationId: string) =>
    request<OperationTerrainWithRelations>(`/caisse-agent/operations-terrain/${operationId}`),

  /**
   * Approuver une opération terrain (superviseur/chef d'agence/admin)
   * Nécessite le mot de passe de l'utilisateur pour confirmation
   */
  approveOperation: (operationId: string, password: string) =>
    request<OperationTerrainWithRelations>(`/caisse-agent/operations-terrain/${operationId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  /**
   * Approuver plusieurs opérations terrain en une fois
   * Nécessite le mot de passe de l'utilisateur pour confirmation
   */
  bulkApproveOperations: (operationIds: string[], password: string) =>
    request<{ success: boolean; results: any[] }>('/caisse-agent/operations-terrain/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ operationIds, password }),
    }),

  /**
   * Rejeter une opération terrain
   */
  rejectOperation: (operationId: string, rejectionReason: string) =>
    request<OperationTerrainWithRelations>(`/caisse-agent/operations-terrain/${operationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason }),
    }),

  /**
   * Annuler une opération terrain (par l'agent ou admin)
   */
  cancelOperation: (operationId: string, cancellationReason: string) =>
    request<OperationTerrainWithRelations>(`/caisse-agent/operations-terrain/${operationId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason }),
    }),

  // ============ Gestion des Caisses Agent ============

  /**
   * Obtenir le résumé de la caisse d'un agent
   */
  getCaisseSummary: (agentId: string) =>
    request<CaisseAgentSummary>(`/caisse-agent/agents/${agentId}/caisse`),

  /**
   * Créer une caisse pour un agent (si elle n'existe pas)
   */
  createCaisse: (agentId: string) =>
    request<CaisseAgentSummary>(`/caisse-agent/agents/${agentId}/caisse`, {
      method: 'POST',
    }),

  /**
   * Suspendre la caisse d'un agent
   */
  suspendCaisse: (agentId: string, reason: string) =>
    request<{ message: string }>(`/caisse-agent/agents/${agentId}/caisse/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  /**
   * Réactiver la caisse d'un agent
   */
  reactivateCaisse: (agentId: string) =>
    request<{ message: string }>(`/caisse-agent/agents/${agentId}/caisse/reactivate`, {
      method: 'POST',
    }),

  // ============ Opérations en attente (pour superviseur) ============

  /**
   * Lister les opérations en attente d'approbation
   */
  getPendingOperations: (filters?: Omit<OperationTerrainFilters, 'statut'>) =>
    caisseAgentApi.listOperations({ ...filters, statut: 'SUBMITTED' }),

  /**
   * Compter les opérations en attente (pour badge notification)
   */
  countPendingOperations: () =>
    request<{ count: number }>('/caisse-agent/operations-terrain/pending/count'),

  // ============ Historique par agent ============

  /**
   * Lister les opérations d'un agent spécifique
   */
  getAgentOperations: (agentId: string, filters?: Omit<OperationTerrainFilters, 'agentId'>) =>
    caisseAgentApi.listOperations({ ...filters, agentId }),

  /**
   * Obtenir les statistiques d'un agent
   */
  getAgentStats: (agentId: string, periode?: { debut: string; fin: string }) => {
    const queryParams = new URLSearchParams();
    if (periode?.debut) queryParams.append('dateDebut', periode.debut);
    if (periode?.fin) queryParams.append('dateFin', periode.fin);
    const query = queryParams.toString();
    return request<{
      totalCollecte: string;
      totalRemise: string;
      nbOperations: number;
      nbApprouvees: number;
      nbRejetees: number;
      tauxApprobation: number;
    }>(`/caisse-agent/agents/${agentId}/stats${query ? `?${query}` : ''}`);
  },

  // ============ Sessions GL Agent ============

  getActiveSession: (agentId: string) =>
    request<{ session: any }>(`/caisse-agent/sessions/active?agentId=${agentId}`)
      .then(r => r?.session ?? null),

  getSessions: (filters?: { agentId?: string; statut?: string; agenceId?: string; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (filters?.agentId) queryParams.append('agentId', filters.agentId);
    if (filters?.statut) queryParams.append('statut', filters.statut);
    if (filters?.agenceId) queryParams.append('agenceId', filters.agenceId);
    if (filters?.limit) queryParams.append('limit', String(filters.limit));
    const query = queryParams.toString();
    return request<{ sessions: any[] }>(`/caisse-agent/sessions${query ? `?${query}` : ''}`);
  },

  getSessionDetail: (sessionId: string) =>
    request<any>(`/caisse-agent/sessions/${sessionId}`),

  getSessionAudit: (sessionId: string) =>
    request<any[]>(`/caisse-agent/sessions/${sessionId}/audit`),

  requestSession: (data: {
    agentId: string;
    agenceId: string;
    montantDemande: number;
    sourceCaisseId?: string;
    observations?: string;
  }) =>
    request<any>('/caisse-agent/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  dispatchFunds: (sessionId: string, data: {
    montantProvisionne: number;
    sourceCaisseId: string;
  }) =>
    request<any>(`/caisse-agent/sessions/${sessionId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  initiateClose: (sessionId: string, data: {
    montantPhysique: number;
    billetage?: Record<string, number>;
    destinationCaisseId: string;
  }) =>
    request<any>(`/caisse-agent/sessions/${sessionId}/initiate-close`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  finalizeClose: (sessionId: string, data: {
    montantRetourne: number;
    ecartJustification?: string;
  }) =>
    request<any>(`/caisse-agent/sessions/${sessionId}/finalize-close`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  closeWithRemise: (sessionId: string, data: {
    montantPhysique: number;
    billetage?: Record<string, number>;
    destinationCaisseId: string;
    observations?: string;
    ecartJustification?: string;
  }) =>
    request<any>(`/caisse-agent/sessions/${sessionId}/close-with-remise`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ============ Agent GL & Agence ============

  getAgentGlAccount: (agentId: string) =>
    request<{ glAccountId: string; glAccountNumber: string } | null>(`/caisse-agent/agents/${agentId}/gl-account`),

  getAgentAgencyHistory: (agentId: string) =>
    request<any[]>(`/caisse-agent/agents/${agentId}/agency-history`),

  transferAgency: (agentId: string, data: { newAgenceId: string; reason: string }) =>
    request<any>(`/caisse-agent/agents/${agentId}/transfer-agency`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

/**
 * Agence API
 */
export interface Agence {
  id: string;
  nom: string;
  code: string;
  ville: string;
  adresse?: string;
}

export const agencesApi = {
  getAgences: () => request<Agence[]>('/agences'),
};

/**
 * Credit Refunds API - Restitutions de frais
 */
export const creditRefundsApi = {
  /**
   * Compter les restitutions en attente (SUBMITTED + APPROVED)
   * Utilisé pour le badge de notification dans la sidebar
   */
  countPending: () =>
    request<{ count: number }>('/finance/credit-refunds/pending/count'),
};

// Global Transaction API
export const transactionApi = {
  process: (data: any) => request<any>('/transactions/process', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// HR API
export const hrApi = {
  // Hiring Approval Workflow
  getHiringApprovalConfig: (agenceId: string) =>
    request<any>(`/hr/hiring-approval/config?agenceId=${agenceId}`),

  setHiringApprovalConfig: (data: {
    agenceId: string;
    approvalLevels: Array<{ level: number; role: string; required: boolean }>;
    minSalaryThreshold?: number;
  }) =>
    request<any>('/hr/hiring-approval/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  initializeHiringApproval: (candidatureId: number, agenceId: string) =>
    request<any>(`/hr/hiring-approval/initialize/${candidatureId}`, {
      method: 'POST',
      body: JSON.stringify({ agenceId }),
    }),

  submitHiringApproval: (candidatureId: number, decision: 'APPROVED' | 'REJECTED', commentaire?: string) =>
    request<any>('/hr/hiring-approval/submit', {
      method: 'POST',
      body: JSON.stringify({ candidatureId, decision, commentaire }),
    }),

  getPendingHiringApprovals: (role: string, agenceId?: string) => {
    const params = new URLSearchParams({ role });
    if (agenceId) params.append('agenceId', agenceId);
    return request<any[]>(`/hr/hiring-approval/pending?${params.toString()}`);
  },

  getHiringApprovalStatus: (candidatureId: number) =>
    request<any>(`/hr/hiring-approval/status/${candidatureId}`),

  // Sanction Escalation Rules
  getEscalationRules: (agenceId?: string) => {
    const params = agenceId ? `?agenceId=${agenceId}` : '';
    return request<any[]>(`/hr/sanction-escalation-rules${params}`);
  },

  createEscalationRule: (data: {
    agenceId?: string;
    sanctionCountThreshold: number;
    periodMonths: number;
    sourceGravite: string;
    escalateToGravite: string;
    notificationRequired?: boolean;
    autoApply?: boolean;
  }) =>
    request<any>('/hr/sanction-escalation-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEscalationRule: (id: string, data: Partial<{
    sanctionCountThreshold: number;
    periodMonths: number;
    sourceGravite: string;
    escalateToGravite: string;
    notificationRequired: boolean;
    autoApply: boolean;
    actif: boolean;
  }>) =>
    request<any>(`/hr/sanction-escalation-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteEscalationRule: (id: string) =>
    request<any>(`/hr/sanction-escalation-rules/${id}`, { method: 'DELETE' }),

  // Onboarding
  getOnboardingChecklists: (agenceId?: string) => {
    const params = agenceId ? `?agenceId=${agenceId}` : '';
    return request<any[]>(`/hr/onboarding/checklists${params}`);
  },

  createOnboardingChecklist: (data: {
    agenceId?: string;
    nom: string;
    items: Array<{ name: string; required: boolean; category?: string }>;
  }) =>
    request<any>('/hr/onboarding/checklists', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getOnboardingInstances: (filters?: { candidatureId?: number; employeId?: string; statut?: string }) => {
    const params = new URLSearchParams();
    if (filters?.candidatureId) params.append('candidatureId', String(filters.candidatureId));
    if (filters?.employeId) params.append('employeId', filters.employeId);
    if (filters?.statut) params.append('statut', filters.statut);
    const q = params.toString();
    return request<any[]>(`/hr/onboarding/instances${q ? `?${q}` : ''}`);
  },

  getOnboardingInstance: (id: string) =>
    request<any>(`/hr/onboarding/instances/${id}`),

  startOnboarding: (candidatureId: number, checklistId?: string) =>
    request<any>('/hr/onboarding/start', {
      method: 'POST',
      body: JSON.stringify({ candidatureId, checklistId }),
    }),

  completeOnboardingItem: (instanceId: string, itemName: string, notes?: string) =>
    request<any>(`/hr/onboarding/instances/${instanceId}/complete-item`, {
      method: 'POST',
      body: JSON.stringify({ itemName, notes }),
    }),

  uncompleteOnboardingItem: (instanceId: string, itemName: string) =>
    request<any>(`/hr/onboarding/instances/${instanceId}/uncomplete-item`, {
      method: 'POST',
      body: JSON.stringify({ itemName }),
    }),

  convertToEmployee: (instanceId: string, employeeData: {
    poste: string;
    departementId?: string;
    salaireBase: number;
    dateEmbauche?: string;
  }) =>
    request<any>('/hr/onboarding/convert-to-employee', {
      method: 'POST',
      body: JSON.stringify({ instanceId, ...employeeData }),
    }),

  cancelOnboarding: (instanceId: string, reason?: string) =>
    request<any>(`/hr/onboarding/instances/${instanceId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Attendance Analytics
  getAttendanceAnalytics: (employeId: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    if (year) params.append('year', String(year));
    if (month) params.append('month', String(month));
    const q = params.toString();
    return request<any>(`/hr/attendance/analytics/${employeId}${q ? `?${q}` : ''}`);
  },

  exportAttendance: (employeId: string, params?: { year?: number; month?: number; format?: string }) => {
    const qp = new URLSearchParams();
    if (params?.year) qp.append('year', String(params.year));
    if (params?.month) qp.append('month', String(params.month));
    if (params?.format) qp.append('format', params.format);
    const q = qp.toString();
    return request<any>(`/hr/attendance/export/${employeId}${q ? `?${q}` : ''}`);
  },

  // Employee Documents
  getEmployeeDocuments: (employeId: string) =>
    request<EmployeeDocument[]>(`/hr/employees/${employeId}/documents`),

  uploadEmployeeDocument: async (employeId: string, file: File, metadata: {
    typeDocument: string;
    categorie?: string;
    nom: string;
    description?: string;
    dateEmission?: string;
    dateExpiration?: string;
  }) => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, value);
    });
    return request<EmployeeDocument>(`/hr/employees/${employeId}/documents`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  },

  verifyEmployeeDocument: (documentId: string, decision: 'VERIFIED' | 'REJECTED', motifRejet?: string) =>
    request<EmployeeDocument>(`/hr/documents/${documentId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, motifRejet }),
    }),

  deleteEmployeeDocument: (documentId: string) =>
    request<void>(`/hr/documents/${documentId}`, { method: 'DELETE' }),

  // Formation Certificates
  getFormationCertificates: (formationId: number) =>
    request<FormationCertificate[]>(`/hr/formations/${formationId}/certificates`),

  getEmployeeCertificates: (employeId: string) =>
    request<FormationCertificate[]>(`/hr/employees/${employeId}/certificates`),

  issueCertificate: (formationId: number, data: {
    employeId: string;
    employeNom: string;
    competences?: string;
    dateExpiration?: string;
  }) =>
    request<FormationCertificate>(`/hr/formations/${formationId}/certificates`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  issueBatchCertificates: (formationId: number, data?: {
    competences?: string;
    dateExpiration?: string;
  }) =>
    request<{ issued: number; certificates: FormationCertificate[] }>(`/hr/formations/${formationId}/certificates/batch`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  revokeCertificate: (certificateId: string, motifRevocation: string) =>
    request<FormationCertificate>(`/hr/certificates/${certificateId}/revoke`, {
      method: 'PATCH',
      body: JSON.stringify({ motifRevocation }),
    }),
};

// Types for Employee Documents
export interface EmployeeDocument {
  id: string;
  employeId: string;
  nom: string;
  typeDocument: string;
  categorie: string;
  description?: string;
  storageKey: string;
  bucket: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  dateEmission?: string;
  dateExpiration?: string;
  statut: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  verifiePar?: string;
  verifieAt?: string;
  motifRejet?: string;
  ajoutePar?: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

// Types for Formation Certificates
export interface FormationCertificate {
  id: string;
  formationId: number;
  employeId: string;
  employeNom: string;
  numeroCertificat: string;
  titre: string;
  dateEmission: string;
  dateExpiration?: string;
  competences?: string;
  statut: 'ISSUED' | 'REVOKED' | 'EXPIRED';
  revoquePar?: string;
  revoqueAt?: string;
  motifRevocation?: string;
  fichierUrl?: string;
  emisPar?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// NOTIFICATION TEMPLATES API
// ============================================

export interface SmsTemplate {
  id: string;
  code: string;
  nom: string;
  contenu: string;
  placeholders: string;
  description?: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplate {
  id: string;
  code: string;
  nom: string;
  subject: string;
  contenuHtml: string;
  contenuText: string;
  placeholders: string;
  description?: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export const notificationTemplatesApi = {
  // SMS Templates
  getSmsTemplates: () => request<SmsTemplate[]>('/settings/sms-templates'),

  getSmsTemplate: (id: string) => request<SmsTemplate>(`/settings/sms-templates/${id}`),

  updateSmsTemplate: (id: string, data: Partial<Pick<SmsTemplate, 'nom' | 'contenu' | 'placeholders' | 'description' | 'actif'>>) =>
    request<SmsTemplate>(`/settings/sms-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Email Templates
  getEmailTemplates: () => request<EmailTemplate[]>('/settings/email-templates'),

  getEmailTemplate: (id: string) => request<EmailTemplate>(`/settings/email-templates/${id}`),

  updateEmailTemplate: (id: string, data: Partial<Pick<EmailTemplate, 'nom' | 'subject' | 'contenuHtml' | 'contenuText' | 'placeholders' | 'description' | 'actif'>>) =>
    request<EmailTemplate>(`/settings/email-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Preview
  previewTemplate: (channel: 'SMS' | 'EMAIL', code: string, sampleData: Record<string, string>) =>
    request<{ rendered: string; subject?: string }>('/settings/templates/preview', {
      method: 'POST',
      body: JSON.stringify({ channel, code, sampleData }),
    }),
};

// ============================================
// PERMISSION ANALYTICS API
// ============================================

export interface PermissionAnalyticsConfig {
  enabled: boolean;
  samplingRateAllowed: number;
  samplingRateDenied: number;
  batchSize: number;
  flushIntervalMs: number;
  retentionDays: number;
}

export interface PermissionStats {
  permissionCode: string;
  action: string;
  subject: string;
  totalChecks: number;
  allowedCount: number;
  deniedCount: number;
  uniqueUsers: number;
  allowRate: number;
  firstCheck: string;
  lastCheck: string;
}

export interface PermissionDenial {
  permissionCode: string;
  deniedCount: number;
  uniqueUsers: number;
  lastDenied: string;
}

export interface UnusedPermission {
  id: string;
  code: string;
  name: string;
  moduleName: string;
  createdAt: string;
}

export const permissionAnalyticsApi = {
  getConfig: () => request<PermissionAnalyticsConfig>('/admin/permission-analytics/config'),

  updateConfig: (updates: Partial<PermissionAnalyticsConfig>) =>
    request<PermissionAnalyticsConfig>('/admin/permission-analytics/config', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  getStats: () => request<PermissionStats[]>('/admin/permission-analytics/stats'),

  getDenials: (limit = 10) =>
    request<PermissionDenial[]>(`/admin/permission-analytics/denials?limit=${limit}`),

  getUnused: () => request<UnusedPermission[]>('/admin/permission-analytics/unused'),

  refreshStats: () =>
    request<{ success: boolean; message: string }>('/admin/permission-analytics/refresh', {
      method: 'POST',
    }),

  purgeLogs: (daysToKeep?: number) =>
    request<{ success: boolean; deleted: number }>('/admin/permission-analytics/purge', {
      method: 'POST',
      body: JSON.stringify({ daysToKeep }),
    }),

  flushBuffer: () =>
    request<{ success: boolean; message: string }>('/admin/permission-analytics/flush', {
      method: 'POST',
    }),
};

