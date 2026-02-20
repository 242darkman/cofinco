export interface CompteEpargne {
  id: string;
  numero_compte: string;
  client_id: string;
  type_compte: string;
  solde: number;
  taux_interet: number;
  date_ouverture: string;
  date_fermeture?: string;
  status: string;
  solde_minimum: number;
  frais_gestion: number;
  created_at: string;
  updated_at?: string;
  created_by?: string;
}

export interface TransactionEpargne {
  id: string;
  compte_id: string;
  type_transaction: string;
  montant: number;
  solde_avant: number;
  solde_apres: number;
  description?: string;
  reference?: string;
  created_at: string;
  created_by?: string;
}

export class CompteService {
  async getAllComptes(filters?: {
    clientId?: string;
    status?: string;
  }): Promise<CompteEpargne[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.status) params.append('status', filters.status);
      
      const url = `/api/comptes-epargne${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('Error fetching comptes epargne');
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching comptes epargne:', error);
      return [];
    }
  }

  async getCompteById(id: string): Promise<CompteEpargne | null> {
    try {
      const response = await fetch(`/api/comptes-epargne/${id}`);
      
      if (!response.ok) {
        console.error('Error fetching compte');
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching compte:', error);
      return null;
    }
  }

  async createCompte(compte: Omit<CompteEpargne, 'id' | 'numero_compte' | 'created_at' | 'solde'>): Promise<CompteEpargne | null> {
    try {
      const response = await fetch('/api/comptes-epargne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...compte, solde: 0 })
      });

      if (!response.ok) {
        console.error('Error creating compte');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating compte:', error);
      return null;
    }
  }

  async updateCompte(id: string, updates: Partial<CompteEpargne>): Promise<CompteEpargne | null> {
    try {
      const response = await fetch(`/api/comptes-epargne/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        console.error('Error updating compte');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating compte:', error);
      return null;
    }
  }

  async createTransaction(transaction: Omit<TransactionEpargne, 'id' | 'created_at'>): Promise<TransactionEpargne | null> {
    try {
      const response = await fetch('/api/transactions-epargne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction)
      });

      if (!response.ok) {
        console.error('Error creating transaction');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating transaction:', error);
      return null;
    }
  }

  async getTransactions(compteId: string, limit: number = 50): Promise<TransactionEpargne[]> {
    try {
      const response = await fetch(`/api/comptes-epargne/${compteId}/transactions?limit=${limit}`);
      
      if (!response.ok) {
        console.error('Error fetching transactions');
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  async getStats(): Promise<{
    totalComptes: number;
    comptesActifs: number;
    soldeTotalEpargne: number;
    totalDepots: number;
    totalRetraits: number;
  }> {
    try {
      const response = await fetch('/api/comptes-epargne/stats');
      
      if (!response.ok) {
        return { totalComptes: 0, comptesActifs: 0, soldeTotalEpargne: 0, totalDepots: 0, totalRetraits: 0 };
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching epargne stats:', error);
      return { totalComptes: 0, comptesActifs: 0, soldeTotalEpargne: 0, totalDepots: 0, totalRetraits: 0 };
    }
  }
}

export const compteService = new CompteService();
