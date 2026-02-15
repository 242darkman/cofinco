import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore, type OperationTerrain } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Badge } from '@/components/ui/badge';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatRelativeDate } from '@/lib/format';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  SUBMITTED: 'warning',
  APPROVED: 'success',
  PENDING_SETTLEMENT: 'info',
  SETTLED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Soumise',
  APPROVED: 'Approuvee',
  PENDING_SETTLEMENT: 'En attente',
  SETTLED: 'Reglee',
  REJECTED: 'Rejetee',
  CANCELLED: 'Annulee',
};

const FILTER_OPTIONS = [
  { value: '', label: 'Toutes' },
  { value: 'SUBMITTED', label: 'Soumises' },
  { value: 'APPROVED', label: 'Approuvees' },
  { value: 'REJECTED', label: 'Rejetees' },
  { value: 'SETTLED', label: 'Reglees' },
];

function OperationItem({ op, onPress }: { op: OperationTerrain; onPress: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const isCollect = op.type === 'COLLECT_CASH';

  return (
    <Pressable className="px-5 py-3 active:bg-bg-muted" onPress={onPress}>
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center flex-1">
          <View className={`w-8 h-8 rounded-full items-center justify-center mr-2 ${isCollect ? 'bg-success/10' : 'bg-warning/10'}`}>
            <Ionicons
              name={isCollect ? 'arrow-down-circle' : 'arrow-up-circle'}
              size={18}
              color={isCollect ? colors.success : colors.warning}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-primary font-medium text-sm" numberOfLines={1}>
              {isCollect ? 'Collecte' : 'Remise'}
              {op.clientNom ? ` — ${op.clientNom}` : ''}
            </Text>
            <Text className="text-text-muted text-xs">
              {formatRelativeDate(op.createdAt)}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-text-primary font-semibold text-sm">
            {formatMoney(op.montant)}
          </Text>
          <Badge
            label={STATUS_LABEL[op.statut] ?? op.statut}
            variant={STATUS_VARIANT[op.statut] ?? 'neutral'}
          />
        </View>
      </View>
      {op.observations && (
        <Text className="text-text-muted text-xs ml-10" numberOfLines={1}>
          {op.observations}
        </Text>
      )}
    </Pressable>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const getOperations = useAgentStore((s) => s.getOperations);
  const [operations, setOperations] = useState<OperationTerrain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filterStatut, setFilterStatut] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const params: Record<string, string> = { dateFrom: today.toISOString() };
      if (filterStatut) params.statut = filterStatut;
      const data = await getOperations(params);
      setOperations(data.operations);
      setTotal(data.total);
    } catch {
      setOperations([]);
    } finally {
      setIsLoading(false);
    }
  }, [getOperations, filterStatut]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return <Loading fullScreen message="Chargement..." />;
  }

  return (
    <View className="flex-1 bg-bg-base">
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-5 py-3 gap-2"
      >
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            className={`px-3 py-1.5 rounded-full ${
              filterStatut === opt.value ? 'bg-accent' : 'bg-bg-muted'
            }`}
            onPress={() => setFilterStatut(opt.value)}
          >
            <Text
              className={`text-xs font-semibold ${
                filterStatut === opt.value ? 'text-white' : 'text-text-muted'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View className="px-5 pb-2">
        <Text className="text-text-muted text-sm">
          {total} operation{total > 1 ? 's' : ''} aujourd'hui
        </Text>
      </View>

      <FlatList
        data={operations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OperationItem
            op={item}
            onPress={() => router.push({ pathname: '/(agent)/operation-detail', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-border-subtle mx-5" />}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        contentContainerClassName="pb-6"
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="receipt-outline" size={48} color="#94a3b8" />}
            title="Aucune operation"
            description="Vous n'avez pas encore d'operation aujourd'hui."
          />
        }
      />
    </View>
  );
}
