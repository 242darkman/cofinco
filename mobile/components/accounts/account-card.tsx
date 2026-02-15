import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import type { Account } from '@/hooks/use-accounts';
import { formatMoney } from '@shared/types/mobile';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  COURANT: 'card',
  EPARGNE: 'trending-up',
  BLOCKED: 'lock-closed',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  CLOSED: 'danger',
};

interface AccountCardProps {
  account: Account;
  onPress: () => void;
}

export function AccountCard({ account, onPress }: AccountCardProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const icon = TYPE_ICONS[account.typeCompte] ?? 'card';

  return (
    <PressableCard variant="elevated" onPress={onPress} accessibilityRole="button">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mr-3">
            <Ionicons name={icon} size={20} color={colors.accent} />
          </View>
          <View className="flex-1">
            <Text className="text-text-primary font-semibold text-base" numberOfLines={1}>
              {account.produit?.nom ?? account.typeCompte}
            </Text>
            <Text className="text-text-muted text-xs">{account.numeroCompte}</Text>
          </View>
        </View>
        <Badge
          label={account.statut}
          variant={STATUS_VARIANT[account.statut] ?? 'neutral'}
        />
      </View>

      {/* Balance — prominent banking style */}
      <View className="border-t border-border-subtle pt-3">
        <Text className="text-text-muted text-xs mb-1">Solde disponible</Text>
        <Text className="text-text-primary text-2xl font-bold">
          {formatMoney(account.solde ?? 0)}
        </Text>
      </View>

      <View className="flex-row items-center justify-end mt-2">
        <Text className="text-accent text-xs font-medium mr-1">Voir le detail</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
      </View>
    </PressableCard>
  );
}
