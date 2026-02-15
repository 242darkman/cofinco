import { View, Text } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const variantClasses: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: 'bg-success-bg', text: 'text-success' },
  warning: { bg: 'bg-warning-bg', text: 'text-warning' },
  danger: { bg: 'bg-danger-bg', text: 'text-danger' },
  info: { bg: 'bg-info-bg', text: 'text-info' },
  neutral: { bg: 'bg-bg-muted', text: 'text-text-muted' },
};

export function Badge({ label, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const v = variantClasses[variant];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <View className={`${v.bg} rounded-full self-start`}>
      <Text className={`${v.text} font-medium ${sizeClass}`}>{label}</Text>
    </View>
  );
}
