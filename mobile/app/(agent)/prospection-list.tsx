import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useProspections } from '@/hooks/use-agent';
import { useAgentStore } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatRelativeDate } from '@/lib/format';

// ─── Status config ──────────────────────────────────────────────────────────

type ProspectionStatus =
  | 'REGISTERED'
  | 'INTERESTED'
  | 'REFUSED'
  | 'TO_FOLLOW_UP'
  | 'CONVERTED_TO_CLIENT';

const STATUS_VARIANT: Record<ProspectionStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  REGISTERED: 'info',
  INTERESTED: 'success',
  REFUSED: 'danger',
  TO_FOLLOW_UP: 'warning',
  CONVERTED_TO_CLIENT: 'info',
};

const STATUS_LABEL: Record<ProspectionStatus, string> = {
  REGISTERED: 'Enregistre',
  INTERESTED: 'Interesse',
  REFUSED: 'Refuse',
  TO_FOLLOW_UP: 'A suivre',
  CONVERTED_TO_CLIENT: 'Converti',
};

const ALL_STATUSES: ProspectionStatus[] = [
  'REGISTERED',
  'INTERESTED',
  'REFUSED',
  'TO_FOLLOW_UP',
  'CONVERTED_TO_CLIENT',
];

// ─── Prospect item ──────────────────────────────────────────────────────────

interface ProspectItemProps {
  item: any;
  onPress: () => void;
}

function ProspectItem({ item, onPress }: ProspectItemProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <Pressable className="px-5 py-3 active:bg-bg-muted" onPress={onPress}>
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mr-3">
          <Ionicons name="person-outline" size={20} color={colors.accent} />
        </View>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold" numberOfLines={1}>
            {item.prenom} {item.nom}
          </Text>
          <View className="flex-row items-center mt-0.5">
            {item.telephone ? (
              <Text className="text-text-muted text-sm mr-3">{item.telephone}</Text>
            ) : null}
            {item.type_activite ? (
              <Text className="text-text-muted text-xs">{item.type_activite}</Text>
            ) : null}
          </View>
        </View>
        <View className="items-end">
          <Badge
            label={STATUS_LABEL[item.statut as ProspectionStatus] ?? item.statut}
            variant={STATUS_VARIANT[item.statut as ProspectionStatus] ?? 'neutral'}
          />
          {item.created_at && (
            <Text className="text-text-muted text-xs mt-1">
              {formatRelativeDate(item.created_at)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ProspectionListScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ProspectionStatus | null>(null);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: String(page),
      pageSize: '20',
    };
    if (employeId) params.agentId = employeId;
    if (debouncedSearch) params.search = debouncedSearch;
    if (activeFilter) params.statut = activeFilter;
    return params;
  }, [employeId, debouncedSearch, activeFilter, page]);

  const { data, isLoading, refetch, isRefetching } = useProspections(queryParams);

  const prospects = data?.data ?? [];
  const total = data?.total ?? 0;

  const toggleFilter = useCallback((status: ProspectionStatus) => {
    setActiveFilter((prev) => (prev === status ? null : status));
  }, []);

  const handleEndReached = useCallback(() => {
    if (data && page < (data.totalPages ?? 1)) {
      setPage((p) => p + 1);
    }
  }, [data, page]);

  if (isLoading && page === 1) {
    return <Loading fullScreen message="Chargement des prospects..." />;
  }

  return (
    <View className="flex-1 bg-bg-base">
      {/* Search bar */}
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-center bg-input-bg border border-input-border rounded-xl px-3">
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            className="flex-1 py-3 px-2 text-input-text text-base"
            placeholder="Rechercher un prospect..."
            placeholderTextColor={colors.inputPlaceholder}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Status filter chips */}
      <View className="pb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {ALL_STATUSES.map((status) => {
            const isActive = activeFilter === status;
            return (
              <Pressable
                key={status}
                onPress={() => toggleFilter(status)}
                className={`px-3 py-1.5 rounded-full border ${
                  isActive
                    ? 'bg-accent border-accent'
                    : 'bg-bg-muted border-border-subtle'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-text-secondary'
                  }`}
                >
                  {STATUS_LABEL[status]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Count header */}
      <View className="px-5 py-2">
        <Text className="text-text-muted text-sm">
          {total} prospect{total !== 1 ? 's' : ''} trouve{total !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Prospect list */}
      <FlatList
        data={prospects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProspectItem
            item={item}
            onPress={() =>
              router.push({
                pathname: '/(agent)/prospection-detail',
                params: { id: item.id },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-border-subtle mx-5" />}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              setPage(1);
              refetch();
            }}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        contentContainerClassName="pb-24"
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="people-outline" size={48} color="#94a3b8" />}
            title="Aucun prospect"
            description={
              debouncedSearch || activeFilter
                ? 'Aucun resultat pour ces criteres. Essayez de modifier votre recherche.'
                : 'Commencez par enregistrer un nouveau prospect.'
            }
            action={
              !debouncedSearch && !activeFilter ? (
                <Button
                  title="Nouveau prospect"
                  onPress={() => router.push('/(agent)/prospection-form')}
                />
              ) : undefined
            }
          />
        }
      />

      {/* FAB - New prospect */}
      <View className="absolute bottom-6 right-5">
        <Pressable
          className="w-14 h-14 rounded-full bg-accent items-center justify-center shadow-lg active:opacity-90"
          onPress={() => router.push('/(agent)/prospection-form')}
          accessibilityRole="button"
          accessibilityLabel="Nouveau prospect"
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
