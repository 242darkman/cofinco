import { useState, useEffect } from 'react';

export interface UISetting {
  id: string;
  theme: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  sidebar_position: string;
  sidebar_collapsed_default: boolean;
  langue: string;
}

export function useUISettings() {
  const [settings, setSettings] = useState<UISetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/ui');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      setSettings(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch (err) {
      console.error('Erreur fetch UI settings:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (data: Partial<UISetting>) => {
    setSaving(true);
    setError(null);
    try {
      const method = settings?.id ? 'PUT' : 'POST';
      const endpoint = settings?.id ? `/api/settings/ui/${settings.id}` : '/api/settings/ui';

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
      console.error('Erreur save UI settings:', err);
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof UISetting, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
  };

  const applyTheme = (theme: string) => {
    updateField('theme', theme);
    // Appliquer le thème au document
    document.documentElement.setAttribute('data-theme', theme);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings?.theme) {
      document.documentElement.setAttribute('data-theme', settings.theme);
    }
  }, [settings?.theme]);

  return {
    settings,
    loading,
    error,
    saving,
    fetchSettings,
    saveSettings,
    updateField,
    applyTheme
  };
}
