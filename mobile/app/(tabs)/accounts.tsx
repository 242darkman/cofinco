import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAccounts } from '@/hooks/use-accounts';
import { AccountCard } from '@/components/accounts/account-card';
import { Loading, EmptyState } from '@/components/ui/loading';
import { Ionicons } from '@expo/vector-icons';

export default function AccountsScreen() {
  const router = useRouter();
  const { data: accounts, isLoading, refetch, isRefetching } = useAccounts();

  if (isLoading) {
    return <Loading fullScreen message="Chargement des comptes..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-text-primary text-2xl font-bold">Mes comptes</Text>
        <Text className="text-text-muted text-sm mt-1">
          {accounts?.length ?? 0} compte{(accounts?.length ?? 0) > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={accounts ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="px-5 mb-3">
            <AccountCard
              account={item}
              onPress={() => router.push(`/account/${item.id}`)}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        contentContainerClassName="pb-6 pt-2"
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="wallet-outline" size={48} color="#94a3b8" />}
            title="Aucun compte"
            description="Vous n'avez pas encore de compte actif."
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
