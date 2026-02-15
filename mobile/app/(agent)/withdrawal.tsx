import { useState } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { useAgentStore, type TypeOperationTerrain } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@shared/types/mobile';

const withdrawalSchema = z.object({
  montant: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Montant invalide'
  ),
  observations: z.string().optional(),
  numeroRecu: z.string().optional(),
});

type WithdrawalForm = z.infer<typeof withdrawalSchema>;

type WithdrawalType = 'WITHDRAWAL_SAVINGS' | 'WITHDRAWAL_CURRENT';

const WITHDRAWAL_TYPES: { value: WithdrawalType; label: string; icon: string }[] = [
  { value: 'WITHDRAWAL_CURRENT', label: 'Retrait courant', icon: 'wallet-outline' },
  { value: 'WITHDRAWAL_SAVINGS', label: 'Retrait epargne', icon: 'trending-down-outline' },
];

export default function WithdrawalScreen() {
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
  const [withdrawalType, setWithdrawalType] = useState<WithdrawalType>('WITHDRAWAL_CURRENT');
  const [selectedCompteId, setSelectedCompteId] = useState<string>('');

  const { control, handleSubmit, formState: { errors } } = useForm<WithdrawalForm>({
    resolver: zodResolver(withdrawalSchema),
  });

  const isSavings = withdrawalType === 'WITHDRAWAL_SAVINGS';
  const { data: accounts = [] } = useQuery({
    queryKey: ['client-accounts', params.clientId, isSavings ? 'epargne' : 'courant'],
    queryFn: () => {
      if (isSavings) {
        return api.get<any[]>(`/api/comptes-epargne?clientId=${params.clientId}`);
      }
      return api.get<any[]>(`/api/comptes?clientId=${params.clientId}&typeCompte=COURANT`);
    },
    enabled: !!params.clientId,
  });

  const selectedAccount = accounts.find((a: any) => a.id === selectedCompteId);

  const onSubmit = async (data: WithdrawalForm) => {
    if (!params.clientId) {
      Alert.alert('Erreur', 'Aucun client selectionne');
      return;
    }
    if (!selectedCompteId) {
      Alert.alert('Erreur', 'Veuillez selectionner un compte');
      return;
    }

    setIsSubmitting(true);
    try {
      await collectCash({
        clientId: params.clientId,
        montant: Number(data.montant),
        typePaiementClient: withdrawalType as TypeOperationTerrain,
        compteId: selectedCompteId,
        observations: data.observations,
        numeroRecu: data.numeroRecu,
      });

      Alert.alert(
        'Retrait enregistre',
        `Retrait de ${formatMoney(Number(data.montant))} enregistre.\nStatut: En attente d'approbation.`,
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
        {params.clientId ? (
          <Card variant="elevated" className="mb-4">
            <View className="flex-row items-center">
              <View className="w-12 h-12 rounded-full bg-warning/10 items-center justify-center mr-3">
                <Ionicons name="person" size={24} color={colors.warning} />
              </View>
              <View className="flex-1">
                <Text className="text-text-primary font-semibold text-base">
                  {params.clientNom || 'Client'}
                </Text>
                <Text className="text-text-muted text-sm">{params.clientTelephone || ''}</Text>
              </View>
              <Button
                title="Changer"
                variant="ghost"
                size="sm"
                onPress={() => router.push('/(agent)/client-search')}
              />
            </View>
          </Card>
        ) : (
          <Card variant="elevated" className="mb-4 items-center py-4">
            <Ionicons name="person-add-outline" size={32} color={colors.textMuted} />
            <Text className="text-text-muted text-sm mt-2">Recherchez un client d'abord</Text>
            <Button
              title="Rechercher"
              variant="ghost"
              size="sm"
              onPress={() => router.push('/(agent)/client-search')}
              className="mt-2"
            />
          </Card>
        )}

        {/* Withdrawal type */}
        <Text className="text-text-secondary text-sm font-medium mb-2">Type de retrait</Text>
        <View className="flex-row gap-3 mb-4">
          {WITHDRAWAL_TYPES.map((type) => (
            <Button
              key={type.value}
              title={type.label}
              variant={withdrawalType === type.value ? 'primary' : 'outline'}
              size="sm"
              icon={<Ionicons name={type.icon as any} size={16} color={withdrawalType === type.value ? '#fff' : colors.text} />}
              onPress={() => {
                setWithdrawalType(type.value);
                setSelectedCompteId('');
              }}
            />
          ))}
        </View>

        {/* Account selection */}
        {accounts.length > 0 && (
          <View className="mb-4">
            <Text className="text-text-secondary text-sm font-medium mb-2">
              Compte {isSavings ? "d'epargne" : 'courant'}
            </Text>
            {accounts.map((acc: any) => (
              <Button
                key={acc.id}
                title={`${acc.numero || acc.code || acc.id} — ${formatMoney(Number(acc.solde || acc.soldeValide || 0))}`}
                variant={selectedCompteId === acc.id ? 'primary' : 'outline'}
                size="sm"
                onPress={() => setSelectedCompteId(acc.id)}
                className="mb-2"
              />
            ))}
          </View>
        )}

        {selectedAccount && (
          <Card className="mb-4 bg-bg-muted">
            <View className="flex-row justify-between">
              <Text className="text-text-muted text-sm">Solde disponible</Text>
              <Text className="text-text-primary font-bold">
                {formatMoney(Number(selectedAccount.solde || selectedAccount.soldeValide || 0))}
              </Text>
            </View>
          </Card>
        )}

        {/* Amount */}
        <Controller
          control={control}
          name="montant"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Montant du retrait"
              placeholder="0"
              keyboardType="numeric"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.montant}
            />
          )}
        />

        {/* Receipt */}
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

        {/* Observations */}
        <Controller
          control={control}
          name="observations"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Observations (optionnel)"
              placeholder="Notes..."
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
            title="Confirmer le retrait"
            variant="danger"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!selectedCompteId}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
