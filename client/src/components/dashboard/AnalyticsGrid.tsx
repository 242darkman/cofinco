
import React, { Suspense } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card, Button } from '../ui';
import ErrorBoundary from '../shared/ErrorBoundary';
import type { DashboardStats } from '../../hooks/dashboard/useDashboardStats';

// Lazy load charts
const BalanceHistoryChart = React.lazy(() => import('../finance/accounting/BalanceHistoryChart'));
const PortfolioDistributionChart = React.lazy(() => import('../finance/accounting/PortfolioDistributionChart'));

interface AnalyticsGridProps {
  stats: DashboardStats | null;
  chartHeight?: number;
}

function ChartErrorFallback() {
  const { t } = useLanguage();
  return (
    <Card variant="default" className="h-full flex flex-col items-center justify-center bg-surface-base border-edge gap-2 p-4">
      <AlertCircle size={24} className="text-status-danger" />
      <p className="text-xs text-content-muted">{t('erreurChargementGraphiques')}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => window.location.reload()}
        className="text-xs h-7 px-3"
      >
        <RefreshCw size={12} className="mr-1" />
        {t('recharger')}
      </Button>
    </Card>
  );
}

export default function AnalyticsGrid({ stats, chartHeight = 250 }: AnalyticsGridProps) {
  const { t } = useLanguage();

  const productSplit = stats?.charts?.productSplit || [];

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-3 gap-3"
      role="region"
      aria-label={t('graphiquesAnalytiques') || 'Graphiques analytiques'}
    >
       {/* Area Chart - Growth */}
       <figure
         className="lg:col-span-2"
         style={{ minHeight: chartHeight }}
         role="img"
         aria-label={t('graphiqueEvolutionSolde') || 'Graphique d\'évolution du solde'}
       >
         <ErrorBoundary fallback={<ChartErrorFallback />}>
           <Suspense fallback={
             <Card variant="default" className="flex items-center justify-center bg-surface-base border-edge" style={{ height: chartHeight }}>
               <div className="animate-spin w-8 h-8 border-2 border-status-success border-t-transparent rounded-full" aria-label={t('chargement')} />
             </Card>
           }>
             <BalanceHistoryChart height={chartHeight} />
           </Suspense>
         </ErrorBoundary>
       </figure>

       {/* Donut Chart - Distribution */}
       <figure
         style={{ minHeight: chartHeight }}
         role="img"
         aria-label={t('graphiqueRepartitionProduits') || 'Graphique de répartition des produits'}
       >
         <ErrorBoundary fallback={<ChartErrorFallback />}>
           <Suspense fallback={
             <Card variant="default" className="flex items-center justify-center bg-surface-base border-edge" style={{ height: chartHeight }}>
               <div className="animate-spin w-8 h-8 border-2 border-status-info border-t-transparent rounded-full" aria-label={t('chargement')} />
             </Card>
           }>
             <PortfolioDistributionChart
               data={productSplit}
               height={chartHeight}
             />
           </Suspense>
         </ErrorBoundary>
       </figure>
    </div>
  );
}
