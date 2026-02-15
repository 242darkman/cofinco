import { useState, useCallback } from 'react';
import { View, Text, FlatList, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/lib/api-client';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/loading';

interface ClientResult {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  email?: string;
  is_active: boolean;
  has_compte_courant: boolean;
  agence_nom: string;
  photo_profile?: string;
}

export default function ClientSearchScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await api.get<ClientResult[]>(
        `/api/clients/search?q=${encodeURIComponent(query.trim())}`
      );
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const selectClient = (client: ClientResult) => {
    router.push({
      pathname: '/(agent)/deposit',
      params: {
        clientId: client.id,
        clientNom: `${client.prenom ?? ''} ${client.nom}`.trim(),
        clientTelephone: client.telephone,
      },
    });
  };

  return (
    <View className="flex-1 bg-bg-base">
      {/* Search bar */}
      <View className="px-5 pt-4 pb-3">
        <View className="flex-row items-center bg-input border border-input-border rounded-xl px-3">
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            className="flex-1 py-3 px-2 text-text-primary text-base"
            placeholder="Nom, telephone ou email..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            autoFocus
          />
          {isSearching && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
      </View>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            className="px-5 py-3 active:bg-bg-muted"
            onPress={() => selectClient(item)}
          >
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mr-3">
                <Ionicons name="person" size={20} color={colors.accent} />
              </View>
              <View className="flex-1">
                <Text className="text-text-primary font-semibold">
                  {item.prenom} {item.nom}
                </Text>
                <Text className="text-text-muted text-sm">{item.telephone}</Text>
              </View>
              <View className="items-end">
                {item.is_active ? (
                  <View className="bg-success/10 rounded-full px-2 py-0.5">
                    <Text className="text-success text-xs">Actif</Text>
                  </View>
                ) : (
                  <View className="bg-danger/10 rounded-full px-2 py-0.5">
                    <Text className="text-danger text-xs">Inactif</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-border-subtle mx-5" />}
        contentContainerClassName="pb-6"
        ListEmptyComponent={
          hasSearched && !isSearching ? (
            <EmptyState
              icon={<Ionicons name="people-outline" size={48} color="#94a3b8" />}
              title="Aucun resultat"
              description="Essayez un autre nom ou numero de telephone."
            />
          ) : null
        }
      />
    </View>
  );
}
