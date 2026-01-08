const API_BASE = '/api';

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { data: null, error: null };
      }
      const errorText = await response.text();
      if (!errorText) {
        return { data: null, error: 'Erreur serveur' };
      }
      try {
        const errorData = JSON.parse(errorText);
        return { data: null, error: errorData.error || 'Erreur serveur' };
      } catch {
        return { data: null, error: errorText };
      }
    }

    if (response.status === 204) {
      return { data: null, error: null };
    }

    const text = await response.text();
    if (!text) {
      return { data: null, error: null };
    }

    const data = JSON.parse(text) as T;
    return { data, error: null };
  } catch (error: any) {
    console.error('API Error:', error);
    return { data: null, error: error.message || 'Erreur de connexion' };
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  
  post: <T>(endpoint: string, body: any) =>
    request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  
  patch: <T>(endpoint: string, body: any) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  
  put: <T>(endpoint: string, body: any) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};

export const clientsApi = {
  getAll: () => api.get<any[]>('/clients'),
  getById: (id: string | number) => api.get<any>(`/clients/${id}`),
  create: (data: any) => api.post<any>('/clients', data),
  update: (id: string | number, data: any) => api.patch<any>(`/clients/${id}`, data),
  delete: (id: string | number) => api.delete<any>(`/clients/${id}`),
};

export const creditsApi = {
  getAll: () => api.get<any[]>('/credits'),
  getByClient: (clientId: string | number) => api.get<any[]>(`/clients/${clientId}/credits`),
  create: (data: any) => api.post<any>('/credits', data),
  update: (id: string | number, data: any) => api.patch<any>(`/credits/${id}`, data),
};

// Legacy API - use comptesApi instead
export const epargnesApi = {
  getAll: () => api.get<any[]>('/comptes-epargne'),
  getByClient: (clientId: string | number) => api.get<any[]>(`/clients/${clientId}/comptes-epargne`),
  create: (data: any) => api.post<any>('/comptes-epargne', data),
};

// ============================================================================
// Comptes Microfinance API (New unified accounts API)
// ============================================================================

export interface Compte {
  id: string;
  clientId: string;
  agenceId: string;
  typeCompte: 'Épargne' | 'Courant' | 'Bloqué';
  numeroCompte: string;
  soldeCourant: string;
  tauxInteret?: number;
  statut: 'Actif' | 'Suspendu' | 'Clôturé';
  blocageActif?: boolean;
  blocageMotif?: string;
  blocageReference?: string;
  blocageFin?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCompteData {
  clientId: string;
  agenceId: string;
  typeCompte: 'Épargne' | 'Courant' | 'Bloqué';
  soldeInitial?: number;
  tauxInteret?: number;
  blocageActif?: boolean;
  blocageMotif?: string;
  blocageReference?: string;
}

export interface DepotRetraitData {
  montant: number;
  methodePaiement?: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}

export interface BlocageData {
  motif: 'Garantie crédit' | 'Garantie tontine' | 'Épargne forcée' | 'Décision interne' | 'Litige' | 'Autre';
  reference?: string;
  dateFin?: string;
}

export interface TransfertAgenceData {
  nouvelleAgenceId: string;
  motif?: string;
}

export const comptesApi = {
  /** Get all comptes (filtered by user's agency) */
  getAll: () => api.get<Compte[]>('/comptes'),

  /** Get a specific compte by ID */
  getById: (id: string) => api.get<Compte>(`/comptes/${id}`),

  /** Create a new compte */
  create: (data: CreateCompteData) => api.post<Compte>('/comptes', data),

  /** Deposit money into a compte */
  depot: (compteId: string, data: DepotRetraitData) =>
    api.post<any>(`/comptes/${compteId}/depot`, data),

  /** Withdraw money from a compte */
  retrait: (compteId: string, data: DepotRetraitData) =>
    api.post<any>(`/comptes/${compteId}/retrait`, data),

  /** Block a compte */
  bloquer: (compteId: string, data: BlocageData) =>
    api.post<Compte>(`/comptes/${compteId}/bloquer`, data),

  /** Unblock a compte */
  debloquer: (compteId: string, motif?: string) =>
    api.post<Compte>(`/comptes/${compteId}/debloquer`, { motif }),

  /** Transfer compte to another agency */
  transfertAgence: (compteId: string, data: TransfertAgenceData) =>
    api.post<Compte>(`/comptes/${compteId}/transfert-agence`, data),

  /** Get agency transfer history for a compte */
  getHistoriqueAgences: (compteId: string) =>
    api.get<any[]>(`/comptes/${compteId}/historique-agences`),

  /** Get transactions for a compte */
  getTransactions: (compteId: string, limit?: number) =>
    api.get<any[]>(`/comptes/${compteId}/transactions${limit ? `?limit=${limit}` : ''}`),

  /** Check if client can create a compte of specific type */
  canCreateCompte: (clientId: string, typeCompte: string) =>
    api.get<{ allowed: boolean; reason: string | null }>(`/clients/${clientId}/can-create-compte/${typeCompte}`),
};

export const tontinesApi = {
  getAll: () => api.get<any[]>('/tontines'),
  getById: (id: string | number) => api.get<any>(`/tontines/${id}`),
  create: (data: any) => api.post<any>('/tontines', data),
  update: (id: string | number, data: any) => api.patch<any>(`/tontines/${id}`, data),
};

export const usersApi = {
  getAll: () => api.get<any[]>('/users'),
  getById: (id: string | number) => api.get<any>(`/users/${id}`),
  create: (data: any) => api.post<any>('/users', data),
  update: (id: string | number, data: any) => api.patch<any>(`/users/${id}`, data),
};

export const dashboardApi = {
  getStats: () => api.get<any>('/dashboard/stats'),
};

export const notificationsApi = {
  getUnread: () => api.get<{ count: number }>('/notifications/unread'),
};

// ============================================================================
// Unified Financial Ledger APIs
// ============================================================================

export interface MouvementFinancier {
  id: string;
  reference: string;
  sourceModule: string;
  sens: 'Débit' | 'Crédit';
  montant: string;
  dateOperation: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  tontineId?: string;
  sessionCaisseId?: string;
  agentId?: string;
  typePaiement?: string;
  methodePaiement?: string;
  createdAt: string;
}

export interface MouvementsFilter {
  sourceModule?: string;
  clientId?: string;
  compteId?: string;
  creditId?: string;
  sessionCaisseId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export const mouvementsApi = {
  /** Get global ledger feed with filters */
  getAll: (filter?: MouvementsFilter) => {
    const params = new URLSearchParams();
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) params.append(key, String(value));
      });
    }
    const queryString = params.toString();
    return api.get<MouvementFinancier[]>(`/mouvements${queryString ? `?${queryString}` : ''}`);
  },
  
  /** Get movements for a specific savings account */
  getByCompte: (compteId: string) => 
    api.get<MouvementFinancier[]>(`/comptes/${compteId}/mouvements`),
  
  /** Get movements for a specific credit */
  getByCredit: (creditId: string) => 
    api.get<MouvementFinancier[]>(`/credits/${creditId}/mouvements`),
  
  /** Get movements for a cash session */
  getBySession: (sessionId: string) => 
    api.get<MouvementFinancier[]>(`/sessions-caisse/${sessionId}/mouvements`),
};

export interface ClientPortfolio {
  comptes: any[];
  credits: any[];
  tontines: any[];
}

export const portfolioApi = {
  /** Get a client's complete portfolio (accounts, credits, tontines) */
  getByClient: (clientId: string) => 
    api.get<ClientPortfolio>(`/clients/${clientId}/portfolio`),
};

export default api;
