-- Migration: RBAC Enhancements
-- Ajoute des permissions avancées pour les modules Communications et Fidélité

-- =====================================================
-- NOUVELLES PERMISSIONS COMMUNICATIONS
-- =====================================================

-- Diffuser des messages en masse (bulk messaging)
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'communications.broadcast',
  'Diffusion en masse',
  'Permet de diffuser des messages à plusieurs destinataires simultanément',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'communications'
ON CONFLICT (code) DO NOTHING;

-- Programmer des envois différés
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'communications.schedule',
  'Programmation des envois',
  'Permet de programmer des messages pour un envoi différé',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'communications'
ON CONFLICT (code) DO NOTHING;

-- Archiver les communications
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'communications.archive',
  'Archivage des communications',
  'Permet d''archiver et de restaurer des communications',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'communications'
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- NOUVELLES PERMISSIONS FIDÉLITÉ
-- =====================================================

-- Créer le module fidélité s'il n'existe pas
INSERT INTO modules (id, code, name, description, icon, route, category, display_order, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'loyalty',
  'Fidélité',
  'Programme de fidélité clients',
  'Award',
  '/loyalty',
  'principal',
  35,
  true,
  NOW(),
  NOW()
) ON CONFLICT (code) DO NOTHING;

-- Permissions CRUD de base pour fidélité
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.view',
  'Voir fidélité',
  'Permet de consulter le programme de fidélité',
  m.id,
  'READ',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.create',
  'Créer fidélité',
  'Permet de créer des programmes de fidélité',
  m.id,
  'WRITE',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.update',
  'Modifier fidélité',
  'Permet de modifier les programmes de fidélité',
  m.id,
  'WRITE',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.delete',
  'Supprimer fidélité',
  'Permet de supprimer des programmes de fidélité',
  m.id,
  'DELETE',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

-- Échanger des points (redemption)
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.redeem',
  'Échanger des points',
  'Permet aux clients d''échanger leurs points contre des récompenses',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

-- Attribuer des points bonus
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.award',
  'Attribuer des points bonus',
  'Permet d''attribuer des points bonus à un client',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

-- Ajuster le solde de points
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.adjust',
  'Ajuster les points',
  'Permet d''ajuster manuellement le solde de points d''un client',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

-- Expirer les points
INSERT INTO permissions (id, code, name, description, module_id, category, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  'loyalty.expire',
  'Expirer les points',
  'Permet de faire expirer les points d''un client',
  m.id,
  'ACTIONS',
  true,
  NOW(),
  NOW()
FROM modules m
WHERE m.code = 'loyalty'
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- ATTRIBUTION PAR DÉFAUT AUX RÔLES
-- =====================================================

-- Attribuer les permissions communications aux rôles appropriés
INSERT INTO role_permissions (id, role, permission_id, granted, created_at, updated_at)
SELECT
  gen_random_uuid(),
  r.role,
  p.id,
  true,
  NOW(),
  NOW()
FROM permissions p
CROSS JOIN (
  VALUES
    ('ADMIN'),
    ('CHEF_AGENCE'),
    ('SUPERVISEUR')
) AS r(role)
WHERE p.code IN ('communications.broadcast', 'communications.schedule', 'communications.archive')
ON CONFLICT DO NOTHING;

-- Attribuer les permissions fidélité aux rôles appropriés
INSERT INTO role_permissions (id, role, permission_id, granted, created_at, updated_at)
SELECT
  gen_random_uuid(),
  r.role,
  p.id,
  true,
  NOW(),
  NOW()
FROM permissions p
CROSS JOIN (
  VALUES
    ('ADMIN'),
    ('CHEF_AGENCE')
) AS r(role)
WHERE p.code IN ('loyalty.view', 'loyalty.create', 'loyalty.update', 'loyalty.delete', 'loyalty.redeem', 'loyalty.award', 'loyalty.adjust', 'loyalty.expire')
ON CONFLICT DO NOTHING;

-- Permissions de lecture fidélité pour tous les rôles
INSERT INTO role_permissions (id, role, permission_id, granted, created_at, updated_at)
SELECT
  gen_random_uuid(),
  r.role,
  p.id,
  true,
  NOW(),
  NOW()
FROM permissions p
CROSS JOIN (
  VALUES
    ('CAISSIER'),
    ('AGENT_TERRAIN'),
    ('GESTIONNAIRE_CREDIT')
) AS r(role)
WHERE p.code = 'loyalty.view'
ON CONFLICT DO NOTHING;

-- Permettre aux caissiers et agents terrain d'échanger des points
INSERT INTO role_permissions (id, role, permission_id, granted, created_at, updated_at)
SELECT
  gen_random_uuid(),
  r.role,
  p.id,
  true,
  NOW(),
  NOW()
FROM permissions p
CROSS JOIN (
  VALUES
    ('CAISSIER'),
    ('AGENT_TERRAIN')
) AS r(role)
WHERE p.code = 'loyalty.redeem'
ON CONFLICT DO NOTHING;

-- Commentaires
COMMENT ON COLUMN permissions.category IS 'Catégorie: READ, WRITE, DELETE, MANAGE, ACTIONS, SPECIAL';
