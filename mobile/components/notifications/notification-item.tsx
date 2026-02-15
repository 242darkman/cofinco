import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { formatRelativeDate } from '@/lib/format';
import type { AppNotification } from '@/hooks/use-notifications';
import { isUnread } from '@/hooks/use-notifications';

const PRIORITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  LOW: 'information-circle-outline',
  NORMAL: 'notifications-outline',
  HIGH: 'alert-circle-outline',
  CRITICAL: 'warning-outline',
};

interface NotificationItemProps {
  notification: AppNotification;
  onPress: () => void;
}

export function NotificationItem({ notification, onPress }: NotificationItemProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const icon = PRIORITY_ICON[notification.priorite] ?? 'notifications-outline';
  const iconColor =
    notification.priorite === 'CRITICAL'
      ? colors.danger
      : notification.priorite === 'HIGH'
        ? colors.warning
        : colors.accent;

  const unread = isUnread(notification);

  return (
    <Pressable
      className={`flex-row items-start px-4 py-3.5 ${unread ? 'bg-accent/5' : ''} active:bg-bg-muted rounded-lg`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={notification.titre}
    >
      <View className="w-9 h-9 rounded-full bg-bg-muted items-center justify-center mr-3 mt-0.5">
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-0.5">
          <Text
            className={`text-sm font-semibold flex-1 ${unread ? 'text-text-primary' : 'text-text-secondary'}`}
            numberOfLines={1}
          >
            {notification.titre}
          </Text>
          {unread && (
            <View className="w-2 h-2 rounded-full bg-accent ml-2" />
          )}
        </View>
        <Text className="text-text-muted text-xs" numberOfLines={2}>
          {notification.message}
        </Text>
        <Text className="text-text-muted text-xs mt-1 opacity-60">
          {formatRelativeDate(notification.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}
