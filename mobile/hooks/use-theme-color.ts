import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColor(
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
  override?: { light?: string; dark?: string }
) {
  const theme = useColorScheme();
  if (override?.[theme]) return override[theme]!;
  return Colors[theme][colorName];
}
