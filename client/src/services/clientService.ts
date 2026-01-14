import { clientApi, clientSearchApi } from '../lib/api-client';

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

export class ClientService {
  async getAll(filters?: {
    search?: string;
    searchTerm?: string;
    status?: string;
    segment?: string;
  }): Promise<Client[]> {
    try {
      let clients;
      const searchQuery = filters?.search || filters?.searchTerm;
      
      if (searchQuery) {
        // Use backend search for robust full-text search (name, phone, email, full name)
        clients = await clientSearchApi.search(searchQuery);
      } else {
        clients = await clientApi.getAll();
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
      
      return filteredClients;
    } catch (error) {
      console.error('Error fetching clients:', error);
      return [];
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
    return this.getAll({ search: query });
  }

  async getStats(): Promise<{
    total: number;
    actifs: number;
    nouveaux: number;
    vip: number;
  }> {
    try {
      const clients = await clientApi.getAll();
      
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
