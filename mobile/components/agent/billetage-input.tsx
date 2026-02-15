import { View, Text, TextInput } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { formatMoney } from '@shared/types/mobile';

const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5] as const;

interface BilletageInputProps {
  billetage: Record<string, number>;
  onChange: (denom: string, count: number) => void;
  total: number;
}

export function BilletageInput({ billetage, onChange, total }: BilletageInputProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <View>
      {/* Header */}
      <View className="flex-row items-center py-2 mb-1">
        <Text className="flex-1 text-text-muted text-xs font-semibold uppercase">Coupure</Text>
        <Text className="w-20 text-text-muted text-xs font-semibold uppercase text-center">Nombre</Text>
        <Text className="w-24 text-text-muted text-xs font-semibold uppercase text-right">Sous-total</Text>
      </View>

      {DENOMINATIONS.map((denom) => {
        const count = billetage[String(denom)] || 0;
        const subtotal = denom * count;
        return (
          <View key={denom} className="flex-row items-center py-2 border-b border-border-subtle">
            <Text className="flex-1 text-text-primary text-sm font-medium">
              {denom.toLocaleString('fr-FR')} F
            </Text>
            <View className="w-20">
              <TextInput
                className="bg-input-bg border border-input-border rounded-lg px-2 py-1.5 text-input-text text-sm text-center"
                keyboardType="numeric"
                value={count > 0 ? String(count) : ''}
                onChangeText={(text) => {
                  const val = parseInt(text, 10);
                  onChange(String(denom), isNaN(val) || val < 0 ? 0 : val);
                }}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <Text className="w-24 text-text-secondary text-sm text-right">
              {subtotal > 0 ? formatMoney(subtotal) : '-'}
            </Text>
          </View>
        );
      })}

      {/* Total */}
      <View className="flex-row items-center py-3 mt-1">
        <Text className="flex-1 text-text-primary text-base font-bold">TOTAL</Text>
        <Text className="text-text-primary text-base font-bold">{formatMoney(total)}</Text>
      </View>
    </View>
  );
}

export function computeBilletageTotal(billetage: Record<string, number>): number {
  return Object.entries(billetage).reduce((sum, [denom, count]) => {
    return sum + Number(denom) * (count || 0);
  }, 0);
}

export function emptyBilletage(): Record<string, number> {
  return Object.fromEntries(DENOMINATIONS.map((d) => [String(d), 0]));
}
