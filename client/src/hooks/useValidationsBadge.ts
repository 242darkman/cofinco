/**
 * useValidationsBadge - Combined badge for the Validations Center
 *
 * Aggregates operations badge (collectes) + closure badge into a single total.
 */

import { useOperationsBadge } from './useOperationsBadge';
import { useClosureBadge } from './useClosureBadge';

export function useValidationsBadge() {
  const { pendingCount: operationsCount, isLoading: opsLoading, refresh: refreshOps } = useOperationsBadge();
  const { pendingCount: closuresCount, isLoading: closureLoading, refresh: refreshClosures } = useClosureBadge();

  return {
    totalCount: operationsCount + closuresCount,
    operationsCount,
    closuresCount,
    isLoading: opsLoading || closureLoading,
    refresh: () => {
      refreshOps();
      refreshClosures();
    },
  };
}

export default useValidationsBadge;
