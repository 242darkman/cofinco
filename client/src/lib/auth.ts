import { authApi, AuthUser, setOnUnauthorized, PermissionsData, ApiError } from './api-client';
import type { AppModule } from '@shared/config/rbac';
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

export interface Permission {
  module: string;
  action: string;
  autorise: boolean;
}

// Format returned by /api/my-permissions
interface ApiPermissionsResponse {
  role: string;
  permissions: Record<string, string[]>; // { "caisse": ["view", "create"], "clients": ["view", "edit"] }
  isAdmin: boolean;
}

/**
 * Service d'authentification sécurisé
 * - Pas de stockage localStorage (vulnérable XSS)
 * - Session gérée côté serveur (PostgreSQL)
 * - Vérification de session via /api/auth/me
 * - Permissions chargées dynamiquement depuis la BDD via /api/my-permissions
 */
const normalizeModuleKey = (module: string): string => module
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[-_\s]+/g, ''); // Supprime tirets, underscores ET espaces

// Mapping des noms de modules UI vers les préfixes de permissions en BDD
// Clés normalisées (minuscules, sans tirets/underscores/espaces/accents)
// Ex: "Coffre-Fort" (UI) → normalisé "coffrefort" → préfixe "coffre" (coffre.view, coffre.transfert.*)
// Note: Les modules avec tirets/underscores sont automatiquement normalisés (virements_programmes → virementsprogrammes)
const MODULE_TO_PERMISSION_PREFIX: Record<string, string> = {
  'coffrefort': 'coffre',              // Coffre-Fort → coffre.view, coffre.transfert.*
  'agentterrain': 'agent',             // Agent Terrain → agent.view, agent.collect
  'comptes': 'epargnes',               // Comptes → epargnes.view, epargnes.create
  'administration': 'admin',           // Administration → admin.users, etc.
};

class AuthService {
  private currentUser: User | null = null;
  private permissions: Permission[] = [];
  private permissionsMap: Record<string, string[]> = {}; // Dynamic permissions from API
  private isAdminUser: boolean = false;
  private permissionsLoaded: boolean = false;
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private onSessionExpired: (() => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('auth-channel');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data === 'logout') {
          console.log('🔄 Logout triggered from another tab');
          this.clearSession();
          // Force reload to clear React state and redirect to login
          window.location.href = '/';
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

      // Utiliser les permissions incluses dans la réponse de login (évite race condition)
      if (loginResult.permissions) {
        this.applyPermissionsData(loginResult.permissions);
      } else {
        // Fallback: charger les permissions depuis l'API si non incluses
        await this.loadPermissionsFromApi();
      }

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
   * Applique les données de permissions reçues (login ou API)
   */
  private applyPermissionsData(data: PermissionsData): void {
    this.permissionsMap = data.permissions;
    this.isAdminUser = data.isAdmin;
    this.permissionsLoaded = true;

    // Sync role if changed
    if (this.currentUser && data.role) {
      const normalizedRole = normalizeRole(data.role);
      if (normalizedRole && this.currentUser.role !== normalizedRole) {
        console.log(`👤 Role updated: ${this.currentUser.role} -> ${normalizedRole}`);
        this.currentUser.role = normalizedRole;
      }
    }

    // Populate legacy permissions array for backward compatibility
    this.permissions = [];
    for (const [module, actions] of Object.entries(data.permissions)) {
      for (const action of actions) {
        this.permissions.push({
          module,
          action,
          autorise: true
        });
      }
    }

    console.group('🔐 Permissions Loaded (from login)');
    console.log('👤 Role:', this.currentUser?.role);
    console.log('🔑 IsAdmin:', this.isAdminUser);
    console.log('📦 Total Modules:', Object.keys(this.permissionsMap).length);
    console.log('✅ Total Permissions:', this.permissions.length);
    console.groupEnd();
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
   * Charge les permissions depuis l'API (BDD)
   * Fallback sur rbac-config.ts si l'API échoue
   */
  async loadPermissionsFromApi(): Promise<void> {
    try {
      const response = await fetch('/api/my-permissions', { credentials: 'include' });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: ApiPermissionsResponse = await response.json();

      this.permissionsMap = data.permissions;
      this.isAdminUser = data.isAdmin;
      this.permissionsLoaded = true;

      // Sync role if changed
      if (this.currentUser && data.role) {
          const normalizedRole = normalizeRole(data.role);
          if (normalizedRole && this.currentUser.role !== normalizedRole) {
            console.log(`👤 Role updated: ${this.currentUser.role} -> ${normalizedRole}`);
            this.currentUser.role = normalizedRole;
          }
      }

      // Also populate legacy permissions array for backward compatibility
      this.permissions = [];
      for (const [module, actions] of Object.entries(data.permissions)) {
        for (const action of actions) {
          this.permissions.push({
            module,
            action,
            autorise: true
          });
        }
      }

      console.group('🔐 Permissions Loaded');
      console.log('👤 Role:', this.currentUser?.role);
      console.log('🔑 IsAdmin:', this.isAdminUser);
      console.log('📦 Total Modules:', Object.keys(this.permissionsMap).length);
      console.log('✅ Total Permissions:', this.permissions.length);
      console.log('📜 Permissions Map:', this.permissionsMap);
      console.groupEnd();
    } catch (error) {
      // Fail-Closed: Ne pas fallback sur config statique - retourner permissions vides
      console.error('🚨 SECURITY: Failed to load permissions from API - applying Fail-Closed strategy');
      console.error('Error details:', error);

      this.permissionsMap = {};
      this.permissions = [];
      this.isAdminUser = false;
      this.permissionsLoaded = true; // Marquer comme chargé pour éviter les boucles infinies

      // Notifier l'utilisateur du problème de sécurité
      if (typeof window !== 'undefined') {
        // Dispatch un événement custom pour que l'UI puisse afficher une notification
        window.dispatchEvent(new CustomEvent('auth:permissions-error', {
          detail: {
            message: 'Impossible de charger vos permissions. Veuillez vous reconnecter.',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }));
      }
    }
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
    this.permissions = [];
    this.permissionsMap = {};
    this.isAdminUser = false;
    this.permissionsLoaded = false;
    this.stopSessionCheck();

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

      // Recharger les permissions depuis l'API
      await this.loadPermissionsFromApi();

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
      console.log('🔄 Attempting session refresh via remember-me token...');

      const result = await authApi.refreshSession();

      if (result.success && result.user) {
        const user = this.mapAuthUser(result.user);
        this.currentUser = user;

        // Appliquer les permissions si incluses
        if (result.permissions) {
          this.applyPermissionsData(result.permissions);
        } else {
          await this.loadPermissionsFromApi();
        }

        console.log('✅ Session refreshed successfully via remember-me');
        return true;
      }

      console.log('❌ Session refresh failed - no valid refresh token');
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
      await this.loadPermissionsFromApi();
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

  /**
   * Vérifie si l'utilisateur a une permission spécifique
   * Utilise les permissions chargées depuis l'API (BDD via CASL)
   */
  hasPermission(module: string, action: string): boolean {
    if (!this.currentUser) return false;

    // Admin has all permissions
    if (this.isAdminUser) return true;

    // Use permissions from API
    if (this.permissionsLoaded && Object.keys(this.permissionsMap).length > 0) {
      // Check wildcard first
      if (this.permissionsMap['*']?.includes(action)) {
        return true;
      }

      // Check module-specific permission
      const moduleKey = module.toLowerCase();
      return this.permissionsMap[moduleKey]?.includes(action) || false;
    }

    // Fail-closed: if permissions not loaded, deny access
    console.warn('[Auth] Permissions not loaded - denying access');
    return false;
  }

  /**
   * Normalise le nom du module pour la recherche dans permissionsMap
   * Ex: "Crédits" -> "credits", "Épargnes" -> "epargnes"
   */
  private normalizeModuleName(module: string): string {
    return normalizeModuleKey(module);
  }

  /**
   * Vérifie si l'utilisateur peut accéder à un module
   * Utilise les permissions chargées depuis l'API (BDD via CASL)
   */
  canAccessModule(module: string): boolean {
    if (!this.currentUser) return false;

    // Admin can access all modules
    if (this.isAdminUser) return true;

    // Check if user has any permission on this module
    if (this.permissionsLoaded && Object.keys(this.permissionsMap).length > 0) {
      const moduleKey = this.normalizeModuleName(module);

      // Résoudre le préfixe de permission (ex: "coffrefort" -> "coffre")
      const permissionPrefix = MODULE_TO_PERMISSION_PREFIX[moduleKey] || moduleKey;

      // Chercher dans permissionsMap avec la clé normalisée ou le préfixe mappé
      for (const [key, actions] of Object.entries(this.permissionsMap)) {
        const normalizedKey = this.normalizeModuleName(key);
        // Vérifie si la clé correspond au moduleKey OU au permissionPrefix
        if ((normalizedKey === moduleKey || normalizedKey === permissionPrefix || key === permissionPrefix) && actions.length > 0) {
          return true;
        }
      }
      return false;
    }

    // Fail-closed: if permissions not loaded, deny access
    console.warn('[Auth] Permissions not loaded - denying module access');
    return false;
  }

  /**
   * Recharger les permissions depuis l'API
   * Utile après modification des permissions par un admin
   */
  async refreshPermissions(): Promise<void> {
    if (this.currentUser) {
      await this.loadPermissionsFromApi();
    }
  }

  /**
   * Obtenir les permissions actuelles (pour debug ou UI)
   */
  getPermissionsMap(): Record<string, string[]> {
    return { ...this.permissionsMap };
  }

  isAdmin(): boolean {
    return isAdminRole(this.currentUser?.role) || this.isAdminUser;
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
