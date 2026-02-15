import { router } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';

/**
 * Handle a notification tap and navigate to the appropriate screen.
 */
export function handleNotificationNavigation(response: NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, string> | undefined;
  if (!data?.screen) return;

  switch (data.screen) {
    case 'account-detail':
      if (data.accountId) router.push(`/account/${data.accountId}`);
      break;
    case 'transaction-detail':
      if (data.transactionId) router.push(`/transaction/${data.transactionId}`);
      break;
    case 'notifications':
      router.push('/(tabs)/notifications');
      break;
    case 'qr-scan':
      router.push('/qr/scan');
      break;
    default:
      router.push('/(tabs)');
  }
}
