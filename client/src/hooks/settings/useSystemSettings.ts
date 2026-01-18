import { useState, useEffect } from 'react';
import { useServerHealth } from '../../contexts/ServerHealthContext';

export interface SystemSetting {
  id: string;
  cle: string;
  valeur: string;
  type_valeur: string;
  categorie: string;
  description: string;
  modifiable: boolean;
  sensible: boolean;
}

export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isServerReachable } = useServerHealth();

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/system');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      setSettings(data);
    } catch (err) {
      console.error('Erreur fetch system settings:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (cle: string, valeur: string) => {
    try {
      const response = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cle, valeur })
      });

      if (!response.ok) throw new Error('Erreur mise à jour');

      const updated = await response.json();
      setSettings(prev => prev.map(s => s.cle === cle ? { ...s, valeur } : s));
      return true;
    } catch (err) {
      console.error('Erreur update setting:', err);
      setError(err instanceof Error ? err.message : 'Erreur mise à jour');
      return false;
    }
  };

  const getSettingsByCategory = (category: string) => {
    return settings.filter(s => s.categorie === category);
  };

  const getSetting = (cle: string) => {
    return settings.find(s => s.cle === cle);
  };

  useEffect(() => {
    if (!isServerReachable) return;
    fetchSettings();
  }, [isServerReachable]);

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateSetting,
    getSettingsByCategory,
    getSetting
  };
}
