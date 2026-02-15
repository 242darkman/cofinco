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
      {/* Main dashboard */}
      <Stack.Screen
        name="index"
        options={{ title: 'Agent Terrain', headerShown: false }}
      />

      {/* Operations */}
      <Stack.Screen
        name="deposit"
        options={{ title: 'Collecte', presentation: 'card' }}
      />
      <Stack.Screen
        name="withdrawal"
        options={{ title: 'Retrait', presentation: 'card' }}
      />
      <Stack.Screen
        name="settlement"
        options={{ title: 'Remise de fonds', presentation: 'card' }}
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
        name="operation-detail"
        options={{ title: 'Detail operation', presentation: 'card' }}
      />

      {/* Session */}
      <Stack.Screen
        name="session-summary"
        options={{ title: 'Session', presentation: 'modal' }}
      />

      {/* Prospection */}
      <Stack.Screen
        name="prospection-list"
        options={{ title: 'Prospection', presentation: 'card' }}
      />
      <Stack.Screen
        name="prospection-form"
        options={{ title: 'Nouveau prospect', presentation: 'card' }}
      />
      <Stack.Screen
        name="prospection-detail"
        options={{ title: 'Detail prospect', presentation: 'card' }}
      />

      {/* Performance */}
      <Stack.Screen
        name="kpi"
        options={{ title: 'Performance', presentation: 'card' }}
      />
      <Stack.Screen
        name="objectifs"
        options={{ title: 'Objectifs', presentation: 'card' }}
      />
      <Stack.Screen
        name="commissions"
        options={{ title: 'Commissions', presentation: 'card' }}
      />
      <Stack.Screen
        name="leaderboard"
        options={{ title: 'Classement', presentation: 'card' }}
      />

      {/* Planning & Enquetes */}
      <Stack.Screen
        name="planning"
        options={{ title: 'Planning', presentation: 'card' }}
      />
      <Stack.Screen
        name="enquetes"
        options={{ title: 'Enquetes credit', presentation: 'card' }}
      />

      {/* Admin / Support */}
      <Stack.Screen
        name="formations"
        options={{ title: 'Formations', presentation: 'card' }}
      />
      <Stack.Screen
        name="incidents"
        options={{ title: 'Incidents', presentation: 'card' }}
      />
      <Stack.Screen
        name="materiel"
        options={{ title: 'Materiel', presentation: 'card' }}
      />
      <Stack.Screen
        name="rapports"
        options={{ title: 'Rapports', presentation: 'card' }}
      />
    </Stack>
  );
}
