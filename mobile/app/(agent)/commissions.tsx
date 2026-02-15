import { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, LayoutAnimation } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore } from '@/stores/agent-store';
import { useCommissions } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatFullDate } from '@/lib/format';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatPeriodLabel(period: string | null): string {
  if (!period) return 'Toutes les periodes';
  const [year, month] = period.split('-');
  const months = [
    'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
  ];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function shiftPeriod(period: string | null, delta: number): string | null {
  if (!period) return getCurrentPeriod();
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  PENDING: { label: 'En attente', variant: 'warning' },
  PAID: { label: 'Payee', variant: 'success' },
  CANCELLED: { label: 'Annulee', variant: 'danger' },
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Especes',
  BANK_TRANSFER: 'Virement bancaire',
  MOBILE_MONEY: 'Mobile Money',
  CHECK: 'Cheque',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function CommissionsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [period, setPeriod] = useState<string | null>(getCurrentPeriod);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const commissionsQuery = useCommissions(employeId, period ?? undefined);
  const commissions = commissionsQuery.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await commissionsQuery.refetch();
    setRefreshing(false);
  }, [commissionsQuery]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = commissions.length;
    const montantNet = commissions.reduce(
      (sum: number, c: any) => sum + (Number(c.montantNet) || Number(c.montant_net) || 0),
      0
    );
    const payees = commissions.filter((c: any) => c.statut === 'PAID').length;
    const enAttente = commissions.filter((c: any) => c.statut === 'PENDING').length;

    return { total, montantNet, payees, enAttente };
  }, [commissions]);

  // ── Toggle expand ─────────────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ── Toggle all/filtered ───────────────────────────────────────────────────

  const toggleAllPeriods = useCallback(() => {
    setPeriod((prev) => (prev === null ? getCurrentPeriod() : null));
  }, []);

  // ── Render item ───────────────────────────────────────────────────────────

  const renderCommission = useCallback(
    ({ item }: { item: any }) => {
      const id = String(item.id || item.commissionId);
      const isExpanded = expandedId === id;
      const statusConfig = STATUS_CONFIG[item.statut] ?? {
        label: item.statut,
        variant: 'neutral' as const,
      };

      const montantCollecte = Number(item.montantCollecte) || Number(item.montant_collecte) || 0;
      const tauxCommission = Number(item.tauxCommission) || Number(item.taux_commission) || Number(item.taux) || 0;
      const montantCommission = Number(item.montantCommission) || Number(item.montant_commission) || 0;
      const bonuses = Number(item.bonuses) || Number(item.montant_bonus) || 0;
      const deductions = Number(item.deductions) || Number(item.montant_deduction) || 0;
      const montantNet = Number(item.montantNet) || Number(item.montant_net) || 0;
      const periodLabel = item.periode || item.period || '';
      const paymentDate = item.datePaiement || item.date_paiement || item.paidAt;
      const paymentMethod = item.methodePaiement || item.methode_paiement || item.paymentMethod;

      return (
        <Pressable onPress={() => toggleExpand(id)}>
          <Card className="mb-3">
            {/* Header: period badge + status */}
            <View className="flex-row items-center justify-between mb-3">
              {periodLabel ? (
                <Badge label={periodLabel} variant="info" />
              ) : (
                <View />
              )}
              <Badge label={statusConfig.label} variant={statusConfig.variant} />
            </View>

            {/* Main values: Collecte -> Taux -> Net */}
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1">
                <Text className="text-text-muted text-xs">Collecte</Text>
                <Text className="text-text-primary text-sm font-semibold">
                  {formatMoney(montantCollecte)}
                </Text>
              </View>
              <View className="items-center px-2">
                <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                <Text className="text-text-muted text-xs">{tauxCommission}%</Text>
              </View>
              <View className="flex-1 items-end">
                <Text className="text-text-muted text-xs">Net</Text>
                <Text className="text-success text-sm font-bold">
                  {formatMoney(montantNet)}
                </Text>
              </View>
            </View>

            {/* Payment info if paid (always visible) */}
            {item.statut === 'PAID' && paymentDate && (
              <View className="flex-row items-center mt-1">
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text className="text-success text-xs ml-1">
                  Payee le {formatFullDate(paymentDate)}
                  {paymentMethod ? ` - ${METHOD_LABEL[paymentMethod] ?? paymentMethod}` : ''}
                </Text>
              </View>
            )}

            {/* Expanded detail */}
            {isExpanded && (
              <View className="mt-3 pt-3 border-t border-border-subtle">
                <Text className="text-text-primary text-sm font-semibold mb-2">
                  Detail du calcul
                </Text>
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-muted text-sm">Montant collecte</Text>
                    <Text className="text-text-primary text-sm font-medium">
                      {formatMoney(montantCollecte)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                      <Text className="text-text-muted text-sm ml-1">
                        Commission ({tauxCommission}%)
                      </Text>
                    </View>
                    <Text className="text-text-primary text-sm font-medium">
                      {formatMoney(montantCommission)}
                    </Text>
                  </View>
                  {bonuses > 0 && (
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Ionicons name="add-circle" size={12} color={colors.success} />
                        <Text className="text-success text-sm ml-1">Bonus</Text>
                      </View>
                      <Text className="text-success text-sm font-medium">
                        +{formatMoney(bonuses)}
                      </Text>
                    </View>
                  )}
                  {deductions > 0 && (
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Ionicons name="remove-circle" size={12} color={colors.danger} />
                        <Text className="text-danger text-sm ml-1">Deductions</Text>
                      </View>
                      <Text className="text-danger text-sm font-medium">
                        -{formatMoney(deductions)}
                      </Text>
                    </View>
                  )}
                  <View className="border-t border-border-subtle pt-2 mt-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-text-primary text-sm font-bold">Net</Text>
                      <Text className="text-success text-base font-bold">
                        {formatMoney(montantNet)}
                      </Text>
                    </View>
                  </View>

                  {/* Payment detail if paid */}
                  {item.statut === 'PAID' && paymentDate && (
                    <View className="mt-2 pt-2 border-t border-border-subtle">
                      <Text className="text-text-primary text-sm font-semibold mb-1">
                        Paiement
                      </Text>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-text-muted text-sm">Date</Text>
                        <Text className="text-text-primary text-sm">
                          {formatFullDate(paymentDate)}
                        </Text>
                      </View>
                      {paymentMethod && (
                        <View className="flex-row items-center justify-between mt-1">
                          <Text className="text-text-muted text-sm">Methode</Text>
                          <Text className="text-text-primary text-sm">
                            {METHOD_LABEL[paymentMethod] ?? paymentMethod}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <Pressable onPress={() => toggleExpand(id)} className="mt-3 items-center">
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

  if (commissionsQuery.isLoading && !refreshing) {
    return <Loading fullScreen message="Chargement des commissions..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      {/* Period selector */}
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable
          onPress={() => setPeriod((p) => shiftPeriod(p, -1))}
          className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center"
          disabled={period === null}
          style={period === null ? { opacity: 0.3 } : undefined}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={toggleAllPeriods}>
          <Text className="text-text-primary text-base font-semibold">
            {formatPeriodLabel(period)}
          </Text>
          <Text className="text-accent text-xs text-center">
            {period ? 'Voir toutes' : 'Filtrer par mois'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setPeriod((p) => shiftPeriod(p, 1))}
          className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center"
          disabled={period === null}
          style={period === null ? { opacity: 0.3 } : undefined}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Stats row */}
      <View className="px-5 mb-4">
        <View className="flex-row gap-2">
          <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
            <Text className="text-text-primary text-lg font-bold">{stats.total}</Text>
            <Text className="text-text-muted text-xs">Total</Text>
          </View>
          <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
            <Text className="text-success text-sm font-bold" numberOfLines={1}>
              {formatMoney(stats.montantNet)}
            </Text>
            <Text className="text-text-muted text-xs">Net total</Text>
          </View>
        </View>
        <View className="flex-row gap-2 mt-2">
          <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
            <Text className="text-success text-lg font-bold">{stats.payees}</Text>
            <Text className="text-text-muted text-xs">Payees</Text>
          </View>
          <View className="flex-1 bg-card-bg border border-card-border rounded-xl p-3 items-center">
            <Text className="text-warning text-lg font-bold">{stats.enAttente}</Text>
            <Text className="text-text-muted text-xs">En attente</Text>
          </View>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={commissions}
        keyExtractor={(item: any) => String(item.id || item.commissionId)}
        renderItem={renderCommission}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="cash-outline" size={48} color={colors.textMuted} />}
            title="Aucune commission"
            description="Aucune commission pour cette periode."
          />
        }
      />
    </SafeAreaView>
  );
}
