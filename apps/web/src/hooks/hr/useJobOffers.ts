import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

export interface JobOffer {
  id: number;
  jobPositionId: string;
  titre: string;
  description: string | null;
  competencesRequises: string[] | null;
  qualificationMinimum: string | null;
  experienceMinAnnees: number;
  formationRequise: string | null;
  salairePropose: string | null;
  typeContrat: string | null;
  lieu: string | null;
  visibilite: string;
  statut: string;
  datePublication: string | null;
  dateLimite: string | null;
  poidsCompetences: number;
  poidsQualification: number;
  poidsExperience: number;
  postesOuverts: number;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  positionName?: string;
  positionCode?: string;
  departmentName?: string;
  departmentId?: string;
  candidatureCount?: number;
}

export interface InternalOffer {
  offer: JobOffer;
  positionName: string;
  departmentName: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export function useJobOffers(filter?: { statut?: string; visibilite?: string }) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams();
  if (filter?.statut) params.set('statut', filter.statut);
  if (filter?.visibilite) params.set('visibilite', filter.visibilite);
  const queryStr = params.toString() ? `?${params.toString()}` : '';

  const { data: offers = [], isLoading } = useQuery<JobOffer[]>({
    queryKey: ['/api/hr/job-offers', filter],
    queryFn: () => fetchJson<JobOffer[]>(`/api/hr/job-offers${queryStr}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<JobOffer>) =>
      fetchJson<JobOffer>('/api/hr/job-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Offre créée');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/job-offers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<JobOffer> & { id: number }) =>
      fetchJson<JobOffer>(`/api/hr/job-offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Offre mise à jour');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/job-offers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<JobOffer>(`/api/hr/job-offers/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Offre publiée');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/job-offers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<JobOffer>(`/api/hr/job-offers/${id}/close`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Offre fermée');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/job-offers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scoreAllMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<{ scored: number }>(`/api/hr/job-offers/${id}/score-all`, { method: 'POST' }),
    onSuccess: (data) => {
      toast.success(`${data.scored} candidature(s) scorée(s)`);
      queryClient.invalidateQueries({ queryKey: ['/api/hr/job-offers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    offers,
    isLoading,
    createOffer: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateOffer: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    publishOffer: publishMutation.mutateAsync,
    closeOffer: closeMutation.mutateAsync,
    scoreAll: scoreAllMutation.mutateAsync,
    isScoringAll: scoreAllMutation.isPending,
  };
}

export function useInternalOffers() {
  const queryClient = useQueryClient();

  const { data: offers = [], isLoading } = useQuery<InternalOffer[]>({
    queryKey: ['/api/hr/job-offers/internal'],
    queryFn: () => fetchJson<InternalOffer[]>('/api/hr/job-offers/internal'),
  });

  const applyMutation = useMutation({
    mutationFn: ({ offerId, ...data }: { offerId: number; experience?: string; formation?: string }) =>
      fetchJson(`/api/hr/job-offers/${offerId}/apply-internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Candidature envoyée');
      queryClient.invalidateQueries({ queryKey: ['/api/hr/job-offers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    offers,
    isLoading,
    applyInternal: applyMutation.mutateAsync,
    isApplying: applyMutation.isPending,
  };
}

export function useJobOfferCandidatures(offerId: number | null) {
  const { data: candidatures = [], isLoading } = useQuery({
    queryKey: ['/api/hr/job-offers', offerId, 'candidatures'],
    queryFn: () => fetchJson<any[]>(`/api/hr/job-offers/${offerId}/candidatures`),
    enabled: !!offerId,
  });

  return { candidatures, isLoading };
}
