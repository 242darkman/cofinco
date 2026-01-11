// API Client for COFIN&CO-M Backend
// Security-enhanced with automatic 401 detection and session invalidation
// Multi-agency support with automatic X-Agence-Id header injection

const API_BASE = '/api';

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

/**
 * Gestion centralisée des réponses HTTP
 * Détecte les 401 et déclenche la déconnexion automatique
 */
async function handleResponse<T>(response: Response, endpoint: string): Promise<T> {
  // Détection session expirée (401 Unauthorized)
  if (response.status === 401) {
    // Ne pas déclencher pour les endpoints d'auth (évite boucle infinie)
    if (!endpoint.includes('/auth/login') && !endpoint.includes('/auth/me')) {
      console.warn('[API] Session expirée - déconnexion automatique');
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    throw new Error('Session expirée - veuillez vous reconnecter');
  }

  // Détection compte bloqué/désactivé (403 Forbidden)
  if (response.status === 403) {
    const error = await response.json().catch(() => ({ message: 'Accès refusé' }));
    throw new Error(error.message || 'Accès refusé');
  }

  // Autres erreurs
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `HTTP ${response.status}: ${response.statusText}`);
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

// Login response wrapper type
interface LoginResponse {
  user: AuthUser;
  message: string;
  mustChangePassword: boolean;
}

// Auth API
export const authApi = {
  login: async (username: string, password: string): Promise<AuthUser> => {
    const response = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return response.user;
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

// Client API
export const clientApi = {
  getAll: () => request<any[]>('/clients'),
  getById: (id: string) => request<any>(`/clients/${id}`),
  // Clients éligibles au crédit (avec compte courant actif dans l'agence)
  getEligibleForCredit: () => request<any[]>('/clients/eligible-credit'),
  create: (data: any) => request<any>('/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<void>(`/clients/${id}`, {
    method: 'DELETE',
  }),
};

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

// Compte Epargne API
export const compteEpargneApi = {
  getAll: () => request<any[]>('/comptes-epargne'),
  getByClient: (clientId: string) => request<any[]>(`/clients/${clientId}/comptes-epargne`),
  create: (data: any) => request<any>('/comptes-epargne', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/comptes-epargne/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
};

// Transaction Epargne API
export const transactionEpargneApi = {
  getByCompte: (compteId: string) => request<any[]>(`/comptes-epargne/${compteId}/transactions`),
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
  getAll: () => request<any[]>('/sessions-caisse'),
  get: (id: string) => request<any>(`/sessions-caisse/${id}`),
  getByCaissier: (caissierId: string) => request<any[]>(`/sessions-caisse/caissier/${caissierId}`),
  getActive: () => request<any>('/sessions-caisse/active'),
  create: (data: any) => request<any>('/sessions-caisse', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/sessions-caisse/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  getOperations: (sessionId: string) => request<any[]>(`/sessions-caisse/${sessionId}/operations`),
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
};

// Operations Caisse API
export const caisseOperationApi = {
  getAll: () => request<any[]>('/operations-caisse'),
  getToday: () => request<any[]>('/operations-caisse/today'),
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
  getAll: () => request<any[]>('/agents-terrain'),
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
  getAll: () => request<any[]>('/prospections'),
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
  getAll: () => request<any[]>('/visites-terrain'),
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
  getAll: () => request<any[]>('/paiements-terrain'),
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
  create: (data: any) => request<any>('/distributions-tontine', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};

// Alertes Tontine API
export const alerteTontineApi = {
  getByTontine: (tontineId: string) => request<any[]>(`/tontines/${tontineId}/alertes`),
  markAsRead: (id: string) => request<any>(`/alertes-tontine/${id}/read`, {
    method: 'PATCH',
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
  create: (data: any) => request<any>('/tontine-distributions', {
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
  getAll: () => request<any[]>('/agences'),
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
  search: (query: string) => request<any[]>(`/clients/search?q=${encodeURIComponent(query)}`),
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
export const compteBloqueApi = {
  getAll: () => request<any[]>('/comptes-bloques'),
  getById: (id: string) => request<any>(`/comptes-bloques/${id}`),
  create: (data: any) => request<any>('/comptes-bloques', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => request<any>(`/comptes-bloques/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  withdraw: (id: string, data: any) => request<any>(`/comptes-bloques/${id}/withdraw`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getTransactions: (compteId: string) => request<any[]>(`/transactions-comptes-bloques?compte_bloque_id=${compteId}`),
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
