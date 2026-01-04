import { useState, useMemo } from 'react';

export interface PaginationConfig {
  totalItems: number;
  itemsPerPage?: number;
  initialPage?: number;
}

export function usePagination({
  totalItems,
  itemsPerPage = 12,
  initialPage = 1
}: PaginationConfig) {
  const [currentPage, setCurrentPage] = useState(initialPage);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return { startIndex, endIndex };
  }, [currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    const pageNumber = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(pageNumber);
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const previousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const canGoNext = currentPage < totalPages;
  const canGoPrevious = currentPage > 1;

  const reset = () => setCurrentPage(1);

  // Helper pour paginer un tableau
  const paginateArray = <T,>(array: T[]): T[] => {
    return array.slice(paginatedData.startIndex, paginatedData.endIndex);
  };

  return {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex: paginatedData.startIndex,
    endIndex: paginatedData.endIndex,
    canGoNext,
    canGoPrevious,
    goToPage,
    nextPage,
    previousPage,
    reset,
    paginateArray
  };
}
