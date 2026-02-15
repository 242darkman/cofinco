import { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores/auth-store';
import { useLeaderboard } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';

// ─── Constants ──────────────────────────────────────────────────────────────

const PERIODS = [
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'annee', label: 'Annee' },
] as const;

const LEVEL_LABELS: Record<number, string> = {
  1: 'Debutant',
  2: 'Actif',
  3: 'Confirme',
  4: 'Expert',
  5: 'Elite',
};

const LEVEL_VARIANTS: Record<number, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  1: 'neutral',
  2: 'info',
  3: 'warning',
  4: 'success',
  5: 'success',
};

const MEDAL_COLORS = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
} as const;

// ─── Component ──────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [activePeriod, setActivePeriod] = useState<string>('mois');
  const [refreshing, setRefreshing] = useState(false);

  const leaderboardQuery = useLeaderboard(activePeriod);
  const leaderboardData = leaderboardQuery.data;
  const allEntries: any[] = leaderboardData?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await leaderboardQuery.refetch();
    setRefreshing(false);
  }, [leaderboardQuery]);

  // ── Split top 3 and rest ──────────────────────────────────────────────────

  const top3 = useMemo(() => allEntries.slice(0, 3), [allEntries]);
  const restEntries = useMemo(() => allEntries.slice(3), [allEntries]);

  // ── Loading ─────────────────────────────────────────────────────────────

  if (leaderboardQuery.isLoading && !refreshing) {
    return <Loading fullScreen message="Chargement du classement..." />;
  }

  // ── Podium avatar placeholder ─────────────────────────────────────────────

  const PodiumItem = ({ entry, rank, size }: { entry: any; rank: number; size: 'lg' | 'sm' }) => {
    const medalColor = MEDAL_COLORS[rank as keyof typeof MEDAL_COLORS] ?? colors.textMuted;
    const isCurrentUser =
      entry.agentId === currentUserId || entry.userId === currentUserId || entry.id === currentUserId;
    const avatarSize = size === 'lg' ? 'w-20 h-20' : 'w-16 h-16';
    const textSize = size === 'lg' ? 'text-base' : 'text-sm';
    const nameText = entry.nom
      ? `${entry.prenom ?? ''} ${entry.nom}`.trim()
      : entry.name ?? `Agent #${rank}`;

    return (
      <View className="items-center flex-1">
        {/* Medal */}
        <View
          className="w-8 h-8 rounded-full items-center justify-center mb-1"
          style={{ backgroundColor: medalColor }}
        >
          <Text className="text-white font-bold text-sm">{rank}</Text>
        </View>

        {/* Avatar placeholder */}
        <View
          className={`${avatarSize} rounded-full items-center justify-center mb-2 ${
            isCurrentUser ? 'border-2 border-accent' : 'border-2 border-border-subtle'
          }`}
          style={{ backgroundColor: colors.bgMuted }}
        >
          <Ionicons name="person" size={size === 'lg' ? 32 : 24} color={colors.textMuted} />
        </View>

        {/* Name */}
        <Text
          className={`text-text-primary font-semibold ${textSize} text-center`}
          numberOfLines={1}
        >
          {nameText}
        </Text>

        {/* Score */}
        <Text className="text-accent text-xs font-bold mt-0.5">
          {formatMoney(Number(entry.score) || Number(entry.totalCollecte) || 0)}
        </Text>

        {/* Level badge */}
        {entry.niveau != null && (
          <View className="mt-1">
            <Badge
              label={LEVEL_LABELS[entry.niveau] ?? `Niv. ${entry.niveau}`}
              variant={LEVEL_VARIANTS[entry.niveau] ?? 'neutral'}
              size="sm"
            />
          </View>
        )}
      </View>
    );
  };

  // ── Ranking row ─────────────────────────────────────────────────────────

  const renderRankRow = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const rank = index + 4; // starts after top 3
      const isCurrentUser =
        item.agentId === currentUserId || item.userId === currentUserId || item.id === currentUserId;
      const nameText = item.nom
        ? `${item.prenom ?? ''} ${item.nom}`.trim()
        : item.name ?? `Agent #${rank}`;
      const score = Number(item.score) || Number(item.totalCollecte) || 0;
      const collectes = Number(item.collectes) || Number(item.totalCollecte) || 0;
      const visites = Number(item.visites) || Number(item.totalVisites) || 0;
      const prospections = Number(item.prospections) || Number(item.totalProspections) || 0;

      return (
        <Card className={`mb-2 ${isCurrentUser ? 'border-accent' : ''}`}>
          <View className="flex-row items-center">
            {/* Rank */}
            <View
              className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${
                isCurrentUser ? 'bg-accent' : 'bg-bg-muted'
              }`}
            >
              <Text
                className={`font-bold text-sm ${
                  isCurrentUser ? 'text-white' : 'text-text-primary'
                }`}
              >
                {rank}
              </Text>
            </View>

            {/* Name + Level */}
            <View className="flex-1">
              <Text
                className={`text-sm font-semibold ${
                  isCurrentUser ? 'text-accent' : 'text-text-primary'
                }`}
                numberOfLines={1}
              >
                {nameText}
                {isCurrentUser ? ' (Vous)' : ''}
              </Text>
              {item.niveau != null && (
                <View className="flex-row mt-0.5">
                  <Badge
                    label={LEVEL_LABELS[item.niveau] ?? `Niv. ${item.niveau}`}
                    variant={LEVEL_VARIANTS[item.niveau] ?? 'neutral'}
                    size="sm"
                  />
                </View>
              )}
            </View>

            {/* Score */}
            <View className="items-end">
              <Text className="text-text-primary text-sm font-bold">{formatMoney(score)}</Text>
              <View className="flex-row gap-2 mt-0.5">
                {collectes > 0 && (
                  <View className="flex-row items-center">
                    <Ionicons name="cash-outline" size={10} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-0.5">{collectes}</Text>
                  </View>
                )}
                {visites > 0 && (
                  <View className="flex-row items-center">
                    <Ionicons name="walk-outline" size={10} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-0.5">{visites}</Text>
                  </View>
                )}
                {prospections > 0 && (
                  <View className="flex-row items-center">
                    <Ionicons name="people-outline" size={10} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-0.5">{prospections}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Card>
      );
    },
    [currentUserId, colors]
  );

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      {/* Period tabs */}
      <View className="flex-row px-5 py-3 gap-2">
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setActivePeriod(p.key)}
            className={`flex-1 py-2.5 rounded-xl items-center ${
              activePeriod === p.key ? 'bg-accent' : 'bg-bg-muted'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                activePeriod === p.key ? 'text-white' : 'text-text-primary'
              }`}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={restEntries}
        keyExtractor={(item: any, index) => String(item.id || item.agentId || index)}
        renderItem={renderRankRow}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Podium */}
            {top3.length > 0 && (
              <View className="mb-6 mt-2">
                <View className="flex-row items-end justify-center gap-2">
                  {/* #2 left */}
                  {top3.length >= 2 && (
                    <View className="pt-4">
                      <PodiumItem entry={top3[1]} rank={2} size="sm" />
                    </View>
                  )}

                  {/* #1 center (larger) */}
                  {top3.length >= 1 && (
                    <PodiumItem entry={top3[0]} rank={1} size="lg" />
                  )}

                  {/* #3 right */}
                  {top3.length >= 3 && (
                    <View className="pt-4">
                      <PodiumItem entry={top3[2]} rank={3} size="sm" />
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Legend */}
            {restEntries.length > 0 && (
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-text-primary text-base font-bold">Classement complet</Text>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center">
                    <Ionicons name="cash-outline" size={12} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-1">Collectes</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="walk-outline" size={12} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-1">Visites</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="people-outline" size={12} color={colors.textMuted} />
                    <Text className="text-text-muted text-xs ml-1">Prosp.</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          top3.length === 0 ? (
            <EmptyState
              icon={<Ionicons name="trophy-outline" size={48} color={colors.textMuted} />}
              title="Aucun classement"
              description="Les donnees de classement ne sont pas encore disponibles pour cette periode."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}
