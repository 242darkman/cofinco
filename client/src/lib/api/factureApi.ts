import { apiClient } from './api-client';

export interface Facture {
  id: string;
  numero: string;
  modeleId: string;
  clientId: string;
  agentId?: string;
  dateFacture: Date;
  sousTotal: string;
  montantTva: string;
  montantTotal: string;
  montantPaye: string;
  statut: 'brouillon' | 'envoyee' | 'payee' | 'annulee';
  modePaiement?: string;
  operationCaisseId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FactureFilters {
  type?: 'depot' | 'retrait' | 'credit' | 'tontine' | 'frais';
  dateDebut?: string;
  dateFin?: string;
  statut?: Facture['statut'];
}

export const factureApi = {
  /**
   * Get a facture by ID
   */
  getById: (id: string) =>
    apiClient.get<Facture>(`/factures/${id}`),

  /**
   * Get all factures for a client
   */
  getByClient: (clientId: string, filters?: FactureFilters) =>
    apiClient.get<Facture[]>(`/clients/${clientId}/factures`, { params: filters }),

  /**
   * Download facture as PDF
   */
  downloadPDF: async (id: string): Promise<Blob> => {
    const response = await fetch(`/api/factures/${id}/pdf`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/pdf',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }

    return response.blob();
  },

  /**
   * Get facture data formatted for receipt template
   */
  getReceiptData: async (id: string) => {
    const facture = await factureApi.getById(id);
    // Transform facture to ReceiptData format
    return facture;
  },
};
