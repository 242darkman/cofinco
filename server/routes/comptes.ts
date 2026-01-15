/**
 * Routes API pour les comptes microfinance
 *
 * Endpoints:
 * - POST   /api/comptes              - Créer un compte (avec validation unique par type)
 * - GET    /api/comptes              - Lister les comptes (filtré par agence)
 * - GET    /api/comptes/:id          - Détails d'un compte
 * - POST   /api/comptes/:id/depot    - Effectuer un dépôt
 * - POST   /api/comptes/:id/retrait  - Effectuer un retrait
 * - POST   /api/comptes/:id/bloquer  - Bloquer un compte
 * - POST   /api/comptes/:id/debloquer - Débloquer un compte
 * - POST   /api/comptes/:id/transfert-agence - Transférer vers une autre agence
 * - GET    /api/comptes/:id/historique-agences - Historique des transferts d'agence
 * - GET    /api/comptes/:id/transactions - Transactions du compte
 * - GET    /api/clients/:id/portfolio - Portfolio complet du client
 */

import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../middleware";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { z } from "zod";
import comptesService, { CompteError } from "../services/comptes";
import { storage } from "../storage";

// Validation schemas
const createCompteSchema = z.object({
  clientId: z.string().uuid(),
  typeCompte: z.enum(["Épargne", "Courant", "Bloqué"]),
  agenceId: z.string().uuid(),
  produitId: z.string().uuid().optional(),
  soldeInitial: z.number().min(0).optional(),
  blocageActif: z.boolean().optional(),
  blocageMotif: z
    .enum([
      "Garantie crédit",
      "Garantie tontine",
      "Épargne forcée",
      "Décision interne",
      "Litige",
      "Autre",
    ])
    .optional(),
  blocageReference: z.string().optional(),
});

const depotRetraitSchema = z.object({
  montant: z.number().positive("Le montant doit être positif"),
  methodePaiement: z.string().default("Espèces"),
  sessionCaisseId: z.string().uuid().optional(),
  observations: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const blocageSchema = z.object({
  motif: z.enum([
    "Garantie crédit",
    "Garantie tontine",
    "Épargne forcée",
    "Décision interne",
    "Litige",
    "Autre",
  ]),
  reference: z.string().optional(),
  dateFin: z.string().datetime().optional(),
});

const deblocageSchema = z.object({
  motif: z.string().optional(),
});

const transfertAgenceSchema = z.object({
  nouvelleAgenceId: z.string().uuid(),
  motif: z.string().optional(),
});

export function registerComptesRoutes(app: Express) {
  // ============================================================================
  // CREATE COMPTE
  // ============================================================================

  /**
   * POST /api/comptes - Créer un nouveau compte
   * Validation: Un client ne peut avoir qu'un seul compte par type
   */
  app.post(
    "/api/comptes",
    requireAuth,
    requireRole("admin", "chef", "caisse"),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;

        // Force l'agenceId du client si non spécifié ou pour garantir la cohérence
        if (data.clientId) {
          const client = await storage.getClient(data.clientId);
          if (!client) {
            return res.status(404).json({ message: "Client non trouvé" });
          }
          // On utilise l'agence du client par défaut si non précisé, 
          // ou on l'écrase pour respecter la règle métier demandée.
          data.agenceId = client.agenceId;
        }

        const parsed = createCompteSchema.parse(data);

        const compte = await comptesService.createCompte(
          {
            clientId: parsed.clientId,
            typeCompte: parsed.typeCompte,
            agenceId: parsed.agenceId,
            produitId: parsed.produitId,
            soldeInitial: parsed.soldeInitial,
            blocageActif: parsed.blocageActif,
            blocageMotif: parsed.blocageMotif,
            blocageReference: parsed.blocageReference,
          },
          user?.id
        );

        await logAudit(
          req,
          "CREATE_COMPTE",
          "compte",
          compte.id,
          undefined,
          "success",
          "medium"
        );

        // Broadcast pour mise à jour UI
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
        }

        res.status(201).json(addSnakeCaseAliasesDeep(compte));
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.name === "ZodError") {
          return res.status(400).json({
            message: "Données invalides",
            details: error.errors,
          });
        }
        console.error("Error creating compte:", error);
        res.status(500).json({ message: "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // LIST & GET COMPTES
  // ============================================================================

  /**
   * GET /api/comptes - Lister les comptes avec clients, recherche et pagination
   * Query params: search, page, limit, typeCompte
   */
  app.get(
    "/api/comptes",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agence?: string } | null;
        const filter = agenceFilter ? { agence: agenceFilter.agence } : {};

        // Parse query parameters
        const options = {
          search: req.query.search as string | undefined,
          page: req.query.page ? parseInt(req.query.page as string) : 1,
          limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
          typeCompte: req.query.typeCompte as string | undefined,
        };

        const result = await storage.getAllComptesWithClients(filter, options);
        res.json(result);
      } catch (error: any) {
        console.error("Error listing comptes:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/comptes-bloques - Liste des comptes de type "Bloqué"
   * Retourne les comptes avec type_compte = "Bloqué" pour la section Comptes Bloqués
   */
  app.get(
    "/api/comptes-bloques",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agence?: string } | null;
        const filter = agenceFilter ? { agence: agenceFilter.agence } : {};

        // Get all blocked accounts
        const result = await storage.getAllComptesWithClients(filter, {
          typeCompte: "Bloqué",
          page: 1,
          limit: 100, // Get all blocked accounts
        });

        // Transform to match expected frontend interface
        const comptesTransformed = result.data.map((compte: any) => ({
          id: compte.id,
          numero_compte: compte.numeroCompte || compte.numero_compte,
          montant_initial: parseFloat(compte.soldeCourant || compte.solde_courant || '0'),
          montant_actuel: parseFloat(compte.soldeCourant || compte.solde_courant || '0'),
          taux_interet: 0, // Not applicable for blocked accounts in this schema
          date_ouverture: compte.createdAt || compte.created_at,
          date_echeance: compte.blocageFin || compte.blocage_fin || null,
          duree_mois: 0,
          statut: compte.statut,
          clients: compte.clients,
        }));

        res.json(addSnakeCaseAliasesDeep(comptesTransformed));
      } catch (error: any) {
        console.error("Error listing comptes bloqués:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/comptes/:id - Détails d'un compte avec permissions
   */
  app.get("/api/comptes/:id", requireAuth, async (req, res) => {
    try {
      const compte = await storage.getCompte(req.params.id);
      if (!compte) {
        return res.status(404).json({ message: "Compte non trouvé" });
      }

      // Ajouter les informations de permission de retrait
      const withdrawalCheck = comptesService.canWithdraw(compte);
      const depositCheck = comptesService.canDeposit(compte);

      res.json(
        addSnakeCaseAliasesDeep({
          ...compte,
          permissions: {
            canWithdraw: withdrawalCheck.allowed,
            withdrawalBlockedReason: withdrawalCheck.reason,
            canDeposit: depositCheck.allowed,
            depositBlockedReason: depositCheck.reason,
          },
        })
      );
    } catch (error: any) {
      console.error("Error getting compte:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // DEPOT / RETRAIT
  // ============================================================================

  /**
   * POST /api/comptes/:id/depot - Effectuer un dépôt
   * Les dépôts sont toujours autorisés (même sur compte bloqué)
   */
  app.post(
    "/api/comptes/:id/depot",
    requireAuth,
    requireRole("admin", "chef", "caisse"),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = depotRetraitSchema.parse(data);
        const user = req.session.user;

        // Si pas de sessionCaisseId fourni, essayer de récupérer la session active
        let sessionCaisseId = parsed.sessionCaisseId;
        if (!sessionCaisseId && user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }

        const result = await comptesService.deposerSurCompte(
          {
            compteId: req.params.id,
            montant: parsed.montant,
            methodePaiement: parsed.methodePaiement,
            sessionCaisseId,
            observations: parsed.observations,
            idempotencyKey: parsed.idempotencyKey,
          },
          user?.id
        );

        await logAudit(
          req,
          "DEPOT_COMPTE",
          "compte",
          req.params.id,
          { montant: parsed.montant },
          "success",
          "medium"
        );

        // Broadcast temps réel (outbox worker gère le reste)
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Dépôt: ${parsed.montant.toLocaleString()} FCFA`,
              user: user.nom || "Système",
              type: "savings",
              timestamp: new Date().toISOString(),
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
        }

        res.json(
          addSnakeCaseAliasesDeep({
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            message: "Dépôt effectué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.message?.includes("Duplicate idempotency")) {
          return res.status(409).json({
            message: "Opération déjà effectuée (doublon détecté)",
            code: "DUPLICATE_OPERATION",
          });
        }
        console.error("Error depot:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/retrait - Effectuer un retrait
   * CRITIQUE: Vérifie les règles de blocage pour les comptes bloqués
   */
  app.post(
    "/api/comptes/:id/retrait",
    requireAuth,
    requireRole("admin", "chef", "caisse"),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = depotRetraitSchema.parse(data);
        const user = req.session.user;

        // Si pas de sessionCaisseId fourni, essayer de récupérer la session active
        let sessionCaisseId = parsed.sessionCaisseId;
        if (!sessionCaisseId && user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }

        const result = await comptesService.retirerDuCompte(
          {
            compteId: req.params.id,
            montant: parsed.montant,
            methodePaiement: parsed.methodePaiement,
            sessionCaisseId,
            observations: parsed.observations,
            idempotencyKey: parsed.idempotencyKey,
          },
          user?.id
        );

        await logAudit(
          req,
          "RETRAIT_COMPTE",
          "compte",
          req.params.id,
          { montant: parsed.montant },
          "success",
          "high"
        );

        // Broadcast temps réel
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Retrait de ${parsed.montant.toLocaleString()} FCFA effectué`,
              targetRole: "admin",
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Retrait: ${parsed.montant.toLocaleString()} FCFA`,
              user: user.nom || "Système",
              type: "payment",
              timestamp: new Date().toISOString(),
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
        }

        res.json(
          addSnakeCaseAliasesDeep({
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            message: "Retrait effectué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          // Codes spécifiques pour le frontend
          const statusCode =
            error.code === "WITHDRAWAL_NOT_ALLOWED" ||
            error.code === "INSUFFICIENT_BALANCE"
              ? 403
              : 400;
          return res.status(statusCode).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.message?.includes("Duplicate idempotency")) {
          return res.status(409).json({
            message: "Opération déjà effectuée (doublon détecté)",
            code: "DUPLICATE_OPERATION",
          });
        }
        console.error("Error retrait:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // BLOCAGE / DEBLOCAGE
  // ============================================================================

  /**
   * POST /api/comptes/:id/bloquer - Bloquer un compte
   */
  app.post(
    "/api/comptes/:id/bloquer",
    requireAuth,
    requireRole("admin", "chef"),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = blocageSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.bloquerCompte(
          req.params.id,
          parsed.motif,
          parsed.reference,
          parsed.dateFin ? new Date(parsed.dateFin) : undefined,
          user?.id
        );

        await logAudit(
          req,
          "BLOQUER_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte bloqué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error bloquer compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/debloquer - Débloquer un compte
   * CRITIQUE: Tracé et événement temps réel obligatoire
   */
  app.post(
    "/api/comptes/:id/debloquer",
    requireAuth,
    requireRole("admin", "chef"),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = deblocageSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.debloquerCompte(
          {
            compteId: req.params.id,
            motif: parsed.motif,
          },
          user?.id
        );

        await logAudit(
          req,
          "DEBLOQUER_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        // Notification explicite (en plus de l'outbox)
        const wsInstance = require("../ws-server").getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Compte ${compte.numeroCompte} débloqué`,
              type: "success",
            },
          });
        }

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte débloqué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error debloquer compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // TRANSFERT INTER-AGENCE
  // ============================================================================

  /**
   * POST /api/comptes/:id/transfert-agence - Transférer vers une autre agence
   * Historisé via compte_agences_historique
   */
  app.post(
    "/api/comptes/:id/transfert-agence",
    requireAuth,
    requireRole("admin", "chef"),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = transfertAgenceSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.transfererCompteAgence(
          {
            compteId: req.params.id,
            nouvelleAgenceId: parsed.nouvelleAgenceId,
            motif: parsed.motif,
          },
          user?.id
        );

        await logAudit(
          req,
          "TRANSFERT_COMPTE_AGENCE",
          "compte",
          req.params.id,
          { nouvelleAgenceId: parsed.nouvelleAgenceId },
          "success",
          "high"
        );

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte transféré avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error transfert agence:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/historique-agences - Historique des transferts d'agence
   */
  app.get(
    "/api/comptes/:id/historique-agences",
    requireAuth,
    async (req, res) => {
      try {
        const historique = await comptesService.getCompteAgenceHistorique(
          req.params.id
        );
        res.json(addSnakeCaseAliasesDeep(historique));
      } catch (error: any) {
        console.error("Error getting historique agences:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  // ============================================================================
  // TRANSACTIONS & PORTFOLIO
  // ============================================================================

  /**
   * GET /api/comptes/:id/transactions - Transactions du compte
   */
  app.get("/api/comptes/:id/transactions", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await comptesService.getCompteTransactions(
        req.params.id,
        limit
      );
      res.json(addSnakeCaseAliasesDeep(transactions));
    } catch (error: any) {
      console.error("Error getting transactions:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/clients/:id/portfolio - Portfolio complet du client
   * Retourne: comptes, crédits, tontines, totaux
   */
  app.get("/api/clients/:id/portfolio", requireAuth, async (req, res) => {
    try {
      const portfolio = await comptesService.getClientPortfolio(req.params.id);
      res.json(addSnakeCaseAliasesDeep(portfolio));
    } catch (error: any) {
      console.error("Error getting portfolio:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // STATS & CLOTURE
  // ============================================================================

  /**
   * POST /api/comptes/:id/cloturer - Clôturer un compte définitivement
   */
  app.post(
    "/api/comptes/:id/cloturer",
    requireAuth,
    requireRole("admin", "chef"), // Action critique
    async (req, res) => {
      try {
        const user = req.session.user;
        const compte = await comptesService.cloturerCompte(
          req.params.id,
          user?.id
        );

        await logAudit(
          req,
          "CLOTURER_COMPTE",
          "compte",
          req.params.id,
          undefined,
          "success",
          "critical"
        );

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte clôturé avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          // Specific error codes to help frontend (BALANCE_NOT_ZERO, PENDING_TRANSACTIONS...)
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error cloturer compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/stats - Statistiques d'évolution du solde
   * Query: period (1M, 3M, 6M, 1Y)
   */
  app.get("/api/comptes/:id/stats", requireAuth, async (req, res) => {
    try {
      const period = (req.query.period as '1M' | '3M' | '6M' | '1Y') || '1M';
      // Basic validation of period
      if (!['1M', '3M', '6M', '1Y'].includes(period)) {
        return res.status(400).json({ message: "Période invalide" });
      }

      const stats = await comptesService.getCompteStats(req.params.id, period);
      res.json(stats); // Already JSON structure
    } catch (error: any) {
      console.error("Error getting stats:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // VALIDATION ENDPOINT (pour le frontend)
  // ============================================================================

  /**
   * GET /api/clients/:id/can-create-compte/:type - Vérifie si le client peut créer ce type de compte
   */
  app.get(
    "/api/clients/:id/can-create-compte/:type",
    requireAuth,
    async (req, res) => {
      try {
        const { id, type } = req.params;
        const typeCompte = type as "Épargne" | "Courant" | "Bloqué";

        if (!["Épargne", "Courant", "Bloqué"].includes(typeCompte)) {
          return res.status(400).json({
            message: "Type de compte invalide",
            allowed: false,
          });
        }

        const hasExisting = await comptesService.clientHasCompteOfType(
          id,
          typeCompte
        );

        res.json({
          allowed: !hasExisting,
          reason: hasExisting
            ? `Le client possède déjà un compte ${typeCompte}`
            : null,
        });
      } catch (error: any) {
        console.error("Error checking compte eligibility:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );
}
