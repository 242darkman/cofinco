import { clientApi, clientSearchApi } from '../lib/api-client';
import type { PaginationMeta, ClientStatsResponse } from '../lib/api-client';
import type { ClientWithIdentity } from '@shared/schema/clients';

/**
 * Type Client utilisé côté frontend.
 * Alias pour ClientWithIdentity qui contient les données d'identité (nom, prenom, email, telephone, photoProfile)
 * fusionnées depuis la table users via jointure côté backend.
 */
export type Client = ClientWithIdentity;

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
        filteredClients = filteredClients.filter(client => client.statut === filters.status);
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

  /**
   * Récupère les statistiques agrégées des clients via l'endpoint optimisé
   * Utilise des COUNT SQL côté backend au lieu de charger tous les objets
   */
  async getStats(): Promise<ClientStatsResponse> {
    try {
      return await clientApi.getStats();
    } catch (error) {
      console.error('Error fetching client stats:', error);
      return {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        suspendedClients: 0,
        newClientsThisMonth: 0,
        segmentDistribution: { vip: 0, premium: 0, standard: 0 },
        financialSummary: { totalCredit: 0, totalEpargne: 0, avgRepaymentRate: 0, totalLoyaltyPoints: 0 }
      };
    }
  }
}

export const clientService = new ClientService();
