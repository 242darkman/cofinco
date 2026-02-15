import { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAgentStore } from '@/stores/agent-store';
import { useAuthStore } from '@/stores/auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@shared/types/mobile';

// Schema for requesting a new session
const requestSchema = z.object({
  montantDemande: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Montant invalide'
  ),
  observations: z.string().optional(),
});

// Schema for closing a session
const closeSchema = z.object({
  montantPhysique: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) >= 0,
    'Montant invalide'
  ),
  observations: z.string().optional(),
  ecartJustification: z.string().optional(),
});

type RequestForm = z.infer<typeof requestSchema>;
type CloseForm = z.infer<typeof closeSchema>;

export default function SessionSummaryScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const user = useAuthStore((s) => s.user);
  const { session, caisse, requestSession, closeWithRemise } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If no active session, show request form
  if (!session || session.statut === 'CLOSED') {
    return <RequestSessionView />;
  }

  // If session is active, show close form
  if (session.statut === 'ACTIVE') {
    return <CloseSessionView />;
  }

  // If session is in another state (REQUESTING_FUNDS, CLOSING), show status
  return (
    <View className="flex-1 bg-bg-base items-center justify-center px-8">
      <Ionicons name="time-outline" size={48} color={colors.warning} />
      <Text className="text-text-primary text-lg font-bold mt-4 text-center">
        {session.statut === 'REQUESTING_FUNDS'
          ? 'En attente de provisionnement'
          : 'Session en cours de cloture'}
      </Text>
      <Text className="text-text-muted text-sm text-center mt-2">
        {session.statut === 'REQUESTING_FUNDS'
          ? 'Attendez que la caisse centrale vous approvisionne.'
          : 'La cloture est en cours de traitement.'}
      </Text>
      <Button title="Retour" variant="ghost" onPress={() => router.back()} className="mt-6" />
    </View>
  );
}

function RequestSessionView() {
  const router = useRouter();
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
          <Ionicons name="briefcase" size={32} color="#047857" />
          <Text className="text-text-primary text-lg font-bold mt-2">
            Nouvelle session terrain
          </Text>
          <Text className="text-text-muted text-sm mt-1">
            Demandez un provisionnement pour commencer votre tournee de collecte.
          </Text>
        </Card>

        <View className="mb-4">
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
        </View>

        <View className="mb-6">
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
        </View>

        <Button
          title="Soumettre la demande"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CloseSessionView() {
  const router = useRouter();
  const { session, caisse, closeWithRemise } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<CloseForm>({
    resolver: zodResolver(closeSchema),
  });

  const theoreticalBalance = Number(caisse?.soldeValide || 0);

  const onSubmit = async (data: CloseForm) => {
    const montantPhysique = Number(data.montantPhysique);
    const ecart = montantPhysique - theoreticalBalance;

    if (Math.abs(ecart) > 0 && !data.ecartJustification?.trim()) {
      Alert.alert(
        'Ecart detecte',
        `Il y a un ecart de ${formatMoney(ecart)} entre le comptage physique et le solde theorique. Veuillez fournir une justification.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await closeWithRemise({
        montantPhysique,
        destinationCaisseId: '', // Will be resolved by server based on agency
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
          <Text className="text-text-primary text-lg font-bold">Cloture de session</Text>
          <Text className="text-text-muted text-sm mt-1">
            Comptez votre caisse et soumettez la cloture.
          </Text>

          <View className="bg-bg-muted rounded-xl p-3 mt-4">
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm">Solde theorique</Text>
              <Text className="text-text-primary font-bold">
                {formatMoney(theoreticalBalance)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-text-muted text-sm">Operations</Text>
              <Text className="text-text-primary font-medium">
                {session?.nombreOperations ?? 0}
              </Text>
            </View>
          </View>
        </Card>

        <View className="mb-4">
          <Controller
            control={control}
            name="montantPhysique"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Montant comptage physique"
                placeholder="0"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.montantPhysique}
              />
            )}
          />
        </View>

        <View className="mb-4">
          <Controller
            control={control}
            name="ecartJustification"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Justification d'ecart (si necessaire)"
                placeholder="Expliquer tout ecart..."
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                numberOfLines={3}
              />
            )}
          />
        </View>

        <View className="mb-6">
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
        </View>

        <Button
          title="Cloturer la session"
          variant="danger"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
