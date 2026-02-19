import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrAvancesApi } from '../../lib/api-client';
import { hrKeys } from '../../lib/query-keys';
import { toast } from '../../lib/toast';

export interface AvanceSalaire {
  id: string;
  employeId: string;
  employeNom: string;
  montant: number;
  motif: string;
  dateDemande: string;
  dateRemboursement: string | null;
  moisDeduction: string | null;
  statut: string;
  approuvePar: string | null;
  approuveParNom: string | null;
  approuveAt: string | null;
  payeAt: string | null;
  rejeteMotif: string | null;
  createdAt: string;
}

export function useAvances() {
  const queryClient = useQueryClient();

  const { data: avances = [], isLoading } = useQuery<AvanceSalaire[]>({
    queryKey: hrKeys.avances(),
    queryFn: () => hrAvancesApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { employeId: string; montant: number; motif: string; dateRemboursement?: string }) =>
      hrAvancesApi.create(data),
    onSuccess: () => {
      toast.success('Demande d\'avance créée');
      queryClient.invalidateQueries({ queryKey: hrKeys.avances() });
    },
    onError: () => toast.error('Erreur lors de la création de l\'avance'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => hrAvancesApi.approve(id),
    onSuccess: () => {
      toast.success('Avance approuvée');
      queryClient.invalidateQueries({ queryKey: hrKeys.avances() });
    },
    onError: () => toast.error('Erreur lors de l\'approbation de l\'avance'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, motif }: { id: string; motif: string }) => hrAvancesApi.reject(id, motif),
    onSuccess: () => {
      toast.success('Avance rejetée');
      queryClient.invalidateQueries({ queryKey: hrKeys.avances() });
    },
    onError: () => toast.error('Erreur lors du rejet de l\'avance'),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => hrAvancesApi.pay(id),
    onSuccess: () => {
      toast.success('Avance payée');
      queryClient.invalidateQueries({ queryKey: hrKeys.avances() });
    },
    onError: () => toast.error('Erreur lors du paiement de l\'avance'),
  });

  const deductMutation = useMutation({
    mutationFn: ({ id, moisDeduction }: { id: string; moisDeduction?: string }) =>
      hrAvancesApi.deduct(id, moisDeduction),
    onSuccess: () => {
      toast.success('Avance déduite du salaire');
      queryClient.invalidateQueries({ queryKey: hrKeys.avances() });
    },
    onError: () => toast.error('Erreur lors de la déduction de l\'avance'),
  });

  return {
    avances,
    isLoading,
    createAvance: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    approveAvance: approveMutation.mutateAsync,
    rejectAvance: rejectMutation.mutateAsync,
    payAvance: payMutation.mutateAsync,
    deductAvance: deductMutation.mutateAsync,
  };
}
