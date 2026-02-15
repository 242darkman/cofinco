import { View, ActivityIndicator, Text } from 'react-native';

interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
}

export function Loading({ message, fullScreen = false }: LoadingProps) {
  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-bg-base">
        <ActivityIndicator size="large" className="mb-3" />
        {message && (
          <Text className="text-text-muted text-sm">{message}</Text>
        )}
      </View>
    );
  }

  return (
    <View className="items-center justify-center py-8">
      <ActivityIndicator size="small" className="mb-2" />
      {message && (
        <Text className="text-text-muted text-sm">{message}</Text>
      )}
    </View>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      {icon && <View className="mb-4">{icon}</View>}
      <Text className="text-text-primary text-lg font-semibold text-center mb-2">
        {title}
      </Text>
      {description && (
        <Text className="text-text-muted text-sm text-center mb-6">
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}
