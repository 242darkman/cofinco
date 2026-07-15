import { useQuery } from '@tanstack/react-query';

/**
 * Informations légales de la société (reçus, factures, documents officiels).
 * Données d'exploitation, distinctes de l'identité visuelle du tenant.
 */
export interface CompanyInfo {
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
}

const EMPTY_COMPANY_INFO: CompanyInfo = {
  adresse: null,
  telephone: null,
  email: null,
  rccm: null,
  nif: null,
};

export const companyInfoQueryKey = ['/api/company-info'] as const;

export function useCompanyInfo(): CompanyInfo {
  const { data } = useQuery<CompanyInfo>({
    queryKey: companyInfoQueryKey,
    queryFn: async () => {
      const res = await fetch('/api/company-info');
      if (!res.ok) throw new Error('Failed to fetch company info');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    initialData: EMPTY_COMPANY_INFO,
  });
  return data ?? EMPTY_COMPANY_INFO;
}
