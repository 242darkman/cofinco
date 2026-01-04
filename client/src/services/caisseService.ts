export interface SessionCaisse {
  id: string;
  numero_session: string;
  caissier_id: string;
  date_ouverture: string;
  date_fermeture?: string;
  solde_ouverture: number;
  solde_theorique: number;
  solde_reel?: number;
  ecart?: number;
  total_versements: number;
  total_retraits: number;
  nombre_operations: number;
  status: string;
  commentaire?: string;
  created_at: string;
  updated_at?: string;
}

export interface OperationCaisse {
  id: string;
  numero_operation: string;
  session_id: string;
  type_operation: string;
  montant: number;
  devise: string;
  client_id?: string;
  compte_id?: string;
  type_compte?: string;
  reference?: string;
  description?: string;
  solde_avant: number;
  solde_apres: number;
  mode_paiement: string;
  numero_piece?: string;
  beneficiaire?: string;
  created_at: string;
  created_by?: string;
  validated_by?: string;
  validated_at?: string;
}

export class CaisseService {
  async getSessionActive(caissierId: string): Promise<SessionCaisse | null> {
    try {
      const response = await fetch(`/api/sessions-caisse/active/${caissierId}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        console.error('Error fetching active session');
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching active session:', error);
      return null;
    }
  }

  async ouvrirSession(caissierId: string, soldeOuverture: number): Promise<SessionCaisse | null> {
    try {
      const response = await fetch('/api/sessions-caisse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caissier_id: caissierId,
          solde_ouverture: soldeOuverture,
          solde_theorique: soldeOuverture,
          status: 'Ouverte'
        })
      });

      if (!response.ok) {
        console.error('Error creating session');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating session:', error);
      return null;
    }
  }

  async fermerSession(sessionId: string, soldeReel: number, commentaire?: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/sessions-caisse/${sessionId}/fermer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solde_reel: soldeReel, commentaire })
      });

      return response.ok;
    } catch (error) {
      console.error('Error closing session:', error);
      return false;
    }
  }

  async createOperation(operation: Omit<OperationCaisse, 'id' | 'numero_operation' | 'created_at'>): Promise<OperationCaisse | null> {
    try {
      const response = await fetch('/api/operations-caisse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation)
      });

      if (!response.ok) {
        console.error('Error creating operation');
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating operation:', error);
      return null;
    }
  }

  async getOperations(sessionId: string): Promise<OperationCaisse[]> {
    try {
      const response = await fetch(`/api/sessions-caisse/${sessionId}/operations`);
      
      if (!response.ok) {
        console.error('Error fetching operations');
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching operations:', error);
      return [];
    }
  }

  async getSessions(filters?: {
    caissierId?: string;
    status?: string;
    dateDebut?: string;
    dateFin?: string;
  }): Promise<SessionCaisse[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.caissierId) params.append('caissierId', filters.caissierId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.dateDebut) params.append('dateDebut', filters.dateDebut);
      if (filters?.dateFin) params.append('dateFin', filters.dateFin);
      
      const url = `/api/sessions-caisse${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('Error fetching sessions');
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  }

  async getStats(sessionId?: string): Promise<{
    totalVersements: number;
    totalRetraits: number;
    nombreOperations: number;
    soldeTheorique: number;
  }> {
    try {
      const url = sessionId ? `/api/sessions-caisse/${sessionId}/stats` : '/api/sessions-caisse/stats';
      const response = await fetch(url);
      
      if (!response.ok) {
        return { totalVersements: 0, totalRetraits: 0, nombreOperations: 0, soldeTheorique: 0 };
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching caisse stats:', error);
      return { totalVersements: 0, totalRetraits: 0, nombreOperations: 0, soldeTheorique: 0 };
    }
  }

  async validerOperation(operationId: string, validatedBy: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/operations-caisse/${operationId}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validated_by: validatedBy })
      });

      return response.ok;
    } catch (error) {
      console.error('Error validating operation:', error);
      return false;
    }
  }
}

export const caisseService = new CaisseService();
