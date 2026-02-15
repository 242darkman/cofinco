import { create } from 'zustand';
import { api } from '@/lib/api-client';

/**
 * Agent terrain session lifecycle:
 * REQUESTING_FUNDS → ACTIVE → CLOSING → CLOSED
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  agentId: string;
  agenceId: string;
  statut: 'REQUESTING_FUNDS' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
  montantDemande: number;
  montantProvisionne?: number;
  montantCollecte?: number;
  montantPhysique?: number;
  montantTheorique?: number;
  ecart?: number;
  nombreOperations?: number;
  dateOuverture: string;
  dateFermeture?: string;
  observations?: string;
  glAccountNumber?: string;
}

export interface CaisseAgent {
  caisseId: string;
  agentId: string;
  soldeValide: string;
  pendingIn: string;
  pendingOut: string;
  disponible: string;
  devise: string;
  statut: 'ACTIVE' | 'SUSPENDED';
}

export type TypeOperationTerrain =
  | 'LOAN_REPAYMENT'
  | 'SAVINGS_DEPOSIT'
  | 'DEPOSIT_CURRENT'
  | 'WITHDRAWAL_SAVINGS'
  | 'WITHDRAWAL_CURRENT'
  | 'TONTINE_CONTRIBUTION'
  | 'ENGAGEMENT_FEE'
  | 'MISC_COLLECTION';

export interface OperationTerrain {
  id: string;
  type: 'COLLECT_CASH' | 'SETTLEMENT_CASH';
  statut: 'SUBMITTED' | 'APPROVED' | 'PENDING_SETTLEMENT' | 'SETTLED' | 'REJECTED' | 'CANCELLED';
  agentId: string;
  clientId?: string;
  montant: number;
  observations?: string;
  numeroRecu?: string;
  createdAt: string;
  clientNom?: string;
  clientPrenom?: string;
  metadata?: {
    typePaiementClient?: TypeOperationTerrain;
    creditId?: string;
    compteId?: string;
    tontineId?: string;
    latitude?: number;
    longitude?: number;
  };
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  cancelledAt?: string;
}

export interface Billetage {
  '10000': number;
  '5000': number;
  '2000': number;
  '1000': number;
  '500': number;
  '100': number;
  '50': number;
  '25': number;
  '10': number;
  '5': number;
}

// ─── Payloads ────────────────────────────────────────────────────────────────

export interface CollectCashData {
  clientId: string;
  montant: number;
  typePaiementClient?: TypeOperationTerrain;
  creditId?: string;
  compteId?: string;
  tontineId?: string;
  numeroRecu?: string;
  observations?: string;
  latitude?: number;
  longitude?: number;
}

export interface SettlementCashData {
  destinationCaisseId: string;
  montant: number;
  billetage?: Partial<Billetage>;
  observations?: string;
}

export interface InitiateCloseData {
  montantPhysique: number;
  destinationCaisseId: string;
  billetage?: Partial<Billetage>;
  observations?: string;
}

export interface CloseWithRemiseData {
  montantPhysique: number;
  destinationCaisseId: string;
  billetage?: Partial<Billetage>;
  observations?: string;
  ecartJustification?: string;
}

export interface OperationsFilter {
  statut?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface AgentState {
  session: AgentSession | null;
  caisse: CaisseAgent | null;
  isLoading: boolean;
  employeId: string | null;

  setEmployeId: (id: string) => void;
  checkActiveSession: () => Promise<void>;
  getCaisseBalance: () => Promise<void>;
  requestSession: (data: { agenceId: string; montantDemande: number; observations?: string }) => Promise<void>;
  collectCash: (data: CollectCashData) => Promise<OperationTerrain>;
  settlementCash: (data: SettlementCashData) => Promise<OperationTerrain>;
  cancelOperation: (operationId: string) => Promise<void>;
  initiateClose: (data: InitiateCloseData) => Promise<void>;
  closeWithRemise: (data: CloseWithRemiseData) => Promise<void>;
  getOperations: (params?: OperationsFilter) => Promise<{ operations: OperationTerrain[]; total: number }>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  session: null,
  caisse: null,
  isLoading: false,
  employeId: null,

  setEmployeId: (id: string) => set({ employeId: id }),

  checkActiveSession: async () => {
    const agentId = get().employeId;
    if (!agentId) return;
    try {
      set({ isLoading: true });
      const data = await api.get<{ session: AgentSession | null }>(
        `/api/caisse-agent/sessions/active?agentId=${agentId}`
      );
      set({ session: data.session, isLoading: false });
    } catch {
      set({ session: null, isLoading: false });
    }
  },

  getCaisseBalance: async () => {
    const agentId = get().employeId;
    if (!agentId) return;
    try {
      const data = await api.get<CaisseAgent>(
        `/api/caisse-agent/agents/${agentId}/caisse`
      );
      set({ caisse: data });
    } catch {
      // Caisse may not exist yet
    }
  },

  requestSession: async ({ agenceId, montantDemande, observations }) => {
    const agentId = get().employeId;
    if (!agentId) throw new Error('Agent ID manquant');
    const data = await api.post<{ success: boolean; session: AgentSession }>(
      '/api/caisse-agent/sessions',
      { agentId, agenceId, montantDemande, observations }
    );
    set({ session: data.session });
  },

  collectCash: async (collectData) => {
    const agentId = get().employeId;
    if (!agentId) throw new Error('Agent ID manquant');
    const resp = await api.post<{ success: boolean; operation: OperationTerrain }>(
      '/api/caisse-agent/operations-terrain',
      {
        type: 'COLLECT_CASH',
        agentId,
        ...collectData,
        typePaiementClient: collectData.typePaiementClient || 'DEPOSIT_CURRENT',
      }
    );
    get().getCaisseBalance();
    return resp.operation;
  },

  settlementCash: async (data) => {
    const agentId = get().employeId;
    if (!agentId) throw new Error('Agent ID manquant');
    const resp = await api.post<{ success: boolean; operation: OperationTerrain }>(
      '/api/caisse-agent/operations-terrain',
      { type: 'SETTLEMENT_CASH', agentId, ...data }
    );
    get().getCaisseBalance();
    return resp.operation;
  },

  cancelOperation: async (operationId: string) => {
    await api.post(`/api/caisse-agent/operations-terrain/${operationId}/cancel`);
    get().getCaisseBalance();
  },

  initiateClose: async (data) => {
    const session = get().session;
    if (!session) throw new Error('Aucune session active');
    const resp = await api.post<{ success: boolean; session: AgentSession }>(
      `/api/caisse-agent/sessions/${session.id}/initiate-close`,
      data
    );
    set({ session: resp.session });
  },

  closeWithRemise: async (data) => {
    const session = get().session;
    if (!session) throw new Error('Aucune session active');
    const resp = await api.post<{ success: boolean; session: AgentSession }>(
      `/api/caisse-agent/sessions/${session.id}/close-with-remise`,
      data
    );
    set({ session: resp.session });
  },

  getOperations: async (params = {}) => {
    const agentId = get().employeId;
    if (!agentId) return { operations: [], total: 0 };
    const qs = new URLSearchParams({ agentId, limit: '50', ...params as Record<string, string> });
    const data = await api.get<{ operations: OperationTerrain[]; total: number }>(
      `/api/caisse-agent/operations-terrain?${qs}`
    );
    return data;
  },
}));
