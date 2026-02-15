import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
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

// ─── Schema ─────────────────────────────────────────────────────────────────

const settlementSchema = z.object({
  observations: z.string().optional(),
});

type SettlementForm = z.infer<typeof settlementSchema>;

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function SettlementScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const user = useAuthStore((s) => s.user);
  const { caisse, settlementCash } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Billetage state
  const [billetage, setBilletage] = useState<Record<string, number>>(emptyBilletage());
  const billetageTotal = useMemo(() => computeBilletageTotal(billetage), [billetage]);

  // Destination caisse picker
  const { data: caisses, isLoading: loadingCaisses } = useCaisses(user?.agenceId || null);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string | null>(null);

  // Filter out the agent's own caisse from destinations
  const destinationCaisses = useMemo(() => {
    if (!caisses || !Array.isArray(caisses)) return [];
    return caisses.filter((c: any) => c.id !== caisse?.caisseId);
  }, [caisses, caisse?.caisseId]);

  const disponible = Number(caisse?.disponible || 0);

  const { control, handleSubmit } = useForm<SettlementForm>({
    resolver: zodResolver(settlementSchema),
  });

  const handleBilletageChange = (denom: string, count: number) => {
    setBilletage((prev) => ({ ...prev, [denom]: count }));
  };

  // ─── Submit ─────────────────────────────────────────────────────────────

  const onSubmit = async (data: SettlementForm) => {
    if (billetageTotal <= 0) {
      Alert.alert('Erreur', 'Le montant du billetage doit etre superieur a 0.');
      return;
    }

    if (billetageTotal > disponible) {
      Alert.alert(
        'Montant insuffisant',
        `Le montant (${formatMoney(billetageTotal)}) depasse le disponible en caisse (${formatMoney(disponible)}).`
      );
      return;
    }

    if (!selectedCaisseId) {
      Alert.alert('Erreur', 'Veuillez selectionner une caisse de destination.');
      return;
    }

    Alert.alert(
      'Confirmer la remise',
      `Remettre ${formatMoney(billetageTotal)} a la caisse selectionnee ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await settlementCash({
                destinationCaisseId: selectedCaisseId,
                montant: billetageTotal,
                billetage,
                observations: data.observations,
              });

              Alert.alert(
                'Remise enregistree',
                `${formatMoney(billetageTotal)} remis avec succes.\nStatut: En attente de validation.`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error: any) {
              Alert.alert('Erreur', error?.message || 'Impossible de creer la remise');
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
        {/* Caisse balance header */}
        <Card variant="elevated" className="mb-5">
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-full bg-accent/10 items-center justify-center mr-3">
              <Ionicons name="wallet" size={20} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-text-muted text-xs uppercase font-semibold">
                Solde disponible
              </Text>
              <Text className="text-text-primary text-xl font-bold">
                {formatMoney(disponible)}
              </Text>
            </View>
          </View>

          {/* Balance details */}
          <View className="bg-bg-muted rounded-xl p-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-text-muted text-xs">Solde valide</Text>
              <Text className="text-text-primary text-xs font-medium">
                {formatMoney(Number(caisse?.soldeValide || 0))}
              </Text>
            </View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-text-muted text-xs">En attente (entree)</Text>
              <Text className="text-success text-xs font-medium">
                +{formatMoney(Number(caisse?.pendingIn || 0))}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-text-muted text-xs">En attente (sortie)</Text>
              <Text className="text-danger text-xs font-medium">
                -{formatMoney(Number(caisse?.pendingOut || 0))}
              </Text>
            </View>
          </View>
        </Card>

        {/* Billetage */}
        <Card variant="elevated" className="mb-5">
          <Text className="text-text-primary text-base font-bold mb-3">
            Billetage
          </Text>
          <BilletageInput
            billetage={billetage}
            onChange={handleBilletageChange}
            total={billetageTotal}
          />

          {/* Validation indicator */}
          {billetageTotal > 0 && billetageTotal > disponible && (
            <View className="bg-danger/10 rounded-xl p-3 mt-3">
              <View className="flex-row items-center">
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text className="text-danger text-sm ml-2 flex-1">
                  Le montant depasse le disponible de {formatMoney(billetageTotal - disponible)}
                </Text>
              </View>
            </View>
          )}
        </Card>

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

        {/* Observations */}
        <Controller
          control={control}
          name="observations"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Observations (optionnel)"
              placeholder="Notes sur la remise..."
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              numberOfLines={3}
            />
          )}
        />

        {/* Submit */}
        <View className="mt-2">
          <Button
            title={`Remettre ${billetageTotal > 0 ? formatMoney(billetageTotal) : ''}`}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={billetageTotal <= 0 || !selectedCaisseId}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
