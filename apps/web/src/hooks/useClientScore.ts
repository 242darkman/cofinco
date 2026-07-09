import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useState } from 'react';
import {
  clientApi,
  type ClientScoreState,
  type ClientScoreEvent,
  type ScoreResult,
  type ScoreTrendPoint,
  type ScorePercentile,
  type ScoreHistoryResponse,
} from '../lib/api-client';
import { clientKeys } from '../lib/query-keys';

const SCORE_STALE_TIME = 60_000; // 1 min — WS invalidation handles real-time updates

/**
 * Hook for client scoring data with real-time WebSocket updates.
 *
 * Provides:
 * - `state`: Current score breakdown (payment, loyalty, engagement, compliance, global)
 * - `history`: Paginated event ledger (audit trail) with `historyTotal`
 * - `trend`: Monthly score evolution (points delta per month)
 * - `percentile`: Client ranking within their agency
 * - `recalculate()`: Trigger a full score recalculation
 * - `addBonus()`: Add manual bonus/malus (admin)
 *
 * Auto-refreshes when a `score-updated` WebSocket event arrives for this client.
 */
export function useClientScore(clientId: string | undefined) {
  const qc = useQueryClient();
  const [historyPage, setHistoryPage] = useState(0);
  const historyLimit = 50;

  // ── Score state (component breakdown) ──
  const stateQuery = useQuery({
    queryKey: clientKeys.scoreState(clientId!),
    queryFn: () => clientApi.getScoreState(clientId!),
    enabled: !!clientId,
    staleTime: SCORE_STALE_TIME,
  });

  // ── Score history (event ledger, paginated) ──
  const historyQuery = useQuery({
    queryKey: [...clientKeys.scoreHistory(clientId!), historyPage],
    queryFn: () => clientApi.getScoreHistory(clientId!, { limit: historyLimit, offset: historyPage * historyLimit }),
    enabled: !!clientId,
    staleTime: SCORE_STALE_TIME,
  });

  // ── Score trend (monthly evolution) ──
  const trendQuery = useQuery({
    queryKey: clientKeys.scoreTrend(clientId!),
    queryFn: () => clientApi.getScoreTrend(clientId!),
    enabled: !!clientId,
    staleTime: SCORE_STALE_TIME,
  });

  // ── Score percentile (ranking within agency) ──
  const percentileQuery = useQuery({
    queryKey: clientKeys.scorePercentile(clientId!),
    queryFn: () => clientApi.getScorePercentile(clientId!),
    enabled: !!clientId,
    staleTime: SCORE_STALE_TIME,
  });

  // ── Recalculate mutation ──
  const recalculateMutation = useMutation({
    mutationFn: (reason?: string) => clientApi.recalculateScore(clientId!, reason),
    onSuccess: () => invalidateAll(),
  });

  // ── Manual bonus/malus mutation ──
  const bonusMutation = useMutation({
    mutationFn: (data: { points: number; description: string }) =>
      clientApi.addScoreBonus(clientId!, data),
    onSuccess: () => invalidateAll(),
  });

  function invalidateAll() {
    if (!clientId) return;
    qc.invalidateQueries({ queryKey: clientKeys.scoreState(clientId) });
    qc.invalidateQueries({ queryKey: clientKeys.scoreHistory(clientId) });
    qc.invalidateQueries({ queryKey: clientKeys.scoreTrend(clientId) });
    qc.invalidateQueries({ queryKey: clientKeys.scorePercentile(clientId) });
  }

  // ── WebSocket listener: auto-refresh on score-updated ──
  const handleScoreUpdated = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.clientId === clientId) {
        invalidateAll();
      }
    },
    [clientId, qc],
  );

  useEffect(() => {
    if (!clientId) return;
    window.addEventListener('score-updated', handleScoreUpdated);
    return () => window.removeEventListener('score-updated', handleScoreUpdated);
  }, [clientId, handleScoreUpdated]);

  const historyData = historyQuery.data as ScoreHistoryResponse | undefined;

  return {
    // Data
    state: stateQuery.data as ClientScoreState | undefined,
    history: (historyData?.rows || []) as ClientScoreEvent[],
    historyTotal: historyData?.total ?? 0,
    trend: (trendQuery.data || []) as ScoreTrendPoint[],
    percentile: percentileQuery.data as ScorePercentile | undefined,

    // Loading
    stateLoading: stateQuery.isLoading,
    historyLoading: historyQuery.isLoading,
    trendLoading: trendQuery.isLoading,
    percentileLoading: percentileQuery.isLoading,

    // Errors
    stateError: stateQuery.error,
    historyError: historyQuery.error,
    trendError: trendQuery.error,
    percentileError: percentileQuery.error,

    // Pagination
    historyPage,
    setHistoryPage,
    historyHasMore: historyData ? (historyPage + 1) * historyLimit < historyData.total : false,

    // Actions
    recalculate: recalculateMutation.mutateAsync as (reason?: string) => Promise<ScoreResult>,
    recalculating: recalculateMutation.isPending,
    addBonus: bonusMutation.mutateAsync as (data: { points: number; description: string }) => Promise<any>,
    addingBonus: bonusMutation.isPending,

    // Refetch
    refetchState: stateQuery.refetch,
    refetchHistory: historyQuery.refetch,
  };
}
