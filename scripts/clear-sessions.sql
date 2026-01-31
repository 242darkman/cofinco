-- Script de nettoyage des sessions
-- À exécuter lors de la migration vers Redis ou changement de SESSION_SECRET

-- 1. Vider la table des sessions express-session
TRUNCATE TABLE "session";

-- 2. Marquer toutes les sessions actives comme inactives
UPDATE active_sessions SET is_active = false WHERE is_active = true;

-- 3. Afficher le résultat
SELECT 
  (SELECT COUNT(*) FROM "session") as sessions_express,
  (SELECT COUNT(*) FROM active_sessions WHERE is_active = true) as sessions_actives;
