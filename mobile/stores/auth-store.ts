import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { api, setOnUnauthorized } from '@/lib/api-client';
import type { SystemRole, AppContext } from '@shared/types/mobile';

// Keys for SecureStore
const BIOMETRICS_ENABLED_KEY = 'cofinco_biometrics_enabled';
const LAST_USERNAME_KEY = 'cofinco_last_username';
const ACTIVE_CONTEXT_KEY = 'cofinco_active_context';

export interface AuthUser {
  id: string;
  username: string;
  nom: string;
  prenom: string | null;
  role: SystemRole;
  agence: string | null;
  agenceId: string | undefined;
  email?: string;
  telephone?: string;
  photoProfile?: string | null;
  mustChangePassword: boolean;
}

/** Response shape from POST /api/auth/login */
interface LoginResponse {
  user: AuthUser;
  availableContexts: AppContext[];
  defaultContext: AppContext;
}

/** Response shape from GET /api/auth/me (flat object) */
interface MeResponse extends AuthUser {
  sessionValid: boolean;
  availableContexts: AppContext[];
  defaultContext: AppContext;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;

  // Context switching
  activeContext: AppContext | null;
  availableContexts: AppContext[];

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  switchContext: (context: AppContext) => void;
  enableBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
  loginWithBiometrics: () => Promise<boolean>;
  checkBiometricsAvailability: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Wire up the 401 handler
  setOnUnauthorized(() => {
    set({ user: null, isAuthenticated: false, activeContext: null, availableContexts: [] });
  });

  return {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    biometricsEnabled: false,
    biometricsAvailable: false,
    activeContext: null,
    availableContexts: [],

    login: async (username: string, password: string) => {
      const response = await api.post<LoginResponse>('/api/auth/login', {
        username,
        password,
        rememberMe: true,
      });

      const { availableContexts, defaultContext } = response;

      // Restore saved context preference if still available, else use server default
      let activeContext = defaultContext;
      try {
        const saved = await SecureStore.getItemAsync(ACTIVE_CONTEXT_KEY);
        if (saved && availableContexts.includes(saved as AppContext)) {
          activeContext = saved as AppContext;
        }
      } catch {}

      set({
        user: response.user,
        isAuthenticated: true,
        availableContexts,
        activeContext,
      });

      await SecureStore.setItemAsync(LAST_USERNAME_KEY, username);
      await SecureStore.setItemAsync(ACTIVE_CONTEXT_KEY, activeContext);
    },

    logout: async () => {
      try {
        await api.post('/api/auth/logout');
      } catch {
        // Ignore errors on logout
      }
      set({ user: null, isAuthenticated: false, activeContext: null, availableContexts: [] });
    },

    checkSession: async () => {
      try {
        set({ isLoading: true });
        const data = await api.get<MeResponse>('/api/auth/me');

        const { availableContexts, defaultContext, sessionValid, ...user } = data;

        // Restore saved context preference if still available
        let activeContext = defaultContext;
        try {
          const saved = await SecureStore.getItemAsync(ACTIVE_CONTEXT_KEY);
          if (saved && availableContexts.includes(saved as AppContext)) {
            activeContext = saved as AppContext;
          }
        } catch {}

        set({
          user: user as AuthUser,
          isAuthenticated: true,
          isLoading: false,
          availableContexts,
          activeContext,
        });

        // Check biometrics status
        await get().checkBiometricsAvailability();
        const stored = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
        if (stored === 'true') {
          set({ biometricsEnabled: true });
        }

        return true;
      } catch {
        set({ user: null, isAuthenticated: false, isLoading: false, activeContext: null, availableContexts: [] });
        return false;
      }
    },

    switchContext: (context: AppContext) => {
      const { availableContexts } = get();
      if (!availableContexts.includes(context)) return;
      set({ activeContext: context });
      SecureStore.setItemAsync(ACTIVE_CONTEXT_KEY, context).catch(() => {});
    },

    checkBiometricsAvailability: async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      set({ biometricsAvailable: hasHardware && isEnrolled });
    },

    enableBiometrics: async () => {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirmer votre identite',
        cancelLabel: 'Annuler',
        disableDeviceFallback: false,
      });
      if (result.success) {
        await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, 'true');
        set({ biometricsEnabled: true });
      }
    },

    disableBiometrics: async () => {
      await SecureStore.deleteItemAsync(BIOMETRICS_ENABLED_KEY);
      set({ biometricsEnabled: false });
    },

    loginWithBiometrics: async () => {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Se connecter avec la biometrie',
        cancelLabel: 'Utiliser le mot de passe',
        disableDeviceFallback: false,
      });
      if (!result.success) return false;

      try {
        const data = await api.post<LoginResponse>('/api/auth/refresh');
        const { availableContexts, defaultContext } = data;

        let activeContext = defaultContext;
        try {
          const saved = await SecureStore.getItemAsync(ACTIVE_CONTEXT_KEY);
          if (saved && availableContexts.includes(saved as AppContext)) {
            activeContext = saved as AppContext;
          }
        } catch {}

        set({
          user: data.user,
          isAuthenticated: true,
          availableContexts,
          activeContext,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
});
