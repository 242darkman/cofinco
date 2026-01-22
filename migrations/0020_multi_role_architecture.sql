-- Migration: Multi-Role Architecture
-- Cette migration crée la table user_roles pour supporter plusieurs rôles par utilisateur
-- et migre les données existantes depuis employes.role_system

-- 1. Créer la table user_roles
CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" user_role NOT NULL,
  "agence_id" uuid REFERENCES "agences"("id") ON DELETE SET NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- 2. Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "user_roles"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_role" ON "user_roles"("role");
CREATE INDEX IF NOT EXISTS "idx_user_roles_primary" ON "user_roles"("user_id", "is_primary") WHERE "is_primary" = true;

-- 3. Contrainte d'unicité: un utilisateur ne peut avoir le même rôle qu'une fois par agence
CREATE UNIQUE INDEX IF NOT EXISTS "unq_user_role_agence" ON "user_roles"("user_id", "role", "agence_id");

-- 4. Migration des rôles existants depuis employes.role_system vers user_roles
-- On ne migre que si la table est vide (migration initiale)
INSERT INTO "user_roles" ("user_id", "role", "agence_id", "is_primary")
SELECT
  e."user_id",
  CASE e."role_system"
    WHEN 'admin' THEN 'ADMIN'::user_role
    WHEN 'chef_agence' THEN 'CHEF_AGENCE'::user_role
    WHEN 'comptable' THEN 'COMPTABLE'::user_role
    WHEN 'caissier' THEN 'CAISSIER'::user_role
    WHEN 'terrain' THEN 'AGENT_TERRAIN'::user_role
    WHEN 'agent' THEN 'AGENT_TERRAIN'::user_role
    WHEN 'superviseur' THEN 'SUPERVISEUR'::user_role
    WHEN 'credit' THEN 'GESTIONNAIRE_CREDIT'::user_role
    WHEN 'client' THEN 'CLIENT'::user_role
    -- Mapping des valeurs en majuscules (déjà dans le bon format)
    WHEN 'ADMIN' THEN 'ADMIN'::user_role
    WHEN 'CHEF_AGENCE' THEN 'CHEF_AGENCE'::user_role
    WHEN 'COMPTABLE' THEN 'COMPTABLE'::user_role
    WHEN 'CAISSIER' THEN 'CAISSIER'::user_role
    WHEN 'AGENT_TERRAIN' THEN 'AGENT_TERRAIN'::user_role
    WHEN 'SUPERVISEUR' THEN 'SUPERVISEUR'::user_role
    WHEN 'GESTIONNAIRE_CREDIT' THEN 'GESTIONNAIRE_CREDIT'::user_role
    WHEN 'CLIENT' THEN 'CLIENT'::user_role
    ELSE 'CLIENT'::user_role -- Fallback par défaut
  END,
  e."agence_id",
  true -- Premier rôle = rôle principal
FROM "employes" e
WHERE e."user_id" IS NOT NULL
  AND e."role_system" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_roles" ur WHERE ur."user_id" = e."user_id"
  );

-- 5. Ajouter un commentaire sur employes.role_system pour indiquer la dépréciation
COMMENT ON COLUMN "employes"."role_system" IS 'DEPRECATED: Utilisez user_roles à la place. Conservé en lecture seule pour rétro-compatibilité.';

-- 6. Trigger pour sync bidirectionnelle (optionnel, pour la période de transition)
-- Ce trigger maintient employes.role_system synchronisé avec le rôle principal dans user_roles
CREATE OR REPLACE FUNCTION sync_employe_role_system()
RETURNS TRIGGER AS $$
BEGIN
  -- Quand un rôle principal est défini/modifié, on met à jour employes.role_system
  IF NEW.is_primary = true THEN
    UPDATE "employes"
    SET "role_system" = LOWER(NEW.role::text),
        "updated_at" = now()
    WHERE "user_id" = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_role_to_employe
AFTER INSERT OR UPDATE OF is_primary, role ON "user_roles"
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION sync_employe_role_system();

-- 7. Fonction pour garantir un seul rôle principal par utilisateur
CREATE OR REPLACE FUNCTION ensure_single_primary_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Si on définit un nouveau rôle comme principal, on retire le flag des autres
  IF NEW.is_primary = true THEN
    UPDATE "user_roles"
    SET "is_primary" = false, "updated_at" = now()
    WHERE "user_id" = NEW.user_id
      AND "id" != NEW.id
      AND "is_primary" = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_single_primary
BEFORE INSERT OR UPDATE OF is_primary ON "user_roles"
FOR EACH ROW
WHEN (NEW.is_primary = true)
EXECUTE FUNCTION ensure_single_primary_role();
