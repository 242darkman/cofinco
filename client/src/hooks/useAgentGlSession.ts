/**
 * useAgentGlSession - Hook for agent GL session state
 *
 * Fetches the active GL session for an agent and subscribes to
 * real-time WebSocket updates via SESSION_AGENT_UPDATE CustomEvent.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { caisseAgentApi } from '../lib/api-client';
import { agentKeys } from '../lib/query-keys';

export function useAgentGlSession(agentId: string | undefined) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: agentKeys.sessionActive(agentId || ''),
    queryFn: () => caisseAgentApi.getActiveSession(agentId!),
    enabled: !!agentId,
    refetchInterval: 30_000,
    retry: 1,
  });

  // Listen for WebSocket SESSION_AGENT_UPDATE events (dispatched from WebSocketContext)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.agentId === agentId) {
        sessionQuery.refetch();
      }
    };
    window.addEventListener('session-agent-update', handler);
    return () => window.removeEventListener('session-agent-update', handler);
  }, [agentId, sessionQuery.refetch]);

  const invalidate = useCallback(() => {
    if (agentId) {
      queryClient.invalidateQueries({ queryKey: agentKeys.sessionActive(agentId) });
    }
    queryClient.invalidateQueries({ queryKey: agentKeys.sessions() });
  }, [agentId, queryClient]);

  const session = sessionQuery.data;
  const statut = session?.statut as string | undefined;

  return {
    session,
    isLoading: sessionQuery.isLoading,
    isError: sessionQuery.isError,
    refetch: sessionQuery.refetch,
    invalidate,
    // Computed state helpers
    hasActiveSession: statut === 'ACTIVE',
    isRequestingFunds: statut === 'REQUESTING_FUNDS',
    isClosing: statut === 'CLOSING',
    isClosed: statut === 'CLOSED',
    hasSession: !!session && statut !== 'CLOSED',
    statut,
  };
}
