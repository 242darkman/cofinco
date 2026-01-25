
import React, { Suspense } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card } from '../ui';

// Lazy load charts
const BalanceHistoryChart = React.lazy(() => import('../finance/accounting/BalanceHistoryChart'));
const PortfolioDistributionChart = React.lazy(() => import('../finance/accounting/PortfolioDistributionChart'));

interface AnalyticsGridProps {
  stats: any;
}

export default function AnalyticsGrid({ stats }: AnalyticsGridProps) {
  const { t } = useLanguage();

  const productSplit = stats?.charts?.productSplit || [];
  
  // Transform API data to match PortfolioDistributionChart format if needed
  // API returns: { name: "Crédit", value: 30, color: "#10b981" } which matches expectations
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
       {/* Area Chart - Growth */}
       <div className="lg:col-span-2 min-h-[250px]">
         <Suspense fallback={
           <Card variant="default" className="h-[250px] flex items-center justify-center bg-slate-900 border-slate-800">
             <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
           </Card>
         }>
           <BalanceHistoryChart height={250} />
         </Suspense>
       </div>

       {/* Donut Chart - Distribution */}
       <div className="min-h-[250px]">
         <Suspense fallback={
           <Card variant="default" className="h-[250px] flex items-center justify-center bg-slate-900 border-slate-800">
             <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
           </Card>
         }>
           <PortfolioDistributionChart 
             data={productSplit} 
             height={250}
           />
         </Suspense>
       </div>
    </div>
  );
}
