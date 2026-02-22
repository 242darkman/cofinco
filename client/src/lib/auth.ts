import { authApi, AuthUser, setOnUnauthorized, ApiError } from './api-client';
import { initEncryptionKey, clearEncryptionKey, clearSigningKey, clearHmacKey } from './offline-crypto';
import { initializeDeviceKey, teardownDeviceKey } from './device-key-manager';
import { SystemRole, hasRole as hasSystemRole, isAdminRole, normalizeRole } from '@shared/types/roles';
import { StatutUser } from '@shared/enum/status-constants';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  nom?: string;
  prenom?: string | null;
  role: SystemRole;
  status: string;
  agence?: string | null;
  agenceId?: string;
  phone?: string;
  photoProfile?: string | null;
  mustChangePassword?: boolean;
}

/**
 * Service d'authentification sécurisé
 * - Pas de stockage localStorage (vulnérable XSS)
 * - Session gérée côté serveur (PostgreSQL)
 * - Vérification de session via /api/auth/me
 * - Permissions gérées via CASL dans AbilityContext
 */

class AuthService {
  private currentUser: User | null = null;
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private onSessionExpired: (() => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('auth-channel');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data === 'logout') {
          if (import.meta.env.DEV) console.log('[Auth] Logout triggered from another tab');
          this.clearSession();
          // Force reload to clear React state and redirect to login
          // Import dynamique pour éviter la dépendance circulaire
          import('./navigation').then(({ hardRedirectToLogin }) => {
            hardRedirectToLogin('Déconnecté depuis un autre onglet');
          });
        }
      };
    }
  }

  /**
   * Authentification utilisateur
   * @param rememberMe - Si true, crée un refresh token pour session persistante (30 jours)
   */
  async login(username: string, password: string, rememberMe: boolean = false): Promise<User | null> {
    try {
      const loginResult = await authApi.login(username, password, rememberMe);

      const user = this.mapAuthUser(loginResult.user);
      this.currentUser = user;

      // Initialize offline encryption key and ECDSA device signing key
      initEncryptionKey(user.id).catch(() => {});
      initializeDeviceKey(user.id).catch((err) => {
        console.warn('[Auth] Device key initialization failed (non-blocking):', err);
      });

      // Démarrer la vérification périodique de session
      this.startSessionCheck();

      return user;
    } catch (error: any) {
      console.error('Login error:', error);
      // Propager l'erreur pour que le LoginPage puisse afficher le bon feedback
      // (lockout, tentatives restantes, compte désactivé, etc.)
      throw error;
    }
  }

  /**
   * Mapper AuthUser vers User
   */
  private mapAuthUser(authUser: AuthUser): User {
    const normalizedRole = normalizeRole(authUser.role);
    if (!normalizedRole) {
      console.warn('[Auth] Unknown role received:', authUser.role);
    }

    return {
      id: authUser.id,
      username: authUser.username,
      email: authUser.email || '',
      name: `${authUser.prenom || ''} ${authUser.nom}`.trim(),
      nom: authUser.nom,
      prenom: authUser.prenom,
      role: normalizedRole || SystemRole.CLIENT,
      status: authUser.statut || StatutUser.ACTIVE,
      agence: authUser.agence,
      agenceId: authUser.agenceId,
      photoProfile: authUser.photoProfile,
      mustChangePassword: authUser.mustChangePassword,
    };
  }

  /**
   * Déconnexion
   */
  async logout() {
    try {
      await authApi.logout();
      this.broadcastChannel?.postMessage('logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    this.clearSession();
  }

  /**
   * Nettoyer la session locale
   */
  private clearSession() {
    this.currentUser = null;
    this.stopSessionCheck();
    clearEncryptionKey();
    clearSigningKey();
    clearHmacKey();
    teardownDeviceKey();

    // Nettoyer l'ancien localStorage (migration)
    localStorage.removeItem('cofin_user');
    localStorage.removeItem('cofin_user_id');
  }

  /**
   * Obtenir l'utilisateur courant (depuis la mémoire)
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Vérifier la session auprès du serveur
   * Retourne true si la session est valide
   *
   * IMPORTANT: Ne déconnecte que sur 401 confirmé.
   * Les erreurs réseau/5xx/timeout ne déclenchent PAS de logout
   * (le serveur est la source de vérité, pas les erreurs transitoires).
   */
  async verifySession(): Promise<boolean> {
    try {
      const authUser = await authApi.getMe();
      const user = this.mapAuthUser(authUser);
      this.currentUser = user;

      return true;
    } catch (error) {
      // ONLY logout on confirmed 401 (session truly invalid)
      if (error instanceof ApiError && error.status === 401) {
        console.warn('[Auth] verifySession: 401 confirmed — session invalid');
        this.clearSession();
        if (this.onSessionExpired) {
          this.onSessionExpired();
        }
        return false;
      }

      // Network error, 5xx, timeout → DON'T logout
      // The session cookie might still be valid, the server is just unreachable
      console.warn('[Auth] verifySession: non-auth error — keeping session', error);
      return true;
    }
  }

  /**
   * Tente de rafraîchir la session via le refresh token (Remember Me)
   * Utilisé quand la session normale est invalide
   */
  async tryRefreshSession(): Promise<boolean> {
    try {
      if (import.meta.env.DEV) console.log('[Auth] Attempting session refresh via remember-me token...');

      const result = await authApi.refreshSession();

      if (result.success && result.user) {
        const user = this.mapAuthUser(result.user);
        this.currentUser = user;

        if (import.meta.env.DEV) console.log('[Auth] Session refreshed successfully via remember-me');
        return true;
      }

      if (import.meta.env.DEV) console.log('[Auth] Session refresh failed - no valid refresh token');
      return false;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return false;
    }
  }

  /**
   * Initialiser l'auth au démarrage de l'app
   * Vérifie si une session valide existe, sinon tente le refresh token
   */
  async initialize(): Promise<User | null> {
    // D'abord essayer la session normale
    try {
      const authUser = await authApi.getMe();
      const user = this.mapAuthUser(authUser);
      this.currentUser = user;
      // Initialize offline encryption key and ECDSA device signing key
      initEncryptionKey(user.id).catch(() => {});
      initializeDeviceKey(user.id).catch((err) => {
        console.warn('[Auth] Device key initialization failed (non-blocking):', err);
      });
      this.startSessionCheck();
      return this.currentUser;
    } catch (error) {
      // Session invalide - essayer le refresh token (Remember Me)
      const refreshed = await this.tryRefreshSession();
      if (refreshed) {
        this.startSessionCheck();
        return this.currentUser;
      }

      // Pas de session ni refresh token valide
      this.clearSession();
      return null;
    }
  }

  /**
   * Configurer le callback de session expirée
   * Configure aussi l'intercepteur HTTP pour détecter les 401
   */
  setOnSessionExpired(callback: () => void) {
    this.onSessionExpired = callback;
    // Configurer l'intercepteur HTTP global
    setOnUnauthorized(() => {
      this.clearSession();
      callback();
    });
  }

  /**
   * Démarrer la vérification périodique de session (toutes les 5 minutes)
   */
  private startSessionCheck() {
    this.stopSessionCheck();
    this.sessionCheckInterval = setInterval(() => {
      this.verifySession();
    }, 1 * 60 * 1000); // 1 minute - Security hardening: faster session invalidation detection
  }

  /**
   * Arrêter la vérification périodique
   */
  private stopSessionCheck() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  hasRole(roleCode: SystemRole | string): boolean {
    if (!this.currentUser?.role) return false;
    const normalizedRole = normalizeRole(roleCode);
    if (!normalizedRole) return false;
    return hasSystemRole(this.currentUser.role, normalizedRole);
  }

  isAdmin(): boolean {
    return isAdminRole(this.currentUser?.role);
  }

  isAgentCaisse(): boolean {
    return hasSystemRole(this.currentUser?.role, SystemRole.CAISSIER);
  }

  isManager(): boolean {
    return hasSystemRole(this.currentUser?.role, SystemRole.CHEF_AGENCE);
  }

  getAgence(): string | null | undefined {
    return this.currentUser?.agence;
  }
}

export const authService = new AuthService();
