import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ─── Password requirements (matches server defaults) ─────────────────────────

const DEFAULT_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '@$!%*?&',
};

interface Requirement {
  key: string;
  label: string;
  check: (password: string) => boolean;
}

function buildRequirements(config = DEFAULT_REQUIREMENTS): Requirement[] {
  const reqs: Requirement[] = [
    {
      key: 'length',
      label: `Au moins ${config.minLength} caracteres`,
      check: (p) => p.length >= config.minLength,
    },
  ];
  if (config.requireUppercase) {
    reqs.push({ key: 'upper', label: 'Une majuscule (A-Z)', check: (p) => /[A-Z]/.test(p) });
  }
  if (config.requireLowercase) {
    reqs.push({ key: 'lower', label: 'Une minuscule (a-z)', check: (p) => /[a-z]/.test(p) });
  }
  if (config.requireNumbers) {
    reqs.push({ key: 'number', label: 'Un chiffre (0-9)', check: (p) => /[0-9]/.test(p) });
  }
  if (config.requireSpecialChars) {
    reqs.push({
      key: 'special',
      label: `Un caractere special (${config.specialChars})`,
      check: (p) => /[@$!%*?&]/.test(p),
    });
  }
  return reqs;
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function ForcePasswordChangeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const checkSession = useAuthStore((s) => s.checkSession);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requirements = useMemo(() => buildRequirements(), []);

  const allMet = useMemo(
    () => requirements.every((r) => r.check(newPassword)),
    [newPassword, requirements]
  );

  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const canSubmit =
    currentPassword.length > 0 && allMet && passwordsMatch && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });

      // Refresh session — mustChangePassword is now false
      await checkSession();

      Alert.alert('Succes', 'Votre mot de passe a ete change avec succes.');
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Erreur lors du changement';
      if (/mot de passe actuel|current password/i.test(msg)) {
        setError('Mot de passe actuel incorrect');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-12 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="items-center mb-6">
          <View className="w-16 h-16 rounded-full bg-danger/10 items-center justify-center mb-4">
            <Ionicons name="lock-closed" size={32} color={colors.danger} />
          </View>
          <Text className="text-text-primary text-xl font-bold text-center">
            Changement de mot de passe requis
          </Text>
          <Text className="text-text-muted text-sm text-center mt-2">
            Pour des raisons de securite, vous devez changer votre mot de passe avant de continuer.
          </Text>
        </View>

        {/* Error banner */}
        {error !== '' && (
          <View className="flex-row items-center bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 mb-4">
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text className="text-danger text-sm ml-2 flex-1">{error}</Text>
          </View>
        )}

        {/* Current password */}
        <View className="mb-4">
          <Text className="text-text-secondary text-sm font-medium mb-1.5">
            Mot de passe actuel
          </Text>
          <View className="flex-row items-center bg-input-bg border border-input-border rounded-xl px-4">
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <Input
              className="flex-1 border-0 mb-0 px-2"
              placeholder="Mot de passe actuel"
              value={currentPassword}
              onChangeText={(v) => { setCurrentPassword(v); setError(''); }}
              secureTextEntry={!showCurrent}
              autoFocus
            />
            <Pressable onPress={() => setShowCurrent(!showCurrent)}>
              <Ionicons
                name={showCurrent ? 'eye' : 'eye-off'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </View>

        {/* New password */}
        <View className="mb-4">
          <Text className="text-text-secondary text-sm font-medium mb-1.5">
            Nouveau mot de passe
          </Text>
          <View className="flex-row items-center bg-input-bg border border-input-border rounded-xl px-4">
            <Ionicons name="key-outline" size={18} color={colors.textMuted} />
            <Input
              className="flex-1 border-0 mb-0 px-2"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
            />
            <Pressable onPress={() => setShowNew(!showNew)}>
              <Ionicons
                name={showNew ? 'eye' : 'eye-off'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </View>

        {/* Confirm password */}
        <View className="mb-4">
          <Text className="text-text-secondary text-sm font-medium mb-1.5">
            Confirmer le mot de passe
          </Text>
          <View className="flex-row items-center bg-input-bg border border-input-border rounded-xl px-4">
            <Ionicons name="key-outline" size={18} color={colors.textMuted} />
            <Input
              className="flex-1 border-0 mb-0 px-2"
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
            />
            <Pressable onPress={() => setShowConfirm(!showConfirm)}>
              <Ionicons
                name={showConfirm ? 'eye' : 'eye-off'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </View>

        {/* Password match feedback */}
        {confirmPassword.length > 0 && (
          <View className="flex-row items-center mb-3">
            <Ionicons
              name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={passwordsMatch ? colors.success : colors.danger}
            />
            <Text
              className={`text-xs ml-1.5 ${passwordsMatch ? 'text-success' : 'text-danger'}`}
            >
              {passwordsMatch
                ? 'Mots de passe identiques'
                : 'Les mots de passe ne correspondent pas'}
            </Text>
          </View>
        )}

        {/* Requirements checklist */}
        <View className="bg-bg-muted rounded-xl p-4 mb-6">
          <Text className="text-text-secondary text-xs font-semibold mb-2">
            Criteres de securite
          </Text>
          <View className="gap-1.5">
            {requirements.map((req) => {
              const met = req.check(newPassword);
              return (
                <View key={req.key} className="flex-row items-center">
                  <Ionicons
                    name={met ? 'checkmark-circle' : 'ellipse-outline'}
                    size={14}
                    color={met ? colors.success : colors.textMuted}
                  />
                  <Text
                    className={`text-xs ml-1.5 ${met ? 'text-success' : 'text-text-muted'}`}
                  >
                    {req.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Submit */}
        <Button
          title={loading ? 'Changement en cours...' : 'Changer le mot de passe'}
          variant="danger"
          onPress={handleSubmit}
          loading={loading}
          disabled={!canSubmit}
          icon={<Ionicons name="lock-closed" size={18} color="#ffffff" />}
        />

        <Text className="text-text-muted text-xs text-center mt-4">
          Ce changement est obligatoire pour acceder a l'application.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
