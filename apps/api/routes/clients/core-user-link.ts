import type { Express } from "express";

import { Actions, Subjects } from "@shared/ability";
import { SegmentClient } from "@shared/enum/status-constants";
import { createClientApiSchema } from "../../storage/clients";
import { z } from "zod";
import { logAudit } from "../../audit";
import { hashPassword, requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { createLogger } from "../../lib/logger";
import { requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { autoCreateCourantAccount } from "../../services/comptes";
import { recordScoreEvent } from "../../services/scoring-engine";
import { storage } from "../../storage";
import { getClientByUserId, getClientWithUser } from "../../storage/clients";
import { normalizeKeysDeep } from "../utils";

const logger = createLogger('Routes:Clients:UserLink');

/**
 * Routes de liaison entre clients et utilisateurs.
 *
 * - GET  /api/clients/by-user/:userId   — Récupérer un client par son userId
 * - GET  /api/clients/:id/with-user     — Client avec données utilisateur
 * - POST /api/clients/with-user         — Créer un client avec un compte utilisateur
 * - POST /api/clients/from-user/:userId — Créer un profil client pour un utilisateur existant
 */
export function registerClientUserLinkRoutes(app: Express) {

  // ============================================
  // ROUTES POUR L'ARCHITECTURE users/clients
  // ============================================

  // GET — Récupérer un client par son userId
  app.get("/api/clients/by-user/:userId", requireAuth, async (req, res) => {
    try {
      const client = await getClientByUserId(req.params.userId);
      if (!client) {
        return res.json({ data: null, message: "Aucun profil client pour cet utilisateur" });
      }
      res.json({ data: client });
    } catch (error) {
      logger.error({ err: error }, 'Erreur de récupération du client par userId');
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });


  // GET — Client avec données utilisateur
  app.get("/api/clients/:id/with-user", requireAuth, async (req, res) => {
    try {
      const client = await getClientWithUser(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client non trouvé" });
      }
      res.json(client);
    } catch (error) {
      logger.error({ err: error }, 'Erreur de récupération du client avec utilisateur');
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });


  // POST — Créer un client avec un compte utilisateur (pour futur portail client)
  app.post("/api/clients/with-user", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CLIENT), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientWithUser } = await import("../../storage/clients");

      const schema = z.object({
        // Données utilisateur
        nom: z.string().min(1, "Le nom est requis"),
        prenom: z.string().optional(),
        email: z.string().email().optional().nullable(),
        telephone: z.string().optional().nullable(),
        sexe: z.enum(['M', 'F']).optional().nullable(),
        username: z.string().optional().nullable(),
        password: z.string().optional().nullable(),
        // Données client métier
        adresse: z.string().optional(),
        segment: z.string().optional(),
        agenceId: z.string().uuid().optional().nullable(),
        agence: z.string().optional(), // Legacy
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const data = parsed.data;

      // Vérifier si le nom d'utilisateur existe déjà
      if (data.username) {
        const existingUser = await storage.getUserByUsername(data.username);
        if (existingUser) {
          return res.status(400).json({ message: "Ce nom d'utilisateur existe déjà" });
        }
      }

      // Hasher le mot de passe si fourni
      let hashedPassword = null;
      if (data.password) {
        hashedPassword = await hashPassword(data.password);
      }

      const userData = {
        nom: data.nom,
        prenom: data.prenom,
        email: data.email || undefined,
        telephone: data.telephone || undefined,
        sexe: data.sexe as 'M' | 'F' | undefined,
        username: data.username || undefined,
        password: hashedPassword || undefined,
      };

      const clientData = {
        adresseDomicile: data.adresse,
        segment: data.segment || SegmentClient.STANDARD,
        agenceId: data.agenceId || req.selectedAgenceId,
        statut: 'ACTIVE' as const,
      } as any;

      const result = await createClientWithUser(userData, clientData);

      // Score initial
      try {
        await recordScoreEvent({
          clientId: result.client.id,
          agenceId: result.client.agenceId || undefined,
          eventType: 'INITIAL_SCORE',
          refId: `initial-${result.client.id}`,
          refType: 'client',
          createdBy: req.session.user?.id,
        });
      } catch (scoreErr) {
        logger.error({ err: scoreErr, clientId: result.client.id }, 'Échec du calcul de score initial');
      }

      await logAudit(
        req,
        "CREATE_CLIENT_WITH_USER",
        "client",
        result.client.id,
        { nom: data.nom, hasPortalAccess: !!data.username },
        "success",
        "medium"
      );

      res.status(201).json(result);

    } catch (error) {
      logger.error({ err: error }, 'Erreur de création du client avec utilisateur');
      res.status(500).json({ message: "Erreur lors de la création du client" });
    }
  });


  // POST — Créer un profil client pour un utilisateur existant
  app.post("/api/clients/from-user/:userId", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CLIENT), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientForUser } = await import("../../storage/clients");
      const { userId } = req.params;

      // Vérifier que l'utilisateur existe
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      // Vérifier qu'il n'a pas déjà un profil client
      const existingClient = await getClientByUserId(userId);
      if (existingClient) {
        return res.status(400).json({ message: "Cet utilisateur a déjà un profil client" });
      }

      const data = normalizeKeysDeep(req.body);
      // Architecture V3 : Pour un utilisateur existant, on ne valide que les données métier
      // L'identité (nom, prenom, email, telephone) est déjà dans users
      const clientBusinessSchema = createClientApiSchema.omit({
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        photoProfile: true,
        sexe: true,
      });
      const parsed = clientBusinessSchema.safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      // Forcer l'agenceId si non fournie
      const clientData = {
        ...parsed.data,
        agenceId: parsed.data.agenceId || req.selectedAgenceId,
      };

      const client = await createClientForUser(userId, clientData);

      // Score initial
      try {
        await recordScoreEvent({
          clientId: client.id,
          agenceId: client.agenceId || undefined,
          eventType: 'INITIAL_SCORE',
          refId: `initial-${client.id}`,
          refType: 'client',
          createdBy: req.session.user?.id,
        });
      } catch (scoreErr) {
        logger.error({ err: scoreErr, clientId: client.id }, 'Échec du calcul de score initial');
      }

      // Auto-création d'un compte courant via le système produit
      let compteCourant = null;
      try {
        const autoResult = await autoCreateCourantAccount(client.id, clientData.agenceId || client.agenceId!, req.session.user?.id!);
        compteCourant = autoResult.compte;
        logger.info({ numeroCompte: compteCourant.numeroCompte, clientId: client.id, isPending: autoResult.isPending }, 'Compte courant auto-créé pour la conversion employé-client');
      } catch (accountError) {
        logger.error({ err: accountError, clientId: client.id }, 'Échec de la création automatique du compte courant pour la conversion employé-client');
      }

      await logAudit(
        req,
        "CREATE_CLIENT_FROM_USER",
        "client",
        client.id,
        { userId, compteCourantId: compteCourant?.id },
        "success",
        "medium"
      );

      res.status(201).json(client);

    } catch (error) {
      logger.error({ err: error }, 'Erreur de création du profil client depuis un utilisateur');
      res.status(500).json({ message: "Erreur lors de la création du profil client" });
    }
  });
}
