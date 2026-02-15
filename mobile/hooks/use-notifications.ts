import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';

/**
 * Notification as returned by GET /api/notifications-caisse.
 * All fields use snake_case matching the server response.
 */
export interface AppNotification {
  id: string;
  type_notification: string;
  titre: string;
  message: string;
  priorite: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  statut: 'Lue' | 'Non lue';
  created_at: string;
  compte_id?: string | null;
  client_id?: string | null;
  client_nom?: string | null;
  client_phone?: string | null;
  numero_compte?: string | null;
  type_compte?: string | null;
  mode_paiement?: string;
  montant?: number;
  reference_externe?: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

/**
 * Helper to check if a notification is unread.
 */
export function isUnread(n: AppNotification): boolean {
  return n.statut === 'Non lue';
}

/**
 * Fetch caisse notifications. Returns a flat array.
 */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: () => api.get<AppNotification[]>('/api/notifications-caisse'),
    staleTime: 15_000,
  });
}

/**
 * Count of unread notifications.
 */
export function useUnreadNotificationCount() {
  const { data } = useNotifications();
  return data?.filter(isUnread).length ?? 0;
}

/**
 * Mark a notification as read.
 * PATCH /api/notifications-caisse/:id  with body { statut: "READ" }
 */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/notifications-caisse/${id}`, { statut: 'READ' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
