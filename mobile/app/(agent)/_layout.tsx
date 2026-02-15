import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function AgentLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Agent Terrain', headerShown: false }}
      />
      <Stack.Screen
        name="deposit"
        options={{ title: 'Depot', presentation: 'card' }}
      />
      <Stack.Screen
        name="withdrawal"
        options={{ title: 'Retrait', presentation: 'card' }}
      />
      <Stack.Screen
        name="client-search"
        options={{ title: 'Rechercher un client', presentation: 'card' }}
      />
      <Stack.Screen
        name="history"
        options={{ title: 'Historique du jour', presentation: 'card' }}
      />
      <Stack.Screen
        name="session-summary"
        options={{ title: 'Cloture de session', presentation: 'modal' }}
      />
    </Stack>
  );
}
