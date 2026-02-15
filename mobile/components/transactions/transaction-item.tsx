import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { formatMoney } from '@shared/types/mobile';
import type { Transaction } from '@/hooks/use-accounts';

const TYPE_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  DEPOT: { icon: 'arrow-down-circle', color: 'success' },
  RETRAIT: { icon: 'arrow-up-circle', color: 'danger' },
  TRANSFERT: { icon: 'swap-horizontal', color: 'info' },
  VIREMENT: { icon: 'swap-horizontal', color: 'info' },
};

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
}

export function TransactionItem({ transaction, onPress }: TransactionItemProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const typeInfo = TYPE_ICONS[transaction.typeTransaction] ?? {
    icon: 'ellipse' as const,
    color: 'neutral',
  };

  const iconColor =
    typeInfo.color === 'success'
      ? colors.success
      : typeInfo.color === 'danger'
        ? colors.danger
        : typeInfo.color === 'info'
          ? colors.info
          : colors.textMuted;

  const isIncoming = transaction.sens === 'IN';
  const amountPrefix = isIncoming ? '+' : '-';
  const amountColor = isIncoming ? 'text-success' : 'text-danger';

  const date = new Date(transaction.createdAt);
  const formattedDate = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
  const formattedTime = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Pressable
      className="flex-row items-center py-3 px-1 active:bg-bg-muted rounded-lg"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${transaction.typeTransaction} ${formatMoney(transaction.montant)}`}
    >
      {/* Icon */}
      <View className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center mr-3">
        <Ionicons name={typeInfo.icon} size={22} color={iconColor} />
      </View>

      {/* Description */}
      <View className="flex-1 mr-3">
        <Text className="text-text-primary font-medium text-sm" numberOfLines={1}>
          {transaction.description ?? transaction.typeTransaction}
        </Text>
        <Text className="text-text-muted text-xs mt-0.5">
          {formattedDate} {formattedTime}
        </Text>
      </View>

      {/* Amount */}
      <Text className={`${amountColor} font-semibold text-sm`}>
        {amountPrefix}{formatMoney(Math.abs(transaction.montant))}
      </Text>
    </Pressable>
  );
}
