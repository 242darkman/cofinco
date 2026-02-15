import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore } from '@/stores/agent-store';
import { useObjectifs, useCommissions, useProspectionStats } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card, PressableCard } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
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

// ─── Component ──────────────────────────────────────────────────────────────

export default function KpiDashboard() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [period, setPeriod] = useState(getCurrentPeriod);
  const [refreshing, setRefreshing] = useState(false);

  const objectifsQuery = useObjectifs(employeId, period);
  const commissionsQuery = useCommissions(employeId, period);
  const prospectionQuery = useProspectionStats(employeId);

  const isLoading =
    objectifsQuery.isLoading || commissionsQuery.isLoading || prospectionQuery.isLoading;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      objectifsQuery.refetch(),
      commissionsQuery.refetch(),
      prospectionQuery.refetch(),
    ]);
    setRefreshing(false);
  }, [objectifsQuery, commissionsQuery, prospectionQuery]);

  // ── Derived stats ───────────────────────────────────────────────────────

  const objectifs = objectifsQuery.data ?? [];
  const commissions = commissionsQuery.data ?? [];
  const prospectionStats = prospectionQuery.data;

  const stats = useMemo(() => {
    const totalObjectifs = objectifs.length;
    const completedObjectifs = objectifs.filter(
      (o: any) => o.statut === 'ATTEINT' || o.statut === 'DEPASSE'
    ).length;

    const totalCommissionNet = commissions.reduce(
      (sum: number, c: any) => sum + (Number(c.montantNet) || Number(c.montant_net) || 0),
      0
    );

    const totalProspections = prospectionStats?.total ?? prospectionStats?.totalCreated ?? 0;
    const convertedProspections =
      prospectionStats?.converted ?? prospectionStats?.totalConverted ?? 0;
    const tauxReussite =
      totalProspections > 0 ? Math.round((convertedProspections / totalProspections) * 100) : 0;

    return {
      totalObjectifs,
      completedObjectifs,
      totalCommissionNet,
      totalProspections,
      tauxReussite,
    };
  }, [objectifs, commissions, prospectionStats]);

  // ── Objectifs by type (for progress bars) ───────────────────────────────

  const objectifsByType = useMemo(() => {
    const grouped: Record<string, { total: number; realise: number; count: number }> = {};
    for (const obj of objectifs) {
      const type = (obj as any).typeObjectif || (obj as any).type || 'Autre';
      if (!grouped[type]) grouped[type] = { total: 0, realise: 0, count: 0 };
      grouped[type].total += Number((obj as any).valeurObjectif) || 0;
      grouped[type].realise += Number((obj as any).valeurRealisee) || 0;
      grouped[type].count += 1;
    }
    return Object.entries(grouped).map(([type, data]) => ({
      type,
      ...data,
      percentage: data.total > 0 ? Math.min(Math.round((data.realise / data.total) * 100), 100) : 0,
    }));
  }, [objectifs]);

  // ── Loading state ───────────────────────────────────────────────────────

  if (isLoading && !refreshing) {
    return <Loading fullScreen message="Chargement des KPI..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-text-primary text-xl font-bold">Tableau de bord</Text>
          <Text className="text-text-muted text-sm mt-0.5">Vos performances en un coup d'oeil</Text>
        </View>

        {/* Period selector */}
        <View className="flex-row items-center justify-between px-5 mb-5">
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

        {/* Stats grid (2x2) */}
        <View className="px-5 mb-5">
          <View className="flex-row gap-3 mb-3">
            {/* Objectifs progress */}
            <Card className="flex-1">
              <View className="w-10 h-10 rounded-full bg-info/10 items-center justify-center mb-2">
                <Ionicons name="flag" size={20} color={colors.info} />
              </View>
              <Text className="text-text-muted text-xs">Objectifs</Text>
              <Text className="text-text-primary text-xl font-bold">
                {stats.completedObjectifs}/{stats.totalObjectifs}
              </Text>
              <Text className="text-text-muted text-xs">atteints</Text>
            </Card>

            {/* Commission nette */}
            <Card className="flex-1">
              <View className="w-10 h-10 rounded-full bg-success/10 items-center justify-center mb-2">
                <Ionicons name="cash" size={20} color={colors.success} />
              </View>
              <Text className="text-text-muted text-xs">Commission nette</Text>
              <Text className="text-text-primary text-xl font-bold" numberOfLines={1}>
                {formatMoney(stats.totalCommissionNet)}
              </Text>
              <Text className="text-text-muted text-xs">ce mois</Text>
            </Card>
          </View>

          <View className="flex-row gap-3">
            {/* Prospections */}
            <Card className="flex-1">
              <View className="w-10 h-10 rounded-full bg-warning/10 items-center justify-center mb-2">
                <Ionicons name="people" size={20} color={colors.warning} />
              </View>
              <Text className="text-text-muted text-xs">Prospections</Text>
              <Text className="text-text-primary text-xl font-bold">
                {stats.totalProspections}
              </Text>
              <Text className="text-text-muted text-xs">total creees</Text>
            </Card>

            {/* Taux de reussite */}
            <Card className="flex-1">
              <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mb-2">
                <Ionicons name="trending-up" size={20} color={colors.accent} />
              </View>
              <Text className="text-text-muted text-xs">Taux de reussite</Text>
              <Text className="text-text-primary text-xl font-bold">{stats.tauxReussite}%</Text>
              <Text className="text-text-muted text-xs">conversion</Text>
            </Card>
          </View>
        </View>

        {/* Objectives summary - progress bars by type */}
        {objectifsByType.length > 0 && (
          <View className="px-5 mb-5">
            <Text className="text-text-primary text-lg font-bold mb-3">
              Progression par objectif
            </Text>
            <Card>
              {objectifsByType.map((item, index) => (
                <View
                  key={item.type}
                  className={index > 0 ? 'mt-4' : ''}
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-text-primary text-sm font-medium">{item.type}</Text>
                    <Text className="text-text-muted text-xs">{item.percentage}%</Text>
                  </View>
                  <View className="h-2.5 bg-bg-muted rounded-full overflow-hidden">
                    <View
                      className={`h-full rounded-full ${
                        item.percentage >= 100
                          ? 'bg-success'
                          : item.percentage >= 50
                            ? 'bg-accent'
                            : 'bg-warning'
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </View>
                  <Text className="text-text-muted text-xs mt-1">
                    {formatMoney(item.realise)} / {formatMoney(item.total)} ({item.count} objectif
                    {item.count > 1 ? 's' : ''})
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Quick links */}
        <View className="px-5">
          <Text className="text-text-primary text-lg font-bold mb-3">Acces rapides</Text>
          <View className="gap-2">
            <PressableCard
              className="flex-row items-center"
              onPress={() => router.push('/(agent)/objectifs')}
            >
              <View className="w-10 h-10 rounded-full bg-info/10 items-center justify-center">
                <Ionicons name="flag" size={20} color={colors.info} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-text-primary font-semibold text-sm">Voir objectifs</Text>
                <Text className="text-text-muted text-xs">Detail de vos objectifs du mois</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableCard>

            <PressableCard
              className="flex-row items-center"
              onPress={() => router.push('/(agent)/commissions')}
            >
              <View className="w-10 h-10 rounded-full bg-success/10 items-center justify-center">
                <Ionicons name="cash" size={20} color={colors.success} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-text-primary font-semibold text-sm">Voir commissions</Text>
                <Text className="text-text-muted text-xs">Historique de vos commissions</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableCard>

            <PressableCard
              className="flex-row items-center"
              onPress={() => router.push('/(agent)/leaderboard')}
            >
              <View className="w-10 h-10 rounded-full bg-warning/10 items-center justify-center">
                <Ionicons name="trophy" size={20} color={colors.warning} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-text-primary font-semibold text-sm">Classement</Text>
                <Text className="text-text-muted text-xs">Votre position dans l'equipe</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableCard>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
