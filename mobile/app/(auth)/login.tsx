import { useState, useEffect } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';

const loginSchema = z.object({
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, biometricsEnabled, biometricsAvailable, loginWithBiometrics } =
    useAuthStore();
  const { branding, loadBranding } = useSettingsStore();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => {
    loadBranding();
  }, []);

  // Auto-trigger biometric login on mount if enabled
  useEffect(() => {
    if (biometricsEnabled && biometricsAvailable) {
      handleBiometricLogin();
    }
  }, [biometricsEnabled, biometricsAvailable]);

  const handleBiometricLogin = async () => {
    const success = await loginWithBiometrics();
    if (!success) {
      // Biometric login failed, user needs to enter password
    }
  };

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.username, data.password);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) {
          const errorData = error.data as { locked?: boolean; retryAfterSeconds?: number };
          if (errorData?.locked) {
            const seconds = errorData.retryAfterSeconds ?? 60;
            Alert.alert(
              'Compte verrouille',
              `Trop de tentatives. Reessayez dans ${Math.ceil(seconds / 60)} minute(s).`
            );
            return;
          }
        }
        setError('root', { message: error.message });
      } else {
        setError('root', { message: 'Erreur de connexion' });
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-bg-base"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo & branding */}
        <View className="items-center mb-10">
          {branding.logoUrl ? (
            <Image
              source={{ uri: branding.logoUrl }}
              style={{ width: 80, height: 80 }}
              contentFit="contain"
              accessibilityLabel="Logo"
            />
          ) : (
            <View className="w-20 h-20 rounded-2xl bg-accent items-center justify-center mb-3">
              <Ionicons name="business" size={40} color="#ffffff" />
            </View>
          )}
          <Text className="text-text-primary text-2xl font-bold mt-3">
            {branding.appName}
          </Text>
          <Text className="text-text-muted text-sm mt-1">
            Connectez-vous a votre espace
          </Text>
        </View>

        {/* Error message */}
        {errors.root && (
          <View className="bg-danger-bg border border-danger rounded-xl px-4 py-3 mb-4">
            <Text className="text-danger-text text-sm">{errors.root.message}</Text>
          </View>
        )}

        {/* Login form */}
        <View className="bg-card-bg border border-card-border rounded-2xl p-6">
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Identifiant"
                placeholder="Votre identifiant"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.username}
                returnKeyType="next"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Mot de passe"
                placeholder="Votre mot de passe"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.password}
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
              />
            )}
          />

          <Button
            title="Se connecter"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
          />
        </View>

        {/* Biometric login */}
        {biometricsEnabled && biometricsAvailable && (
          <View className="items-center mt-6">
            <Button
              title="Connexion biometrique"
              variant="ghost"
              onPress={handleBiometricLogin}
              icon={<Ionicons name="finger-print" size={22} color="#047857" />}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
