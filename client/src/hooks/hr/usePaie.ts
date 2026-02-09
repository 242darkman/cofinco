import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

export interface BulletinPaie {
  id: number;
  employeId: string;
  employeNom: string;
  mois: string;
  salaireBase: string;
  primeTransport: string;
  primeRendement: string;
  salaireBrut: string;
  cnssEmploye: string;
  ipr: string;
  totalRetenues: string;
  salaireNet: string;
  statut: string;
  datePaiement: string | null;
  createdAt: string;
}

export function usePaie() {
  const queryClient = useQueryClient();

  const invalidateBulletins = () => {
    queryClient.invalidateQueries({ queryKey: ['all-bulletins'] });
    queryClient.invalidateQueries({ queryKey: ['my-bulletins'] });
  };

  // Fetch My Bulletins
  const { data: myBulletins = [], isLoading: loadingMyBulletins } = useQuery({
    queryKey: ['my-bulletins'],
    queryFn: async () => {
      const res = await fetch('/api/hr/paie/my');
      if (!res.ok) throw new Error('Failed to fetch bulletins');
      return res.json();
    },
  });

  // Fetch All Bulletins (RH/Admin)
  const { data: allBulletins = [], isLoading: loadingAllBulletins } = useQuery({
    queryKey: ['all-bulletins'],
    queryFn: async () => {
      const res = await fetch('/api/hr/bulletins');
      if (!res.ok) throw new Error('Failed to fetch all bulletins');
      return res.json();
    },
  });

  // Generate Paie
  const generatePaieMutation = useMutation({
    mutationFn: async (mois: string) => {
      const res = await fetch('/api/hr/paie/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mois }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la génération');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Génération de paie réussie');
      invalidateBulletins();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la génération de paie');
    },
  });

  // Validate Bulletins (DRAFT -> VALIDATED)
  const validateMutation = useMutation({
    mutationFn: async (bulletinIds: number[]) => {
      const res = await fetch('/api/hr/paie/validate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulletinIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la validation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.validated || 0;
      toast.success(`${count} bulletin(s) validé(s)`);
      invalidateBulletins();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la validation');
    },
  });

  // Pay Bulletins (VALIDATED -> PAID)
  const payMutation = useMutation({
    mutationFn: async ({ bulletinIds, datePaiement }: { bulletinIds: number[]; datePaiement?: string }) => {
      const res = await fetch('/api/hr/paie/pay', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulletinIds, datePaiement }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors du paiement');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const count = data?.data?.paid || 0;
      toast.success(`${count} bulletin(s) marqué(s) comme payé(s)`);
      invalidateBulletins();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du paiement');
    },
  });

  return {
    myBulletins,
    loadingMyBulletins,
    allBulletins,
    loadingAllBulletins,
    generatePaie: generatePaieMutation.mutateAsync,
    isGenerating: generatePaieMutation.isPending,
    validateBulletins: validateMutation.mutateAsync,
    isValidating: validateMutation.isPending,
    payBulletins: payMutation.mutateAsync,
    isPaying: payMutation.isPending,
  };
}
