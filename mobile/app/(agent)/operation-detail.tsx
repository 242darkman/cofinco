import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { useAgentStore, type OperationTerrain } from '@/stores/agent-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { formatMoney } from '@shared/types/mobile';
import { formatFullDate } from '@/lib/format';

const TYPE_LABELS: Record<string, string> = {
  COLLECT_CASH: 'Collecte',
  SETTLEMENT_CASH: 'Remise de fonds',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  LOAN_REPAYMENT: 'Remboursement credit',
  SAVINGS_DEPOSIT: 'Depot epargne',
  DEPOSIT_CURRENT: 'Depot courant',
  WITHDRAWAL_SAVINGS: 'Retrait epargne',
  WITHDRAWAL_CURRENT: 'Retrait courant',
  TONTINE_CONTRIBUTION: 'Cotisation tontine',
  ENGAGEMENT_FEE: "Frais d'engagement",
  MISC_COLLECTION: 'Autre collecte',
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Soumise',
  APPROVED: 'Approuvee',
  PENDING_SETTLEMENT: 'En attente reglement',
  SETTLED: 'Reglee',
  REJECTED: 'Rejetee',
  CANCELLED: 'Annulee',
};

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  SUBMITTED: 'warning',
  APPROVED: 'success',
  PENDING_SETTLEMENT: 'info',
  SETTLED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: string }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  if (!value) return null;

  return (
    <View className="flex-row items-start py-2.5 border-b border-border-subtle">
      {icon && (
        <Ionicons name={icon as any} size={16} color={colors.textMuted} style={{ marginRight: 8, marginTop: 2 }} />
      )}
      <View className="flex-1">
        <Text className="text-text-muted text-xs uppercase font-semibold">{label}</Text>
        <Text className="text-text-primary text-sm mt-0.5">{value}</Text>
      </View>
    </View>
  );
}

export default function OperationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const cancelOperation = useAgentStore((s) => s.cancelOperation);
  const [cancelling, setCancelling] = useState(false);

  const { data: op, isLoading, refetch } = useQuery({
    queryKey: ['agent', 'operation', id],
    queryFn: async () => {
      const agentId = useAgentStore.getState().employeId;
      if (!agentId) return null;
      const res = await useAgentStore.getState().getOperations({ limit: 100 });
      return res.operations.find((o) => o.id === id) || null;
    },
    enabled: !!id,
  });

  const handleCancel = () => {
    Alert.alert(
      'Annuler l\'operation',
      'Etes-vous sur de vouloir annuler cette operation ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await cancelOperation(id);
              Alert.alert('Operation annulee', '', [{ text: 'OK', onPress: () => router.back() }]);
            } catch (e: any) {
              Alert.alert('Erreur', e?.message || 'Impossible d\'annuler');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) return <Loading fullScreen message="Chargement..." />;
  if (!op) {
    return (
      <View className="flex-1 bg-bg-base items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
        <Text className="text-text-primary font-semibold mt-3">Operation introuvable</Text>
        <Button title="Retour" variant="ghost" onPress={() => router.back()} className="mt-4" />
      </View>
    );
  }

  const isCollect = op.type === 'COLLECT_CASH';
  const canCancel = op.statut === 'SUBMITTED';

  return (
    <ScrollView className="flex-1 bg-bg-base" contentContainerClassName="px-5 pt-4 pb-8">
      {/* Header */}
      <Card variant="elevated" className="mb-4">
        <View className="items-center">
          <View className={`w-14 h-14 rounded-full items-center justify-center mb-3 ${isCollect ? 'bg-success/10' : 'bg-warning/10'}`}>
            <Ionicons
              name={isCollect ? 'arrow-down-circle' : 'arrow-up-circle'}
              size={32}
              color={isCollect ? colors.success : colors.warning}
            />
          </View>
          <Text className="text-text-primary text-2xl font-bold">
            {formatMoney(op.montant)}
          </Text>
          <Text className="text-text-muted text-sm mt-1">
            {TYPE_LABELS[op.type] || op.type}
          </Text>
          <View className="mt-2">
            <Badge
              label={STATUS_LABELS[op.statut] || op.statut}
              variant={STATUS_VARIANTS[op.statut] || 'neutral'}
              size="md"
            />
          </View>
        </View>
      </Card>

      {/* Details */}
      <Card className="mb-4">
        <Text className="text-text-primary font-semibold mb-2">Details</Text>
        <InfoRow label="Date" value={formatFullDate(op.createdAt)} icon="calendar-outline" />
        {op.clientNom && (
          <InfoRow label="Client" value={`${op.clientPrenom || ''} ${op.clientNom}`.trim()} icon="person-outline" />
        )}
        {op.metadata?.typePaiementClient && (
          <InfoRow
            label="Type de paiement"
            value={PAYMENT_TYPE_LABELS[op.metadata.typePaiementClient] || op.metadata.typePaiementClient}
            icon="pricetag-outline"
          />
        )}
        {op.numeroRecu && <InfoRow label="Numero de recu" value={op.numeroRecu} icon="receipt-outline" />}
        {op.observations && <InfoRow label="Observations" value={op.observations} icon="chatbubble-outline" />}
        {op.metadata?.latitude && op.metadata?.longitude && (
          <InfoRow
            label="Position GPS"
            value={`${op.metadata.latitude.toFixed(6)}, ${op.metadata.longitude.toFixed(6)}`}
            icon="location-outline"
          />
        )}
      </Card>

      {/* Timeline */}
      <Card className="mb-4">
        <Text className="text-text-primary font-semibold mb-2">Chronologie</Text>
        <TimelineItem
          label="Soumise"
          date={op.createdAt}
          icon="send"
          color={colors.info}
        />
        {op.approvedAt && (
          <TimelineItem
            label="Approuvee"
            date={op.approvedAt}
            icon="checkmark-circle"
            color={colors.success}
          />
        )}
        {op.rejectedAt && (
          <TimelineItem
            label={`Rejetee${op.rejectionReason ? ` — ${op.rejectionReason}` : ''}`}
            date={op.rejectedAt}
            icon="close-circle"
            color={colors.danger}
          />
        )}
        {op.cancelledAt && (
          <TimelineItem
            label="Annulee"
            date={op.cancelledAt}
            icon="ban"
            color={colors.textMuted}
          />
        )}
      </Card>

      {/* Actions */}
      {canCancel && (
        <Button
          title="Annuler cette operation"
          variant="danger"
          onPress={handleCancel}
          loading={cancelling}
        />
      )}
    </ScrollView>
  );
}

function TimelineItem({ label, date, icon, color }: { label: string; date: string; icon: string; color: string }) {
  return (
    <View className="flex-row items-start py-2">
      <View className="w-6 items-center mr-3">
        <Ionicons name={icon as any} size={16} color={color} />
        <View className="w-0.5 flex-1 bg-border-subtle mt-1" />
      </View>
      <View className="flex-1">
        <Text className="text-text-primary text-sm">{label}</Text>
        <Text className="text-text-muted text-xs">{formatFullDate(date)}</Text>
      </View>
    </View>
  );
}
