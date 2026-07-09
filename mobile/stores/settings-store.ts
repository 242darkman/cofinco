import { create } from 'zustand';
import { api } from '@/lib/api-client';
import { setActiveCurrencyByCode, DEFAULT_CURRENCY, type CurrencyConfig } from '@shared/types/mobile';

export interface BrandingSettings {
  appName: string;
  primaryColor: string;
  logoUrl: string | null;
  theme: string;
}

export interface AppSettings {
  branding: BrandingSettings;
  devise: string;
  pays: string;
  themeMode: 'system' | 'light' | 'dark';
  isLoaded: boolean;
}

interface SettingsState extends AppSettings {
  loadBranding: () => Promise<void>;
  loadSystemSettings: () => Promise<void>;
  setThemeMode: (mode: 'system' | 'light' | 'dark') => void;
}

const DEFAULT_BRANDING: BrandingSettings = {
  appName: 'MicroFlex',
  primaryColor: '#047857',
  logoUrl: null,
  theme: 'DARK',
};

export const useSettingsStore = create<SettingsState>((set) => ({
  branding: DEFAULT_BRANDING,
  devise: DEFAULT_CURRENCY.code,
  pays: 'Republique du Congo',
  themeMode: 'system',
  isLoaded: false,

  loadBranding: async () => {
    try {
      const data = await api.get<BrandingSettings>('/api/branding');
      set({
        branding: {
          appName: data.appName || DEFAULT_BRANDING.appName,
          primaryColor: data.primaryColor || DEFAULT_BRANDING.primaryColor,
          logoUrl: data.logoUrl,
          theme: data.theme || DEFAULT_BRANDING.theme,
        },
      });
    } catch {
      // Fallback to defaults on error
    }
  },

  loadSystemSettings: async () => {
    try {
      const data = await api.get<{
        devise?: string;
        pays?: string;
      }>('/api/system-settings');
      if (data.devise) {
        setActiveCurrencyByCode(data.devise);
        set({ devise: data.devise });
      }
      if (data.pays) {
        set({ pays: data.pays });
      }
      set({ isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  setThemeMode: (mode) => set({ themeMode: mode }),
}));
