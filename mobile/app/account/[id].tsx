import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAccountDetail, useAccountTransactions } from '@/hooks/use-accounts';
import { BalanceDisplay } from '@/components/accounts/balance-display';
import { TransactionItem } from '@/components/transactions/transaction-item';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loading, EmptyState } from '@/components/ui/loading';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const { data: account, isLoading: accountLoading } = useAccountDetail(id);
  const {
    data: txPages,
    isLoading: txLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useAccountTransactions(id);

  const transactions = txPages?.pages.flatMap((p) => p.data) ?? [];

  if (accountLoading) {
    return <Loading fullScreen message="Chargement du compte..." />;
  }

  if (!account) {
    return (
      <EmptyState
        icon={<Ionicons name="alert-circle-outline" size={48} color="#94a3b8" />}
        title="Compte introuvable"
      />
    );
  }

  const statusVariant =
    account.statut === 'ACTIVE'
      ? 'success'
      : account.statut === 'SUSPENDED'
        ? 'warning'
        : account.statut === 'CLOSED'
          ? 'danger'
          : 'neutral';

  return (
    <FlatList
      className="flex-1 bg-bg-base"
      data={transactions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View className="px-5">
          <TransactionItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        </View>
      )}
      ListHeaderComponent={
        <View className="px-5 pt-4 pb-2">
          {/* Account info card */}
          <Card variant="elevated" className="mb-4">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-text-muted text-xs">
                  {account.produit?.nom ?? account.typeCompte}
                </Text>
                <Text className="text-text-primary text-sm font-medium mt-0.5">
                  {account.numeroCompte}
                </Text>
              </View>
              <Badge label={account.statut} variant={statusVariant as any} />
            </View>

            <BalanceDisplay
              amount={account.solde ?? 0}
              label="Solde disponible"
              size="lg"
            />
          </Card>

          {/* Section header */}
          <Text className="text-text-primary text-lg font-bold mb-2">
            Historique
          </Text>
          {txLoading && <Loading message="Chargement des transactions..." />}
        </View>
      }
      ListEmptyComponent={
        !txLoading ? (
          <EmptyState
            icon={<Ionicons name="receipt-outline" size={40} color="#94a3b8" />}
            title="Aucune transaction"
            description="L'historique est vide pour ce compte."
          />
        ) : null
      }
      ListFooterComponent={
        isFetchingNextPage ? <Loading message="Chargement..." /> : null
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
      ItemSeparatorComponent={() => <View className="h-px bg-border-subtle mx-5" />}
      contentContainerClassName="pb-8"
      showsVerticalScrollIndicator={false}
    />
  );
}
