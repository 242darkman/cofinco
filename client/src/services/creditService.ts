export interface Credit {
  id: string;
  numero_credit: string;
  client_id: string;
  montant: number;
  taux_interet: number;
  duree_mois: number;
  date_debut: string;
  date_fin?: string;
  montant_rembourse: number;
  solde_restant: number;
  status: string;
  type_credit: string;
  objet?: string;
  garanties?: any;
  date_dernier_paiement?: string;
  jours_retard: number;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
}

export interface Echeance {
  id: string;
  credit_id: string;
  numero_echeance: number;
  date_echeance: string;
  montant_principal: number;
  montant_interet: number;
  montant_total: number;
  montant_paye: number;
  status: string;
  date_paiement?: string;
  created_at: string;
}

export class CreditService {
  async getAll(filters?: {
    clientId?: string;
    status?: string;
  }): Promise<Credit[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.status) params.append('status', filters.status);
      
      const url = `/api/credits${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error('Error fetching credits');
        return [];
      }

      const result = await response.json();
      return Array.isArray(result) ? result : result.data ?? [];
    } catch (error) {
      console.error('Error fetching credits:', error);
      return [];
    }
  }

  async getById(id: string): Promise<Credit | null> {
    try {
      const response = await fetch(`/api/credits/${id}`);
      
      if (!response.ok) {
        console.error('Error fetching credit');
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching credit:', error);
      return null;
    }
  }

  async create(credit: Omit<Credit, 'id' | 'numero_credit' | 'created_at' | 'solde_restant'>): Promise<Credit | null> {
    try {
      const response = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credit)
      });

      if (!response.ok) {
        console.error('Error creating credit');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating credit:', error);
      return null;
    }
  }

  async update(id: string, updates: Partial<Credit>): Promise<Credit | null> {
    try {
      const response = await fetch(`/api/credits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        console.error('Error updating credit');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating credit:', error);
      return null;
    }
  }

  async approve(id: string, approvedBy: string): Promise<Credit | null> {
    try {
      const response = await fetch(`/api/credits/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy })
      });

      if (!response.ok) {
        console.error('Error approving credit');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error approving credit:', error);
      return null;
    }
  }

  async getEcheances(creditId: string): Promise<Echeance[]> {
    try {
      const response = await fetch(`/api/credits/${creditId}/echeances`);
      
      if (!response.ok) {
        console.error('Error fetching echeances');
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching echeances:', error);
      return [];
    }
  }

  async createEcheances(creditId: string, echeances: Omit<Echeance, 'id' | 'created_at'>[]): Promise<boolean> {
    try {
      const response = await fetch(`/api/credits/${creditId}/echeances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(echeances)
      });

      return response.ok;
    } catch (error) {
      console.error('Error creating echeances:', error);
      return false;
    }
  }

  async recordPayment(echeanceId: string, montant: number): Promise<boolean> {
    try {
      const response = await fetch(`/api/echeances/${echeanceId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant })
      });

      return response.ok;
    } catch (error) {
      console.error('Error recording payment:', error);
      return false;
    }
  }

  async getStats(): Promise<{
    total: number;
    actifs: number;
    enRetard: number;
    montantTotal: number;
    montantRembourse: number;
  }> {
    try {
      const response = await fetch('/api/credits/stats');
      
      if (!response.ok) {
        return { total: 0, actifs: 0, enRetard: 0, montantTotal: 0, montantRembourse: 0 };
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching credit stats:', error);
      return { total: 0, actifs: 0, enRetard: 0, montantTotal: 0, montantRembourse: 0 };
    }
  }
}

export const creditService = new CreditService();
