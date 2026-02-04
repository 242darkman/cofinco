import React, { Suspense, lazy, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

// Skeleton placeholder for charts
export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div
      className="w-full flex items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-700 animate-pulse"
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-xs">Chargement du graphique...</span>
      </div>
    </div>
  );
}

// Higher-order component to lazy load any recharts component
export function withLazyChart<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  fallbackHeight = 250
): React.FC<P> {
  const LazyComponent = lazy(importFn);

  return function LazyChartWrapper(props: P) {
    return (
      <Suspense fallback={<ChartSkeleton height={fallbackHeight} />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Pre-built lazy wrappers for common chart components
// These will only load recharts when the component is actually rendered
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export const LazyAreaChart = lazy(() =>
  import('recharts').then(mod => ({ default: mod.AreaChart as unknown as AnyComponent }))
);

export const LazyBarChart = lazy(() =>
  import('recharts').then(mod => ({ default: mod.BarChart as unknown as AnyComponent }))
);

export const LazyLineChart = lazy(() =>
  import('recharts').then(mod => ({ default: mod.LineChart as unknown as AnyComponent }))
);

export const LazyPieChart = lazy(() =>
  import('recharts').then(mod => ({ default: mod.PieChart as unknown as AnyComponent }))
);

export const LazyResponsiveContainer = lazy(() =>
  import('recharts').then(mod => ({ default: mod.ResponsiveContainer as unknown as AnyComponent }))
);

// Wrapper component that provides Suspense boundary
export function ChartContainer({
  children,
  height = 250,
  className = ''
}: {
  children: React.ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <div className={className} style={{ height }}>
        {children}
      </div>
    </Suspense>
  );
}
