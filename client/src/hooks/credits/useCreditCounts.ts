import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWebSocket } from "../useWebSocket";
import { creditKeys } from "../../lib/query-keys";

export interface CreditCounts {
  toProcess: number;
  investigation: number;
  approval: number;
  commission: number;
  reevaluation: number;
  archives: number;
}

export function useCreditCounts() {
  const { data, isLoading, error } = useQuery<CreditCounts>({
    queryKey: creditKeys.demandesCounts(),
    queryFn: async () => {
      const res = await fetch('/api/demandes-credit/counts');
      if (!res.ok) {
        throw new Error('Failed to fetch credit counts');
      }
      return res.json();
    },
    // Refresh every 30 seconds (optimized for slow connections - was 15s)
    refetchInterval: 30000,
    // Update immediately when user focuses the window
    refetchOnWindowFocus: true,
    // Data is considered fresh for 15s to reduce unnecessary requests
    staleTime: 0,
    refetchOnMount: true
  });


  const queryClient = useQueryClient();
  const { socket } = useWebSocket();

  useEffect(() => {
    if (!socket) return;
    
    const handleMessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            if (['CREDIT_UPDATE', 'DASHBOARD_UPDATE', 'DEMANDE_UPDATE', 'NOTIFICATION'].includes(data.type)) {
                // Invalidate the counts query to trigger an immediate refetch
                queryClient.invalidateQueries({ queryKey: creditKeys.demandesCounts() });
            }
        } catch (e) {
            console.error('WebSocket message parsing error', e);
        }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, queryClient]);

  return {
    counts: data || {
      toProcess: 0,
      investigation: 0,
      approval: 0,
      commission: 0,
      reevaluation: 0,
      archives: 0
    },
    isLoading,
    error
  };
}
