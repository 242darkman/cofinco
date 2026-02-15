import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAgentStore, type TypeOperationTerrain } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { api } from '@/lib/api-client';

// ─── Operation type definitions ─────────────────────────────────────────────

interface OperationTypeOption {
  value: TypeOperationTerrain;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const OPERATION_TYPES: OperationTypeOption[] = [
  { value: 'DEPOSIT_CURRENT', label: 'Depot courant', icon: 'wallet-outline' },
  { value: 'SAVINGS_DEPOSIT', label: 'Depot epargne', icon: 'cash-outline' },
  { value: 'LOAN_REPAYMENT', label: 'Remboursement credit', icon: 'card-outline' },
  { value: 'TONTINE_CONTRIBUTION', label: 'Cotisation tontine', icon: 'people-outline' },
  { value: 'ENGAGEMENT_FEE', label: 'Frais engagement', icon: 'document-text-outline' },
  { value: 'MISC_COLLECTION', label: 'Autre collecte', icon: 'ellipsis-horizontal-circle-outline' },
];

// ─── Schema ─────────────────────────────────────────────────────────────────

const depositSchema = z.object({
  montant: z.string().min(1, 'Montant requis').refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    'Montant invalide'
  ),
  creditId: z.string().optional(),
  compteId: z.string().optional(),
  tontineId: z.string().optional(),
  numeroRecu: z.string().optional(),
  observations: z.string().optional(),
});

type DepositForm = z.infer<typeof depositSchema>;

// ─── Picker item type ───────────────────────────────────────────────────────

interface PickerItem {
  id: string;
  label: string;
  detail?: string;
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function DepositScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    clientId: string;
    clientNom: string;
    clientTelephone: string;
    operationType: string;
  }>();

  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const collectCash = useAgentStore((s) => s.collectCash);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Operation type state
  const initialType = (params.operationType as TypeOperationTerrain) || 'DEPOSIT_CURRENT';
  const [selectedType, setSelectedType] = useState<TypeOperationTerrain>(initialType);

  // Conditional data for pickers
  const [credits, setCredits] = useState<PickerItem[]>([]);
  const [comptes, setComptes] = useState<PickerItem[]>([]);
  const [tontines, setTontines] = useState<PickerItem[]>([]);
  const [loadingPicker, setLoadingPicker] = useState(false);

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<DepositForm>({
    resolver: zodResolver(depositSchema),
  });

  const selectedCreditId = watch('creditId');
  const selectedCompteId = watch('compteId');
  const selectedTontineId = watch('tontineId');

  // ─── Fetch conditional data when type changes ───────────────────────────

  const fetchConditionalData = useCallback(async () => {
    if (!params.clientId) return;
    setLoadingPicker(true);

    try {
      if (selectedType === 'LOAN_REPAYMENT') {
        const data = await api.get<any[]>(
          `/api/credits?clientId=${params.clientId}&statut=ACTIVE`
        );
        const items = (Array.isArray(data) ? data : []).map((c: any) => ({
          id: c.id,
          label: c.numero || `Credit #${c.id.slice(0, 8)}`,
          detail: c.montantAccorde ? `${formatMoney(c.montantAccorde)}` : undefined,
        }));
        setCredits(items);
        if (items.length === 1) setValue('creditId', items[0].id);
      } else if (selectedType === 'SAVINGS_DEPOSIT') {
        const data = await api.get<any[]>(
          `/api/comptes-epargne?clientId=${params.clientId}`
        );
        const items = (Array.isArray(data) ? data : []).map((c: any) => ({
          id: c.id,
          label: c.numero || `Compte #${c.id.slice(0, 8)}`,
          detail: c.solde != null ? `Solde: ${formatMoney(Number(c.solde))}` : undefined,
        }));
        setComptes(items);
        if (items.length === 1) setValue('compteId', items[0].id);
      } else if (selectedType === 'TONTINE_CONTRIBUTION') {
        const data = await api.get<any[]>(
          `/api/clients/${params.clientId}/tontines`
        );
        const items = (Array.isArray(data) ? data : []).map((t: any) => ({
          id: t.id,
          label: t.nom || t.numero || `Tontine #${t.id.slice(0, 8)}`,
          detail: t.cotisation ? `Cotisation: ${formatMoney(Number(t.cotisation))}` : undefined,
        }));
        setTontines(items);
        if (items.length === 1) setValue('tontineId', items[0].id);
      }
    } catch {
      // Silently fail, picker will show empty
    } finally {
      setLoadingPicker(false);
    }
  }, [selectedType, params.clientId, setValue]);

  useEffect(() => {
    // Reset conditional fields when type changes
    setValue('creditId', undefined);
    setValue('compteId', undefined);
    setValue('tontineId', undefined);
    fetchConditionalData();
  }, [selectedType, fetchConditionalData, setValue]);

  // ─── Submit ─────────────────────────────────────────────────────────────

  const onSubmit = async (data: DepositForm) => {
    if (!params.clientId) {
      Alert.alert('Erreur', 'Aucun client selectionne');
      return;
    }

    // Validate conditional fields
    if (selectedType === 'LOAN_REPAYMENT' && !data.creditId) {
      Alert.alert('Erreur', 'Veuillez selectionner un credit');
      return;
    }
    if (selectedType === 'SAVINGS_DEPOSIT' && !data.compteId) {
      Alert.alert('Erreur', 'Veuillez selectionner un compte epargne');
      return;
    }
    if (selectedType === 'TONTINE_CONTRIBUTION' && !data.tontineId) {
      Alert.alert('Erreur', 'Veuillez selectionner une tontine');
      return;
    }

    setIsSubmitting(true);
    try {
      await collectCash({
        clientId: params.clientId,
        montant: Number(data.montant),
        typePaiementClient: selectedType,
        creditId: data.creditId,
        compteId: data.compteId,
        tontineId: data.tontineId,
        numeroRecu: data.numeroRecu,
        observations: data.observations,
      });

      const typeLabel = OPERATION_TYPES.find((t) => t.value === selectedType)?.label || 'Collecte';
      Alert.alert(
        'Collecte enregistree',
        `${typeLabel}: ${formatMoney(Number(data.montant))} collecte de ${params.clientNom}.\nStatut: En attente d'approbation.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || "Impossible de creer l'operation");
    } finally {
      setIsSubmitting(false);
    }
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
        {/* Client info */}
        <Card variant="elevated" className="mb-5">
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

        {/* Operation type picker */}
        <Text className="text-text-secondary text-sm font-medium mb-2">
          Type d'operation
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-5"
          contentContainerClassName="gap-2"
        >
          {OPERATION_TYPES.map((type) => {
            const isSelected = selectedType === type.value;
            return (
              <Pressable
                key={type.value}
                onPress={() => setSelectedType(type.value)}
                className={`flex-row items-center px-3 py-2 rounded-full border ${
                  isSelected
                    ? 'bg-accent border-accent'
                    : 'bg-card-bg border-card-border'
                }`}
              >
                <Ionicons
                  name={type.icon}
                  size={16}
                  color={isSelected ? '#ffffff' : colors.textMuted}
                />
                <Text
                  className={`text-sm font-medium ml-1.5 ${
                    isSelected ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {type.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Amount input */}
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

        {/* Conditional: Credit picker */}
        {selectedType === 'LOAN_REPAYMENT' && (
          <View className="mb-4">
            <Text className="text-text-secondary text-sm font-medium mb-1.5">
              Credit actif
            </Text>
            {loadingPicker ? (
              <ActivityIndicator size="small" className="py-3" />
            ) : credits.length === 0 ? (
              <View className="bg-warning/10 rounded-xl p-3">
                <Text className="text-warning text-sm">
                  Aucun credit actif pour ce client.
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {credits.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setValue('creditId', item.id)}
                    className={`flex-row items-center px-4 py-3 rounded-xl border ${
                      selectedCreditId === item.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-input-bg border-input-border'
                    }`}
                  >
                    <Ionicons
                      name={selectedCreditId === item.id ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selectedCreditId === item.id ? colors.accent : colors.textMuted}
                    />
                    <View className="ml-3 flex-1">
                      <Text className="text-text-primary text-sm font-medium">{item.label}</Text>
                      {item.detail && (
                        <Text className="text-text-muted text-xs">{item.detail}</Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Conditional: Compte epargne picker */}
        {selectedType === 'SAVINGS_DEPOSIT' && (
          <View className="mb-4">
            <Text className="text-text-secondary text-sm font-medium mb-1.5">
              Compte epargne
            </Text>
            {loadingPicker ? (
              <ActivityIndicator size="small" className="py-3" />
            ) : comptes.length === 0 ? (
              <View className="bg-warning/10 rounded-xl p-3">
                <Text className="text-warning text-sm">
                  Aucun compte epargne pour ce client.
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {comptes.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setValue('compteId', item.id)}
                    className={`flex-row items-center px-4 py-3 rounded-xl border ${
                      selectedCompteId === item.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-input-bg border-input-border'
                    }`}
                  >
                    <Ionicons
                      name={selectedCompteId === item.id ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selectedCompteId === item.id ? colors.accent : colors.textMuted}
                    />
                    <View className="ml-3 flex-1">
                      <Text className="text-text-primary text-sm font-medium">{item.label}</Text>
                      {item.detail && (
                        <Text className="text-text-muted text-xs">{item.detail}</Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Conditional: Tontine picker */}
        {selectedType === 'TONTINE_CONTRIBUTION' && (
          <View className="mb-4">
            <Text className="text-text-secondary text-sm font-medium mb-1.5">
              Tontine
            </Text>
            {loadingPicker ? (
              <ActivityIndicator size="small" className="py-3" />
            ) : tontines.length === 0 ? (
              <View className="bg-warning/10 rounded-xl p-3">
                <Text className="text-warning text-sm">
                  Aucune tontine pour ce client.
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {tontines.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setValue('tontineId', item.id)}
                    className={`flex-row items-center px-4 py-3 rounded-xl border ${
                      selectedTontineId === item.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-input-bg border-input-border'
                    }`}
                  >
                    <Ionicons
                      name={selectedTontineId === item.id ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selectedTontineId === item.id ? colors.accent : colors.textMuted}
                    />
                    <View className="ml-3 flex-1">
                      <Text className="text-text-primary text-sm font-medium">{item.label}</Text>
                      {item.detail && (
                        <Text className="text-text-muted text-xs">{item.detail}</Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Receipt number */}
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
              placeholder="Notes sur l'operation..."
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
            title="Confirmer la collecte"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
