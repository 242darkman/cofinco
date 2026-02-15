import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';
import { useAgentStore } from '@/stores/agent-store';

// ─── Agent Profile ─────────────────────────────────────────────────────────

export function useAgentProfile() {
  return useQuery({
    queryKey: queryKeys.agent.me,
    queryFn: () => api.get<{ data: any }>('/api/agents-terrain/me').then((r) => r.data),
    staleTime: 60_000,
  });
}

// ─── Objectifs ──────────────────────────────────────────────────────────────

export function useObjectifs(agentId: string | null, periode?: string) {
  return useQuery({
    queryKey: queryKeys.agent.objectifs(agentId || '', periode),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (agentId) qs.set('agentId', agentId);
      if (periode) qs.set('periode', periode);
      return api.get<any[]>(`/api/agent-objectifs?${qs}`);
    },
    enabled: !!agentId,
  });
}

// ─── Commissions ────────────────────────────────────────────────────────────

export function useCommissions(agentId: string | null, periode?: string) {
  return useQuery({
    queryKey: queryKeys.agent.commissions(agentId || '', periode),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (agentId) qs.set('agent_id', agentId);
      if (periode) qs.set('periode', periode);
      return api.get<any[]>(`/api/agent-commissions?${qs}`);
    },
    enabled: !!agentId,
  });
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export function useLeaderboard(period: string = 'mois') {
  return useQuery({
    queryKey: queryKeys.agent.leaderboard(period),
    queryFn: () =>
      api.get<{ data: any[]; total: number; totalPages: number }>(
        `/api/agent-classement?period=${period}&pageSize=20`
      ),
    staleTime: 60_000,
  });
}

// ─── Planning ───────────────────────────────────────────────────────────────

export function usePlanning(agentId: string | null, date?: string) {
  return useQuery({
    queryKey: queryKeys.agent.planning(agentId || '', date),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (agentId) qs.set('agentId', agentId);
      if (date) qs.set('date', date);
      return api.get<any[]>(`/api/agent-planning?${qs}`);
    },
    enabled: !!agentId,
  });
}

export function useCreatePlanning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/api/agent-planning', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'planning'] }),
  });
}

export function useUpdatePlanning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/agent-planning/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'planning'] }),
  });
}

// ─── Incidents ──────────────────────────────────────────────────────────────

export function useIncidents(agentId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.incidents(agentId || ''),
    queryFn: () => api.get<any[]>(`/api/agent-incidents?agentId=${agentId}`),
    enabled: !!agentId,
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/api/agent-incidents', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'incidents'] }),
  });
}

export function useEscalateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/agent-incidents/${id}/escalate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'incidents'] }),
  });
}

// ─── Formations ─────────────────────────────────────────────────────────────

export function useFormationsCatalog() {
  return useQuery({
    queryKey: queryKeys.agent.formations,
    queryFn: () => api.get<any[]>('/api/agent-formations'),
  });
}

export function useFormationsSuivi(agentId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.formationsSuivi(agentId || ''),
    queryFn: () => api.get<any[]>(`/api/agent-formations-suivi?agent_id=${agentId}`),
    enabled: !!agentId,
  });
}

export function useEnrollFormation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { agent_id: string; formation_id: number }) =>
      api.post('/api/agent-formations-suivi', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'formations'] }),
  });
}

export function useUpdateFormationProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; progression?: number; statut?: string }) =>
      api.patch(`/api/agent-formations-suivi/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'formations'] }),
  });
}

// ─── Materiel ───────────────────────────────────────────────────────────────

export function useMateriel(agentId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.materiel(agentId || ''),
    queryFn: () => api.get<any[]>(`/api/agent-materiel?agent_id=${agentId}&actif=true`),
    enabled: !!agentId,
  });
}

export function useReportMaterielProblem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.patch(`/api/agent-materiel/${id}`, { etat: 'Mauvais', notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'materiel'] }),
  });
}

// ─── Rapports ───────────────────────────────────────────────────────────────

export function useRapports(agentId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.rapports(agentId || ''),
    queryFn: () => api.get<any[]>(`/api/agent-rapports?agent_id=${agentId}`),
    enabled: !!agentId,
  });
}

export function useCreateRapport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/api/agent-rapports', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'rapports'] }),
  });
}

// ─── Enquetes Credit ────────────────────────────────────────────────────────

export function useEnquetesCredit() {
  return useQuery({
    queryKey: queryKeys.agent.enquetes,
    queryFn: () => api.get<any[]>('/api/enquetes-credit/mes-enquetes'),
  });
}

export function useStartEnquete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/enquetes-credit/${id}/demarrer`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agent.enquetes }),
  });
}

export function useSubmitEnquete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/api/enquetes-credit/${id}/soumettre`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agent.enquetes }),
  });
}

// ─── Prospections ───────────────────────────────────────────────────────────

export function useProspections(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: queryKeys.agent.prospections(params),
    queryFn: () => {
      const qs = new URLSearchParams(params);
      return api.get<{ data: any[]; total: number; totalPages: number }>(
        `/api/prospections?${qs}`
      );
    },
  });
}

export function useProspection(id: string) {
  return useQuery({
    queryKey: queryKeys.agent.prospection(id),
    queryFn: () => api.get<any>(`/api/prospections/${id}`),
    enabled: !!id,
  });
}

export function useCreateProspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/api/prospections', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'prospections'] }),
  });
}

export function useUpdateProspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/api/prospections/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'prospections'] });
      qc.invalidateQueries({ queryKey: ['agent', 'prospection'] });
    },
  });
}

export function useProspectionStats(agentId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.prospectionStats(agentId || ''),
    queryFn: () => api.get<any>(`/api/agents/${agentId}/prospection-stats`),
    enabled: !!agentId,
  });
}

// ─── Communications ─────────────────────────────────────────────────────────

export function useCommunications(agentId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.communications(agentId || ''),
    queryFn: () => api.get<any[]>(`/api/agent-communications?agent_id=${agentId}`),
    enabled: !!agentId,
  });
}

// ─── Caisses (for settlement destination) ───────────────────────────────────

export function useCaisses(agenceId: string | null) {
  return useQuery({
    queryKey: ['caisses', agenceId],
    queryFn: () => api.get<any[]>(`/api/caisses/status?agenceId=${agenceId}`),
    enabled: !!agenceId,
  });
}

// ─── Reference data (villes, arrondissements, marches) ──────────────────────

export function useVilles() {
  return useQuery({
    queryKey: ['ref', 'villes'],
    queryFn: () => api.get<any[]>('/api/villes?actif=true'),
    staleTime: 5 * 60_000,
  });
}

export function useArrondissements(villeId?: string) {
  return useQuery({
    queryKey: ['ref', 'arrondissements', villeId],
    queryFn: () => api.get<any[]>(`/api/arrondissements?actif=true${villeId ? `&villeId=${villeId}` : ''}`),
    enabled: !villeId || !!villeId,
    staleTime: 5 * 60_000,
  });
}

export function useMarches(arrondissementId?: string) {
  return useQuery({
    queryKey: ['ref', 'marches', arrondissementId],
    queryFn: () => api.get<any[]>(`/api/marches?actif=true&arrondissementId=${arrondissementId}`),
    enabled: !!arrondissementId,
    staleTime: 5 * 60_000,
  });
}
