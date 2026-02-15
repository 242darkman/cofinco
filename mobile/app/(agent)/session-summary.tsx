import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAgentStore } from '@/stores/agent-store';
import { useAuthStore } from '@/stores/auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useCaisses } from '@/hooks/use-agent';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { BilletageInput, computeBilletageTotal, emptyBilletage } from '@/components/agent/billetage-input';
import { formatMoney } from '@shared/types/mobile';

// ─── Schemas ────────────────────────────────────────────────────────────────

const requestSchema = z.object({
  montantDemande: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Montant invalide'
  ),
  observations: z.string().optional(),
});

type RequestForm = z.infer<typeof requestSchema>;

const closeSchema = z.object({
  observations: z.string().optional(),
  ecartJustification: z.string().optional(),
});

type CloseForm = z.infer<typeof closeSchema>;

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function SessionSummaryScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const { session } = useAgentStore();

  // No session or closed: show request form
  if (!session || session.statut === 'CLOSED') {
    return <RequestSessionView />;
  }

  // Active session: show close form with billetage
  if (session.statut === 'ACTIVE') {
    return <CloseSessionView />;
  }

  // Waiting states: REQUESTING_FUNDS or CLOSING
  return (
    <View className="flex-1 bg-bg-base items-center justify-center px-8">
      <View className="w-16 h-16 rounded-full bg-warning/10 items-center justify-center mb-4">
        <Ionicons name="time-outline" size={32} color={colors.warning} />
      </View>
      <Text className="text-text-primary text-lg font-bold text-center">
        {session.statut === 'REQUESTING_FUNDS'
          ? 'En attente de provisionnement'
          : 'Session en cours de cloture'}
      </Text>
      <Text className="text-text-muted text-sm text-center mt-2 leading-5">
        {session.statut === 'REQUESTING_FUNDS'
          ? 'Attendez que la caisse centrale vous approvisionne.'
          : 'La cloture est en cours de traitement.'}
      </Text>

      {session.statut === 'REQUESTING_FUNDS' && session.montantDemande > 0 && (
        <View className="bg-bg-muted rounded-xl px-4 py-3 mt-4">
          <Text className="text-text-muted text-xs text-center">Montant demande</Text>
          <Text className="text-text-primary text-lg font-bold text-center">
            {formatMoney(session.montantDemande)}
          </Text>
        </View>
      )}

      <Button title="Retour" variant="ghost" onPress={() => router.back()} className="mt-6" />
    </View>
  );
}

// ─── Request Session View ───────────────────────────────────────────────────

function RequestSessionView() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const user = useAuthStore((s) => s.user);
  const requestSession = useAgentStore((s) => s.requestSession);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
  });

  const onSubmit = async (data: RequestForm) => {
    setIsSubmitting(true);
    try {
      await requestSession({
        agenceId: user?.agenceId || '',
        montantDemande: Number(data.montantDemande),
        observations: data.observations,
      });
      Alert.alert(
        'Demande envoyee',
        'Votre demande de provisionnement a ete soumise. Attendez la validation.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || 'Impossible de creer la session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="elevated" className="mb-6">
          <View className="flex-row items-center mb-2">
            <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mr-3">
              <Ionicons name="briefcase" size={20} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-text-primary text-lg font-bold">
                Nouvelle session terrain
              </Text>
            </View>
          </View>
          <Text className="text-text-muted text-sm">
            Demandez un provisionnement pour commencer votre tournee de collecte.
          </Text>
        </Card>

        <Controller
          control={control}
          name="montantDemande"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Montant de provisionnement demande"
              placeholder="100000"
              keyboardType="numeric"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.montantDemande}
            />
          )}
        />

        <Controller
          control={control}
          name="observations"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Observations (optionnel)"
              placeholder="Zone de collecte, plan de tournee..."
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
            title="Soumettre la demande"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Close Session View (with Billetage) ────────────────────────────────────

function CloseSessionView() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const user = useAuthStore((s) => s.user);
  const { session, caisse, closeWithRemise } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Billetage state
  const [billetage, setBilletage] = useState<Record<string, number>>(emptyBilletage());
  const billetageTotal = useMemo(() => computeBilletageTotal(billetage), [billetage]);

  // Destination caisse picker
  const { data: caisses, isLoading: loadingCaisses } = useCaisses(user?.agenceId || null);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string | null>(null);

  const destinationCaisses = useMemo(() => {
    if (!caisses || !Array.isArray(caisses)) return [];
    return caisses.filter((c: any) => c.id !== caisse?.caisseId);
  }, [caisses, caisse?.caisseId]);

  // Theoretical balance
  const theoreticalBalance = Number(caisse?.soldeValide || 0);

  // Ecart calculation
  const ecart = billetageTotal - theoreticalBalance;
  const ecartPercent = theoreticalBalance > 0
    ? Math.abs(ecart / theoreticalBalance) * 100
    : 0;
  const requiresJustification = ecartPercent > 10;

  const { control, handleSubmit, formState: { errors }, watch } = useForm<CloseForm>({
    resolver: zodResolver(closeSchema),
  });

  const justification = watch('ecartJustification');

  const handleBilletageChange = (denom: string, count: number) => {
    setBilletage((prev) => ({ ...prev, [denom]: count }));
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

  const onSubmit = async (data: CloseForm) => {
    if (billetageTotal <= 0) {
      Alert.alert('Erreur', 'Veuillez effectuer le comptage physique (billetage).');
      return;
    }

    if (!selectedCaisseId) {
      Alert.alert('Erreur', 'Veuillez selectionner une caisse de destination.');
      return;
    }

    // If significant ecart, require justification
    if (requiresJustification && !data.ecartJustification?.trim()) {
      Alert.alert(
        'Justification requise',
        `L'ecart de ${formatMoney(Math.abs(ecart))} (${ecartPercent.toFixed(1)}%) necessite une justification.`
      );
      return;
    }

    // Confirmation dialog
    const ecartText = ecart !== 0
      ? `\nEcart: ${ecart > 0 ? '+' : ''}${formatMoney(ecart)}`
      : '';

    Alert.alert(
      'Confirmer la cloture',
      `Comptage physique: ${formatMoney(billetageTotal)}\nSolde theorique: ${formatMoney(theoreticalBalance)}${ecartText}\n\nCloturer la session ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Cloturer',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await closeWithRemise({
                montantPhysique: billetageTotal,
                destinationCaisseId: selectedCaisseId,
                billetage,
                observations: data.observations,
                ecartJustification: data.ecartJustification,
              });
              Alert.alert(
                'Session cloturee',
                'Votre session terrain a ete cloturee avec succes.',
                [{ text: 'OK', onPress: () => router.replace('/(agent)') }]
              );
            } catch (error: any) {
              Alert.alert('Erreur', error?.message || 'Impossible de cloturer la session');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {/* Session summary header */}
        <Card variant="elevated" className="mb-5">
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-full bg-danger/10 items-center justify-center mr-3">
              <Ionicons name="close-circle" size={20} color={colors.danger} />
            </View>
            <View className="flex-1">
              <Text className="text-text-primary text-base font-bold">Cloture de session</Text>
              <Text className="text-text-muted text-sm">
                Comptez votre caisse et soumettez la cloture.
              </Text>
            </View>
          </View>

          {/* Theoretical balance card */}
          <View className="bg-bg-muted rounded-xl p-3">
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm">Solde theorique</Text>
              <Text className="text-text-primary font-bold text-base">
                {formatMoney(theoreticalBalance)}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm">Operations</Text>
              <Text className="text-text-primary font-medium">
                {session?.nombreOperations ?? 0}
              </Text>
            </View>
            {session?.montantCollecte != null && (
              <View className="flex-row justify-between">
                <Text className="text-text-muted text-sm">Total collecte</Text>
                <Text className="text-success font-medium">
                  {formatMoney(session.montantCollecte)}
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Billetage section */}
        <Card variant="elevated" className="mb-5">
          <Text className="text-text-primary text-base font-bold mb-3">
            Comptage physique (Billetage)
          </Text>
          <BilletageInput
            billetage={billetage}
            onChange={handleBilletageChange}
            total={billetageTotal}
          />
        </Card>

        {/* Ecart display */}
        {billetageTotal > 0 && (
          <Card
            variant="elevated"
            className={`mb-5 ${
              ecart === 0
                ? 'border-success'
                : Math.abs(ecart) > 0
                  ? 'border-danger'
                  : ''
            }`}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-text-muted text-xs uppercase font-semibold mb-1">
                  Ecart
                </Text>
                <View className="flex-row items-center">
                  <Ionicons
                    name={
                      ecart === 0
                        ? 'checkmark-circle'
                        : ecart > 0
                          ? 'arrow-up-circle'
                          : 'arrow-down-circle'
                    }
                    size={20}
                    color={
                      ecart === 0
                        ? colors.success
                        : colors.danger
                    }
                  />
                  <Text
                    className={`text-lg font-bold ml-2 ${
                      ecart === 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {ecart > 0 ? '+' : ''}{formatMoney(ecart)}
                  </Text>
                </View>
              </View>

              <View className="items-end">
                <Text className="text-text-muted text-xs">Physique</Text>
                <Text className="text-text-primary font-medium text-sm">
                  {formatMoney(billetageTotal)}
                </Text>
                <Text className="text-text-muted text-xs mt-1">Theorique</Text>
                <Text className="text-text-primary font-medium text-sm">
                  {formatMoney(theoreticalBalance)}
                </Text>
              </View>
            </View>

            {ecart === 0 && (
              <View className="bg-success/10 rounded-lg p-2 mt-3">
                <Text className="text-success text-sm text-center font-medium">
                  Caisse equilibree - aucun ecart
                </Text>
              </View>
            )}

            {ecartPercent > 0 && (
              <View className={`rounded-lg p-2 mt-3 ${requiresJustification ? 'bg-danger/10' : 'bg-warning/10'}`}>
                <Text className={`text-sm text-center font-medium ${requiresJustification ? 'text-danger' : 'text-warning'}`}>
                  Ecart de {ecartPercent.toFixed(1)}%
                  {requiresJustification ? ' - Justification obligatoire' : ''}
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Destination caisse picker */}
        <Card variant="elevated" className="mb-5">
          <Text className="text-text-primary text-base font-bold mb-3">
            Caisse de destination
          </Text>

          {loadingCaisses ? (
            <Loading message="Chargement des caisses..." />
          ) : destinationCaisses.length === 0 ? (
            <View className="bg-warning/10 rounded-xl p-3">
              <Text className="text-warning text-sm">
                Aucune caisse de destination disponible.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {destinationCaisses.map((c: any) => {
                const isSelected = selectedCaisseId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setSelectedCaisseId(c.id)}
                    className={`flex-row items-center px-4 py-3 rounded-xl border ${
                      isSelected
                        ? 'bg-accent/10 border-accent'
                        : 'bg-input-bg border-input-border'
                    }`}
                  >
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isSelected ? colors.accent : colors.textMuted}
                    />
                    <View className="ml-3 flex-1">
                      <Text className="text-text-primary text-sm font-medium">
                        {c.nom || c.numero || `Caisse #${c.id.slice(0, 8)}`}
                      </Text>
                      {c.type && (
                        <Text className="text-text-muted text-xs">{c.type}</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        {/* Ecart justification (conditional) */}
        {ecart !== 0 && billetageTotal > 0 && (
          <Controller
            control={control}
            name="ecartJustification"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={`Justification de l'ecart${requiresJustification ? ' (obligatoire)' : ' (optionnel)'}`}
                placeholder="Expliquer la raison de l'ecart..."
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                numberOfLines={3}
              />
            )}
          />
        )}

        {/* Observations */}
        <Controller
          control={control}
          name="observations"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Observations (optionnel)"
              placeholder="Notes de fin de journee..."
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              numberOfLines={2}
            />
          )}
        />

        {/* Submit */}
        <View className="mt-2">
          <Button
            title="Cloturer la session"
            variant="danger"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={billetageTotal <= 0 || !selectedCaisseId}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
