import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ProviderBalance {
  provider: string;
  code: string;
  balance: string | null;
  currency: string | null;
  accountStatus: string | null;
  error: string | null;
  checkedAt: string;
}

const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  MTN: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  AIRTEL: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
};

export default function ProviderBalanceWidget() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<{ providers: ProviderBalance[] }>({
    queryKey: ['provider-balances'],
    queryFn: async () => {
      const res = await fetch('/api/payments/provider-balances');
      if (!res.ok) throw new Error('Erreur chargement soldes');
      return res.json();
    },
    refetchInterval: 60_000, // Auto-refresh every 60s
    staleTime: 30_000,
  });

  const providers = data?.providers || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Wallet size={13} className="text-cyan-400" />
          Soldes Providers
        </h4>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-1 text-slate-400 hover:text-white rounded transition-colors disabled:opacity-50"
          title="Actualiser"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && providers.length === 0 ? (
        <div className="flex items-center justify-center py-4 text-slate-500 text-xs">
          <RefreshCw className="animate-spin mr-2" size={12} />
          Chargement...
        </div>
      ) : isError ? (
        <div className="text-center py-3 text-red-400 text-xs flex items-center justify-center gap-1">
          <AlertCircle size={12} />
          Erreur de connexion
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-3 text-slate-500 text-xs">
          Aucun provider configuré
        </div>
      ) : (
        <div className="space-y-1.5">
          {providers.map((p) => {
            const colors = PROVIDER_COLORS[p.code] || { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-400' };
            return (
              <div
                key={p.code}
                className={`p-2.5 rounded-lg border ${colors.bg} ${colors.border}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-xs ${colors.text}`}>{p.code}</span>
                    {p.accountStatus === 'ACTIVE' && (
                      <CheckCircle2 size={11} className="text-emerald-400" />
                    )}
                  </div>
                  {p.error ? (
                    <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={p.error}>
                      {p.error.length > 20 ? p.error.slice(0, 20) + '...' : p.error}
                    </span>
                  ) : (
                    <span className="font-mono font-bold text-sm text-white">
                      {p.balance ? parseFloat(p.balance).toLocaleString('fr-FR') : '---'}
                      <span className="text-[10px] text-slate-400 ml-1">{p.currency || 'XAF'}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dataUpdatedAt > 0 && (
        <p className="text-[9px] text-slate-600 text-right">
          Maj: {new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}
        </p>
      )}
    </div>
  );
}
