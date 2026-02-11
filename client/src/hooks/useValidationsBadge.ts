/**
 * useValidationsBadge - Combined badge for the Validations Center
 *
 * Aggregates operations badge (collectes) + closure badge + opening badge into a single total.
 */

import { useOperationsBadge } from './useOperationsBadge';
import { useClosureBadge } from './useClosureBadge';
import { useOpeningBadge } from './useOpeningBadge';

export function useValidationsBadge() {
  const { pendingCount: operationsCount, isLoading: opsLoading, refresh: refreshOps } = useOperationsBadge();
  const { pendingCount: closuresCount, isLoading: closureLoading, refresh: refreshClosures } = useClosureBadge();
  const { pendingCount: openingsCount, isLoading: openingLoading, refresh: refreshOpenings } = useOpeningBadge();

  return {
    totalCount: operationsCount + closuresCount + openingsCount,
    operationsCount,
    closuresCount,
    openingsCount,
    isLoading: opsLoading || closureLoading || openingLoading,
    refresh: () => {
      refreshOps();
      refreshClosures();
      refreshOpenings();
    },
  };
}

export default useValidationsBadge;
