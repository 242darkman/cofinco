import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores/auth-store';
import { useDashboardStats } from '@/hooks/use-dashboard';
import { useAccounts } from '@/hooks/use-accounts';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { StatsGrid } from '@/components/dashboard/stats-grid';
import { AccountCard } from '@/components/accounts/account-card';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';

export default function DashboardScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const user = useAuthStore((s) => s.user);
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { data: accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useAccounts();

  const isRefreshing = false;
  const onRefresh = () => {
    refetchStats();
    refetchAccounts();
  };

  const totalBalance = accounts?.reduce(
    (sum, a) => sum + (a.solde ?? 0),
    0
  ) ?? 0;

  const g = stats?.global;

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-6">
          <View className="flex-row items-center justify-between mb-6">
            <View>
              <Text className="text-text-muted text-sm">Bonjour,</Text>
              <Text className="text-text-primary text-xl font-bold">
                {user?.nom} {user?.prenom ?? ''}
              </Text>
            </View>
            <Pressable
              className="w-10 h-10 rounded-full bg-card-bg border border-card-border items-center justify-center"
              onPress={() => router.push('/qr/scan')}
              accessibilityLabel="Scanner un QR code"
            >
              <Ionicons name="qr-code" size={20} color={colors.accent} />
            </Pressable>
          </View>

          {/* Main balance card — banking hero */}
          <Card variant="elevated" className="bg-accent p-6 rounded-3xl">
            <Text className="text-white/70 text-sm mb-1">Solde total</Text>
            <Text className="text-white text-3xl font-bold">
              {formatMoney(totalBalance)}
            </Text>
            <View className="flex-row mt-4 gap-4">
              <Pressable
                className="flex-row items-center bg-white/20 rounded-xl px-4 py-2.5"
                onPress={() => router.push('/qr/generate')}
              >
                <Ionicons name="arrow-down" size={16} color="#ffffff" />
                <Text className="text-white font-medium text-sm ml-1.5">Recevoir</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center bg-white/20 rounded-xl px-4 py-2.5"
                onPress={() => router.push('/qr/scan')}
              >
                <Ionicons name="arrow-up" size={16} color="#ffffff" />
                <Text className="text-white font-medium text-sm ml-1.5">Payer</Text>
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Quick stats */}
        {statsLoading ? (
          <Loading message="Chargement..." />
        ) : g ? (
          <View className="px-5 mb-6">
            <StatsGrid
              stats={[
                {
                  label: 'Comptes actifs',
                  value: String(accounts?.length ?? 0),
                  icon: 'wallet',
                },
                {
                  label: 'Credits actifs',
                  value: String(g.creditsEnCours ?? 0),
                  icon: 'cash',
                },
                {
                  label: 'Encaisse',
                  value: formatMoney(g.encaisse ?? 0, { compact: true }),
                  icon: 'trending-up',
                  trend: 'up',
                },
                {
                  label: 'Recouvrement',
                  value: `${g.tauxRecouvrement ?? 0}%`,
                  icon: 'pie-chart',
                },
              ]}
            />
          </View>
        ) : null}

        {/* Accounts preview */}
        <View className="px-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-text-primary text-lg font-bold">Mes comptes</Text>
            <Pressable onPress={() => router.push('/(tabs)/accounts')}>
              <Text className="text-accent text-sm font-medium">Voir tout</Text>
            </Pressable>
          </View>

          {accountsLoading ? (
            <Loading />
          ) : accounts?.length ? (
            <View className="gap-3">
              {accounts.slice(0, 3).map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onPress={() => router.push(`/account/${account.id}`)}
                />
              ))}
            </View>
          ) : (
            <Card>
              <Text className="text-text-muted text-center py-4">
                Aucun compte pour le moment
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
