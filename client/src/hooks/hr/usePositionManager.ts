import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../../lib/toast';

// ============================================================================
// TYPES
// ============================================================================

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobPosition {
  id: string;
  departmentId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  salaireMin: number | null;
  salaireMax: number | null;
  qualification: string | null;
  responsabilites: string | null;
  competencesRequises: string[] | null;
  effectifPrevu: number | null;
  createdAt: string;
  updatedAt: string;
  department: { id: string; code: string; name: string };
}

export interface VacancyStat {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  effectifPrevu: number;
  effectifActuel: number;
  vacants: number;
  qualification: string | null;
  salaireMin: number | null;
  salaireMax: number | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePositionManager() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    queryClient.invalidateQueries({ queryKey: ['job-positions'] });
    queryClient.invalidateQueries({ queryKey: ['vacancy-stats'] });
  };

  // ---- Departments ----
  const { data: departments = [], isLoading: loadingDepartments } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await fetch('/api/departments');
      if (!res.ok) throw new Error('Erreur lors du chargement des departements');
      return res.json();
    },
  });

  // ---- Job Positions ----
  const { data: positions = [], isLoading: loadingPositions } = useQuery<JobPosition[]>({
    queryKey: ['job-positions'],
    queryFn: async () => {
      const res = await fetch('/api/job-positions');
      if (!res.ok) throw new Error('Erreur lors du chargement des postes');
      return res.json();
    },
  });

  // ---- Vacancy Stats ----
  const { data: vacancyStats = [], isLoading: loadingVacancyStats } = useQuery<VacancyStat[]>({
    queryKey: ['vacancy-stats'],
    queryFn: async () => {
      const res = await fetch('/api/job-positions/vacancy-stats');
      if (!res.ok) throw new Error('Erreur lors du chargement des effectifs');
      return res.json();
    },
  });

  // ---- Department Mutations ----
  const createDepartmentMutation = useMutation({
    mutationFn: async (data: { code: string; name: string; description?: string }) => {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la creation');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Departement cree avec succes');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { code: string; name: string; description?: string } }) => {
      const res = await fetch(`/api/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la mise a jour');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Departement mis a jour');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la suppression');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Departement supprime');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // ---- Position Mutations ----
  const createPositionMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/job-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la creation du poste');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Poste cree avec succes');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/job-positions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la mise a jour du poste');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Poste mis a jour');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/job-positions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Erreur lors de la suppression du poste');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Poste supprime');
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    // Data
    departments,
    positions,
    vacancyStats,

    // Loading states
    loadingDepartments,
    loadingPositions,
    loadingVacancyStats,

    // Department actions
    createDepartment: createDepartmentMutation.mutateAsync,
    updateDepartment: updateDepartmentMutation.mutateAsync,
    deleteDepartment: deleteDepartmentMutation.mutateAsync,
    isCreatingDepartment: createDepartmentMutation.isPending,
    isUpdatingDepartment: updateDepartmentMutation.isPending,
    isDeletingDepartment: deleteDepartmentMutation.isPending,

    // Position actions
    createPosition: createPositionMutation.mutateAsync,
    updatePosition: updatePositionMutation.mutateAsync,
    deletePosition: deletePositionMutation.mutateAsync,
    isCreatingPosition: createPositionMutation.isPending,
    isUpdatingPosition: updatePositionMutation.isPending,
    isDeletingPosition: deletePositionMutation.isPending,
  };
}
