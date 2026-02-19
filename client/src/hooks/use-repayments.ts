/**
 * Hook React Query pour gérer les remboursements avec allocation FIFO
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface Remboursement {
  id: string;
  creditId: string;
  montant: string;
  dateRemboursement: string;
  methodePaiement: string;
  observations?: string;
  overpaymentAmount?: string;
  allocationStrategy?: string;
  isReversed?: boolean;
  reversedAt?: string;
  reversalReason?: string;
  createdBy?: string;
  createdAt?: string;
  // Relations
  allocations?: RemboursementAllocation[];
  facture?: any;
}

export interface RemboursementAllocation {
  id: string;
  remboursementId: string;
  echeanceId: string;
  allocatedAmount: string;
  allocatedCapital?: string;
  allocatedInterest?: string;
  allocationOrder: number;
  echeance?: {
    numeroEcheance: number;
    dateEcheance: string;
    montantTotal: string;
    statut: string;
  };
}

export interface CreateRemboursementData {
  creditId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
  allocationOptions?: {
    strategy?: 'FIFO' | 'LIFO' | 'PROPORTIONAL';
    applyToFutureInstallments?: boolean;
    createCreditBalance?: boolean;
  };
}

export interface RemboursementSummary {
  totalRemboursements: number;
  montantTotalPaye: number;
  dernierRemboursement?: {
    date: string;
    montant: number;
    methodePaiement: string;
  };
  totalOverpayment: number;
  creditBalance?: number;
}

/**
 * Hook pour récupérer les remboursements d'un crédit
 */
export function useRepayments(creditId: string | undefined) {
  const queryClient = useQueryClient();
  const { socket, isConnected } = useWebSocket();

  const query = useQuery({
    queryKey: ['repayments', creditId],
    queryFn: async () => {
      if (!creditId) throw new Error('Credit ID required');
      
      const response = await api.get<Remboursement[]>(`/api/credits/${creditId}/remboursements`);
      const remboursements = response.data ?? [];
      
      // Trier par date décroissante
      return remboursements.sort((a, b) => 
        new Date(b.dateRemboursement).getTime() - new Date(a.dateRemboursement).getTime()
      );
    },
    enabled: !!creditId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Écouter les mises à jour WebSocket
  useEffect(() => {
    if (!socket || !isConnected || !creditId) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'CREDIT_REPAYMENT_CREATED' && message.payload?.creditId === creditId) {
          queryClient.invalidateQueries({ queryKey: ['repayments', creditId] });
          toast.success(`Nouveau remboursement de ${Number(message.payload.montant).toLocaleString('fr-FR')} FCFA enregistré`);
        }
        if (message.type === 'REPAYMENT_REVERSED' && message.payload?.creditId === creditId) {
          queryClient.invalidateQueries({ queryKey: ['repayments', creditId] });
          toast.warning('Un remboursement a été extourné');
        }
      } catch { /* ignore parse errors */ }
    };

    socket.addEventListener('message', handleMessage);
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, isConnected, creditId, queryClient]);

  return query;
}

/**
 * Hook pour créer un remboursement avec allocation FIFO
 */
export function useCreateRepayment() {
  const queryClient = useQueryClient();
  const { socket } = useWebSocket();

  return useMutation({
    mutationFn: async (data: CreateRemboursementData) => {
      const response = await api.post<any>('/api/remboursements', data);
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalider les queries liées
      queryClient.invalidateQueries({ queryKey: ['repayments', variables.creditId] });
      queryClient.invalidateQueries({ queryKey: ['creditSchedule', variables.creditId] });
      queryClient.invalidateQueries({ queryKey: ['credit', variables.creditId] });
      queryClient.invalidateQueries({ queryKey: ['creditDetails', variables.creditId] });

      // Message de succès détaillé
      const allocations = data.allocationResult?.allocations || [];
      const overpayment = data.allocationResult?.overpaymentAmount || 0;
      
      let message = `Remboursement de ${Number(variables.montant).toLocaleString('fr-FR')} FCFA enregistré`;
      
      if (allocations.length > 0) {
        const paidCount = allocations.filter((a: any) => a.isPaid).length;
        const partialCount = allocations.filter((a: any) => !a.isPaid).length;
        
        if (paidCount > 0) {
          message += `\n${paidCount} échéance(s) soldée(s)`;
        }
        if (partialCount > 0) {
          message += `\n${partialCount} échéance(s) partiellement payée(s)`;
        }
      }
      
      if (overpayment > 0) {
        message += `\nTrop-perçu: ${overpayment.toLocaleString('fr-FR')} FCFA`;
      }

      toast.success(message);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erreur lors du remboursement';
      toast.error(message);
    }
  });
}

/**
 * Hook pour extourner un remboursement
 */
export function useReverseRepayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ remboursementId, reason }: { remboursementId: string; reason: string }) => {
      const response = await api.post<any>(`/api/remboursements/${remboursementId}/reverse`, { reason });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Invalider toutes les queries liées
      queryClient.invalidateQueries({ queryKey: ['repayments'] });
      queryClient.invalidateQueries({ queryKey: ['creditSchedule'] });
      queryClient.invalidateQueries({ queryKey: ['credit'] });

      toast.success(data.message || 'Remboursement extourné');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erreur lors de l\'extourne');
    }
  });
}

/**
 * Hook pour obtenir les détails d'allocation d'un remboursement
 */
export function useRepaymentAllocations(remboursementId: string | undefined) {
  return useQuery({
    queryKey: ['repaymentAllocations', remboursementId],
    queryFn: async () => {
      if (!remboursementId) throw new Error('Remboursement ID required');
      
      const response = await api.get(`/api/remboursements/${remboursementId}/allocations`);
      return response.data as RemboursementAllocation[];
    },
    enabled: !!remboursementId,
  });
}

/**
 * Hook pour obtenir un résumé des remboursements
 */
export function useRepaymentsSummary(creditId: string | undefined) {
  const { data: remboursements } = useRepayments(creditId);

  if (!remboursements) return null;

  const activeRemboursements = remboursements.filter(r => !r.isReversed);

  const summary: RemboursementSummary = {
    totalRemboursements: activeRemboursements.length,
    montantTotalPaye: activeRemboursements.reduce((sum, r) => sum + Number(r.montant), 0),
    totalOverpayment: activeRemboursements.reduce((sum, r) => sum + Number(r.overpaymentAmount || 0), 0)
  };

  // Dernier remboursement
  if (activeRemboursements.length > 0) {
    const dernier = activeRemboursements[0];
    summary.dernierRemboursement = {
      date: dernier.dateRemboursement,
      montant: Number(dernier.montant),
      methodePaiement: dernier.methodePaiement
    };
  }

  return summary;
}

/**
 * Formatte un remboursement pour l'affichage
 */
export function formatRemboursementDisplay(remboursement: Remboursement) {
  const dateFormatted = format(new Date(remboursement.dateRemboursement), 'dd MMMM yyyy', { locale: fr });
  const montant = Number(remboursement.montant).toLocaleString('fr-FR');
  const overpayment = Number(remboursement.overpaymentAmount || 0);
  
  const methodePaiementLabels: Record<string, string> = {
    CASH: 'Espèces',
    BANK_TRANSFER: 'Virement',
    MOBILE_MONEY: 'Mobile Money',
    CHECK: 'Chèque',
    CARD: 'Carte'
  };

  return {
    id: remboursement.id,
    date: dateFormatted,
    montant,
    montantNumber: Number(remboursement.montant),
    methodePaiement: methodePaiementLabels[remboursement.methodePaiement] || remboursement.methodePaiement,
    hasOverpayment: overpayment > 0,
    overpaymentFormatted: overpayment.toLocaleString('fr-FR'),
    isReversed: remboursement.isReversed,
    reversedDate: remboursement.reversedAt ? format(new Date(remboursement.reversedAt), 'dd/MM/yyyy', { locale: fr }) : null,
    reversalReason: remboursement.reversalReason,
    allocationsCount: remboursement.allocations?.length || 0,
    observations: remboursement.observations
  };
}

/**
 * Formatte une allocation pour l'affichage
 */
export function formatAllocationDisplay(allocation: RemboursementAllocation) {
  return {
    echeanceNumero: allocation.echeance?.numeroEcheance || 0,
    dateEcheance: allocation.echeance ? 
      format(new Date(allocation.echeance.dateEcheance), 'dd/MM/yyyy', { locale: fr }) : '',
    montantAlloue: Number(allocation.allocatedAmount).toLocaleString('fr-FR'),
    montantCapital: Number(allocation.allocatedCapital || 0).toLocaleString('fr-FR'),
    montantInteret: Number(allocation.allocatedInterest || 0).toLocaleString('fr-FR'),
    ordre: allocation.allocationOrder,
    statut: allocation.echeance?.statut || 'UNKNOWN'
  };
}