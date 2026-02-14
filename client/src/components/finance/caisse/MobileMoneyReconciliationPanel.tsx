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
  MTN: { bg: 'bg-status-warning-bg', text: 'text-status-warning', name: 'MTN MoMo' },
  AIRTEL: { bg: 'bg-status-danger-bg', text: 'text-status-danger', name: 'Airtel Money' },
};

const statusConfig = {
  MATCHED: {
    icon: CheckCircle,
    bg: 'bg-status-success-bg',
    border: 'border-status-success/30',
    text: 'text-status-success',
    label: 'Réconcilié',
  },
  DISCREPANCY: {
    icon: AlertTriangle,
    bg: 'bg-status-warning-bg',
    border: 'border-status-warning/30',
    text: 'text-status-warning',
    label: 'Écart détecté',
  },
  API_FAILED: {
    icon: XCircle,
    bg: 'bg-status-danger-bg',
    border: 'border-status-danger/30',
    text: 'text-status-danger',
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
        <div className="flex items-center gap-3 text-content-muted">
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
          ? 'bg-status-warning-bg border-status-warning/20'
          : 'bg-status-success-bg border-status-success/20'
      }`}>
        <div className="flex items-center gap-2">
          <Smartphone className={`w-5 h-5 ${hasDiscrepancy ? 'text-status-warning' : 'text-status-success'}`} />
          <h3 className="font-semibold text-content-primary">
            Réconciliation Mobile Money
          </h3>
          {hasDiscrepancy && (
            <span className="px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning text-xs font-medium">
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
                    <p className="font-medium text-content-primary">{providerInfo.name}</p>
                    <p className={`text-xs ${config.text}`}>{config.label}</p>
                  </div>
                </div>
                <StatusIcon className={`w-6 h-6 ${config.text}`} />
              </div>

              {/* Balances */}
              {provider.status !== 'API_FAILED' ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface/50 rounded-lg p-3">
                    <p className="text-xs text-content-muted mb-1">Solde attendu</p>
                    <p className="text-lg font-semibold text-content-primary">
                      {formatMoney(provider.expectedBalance)}
                    </p>
                  </div>
                  <div className="bg-surface/50 rounded-lg p-3">
                    <p className="text-xs text-content-muted mb-1">Solde fournisseur</p>
                    <p className="text-lg font-semibold text-content-primary">
                      {provider.providerBalance !== null
                        ? formatMoney(provider.providerBalance)
                        : '-'}
                    </p>
                  </div>
                  <div className={`rounded-lg p-3 ${
                    provider.status === 'DISCREPANCY'
                      ? isNegative ? 'bg-status-danger-bg' : 'bg-status-warning-bg'
                      : 'bg-status-success-bg'
                  }`}>
                    <p className="text-xs text-content-muted mb-1">Écart</p>
                    <div className="flex items-center gap-1">
                      {provider.status === 'DISCREPANCY' && (
                        isNegative
                          ? <TrendingDown className="w-4 h-4 text-status-danger" />
                          : <TrendingUp className="w-4 h-4 text-status-warning" />
                      )}
                      <p className={`text-lg font-bold ${
                        provider.status === 'MATCHED'
                          ? 'text-status-success'
                          : isNegative ? 'text-status-danger' : 'text-status-warning'
                      }`}>
                        {provider.status === 'MATCHED'
                          ? '0'
                          : `${isNegative ? '' : '+'}${formatMoney(ecart)}`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-surface/50 rounded-lg p-4 text-center">
                  <XCircle className="w-8 h-8 text-status-danger mx-auto mb-2" />
                  <p className="text-content-secondary">
                    Impossible de récupérer le solde du fournisseur
                  </p>
                  <p className="text-xs text-content-muted mt-1">
                    Vérifiez la connexion API ou réessayez plus tard
                  </p>
                </div>
              )}

              {/* Actions pour écart */}
              {showActions && provider.status === 'DISCREPANCY' && onOverride && (
                <div className="mt-4 pt-3 border-t border-edge-subtle flex items-center justify-between">
                  <p className="text-xs text-content-muted">
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
          hasDiscrepancy ? 'bg-status-warning/5 border border-status-warning/20' : 'bg-status-success/5 border border-status-success/20'
        }`}>
          <div className="flex items-center gap-2">
            {hasDiscrepancy ? (
              <>
                <AlertTriangle className="w-4 h-4 text-status-warning" />
                <span className="text-sm text-status-warning">
                  Des écarts ont été détectés. Ils seront enregistrés dans l'audit de clôture.
                </span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-status-success" />
                <span className="text-sm text-status-success">
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
