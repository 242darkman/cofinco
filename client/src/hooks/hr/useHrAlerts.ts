import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface HrAlert {
  id: string;
  alertType: string;
  employeId: string;
  employeNom: string;
  eventDate: string;
  eventLabel: string;
  metadata: Record<string, any> | null;
  status: string;
  agenceId: string | null;
  createdAt: string;
}

export interface AlertStats {
  urgent: number;  // < 7 jours
  warning: number; // < 15 jours
  info: number;    // < 30 jours
  total: number;
}

export interface AlertConfig {
  id: string;
  alertType: string;
  enabled: boolean;
  reminderDays: number[];
  channels: string[];
  description: string | null;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

export function useHrAlerts() {
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['/api/hr/alerts'],
    queryFn: () => fetchJson<HrAlert[]>('/api/hr/alerts'),
  });

  const { data: stats } = useQuery({
    queryKey: ['/api/hr/alerts/stats'],
    queryFn: () => fetchJson<AlertStats>('/api/hr/alerts/stats'),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/hr/alerts/${id}/acknowledge`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/alerts'] });
      toast.success('Alerte prise en compte');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismissMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetchJson(`/api/hr/alerts/${id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/alerts'] });
      toast.success('Alerte écartée');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    alerts,
    stats: stats || { urgent: 0, warning: 0, info: 0, total: 0 },
    loading: isLoading,
    acknowledge: acknowledgeMutation.mutateAsync,
    dismiss: dismissMutation.mutateAsync,
  };
}

export function useAlertConfig() {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['/api/hr/alerts/config'],
    queryFn: () => fetchJson<AlertConfig[]>('/api/hr/alerts/config'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ type, ...data }: { type: string } & Partial<AlertConfig>) =>
      fetchJson(`/api/hr/alerts/config/${type}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/alerts/config'] });
      toast.success('Configuration mise à jour');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    configs,
    loading: isLoading,
    updateConfig: updateMutation.mutateAsync,
  };
}
