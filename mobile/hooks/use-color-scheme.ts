import { useColorScheme as useRNColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Returns the effective color scheme, respecting user preference.
 * - 'system' follows OS setting
 * - 'light' / 'dark' overrides OS
 */
export function useColorScheme(): 'light' | 'dark' {
  const systemScheme = useRNColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);

  if (themeMode === 'system') {
    return systemScheme ?? 'light';
  }
  return themeMode;
}
