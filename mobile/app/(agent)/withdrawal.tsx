import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/loading';

/**
 * Withdrawal screen placeholder.
 * Agent terrain mode primarily handles collections (COLLECT_CASH).
 * Withdrawals on the field require higher authorization and are not
 * typically performed by field agents.
 */
export default function WithdrawalScreen() {
  return (
    <View className="flex-1 bg-bg-base items-center justify-center px-8">
      <EmptyState
        icon={<Ionicons name="lock-closed-outline" size={48} color="#94a3b8" />}
        title="Fonction non disponible"
        description="Les retraits terrain ne sont pas autorises depuis l'application mobile. Contactez votre chef d'agence."
      />
    </View>
  );
}
