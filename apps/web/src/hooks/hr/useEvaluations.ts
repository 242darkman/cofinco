import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Types
export interface EvaluationTemplate {
  id: string;
  nom: string;
  description: string | null;
  actif: boolean | null;
  isDefault: boolean | null;
  criteria: EvaluationCriterion[];
  criteriaCount: number;
  createdAt: string;
}

export interface EvaluationCriterion {
  id: string;
  templateId: string;
  libelle: string;
  description: string | null;
  categorie: string;
  poids: number;
  ordre: number;
}

export interface EvaluationCampaign {
  id: string;
  nom: string;
  description: string | null;
  type: string;
  dateDebut: string;
  dateFin: string;
  statut: string;
  targetType: string;
  targetFilter: string[] | null;
  templateId: string | null;
  selfEvalDeadline: string | null;
  managerEvalDeadline: string | null;
  totalEvaluations: number;
  finalizedCount: number;
  avgScore: string | null;
  createdAt: string;
}

export interface Evaluation {
  id: string;
  campaignId: string;
  employeId: string;
  employeNom: string;
  managerId: string | null;
  managerNom: string | null;
  selfEvalStatus: string;
  managerEvalStatus: string;
  statut: string;
  selfEvalScore: string | null;
  managerEvalScore: string | null;
  finalScore: string | null;
  recommandation: string | null;
  selfCommentaire: string | null;
  managerCommentaire: string | null;
  actionPlan: string | null;
  trainingRecommendations: string[] | null;
  createdAt: string;
  finalizedAt: string | null;
}

export interface EvaluationDetail extends Evaluation {
  criteria: EvaluationCriterion[];
  responses: EvaluationResponse[];
  campaign: EvaluationCampaign;
}

export interface EvaluationResponse {
  id: string;
  evaluationId: string;
  criteriaId: string;
  responseType: string;
  rating: number;
  commentaire: string | null;
}

export interface ComparisonData {
  evaluation: Evaluation;
  comparison: Array<{
    criteriaId: string;
    libelle: string;
    categorie: string;
    poids: number;
    selfRating: number | null;
    selfComment: string | null;
    managerRating: number | null;
    managerComment: string | null;
    gap: number | null;
  }>;
  selfScore: string | null;
  managerScore: string | null;
  finalScore: string | null;
}

export interface CampaignSummary {
  total: number;
  finalized: number;
  selfCompleted: number;
  managerCompleted: number;
  avgScore: string | null;
  byRecommandation: Record<string, number>;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

// =============================================================================
// TEMPLATES
// =============================================================================

export function useEvaluationTemplates() {
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['/api/hr/evaluations/templates'],
    queryFn: () => fetchJson<EvaluationTemplate[]>('/api/hr/evaluations/templates'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { nom: string; description?: string; criteria: Array<{ libelle: string; description?: string; categorie: string; poids: number; ordre: number }> }) =>
      fetchJson('/api/hr/evaluations/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations/templates'] }); toast.success('Modèle créé'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, any>) =>
      fetchJson(`/api/hr/evaluations/templates/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations/templates'] }); toast.success('Modèle mis à jour'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/hr/evaluations/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations/templates'] }); toast.success('Modèle supprimé'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    templates,
    loading: isLoading,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

// =============================================================================
// CAMPAIGNS
// =============================================================================

export function useEvaluationCampaigns() {
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['/api/hr/evaluations/campaigns'],
    queryFn: () => fetchJson<EvaluationCampaign[]>('/api/hr/evaluations/campaigns'),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      fetchJson('/api/hr/evaluations/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations/campaigns'] }); toast.success('Campagne créée'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) =>
      fetchJson(`/api/hr/evaluations/campaigns/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations/campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations'] });
      toast.success('Statut mis à jour');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    campaigns,
    loading: isLoading,
    createCampaign: createMutation.mutateAsync,
    updateCampaignStatus: updateStatusMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}

// =============================================================================
// EVALUATIONS
// =============================================================================

export function useEvaluations(filters?: { campaignId?: string }) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams();
  if (filters?.campaignId) params.set('campaignId', filters.campaignId);

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ['/api/hr/evaluations', filters],
    queryFn: () => fetchJson<Evaluation[]>(`/api/hr/evaluations?${params.toString()}`),
  });

  const submitSelfEvalMutation = useMutation({
    mutationFn: ({ id, responses, commentaire }: { id: string; responses: Array<{ criteriaId: string; rating: number; commentaire?: string }>; commentaire?: string }) =>
      fetchJson(`/api/hr/evaluations/${id}/self-eval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responses, commentaire }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations'] }); toast.success('Auto-évaluation soumise'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitManagerEvalMutation = useMutation({
    mutationFn: ({ id, responses, commentaire, recommandation }: { id: string; responses: Array<{ criteriaId: string; rating: number; commentaire?: string }>; commentaire?: string; recommandation?: string }) =>
      fetchJson(`/api/hr/evaluations/${id}/manager-eval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responses, commentaire, recommandation }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations'] }); toast.success('Évaluation manager soumise'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; actionPlan?: string; trainingRecommendations?: string[]; recommandation?: string }) =>
      fetchJson(`/api/hr/evaluations/${id}/finalize`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/hr/evaluations'] }); toast.success('Évaluation finalisée'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    evaluations,
    loading: isLoading,
    submitSelfEval: submitSelfEvalMutation.mutateAsync,
    submitManagerEval: submitManagerEvalMutation.mutateAsync,
    finalizeEvaluation: finalizeMutation.mutateAsync,
  };
}

export function useEvaluationDetail(id: string | null) {
  return useQuery({
    queryKey: ['/api/hr/evaluations', id],
    queryFn: () => fetchJson<EvaluationDetail>(`/api/hr/evaluations/${id}`),
    enabled: !!id,
  });
}

export function useEvaluationComparison(id: string | null) {
  return useQuery({
    queryKey: ['/api/hr/evaluations', id, 'comparison'],
    queryFn: () => fetchJson<ComparisonData>(`/api/hr/evaluations/${id}/comparison`),
    enabled: !!id,
  });
}

export function useCampaignSummary(campaignId: string | null) {
  return useQuery({
    queryKey: ['/api/hr/evaluations/analytics/campaign-summary', campaignId],
    queryFn: () => fetchJson<CampaignSummary>(`/api/hr/evaluations/analytics/campaign-summary?campaignId=${campaignId}`),
    enabled: !!campaignId,
  });
}

export function useEmployeeEvalHistory(employeId: string | null) {
  return useQuery({
    queryKey: ['/api/hr/evaluations/analytics/history', employeId],
    queryFn: () => fetchJson<Array<{ evaluationId: string; campaignNom: string; campaignType: string; dateFin: string; finalScore: string | null; recommandation: string | null; statut: string }>>(`/api/hr/evaluations/analytics/history?employeId=${employeId}`),
    enabled: !!employeId,
  });
}
