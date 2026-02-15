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
import { useRapports, useCreateRapport } from '@/hooks/use-agent';
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

type RapportType = 'Quotidien' | 'Hebdomadaire' | 'Mensuel' | 'Trimestriel' | 'Annuel';

const TYPE_OPTIONS: RapportType[] = [
  'Quotidien',
  'Hebdomadaire',
  'Mensuel',
  'Trimestriel',
  'Annuel',
];

const TYPE_VARIANT: Record<RapportType, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  Quotidien: 'info',
  Hebdomadaire: 'success',
  Mensuel: 'warning',
  Trimestriel: 'neutral',
  Annuel: 'danger',
};

const TYPE_ICON: Record<RapportType, keyof typeof Ionicons.glyphMap> = {
  Quotidien: 'today-outline',
  Hebdomadaire: 'calendar-outline',
  Mensuel: 'calendar-number-outline',
  Trimestriel: 'stats-chart-outline',
  Annuel: 'analytics-outline',
};

// ─── Form schema ────────────────────────────────────────────────────────────

const rapportSchema = z.object({
  periodeDebut: z.string().min(1, 'Date de debut requise').regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ'),
  periodeFin: z.string().min(1, 'Date de fin requise').regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ'),
  nombreVisites: z.string().optional(),
  nombreCollectes: z.string().optional(),
  montantTotalCollecte: z.string().optional(),
  tauxReussite: z.string().optional(),
  clientsNouveaux: z.string().optional(),
  incidents: z.string().optional(),
  kmParcourus: z.string().optional(),
  notes: z.string().optional(),
});

type RapportForm = z.infer<typeof rapportSchema>;

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function RapportsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const employeId = useAgentStore((s) => s.employeId);

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<RapportType>('Quotidien');

  const { data: rapports, isLoading, refetch } = useRapports(employeId);
  const createMutation = useCreateRapport();

  const today = new Date().toISOString().split('T')[0];

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RapportForm>({
    resolver: zodResolver(rapportSchema),
    defaultValues: {
      periodeDebut: today,
      periodeFin: today,
      nombreVisites: '',
      nombreCollectes: '',
      montantTotalCollecte: '',
      tauxReussite: '',
      clientsNouveaux: '',
      incidents: '',
      kmParcourus: '',
      notes: '',
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const onSubmit = async (data: RapportForm) => {
    if (!employeId) return;
    try {
      await createMutation.mutateAsync({
        agentId: employeId,
        type: selectedType,
        periodeDebut: data.periodeDebut,
        periodeFin: data.periodeFin,
        nombreVisites: data.nombreVisites ? Number(data.nombreVisites) : undefined,
        nombreCollectes: data.nombreCollectes ? Number(data.nombreCollectes) : undefined,
        montantTotalCollecte: data.montantTotalCollecte ? Number(data.montantTotalCollecte) : undefined,
        tauxReussite: data.tauxReussite ? Number(data.tauxReussite) : undefined,
        clientsNouveaux: data.clientsNouveaux ? Number(data.clientsNouveaux) : undefined,
        incidents: data.incidents ? Number(data.incidents) : undefined,
        kmParcourus: data.kmParcourus ? Number(data.kmParcourus) : undefined,
        notes: data.notes || undefined,
      });
      setShowForm(false);
      reset();
      setSelectedType('Quotidien');
      Alert.alert('Succes', 'Rapport cree avec succes.');
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || 'Impossible de creer le rapport');
    }
  };

  if (isLoading) {
    return <Loading fullScreen message="Chargement des rapports..." />;
  }

  const items = Array.isArray(rapports) ? rapports : [];

  return (
    <View className="flex-1 bg-bg-base">
      {/* Top action */}
      <View className="px-5 pt-4 pb-3">
        <Button
          title="Nouveau rapport"
          variant="primary"
          onPress={() => setShowForm(true)}
          icon={<Ionicons name="document-text-outline" size={18} color="#ffffff" />}
        />
      </View>

      {/* Rapports list */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="document-text-outline" size={48} color={colors.textMuted} />}
            title="Aucun rapport"
            description="Vous n'avez pas encore soumis de rapport."
            action={
              <Button
                title="Creer un rapport"
                variant="outline"
                size="sm"
                onPress={() => setShowForm(true)}
              />
            }
          />
        ) : (
          <View className="gap-3">
            {items.map((rapport: any) => {
              const typeKey = (rapport.type as RapportType) || 'Quotidien';
              const isExpanded = expandedId === rapport.id;

              return (
                <Pressable
                  key={rapport.id}
                  onPress={() => setExpandedId(isExpanded ? null : rapport.id)}
                >
                  <Card variant="elevated">
                    <View className="flex-row items-start justify-between mb-2">
                      <View className="flex-row items-center flex-1">
                        <View className="w-9 h-9 rounded-full bg-bg-muted items-center justify-center mr-3">
                          <Ionicons
                            name={TYPE_ICON[typeKey] || 'document-text-outline'}
                            size={18}
                            color={colors.textMuted}
                          />
                        </View>
                        <View className="flex-1">
                          <Badge label={typeKey} variant={TYPE_VARIANT[typeKey] || 'neutral'} />
                          <Text className="text-text-muted text-xs mt-1">
                            {rapport.periodeDebut
                              ? new Date(rapport.periodeDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                              : ''}
                            {rapport.periodeFin
                              ? ` - ${new Date(rapport.periodeFin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Summary stats */}
                    <View className="flex-row gap-4 ml-12">
                      {rapport.nombreVisites != null && (
                        <View>
                          <Text className="text-text-muted text-xs">Visites</Text>
                          <Text className="text-text-primary text-sm font-semibold">
                            {rapport.nombreVisites}
                          </Text>
                        </View>
                      )}
                      {rapport.nombreCollectes != null && (
                        <View>
                          <Text className="text-text-muted text-xs">Collectes</Text>
                          <Text className="text-text-primary text-sm font-semibold">
                            {rapport.nombreCollectes}
                          </Text>
                        </View>
                      )}
                      {rapport.montantTotalCollecte != null && (
                        <View>
                          <Text className="text-text-muted text-xs">Montant</Text>
                          <Text className="text-success text-sm font-semibold">
                            {formatMoney(Number(rapport.montantTotalCollecte))}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Expanded details */}
                    {isExpanded && (
                      <View className="mt-3 ml-12 border-t border-border-subtle pt-3">
                        {rapport.tauxReussite != null && (
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-text-muted text-xs">Taux de reussite</Text>
                            <Text className="text-text-primary text-sm font-medium">
                              {rapport.tauxReussite}%
                            </Text>
                          </View>
                        )}
                        {rapport.clientsNouveaux != null && (
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-text-muted text-xs">Nouveaux clients</Text>
                            <Text className="text-text-primary text-sm font-medium">
                              {rapport.clientsNouveaux}
                            </Text>
                          </View>
                        )}
                        {rapport.incidents != null && (
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-text-muted text-xs">Incidents</Text>
                            <Text className="text-text-primary text-sm font-medium">
                              {rapport.incidents}
                            </Text>
                          </View>
                        )}
                        {rapport.kmParcourus != null && (
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-text-muted text-xs">Km parcourus</Text>
                            <Text className="text-text-primary text-sm font-medium">
                              {rapport.kmParcourus} km
                            </Text>
                          </View>
                        )}
                        {rapport.notes && (
                          <View className="bg-bg-muted rounded-lg p-3 mt-2">
                            <Text className="text-text-muted text-xs font-medium mb-1">Notes:</Text>
                            <Text className="text-text-primary text-xs">{rapport.notes}</Text>
                          </View>
                        )}
                        {rapport.createdAt && (
                          <Text className="text-text-muted text-xs mt-2">
                            Cree le: {formatFullDate(rapport.createdAt)}
                          </Text>
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
            <Text className="text-text-primary text-lg font-bold">Nouveau rapport</Text>
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
            <Text className="text-text-secondary text-sm font-medium mb-2">Type de rapport</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-4"
              contentContainerClassName="gap-2"
            >
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
            </ScrollView>

            {/* Period */}
            <Controller
              control={control}
              name="periodeDebut"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Periode debut"
                  placeholder="2026-02-01"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.periodeDebut}
                />
              )}
            />

            <Controller
              control={control}
              name="periodeFin"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Periode fin"
                  placeholder="2026-02-15"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.periodeFin}
                />
              )}
            />

            {/* Stats section */}
            <Text className="text-text-primary text-base font-semibold mt-2 mb-3">
              Statistiques
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Controller
                  control={control}
                  name="nombreVisites"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Visites"
                      placeholder="0"
                      keyboardType="numeric"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
              </View>
              <View className="flex-1">
                <Controller
                  control={control}
                  name="nombreCollectes"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Collectes"
                      placeholder="0"
                      keyboardType="numeric"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
              </View>
            </View>

            <Controller
              control={control}
              name="montantTotalCollecte"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Montant total collecte"
                  placeholder="0"
                  keyboardType="numeric"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Controller
                  control={control}
                  name="tauxReussite"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Taux reussite (%)"
                      placeholder="0"
                      keyboardType="numeric"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
              </View>
              <View className="flex-1">
                <Controller
                  control={control}
                  name="clientsNouveaux"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Nouveaux clients"
                      placeholder="0"
                      keyboardType="numeric"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Controller
                  control={control}
                  name="incidents"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Incidents"
                      placeholder="0"
                      keyboardType="numeric"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
              </View>
              <View className="flex-1">
                <Controller
                  control={control}
                  name="kmParcourus"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Km parcourus"
                      placeholder="0"
                      keyboardType="numeric"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                    />
                  )}
                />
              </View>
            </View>

            {/* Notes */}
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Notes (optionnel)"
                  placeholder="Observations complementaires..."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={4}
                />
              )}
            />

            <View className="mt-2">
              <Button
                title="Soumettre le rapport"
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
