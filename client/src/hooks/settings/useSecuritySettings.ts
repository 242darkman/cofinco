import { useState, useEffect } from 'react';

export interface SecuritySetting {
  id: string;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_numbers: boolean;
  password_require_special: boolean;
  password_expiry_days: number;
  session_timeout_minutes: number;
  max_login_attempts: number;
  lockout_duration_minutes: number;
  two_factor_enabled: boolean;
  sms_otp_enabled: boolean;
  log_all_actions: boolean;
  api_rate_limit_per_minute: number;
}

export function useSecuritySettings() {
  const [settings, setSettings] = useState<SecuritySetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/security');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      if (Array.isArray(data)) {
        setSettings(data.length > 0 ? data[0] : null);
      } else {
        setSettings(data || null);
      }
    } catch (err) {
      console.error('Erreur fetch security settings:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (data: Partial<SecuritySetting>) => {
    setSaving(true);
    setError(null);
    try {
      const method = settings?.id ? 'PUT' : 'POST';
      const endpoint = settings?.id ? `/api/settings/security/${settings.id}` : '/api/settings/security';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Erreur sauvegarde');

      const updated = await response.json();
      setSettings(updated);
      return true;
    } catch (err) {
      console.error('Erreur save security:', err);
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof SecuritySetting, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  const toggleFeature = (field: keyof SecuritySetting) => {
    if (settings && typeof settings[field] === 'boolean') {
      const newValue = !settings[field];
      updateField(field, newValue);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    loading,
    error,
    saving,
    fetchSettings,
    saveSettings,
    updateField,
    toggleFeature
  };
}
