import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAgentStore } from '@/stores/agent-store';
import { usePlanning, useCreatePlanning, useUpdatePlanning } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading, EmptyState } from '@/components/ui/loading';

// ─── Types & constants ──────────────────────────────────────────────────────

type PlanningType = 'Visite' | 'Collecte' | 'Formation' | 'Prospection' | 'Reunion' | 'Conge';
type PlanningStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';

const TYPE_OPTIONS: PlanningType[] = [
  'Visite',
  'Collecte',
  'Formation',
  'Prospection',
  'Reunion',
  'Conge',
];

const TYPE_CONFIG: Record<PlanningType, { variant: 'info' | 'success' | 'warning' | 'neutral' | 'danger'; icon: keyof typeof Ionicons.glyphMap }> = {
  Visite: { variant: 'info', icon: 'location-outline' },
  Collecte: { variant: 'success', icon: 'cash-outline' },
  Formation: { variant: 'warning', icon: 'school-outline' },
  Prospection: { variant: 'info', icon: 'search-outline' },
  Reunion: { variant: 'neutral', icon: 'people-outline' },
  Conge: { variant: 'danger', icon: 'calendar-outline' },
};

const STATUS_VARIANT: Record<PlanningStatus, 'info' | 'success' | 'neutral'> = {
  PLANNED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<PlanningStatus, string> = {
  PLANNED: 'Planifie',
  COMPLETED: 'Termine',
  CANCELLED: 'Annule',
};

// ─── Form schema ────────────────────────────────────────────────────────────

const planningSchema = z.object({
  type: z.string().min(1, 'Type requis'),
  heureDebut: z.string().min(1, 'Heure de debut requise').regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  heureFin: z.string().min(1, 'Heure de fin requise').regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  zone: z.string().optional(),
  notes: z.string().optional(),
});

type PlanningForm = z.infer<typeof planningSchema>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';

  return target.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function PlanningScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState<PlanningType>('Visite');

  const dateStr = useMemo(() => toDateString(selectedDate), [selectedDate]);
  const { data: planning, isLoading, refetch } = usePlanning(employeId, dateStr);
  const createMutation = useCreatePlanning();
  const updateMutation = useUpdatePlanning();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanningForm>({
    resolver: zodResolver(planningSchema),
    defaultValues: { type: 'Visite', heureDebut: '', heureFin: '', zone: '', notes: '' },
  });

  const navigateDay = useCallback(
    (offset: number) => {
      setSelectedDate((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() + offset);
        return next;
      });
    },
    []
  );

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const onSubmit = async (data: PlanningForm) => {
    if (!employeId) return;
    try {
      await createMutation.mutateAsync({
        agentId: employeId,
        date: dateStr,
        type: selectedType,
        heureDebut: data.heureDebut,
        heureFin: data.heureFin,
        zone: data.zone || undefined,
        notes: data.notes || undefined,
        statut: 'PLANNED',
      });
      setShowForm(false);
      reset();
      setSelectedType('Visite');
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || "Impossible de creer l'activite");
    }
  };

  const updateStatus = useCallback(
    async (id: string, statut: PlanningStatus) => {
      const label = statut === 'COMPLETED' ? 'terminer' : 'annuler';
      Alert.alert(
        'Confirmer',
        `Voulez-vous ${label} cette activite ?`,
        [
          { text: 'Non', style: 'cancel' },
          {
            text: 'Oui',
            onPress: async () => {
              try {
                await updateMutation.mutateAsync({ id, statut });
              } catch (error: any) {
                Alert.alert('Erreur', error?.message || 'Mise a jour impossible');
              }
            },
          },
        ]
      );
    },
    [updateMutation]
  );

  if (isLoading) {
    return <Loading fullScreen message="Chargement du planning..." />;
  }

  const items = Array.isArray(planning) ? planning : [];

  return (
    <View className="flex-1 bg-bg-base">
      {/* Date selector */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <Pressable
          onPress={() => navigateDay(-1)}
          className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center"
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={() => setSelectedDate(new Date())}>
          <Text className="text-text-primary text-lg font-bold">
            {formatDateLabel(selectedDate)}
          </Text>
          <Text className="text-text-muted text-xs text-center">
            {selectedDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigateDay(1)}
          className="w-10 h-10 rounded-full bg-bg-muted items-center justify-center"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Add button */}
      <View className="px-5 mb-3">
        <Button
          title="Ajouter une activite"
          variant="primary"
          onPress={() => setShowForm(true)}
          icon={<Ionicons name="add-circle-outline" size={18} color="#ffffff" />}
        />
      </View>

      {/* Activities list */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="calendar-outline" size={48} color={colors.textMuted} />}
            title="Aucune activite"
            description="Pas d'activite planifiee pour cette date."
          />
        ) : (
          <View className="gap-3">
            {items.map((item: any) => {
              const typeConf = TYPE_CONFIG[item.type as PlanningType] ?? TYPE_CONFIG.Visite;
              const statusKey = (item.statut as PlanningStatus) || 'PLANNED';

              return (
                <Card key={item.id} variant="elevated">
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-row items-center flex-1">
                      <View
                        className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${
                          typeConf.variant === 'info'
                            ? 'bg-info/10'
                            : typeConf.variant === 'success'
                              ? 'bg-success/10'
                              : typeConf.variant === 'warning'
                                ? 'bg-warning/10'
                                : typeConf.variant === 'danger'
                                  ? 'bg-danger/10'
                                  : 'bg-bg-muted'
                        }`}
                      >
                        <Ionicons
                          name={typeConf.icon}
                          size={18}
                          color={
                            typeConf.variant === 'info'
                              ? colors.info
                              : typeConf.variant === 'success'
                                ? colors.success
                                : typeConf.variant === 'warning'
                                  ? colors.warning
                                  : typeConf.variant === 'danger'
                                    ? colors.danger
                                    : colors.textMuted
                          }
                        />
                      </View>
                      <View className="flex-1">
                        <Badge label={item.type} variant={typeConf.variant} />
                        <Text className="text-text-primary font-medium text-sm mt-1">
                          {item.heureDebut || '--:--'} - {item.heureFin || '--:--'}
                        </Text>
                      </View>
                    </View>
                    <Badge label={STATUS_LABEL[statusKey] || statusKey} variant={STATUS_VARIANT[statusKey] || 'neutral'} />
                  </View>

                  {item.zone && (
                    <View className="flex-row items-center ml-12 mb-1">
                      <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                      <Text className="text-text-muted text-xs ml-1">{item.zone}</Text>
                    </View>
                  )}

                  {item.notes && (
                    <Text className="text-text-muted text-xs ml-12" numberOfLines={2}>
                      {item.notes}
                    </Text>
                  )}

                  {statusKey === 'PLANNED' && (
                    <View className="flex-row gap-2 mt-3 ml-12">
                      <Pressable
                        onPress={() => updateStatus(item.id, 'COMPLETED')}
                        className="flex-row items-center px-3 py-1.5 rounded-lg bg-success/10"
                      >
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Text className="text-success text-xs font-medium ml-1">Terminer</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updateStatus(item.id, 'CANCELLED')}
                        className="flex-row items-center px-3 py-1.5 rounded-lg bg-danger/10"
                      >
                        <Ionicons name="close-circle" size={16} color={colors.danger} />
                        <Text className="text-danger text-xs font-medium ml-1">Annuler</Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create form modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          className="flex-1 bg-bg-base"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <Text className="text-text-primary text-lg font-bold">Nouvelle activite</Text>
            <Pressable onPress={() => { setShowForm(false); reset(); }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {/* Type selector */}
            <Text className="text-text-secondary text-sm font-medium mb-2">Type d'activite</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {TYPE_OPTIONS.map((type) => {
                const isSelected = selectedType === type;
                const conf = TYPE_CONFIG[type];
                return (
                  <Pressable
                    key={type}
                    onPress={() => setSelectedType(type)}
                    className={`flex-row items-center px-3 py-2 rounded-full border ${
                      isSelected ? 'bg-accent border-accent' : 'bg-card-bg border-card-border'
                    }`}
                  >
                    <Ionicons
                      name={conf.icon}
                      size={16}
                      color={isSelected ? '#ffffff' : colors.textMuted}
                    />
                    <Text
                      className={`text-sm font-medium ml-1.5 ${
                        isSelected ? 'text-white' : 'text-text-primary'
                      }`}
                    >
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Heure debut */}
            <Controller
              control={control}
              name="heureDebut"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Heure de debut"
                  placeholder="08:00"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.heureDebut}
                />
              )}
            />

            {/* Heure fin */}
            <Controller
              control={control}
              name="heureFin"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Heure de fin"
                  placeholder="17:00"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.heureFin}
                />
              )}
            />

            {/* Zone */}
            <Controller
              control={control}
              name="zone"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Zone (optionnel)"
                  placeholder="Quartier, marche..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            {/* Notes */}
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Notes (optionnel)"
                  placeholder="Details de l'activite..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={3}
                />
              )}
            />

            <View className="mt-2">
              <Button
                title="Creer l'activite"
                onPress={handleSubmit(onSubmit)}
                loading={createMutation.isPending}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
