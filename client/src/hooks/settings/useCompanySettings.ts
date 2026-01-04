import { useState, useEffect } from 'react';

export interface CompanySetting {
  id: string;
  nom_entreprise: string;
  sigle?: string;
  description?: string;
  numero_rccm?: string;
  numero_impot?: string;
  adresse_complete?: string;
  ville?: string;
  pays?: string;
  telephone?: string;
  email?: string;
  site_web?: string;
  devise_principale?: string;
  fuseau_horaire?: string;
  taux_tva?: number;
  couleur_primaire?: string;
  couleur_secondaire?: string;
}

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/company');
      if (!response.ok) throw new Error('Erreur serveur');
      
      const data = await response.json();
      setSettings(Array.isArray(data) && data.length > 0 ? data[0] : null);
    } catch (err) {
      console.error('Erreur fetch company settings:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (data: Partial<CompanySetting>) => {
    setSaving(true);
    setError(null);
    try {
      const method = settings?.id ? 'PUT' : 'POST';
      const endpoint = settings?.id ? `/api/settings/company/${settings.id}` : '/api/settings/company';

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
      console.error('Erreur save company:', err);
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof CompanySetting, value: any) => {
    setSettings(prev => prev ? { ...prev, [field]: value } : null);
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
    updateField
  };
}
