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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useEnquetesCredit, useStartEnquete, useSubmitEnquete } from '@/hooks/use-agent';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading, EmptyState } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatRelativeDate, formatFullDate } from '@/lib/format';

// ─── Types & constants ──────────────────────────────────────────────────────

type EnqueteStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type Recommandation = 'APPROVE' | 'REJECT' | 'REDUCE_AMOUNT' | 'APPROVE_WITH_CAUTION';

const PRIORITY_VARIANT: Record<Priority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyen',
  HIGH: 'Eleve',
  URGENT: 'Urgent',
};

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: 'Assigne',
  IN_PROGRESS: 'En cours',
  SUBMITTED: 'Soumis',
  REVIEWED: 'Examine',
  APPROVED: 'Approuve',
  REJECTED: 'Rejete',
};

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  ASSIGNED: 'info',
  IN_PROGRESS: 'warning',
  SUBMITTED: 'neutral',
  REVIEWED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const RECOMMANDATION_OPTIONS: { value: Recommandation; label: string }[] = [
  { value: 'APPROVE', label: 'Approuver' },
  { value: 'REJECT', label: 'Rejeter' },
  { value: 'REDUCE_AMOUNT', label: 'Reduire le montant' },
  { value: 'APPROVE_WITH_CAUTION', label: 'Approuver avec reserve' },
];

// ─── Form schema ────────────────────────────────────────────────────────────

const enqueteFormSchema = z.object({
  scoreGlobal: z
    .string()
    .min(1, 'Score requis')
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100, 'Score entre 0 et 100'),
  recommandation: z.string().min(1, 'Recommandation requise'),
  observations: z.string().optional(),
});

type EnqueteFormData = z.infer<typeof enqueteFormSchema>;

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function EnquetesScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [formEnqueteId, setFormEnqueteId] = useState<string | null>(null);

  const { data: enquetes, isLoading, refetch } = useEnquetesCredit();
  const startMutation = useStartEnquete();
  const submitMutation = useSubmitEnquete();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EnqueteFormData>({
    resolver: zodResolver(enqueteFormSchema),
    defaultValues: { scoreGlobal: '', recommandation: '', observations: '' },
  });

  const selectedRecommandation = watch('recommandation');

  const items = useMemo(() => {
    if (!Array.isArray(enquetes)) return { pending: [], history: [] };
    const pending = enquetes.filter(
      (e: any) => e.statut === 'ASSIGNED' || e.statut === 'IN_PROGRESS'
    );
    const history = enquetes.filter(
      (e: any) => e.statut !== 'ASSIGNED' && e.statut !== 'IN_PROGRESS'
    );
    return { pending, history };
  }, [enquetes]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleStart = useCallback(
    async (id: string) => {
      try {
        await startMutation.mutateAsync(id);
      } catch (error: any) {
        Alert.alert('Erreur', error?.message || "Impossible de demarrer l'enquete");
      }
    },
    [startMutation]
  );

  const openForm = useCallback(
    (id: string) => {
      setFormEnqueteId(id);
      reset();
    },
    [reset]
  );

  const onSubmitForm = async (data: EnqueteFormData) => {
    if (!formEnqueteId) return;
    try {
      await submitMutation.mutateAsync({
        id: formEnqueteId,
        scoreGlobal: Number(data.scoreGlobal),
        recommandation: data.recommandation,
        observations: data.observations || undefined,
      });
      setFormEnqueteId(null);
      reset();
      Alert.alert('Succes', 'Enquete soumise avec succes.');
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || "Impossible de soumettre l'enquete");
    }
  };

  if (isLoading) {
    return <Loading fullScreen message="Chargement des enquetes..." />;
  }

  // ─── Form view ──────────────────────────────────────────────────────────
  if (formEnqueteId) {
    const enquete = (Array.isArray(enquetes) ? enquetes : []).find(
      (e: any) => e.id === formEnqueteId
    );

    return (
      <KeyboardAvoidingView
        className="flex-1 bg-bg-base"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-row items-center px-5 pt-4 pb-3">
          <Pressable onPress={() => { setFormEnqueteId(null); reset(); }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text className="text-text-primary text-lg font-bold ml-3">Formulaire d'enquete</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {enquete && (
            <Card variant="elevated" className="mb-5">
              <Text className="text-text-primary font-semibold text-base">
                {enquete.clientNom || enquete.client?.nom || 'Client'}
              </Text>
              {(enquete.clientTelephone || enquete.client?.telephone) && (
                <Text className="text-text-muted text-sm">
                  {enquete.clientTelephone || enquete.client?.telephone}
                </Text>
              )}
              {enquete.montant != null && (
                <Text className="text-text-primary font-medium mt-1">
                  Montant: {formatMoney(Number(enquete.montant))}
                </Text>
              )}
            </Card>
          )}

          {/* Score */}
          <Controller
            control={control}
            name="scoreGlobal"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Score global (0-100)"
                placeholder="75"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.scoreGlobal}
              />
            )}
          />

          {/* Recommandation picker */}
          <Text className="text-text-secondary text-sm font-medium mb-2">Recommandation</Text>
          <View className="gap-2 mb-4">
            {RECOMMANDATION_OPTIONS.map((opt) => {
              const isSelected = selectedRecommandation === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setValue('recommandation', opt.value)}
                  className={`flex-row items-center px-4 py-3 rounded-xl border ${
                    isSelected ? 'bg-accent/10 border-accent' : 'bg-input-bg border-input-border'
                  }`}
                >
                  <Ionicons
                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={isSelected ? colors.accent : colors.textMuted}
                  />
                  <Text
                    className={`text-sm font-medium ml-3 ${
                      isSelected ? 'text-accent' : 'text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.recommandation && (
            <Text className="text-danger text-xs mb-3 -mt-2">{errors.recommandation.message}</Text>
          )}

          {/* Observations */}
          <Controller
            control={control}
            name="observations"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Observations (optionnel)"
                placeholder="Notes sur l'enquete terrain..."
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
              title="Soumettre l'enquete"
              onPress={handleSubmit(onSubmitForm)}
              loading={submitMutation.isPending}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── List view ──────────────────────────────────────────────────────────

  const currentItems = activeTab === 'pending' ? items.pending : items.history;

  return (
    <View className="flex-1 bg-bg-base">
      {/* Tabs */}
      <View className="flex-row border-b border-border-subtle">
        <Pressable
          onPress={() => setActiveTab('pending')}
          className={`flex-1 items-center py-3 ${
            activeTab === 'pending' ? 'border-b-2 border-accent' : ''
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              activeTab === 'pending' ? 'text-accent' : 'text-text-muted'
            }`}
          >
            A effectuer ({items.pending.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('history')}
          className={`flex-1 items-center py-3 ${
            activeTab === 'history' ? 'border-b-2 border-accent' : ''
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              activeTab === 'history' ? 'text-accent' : 'text-text-muted'
            }`}
          >
            Historique ({items.history.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-8"
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
      >
        {currentItems.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="search-outline" size={48} color={colors.textMuted} />}
            title={activeTab === 'pending' ? 'Aucune enquete en attente' : 'Aucun historique'}
            description={
              activeTab === 'pending'
                ? "Vous n'avez pas d'enquete a effectuer."
                : "Vous n'avez pas encore d'enquete terminee."
            }
          />
        ) : (
          <View className="gap-3">
            {currentItems.map((enquete: any) => {
              const priorityKey = (enquete.priorite as Priority) || 'MEDIUM';
              const statusKey = enquete.statut || 'ASSIGNED';
              const isOverdue =
                enquete.dateLimite && new Date(enquete.dateLimite) < new Date() && statusKey !== 'SUBMITTED';

              return (
                <Card key={enquete.id} variant="elevated">
                  <View className="flex-row items-start justify-between mb-2">
                    <View className="flex-1">
                      <Text className="text-text-primary font-semibold text-base">
                        {enquete.clientNom || enquete.client?.nom || 'Client'}
                      </Text>
                      {(enquete.clientTelephone || enquete.client?.telephone) && (
                        <Text className="text-text-muted text-sm">
                          {enquete.clientTelephone || enquete.client?.telephone}
                        </Text>
                      )}
                    </View>
                    <View className="items-end gap-1">
                      <Badge
                        label={PRIORITY_LABEL[priorityKey] || priorityKey}
                        variant={PRIORITY_VARIANT[priorityKey] || 'neutral'}
                      />
                      <Badge
                        label={STATUS_LABEL[statusKey] || statusKey}
                        variant={STATUS_VARIANT[statusKey] || 'neutral'}
                      />
                    </View>
                  </View>

                  {enquete.montant != null && (
                    <Text className="text-text-primary font-medium text-sm mb-1">
                      Montant: {formatMoney(Number(enquete.montant))}
                    </Text>
                  )}

                  {enquete.dateLimite && (
                    <View className="flex-row items-center mb-1">
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={isOverdue ? colors.danger : colors.textMuted}
                      />
                      <Text
                        className={`text-xs ml-1 ${isOverdue ? 'text-danger font-semibold' : 'text-text-muted'}`}
                      >
                        Echeance: {formatRelativeDate(enquete.dateLimite)}
                        {isOverdue ? ' (en retard)' : ''}
                      </Text>
                    </View>
                  )}

                  {/* History tab: show score and recommandation */}
                  {activeTab === 'history' && (
                    <View className="mt-2">
                      {enquete.scoreGlobal != null && (
                        <Text className="text-text-muted text-xs">
                          Score: {enquete.scoreGlobal}/100
                        </Text>
                      )}
                      {enquete.recommandation && (
                        <Text className="text-text-muted text-xs">
                          Recommandation:{' '}
                          {RECOMMANDATION_OPTIONS.find((o) => o.value === enquete.recommandation)?.label ||
                            enquete.recommandation}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Actions for pending tab */}
                  {activeTab === 'pending' && (
                    <View className="flex-row gap-2 mt-3">
                      {statusKey === 'ASSIGNED' && (
                        <Button
                          title="Demarrer"
                          variant="primary"
                          size="sm"
                          onPress={() => handleStart(enquete.id)}
                          loading={startMutation.isPending}
                          icon={<Ionicons name="play" size={14} color="#ffffff" />}
                        />
                      )}
                      {statusKey === 'IN_PROGRESS' && (
                        <Button
                          title="Remplir le formulaire"
                          variant="primary"
                          size="sm"
                          onPress={() => openForm(enquete.id)}
                          icon={<Ionicons name="create-outline" size={14} color="#ffffff" />}
                        />
                      )}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
