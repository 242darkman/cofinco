import { useQuery } from '@tanstack/react-query';

type SecureDocumentResult = {
  url: string;
};

export function useSecureDocument(documentId?: string | null) {
  const query = useQuery({
    queryKey: ['secure-document', documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<SecureDocumentResult> => {
      const encodedId = encodeURIComponent(documentId as string);
      const response = await fetch(`/api/storage/documents/${encodedId}/view`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const error = new Error('Failed to load secure document URL');
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      if (!data?.url) {
        throw new Error('Missing signed URL');
      }
      return { url: data.url as string };
    },
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as any)?.status;
      if (status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });

  return {
    url: query.data?.url,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refresh: query.refetch,
  };
}
