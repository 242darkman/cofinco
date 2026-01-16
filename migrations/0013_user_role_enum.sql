-- Migration: normalize user roles + enforce enum

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM (
    'ADMIN',
    'CHEF_AGENCE',
    'CAISSIER',
    'AGENT_TERRAIN',
    'COMPTABLE',
    'SUPERVISEUR',
    'GESTIONNAIRE_CREDIT',
    'CLIENT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

UPDATE users
SET role = CASE
  WHEN role IS NULL THEN CASE WHEN type_compte = 'client' THEN 'CLIENT' ELSE 'CAISSIER' END
  WHEN lower(trim(role)) IN (
    'admin',
    'administrateur',
    'administrateur systeme',
    'administrateur système',
    'admin_generale',
    'admin generale',
    'admin générale',
    'direction',
    'directeur',
    'directeur financier'
  ) THEN 'ADMIN'
  WHEN lower(trim(role)) IN (
    'chef',
    'chef_agence',
    'chef agence',
    'chef d''agence'
  ) THEN 'CHEF_AGENCE'
  WHEN lower(trim(role)) IN (
    'caissier',
    'caisse',
    'agent caisse',
    'agent_caisse',
    'agent de caisse',
    'chef_caisse',
    'chef caisse'
  ) THEN 'CAISSIER'
  WHEN lower(trim(role)) IN (
    'agent terrain',
    'agent_terrain',
    'terrain',
    'agent'
  ) THEN 'AGENT_TERRAIN'
  WHEN lower(trim(role)) IN ('comptable') THEN 'COMPTABLE'
  WHEN lower(trim(role)) IN ('superviseur') THEN 'SUPERVISEUR'
  WHEN lower(trim(role)) IN (
    'gestionnaire credit',
    'gestionnaire crédit',
    'gestionnaire_credit',
    'credit'
  ) THEN 'GESTIONNAIRE_CREDIT'
  WHEN lower(trim(role)) IN ('client') THEN 'CLIENT'
  ELSE CASE WHEN type_compte = 'client' THEN 'CLIENT' ELSE 'CAISSIER' END
END;

UPDATE role_permissions
SET role = CASE
  WHEN role IS NULL THEN 'CLIENT'
  WHEN lower(trim(role)) IN (
    'admin',
    'administrateur',
    'administrateur systeme',
    'administrateur système',
    'admin_generale',
    'admin generale',
    'admin générale',
    'direction',
    'directeur',
    'directeur financier'
  ) THEN 'ADMIN'
  WHEN lower(trim(role)) IN (
    'chef',
    'chef_agence',
    'chef agence',
    'chef d''agence'
  ) THEN 'CHEF_AGENCE'
  WHEN lower(trim(role)) IN (
    'caissier',
    'caisse',
    'agent caisse',
    'agent_caisse',
    'agent de caisse',
    'chef_caisse',
    'chef caisse'
  ) THEN 'CAISSIER'
  WHEN lower(trim(role)) IN (
    'agent terrain',
    'agent_terrain',
    'terrain',
    'agent'
  ) THEN 'AGENT_TERRAIN'
  WHEN lower(trim(role)) IN ('comptable') THEN 'COMPTABLE'
  WHEN lower(trim(role)) IN ('superviseur') THEN 'SUPERVISEUR'
  WHEN lower(trim(role)) IN (
    'gestionnaire credit',
    'gestionnaire crédit',
    'gestionnaire_credit',
    'credit'
  ) THEN 'GESTIONNAIRE_CREDIT'
  WHEN lower(trim(role)) IN ('client') THEN 'CLIENT'
  ELSE 'CLIENT'
END;

ALTER TABLE users
  ALTER COLUMN role TYPE user_role USING role::user_role,
  ALTER COLUMN role SET DEFAULT 'CAISSIER';

ALTER TABLE role_permissions
  ALTER COLUMN role TYPE user_role USING role::user_role;
