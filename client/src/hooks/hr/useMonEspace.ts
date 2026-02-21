import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export interface MyDashboard {
  conges: { total: number; enAttente: number; approuve: number };
  derniersBulletins: any[];
  presenceMois: { total: number; presents: number; retards: number; absents: number; heuresTravaillees: number };
  documentsEnCours: number;
  evaluationsRecentes: any[];
}

export interface MyPresence {
  id: number;
  employeId: string;
  date: string;
  statut: string;
  heureArrivee: string | null;
  heureDepart: string | null;
  heuresTravaillees: number | null;
  heuresSupplementaires: number | null;
  motifAbsence: string | null;
  note: string | null;
}

export interface MyEvaluation {
  id: string;
  campaignId: string;
  employeId: string;
  evaluatorId: string;
  status: string;
  overallScore: number | null;
  overallComment: string | null;
  createdAt: string;
  completedAt: string | null;
  evaluatorNom: string | null;
}

export function useMyDashboard() {
  const { data: dashboard, isLoading } = useQuery<MyDashboard>({
    queryKey: ['/api/hr/my/dashboard'],
    queryFn: () => fetchJson<MyDashboard>('/api/hr/my/dashboard'),
  });
  return { dashboard, isLoading };
}

export function useMyPresence(mois?: string) {
  const qs = mois ? `?mois=${mois}` : '';
  const { data: presences = [], isLoading } = useQuery<MyPresence[]>({
    queryKey: ['/api/hr/my/presence', mois],
    queryFn: () => fetchJson<MyPresence[]>(`/api/hr/my/presence${qs}`),
  });
  return { presences, isLoading };
}

export function useMyEvaluations() {
  const { data: evaluations = [], isLoading } = useQuery<MyEvaluation[]>({
    queryKey: ['/api/hr/my/evaluations'],
    queryFn: () => fetchJson<MyEvaluation[]>('/api/hr/my/evaluations'),
  });
  return { evaluations, isLoading };
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: {
      telephone?: string;
      adresse?: string;
      email?: string;
      bankName?: string;
      bankCode?: string;
      branchCode?: string;
      bankAccountNumber?: string;
      accountKey?: string;
      paymentMethod?: string;
      paymentDetails?: string;
      situationFamiliale?: string;
      nombreEnfantsCharge?: number;
    }) => fetchJson<any>('/api/hr/my/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/my'] });
      toast.success('Profil mis à jour');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { updateProfile: mutation.mutateAsync, isUpdating: mutation.isPending };
}
