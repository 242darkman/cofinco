import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { queryClient } from '@/lib/query-client';
import { mobileWs } from '@/lib/websocket';
import { registerForPushNotifications, addNotificationResponseListener } from '@/lib/notifications';
import { handleNotificationNavigation } from '@/lib/deep-links';
import { Loading } from '@/components/ui/loading';

import '../global.css';

// Keep splash screen visible while we check auth
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();

  const { isAuthenticated, isLoading, activeContext, user, checkSession } = useAuthStore();
  const { loadBranding, loadSystemSettings } = useSettingsStore();
  const prevAuthenticated = useRef(false);

  // Initialize on mount: check session + load branding
  useEffect(() => {
    async function bootstrap() {
      await loadBranding();
      await checkSession();
      await SplashScreen.hideAsync();
    }
    bootstrap();
  }, []);

  // Auth guard + context-based routing
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onForcePasswordChange = segments[1] === 'force-password-change';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && user?.mustChangePassword && !onForcePasswordChange) {
      // Must change password before accessing the app
      router.replace('/(auth)/force-password-change');
    } else if (isAuthenticated && !user?.mustChangePassword && inAuthGroup) {
      // Authenticated and password OK — route to the appropriate context
      if (activeContext === 'employee') {
        router.replace('/(agent)');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isLoading, segments, user?.mustChangePassword]);

  // When activeContext changes (user switched), navigate to the right group
  useEffect(() => {
    if (!isAuthenticated || isLoading || !activeContext || user?.mustChangePassword) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const inAgentGroup = segments[0] === '(agent)';

    if (activeContext === 'employee' && inTabsGroup) {
      router.replace('/(agent)');
    } else if (activeContext === 'client' && inAgentGroup) {
      router.replace('/(tabs)');
    }
  }, [activeContext]);

  // Wire WebSocket, push notifications, and settings on auth change
  useEffect(() => {
    if (isAuthenticated && !prevAuthenticated.current) {
      mobileWs.connect();
      loadSystemSettings();
      registerForPushNotifications().catch(() => {});
    } else if (!isAuthenticated && prevAuthenticated.current) {
      mobileWs.disconnect();
      queryClient.clear();
    }
    prevAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  // Listen for notification taps (deep links)
  useEffect(() => {
    const cleanup = addNotificationResponseListener(handleNotificationNavigation);
    return cleanup;
  }, []);

  // Reconnect WebSocket when app comes back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        mobileWs.connect();
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  if (isLoading) {
    return <Loading fullScreen message="Chargement..." />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(agent)" />
          <Stack.Screen
            name="account/[id]"
            options={{
              headerShown: true,
              title: 'Compte',
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="transaction/[id]"
            options={{
              headerShown: true,
              title: 'Transaction',
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="qr/generate"
            options={{
              headerShown: true,
              title: 'Code QR',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="qr/scan"
            options={{
              headerShown: true,
              title: 'Scanner QR',
              presentation: 'modal',
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
