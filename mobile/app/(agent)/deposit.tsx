import { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAgentStore } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@shared/types/mobile';

const depositSchema = z.object({
  montant: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Montant invalide'
  ),
  observations: z.string().optional(),
  numeroRecu: z.string().optional(),
});

type DepositForm = z.infer<typeof depositSchema>;

export default function DepositScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    clientId: string;
    clientNom: string;
    clientTelephone: string;
  }>();

  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const collectCash = useAgentStore((s) => s.collectCash);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<DepositForm>({
    resolver: zodResolver(depositSchema),
  });

  const onSubmit = async (data: DepositForm) => {
    if (!params.clientId) {
      Alert.alert('Erreur', 'Aucun client selectionne');
      return;
    }

    setIsSubmitting(true);
    try {
      const operation = await collectCash({
        clientId: params.clientId,
        montant: Number(data.montant),
        observations: data.observations,
        numeroRecu: data.numeroRecu,
      });

      Alert.alert(
        'Collecte enregistree',
        `${formatMoney(Number(data.montant))} collecte de ${params.clientNom}.\nStatut: En attente d'approbation.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || 'Impossible de creer l\'operation');
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
        {/* Client info */}
        <Card variant="elevated" className="mb-6">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-accent/10 items-center justify-center mr-3">
              <Ionicons name="person" size={24} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-text-primary font-semibold text-base">
                {params.clientNom || 'Client'}
              </Text>
              <Text className="text-text-muted text-sm">
                {params.clientTelephone || ''}
              </Text>
            </View>
            <Button
              title="Changer"
              variant="ghost"
              size="sm"
              onPress={() => router.push('/(agent)/client-search')}
            />
          </View>
        </Card>

        {/* Amount input */}
        <View className="mb-4">
          <Controller
            control={control}
            name="montant"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Montant a collecter"
                placeholder="0"
                keyboardType="numeric"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.montant}
              />
            )}
          />
        </View>

        {/* Receipt number */}
        <View className="mb-4">
          <Controller
            control={control}
            name="numeroRecu"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Numero de recu (optionnel)"
                placeholder="REC-001"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        </View>

        {/* Observations */}
        <View className="mb-6">
          <Controller
            control={control}
            name="observations"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Observations (optionnel)"
                placeholder="Notes sur l'operation..."
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
          title="Confirmer la collecte"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
