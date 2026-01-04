import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface AnimatedBalanceProps {
  value: number;
  previousValue?: number;
  currency?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTrend?: boolean;
  colorScheme?: 'default' | 'success' | 'warning' | 'danger';
}

export default function AnimatedBalance({
  value,
  previousValue = 0,
  currency = 'FCFA',
  label,
  size = 'lg',
  showTrend = true,
  colorScheme = 'default'
}: AnimatedBalanceProps) {
  const [displayValue, setDisplayValue] = useState<number>(previousValue);
  const animationRef = useRef<number | undefined>(undefined);

  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl'
  };

  const colorClasses = {
    default: 'text-white',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400'
  };

  useEffect(() => {
    const startValue = displayValue;
    const endValue = value;
    const duration = 1500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = startValue + (endValue - startValue) * easeOutQuart;
      
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(num));
  };

  const trend = previousValue !== undefined ? value - previousValue : 0;
  const trendPercent = previousValue && previousValue !== 0 
    ? ((value - previousValue) / previousValue) * 100 
    : 0;

  const getTrendIcon = () => {
    if (trend > 0) return <TrendingUp size={20} className="text-emerald-400" />;
    if (trend < 0) return <TrendingDown size={20} className="text-red-400" />;
    return <Minus size={20} className="text-slate-400" />;
  };

  const getTrendColor = () => {
    if (trend > 0) return 'text-emerald-400';
    if (trend < 0) return 'text-red-400';
    return 'text-slate-400';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative"
      data-testid="animated-balance"
    >
      {label && (
        <p className="text-slate-400 text-sm mb-1">{label}</p>
      )}
      
      <div className="flex items-baseline gap-2">
        <motion.span
          className={`font-bold ${sizeClasses[size]} ${colorClasses[colorScheme]}`}
          data-testid="text-balance-value"
        >
          {formatNumber(displayValue)}
        </motion.span>
        <span className={`${size === 'xl' ? 'text-2xl' : size === 'lg' ? 'text-xl' : 'text-base'} text-slate-400 font-medium`}>
          {currency}
        </span>
      </div>

      {showTrend && previousValue !== undefined && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className={`flex items-center gap-1 mt-2 ${getTrendColor()}`}
          data-testid="balance-trend"
        >
          {getTrendIcon()}
          <span className="text-sm font-medium">
            {trend >= 0 ? '+' : ''}{formatNumber(trend)} {currency}
          </span>
          <span className="text-xs text-slate-500 ml-1">
            ({trendPercent >= 0 ? '+' : ''}{trendPercent.toFixed(1)}%)
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
