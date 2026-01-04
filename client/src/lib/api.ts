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

export const epargnesApi = {
  getAll: () => api.get<any[]>('/comptes-epargne'),
  getByClient: (clientId: string | number) => api.get<any[]>(`/clients/${clientId}/comptes-epargne`),
  create: (data: any) => api.post<any>('/comptes-epargne', data),
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

export default api;
