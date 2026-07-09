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

export interface Project {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  client: string | null;
  responsableId: string | null;
  agenceId: string | null;
  budgetHeures: number | null;
  budgetMontant: number | null;
  dateDebut: string | null;
  dateFin: string | null;
  statut: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projetId: string;
  employeId: string;
  role: string;
  dateAjout: string | null;
  employeNom?: string;
  employeMatricule?: string;
}

export interface ProjectDetail extends Project {
  membres: ProjectMember[];
}

export interface Timesheet {
  id: string;
  employeId: string;
  employeNom: string;
  semaine: string;
  dateDebut: string;
  dateFin: string;
  totalHeures: string;
  statut: string;
  soumisAt: string | null;
  approuvePar: string | null;
  approuveAt: string | null;
  rejeteMotif: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  feuilleTempsId: string;
  projetId: string;
  date: string;
  heures: string;
  description: string | null;
  tauxHoraireSnapshot: number | null;
  coutCalcule: number | null;
  projetNom?: string;
  projetCode?: string;
}

export interface TimesheetDetail extends Timesheet {
  entries: TimeEntry[];
}

export interface CostSummary {
  totalHeures: number;
  totalCout: number;
  nbEntries: number;
  byEmployee: {
    employeId: string;
    employeNom: string;
    totalHeures: number;
    totalCout: number;
  }[];
}

export interface TimeAllocation {
  byProject: {
    projetId: string;
    projetNom: string;
    projetCode: string;
    totalHeures: number;
    totalCout: number;
  }[];
  totalHeures: number;
}

// ===================== PROJECTS =====================

export function useProjects(filter?: { statut?: string; agenceId?: string }) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams();
  if (filter?.statut) params.set('statut', filter.statut);
  if (filter?.agenceId) params.set('agenceId', filter.agenceId);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/hr/projects', filter],
    queryFn: () => fetchJson<Project[]>(`/api/hr/projects${qs}`),
  });

  const createProject = useMutation({
    mutationFn: (data: Partial<Project>) =>
      fetchJson<Project>('/api/hr/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/projects'] });
      toast.success('Projet créé');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateProject = useMutation({
    mutationFn: ({ id, ...data }: Partial<Project> & { id: string }) =>
      fetchJson<Project>(`/api/hr/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/projects'] });
      toast.success('Projet modifié');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) =>
      fetchJson<Project>(`/api/hr/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/projects'] });
      toast.success('Projet annulé');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    projects, isLoading,
    createProject: createProject.mutateAsync,
    isCreating: createProject.isPending,
    updateProject: updateProject.mutateAsync,
    deleteProject: deleteProject.mutateAsync,
  };
}

export function useProject(id: string | null) {
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ['/api/hr/projects', id],
    queryFn: () => fetchJson<ProjectDetail>(`/api/hr/projects/${id}`),
    enabled: !!id,
  });

  const addMember = useMutation({
    mutationFn: (data: { employeId: string; role?: string }) =>
      fetchJson<ProjectMember>(`/api/hr/projects/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/projects', id] });
      toast.success('Membre ajouté');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMember = useMutation({
    mutationFn: (employeId: string) =>
      fetchJson<any>(`/api/hr/projects/${id}/members/${employeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/projects', id] });
      toast.success('Membre retiré');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    project, isLoading,
    addMember: addMember.mutateAsync,
    removeMember: removeMember.mutateAsync,
  };
}

// ===================== TIMESHEETS =====================

export function useTimesheets(filter?: { employeId?: string; statut?: string; semaine?: string }) {
  const params = new URLSearchParams();
  if (filter?.employeId) params.set('employeId', filter.employeId);
  if (filter?.statut) params.set('statut', filter.statut);
  if (filter?.semaine) params.set('semaine', filter.semaine);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({
    queryKey: ['/api/hr/timesheets', filter],
    queryFn: () => fetchJson<Timesheet[]>(`/api/hr/timesheets${qs}`),
  });

  return { timesheets, isLoading };
}

export function useTimesheet(id: string | null) {
  const queryClient = useQueryClient();

  const { data: timesheet, isLoading } = useQuery<TimesheetDetail>({
    queryKey: ['/api/hr/timesheets', id],
    queryFn: () => fetchJson<TimesheetDetail>(`/api/hr/timesheets/${id}`),
    enabled: !!id,
  });

  const upsertEntry = useMutation({
    mutationFn: (data: { projetId: string; date: string; heures: string; description?: string }) =>
      fetchJson<TimeEntry>(`/api/hr/timesheets/${id}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/timesheets', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId: string) =>
      fetchJson<any>(`/api/hr/timesheets/${id}/entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/timesheets', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submit = useMutation({
    mutationFn: () =>
      fetchJson<Timesheet>(`/api/hr/timesheets/${id}/submit`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/timesheets'] });
      toast.success('Feuille de temps soumise');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approve = useMutation({
    mutationFn: () =>
      fetchJson<Timesheet>(`/api/hr/timesheets/${id}/approve`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/timesheets'] });
      toast.success('Feuille de temps approuvée');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reject = useMutation({
    mutationFn: (motif: string) =>
      fetchJson<Timesheet>(`/api/hr/timesheets/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/timesheets'] });
      toast.success('Feuille de temps rejetée');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    timesheet, isLoading,
    upsertEntry: upsertEntry.mutateAsync,
    deleteEntry: deleteEntry.mutateAsync,
    submit: submit.mutateAsync,
    isSubmitting: submit.isPending,
    approve: approve.mutateAsync,
    isApproving: approve.isPending,
    reject: reject.mutateAsync,
  };
}

export function useCreateTimesheet() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (data: { employeId: string; employeNom: string; semaine: string; dateDebut: string; dateFin: string }) =>
      fetchJson<Timesheet>('/api/hr/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/timesheets'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { createTimesheet: create.mutateAsync, isCreating: create.isPending };
}

// ===================== PRESENCE WEEK =====================

export interface PresenceDay {
  id: number;
  date: string;
  statut: string;
  heureArrivee: string | null;
  heureDepart: string | null;
  heuresTravaillees: number | null; // in minutes
  heuresSupplementaires: number | null; // in minutes
}

export function usePresenceWeek(employeId: string | null, dateDebut: string | null, dateFin: string | null) {
  const params = new URLSearchParams();
  if (employeId) params.set('employeId', employeId);
  if (dateDebut) params.set('dateDebut', dateDebut);
  if (dateFin) params.set('dateFin', dateFin);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const { data: presences = [], isLoading } = useQuery<PresenceDay[]>({
    queryKey: ['/api/hr/presence/week', employeId, dateDebut, dateFin],
    queryFn: () => fetchJson<PresenceDay[]>(`/api/hr/presence/week${qs}`),
    enabled: !!employeId && !!dateDebut && !!dateFin,
  });
  return { presences, isLoading };
}

// ===================== REPORTING =====================

export function useProjectCostSummary(projetId: string | null) {
  const { data: summary, isLoading } = useQuery<CostSummary>({
    queryKey: ['/api/hr/projects', projetId, 'cost-summary'],
    queryFn: () => fetchJson<CostSummary>(`/api/hr/projects/${projetId}/cost-summary`),
    enabled: !!projetId,
  });
  return { summary, isLoading };
}

export function useEmployeeTimeAllocation(employeId: string | null, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const { data: allocation, isLoading } = useQuery<TimeAllocation>({
    queryKey: ['/api/hr/time-allocation', employeId, from, to],
    queryFn: () => fetchJson<TimeAllocation>(`/api/hr/time-allocation/${employeId}${qs}`),
    enabled: !!employeId,
  });
  return { allocation, isLoading };
}
