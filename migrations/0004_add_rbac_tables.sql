-- Migration: Add RBAC tables (modules, permissions, role_permissions)
-- Created: 2025-12-27

-- Modules table
CREATE TABLE IF NOT EXISTS "modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL UNIQUE,
  "description" text,
  "icon" text DEFAULT 'Shield',
  "category" text NOT NULL DEFAULT 'general',
  "is_active" boolean NOT NULL DEFAULT true,
  "order_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT NOW()
);

-- Permissions table
CREATE TABLE IF NOT EXISTS "permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "module_id" uuid NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT NOW()
);

-- Role Permissions table
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "role" text NOT NULL,
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  "granted" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT NOW(),
  "updated_at" timestamp DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_permissions_module_id" ON "permissions"("module_id");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_role" ON "role_permissions"("role");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_permission_id" ON "role_permissions"("permission_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_role_permissions_unique" ON "role_permissions"("role", "permission_id");

-- ============================================
-- SEED DATA: Modules
-- ============================================
INSERT INTO "modules" ("name", "description", "icon", "category", "order_index") VALUES
  ('Dashboard', 'Tableau de bord principal', 'BarChart3', 'general', 1),
  ('Clients', 'Gestion des clients', 'Users', 'operations', 2),
  ('Crédits', 'Gestion des crédits', 'CreditCard', 'finance', 3),
  ('Épargnes', 'Gestion des comptes épargne', 'PiggyBank', 'finance', 4),
  ('Tontines', 'Gestion des tontines', 'Users', 'finance', 5),
  ('Comptabilité', 'Module comptable', 'Calculator', 'finance', 6),
  ('Remboursements', 'Suivi des remboursements', 'Receipt', 'finance', 7),
  ('Rapports', 'Génération de rapports', 'FileText', 'admin', 8),
  ('Terrain', 'Activités terrain', 'MapPin', 'operations', 9),
  ('Communications', 'Messages et notifications', 'MessageSquare', 'operations', 10),
  ('Caisse', 'Opérations de caisse', 'Wallet', 'operations', 11),
  ('Paramètres', 'Configuration système', 'Settings', 'admin', 12),
  ('Admin', 'Administration générale', 'Shield', 'admin', 13),
  ('Audit', 'Logs et audit', 'Activity', 'admin', 14)
ON CONFLICT ("name") DO NOTHING;

-- ============================================
-- SEED DATA: Permissions for each module
-- ============================================
DO $$
DECLARE
  mod_record RECORD;
BEGIN
  FOR mod_record IN SELECT id, name FROM modules LOOP
    -- Insert standard permissions for each module
    INSERT INTO "permissions" ("module_id", "name", "code", "description") VALUES
      (mod_record.id, 'Voir', 'view', 'Peut voir le module ' || mod_record.name),
      (mod_record.id, 'Créer', 'create', 'Peut créer dans ' || mod_record.name),
      (mod_record.id, 'Modifier', 'edit', 'Peut modifier dans ' || mod_record.name),
      (mod_record.id, 'Supprimer', 'delete', 'Peut supprimer dans ' || mod_record.name),
      (mod_record.id, 'Approuver', 'approve', 'Peut approuver/valider dans ' || mod_record.name),
      (mod_record.id, 'Exporter', 'export', 'Peut exporter depuis ' || mod_record.name),
      (mod_record.id, 'Gérer', 'manage', 'Gestion complète de ' || mod_record.name)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ============================================
-- SEED DATA: Role Permissions (from rbac-config.ts)
-- ============================================

-- Administrateur: Full access to everything
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Administrateur', p.id, true
FROM permissions p
ON CONFLICT DO NOTHING;

-- Chef d'Agence: Most modules except some admin features
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Chef d''Agence', p.id, true
FROM permissions p
JOIN modules m ON p.module_id = m.id
WHERE m.name IN ('Dashboard', 'Clients', 'Crédits', 'Épargnes', 'Tontines', 'Comptabilité', 'Remboursements', 'Rapports', 'Terrain', 'Communications', 'Caisse', 'Admin')
  AND p.code IN ('view', 'create', 'edit', 'approve', 'export')
ON CONFLICT DO NOTHING;

-- Comptable
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Comptable', p.id, true
FROM permissions p
JOIN modules m ON p.module_id = m.id
WHERE (m.name = 'Dashboard' AND p.code = 'view')
   OR (m.name = 'Comptabilité' AND p.code IN ('view', 'edit', 'export'))
   OR (m.name = 'Rapports' AND p.code IN ('view', 'export'))
   OR (m.name IN ('Clients', 'Crédits', 'Épargnes') AND p.code = 'view')
ON CONFLICT DO NOTHING;

-- Gestionnaire Crédit
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Gestionnaire Crédit', p.id, true
FROM permissions p
JOIN modules m ON p.module_id = m.id
WHERE (m.name = 'Dashboard' AND p.code = 'view')
   OR (m.name = 'Clients' AND p.code IN ('view', 'create', 'edit'))
   OR (m.name = 'Crédits' AND p.code IN ('view', 'create', 'edit', 'approve'))
   OR (m.name = 'Remboursements' AND p.code IN ('view', 'create'))
   OR (m.name = 'Rapports' AND p.code = 'view')
ON CONFLICT DO NOTHING;

-- Superviseur
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Superviseur', p.id, true
FROM permissions p
JOIN modules m ON p.module_id = m.id
WHERE (m.name = 'Dashboard' AND p.code = 'view')
   OR (m.name = 'Clients' AND p.code = 'view')
   OR (m.name = 'Terrain' AND p.code IN ('view', 'manage'))
   OR (m.name = 'Rapports' AND p.code = 'view')
   OR (m.name = 'Communications' AND p.code = 'view')
ON CONFLICT DO NOTHING;

-- Agent Caisse
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Agent Caisse', p.id, true
FROM permissions p
JOIN modules m ON p.module_id = m.id
WHERE (m.name = 'Dashboard' AND p.code = 'view')
   OR (m.name = 'Clients' AND p.code IN ('view', 'create'))
   OR (m.name = 'Épargnes' AND p.code IN ('view', 'create'))
   OR (m.name = 'Caisse' AND p.code IN ('view', 'create', 'edit'))
   OR (m.name = 'Communications' AND p.code = 'view')
ON CONFLICT DO NOTHING;

-- Agent Terrain
INSERT INTO "role_permissions" ("role", "permission_id", "granted")
SELECT 'Agent Terrain', p.id, true
FROM permissions p
JOIN modules m ON p.module_id = m.id
WHERE (m.name = 'Dashboard' AND p.code = 'view')
   OR (m.name = 'Clients' AND p.code IN ('view', 'create', 'edit'))
   OR (m.name = 'Terrain' AND p.code IN ('view', 'create'))
   OR (m.name = 'Communications' AND p.code = 'view')
ON CONFLICT DO NOTHING;
