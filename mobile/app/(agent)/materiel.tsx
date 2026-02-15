import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAgentStore } from '@/stores/agent-store';
import { useMateriel, useReportMaterielProblem } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatFullDate } from '@/lib/format';

// ─── Types & constants ──────────────────────────────────────────────────────

type MaterielType = 'Tablette' | 'Badge' | 'Uniforme' | 'Vehicule' | 'Telephone' | 'Autre';
type MaterielEtat = 'Neuf' | 'Bon' | 'Moyen' | 'Mauvais' | 'Perdu' | 'Retourne';

const TYPE_ICON: Record<MaterielType, keyof typeof Ionicons.glyphMap> = {
  Tablette: 'tablet-portrait-outline',
  Badge: 'card-outline',
  Uniforme: 'shirt-outline',
  Vehicule: 'car-outline',
  Telephone: 'phone-portrait-outline',
  Autre: 'cube-outline',
};

const ETAT_VARIANT: Record<MaterielEtat, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Neuf: 'success',
  Bon: 'success',
  Moyen: 'warning',
  Mauvais: 'danger',
  Perdu: 'danger',
  Retourne: 'neutral',
};

const NON_REPORTABLE_ETATS: MaterielEtat[] = ['Mauvais', 'Perdu', 'Retourne'];

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function MaterielScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState('');

  const { data: materiel, isLoading, refetch } = useMateriel(employeId);
  const reportMutation = useReportMaterielProblem();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleReport = useCallback(
    async () => {
      if (!reportId) return;
      if (!reportNotes.trim()) {
        Alert.alert('Erreur', 'Veuillez decrire le probleme.');
        return;
      }
      try {
        await reportMutation.mutateAsync({ id: reportId, notes: reportNotes.trim() });
        setReportId(null);
        setReportNotes('');
        Alert.alert('Succes', 'Probleme signale avec succes.');
      } catch (error: any) {
        Alert.alert('Erreur', error?.message || 'Impossible de signaler le probleme');
      }
    },
    [reportId, reportNotes, reportMutation]
  );

  if (isLoading) {
    return <Loading fullScreen message="Chargement du materiel..." />;
  }

  const items = Array.isArray(materiel) ? materiel : [];

  return (
    <View className="flex-1 bg-bg-base">
      {/* Summary header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-text-muted text-sm">
          {items.length} equipement{items.length > 1 ? 's' : ''} attribue{items.length > 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="cube-outline" size={48} color={colors.textMuted} />}
            title="Aucun equipement"
            description="Vous n'avez aucun equipement attribue."
          />
        ) : (
          <View className="gap-3">
            {items.map((item: any) => {
              const typeKey = (item.type as MaterielType) || 'Autre';
              const etatKey = (item.etat as MaterielEtat) || 'Bon';
              const isExpanded = expandedId === item.id;
              const isReporting = reportId === item.id;
              const canReport = !NON_REPORTABLE_ETATS.includes(etatKey);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setExpandedId(isExpanded ? null : item.id);
                    if (reportId === item.id) {
                      setReportId(null);
                      setReportNotes('');
                    }
                  }}
                >
                  <Card variant="elevated">
                    <View className="flex-row items-start">
                      <View className="w-11 h-11 rounded-full bg-bg-muted items-center justify-center mr-3">
                        <Ionicons
                          name={TYPE_ICON[typeKey] || 'cube-outline'}
                          size={22}
                          color={colors.textMuted}
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 mr-2">
                            <Text className="text-text-primary font-semibold text-base">
                              {item.nom || typeKey}
                            </Text>
                            {item.numeroSerie && (
                              <Text className="text-text-muted text-xs">
                                S/N: {item.numeroSerie}
                              </Text>
                            )}
                          </View>
                          <Badge
                            label={etatKey}
                            variant={ETAT_VARIANT[etatKey] || 'neutral'}
                          />
                        </View>

                        {item.dateAttribution && (
                          <Text className="text-text-muted text-xs mt-1">
                            Attribue le: {formatFullDate(item.dateAttribution)}
                          </Text>
                        )}

                        {item.valeur != null && (
                          <Text className="text-text-primary text-sm font-medium mt-1">
                            Valeur: {formatMoney(Number(item.valeur))}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Expanded details */}
                    {isExpanded && (
                      <View className="mt-3 ml-14">
                        {item.garantie && (
                          <View className="flex-row items-center mb-1">
                            <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
                            <Text className="text-text-muted text-xs ml-1">
                              Garantie: {item.garantie}
                            </Text>
                          </View>
                        )}

                        {item.prochaineMaintenance && (
                          <View className="flex-row items-center mb-1">
                            <Ionicons name="construct-outline" size={14} color={colors.textMuted} />
                            <Text className="text-text-muted text-xs ml-1">
                              Prochaine maintenance: {formatFullDate(item.prochaineMaintenance)}
                            </Text>
                          </View>
                        )}

                        {item.notes && (
                          <View className="bg-bg-muted rounded-lg p-3 mb-2">
                            <Text className="text-text-muted text-xs">{item.notes}</Text>
                          </View>
                        )}

                        {/* Report problem button */}
                        {canReport && !isReporting && (
                          <Button
                            title="Signaler un probleme"
                            variant="outline"
                            size="sm"
                            onPress={() => {
                              setReportId(item.id);
                              setReportNotes('');
                            }}
                            icon={<Ionicons name="alert-circle-outline" size={16} color={colors.textPrimary} />}
                          />
                        )}

                        {/* Report form */}
                        {isReporting && (
                          <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                          >
                            <View className="mt-2">
                              <Input
                                label="Description du probleme"
                                placeholder="Decrivez le probleme..."
                                value={reportNotes}
                                onChangeText={setReportNotes}
                                multiline
                                numberOfLines={3}
                              />
                              <View className="flex-row gap-2">
                                <Button
                                  title="Annuler"
                                  variant="ghost"
                                  size="sm"
                                  onPress={() => {
                                    setReportId(null);
                                    setReportNotes('');
                                  }}
                                />
                                <Button
                                  title="Envoyer"
                                  variant="danger"
                                  size="sm"
                                  onPress={handleReport}
                                  loading={reportMutation.isPending}
                                />
                              </View>
                            </View>
                          </KeyboardAvoidingView>
                        )}
                      </View>
                    )}

                    {/* Expand indicator */}
                    <View className="items-center mt-2">
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
