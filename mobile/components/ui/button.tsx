import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<Variant, { container: string; text: string }> = {
  primary: {
    container: 'bg-accent active:bg-accent-hover',
    text: 'text-white font-semibold',
  },
  secondary: {
    container: 'bg-bg-muted active:bg-bg-subtle',
    text: 'text-text-primary font-medium',
  },
  danger: {
    container: 'bg-btn-danger active:bg-btn-danger-hover',
    text: 'text-white font-semibold',
  },
  ghost: {
    container: 'bg-transparent active:bg-bg-muted',
    text: 'text-accent font-medium',
  },
  outline: {
    container: 'bg-transparent border border-border-default active:bg-bg-muted',
    text: 'text-text-primary font-medium',
  },
};

const sizeClasses: Record<Size, { container: string; text: string }> = {
  sm: { container: 'px-3 py-2 rounded-lg', text: 'text-sm' },
  md: { container: 'px-4 py-3 rounded-xl', text: 'text-base' },
  lg: { container: 'px-6 py-4 rounded-xl', text: 'text-lg' },
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  onPress,
  ...props
}: ButtonProps) {
  const v = variantClasses[variant];
  const s = sizeClasses[size];
  const isDisabled = disabled || loading;

  const handlePress = (e: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <Pressable
      className={`flex-row items-center justify-center ${s.container} ${v.container} ${isDisabled ? 'opacity-50' : ''}`}
      disabled={isDisabled}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled }}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#ffffff' : undefined}
        />
      ) : (
        <>
          {icon}
          <Text className={`${s.text} ${v.text} ${icon ? 'ml-2' : ''}`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
