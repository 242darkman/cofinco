// API Client for COFIN&CO-M Backend
// Security-enhanced with automatic 401 detection and session invalidation
// Multi-agency support with automatic X-Agence-Id header injection

const API_BASE = '/api';

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface PaginationMeta {
  pagination: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
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

// ID de l'agence actuellement sélectionnée (injecté depuis AgenceContext)
let currentAgenceId: string | null = null;

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

    // Pour les autres routes, c'est une expiration de session
    if (!endpoint.includes('/auth/me')) {
      console.warn('[API] Session expirée - déconnexion automatique');
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    throw new ApiError('Session expirée - veuillez vous reconnecter', 401);
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

/**
 * Requête HTTP sécurisée avec credentials et gestion d'erreur centralisée
 * Injecte automatiquement le header X-Agence-Id si une agence est sélectionnée
 */
async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  // Construire les headers avec X-Agence-Id si disponible
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  // Injecter X-Agence-Id automatiquement (sauf pour certains endpoints)
  if (currentAgenceId && !endpoint.startsWith('/auth/') && !endpoint.startsWith('/me/agences')) {
    headers['X-Agence-Id'] = currentAgenceId;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Toujours envoyer les cookies de session
  });

  return handleResponse<T>(response, endpoint);
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
    totalPages = response.meta?.pagination?.total_pages ?? 1;
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
    const totalPages = Number(payload.meta?.pagination?.total_pages ?? 1);
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

// Auth API
export const authApi = {
  login: async (username: string, password: string): Promise<LoginResult> => {
    const response = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return {
      user: response.user,
      permissions: response.permissions
    };
  },
  logout: () => request<{ message: string }>('/auth/logout', {
    method: 'POST',
  }),
  getMe: () => request<AuthUser>('/auth/me'),
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
  createdAt: string;
  clientNom: string | null;
  clientPrenom: string | null;
  clientTelephone: string | null;
  sessionId: string;
  caissierNom: string | null;
}

export interface CaisseHistoriqueSummary {
  totalOperations: number;
  totalEntrees: string;
  totalSorties: string;
  soldeNet: string;
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
};

// ============================================================================
// TYPES D'ERREURS STRUCTURÉES
// ============================================================================

/**
 * Erreur de solde insuffisant pour décaissement crédit
 * Utilisé pour le workflow de réapprovisionnement intelligent
 */
export interface InsufficientFundsErrorData {
  code: "INSUFFICIENT_FUNDS";
  message: string;
  required: number;
  current: number;
  deficit: number;
  coffreId: string;
  coffreCode: string;
  coffreName?: string;
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

/**
 * Type guard pour vérifier si une erreur est une ApiError avec données de solde insuffisant
 */
export function isInsufficientFundsError(error: unknown): error is ApiError & { data: { error: InsufficientFundsErrorData } } {
  if (error instanceof ApiError && error.data?.error?.code === "INSUFFICIENT_FUNDS") {
    return true;
  }
  // Fallback pour les objets simples
  if (typeof error === "object" && error !== null) {
    const e = error as any;
    return e?.error?.code === "INSUFFICIENT_FUNDS" || e?.data?.error?.code === "INSUFFICIENT_FUNDS";
  }
  return false;
}

/**
 * Extraire les données d'erreur de solde insuffisant d'une erreur
 */
export function extractInsufficientFundsData(error: unknown): InsufficientFundsErrorData | null {
  if (error instanceof ApiError && error.data?.error?.code === "INSUFFICIENT_FUNDS") {
    return error.data.error;
  }
  if (typeof error === "object" && error !== null) {
    const e = error as any;
    if (e?.error?.code === "INSUFFICIENT_FUNDS") return e.error;
    if (e?.data?.error?.code === "INSUFFICIENT_FUNDS") return e.data.error;
  }
  return null;
}

// Credit API
export const creditApi = {
  getAll: (params?: { clientId?: string; statut?: string; includeEcheances?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.clientId) queryParams.append('client_id', params.clientId);
    if (params?.statut) queryParams.append('statut', params.statut);
    if (params?.includeEcheances) queryParams.append('include_echeances', 'true');
    const query = queryParams.toString();
    return request<any[]>(`/credits${query ? `?${query}` : ''}`);
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
  getAll: (params?: { actif?: boolean, agenceId?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.actif !== undefined) queryParams.append('actif', String(params.actif));
    // agenceId might be used for filtering admin view
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
  }) =>
    request<any>('/comptes/transferts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getScheduledTransfers: (params?: { search?: string; page?: number; limit?: number; actif?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.actif !== undefined) queryParams.append('actif', String(params.actif));
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
};

// Transaction Epargne API
export const transactionEpargneApi = {
  getByCompte: (compteId: string) => request<any[]>(`/comptes/${compteId}/transactions`),
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
  // Gestion des bénéficiaires
  getProchainBeneficiaire: (tontineId: string) => request<any>(`/tontines/${tontineId}/prochain-beneficiaire`),
  getEligiblesBenefice: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/eligibles-benefice`),
  tirageBeneficiaire: (tontineId: string) => request<any>(`/tontines/${tontineId}/tirage-beneficiaire`, {
    method: 'POST',
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
  create: (data: any) => request<any>('/sessions-caisse', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
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
};

// Alias for backward compatibility
export const operationCaisseApi = caisseOperationApi;

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
  getAll: (params?: { page?: number; perPage?: number }) =>
    requestPaginated<any>('/prospections', params),
  create: (data: any) => request<any>('/prospections', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/prospections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
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

// Distributions Tontine API
export const distributionTontineApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/distributions`),
  getStats: (tontineId: string) => request<any>(`/tontines/${tontineId}/distributions/stats`),
  getById: (id: string) => request<any>(`/tontine-distributions/${id}`),
  create: (data: any) => request<any>('/tontine-distributions', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  cancel: (id: string) => request<any>(`/tontine-distributions/${id}`, {
    method: 'DELETE',
  }),
};

// Alertes Tontine API
export const alerteTontineApi = {
  getByTontine: (tontineId: string, params?: { statut?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.statut && params.statut !== 'all') queryParams.append('status', params.statut);
    const query = queryParams.toString();
    return request<any[]>(`/tontines/${tontineId}/alertes${query ? `?${query}` : ''}`);
  },
  markAsRead: (id: string) => request<any>(`/alertes-tontine/${id}/read`, {
    method: 'PATCH',
  }),
  update: (id: string, data: { statut?: string }) => request<any>(`/tontine-alertes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  resolve: (id: string) => request<any>(`/tontine-alertes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ statut: 'RESOLVED' }),
  }),
  ignore: (id: string) => request<any>(`/tontine-alertes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ statut: 'IGNORED' }),
  }),
};

// Règles Tontine API
export const regleTontineApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/regles`),
  create: (tontineId: string, data: any) => request<any>(`/tontines/${tontineId}/regles`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/regles-tontine/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/regles-tontine/${id}`, {
    method: 'DELETE',
  }),
};

// Pénalités Tontine API
export const penaliteTontineApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/penalites`),
  create: (data: any) => request<any>('/penalites-tontine', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/tontine-penalites/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Aliases for backward compatibility
export const tontineRegleApi = {
  getByTontine: (tontineId: string) => regleTontineApi.getByTontine(tontineId),
  create: (data: any) => request<any>('/tontine-regles', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/tontine-regles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/tontine-regles/${id}`, {
    method: 'DELETE',
  }),
};

export const tontinePenaliteApi = {
  getByTontine: (tontineId: string) => penaliteTontineApi.getByTontine(tontineId),
  create: (data: any) => penaliteTontineApi.create(data),
  update: (id: string, data: any) => penaliteTontineApi.update(id, data),
};

export const tontineDistributionApi = {
  getByTontine: (tontineId: string) => distributionTontineApi.getByTontine(tontineId),
  getStats: (tontineId: string) => distributionTontineApi.getStats(tontineId),
  getById: (id: string) => distributionTontineApi.getById(id),
  create: (data: any) => distributionTontineApi.create(data),
  cancel: (id: string) => distributionTontineApi.cancel(id),
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
  getAll: (params?: { statut?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.statut) queryParams.append('statut', params.statut);
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
  getMouvements: (params: { agenceId: string; page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('agenceId', params.agenceId);
    if (params.page) queryParams.append('page', String(params.page));
    if (params.limit) queryParams.append('limit', String(params.limit));
    return request<any>(`/coffre/mouvements?${queryParams.toString()}`);
  },
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
  // Use generic transactions endpoint
  getTransactions: (compteId: string) => request<any[]>(`/comptes/${compteId}/transactions`),
};

// HR Presence API
export const hrPresenceApi = {
  getToday: () => request<any>('/hr/presence/today'),
  getByStatus: (status: string) => request<any[]>(`/hr/presence/by-status/${status}`),
  checkIn: () => request<any>('/hr/presence/checkin', { method: 'POST' }),
  checkOut: () => request<any>('/hr/presence/checkout', { method: 'POST' }),
  startBreak: () => request<any>('/hr/presence/start-break', { method: 'POST' }),
  endBreak: () => request<any>('/hr/presence/end-break', { method: 'POST' }),
};

// Audit Logs API
export const auditApi = {
  getAll: (params?: { entity_type?: string; action?: string; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.entity_type) queryParams.append('entity_type', params.entity_type);
    if (params?.action) queryParams.append('action', params.action);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return request<any[]>(`/audit-logs${query ? `?${query}` : ''}`);
  },
  create: (data: any) => request<any>('/audit-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Comptabilité API
export const comptabiliteApi = {
  // Compte de Résultat
  getCompteResultat: (exercice: string) => request<any>(`/comptabilite/compte-resultat?exercice=${exercice}`),

  // Déclarations TVA
  getDeclarationsTVA: () => request<any[]>('/comptabilite/declarations-tva'),
  createDeclarationTVA: (data: any) => request<any>('/comptabilite/declarations-tva', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Plan OHADA (comptes)
  getPlanOhada: () => request<any[]>('/comptabilite/plan-ohada'),

  // Journaux
  getJournaux: () => request<any[]>('/comptabilite/journaux'),

  // Écritures
  createEcriture: (data: any) => request<any>('/comptabilite/ecritures', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Grand Livre
  getGrandLivre: (compteId: string, params: { dateDebut: string; dateFin: string }) =>
    request<any[]>(`/comptabilite/grand-livre/${compteId}?dateDebut=${params.dateDebut}&dateFin=${params.dateFin}`),

  // Balance Générale
  getBalance: (params: { dateDebut: string; dateFin: string }) =>
    request<any[]>(`/comptabilite/balance?dateDebut=${params.dateDebut}&dateFin=${params.dateFin}`),
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
  resetPlatform: (data: any) => request<any>('/admin/reset-platform', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  resetAgence: (agenceId: string, data: { confirmation: string }) => 
    request<any>(`/admin/reset-agence/${agenceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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
};

// Types Marchés API
export const typeMarcheApi = {
  getAll: () => request<any[]>('/types-marches'),
  create: (data: any) => request<any>('/types-marches', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/types-marches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<any>(`/types-marches/${id}`, { method: 'DELETE' }),
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
  getAll: () => request<any[]>('/caisse/access-codes'),
  create: (data: any) => request<any>('/caisse/access-codes', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  revoke: (codeId: string) => request<any>(`/caisse/access-codes/${codeId}/revoke`, { method: 'POST' }),
  getPermissions: () => request<any[]>('/caisse/code-permissions'),
  createPermission: (data: any) => request<any>('/caisse/code-permissions', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  revokePermission: (permId: string) => request<any>(`/caisse/code-permissions/${permId}/revoke`, { method: 'POST' }),
};

// Import Logs API
export const importLogApi = {
  create: (data: any) => request<any>('/admin-import-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Membres Tontine API (admin)
export const membreTontineApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontine-membres?tontine_id=${tontineId}`),
  create: (data: any) => request<any>('/tontine-membres', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<any>(`/tontine-membres/${id}`, { method: 'DELETE' }),
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
  data: OperationTerrainWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export interface OperationTerrainFilters {
  agentId?: string;
  clientId?: string;
  type?: 'COLLECT_CASH' | 'SETTLEMENT_CASH';
  statut?: 'SUBMITTED' | 'APPROVED' | 'SETTLED' | 'REJECTED' | 'CANCELLED';
  dateDebut?: string;
  dateFin?: string;
  limit?: number;
  page?: number;
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
    if (filters?.dateDebut) queryParams.append('dateDebut', filters.dateDebut);
    if (filters?.dateFin) queryParams.append('dateFin', filters.dateFin);
    if (filters?.limit) queryParams.append('limit', String(filters.limit));
    if (filters?.page) queryParams.append('page', String(filters.page));
    const query = queryParams.toString();
    return request<OperationTerrainListResponse>(`/caisse-agent/operations-terrain${query ? `?${query}` : ''}`);
  },

  /**
   * Obtenir les détails d'une opération terrain
   */
  getOperation: (operationId: string) =>
    request<OperationTerrainWithRelations>(`/caisse-agent/operations-terrain/${operationId}`),

  /**
   * Approuver une opération terrain (superviseur/chef d'agence)
   */
  approveOperation: (operationId: string) =>
    request<OperationTerrainWithRelations>(`/caisse-agent/operations-terrain/${operationId}/approve`, {
      method: 'POST',
    }),

  /**
   * Approuver plusieurs opérations terrain en une fois
   */
  bulkApproveOperations: (operationIds: string[]) =>
    request<{ success: boolean; results: any[] }>('/caisse-agent/operations-terrain/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ operationIds }),
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
