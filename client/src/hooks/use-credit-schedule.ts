/**
 * Hook React Query pour gérer les échéances de crédit avec temps réel
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface EcheanceCredit {
  id: string;
  creditId: string;
  numeroEcheance: number;
  sequence?: number;
  dateEcheance: string;
  montantCapital: string;
  montantInteret: string;
  montantTotal: string;
  montantPaye: string;
  montantCapitalPaye?: string;
  montantInteretPaye?: string;
  statut: 'UPCOMING' | 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'LATE' | 'SETTLED';
  paidAt?: string;
  lateMarkedAt?: string;
  lastPaymentDate?: string;
  // Champs calculés
  montantRestant?: number;
  joursRetard?: number;
  pourcentagePaye?: number;
}

export interface CreditScheduleSummary {
  totalEcheances: number;
  echeancesPayees: number;
  echeancesEnRetard: number;
  echeancesAVenir: number;
  montantTotalDu: number;
  montantTotalPaye: number;
  montantTotalRestant: number;
  prochaineEcheance?: EcheanceCredit;
  dernierPaiement?: {
    date: string;
    montant: number;
  };
}

interface RepaymentAllocation {
  echeanceId: string;
  montant: number;
  statut: string;
  isPaid: boolean;
}

/**
 * Hook pour récupérer les échéances d'un crédit
 */
export function useCreditSchedule(creditId: string | undefined) {
  const queryClient = useQueryClient();
  const { socket, isConnected } = useWebSocket();

  const query = useQuery({
    queryKey: ['creditSchedule', creditId],
    queryFn: async () => {
      if (!creditId) throw new Error('Credit ID required');
      
      const response = await api.get<EcheanceCredit[]>(`/api/credits/${creditId}/echeances`);
      const echeances = response.data ?? [];
      
      // Enrichir avec des champs calculés
      return echeances.map(enrichEcheance).sort((a, b) => 
        new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime()
      );
    },
    enabled: !!creditId,
    staleTime: 30 * 1000, // 30 secondes
    gcTime: 5 * 60 * 1000, // 5 minutes (anciennement cacheTime)
  });

  // Écouter les mises à jour WebSocket
  useEffect(() => {
    if (!socket || !isConnected || !creditId) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'CREDIT_SCHEDULE_UPDATED' && message.payload?.creditId === creditId) {
          const payload = message.payload;
          queryClient.invalidateQueries({ queryKey: ['creditSchedule', creditId] });
          if (payload.action === 'LATE_MARKED') {
            toast.warning('Des échéances ont été marquées en retard');
          } else if (payload.updatedEcheances) {
            const paidCount = payload.updatedEcheances.filter((e: any) => e.isPaid).length;
            if (paidCount > 0) {
              toast.success(`${paidCount} échéance(s) payée(s)`);
            }
          }
        }

        if (message.type === 'REPAYMENT_ALLOCATED' && message.payload?.creditId === creditId) {
          const payload = message.payload;
          // Mise à jour optimiste des échéances
          queryClient.setQueryData(['creditSchedule', creditId], (old: EcheanceCredit[] | undefined) => {
            if (!old) return old;
            const updated = [...old];
            payload.allocations?.forEach((allocation: RepaymentAllocation) => {
              const index = updated.findIndex(e => e.id === allocation.echeanceId);
              if (index >= 0) {
                updated[index] = {
                  ...updated[index],
                  statut: allocation.statut as any,
                  montantPaye: allocation.isPaid
                    ? updated[index].montantTotal
                    : (Number(updated[index].montantPaye || 0) + allocation.montant).toString(),
                  paidAt: allocation.isPaid ? new Date().toISOString() : undefined,
                  lastPaymentDate: new Date().toISOString()
                };
              }
            });
            return updated.map(enrichEcheance);
          });
          if (payload.message) {
            toast.success(payload.message);
          }
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['creditSchedule', creditId] });
          }, 1000);
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
 * Hook pour obtenir un résumé des échéances
 */
export function useCreditScheduleSummary(creditId: string | undefined) {
  const { data: echeances } = useCreditSchedule(creditId);

  if (!echeances) return null;

  const now = new Date();
  const summary: CreditScheduleSummary = {
    totalEcheances: echeances.length,
    echeancesPayees: echeances.filter(e => e.statut === 'PAID' || e.statut === 'SETTLED').length,
    echeancesEnRetard: echeances.filter(e => e.statut === 'LATE').length,
    echeancesAVenir: echeances.filter(e => e.statut === 'UPCOMING' || e.statut === 'DUE').length,
    montantTotalDu: echeances.reduce((sum, e) => sum + Number(e.montantTotal), 0),
    montantTotalPaye: echeances.reduce((sum, e) => sum + Number(e.montantPaye || 0), 0),
    montantTotalRestant: 0
  };

  summary.montantTotalRestant = summary.montantTotalDu - summary.montantTotalPaye;

  // Prochaine échéance non payée
  summary.prochaineEcheance = echeances.find(e => 
    e.statut !== 'PAID' && e.statut !== 'SETTLED'
  );

  // Dernier paiement effectué
  const echeancesAvecPaiement = echeances
    .filter(e => e.lastPaymentDate)
    .sort((a, b) => new Date(b.lastPaymentDate!).getTime() - new Date(a.lastPaymentDate!).getTime());

  if (echeancesAvecPaiement.length > 0) {
    const derniere = echeancesAvecPaiement[0];
    summary.dernierPaiement = {
      date: derniere.lastPaymentDate!,
      montant: Number(derniere.montantPaye || 0)
    };
  }

  return summary;
}

/**
 * Hook pour générer un échéancier
 */
export function useGenerateSchedule(creditId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<any[]>(`/api/credits/${creditId}/generate-schedule`, {});
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['creditSchedule', creditId] });
      toast.success(`Échéancier généré: ${data?.length ?? 0} échéances créées`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erreur lors de la génération');
    }
  });
}

/**
 * Enrichit une échéance avec des champs calculés
 */
function enrichEcheance(echeance: EcheanceCredit): EcheanceCredit {
  const montantTotal = Number(echeance.montantTotal);
  const montantPaye = Number(echeance.montantPaye || 0);
  const dateEcheance = new Date(echeance.dateEcheance);
  const now = new Date();

  const enriched: EcheanceCredit = {
    ...echeance,
    montantRestant: montantTotal - montantPaye,
    pourcentagePaye: montantTotal > 0 ? (montantPaye / montantTotal) * 100 : 0,
    joursRetard: 0
  };

  // Calculer les jours de retard
  if (dateEcheance < now && montantPaye < montantTotal) {
    const diffTime = now.getTime() - dateEcheance.getTime();
    enriched.joursRetard = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  return enriched;
}

/**
 * Formatte le statut de l'échéance pour l'affichage
 */
export function formatEcheanceStatus(statut: EcheanceCredit['statut']): {
  label: string;
  color: string;
  bgColor: string;
} {
  const statusConfig = {
    UPCOMING: {
      label: 'À venir',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50'
    },
    DUE: {
      label: 'Échue',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50'
    },
    PARTIALLY_PAID: {
      label: 'Partiellement payée',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-50'
    },
    PAID: {
      label: 'Payée',
      color: 'text-green-700',
      bgColor: 'bg-green-50'
    },
    LATE: {
      label: 'En retard',
      color: 'text-red-700',
      bgColor: 'bg-red-50'
    },
    SETTLED: {
      label: 'Soldée',
      color: 'text-gray-700',
      bgColor: 'bg-gray-50'
    }
  };

  return statusConfig[statut] || statusConfig.UPCOMING;
}

/**
 * Formatte une échéance pour l'affichage
 */
export function formatEcheanceDisplay(echeance: EcheanceCredit) {
  const dateFormatted = format(new Date(echeance.dateEcheance), 'dd MMMM yyyy', { locale: fr });
  const status = formatEcheanceStatus(echeance.statut);
  
  return {
    numero: echeance.numeroEcheance,
    date: dateFormatted,
    montantTotal: Number(echeance.montantTotal).toLocaleString('fr-FR'),
    montantPaye: Number(echeance.montantPaye || 0).toLocaleString('fr-FR'),
    montantRestant: (echeance.montantRestant || 0).toLocaleString('fr-FR'),
    pourcentage: Math.round(echeance.pourcentagePaye || 0),
    status,
    joursRetard: echeance.joursRetard || 0,
    isLate: echeance.statut === 'LATE',
    isPaid: echeance.statut === 'PAID' || echeance.statut === 'SETTLED',
    isPartial: echeance.statut === 'PARTIALLY_PAID'
  };
}