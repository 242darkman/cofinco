import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wallet, AlertCircle, CheckCircle2, Link2 } from 'lucide-react';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';
import { currencyCode } from '@shared/config/currency';

interface ProviderBalance {
  provider: string;
  code: string;
  balance: string | null;
  currency: string | null;
  accountStatus: string | null;
  shared?: boolean;
  error: string | null;
  checkedAt: string;
}

const PROVIDER_STYLES: Record<string, { bg: string; border: string; text: string; logo: string }> = {
  MTN: { bg: 'bg-status-warning-bg', border: 'border-status-warning/30', text: 'text-status-warning', logo: mtnLogo },
  AIRTEL: { bg: 'bg-status-danger-bg', border: 'border-status-danger/30', text: 'text-status-danger', logo: airtelLogo },
};

export default function ProviderBalanceWidget() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<{ providers: ProviderBalance[] }>({
    queryKey: ['provider-balances'],
    queryFn: async () => {
      const res = await fetch('/api/payments/provider-balances');
      if (!res.ok) throw new Error('Erreur chargement soldes');
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const providers = data?.providers || [];
  const isSharedWallet = providers.some(p => p.shared);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-content-primary flex items-center gap-1.5">
          <Wallet size={13} className="text-accent" />
          Soldes Providers
          {isSharedWallet && (
            <span className="text-[9px] font-normal text-content-muted flex items-center gap-0.5" title="pawaPay utilise un wallet partagé pour le Congo">
              <Link2 size={9} />
              partagé
            </span>
          )}
        </h4>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-1 text-content-muted hover:text-content-primary rounded transition-colors disabled:opacity-50"
          title="Actualiser"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && providers.length === 0 ? (
        <div className="flex items-center justify-center py-4 text-content-muted text-xs">
          <RefreshCw className="animate-spin mr-2" size={12} />
          Chargement...
        </div>
      ) : isError ? (
        <div className="text-center py-3 text-status-danger text-xs flex items-center justify-center gap-1">
          <AlertCircle size={12} />
          Erreur de connexion
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-3 text-content-muted text-xs">
          Aucun provider configuré
        </div>
      ) : (
        <div className="space-y-1.5">
          {providers.map((p) => {
            const style = PROVIDER_STYLES[p.code] || { bg: 'bg-surface-subtle/30', border: 'border-edge-strong/30', text: 'text-content-muted', logo: '' };
            return (
              <div
                key={p.code}
                className={`p-2.5 rounded-lg border ${style.bg} ${style.border}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {style.logo ? (
                      <img src={style.logo} alt={p.code} className="h-5 w-auto object-contain" />
                    ) : (
                      <span className={`font-bold text-xs ${style.text}`}>{p.code}</span>
                    )}
                    {p.accountStatus === 'ACTIVE' && (
                      <CheckCircle2 size={11} className="text-status-success" />
                    )}
                  </div>
                  {p.error ? (
                    <span className="text-[10px] text-status-danger truncate max-w-[120px]" title={p.error}>
                      {p.error.length > 20 ? p.error.slice(0, 20) + '...' : p.error}
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-sm text-content-primary">
                      {p.balance ? parseFloat(p.balance).toLocaleString('fr-FR') : '---'}
                      <span className="text-[10px] text-content-muted ml-1">{p.currency || currencyCode()}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dataUpdatedAt > 0 && (
        <p className="text-[9px] text-content-muted text-right">
          Maj: {new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}
        </p>
      )}
    </div>
  );
}
