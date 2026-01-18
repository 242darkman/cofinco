import { clientApi, clientSearchApi } from '../lib/api-client';
import type { PaginationMeta } from '../lib/api-client';

export interface Client {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone: string;
  adresse?: string;
  ville?: string;
  pays?: string;
  dateNaissance?: string;
  numeroPiece?: string;
  typePiece?: string;
  profession?: string;
  employeur?: string;
  revenuMensuel?: number;
  status?: string;
  segment?: string;
  score?: number;
  dateInscription?: string;
  photoUrl?: string;
  photoProfile?: string;
  creditTotal?: string | number;
  epargneTotal?: string | number;
  tauxRemboursement?: string | number;
  pointsFidelite?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  typeMarcheId?: string | null;
  type_marche_nom?: string | null;
}

export interface ClientListResult {
  data: Client[];
  meta: PaginationMeta;
}

export class ClientService {
  async getAll(
    filters?: {
      search?: string;
      searchTerm?: string;
      status?: string;
      segment?: string;
    },
    pagination?: { page?: number; perPage?: number }
  ): Promise<ClientListResult> {
    try {
      const page = pagination?.page ?? 1;
      const perPage = pagination?.perPage ?? 20;

      let clients: Client[] = [];
      let meta: PaginationMeta = {
        pagination: { page, per_page: perPage, total_items: 0, total_pages: 1 },
        filters: {}
      };

      const searchQuery = filters?.search || filters?.searchTerm;

      const hasClientFilters =
        (filters?.status && filters.status !== 'all') ||
        (filters?.segment && filters.segment !== 'all');

      if (searchQuery) {
        // Use backend search for robust full-text search (name, phone, email, full name)
        const response = await clientSearchApi.search(searchQuery, { page, perPage });
        clients = response.data || [];
        meta = response.meta;
      } else if (hasClientFilters) {
        clients = await clientApi.getAllList();
        meta = {
          pagination: {
            page,
            per_page: perPage,
            total_items: clients.length,
            total_pages: Math.max(1, Math.ceil(clients.length / perPage))
          },
          filters: {}
        };
      } else {
        const response = await clientApi.getAll({ page, perPage });
        clients = response.data || [];
        meta = response.meta;
      }
      
      let filteredClients = clients;

      // Removed client-side search filtering as it is now handled by the backend
      // kept other filters (status, segment) as client-side filtering for now

      if (filters?.status && filters.status !== 'all') {
        filteredClients = filteredClients.filter(client => client.status === filters.status);
      }

      if (filters?.segment && filters.segment !== 'all') {
        filteredClients = filteredClients.filter(client => client.segment === filters.segment);
      }

      if ((filters?.status && filters.status !== 'all') || (filters?.segment && filters.segment !== 'all')) {
        const total = filteredClients.length;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const offset = (page - 1) * perPage;
        return {
          data: filteredClients.slice(offset, offset + perPage),
          meta: {
            pagination: {
              page,
              per_page: perPage,
              total_items: total,
              total_pages: totalPages
            },
            filters: meta.filters
          }
        };
      }

      return { data: filteredClients, meta };
    } catch (error) {
      console.error('Error fetching clients:', error);
      return {
        data: [],
        meta: {
          pagination: { page: 1, per_page: 20, total_items: 0, total_pages: 1 },
          filters: {}
        }
      };
    }
  }

  async getById(id: string): Promise<Client | null> {
    try {
      return await clientApi.getById(id);
    } catch (error) {
      console.error('Error fetching client:', error);
      return null;
    }
  }

  async create(client: Partial<Client>): Promise<Client | null> {
    try {
      return await clientApi.create(client);
    } catch (error: any) {
      console.error('Error creating client:', error);
      throw new Error(error.message || 'Erreur lors de la création du client');
    }
  }

  async update(id: string, updates: Partial<Client>): Promise<Client | null> {
    try {
      return await clientApi.update(id, updates);
    } catch (error) {
      console.error('Error updating client:', error);
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await clientApi.delete(id);
      return true;
    } catch (error) {
      console.error('Error deleting client:', error);
      return false;
    }
  }

  async search(query: string): Promise<Client[]> {
    if (!query) return [];
    const result = await this.getAll({ search: query }, { page: 1, perPage: 20 });
    return result.data;
  }

  async getStats(): Promise<{
    total: number;
    actifs: number;
    nouveaux: number;
    vip: number;
  }> {
    try {
      const clients = await clientApi.getAllList();
      
      const total = clients.length;
      const actifs = clients.filter(c => c.status === 'Actif').length;
      const vip = clients.filter(c => c.segment === 'VIP').length;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const nouveaux = clients.filter(c => {
        const createdAt = c.createdAt || c.dateInscription;
        if (!createdAt) return false;
        return new Date(createdAt) >= thirtyDaysAgo;
      }).length;
      
      return { total, actifs, nouveaux, vip };
    } catch (error) {
      console.error('Error fetching client stats:', error);
      return { total: 0, actifs: 0, nouveaux: 0, vip: 0 };
    }
  }
}

export const clientService = new ClientService();
