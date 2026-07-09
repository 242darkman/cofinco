import { useState, useEffect } from 'react';
import { usePushNotifications } from './usePushNotifications';
import { useLanguage } from '../contexts/LanguageContext';

export interface NotificationPreferences {
  id?: string;
  pushEnabled: boolean;
  paymentReminders: boolean;
  reminderDaysBefore: number;
  balanceAlerts: boolean;
  lowBalanceThreshold: string;
  creditAlerts: boolean;
  overdueAlerts: boolean;
  tontineAlerts: boolean;
  tontineContributionReminders: boolean;
  transactionAlerts: boolean;
  largeTransactionThreshold: string;
  securityAlerts: boolean;
  loginAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export const defaultPreferences: NotificationPreferences = {
  pushEnabled: true,
  paymentReminders: true,
  reminderDaysBefore: 3,
  balanceAlerts: true,
  lowBalanceThreshold: "10000",
  creditAlerts: true,
  overdueAlerts: true,
  tontineAlerts: true,
  tontineContributionReminders: true,
  transactionAlerts: true,
  largeTransactionThreshold: "100000",
  securityAlerts: true,
  loginAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00"
};

export function useNotificationSettings() {
  const { t } = useLanguage();
  const { isSubscribed, isSupported, isLoading: pushLoading, subscribe, unsubscribe, permission } = usePushNotifications();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/push/preferences', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/push/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences)
      });
      if (response.ok) {
        setMessage({ type: 'success', text: t('settings.preferences_saved') || 'Préférences enregistrées' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('settings.save_error') || 'Erreur lors de l\'enregistrement' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      setMessage({ type: 'success', text: t('notifications.subscribed') || 'Notifications activées' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleUnsubscribe = async () => {
    const success = await unsubscribe();
    if (success) {
      setMessage({ type: 'success', text: t('notifications.unsubscribed') || 'Notifications désactivées' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleInputChange = (key: keyof NotificationPreferences, value: string | number) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return {
    preferences,
    loading,
    saving,
    message,
    isSubscribed,
    isSupported,
    pushLoading,
    permission,
    savePreferences,
    handleSubscribe,
    handleUnsubscribe,
    handleToggle,
    handleInputChange,
    t
  };
}
