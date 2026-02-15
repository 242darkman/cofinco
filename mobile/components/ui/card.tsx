import { View, Pressable, type ViewProps, type PressableProps } from 'react-native';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outlined';
}

export function Card({ variant = 'default', className = '', children, ...props }: CardProps) {
  const variantClass =
    variant === 'elevated'
      ? 'bg-card-bg border border-card-border shadow-md'
      : variant === 'outlined'
        ? 'bg-transparent border border-border-default'
        : 'bg-card-bg border border-card-border';

  return (
    <View className={`rounded-2xl p-4 ${variantClass} ${className}`} {...props}>
      {children}
    </View>
  );
}

interface PressableCardProps extends PressableProps {
  variant?: 'default' | 'elevated' | 'outlined';
}

export function PressableCard({
  variant = 'default',
  children,
  ...props
}: PressableCardProps) {
  const variantClass =
    variant === 'elevated'
      ? 'bg-card-bg border border-card-border shadow-md'
      : variant === 'outlined'
        ? 'bg-transparent border border-border-default'
        : 'bg-card-bg border border-card-border';

  return (
    <Pressable
      className={`rounded-2xl p-4 ${variantClass} active:opacity-90`}
      {...props}
    >
      {children}
    </Pressable>
  );
}
