import { pgTable, pgEnum, text, varchar, integer, boolean, timestamp, uuid, date, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { SystemRole } from "../types/roles";

export const roleEnum = pgEnum("user_role", [
  SystemRole.ADMIN,
  SystemRole.CHEF_AGENCE,
  SystemRole.CAISSIER,
  SystemRole.AGENT_TERRAIN,
  SystemRole.COMPTABLE,
  SystemRole.SUPERVISEUR,
  SystemRole.GESTIONNAIRE_CREDIT,
  SystemRole.CLIENT
]);

/**
 * Table Users - Source de vérité pour l'identité
 * Contient les données communes à tous les types de comptes (employés, clients, agents)
 * Les données métier spécifiques sont dans les tables liées (employes, clients, agents_terrain)
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Authentification (nullable pour clients sans accès portail)
  username: text("username").unique(),
  password: text("password"),

  // Identité commune
  nom: text("nom").notNull(),
  prenom: text("prenom"),
  email: text("email"),
  telephone: text("telephone"),
  sexe: varchar("sexe", { length: 1 }), // 'M' ou 'F'
  dateNaissance: date("date_naissance"),
  adresse: text("adresse"),
  ville: varchar("ville", { length: 100 }),
  photoProfile: text("photo_profile"),

  // Type de compte et accès
  typeCompte: text("type_compte").notNull().default("employe"), // 'employe', 'client', 'both'
  canLogin: boolean("can_login").notNull().default(true), // Permet de désactiver l'accès sans supprimer
  statut: text("statut").notNull().default("ACTIVE"), // 'ACTIVE', 'INACTIVE', 'SUSPENDED'
  mustChangePassword: boolean("must_change_password").notNull().default(false),

  // ====================================================================
  // Métadonnées
  // ====================================================================

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Types de compte possibles
export type TypeCompte = 'employe' | 'client' | 'both';

// Schéma de validation pour la création simplifiée d'un user
export const createUserSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().optional(),
  email: z.string().email("Email invalide").optional().nullable(),
  telephone: z.string().optional().nullable(),
  sexe: z.enum(['M', 'F']).optional().nullable(),
  dateNaissance: z.string().optional().nullable(), // Format: YYYY-MM-DD
  adresse: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  photoProfile: z.string().optional().nullable(),
  typeCompte: z.enum(['employe', 'client', 'both']).default('employe'),
  canLogin: z.boolean().default(true),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
});

// Login Attempts table
export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  ipAddress: text("ip_address"),
  success: boolean("success").notNull().default(false),
  reason: text("reason"), // 'invalid_password', 'account_locked', 'account_disabled'
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({ id: true, createdAt: true });
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;
export type LoginAttempt = typeof loginAttempts.$inferSelect;

// User Permissions table - Permissions personnalisées par utilisateur (granulaire)
export const userPermissions = pgTable("user_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Link directly to permissions table instead of copying module/action structure
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  granted: boolean("granted").notNull().default(true),
  // CASL conditions (MongoDB-style, e.g., {"amount": {"$lte": 1000000}})
  conditions: jsonb("conditions"),

  // Metadata for audit/tracking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  unq: unique().on(t.userId, t.permissionId),
}));

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

// Active Sessions table - Tracking précis des sessions utilisateurs
export const activeSessions = pgTable("active_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull().unique(), // Lié au sid de la table session
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"), // 'Desktop', 'Mobile', 'Tablet'
  browser: text("browser"), // 'Chrome', 'Firefox', 'Safari', etc.
  os: text("os"), // 'Windows', 'MacOS', 'Linux', 'Android', 'iOS'
  location: text("location"), // Ville/Pays si disponible
  loginAt: timestamp("login_at").notNull().defaultNow(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // Device fingerprinting for stolen cookie detection
  deviceFingerprint: text("device_fingerprint"),        // Full fingerprint hash
  deviceFingerprintPartial: text("device_fingerprint_partial"), // Partial fingerprint for tolerant comparison
});

export const insertActiveSessionSchema = createInsertSchema(activeSessions).omit({ id: true });
export type InsertActiveSession = z.infer<typeof insertActiveSessionSchema>;
export type ActiveSession = typeof activeSessions.$inferSelect;

// Refresh Tokens table - For "Remember Me" persistent sessions
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 hash of the token
  deviceFingerprint: text("device_fingerprint"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  // Token family for rotation detection
  familyId: uuid("family_id").notNull(),
  generation: integer("generation").notNull().default(1),

  // Expiry
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),

  // Revocation
  revoked: boolean("revoked").notNull().default(false),
  revokedAt: timestamp("revoked_at"),
  revokeReason: text("revoke_reason"),
});

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({ id: true, createdAt: true });
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;

// ============================================
// RBAC: Modules et Permissions par Rôle
// ============================================

// Modules table - Liste des modules de l'application
export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // 'Dashboard', 'Clients', 'Crédits', etc.
  description: text("description"),
  icon: text("icon").default("Shield"), // Nom de l'icône Lucide
  category: text("category").notNull().default("general"), // 'operations', 'finance', 'admin', 'general'
  isActive: boolean("is_active").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertModuleSchema = createInsertSchema(modules).omit({ id: true, createdAt: true });
export type InsertModule = z.infer<typeof insertModuleSchema>;
export type Module = typeof modules.$inferSelect;

// Permissions table - Liste des types de permissions disponibles
export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // 'Voir', 'Créer', 'Modifier', 'Supprimer', 'Valider', 'Exporter'
  code: text("code").notNull(), // 'view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

// Role Permissions table - Permissions par défaut pour chaque rôle
export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: roleEnum("role").notNull(),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  granted: boolean("granted").notNull().default(true),
  // CASL conditions (MongoDB-style, e.g., {"amount": {"$lte": 1000000}})
  conditions: jsonb("conditions"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

// ============================================
// Permission Condition Templates
// ============================================

/**
 * Templates de conditions réutilisables pour les permissions CASL
 *
 * Permet de créer des conditions complexes avec des variables:
 * - ${userId} - ID de l'utilisateur courant
 * - ${agenceId} - ID de l'agence active
 * - ${now}, ${startOfDay}, etc. - Variables temporelles
 */
export const permissionConditionTemplates = pgTable("permission_condition_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  conditionSchema: jsonb("condition_schema").notNull(), // Le schema avec variables
  variables: jsonb("variables").default([]), // Liste des variables utilisées
  examples: jsonb("examples").default([]), // Exemples d'utilisation
  isSystem: boolean("is_system").default(false), // Templates système non modifiables
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConditionTemplateSchema = createInsertSchema(permissionConditionTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConditionTemplate = z.infer<typeof insertConditionTemplateSchema>;
export type ConditionTemplate = typeof permissionConditionTemplates.$inferSelect;

// ============================================
// Multi-Role Architecture: User Roles Table
// ============================================

/**
 * Table userRoles - Architecture Multi-Rôles V3 (Source de Vérité Unique)
 *
 * Cette table est la SEULE source de vérité pour les rôles utilisateurs.
 * employes.roleSystem a été supprimé - tous les rôles sont gérés ici.
 *
 * Caractéristiques:
 * - Un utilisateur peut avoir plusieurs rôles (ex: CAISSIER + AGENT_TERRAIN)
 * - Un rôle peut être scopé à une agence spécifique (agenceId)
 * - Le rôle marqué isPrimary est utilisé par défaut dans getEffectiveRole()
 * - Contrainte d'unicité: (userId, role, agenceId)
 *
 * Usage:
 * - Création employé: transaction(users + employes + userRoles)
 * - Lecture rôle: getEffectiveRole() ou getUserRoles()
 * - Mise à jour: updateUserRole() dans storage/employes.ts
 *
 * Note: agenceId référence agences.id (FK gérée au niveau migration SQL)
 */
export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),

  // Scope optionnel: agence à laquelle ce rôle s'applique (null = toutes agences)
  // FK vers agences.id gérée au niveau SQL migration
  agenceId: uuid("agence_id"),

  // Un seul rôle principal par utilisateur (utilisé par défaut dans getEffectiveRole)
  isPrimary: boolean("is_primary").notNull().default(false),

  // Métadonnées
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Un utilisateur ne peut avoir le même rôle qu'une fois par agence
  uniqueUserRoleAgence: unique().on(t.userId, t.role, t.agenceId),
}));

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

// Type pour les rôles avec informations étendues
export interface UserRoleWithAgence extends UserRole {
  agence?: {
    id: string;
    nom: string;
    code: string;
  } | null;
}

// ============================================
// Agency Feature Locks (Module Lock / Kill Switch)
// ============================================

/**
 * Table agencyFeatureLocks - Feature flags per agency
 *
 * Allows locking specific modules/features for an agency.
 * Used by CASL authorization to deny access to locked features.
 *
 * Valid feature_keys:
 * - 'credits' - Crédits module
 * - 'tontines' - Tontines module
 * - 'caisse' - Caisse module
 * - 'comptabilite' - Comptabilité module
 * - 'epargnes' - Comptes/Épargnes module
 * - 'coffre' - Coffre-Fort module
 * - 'terrain' - Agent Terrain module
 * - 'rh' - RH module
 * - 'admin' - Administration module
 * - 'rapports' - Rapports module
 * - 'transferts' - Transferts module
 */
export const agencyFeatureLocks = pgTable("agency_feature_locks", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenceId: uuid("agence_id").notNull(), // FK to agences.id managed at SQL level
  featureKey: text("feature_key").notNull(),
  locked: boolean("locked").notNull().default(true),
  reason: text("reason"),
  lockedBy: uuid("locked_by"), // FK to users.id managed at SQL level
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniqueAgencyFeature: unique().on(t.agenceId, t.featureKey),
}));

export const insertAgencyFeatureLockSchema = createInsertSchema(agencyFeatureLocks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgencyFeatureLock = z.infer<typeof insertAgencyFeatureLockSchema>;
export type AgencyFeatureLock = typeof agencyFeatureLocks.$inferSelect;

// Feature key enum for type safety
export const FEATURE_KEYS = [
  'credits',
  'tontines',
  'caisse',
  'comptabilite',
  'epargnes',
  'coffre',
  'terrain',
  'rh',
  'admin',
  'rapports',
  'transferts',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

// ============================================
// Temporary Permissions (Time-limited access)
// ============================================

/**
 * Table temporaryPermissions - Permissions temporaires avec expiration
 *
 * Permet d'accorder des permissions avec une date d'expiration automatique.
 * Utile pour:
 * - Élévations temporaires de privilèges
 * - Accès limité dans le temps pour des projets spécifiques
 * - Délégation temporaire de responsabilités
 *
 * La permission est automatiquement révoquée après expires_at par un cron job.
 */
export const temporaryPermissions = pgTable("temporary_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  grantedBy: uuid("granted_by").notNull().references(() => users.id),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  reason: text("reason").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  revokedAt: timestamp("revoked_at"),
  revokedBy: uuid("revoked_by").references(() => users.id),
  revokeReason: text("revoke_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTemporaryPermissionSchema = createInsertSchema(temporaryPermissions)
  .omit({ id: true, createdAt: true, updatedAt: true, grantedAt: true });
export type InsertTemporaryPermission = z.infer<typeof insertTemporaryPermissionSchema>;
export type TemporaryPermission = typeof temporaryPermissions.$inferSelect;

// Schéma de validation pour l'API grant
export const grantTempPermissionSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide"),
  permissionId: z.string().uuid("ID permission invalide").optional(),
  permissionCode: z.string().optional(),
  expiresAt: z.string().datetime("Date d'expiration invalide"),
  reason: z.string().min(1, "La raison est requise").max(500, "Raison trop longue"),
}).refine(data => data.permissionId || data.permissionCode, {
  message: "permissionId ou permissionCode requis"
});

// Schéma pour révoquer
export const revokeTempPermissionSchema = z.object({
  revokeReason: z.string().max(500, "Raison trop longue").optional(),
});

// ============================================
// Permission Scope Enum (for scoped overrides)
// ============================================

export const permissionScopeEnum = pgEnum("permission_scope", ["GLOBAL", "AGENCE"]);

export type PermissionScope = "GLOBAL" | "AGENCE";

// ============================================
// RBAC Audit Log
// ============================================

export const rbacAuditActionEnum = pgEnum("rbac_audit_action", [
  "TOGGLE",
  "BULK_UPDATE",
  "RESET",
  "GRANT_TEMPORARY",
  "REVOKE_TEMPORARY",
  "EXPIRE_TEMPORARY",
]);

export type RbacAuditAction =
  | "TOGGLE"
  | "BULK_UPDATE"
  | "RESET"
  | "GRANT_TEMPORARY"
  | "REVOKE_TEMPORARY"
  | "EXPIRE_TEMPORARY";

/**
 * Table rbacAuditLog - Audit trail complet des modifications RBAC
 *
 * Enregistre chaque modification de permission avec:
 * - Qui a fait l'action (actor)
 * - Qui subit l'action (target)
 * - Quelle permission a été modifiée
 * - L'ancienne et nouvelle valeur
 * - Le scope (GLOBAL ou AGENCE)
 * - La raison (obligatoire pour permissions critiques)
 */
export const rbacAuditLog = pgTable("rbac_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  // Actor info
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id),
  actorIp: text("actor_ip"),
  actorUserAgent: text("actor_user_agent"),

  // Target info
  targetUserId: uuid("target_user_id").references(() => users.id),
  targetRole: text("target_role"),

  // Action
  action: rbacAuditActionEnum("action").notNull(),

  // Permission
  permissionId: uuid("permission_id").references(() => permissions.id),
  permissionCode: text("permission_code"),

  // Change
  oldValue: boolean("old_value"),
  newValue: boolean("new_value"),

  // Scope
  scope: permissionScopeEnum("scope").notNull().default("GLOBAL"),
  agenceId: uuid("agence_id"),

  // Reason (required for critical permissions)
  reason: text("reason"),

  // Metadata
  metadata: jsonb("metadata").default({}),

  // Version tracking
  rbacVersionBefore: integer("rbac_version_before"),
  rbacVersionAfter: integer("rbac_version_after"),
});

export const insertRbacAuditLogSchema = createInsertSchema(rbacAuditLog).omit({ id: true, createdAt: true });
export type InsertRbacAuditLog = z.infer<typeof insertRbacAuditLogSchema>;
export type RbacAuditLog = typeof rbacAuditLog.$inferSelect;

// ============================================
// System Feature Flags
// ============================================

/**
 * Table systemFeatureFlags - Feature flags pour déploiement progressif
 *
 * Permet d'activer/désactiver des fonctionnalités de manière contrôlée.
 * Les flags système (is_system=true) ne peuvent pas être modifiés via l'UI.
 */
export const systemFeatureFlags = pgTable("system_feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  flagKey: text("flag_key").notNull().unique(),
  flagValue: boolean("flag_value").notNull().default(false),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  enabledAt: timestamp("enabled_at"),
  enabledBy: uuid("enabled_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemFeatureFlagSchema = createInsertSchema(systemFeatureFlags).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSystemFeatureFlag = z.infer<typeof insertSystemFeatureFlagSchema>;
export type SystemFeatureFlag = typeof systemFeatureFlags.$inferSelect;

// RBAC Feature Flags constants
export const RBAC_FEATURE_FLAGS = {
  SCOPED_OVERRIDES: 'RBAC_SCOPED_OVERRIDES',
  REQUIRE_REASON_CRITICAL: 'RBAC_REQUIRE_REASON_CRITICAL',
  AUDIT_LOG_ENABLED: 'RBAC_AUDIT_LOG_ENABLED',
  SOFT_REVALIDATE: 'RBAC_SOFT_REVALIDATE',
} as const;

// ============================================
// Critical Permission Patterns
// ============================================

/**
 * Table criticalPermissionPatterns - Patterns de permissions critiques
 *
 * Définit les patterns de permissions qui nécessitent une justification
 * lors de leur modification (ex: paiements.%, coffre.%, admin.%).
 */
export const criticalPermissionPatterns = pgTable("critical_permission_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern: text("pattern").notNull().unique(),
  description: text("description"),
  requireReason: boolean("require_reason").notNull().default(true),
  requireSupervisorApproval: boolean("require_supervisor_approval").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCriticalPermissionPatternSchema = createInsertSchema(criticalPermissionPatterns).omit({ id: true, createdAt: true });
export type InsertCriticalPermissionPattern = z.infer<typeof insertCriticalPermissionPatternSchema>;
export type CriticalPermissionPattern = typeof criticalPermissionPatterns.$inferSelect;

// Default critical permission patterns
export const DEFAULT_CRITICAL_PATTERNS = [
  'paiements.',
  'coffre.',
  'admin.',
  'validation.',
  'caisse.close',
  'caisse.admin',
  'credits.disburse',
  'rbac.manage',
] as const;

/**
 * Check if a permission code is critical (requires reason)
 */
export function isCriticalPermission(permissionCode: string): boolean {
  return DEFAULT_CRITICAL_PATTERNS.some(pattern =>
    permissionCode.startsWith(pattern) || permissionCode === pattern
  );
}

// ============================================
// Extended User Permissions Schema (with scope)
// ============================================

// Schéma Zod pour bulk update avec scope
export const bulkUserPermissionUpdateSchema = z.object({
  scope: z.enum(['GLOBAL', 'AGENCE']).default('GLOBAL'),
  agenceId: z.string().uuid().optional().nullable(),
  changes: z.array(z.object({
    permissionId: z.string().uuid().optional(),
    permissionCode: z.string().optional(),
    granted: z.boolean().nullable(), // null = remove override
  })).min(1, "Au moins un changement requis"),
  reason: z.string().max(500).optional(),
}).refine(
  data => data.changes.every(c => c.permissionId || c.permissionCode),
  { message: "Chaque changement doit avoir permissionId ou permissionCode" }
).refine(
  data => data.scope === 'GLOBAL' || (data.scope === 'AGENCE' && data.agenceId),
  { message: "agenceId requis si scope=AGENCE" }
);

export type BulkUserPermissionUpdate = z.infer<typeof bulkUserPermissionUpdateSchema>;

// Schéma pour toggle avec raison
export const toggleUserPermissionSchema = z.object({
  permissionId: z.string().uuid().optional(),
  permissionCode: z.string().optional(),
  granted: z.boolean().nullable(), // null = remove override
  scope: z.enum(['GLOBAL', 'AGENCE']).default('GLOBAL'),
  agenceId: z.string().uuid().optional().nullable(),
  reason: z.string().max(500).optional(),
}).refine(
  data => data.permissionId || data.permissionCode,
  { message: "permissionId ou permissionCode requis" }
).refine(
  data => data.scope === 'GLOBAL' || (data.scope === 'AGENCE' && data.agenceId),
  { message: "agenceId requis si scope=AGENCE" }
);
