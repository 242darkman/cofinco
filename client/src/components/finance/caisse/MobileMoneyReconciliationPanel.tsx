/**
 * Panel de réconciliation des soldes Mobile Money
 * Affiche la comparaison entre solde attendu et solde fournisseur
 */

import React from 'react';
import {
  Smartphone,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { motion } from 'framer-motion';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { formatMoney } from '../../../lib/format';

interface MMProviderReconciliation {
  provider: 'MTN' | 'AIRTEL';
  expectedBalance: number;
  providerBalance: number | null;
  ecart: number;
  status: 'MATCHED' | 'DISCREPANCY' | 'API_FAILED';
}

interface MobileMoneyReconciliationPanelProps {
  providers: MMProviderReconciliation[];
  hasDiscrepancy: boolean;
  onRefresh?: () => void;
  onOverride?: (provider: string, reason: string) => void;
  isRefreshing?: boolean;
  showActions?: boolean;
}

const providerLogos: Record<string, { bg: string; text: string; name: string }> = {
  MTN: { bg: 'bg-yellow-500/20', text: 'text-yellow-500', name: 'MTN MoMo' },
  AIRTEL: { bg: 'bg-red-500/20', text: 'text-red-500', name: 'Airtel Money' },
};

const statusConfig = {
  MATCHED: {
    icon: CheckCircle,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    label: 'Réconcilié',
  },
  DISCREPANCY: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    label: 'Écart détecté',
  },
  API_FAILED: {
    icon: XCircle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    label: 'API indisponible',
  },
};

export default function MobileMoneyReconciliationPanel({
  providers,
  hasDiscrepancy,
  onRefresh,
  onOverride,
  isRefreshing,
  showActions = true,
}: MobileMoneyReconciliationPanelProps) {
  if (!providers.length) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3 text-slate-400">
          <Smartphone className="w-5 h-5" />
          <span>Aucune transaction Mobile Money sur cette session</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* En-tête */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${
        hasDiscrepancy
          ? 'bg-amber-500/10 border-amber-500/20'
          : 'bg-emerald-500/10 border-emerald-500/20'
      }`}>
        <div className="flex items-center gap-2">
          <Smartphone className={`w-5 h-5 ${hasDiscrepancy ? 'text-amber-500' : 'text-emerald-500'}`} />
          <h3 className="font-semibold text-white">
            Réconciliation Mobile Money
          </h3>
          {hasDiscrepancy && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              Écart détecté
            </span>
          )}
        </div>
        {showActions && onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            isLoading={isRefreshing}
            icon={RefreshCw}
          >
            Actualiser
          </Button>
        )}
      </div>

      {/* Contenu */}
      <div className="p-4 space-y-4">
        {providers.map((provider, idx) => {
          const config = statusConfig[provider.status];
          const StatusIcon = config.icon;
          const providerInfo = providerLogos[provider.provider];
          const ecart = provider.ecart;
          const isNegative = ecart < 0;

          return (
            <motion.div
              key={provider.provider}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-4 rounded-xl border ${config.border} ${config.bg}`}
            >
              {/* En-tête du fournisseur */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${providerInfo.bg} flex items-center justify-center`}>
                    <span className={`font-bold text-sm ${providerInfo.text}`}>
                      {provider.provider}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-white">{providerInfo.name}</p>
                    <p className={`text-xs ${config.text}`}>{config.label}</p>
                  </div>
                </div>
                <StatusIcon className={`w-6 h-6 ${config.text}`} />
              </div>

              {/* Balances */}
              {provider.status !== 'API_FAILED' ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Solde attendu</p>
                    <p className="text-lg font-semibold text-white">
                      {formatMoney(provider.expectedBalance)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Solde fournisseur</p>
                    <p className="text-lg font-semibold text-white">
                      {provider.providerBalance !== null
                        ? formatMoney(provider.providerBalance)
                        : '-'}
                    </p>
                  </div>
                  <div className={`rounded-lg p-3 ${
                    provider.status === 'DISCREPANCY'
                      ? isNegative ? 'bg-red-500/10' : 'bg-amber-500/10'
                      : 'bg-emerald-500/10'
                  }`}>
                    <p className="text-xs text-slate-400 mb-1">Écart</p>
                    <div className="flex items-center gap-1">
                      {provider.status === 'DISCREPANCY' && (
                        isNegative
                          ? <TrendingDown className="w-4 h-4 text-red-400" />
                          : <TrendingUp className="w-4 h-4 text-amber-400" />
                      )}
                      <p className={`text-lg font-bold ${
                        provider.status === 'MATCHED'
                          ? 'text-emerald-400'
                          : isNegative ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        {provider.status === 'MATCHED'
                          ? '0'
                          : `${isNegative ? '' : '+'}${formatMoney(ecart)}`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-slate-300">
                    Impossible de récupérer le solde du fournisseur
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Vérifiez la connexion API ou réessayez plus tard
                  </p>
                </div>
              )}

              {/* Actions pour écart */}
              {showActions && provider.status === 'DISCREPANCY' && onOverride && (
                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Un écart a été détecté. Vous pouvez continuer avec justification.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const reason = window.prompt(
                        `Raison de l'écart ${provider.provider} (${formatMoney(Math.abs(ecart))} XOF):`
                      );
                      if (reason) {
                        onOverride(provider.provider, reason);
                      }
                    }}
                  >
                    Forcer
                  </Button>
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Résumé */}
        <div className={`p-3 rounded-lg ${
          hasDiscrepancy ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-emerald-500/5 border border-emerald-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {hasDiscrepancy ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-amber-300">
                  Des écarts ont été détectés. Ils seront enregistrés dans l'audit de clôture.
                </span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-emerald-300">
                  Tous les soldes Mobile Money sont réconciliés.
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
