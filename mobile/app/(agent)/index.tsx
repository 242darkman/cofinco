import { useEffect, useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore, type OperationTerrain } from '@/stores/agent-store';
import { useAuthStore } from '@/stores/auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CONTEXT_LABELS } from '@shared/types/mobile';
import { Colors } from '@/constants/theme';
import { Card, PressableCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatRelativeDate } from '@/lib/format';
import { useObjectifs, useCommissions, usePlanning, useEnquetesCredit } from '@/hooks/use-agent';
import { startLocationTracking, stopLocationTracking, isLocationTracking } from '@/lib/geolocation';

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
  const { session, caisse, isLoading, checkActiveSession, getCaisseBalance, setEmployeId, employeId } =
    useAgentStore();

  const [recentOps, setRecentOps] = useState<OperationTerrain[]>([]);
  const [gpsActive, setGpsActive] = useState(isLocationTracking());

  // KPI data
  const today = new Date().toISOString().slice(0, 10);
  const periode = new Date().toISOString().slice(0, 7);
  const { data: objectifs } = useObjectifs(employeId, periode);
  const { data: commissions } = useCommissions(employeId, periode);
  const { data: todayPlanning } = usePlanning(employeId, today);
  const { data: enquetes } = useEnquetesCredit();

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

  // Load recent operations
  useEffect(() => {
    if (!employeId) return;
    const load = async () => {
      try {
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const data = await useAgentStore.getState().getOperations({ dateFrom: todayDate.toISOString(), limit: 5 });
        setRecentOps(data.operations);
      } catch {}
    };
    load();
  }, [employeId]);

  const onRefresh = useCallback(() => {
    checkActiveSession();
    getCaisseBalance();
  }, []);

  const toggleGps = async () => {
    if (gpsActive) {
      stopLocationTracking();
      setGpsActive(false);
    } else if (employeId) {
      const started = await startLocationTracking(employeId);
      setGpsActive(started);
      if (!started) Alert.alert('GPS', 'Permission de localisation refusee');
    }
  };

  const isSessionActive = session?.statut === 'ACTIVE';

  // Compute KPIs
  const objectifsArr = Array.isArray(objectifs) ? objectifs : [];
  const commissionsArr = Array.isArray(commissions) ? commissions : [];
  const planningArr = Array.isArray(todayPlanning) ? todayPlanning : [];
  const enquetesArr = Array.isArray(enquetes) ? enquetes : [];

  const objectifsAtteints = objectifsArr.filter((o: any) =>
    (o.valeurRealisee / o.valeurObjectif) >= 1
  ).length;
  const commissionsNet = commissionsArr.reduce((s: number, c: any) => s + (Number(c.montantNet) || 0), 0);
  const pendingEnquetes = enquetesArr.filter((e: any) => e.statut === 'ASSIGNED' || e.statut === 'IN_PROGRESS').length;

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
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View>
            <Text className="text-text-muted text-sm">{CONTEXT_LABELS.employee}</Text>
            <Text className="text-text-primary text-xl font-bold">
              {user?.nom} {user?.prenom ?? ''}
            </Text>
          </View>
          <Pressable
            className={`w-10 h-10 rounded-full items-center justify-center ${gpsActive ? 'bg-success/10' : 'bg-bg-muted'}`}
            onPress={toggleGps}
          >
            <Ionicons name="navigate" size={20} color={gpsActive ? colors.success : colors.textMuted} />
          </Pressable>
        </View>

        {/* KPI Strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-5 py-2 gap-3"
        >
          <KpiChip
            icon="trophy-outline"
            label="Objectifs"
            value={`${objectifsAtteints}/${objectifsArr.length}`}
            color={colors.info}
            onPress={() => router.push('/(agent)/objectifs')}
          />
          <KpiChip
            icon="cash-outline"
            label="Commissions"
            value={formatMoney(commissionsNet)}
            color={colors.success}
            onPress={() => router.push('/(agent)/commissions')}
          />
          <KpiChip
            icon="calendar-outline"
            label="Planning"
            value={`${planningArr.length}`}
            color={colors.accent}
            onPress={() => router.push('/(agent)/planning')}
          />
          <KpiChip
            icon="document-text-outline"
            label="Enquetes"
            value={`${pendingEnquetes}`}
            color={colors.warning}
            onPress={() => router.push('/(agent)/enquetes')}
          />
        </ScrollView>

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
                    En attente du provisionnement. Montant demande: {formatMoney(session.montantDemande)}
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
          <View className="px-5 mb-4">
            <Text className="text-text-primary text-lg font-bold mb-3">Actions rapides</Text>
            <View className="flex-row gap-3">
              <ActionTile
                icon="arrow-down-circle"
                label="Collecter"
                subtitle="Encaisser client"
                color={colors.success}
                bgColor="bg-success/10"
                onPress={() => router.push('/(agent)/client-search')}
              />
              <ActionTile
                icon="arrow-up-circle"
                label="Retrait"
                subtitle="Retrait client"
                color={colors.warning}
                bgColor="bg-warning/10"
                onPress={() => router.push({ pathname: '/(agent)/client-search', params: { target: 'withdrawal' } })}
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <ActionTile
                icon="swap-vertical"
                label="Remise"
                subtitle="Remettre fonds"
                color={colors.accent}
                bgColor="bg-accent/10"
                onPress={() => router.push('/(agent)/settlement')}
              />
              <ActionTile
                icon="person-add"
                label="Prospect"
                subtitle="Nouveau prospect"
                color={colors.info}
                bgColor="bg-info/10"
                onPress={() => router.push('/(agent)/prospection-form')}
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <ActionTile
                icon="search"
                label="Rechercher"
                subtitle="Trouver un client"
                color={colors.accent}
                bgColor="bg-accent/10"
                onPress={() => router.push('/(agent)/client-search')}
              />
              <ActionTile
                icon="list"
                label="Historique"
                subtitle="Operations du jour"
                color={colors.info}
                bgColor="bg-info/10"
                onPress={() => router.push('/(agent)/history')}
              />
            </View>
          </View>
        )}

        {/* Menu grid - always visible */}
        <View className="px-5 mb-4">
          <Text className="text-text-primary text-lg font-bold mb-3">Fonctionnalites</Text>
          <View className="flex-row flex-wrap gap-3">
            <MenuTile icon="people-outline" label="Prospects" onPress={() => router.push('/(agent)/prospection-list')} color={colors.info} />
            <MenuTile icon="bar-chart-outline" label="KPI" onPress={() => router.push('/(agent)/kpi')} color={colors.success} />
            <MenuTile icon="trophy-outline" label="Objectifs" onPress={() => router.push('/(agent)/objectifs')} color={colors.accent} />
            <MenuTile icon="cash-outline" label="Commissions" onPress={() => router.push('/(agent)/commissions')} color={colors.success} />
            <MenuTile icon="podium-outline" label="Classement" onPress={() => router.push('/(agent)/leaderboard')} color={colors.warning} />
            <MenuTile icon="calendar-outline" label="Planning" onPress={() => router.push('/(agent)/planning')} color={colors.accent} />
            <MenuTile icon="document-text-outline" label="Enquetes" onPress={() => router.push('/(agent)/enquetes')} color={colors.info} />
            <MenuTile icon="school-outline" label="Formations" onPress={() => router.push('/(agent)/formations')} color={colors.success} />
            <MenuTile icon="warning-outline" label="Incidents" onPress={() => router.push('/(agent)/incidents')} color={colors.danger} />
            <MenuTile icon="hardware-chip-outline" label="Materiel" onPress={() => router.push('/(agent)/materiel')} color={colors.textMuted} />
            <MenuTile icon="clipboard-outline" label="Rapports" onPress={() => router.push('/(agent)/rapports')} color={colors.info} />
          </View>
        </View>

        {/* Close session button */}
        {isSessionActive && (
          <View className="px-5 mb-4">
            <Button
              title="Cloturer la session"
              variant="danger"
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
            />
          </View>
        )}

        {/* Recent operations */}
        {recentOps.length > 0 && (
          <View className="px-5 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-text-primary text-lg font-bold">Operations recentes</Text>
              <Button title="Tout voir" variant="ghost" size="sm" onPress={() => router.push('/(agent)/history')} />
            </View>
            <Card>
              {recentOps.map((op, i) => (
                <Pressable
                  key={op.id}
                  className={`flex-row items-center justify-between py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                  onPress={() => router.push({ pathname: '/(agent)/operation-detail', params: { id: op.id } })}
                >
                  <View className="flex-row items-center flex-1">
                    <Ionicons
                      name={op.type === 'COLLECT_CASH' ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={16}
                      color={op.type === 'COLLECT_CASH' ? colors.success : colors.warning}
                    />
                    <Text className="text-text-primary text-sm ml-2 flex-1" numberOfLines={1}>
                      {op.clientNom || (op.type === 'COLLECT_CASH' ? 'Collecte' : 'Remise')}
                    </Text>
                  </View>
                  <Text className="text-text-primary text-sm font-medium">{formatMoney(op.montant)}</Text>
                </Pressable>
              ))}
            </Card>
          </View>
        )}

        {/* Switch to client mode */}
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiChip({ icon, label, value, color, onPress }: {
  icon: string; label: string; value: string; color: string; onPress: () => void;
}) {
  return (
    <PressableCard className="px-4 py-3 min-w-[120px]" onPress={onPress}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text className="text-text-primary text-base font-bold mt-1">{value}</Text>
      <Text className="text-text-muted text-xs">{label}</Text>
    </PressableCard>
  );
}

function ActionTile({ icon, label, subtitle, color, bgColor, onPress }: {
  icon: string; label: string; subtitle: string; color: string; bgColor: string; onPress: () => void;
}) {
  return (
    <PressableCard className="flex-1 items-center py-5" onPress={onPress}>
      <View className={`w-12 h-12 rounded-full ${bgColor} items-center justify-center mb-2`}>
        <Ionicons name={icon as any} size={28} color={color} />
      </View>
      <Text className="text-text-primary font-semibold text-sm">{label}</Text>
      <Text className="text-text-muted text-xs mt-0.5">{subtitle}</Text>
    </PressableCard>
  );
}

function MenuTile({ icon, label, color, onPress }: {
  icon: string; label: string; color: string; onPress: () => void;
}) {
  return (
    <Pressable
      className="w-[30%] items-center py-3 active:opacity-70"
      onPress={onPress}
    >
      <View className="w-10 h-10 rounded-xl bg-bg-muted items-center justify-center mb-1">
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text className="text-text-primary text-xs font-medium text-center">{label}</Text>
    </Pressable>
  );
}
