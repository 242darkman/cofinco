import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useNotifications, useMarkNotificationRead, isUnread } from '@/hooks/use-notifications';
import type { AppNotification } from '@/hooks/use-notifications';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatRelativeDate } from '@/lib/format';

const PRIORITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  LOW: 'information-circle-outline',
  NORMAL: 'notifications-outline',
  HIGH: 'alert-circle-outline',
  CRITICAL: 'warning-outline',
};

function NotificationItem({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
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
      className={`flex-row items-start px-5 py-3.5 ${unread ? 'bg-accent/5' : ''} active:bg-bg-muted`}
      onPress={onPress}
    >
      <View className="w-9 h-9 rounded-full bg-bg-muted items-center justify-center mr-3 mt-0.5">
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-0.5">
          <Text
            className={`text-sm font-semibold ${unread ? 'text-text-primary' : 'text-text-secondary'}`}
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

export default function NotificationsScreen() {
  const { data, isLoading, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();

  const handlePress = (notification: AppNotification) => {
    if (isUnread(notification)) {
      markRead.mutate(notification.id);
    }
  };

  if (isLoading) {
    return <Loading fullScreen message="Chargement..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-text-primary text-2xl font-bold">Notifications</Text>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem notification={item} onPress={() => handlePress(item)} />
        )}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ItemSeparatorComponent={() => <View className="h-px bg-border-subtle mx-5" />}
        contentContainerClassName="pb-6"
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="notifications-off-outline" size={48} color="#94a3b8" />}
            title="Aucune notification"
            description="Vous n'avez pas de notification pour le moment."
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
