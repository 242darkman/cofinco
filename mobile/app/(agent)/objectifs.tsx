import { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, LayoutAnimation } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore } from '@/stores/agent-store';
import { useObjectifs } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-');
  const months = [
    'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const STATUT_CONFIG: Record<string, { label: string; variant: 'info' | 'success' | 'danger' | 'neutral' }> = {
  EN_COURS: { label: 'En cours', variant: 'info' },
  ATTEINT: { label: 'Atteint', variant: 'success' },
  DEPASSE: { label: 'Depasse', variant: 'success' },
  ECHOUE: { label: 'Echoue', variant: 'danger' },
};

const PRIME_STATUT_LABEL: Record<string, string> = {
  PAID: 'Payee',
  ELIGIBLE: 'Eligible',
  PENDING: 'En attente',
};

const PRIME_STATUT_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  PAID: 'success',
  ELIGIBLE: 'info',
  PENDING: 'warning',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function ObjectifsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [period, setPeriod] = useState(getCurrentPeriod);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const objectifsQuery = useObjectifs(employeId, period);
  const objectifs = objectifsQuery.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await objectifsQuery.refetch();
    setRefreshing(false);
  }, [objectifsQuery]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = objectifs.length;
    const atteints = objectifs.filter(
      (o: any) => o.statut === 'ATTEINT' || o.statut === 'DEPASSE'
    ).length;
    const taux = total > 0 ? Math.round((atteints / total) * 100) : 0;
    return { total, atteints, taux };
  }, [objectifs]);

  // ── Toggle expand ─────────────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ── Render item ───────────────────────────────────────────────────────────

  const renderObjectif = useCallback(
    ({ item }: { item: any }) => {
      const valeurObjectif = Number(item.valeurObjectif) || 0;
      const valeurRealisee = Number(item.valeurRealisee) || 0;
      const reste = Math.max(0, valeurObjectif - valeurRealisee);
      const percentage = valeurObjectif > 0
        ? Math.min(Math.round((valeurRealisee / valeurObjectif) * 100), 100)
        : 0;
      const statutConfig = STATUT_CONFIG[item.statut] ?? { label: item.statut, variant: 'neutral' as const };
      const isExpanded = expandedId === (item.id || item.objectifId);
      const type = item.typeObjectif || item.type || 'Objectif';
      const prime = item.prime || item.primeInfo;

      return (
        <Pressable onPress={() => toggleExpand(item.id || item.objectifId)}>
          <Card className="mb-3">
            {/* Top row: type badge + statut */}
            <View className="flex-row items-center justify-between mb-3">
              <Badge label={type} variant="info" />
              <Badge label={statutConfig.label} variant={statutConfig.variant} />
            </View>

            {/* Description if present */}
            {item.description && (
              <Text className="text-text-secondary text-sm mb-2" numberOfLines={isExpanded ? undefined : 1}>
                {item.description}
              </Text>
            )}

            {/* Progress bar */}
            <View className="mb-2">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-text-muted text-xs">Progression</Text>
                <Text className="text-text-primary text-sm font-bold">{percentage}%</Text>
              </View>
              <View className="h-3 bg-bg-muted rounded-full overflow-hidden">
                <View
                  className={`h-full rounded-full ${
                    percentage >= 100
                      ? 'bg-success'
                      : percentage >= 75
                        ? 'bg-accent'
                        : percentage >= 50
                          ? 'bg-warning'
                          : 'bg-danger'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </View>
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-text-muted text-xs">
                  {formatMoney(valeurRealisee)} / {formatMoney(valeurObjectif)}
                </Text>
              </View>
            </View>

            {/* Prime indicator (always visible) */}
            {prime && (
              <View className="flex-row items-center mt-1">
                <Ionicons name="gift" size={14} color={colors.accent} />
                <Text className="text-accent text-xs font-medium ml-1">
                  Prime: {formatMoney(Number(prime.montant) || 0)}
                </Text>
                {prime.statut && (
                  <View className="ml-2">
                    <Badge
                      label={PRIME_STATUT_LABEL[prime.statut] ?? prime.statut}
                      variant={PRIME_STATUT_VARIANT[prime.statut] ?? 'neutral'}
                      size="sm"
                    />
                  </View>
                )}
              </View>
            )}

            {/* Expanded detail */}
            {isExpanded && (
              <View className="mt-3 pt-3 border-t border-border-subtle">
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-muted text-sm">Objectif</Text>
                    <Text className="text-text-primary text-sm font-semibold">
                      {formatMoney(valeurObjectif)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-muted text-sm">Realise</Text>
                    <Text className="text-success text-sm font-semibold">
                      {formatMoney(valeurRealisee)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-muted text-sm">Reste</Text>
                    <Text className="text-warning text-sm font-semibold">
                      {formatMoney(reste)}
                    </Text>
                  </View>

                  {/* Prime detail */}
                  {prime && (
                    <View className="mt-2 pt-2 border-t border-border-subtle">
                      <Text className="text-text-primary text-sm font-semibold mb-1">
                        Detail prime
                      </Text>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-text-muted text-sm">Montant</Text>
                        <Text className="text-text-primary text-sm font-medium">
                          {formatMoney(Number(prime.montant) || 0)}
                        </Text>
                      </View>
                      <View className="flex-row items-center justify-between mt-1">
                        <Text className="text-text-muted text-sm">Statut</Text>
                        <Badge
                          label={PRIME_STATUT_LABEL[prime.statut] ?? prime.statut ?? 'N/A'}
                          variant={PRIME_STATUT_VARIANT[prime.statut] ?? 'neutral'}
                        />
                      </View>
                    </View>
                  )}
                </View>

                <Pressable
                  onPress={() => toggleExpand(item.id || item.objectifId)}
                  className="mt-3 items-center"
                >
                  <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            {/* Expand hint */}
            {!isExpanded && (
              <View className="items-center mt-2">
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </View>
            )}
          </Card>
        </Pressable>
      );
    },
    [expandedId, toggleExpand, colors]
  );

  // ── Loading ─────────────────────────────────────────────────────────────

  if (objectifsQuery.isLoading && !refreshing) {
    return <Loading fullScreen message="Chargement des objectifs..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      {/* Period selector */}
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable
          onPress={() => setPeriod((p) => shiftPeriod(p, -1))}
          className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center"
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-text-primary text-base font-semibold">
          {formatPeriodLabel(period)}
        </Text>
        <Pressable
          onPress={() => setPeriod((p) => shiftPeriod(p, 1))}
          className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Stats row */}
      <View className="flex-row px-5 mb-4 gap-3">
        <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
          <Text className="text-text-primary text-lg font-bold">{stats.total}</Text>
          <Text className="text-text-muted text-xs">Total</Text>
        </View>
        <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
          <Text className="text-success text-lg font-bold">{stats.atteints}</Text>
          <Text className="text-text-muted text-xs">Atteints</Text>
        </View>
        <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
          <Text className="text-accent text-lg font-bold">{stats.taux}%</Text>
          <Text className="text-text-muted text-xs">Taux</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={objectifs}
        keyExtractor={(item: any) => String(item.id || item.objectifId)}
        renderItem={renderObjectif}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="flag-outline" size={48} color={colors.textMuted} />}
            title="Aucun objectif"
            description="Aucun objectif pour cette periode."
          />
        }
      />
    </SafeAreaView>
  );
}
