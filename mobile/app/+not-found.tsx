import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-bg-base items-center justify-center px-8">
      <Ionicons name="help-circle-outline" size={64} color="#94a3b8" />
      <Text className="text-text-primary text-xl font-bold mt-4">
        Page introuvable
      </Text>
      <Text className="text-text-muted text-sm text-center mt-2 mb-8">
        Cette page n'existe pas ou a ete deplacee.
      </Text>
      <Button title="Retour a l'accueil" onPress={() => router.replace('/(tabs)')} />
    </View>
  );
}
