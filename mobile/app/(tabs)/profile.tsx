import { View, Text, ScrollView, Switch, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Constants from 'expo-constants';

import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getRoleLabel, CONTEXT_LABELS } from '@shared/types/mobile';
import type { AppContext } from '@shared/types/mobile';

function SettingRow({
  icon,
  label,
  value,
  onPress,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <Pressable
      className="flex-row items-center py-3.5 active:bg-bg-muted rounded-lg px-1"
      onPress={onPress}
      disabled={!onPress && !trailing}
    >
      <View className="w-9 h-9 rounded-xl bg-bg-muted items-center justify-center mr-3">
        <Ionicons name={icon} size={18} color={colors.textMuted} />
      </View>
      <View className="flex-1">
        <Text className="text-text-primary text-sm font-medium">{label}</Text>
        {value && <Text className="text-text-muted text-xs mt-0.5">{value}</Text>}
      </View>
      {trailing ?? (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />)}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const user = useAuthStore((s) => s.user);
  const activeContext = useAuthStore((s) => s.activeContext);
  const availableContexts = useAuthStore((s) => s.availableContexts);
  const switchContext = useAuthStore((s) => s.switchContext);
  const { logout, biometricsEnabled, biometricsAvailable, enableBiometrics, disableBiometrics } =
    useAuthStore();
  const { themeMode, setThemeMode, branding } = useSettingsStore();

  const canSwitchContext = availableContexts.length > 1;

  const handleLogout = () => {
    Alert.alert(
      'Deconnexion',
      'Voulez-vous vraiment vous deconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se deconnecter',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleBiometricsToggle = (value: boolean) => {
    if (value) {
      enableBiometrics();
    } else {
      disableBiometrics();
    }
  };

  const cycleTheme = () => {
    const modes: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark'];
    const current = modes.indexOf(themeMode);
    setThemeMode(modes[(current + 1) % modes.length]);
  };

  const handleContextSwitch = () => {
    const otherContext: AppContext = activeContext === 'employee' ? 'client' : 'employee';
    switchContext(otherContext);
  };

  const themeLabel =
    themeMode === 'system' ? 'Automatique' : themeMode === 'light' ? 'Clair' : 'Sombre';

  return (
    <SafeAreaView className="flex-1 bg-bg-base" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
        {/* User card */}
        <View className="px-5 pt-4 pb-6">
          <Card variant="elevated" className="items-center py-6">
            {user?.photoProfile ? (
              <Image
                source={{ uri: user.photoProfile }}
                style={{ width: 72, height: 72, borderRadius: 36 }}
                contentFit="cover"
              />
            ) : (
              <View className="w-[72px] h-[72px] rounded-full bg-accent/10 items-center justify-center">
                <Ionicons name="person" size={32} color={colors.accent} />
              </View>
            )}
            <Text className="text-text-primary text-xl font-bold mt-3">
              {user?.nom} {user?.prenom ?? ''}
            </Text>
            <Text className="text-accent text-sm font-medium mt-0.5">
              {getRoleLabel(user?.role)}
            </Text>
            {user?.agence && (
              <Text className="text-text-muted text-xs mt-1">{user.agence}</Text>
            )}
          </Card>
        </View>

        {/* Context switch — only if multiple contexts available */}
        {canSwitchContext && (
          <View className="px-5 mb-6">
            <Card>
              <SettingRow
                icon={activeContext === 'employee' ? 'briefcase' : 'person-circle'}
                label={CONTEXT_LABELS[activeContext!]}
                value="Appuyez pour basculer"
                onPress={handleContextSwitch}
                trailing={
                  <View className="flex-row items-center">
                    <View className="bg-accent/10 rounded-full px-2.5 py-1 mr-2">
                      <Text className="text-accent text-xs font-semibold">
                        {activeContext === 'employee' ? 'PRO' : 'CLIENT'}
                      </Text>
                    </View>
                    <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
                  </View>
                }
              />
            </Card>
          </View>
        )}

        {/* Info section */}
        <View className="px-5 mb-6">
          <Text className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
            Informations
          </Text>
          <Card>
            <SettingRow icon="person-outline" label="Identifiant" value={user?.username} />
            {user?.email && <SettingRow icon="mail-outline" label="Email" value={user.email} />}
            {user?.telephone && (
              <SettingRow icon="call-outline" label="Telephone" value={user.telephone} />
            )}
          </Card>
        </View>

        {/* Preferences section */}
        <View className="px-5 mb-6">
          <Text className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
            Preferences
          </Text>
          <Card>
            <SettingRow
              icon="color-palette-outline"
              label="Theme"
              value={themeLabel}
              onPress={cycleTheme}
            />
            {biometricsAvailable && (
              <SettingRow
                icon="finger-print"
                label="Connexion biometrique"
                trailing={
                  <Switch
                    value={biometricsEnabled}
                    onValueChange={handleBiometricsToggle}
                    trackColor={{ true: colors.accent }}
                  />
                }
              />
            )}
          </Card>
        </View>

        {/* About */}
        <View className="px-5 mb-6">
          <Text className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
            A propos
          </Text>
          <Card>
            <SettingRow
              icon="information-circle-outline"
              label="Version"
              value={`${branding.appName} v${Constants.expoConfig?.version ?? '1.0.0'}`}
            />
            <SettingRow
              icon="shield-checkmark-outline"
              label="Politique de confidentialite"
              onPress={() => {}}
            />
          </Card>
        </View>

        {/* Logout */}
        <View className="px-5">
          <Button title="Se deconnecter" variant="danger" size="lg" onPress={handleLogout} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
