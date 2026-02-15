import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

import { useAgentStore } from '@/stores/agent-store';
import {
  useFormationsCatalog,
  useFormationsSuivi,
  useEnrollFormation,
  useUpdateFormationProgress,
} from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatFullDate } from '@/lib/format';

// ─── Types & constants ──────────────────────────────────────────────────────

type FormationSuiviStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

const SUIVI_STATUS_VARIANT: Record<FormationSuiviStatus, 'neutral' | 'info' | 'success'> = {
  PLANNED: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
};

const SUIVI_STATUS_LABEL: Record<FormationSuiviStatus, string> = {
  PLANNED: 'Planifie',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Termine',
};

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function FormationsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [activeSection, setActiveSection] = useState<'enrolled' | 'catalog'>('enrolled');

  const { data: catalog, isLoading: loadingCatalog, refetch: refetchCatalog } = useFormationsCatalog();
  const { data: suivi, isLoading: loadingSuivi, refetch: refetchSuivi } = useFormationsSuivi(employeId);
  const enrollMutation = useEnrollFormation();
  const progressMutation = useUpdateFormationProgress();

  // Track in-flight slider changes
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});

  const isLoading = loadingCatalog || loadingSuivi;

  const enrolledFormationIds = useMemo(() => {
    if (!Array.isArray(suivi)) return new Set<number>();
    return new Set(suivi.map((s: any) => s.formationId || s.formation_id));
  }, [suivi]);

  const onRefresh = useCallback(() => {
    refetchCatalog();
    refetchSuivi();
  }, [refetchCatalog, refetchSuivi]);

  const handleEnroll = useCallback(
    async (formationId: number) => {
      if (!employeId) return;
      Alert.alert(
        "S'inscrire",
        'Voulez-vous vous inscrire a cette formation ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: "S'inscrire",
            onPress: async () => {
              try {
                await enrollMutation.mutateAsync({ agent_id: employeId, formation_id: formationId });
                Alert.alert('Succes', 'Inscription reussie.');
              } catch (error: any) {
                Alert.alert('Erreur', error?.message || "Impossible de s'inscrire");
              }
            },
          },
        ]
      );
    },
    [employeId, enrollMutation]
  );

  const handleUpdateProgress = useCallback(
    async (id: string, progression: number) => {
      try {
        const statut = progression >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
        await progressMutation.mutateAsync({ id, progression, statut });
      } catch (error: any) {
        Alert.alert('Erreur', error?.message || 'Mise a jour impossible');
      }
    },
    [progressMutation]
  );

  if (isLoading) {
    return <Loading fullScreen message="Chargement des formations..." />;
  }

  const enrolledItems = Array.isArray(suivi) ? suivi : [];
  const catalogItems = Array.isArray(catalog) ? catalog : [];

  return (
    <View className="flex-1 bg-bg-base">
      {/* Section tabs */}
      <View className="flex-row border-b border-border-subtle">
        <Pressable
          onPress={() => setActiveSection('enrolled')}
          className={`flex-1 items-center py-3 ${
            activeSection === 'enrolled' ? 'border-b-2 border-accent' : ''
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              activeSection === 'enrolled' ? 'text-accent' : 'text-text-muted'
            }`}
          >
            Mes formations ({enrolledItems.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveSection('catalog')}
          className={`flex-1 items-center py-3 ${
            activeSection === 'catalog' ? 'border-b-2 border-accent' : ''
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              activeSection === 'catalog' ? 'text-accent' : 'text-text-muted'
            }`}
          >
            Catalogue ({catalogItems.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
      >
        {/* ─── Enrolled formations ─────────────────────────────────────── */}
        {activeSection === 'enrolled' && (
          <>
            {enrolledItems.length === 0 ? (
              <EmptyState
                icon={<Ionicons name="school-outline" size={48} color={colors.textMuted} />}
                title="Aucune formation"
                description="Vous n'etes inscrit a aucune formation. Consultez le catalogue."
                action={
                  <Button
                    title="Voir le catalogue"
                    variant="outline"
                    size="sm"
                    onPress={() => setActiveSection('catalog')}
                  />
                }
              />
            ) : (
              <View className="gap-3">
                {enrolledItems.map((item: any) => {
                  const statusKey = (item.statut as FormationSuiviStatus) || 'PLANNED';
                  const progression = sliderValues[item.id] ?? (item.progression || 0);

                  return (
                    <Card key={item.id} variant="elevated">
                      <View className="flex-row items-start justify-between mb-2">
                        <View className="flex-1 mr-2">
                          <Text className="text-text-primary font-semibold text-base">
                            {item.titre || item.formation?.titre || 'Formation'}
                          </Text>
                          {(item.formateur || item.formation?.formateur) && (
                            <Text className="text-text-muted text-sm">
                              Par {item.formateur || item.formation?.formateur}
                            </Text>
                          )}
                        </View>
                        <Badge
                          label={SUIVI_STATUS_LABEL[statusKey] || statusKey}
                          variant={SUIVI_STATUS_VARIANT[statusKey] || 'neutral'}
                        />
                      </View>

                      {/* Progress bar */}
                      <View className="mb-2">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-text-muted text-xs">Progression</Text>
                          <Text className="text-text-primary text-xs font-medium">
                            {Math.round(progression)}%
                          </Text>
                        </View>
                        <View className="h-2 bg-bg-muted rounded-full overflow-hidden">
                          <View
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${Math.min(progression, 100)}%` }}
                          />
                        </View>
                      </View>

                      {/* Score if evaluated */}
                      {item.score != null && (
                        <View className="flex-row items-center mb-2">
                          <Ionicons name="star" size={14} color={colors.warning} />
                          <Text className="text-text-primary text-sm font-medium ml-1">
                            Score: {item.score}/100
                          </Text>
                        </View>
                      )}

                      {/* Certificate info */}
                      {item.certificat && (
                        <View className="flex-row items-center bg-success/10 rounded-lg px-3 py-2 mb-2">
                          <Ionicons name="ribbon-outline" size={16} color={colors.success} />
                          <Text className="text-success text-xs font-medium ml-2">
                            Certificat obtenu
                          </Text>
                        </View>
                      )}

                      {/* Slider to update progression if IN_PROGRESS */}
                      {statusKey === 'IN_PROGRESS' && (
                        <View className="mt-1">
                          <Slider
                            minimumValue={0}
                            maximumValue={100}
                            step={5}
                            value={progression}
                            onValueChange={(val: number) =>
                              setSliderValues((prev) => ({ ...prev, [item.id]: val }))
                            }
                            onSlidingComplete={(val: number) => handleUpdateProgress(item.id, val)}
                            minimumTrackTintColor={colors.accent}
                            maximumTrackTintColor={colors.borderDefault}
                            thumbTintColor={colors.accent}
                          />
                        </View>
                      )}
                    </Card>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ─── Catalog ────────────────────────────────────────────────── */}
        {activeSection === 'catalog' && (
          <>
            {catalogItems.length === 0 ? (
              <EmptyState
                icon={<Ionicons name="book-outline" size={48} color={colors.textMuted} />}
                title="Catalogue vide"
                description="Aucune formation disponible pour le moment."
              />
            ) : (
              <View className="gap-3">
                {catalogItems.map((formation: any) => {
                  const isEnrolled = enrolledFormationIds.has(formation.id);
                  const capacity = formation.capacite || formation.placesMax;
                  const enrolled = formation.inscrits || formation.nombreInscrits || 0;
                  const isFull = capacity ? enrolled >= capacity : false;

                  return (
                    <Card key={formation.id} variant="elevated">
                      <Text className="text-text-primary font-semibold text-base mb-1">
                        {formation.titre}
                      </Text>

                      {formation.formateur && (
                        <View className="flex-row items-center mb-1">
                          <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                          <Text className="text-text-muted text-sm ml-1">
                            {formation.formateur}
                          </Text>
                        </View>
                      )}

                      {(formation.dateDebut || formation.dateFin) && (
                        <View className="flex-row items-center mb-1">
                          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                          <Text className="text-text-muted text-sm ml-1">
                            {formation.dateDebut ? formatFullDate(formation.dateDebut) : ''}
                            {formation.dateFin ? ` - ${formatFullDate(formation.dateFin)}` : ''}
                          </Text>
                        </View>
                      )}

                      {capacity != null && (
                        <View className="flex-row items-center mb-2">
                          <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                          <Text
                            className={`text-sm ml-1 ${
                              isFull ? 'text-danger font-medium' : 'text-text-muted'
                            }`}
                          >
                            {enrolled}/{capacity} participants{isFull ? ' (complet)' : ''}
                          </Text>
                        </View>
                      )}

                      {formation.description && (
                        <Text className="text-text-muted text-xs mb-3" numberOfLines={3}>
                          {formation.description}
                        </Text>
                      )}

                      {isEnrolled ? (
                        <View className="flex-row items-center bg-success/10 rounded-lg px-3 py-2">
                          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                          <Text className="text-success text-xs font-medium ml-2">
                            Deja inscrit
                          </Text>
                        </View>
                      ) : !isFull ? (
                        <Button
                          title="S'inscrire"
                          variant="outline"
                          size="sm"
                          onPress={() => handleEnroll(formation.id)}
                          loading={enrollMutation.isPending}
                          icon={<Ionicons name="add-circle-outline" size={16} color={colors.textPrimary} />}
                        />
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
