import { authApi, AuthUser, setOnUnauthorized } from './api-client';
import { ROLE_PERMISSIONS, hasPermission as rbacHasPermission, canAccessModule as rbacCanAccessModule } from './rbac-config';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  nom?: string;
  prenom?: string | null;
  role: string;
  status: string;
  agence?: string | null;
  agenceId?: string;
  phone?: string;
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
class AuthService {
  private currentUser: User | null = null;
  private permissions: Permission[] = [];
  private permissionsMap: Record<string, string[]> = {}; // Dynamic permissions from API
  private isAdminUser: boolean = false;
  private permissionsLoaded: boolean = false;
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private onSessionExpired: (() => void) | null = null;

  /**
   * Authentification utilisateur
   */
  async login(username: string, password: string): Promise<User | null> {
    try {
      const authUser = await authApi.login(username, password);

      const user = this.mapAuthUser(authUser);
      this.currentUser = user;

      // Charger les permissions depuis l'API (BDD)
      await this.loadPermissionsFromApi();

      // Démarrer la vérification périodique de session
      this.startSessionCheck();

      return user;
    } catch (error: any) {
      console.error('Login error:', error);
      return null;
    }
  }

  /**
   * Mapper AuthUser vers User
   */
  private mapAuthUser(authUser: AuthUser): User {
    return {
      id: authUser.id,
      username: authUser.username,
      email: authUser.email || '',
      name: `${authUser.prenom || ''} ${authUser.nom}`.trim(),
      nom: authUser.nom,
      prenom: authUser.prenom,
      role: this.mapRole(authUser.role),
      status: authUser.statut || 'Actif',
      agence: authUser.agence,
      agenceId: authUser.agenceId,
      mustChangePassword: authUser.mustChangePassword,
    };
  }

  private mapRole(role: string): string {
    // Roles are now standardized as full French names
    // Legacy short names are normalized at the server level
    return role;
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
      console.warn('⚠️ Failed to load permissions from API, using static config:', error);
      // Fallback to static config
      this.loadPermissionsFromStaticConfig(this.currentUser?.role || '');
    }
  }

  /**
   * Fallback: Charge les permissions depuis rbac-config.ts (statique)
   */
  private loadPermissionsFromStaticConfig(role: string) {
    const rolePerms = ROLE_PERMISSIONS[role];

    if (!rolePerms) {
      // Rôle inconnu - permissions minimales (lecture seule)
      this.permissions = [{ module: '*', action: 'view', autorise: true }];
      this.permissionsMap = { '*': ['view'] };
      return;
    }

    // Convertir ROLE_PERMISSIONS en Permission[] et permissionsMap
    this.permissions = [];
    this.permissionsMap = {};

    for (const [module, actions] of Object.entries(rolePerms)) {
      this.permissionsMap[module] = actions as string[];
      for (const action of actions) {
        this.permissions.push({
          module,
          action,
          autorise: true
        });
      }
    }

    this.isAdminUser = role === 'Administrateur' || role === 'admin';
    this.permissionsLoaded = true;

    console.group('🔐 Permissions Loaded (Static)');
    console.log('👤 Role:', role);
    console.log('🔑 IsAdmin:', this.isAdminUser);
    console.log('📦 Total Modules:', Object.keys(this.permissionsMap).length);
    console.log('✅ Total Permissions:', this.permissions.length);
    console.log('📜 Permissions Map:', this.permissionsMap);
    console.groupEnd();
  }

  /**
   * @deprecated Use loadPermissionsFromApi() instead
   * Kept for backward compatibility
   */
  loadPermissions(role: string) {
    this.loadPermissionsFromStaticConfig(role);
  }

  /**
   * Déconnexion
   */
  async logout() {
    try {
      await authApi.logout();
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
      this.clearSession();
      if (this.onSessionExpired) {
        this.onSessionExpired();
      }
      return false;
    }
  }

  /**
   * Initialiser l'auth au démarrage de l'app
   * Vérifie si une session valide existe
   */
  async initialize(): Promise<User | null> {
    const isValid = await this.verifySession();
    if (isValid) {
      this.startSessionCheck();
      return this.currentUser;
    }
    return null;
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
    }, 5 * 60 * 1000); // 5 minutes
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

  hasRole(roleCode: string): boolean {
    return this.currentUser?.role === roleCode;
  }

  /**
   * Vérifie si l'utilisateur a une permission spécifique
   * Utilise d'abord les permissions chargées depuis l'API (BDD)
   * Fallback sur la configuration statique si non chargées
   */
  hasPermission(module: string, action: string): boolean {
    if (!this.currentUser) return false;

    // Admin has all permissions
    if (this.isAdminUser) return true;

    // Use dynamic permissions if loaded from API
    if (this.permissionsLoaded && Object.keys(this.permissionsMap).length > 0) {
      // Check wildcard first
      if (this.permissionsMap['*']?.includes(action)) {
        return true;
      }

      // Check module-specific permission
      const moduleKey = module.toLowerCase();
      return this.permissionsMap[moduleKey]?.includes(action) || false;
    }

    // Fallback to static config
    return rbacHasPermission(this.currentUser.role, module, action);
  }

  /**
   * Normalise le nom du module pour la recherche dans permissionsMap
   * Ex: "Crédits" -> "credits", "Épargnes" -> "epargnes"
   */
  private normalizeModuleName(module: string): string {
    return module
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/\s+/g, ''); // Supprime les espaces
  }

  /**
   * Vérifie si l'utilisateur peut accéder à un module
   * Utilise les permissions chargées dynamiquement ou MODULE_ACCESS de rbac-config.ts
   */
  canAccessModule(module: string): boolean {
    if (!this.currentUser) return false;

    // Admin can access all modules
    if (this.isAdminUser) return true;

    // Check if user has any permission on this module
    if (this.permissionsLoaded && Object.keys(this.permissionsMap).length > 0) {
      const moduleKey = this.normalizeModuleName(module);

      // Chercher dans permissionsMap avec la clé normalisée
      // ou chercher une clé qui correspond après normalisation
      for (const [key, actions] of Object.entries(this.permissionsMap)) {
        if (this.normalizeModuleName(key) === moduleKey && actions.length > 0) {
          return true;
        }
      }
      return false;
    }

    // Fallback to static config
    return rbacCanAccessModule(this.currentUser.role, module);
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
    return this.hasRole('Administrateur') || this.hasRole('admin') || this.isAdminUser;
  }

  isAgentCaisse(): boolean {
    return this.hasRole('Agent Caisse');
  }

  isManager(): boolean {
    return this.hasRole("Chef d'Agence");
  }

  getAgence(): string | null | undefined {
    return this.currentUser?.agence;
  }
}

export const authService = new AuthService();
