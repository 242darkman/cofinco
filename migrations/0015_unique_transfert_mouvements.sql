-- Migration: Contraintes d'unicité pour empêcher les mouvements fantômes sur les transferts inter-coffres
-- Date: 2026-01-17
-- Description: Ajoute des index uniques partiels sur la table mouvements_financiers pour garantir
--              qu'un seul mouvement de sortie et un seul mouvement d'entrée peuvent exister par transfert.
--              Ceci est une protection au niveau base de données contre les race conditions.

-- ============================================================================
-- INDEX UNIQUE PARTIEL: SORTIE COFFRE (DISPATCH)
-- ============================================================================
-- Empêche physiquement la création de plusieurs mouvements de type "SORTIE_COFFRE_TRANSIT"
-- pour le même transfertInterCoffreId.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_mvt_transfert_dispatch 
ON mouvements_financiers ((metadata->>'transfertInterCoffreId')) 
WHERE metadata->>'type' = 'SORTIE_COFFRE_TRANSIT';

-- ============================================================================
-- INDEX UNIQUE PARTIEL: ENTRÉE COFFRE (RÉCEPTION)
-- ============================================================================
-- Empêche physiquement la création de plusieurs mouvements de type "ENTREE_COFFRE_RECEPTION"
-- pour le même transfertInterCoffreId.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_mvt_transfert_receive 
ON mouvements_financiers ((metadata->>'transfertInterCoffreId')) 
WHERE metadata->>'type' = 'ENTREE_COFFRE_RECEPTION';

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================
COMMENT ON INDEX idx_unique_mvt_transfert_dispatch IS 
'Contrainte d''unicité: un seul mouvement de sortie par transfert inter-coffres. Prévention des double-débits.';

COMMENT ON INDEX idx_unique_mvt_transfert_receive IS 
'Contrainte d''unicité: un seul mouvement d''entrée par transfert inter-coffres. Prévention des double-crédits.';
