import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/lib/api-client';
import { queryKeys } from '@/constants/query-keys';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading, EmptyState } from '@/components/ui/loading';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { formatMoney } from '@shared/types/mobile';

interface TransactionDetail {
  id: string;
  reference: string;
  montant: number;
  typeTransaction: string;
  description?: string;
  sens: 'IN' | 'OUT';
  statut: string;
  methodePaiement?: string;
  motif?: string;
  observations?: string;
  createdAt: string;
  soldeApres?: number;
  nomClient?: string;
  numeroCompte?: string;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-start justify-between py-2.5 border-b border-border-subtle">
      <Text className="text-text-muted text-sm flex-1">{label}</Text>
      <Text className="text-text-primary text-sm font-medium text-right flex-1 ml-3">
        {value}
      </Text>
    </View>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const { data: tx, isLoading } = useQuery({
    queryKey: queryKeys.transactions.detail(id),
    queryFn: () => api.get<TransactionDetail>(`/api/transactions/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return <Loading fullScreen message="Chargement..." />;
  }

  if (!tx) {
    return (
      <EmptyState
        icon={<Ionicons name="alert-circle-outline" size={48} color="#94a3b8" />}
        title="Transaction introuvable"
      />
    );
  }

  const isIncoming = tx.sens === 'IN';
  const date = new Date(tx.createdAt);

  const statusVariant =
    tx.statut === 'POSTED'
      ? 'success'
      : tx.statut === 'PENDING'
        ? 'warning'
        : tx.statut === 'REJECTED' || tx.statut === 'CANCELLED'
          ? 'danger'
          : 'neutral';

  return (
    <ScrollView className="flex-1 bg-bg-base" contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
      {/* Amount hero */}
      <View className="items-center pt-8 pb-6 px-5">
        <View
          className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${
            isIncoming ? 'bg-success-bg' : 'bg-danger-bg'
          }`}
        >
          <Ionicons
            name={isIncoming ? 'arrow-down-circle' : 'arrow-up-circle'}
            size={36}
            color={isIncoming ? colors.success : colors.danger}
          />
        </View>
        <Text
          className={`text-3xl font-bold ${isIncoming ? 'text-success' : 'text-danger'}`}
        >
          {isIncoming ? '+' : '-'}{formatMoney(Math.abs(tx.montant))}
        </Text>
        <Text className="text-text-muted text-sm mt-1">
          {tx.description ?? tx.typeTransaction}
        </Text>
        <Badge label={tx.statut} variant={statusVariant as any} size="md" />
      </View>

      {/* Details */}
      <View className="px-5">
        <Card>
          <InfoRow label="Reference" value={tx.reference} />
          <InfoRow label="Type" value={tx.typeTransaction} />
          <InfoRow
            label="Date"
            value={date.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          />
          <InfoRow label="Methode" value={tx.methodePaiement} />
          <InfoRow label="Motif" value={tx.motif} />
          <InfoRow label="Client" value={tx.nomClient} />
          <InfoRow label="Compte" value={tx.numeroCompte} />
          {tx.soldeApres != null && (
            <InfoRow label="Solde apres" value={formatMoney(tx.soldeApres)} />
          )}
          <InfoRow label="Observations" value={tx.observations} />
        </Card>
      </View>
    </ScrollView>
  );
}
