import { useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore } from '@/stores/agent-store';
import { useAuthStore } from '@/stores/auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CONTEXT_LABELS } from '@shared/types/mobile';
import { Colors } from '@/constants/theme';
import { Card, PressableCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';

const SESSION_STATUS_LABEL: Record<string, string> = {
  REQUESTING_FUNDS: 'En attente de fonds',
  ACTIVE: 'Active',
  CLOSING: 'En cloture',
  CLOSED: 'Fermee',
};

const SESSION_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  REQUESTING_FUNDS: 'warning',
  ACTIVE: 'success',
  CLOSING: 'info',
  CLOSED: 'neutral',
};

export default function AgentDashboard() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const user = useAuthStore((s) => s.user);
  const availableContexts = useAuthStore((s) => s.availableContexts);
  const switchContext = useAuthStore((s) => s.switchContext);
  const canSwitchToClient = availableContexts.includes('client');
  const { session, caisse, isLoading, checkActiveSession, getCaisseBalance, setEmployeId } =
    useAgentStore();

  // Initialize employeId from auth user's employee data
  useEffect(() => {
    const authUser = useAuthStore.getState().user;
    if (authUser && (authUser as any).employeId) {
      setEmployeId((authUser as any).employeId);
    }
  }, []);

  useEffect(() => {
    checkActiveSession();
    getCaisseBalance();
  }, []);

  const onRefresh = useCallback(() => {
    checkActiveSession();
    getCaisseBalance();
  }, []);

  const isSessionActive = session?.statut === 'ACTIVE';

  if (isLoading) {
    return <Loading fullScreen message="Chargement de la session..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-4">
          <Text className="text-text-muted text-sm">{CONTEXT_LABELS.employee}</Text>
          <Text className="text-text-primary text-xl font-bold">
            {user?.nom} {user?.prenom ?? ''}
          </Text>
        </View>

        {/* Session status */}
        <View className="px-5 mb-4">
          {session ? (
            <Card variant="elevated">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-text-primary font-semibold">Session en cours</Text>
                <Badge
                  label={SESSION_STATUS_LABEL[session.statut] ?? session.statut}
                  variant={SESSION_STATUS_VARIANT[session.statut] ?? 'neutral'}
                />
              </View>

              {/* Caisse balance */}
              {caisse && (
                <View className="bg-bg-muted rounded-xl p-4 mb-3">
                  <Text className="text-text-muted text-xs mb-1">Solde caisse terrain</Text>
                  <Text className="text-text-primary text-2xl font-bold">
                    {formatMoney(Number(caisse.disponible) || 0)}
                  </Text>
                  <View className="flex-row mt-2 gap-4">
                    <View>
                      <Text className="text-text-muted text-xs">Valide</Text>
                      <Text className="text-success text-sm font-medium">
                        {formatMoney(Number(caisse.soldeValide) || 0)}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-text-muted text-xs">En attente</Text>
                      <Text className="text-warning text-sm font-medium">
                        {formatMoney(Number(caisse.pendingIn) || 0)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {session.statut === 'REQUESTING_FUNDS' && (
                <View className="bg-warning/10 rounded-xl p-3">
                  <Text className="text-warning text-sm text-center">
                    En attente du provisionnement par la caisse centrale.
                    Montant demande: {formatMoney(session.montantDemande)}
                  </Text>
                </View>
              )}

              {session.nombreOperations != null && (
                <View className="flex-row items-center justify-between mt-3">
                  <Text className="text-text-muted text-sm">Operations</Text>
                  <Text className="text-text-primary font-medium">{session.nombreOperations}</Text>
                </View>
              )}
            </Card>
          ) : (
            <Card variant="elevated">
              <View className="items-center py-4">
                <Ionicons name="briefcase-outline" size={40} color={colors.textMuted} />
                <Text className="text-text-primary font-semibold mt-2">Pas de session active</Text>
                <Text className="text-text-muted text-sm text-center mt-1">
                  Demandez un provisionnement pour commencer votre tournee.
                </Text>
                <Button
                  title="Demander un provisionnement"
                  onPress={() => router.push('/(agent)/session-summary')}
                  className="mt-4"
                />
              </View>
            </Card>
          )}
        </View>

        {/* Quick actions — only when session is ACTIVE */}
        {isSessionActive && (
          <View className="px-5 mb-6">
            <Text className="text-text-primary text-lg font-bold mb-3">Actions rapides</Text>
            <View className="flex-row gap-3">
              <PressableCard
                className="flex-1 items-center py-5"
                onPress={() => router.push('/(agent)/deposit')}
              >
                <View className="w-12 h-12 rounded-full bg-success/10 items-center justify-center mb-2">
                  <Ionicons name="arrow-down-circle" size={28} color={colors.success} />
                </View>
                <Text className="text-text-primary font-semibold text-sm">Collecter</Text>
                <Text className="text-text-muted text-xs mt-0.5">Encaisser client</Text>
              </PressableCard>

              <PressableCard
                className="flex-1 items-center py-5"
                onPress={() => router.push('/(agent)/client-search')}
              >
                <View className="w-12 h-12 rounded-full bg-accent/10 items-center justify-center mb-2">
                  <Ionicons name="search" size={28} color={colors.accent} />
                </View>
                <Text className="text-text-primary font-semibold text-sm">Rechercher</Text>
                <Text className="text-text-muted text-xs mt-0.5">Trouver un client</Text>
              </PressableCard>
            </View>

            <View className="flex-row gap-3 mt-3">
              <PressableCard
                className="flex-1 items-center py-5"
                onPress={() => router.push('/(agent)/history')}
              >
                <View className="w-12 h-12 rounded-full bg-info/10 items-center justify-center mb-2">
                  <Ionicons name="list" size={28} color={colors.info} />
                </View>
                <Text className="text-text-primary font-semibold text-sm">Historique</Text>
                <Text className="text-text-muted text-xs mt-0.5">Operations du jour</Text>
              </PressableCard>

              <PressableCard
                className="flex-1 items-center py-5"
                onPress={() => {
                  Alert.alert(
                    'Cloturer la session',
                    'Etes-vous sur de vouloir cloturer votre session terrain ?',
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Cloturer', onPress: () => router.push('/(agent)/session-summary') },
                    ]
                  );
                }}
              >
                <View className="w-12 h-12 rounded-full bg-danger/10 items-center justify-center mb-2">
                  <Ionicons name="close-circle" size={28} color={colors.danger} />
                </View>
                <Text className="text-text-primary font-semibold text-sm">Cloturer</Text>
                <Text className="text-text-muted text-xs mt-0.5">Fin de journee</Text>
              </PressableCard>
            </View>
          </View>
        )}

        {/* Switch to client mode — only if user has client context */}
        {canSwitchToClient && (
          <View className="px-5">
            <Button
              title={`Basculer vers ${CONTEXT_LABELS.client}`}
              variant="ghost"
              onPress={() => switchContext('client')}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
