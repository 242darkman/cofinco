import { pgTable, text, varchar, integer, boolean, timestamp, uuid, date, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  photoProfile: text("photo_profile"),

  // Type de compte et accès
  typeCompte: text("type_compte").notNull().default("employe"), // 'employe', 'client', 'both'
  canLogin: boolean("can_login").notNull().default(true), // Permet de désactiver l'accès sans supprimer
  statut: text("statut").notNull().default("Actif"), // 'Actif', 'Inactif', 'Suspendu'
  mustChangePassword: boolean("must_change_password").notNull().default(false),

  // ===== CHAMPS LEGACY (à migrer vers employes) =====
  // Ces champs sont conservés temporairement pour la rétro-compatibilité
  // Ils seront supprimés après migration complète
  role: text("role").default("agent"), // LEGACY: Remplacé par employes.roleSystem
  agence: text("agence"), // LEGACY: Remplacé par employes.agenceId
  lastLatitude: text("last_latitude"), // LEGACY: Déplacé vers agents_terrain
  lastLongitude: text("last_longitude"), // LEGACY: Déplacé vers agents_terrain
  matricule: varchar("matricule"), // LEGACY: Déplacé vers employes
  poste: varchar("poste"), // LEGACY: Déplacé vers employes
  departement: varchar("departement"), // LEGACY: Déplacé vers employes
  dateEmbauche: date("date_embauche"), // LEGACY: Déplacé vers employes
  typeContrat: varchar("type_contrat").default("CDI"), // LEGACY: Déplacé vers employes
  managerId: uuid("manager_id"), // LEGACY: Déplacé vers employes
  salaireBase: integer("salaire_base").default(0), // LEGACY: Déplacé vers employes
  tauxHoraire: integer("taux_horaire").default(0), // LEGACY: Déplacé vers employes
  tauxJournalier: integer("taux_journalier").default(0), // LEGACY: Déplacé vers employes
  modeCalculPaie: varchar("mode_calcul_paie").default("Mensuel"), // LEGACY: Déplacé vers employes
  caissePin: text("caisse_pin"), // LEGACY: Déplacé vers employes
  // ===== FIN CHAMPS LEGACY =====

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
});

export const insertActiveSessionSchema = createInsertSchema(activeSessions).omit({ id: true });
export type InsertActiveSession = z.infer<typeof insertActiveSessionSchema>;
export type ActiveSession = typeof activeSessions.$inferSelect;

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
  role: text("role").notNull(), // 'Administrateur', 'Chef d\'Agence', 'Comptable', etc.
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  granted: boolean("granted").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
