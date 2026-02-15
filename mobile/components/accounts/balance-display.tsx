import { View, Text } from 'react-native';
import { formatMoney } from '@shared/types/mobile';

interface BalanceDisplayProps {
  amount: number | string | null | undefined;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
}

export function BalanceDisplay({
  amount,
  label,
  size = 'md',
  showSign = false,
}: BalanceDisplayProps) {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0'));
  const isNegative = num < 0;

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  const colorClass = showSign
    ? isNegative
      ? 'text-danger'
      : 'text-success'
    : 'text-text-primary';

  return (
    <View>
      {label && (
        <Text className="text-text-muted text-xs mb-0.5">{label}</Text>
      )}
      <Text className={`${colorClass} ${sizeClasses[size]} font-bold`}>
        {showSign && num > 0 ? '+' : ''}
        {formatMoney(amount)}
      </Text>
    </View>
  );
}
