/**
 * Routes comptes — segment /comptes-bloques (partie comptes-bloques).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes-bloques
 *   GET    /api/comptes-bloques/:id
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { storage } from "../../storage";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage, SuspensionReason } from "@shared/enum/status-constants";
import { logger } from "./shared";

export function registerComptesBloquesRoutes(app: Express) {
  /**
   * GET /api/comptes-bloques - Liste des comptes de type "Bloqué"
   * Retourne les comptes avec type_compte = "Bloqué" pour la section Comptes Bloqués
   */
  /**
   * GET /api/comptes-bloques
   */
  app.get(
    "/api/comptes-bloques",
    requireAuth,
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        const filter = agenceFilter?.agenceId ? { agenceId: agenceFilter.agenceId } : {};

        // Get all blocked accounts
        const result = await storage.getAllComptesWithClients(filter, {
          typeCompte: TypeCompte.BLOCKED,
          page: 1,
          limit: 100, // Get all blocked accounts
        });

        // Transform to match expected frontend interface
        const comptesTransformed = result.data.map((compte: any) => ({
          id: compte.id,
          numero_compte: compte.numeroCompte || compte.numero_compte,
          montant_initial: parseFloat(compte.soldeCourant || compte.solde_courant || '0'),
          montant_actuel: parseFloat(compte.soldeCourant || compte.solde_courant || '0'),
          taux_interet: Number(compte.produit?.tauxInteret || compte.produit?.taux_interet || compte.taux_interet || 0),
          date_ouverture: compte.createdAt || compte.created_at,
          date_echeance: compte.blocageFin || compte.blocage_fin || null,
          duree_mois: 0,
          statut: compte.statut,
          clients: compte.clients,
          produit: compte.produit || null,
        }));

        res.json(comptesTransformed);
      } catch (error: any) {
        logger.error({ err: error }, 'Error listing comptes bloques');
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/comptes-bloques/:id - Détail d'un compte bloqué
   * Utilise le format spécifique attendu par le frontend (CompteBloqueDetail)
   */
  /**
   * GET /api/comptes-bloques/:id
   */
  app.get(
    "/api/comptes-bloques/:id",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const compte = await storage.getCompte(req.params.id);
        if (!compte) {
          return res.status(404).json({ message: "Compte non trouvé" });
        }

        // Vérifier si c'est bien un compte bloqué ?
        // if (compte.typeCompte !== 'Bloqué') ... (Optionnel mais sécurisé)

        const client = await storage.getClient(compte.clientId);
        
        // Structure alignée avec CompteBloqueDetail.tsx
        // tauxInteret récupéré depuis le produit lié (via getCompte qui fait le LEFT JOIN)
        const compteAny = compte as any;
        const tauxFromProduit = Number(compteAny.produit?.tauxInteret || compteAny.produit?.taux_interet || compteAny.taux_interet || 0);

        // Pénalité configurable par produit (regles.penaliteRetraitAnticipe), fallback 5%
        const regles = compteAny.produit?.regles as Record<string, any> | null | undefined;
        const penaliteProduit = Number(regles?.penaliteRetraitAnticipe);
        const penaliteRetrait = !isNaN(penaliteProduit) && penaliteProduit >= 0 ? penaliteProduit : 5;

        const transformed = {
          id: compte.id,
          numero_compte: compte.numeroCompte,
          montant_initial: parseFloat(compte.soldeCourant || '0'),
          montant_actuel: parseFloat(compte.soldeCourant || '0'),
          taux_interet: tauxFromProduit,
          date_ouverture: compte.createdAt,
          date_echeance: compte.blocageFin || null,
          duree_mois: compte.blocageFin
            ? Math.round((new Date(compte.blocageFin).getTime() - new Date(compte.createdAt!).getTime()) / (1000 * 60 * 60 * 24 * 30))
            : 0,
          statut: compte.statut,
          penalite_retrait_anticipe: penaliteRetrait,
          clients: client ? {
             id: client.id,
             nom: client.nom,
             prenom: client.prenom,
             phone: client.telephone,
          } : null,
          produit: compteAny.produit || null,
          description: compte.blocageMotif || null // Use blocageMotif as description
        };

        res.json(transformed);
      } catch (error: any) {
        logger.error({ err: error }, 'Error getting compte bloque detail');
        res.status(500).json({ message: error.message });
      }
    }
  );
}
