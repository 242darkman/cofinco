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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAgentStore } from '@/stores/agent-store';
import { useIncidents, useCreateIncident, useEscalateIncident } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatRelativeDate, formatFullDate } from '@/lib/format';

// ─── Types & constants ──────────────────────────────────────────────────────

type IncidentType = 'Securite' | 'Technique' | 'Operationnel' | 'Client' | 'Autre';
type IncidentGravite = 'Critique' | 'Grave' | 'Moyenne' | 'Mineure';
type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

const TYPE_OPTIONS: IncidentType[] = ['Securite', 'Technique', 'Operationnel', 'Client', 'Autre'];

const TYPE_ICON: Record<IncidentType, keyof typeof Ionicons.glyphMap> = {
  Securite: 'shield-outline',
  Technique: 'construct-outline',
  Operationnel: 'settings-outline',
  Client: 'person-outline',
  Autre: 'ellipsis-horizontal-circle-outline',
};

const GRAVITE_OPTIONS: IncidentGravite[] = ['Critique', 'Grave', 'Moyenne', 'Mineure'];

const GRAVITE_VARIANT: Record<IncidentGravite, 'danger' | 'warning' | 'info' | 'neutral'> = {
  Critique: 'danger',
  Grave: 'warning',
  Moyenne: 'info',
  Mineure: 'neutral',
};

const STATUS_VARIANT: Record<IncidentStatus, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
  OPEN: 'danger',
  IN_PROGRESS: 'warning',
  ESCALATED: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  ESCALATED: 'Escalade',
  RESOLVED: 'Resolu',
  CLOSED: 'Ferme',
};

// ─── Form schema ────────────────────────────────────────────────────────────

const incidentSchema = z.object({
  type: z.string().min(1, 'Type requis'),
  gravite: z.string().min(1, 'Gravite requise'),
  description: z.string().min(5, 'Description requise (minimum 5 caracteres)'),
  localisation: z.string().optional(),
});

type IncidentForm = z.infer<typeof incidentSchema>;

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function IncidentsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<IncidentType>('Securite');
  const [selectedGravite, setSelectedGravite] = useState<IncidentGravite>('Moyenne');

  const { data: incidents, isLoading, refetch } = useIncidents(employeId);
  const createMutation = useCreateIncident();
  const escalateMutation = useEscalateIncident();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IncidentForm>({
    resolver: zodResolver(incidentSchema),
    defaultValues: { type: 'Securite', gravite: 'Moyenne', description: '', localisation: '' },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const onSubmit = async (data: IncidentForm) => {
    if (!employeId) return;
    try {
      await createMutation.mutateAsync({
        agentId: employeId,
        type: selectedType,
        gravite: selectedGravite,
        description: data.description,
        localisation: data.localisation || undefined,
        date: new Date().toISOString(),
        statut: 'OPEN',
      });
      setShowForm(false);
      reset();
      setSelectedType('Securite');
      setSelectedGravite('Moyenne');
      Alert.alert('Succes', 'Incident signale avec succes.');
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || "Impossible de creer l'incident");
    }
  };

  const handleEscalate = useCallback(
    async (id: string) => {
      Alert.alert(
        'Escalader',
        'Voulez-vous escalader cet incident ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Escalader',
            onPress: async () => {
              try {
                await escalateMutation.mutateAsync(id);
                Alert.alert('Succes', 'Incident escalade.');
              } catch (error: any) {
                Alert.alert('Erreur', error?.message || 'Escalade impossible');
              }
            },
          },
        ]
      );
    },
    [escalateMutation]
  );

  if (isLoading) {
    return <Loading fullScreen message="Chargement des incidents..." />;
  }

  const items = Array.isArray(incidents) ? incidents : [];

  return (
    <View className="flex-1 bg-bg-base">
      {/* Top action */}
      <View className="px-5 pt-4 pb-3">
        <Button
          title="Signaler un incident"
          variant="danger"
          onPress={() => setShowForm(true)}
          icon={<Ionicons name="warning-outline" size={18} color="#ffffff" />}
        />
      </View>

      {/* Incidents list */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />}
            title="Aucun incident"
            description="Vous n'avez signale aucun incident."
          />
        ) : (
          <View className="gap-3">
            {items.map((incident: any) => {
              const statusKey = (incident.statut as IncidentStatus) || 'OPEN';
              const graviteKey = (incident.gravite as IncidentGravite) || 'Moyenne';
              const typeKey = (incident.type as IncidentType) || 'Autre';
              const isExpanded = expandedId === incident.id;

              return (
                <Pressable
                  key={incident.id}
                  onPress={() => setExpandedId(isExpanded ? null : incident.id)}
                >
                  <Card variant="elevated">
                    <View className="flex-row items-start justify-between mb-2">
                      <View className="flex-row items-center flex-1">
                        <View className="w-9 h-9 rounded-full bg-bg-muted items-center justify-center mr-3">
                          <Ionicons
                            name={TYPE_ICON[typeKey] || 'alert-circle-outline'}
                            size={18}
                            color={colors.textMuted}
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-text-primary font-semibold text-sm">
                            {typeKey}
                          </Text>
                          <Text className="text-text-muted text-xs">
                            {formatRelativeDate(incident.date || incident.createdAt)}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end gap-1">
                        <Badge
                          label={graviteKey}
                          variant={GRAVITE_VARIANT[graviteKey] || 'neutral'}
                        />
                        <Badge
                          label={STATUS_LABEL[statusKey] || statusKey}
                          variant={STATUS_VARIANT[statusKey] || 'neutral'}
                        />
                      </View>
                    </View>

                    <Text
                      className="text-text-primary text-sm ml-12"
                      numberOfLines={isExpanded ? undefined : 2}
                    >
                      {incident.description}
                    </Text>

                    {/* Expanded details */}
                    {isExpanded && (
                      <View className="mt-3 ml-12">
                        {incident.localisation && (
                          <View className="flex-row items-center mb-1">
                            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                            <Text className="text-text-muted text-xs ml-1">
                              {incident.localisation}
                            </Text>
                          </View>
                        )}

                        {incident.resolution && (
                          <View className="bg-success/10 rounded-lg p-3 mt-2">
                            <Text className="text-success text-xs font-medium mb-1">Resolution:</Text>
                            <Text className="text-text-primary text-xs">{incident.resolution}</Text>
                          </View>
                        )}

                        {incident.dateResolution && (
                          <Text className="text-text-muted text-xs mt-1">
                            Resolu le: {formatFullDate(incident.dateResolution)}
                          </Text>
                        )}

                        {incident.dateEscalade && (
                          <Text className="text-text-muted text-xs mt-1">
                            Escalade le: {formatFullDate(incident.dateEscalade)}
                          </Text>
                        )}

                        {statusKey === 'OPEN' && (
                          <View className="mt-3">
                            <Button
                              title="Escalader"
                              variant="outline"
                              size="sm"
                              onPress={() => handleEscalate(incident.id)}
                              loading={escalateMutation.isPending}
                              icon={<Ionicons name="arrow-up-circle-outline" size={16} color={colors.textPrimary} />}
                            />
                          </View>
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

      {/* Create form modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          className="flex-1 bg-bg-base"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <Text className="text-text-primary text-lg font-bold">Signaler un incident</Text>
            <Pressable onPress={() => { setShowForm(false); reset(); }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {/* Type picker */}
            <Text className="text-text-secondary text-sm font-medium mb-2">Type d'incident</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {TYPE_OPTIONS.map((type) => {
                const isSelected = selectedType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setSelectedType(type)}
                    className={`flex-row items-center px-3 py-2 rounded-full border ${
                      isSelected ? 'bg-accent border-accent' : 'bg-card-bg border-card-border'
                    }`}
                  >
                    <Ionicons
                      name={TYPE_ICON[type]}
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

            {/* Gravite picker */}
            <Text className="text-text-secondary text-sm font-medium mb-2">Gravite</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {GRAVITE_OPTIONS.map((g) => {
                const isSelected = selectedGravite === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setSelectedGravite(g)}
                    className={`px-3 py-2 rounded-full border ${
                      isSelected ? 'bg-accent border-accent' : 'bg-card-bg border-card-border'
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? 'text-white' : 'text-text-primary'
                      }`}
                    >
                      {g}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Description */}
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Description"
                  placeholder="Decrivez l'incident en detail..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={5}
                  error={errors.description}
                />
              )}
            />

            {/* Localisation */}
            <Controller
              control={control}
              name="localisation"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Localisation (optionnel)"
                  placeholder="Lieu de l'incident..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <View className="mt-2">
              <Button
                title="Signaler l'incident"
                variant="danger"
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
