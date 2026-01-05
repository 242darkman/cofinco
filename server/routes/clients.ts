import type { Express } from "express";
import { insertClientSchema, insertTagSchema, insertClientTagSchema, insertClientActivitySchema, clientTags, clientActivities, users, clients } from "@shared/schema";
import { storage } from "../storage";
import { getClientTags, addClientTag, removeClientTag, createTag, getAllTags, logClientActivity, getClientActivities, getClientByUserId, getClientWithUser, getAllTypesMarches } from "../storage/clients";


import { requireAuth, requireRole, hashPassword } from "../auth";
import { requireAgenceAccess, validateAgenceAction, requireAgenceIdAccess, validateAgenceIdAction } from "../middleware";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep, coerceValueToSchema } from "./utils";
import { calculateClientScore } from "../scoring-service";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { createClientAccount, getComptesByClient } from "../storage/finance";

export function registerClientRoutes(app: Express) {
  // LISTE CLIENTS : Filtrée par agence (supporte agenceId via header ou agence legacy)
  app.get("/api/clients", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // req.agenceFilter contient { agenceId: "..." } ou { agence: "..." } ou null (admin)
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;

      // On passe le filtre directement au storage qui l'applique en SQL
      const filter = agenceFilter || {};
      const clients = await storage.getAllClients(filter);

      const transformed = addSnakeCaseAliasesDeep(clients);
      res.json(transformed);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // RECHERCHE : Filtrée par agence
  app.get("/api/clients/search", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query) return res.json([]);

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        const filter = agenceFilter || {};

        const clients = await storage.getAllClients(filter);

        const lowerQ = query.toLowerCase();
        const filtered = clients.filter(c =>
            (c.nom && c.nom.toLowerCase().includes(lowerQ)) ||
            (c.prenom && c.prenom.toLowerCase().includes(lowerQ)) ||
            (c.telephone && c.telephone.includes(query))
        );
        res.json(addSnakeCaseAliasesDeep(filtered));
    } catch (e) {
        res.status(500).json({ message: "Search failed" });
    }
  });

  // SEARCH WITH LOCATION: Filtré par agence
  app.get("/api/clients/with-location", requireAuth, requireAgenceIdAccess(), async (req, res) => {
      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      const filter = agenceFilter || {};

      const clients = await storage.getAllClients(filter);
      const withLoc = clients.filter(c => c.latitude && c.longitude);
      res.json(addSnakeCaseAliasesDeep(withLoc));
  });

  // GET ONE: Vérification manuelle de l'agence
  app.get("/api/clients/:id", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    const client = await storage.getClient(req.params.id);
    if (!client) return res.status(404).json({ message: "Client not found" });

    // Vérifier si l'utilisateur a le droit de voir ce client spécifique
    const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
    if (agenceFilter) {
      // Vérifier par agenceId (prioritaire) ou par agence (legacy)
      if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      } else if (agenceFilter.agence && client.agence !== agenceFilter.agence) {
        return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
      }
    }

    // Calcule des limites de retrait
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    // Début de semaine (Lundi)
    const startWeek = new Date(now);
    const day = startWeek.getDay() || 7; // Dimanche = 0 -> 7
    if (day !== 1) startWeek.setHours(-24 * (day - 1));
    startWeek.setHours(0, 0, 0, 0);

    // Début de mois
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const withdrawalsToday = await storage.getOperationsByClientAndDateRange(client.id, startToday, endToday, 'retrait');
    const withdrawalsWeek = await storage.getOperationsByClientAndDateRange(client.id, startWeek, endToday, 'retrait');
    const withdrawalsMonth = await storage.getOperationsByClientAndDateRange(client.id, startMonth, endToday, 'retrait');

    const sum = (ops: any[]) => ops.reduce((acc, op) => acc + Number(op.montant), 0);
    const usedToday = sum(withdrawalsToday);
    const usedWeek = sum(withdrawalsWeek);
    const usedMonth = sum(withdrawalsMonth);

    const result = {
      ...(addSnakeCaseAliasesDeep(client) as any),
      security_limits: {
        daily: {
          limit: Number(client.limiteRetraitJournalier),
          used: usedToday,
          remaining: Math.max(0, Number(client.limiteRetraitJournalier) - usedToday)
        },
        weekly: {
          limit: Number(client.limiteRetraitHebdomadaire),
          used: usedWeek,
          remaining: Math.max(0, Number(client.limiteRetraitHebdomadaire) - usedWeek)
        },
        monthly: {
          limit: Number(client.limiteRetraitMensuel),
          used: usedMonth,
          remaining: Math.max(0, Number(client.limiteRetraitMensuel) - usedMonth)
        }
      }
    };

    res.json(result);
  });

  // ============================================
  // COMPTES BANCAIRES (Refactored)
  // ============================================

  // GET Accounts
  app.get("/api/clients/:id/accounts", requireAuth, requireAgenceIdAccess(), async (req, res) => {
    try {
      // 1. Verify access to client
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter) {
        if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        } else if (agenceFilter.agence && client.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      // 2. Fetch accounts
      const accounts = await getComptesByClient(req.params.id);
      res.json(accounts);
    } catch (error) {
       console.error("Error fetching accounts:", error);
       res.status(500).json({ message: "Erreur chargement comptes" });
    }
  });

  // POST Account (Create)
  app.post("/api/clients/:id/accounts", requireAuth, requireRole('admin', 'chef'), requireAgenceIdAccess(), async (req, res) => {
      try {
        // 1. Verify access to client
        const client = await storage.getClient(req.params.id);
        if (!client) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && client.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          }
        }

        // 2. Validate input
        const schema = z.object({
            typeCompte: z.enum(['Courant', 'Épargne']),
            soldeInitial: z.coerce.number().min(0, "Le solde initial ne peut pas être négatif"),
            tauxInteret: z.coerce.number().min(0).default(0),
            statut: z.enum(['Actif', 'Suspendu', 'Fermé']).default('Actif')
        });

        const parsed = schema.parse(req.body);

        // 3. Create account atomically
        const account = await createClientAccount(req.params.id, parsed, req.session.user?.id);

        // 4. Log Audit
        await logAudit(
            req,
            "CREATE_ACCOUNT",
            "client",
            client.id,
            { type: parsed.typeCompte, numero: account.numeroCompte },
            "success",
            "medium"
        );

        // 5. Notify Real-Time Updates
        const wsServer = await import("../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            // Notify client update (force refresh of client details everywhere)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: client.id, agenceId: client.agenceId } });
            
            // Notify live activity
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Nouveau compte ${parsed.typeCompte} : ${account.numeroCompte}`,
                user: req.session.user?.nom || 'Système',
                type: 'finance',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId
              }
            });

            // Update dashboard stats if there was an invalidation needed
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
        }

        res.status(201).json(account);
      } catch (error) {
         if (error instanceof z.ZodError) return res.status(400).json(error);
         console.error("Error creating account:", error);
         res.status(500).json({ message: "Erreur création compte" });
      }
  });

  // CREATE: Validation de l'agence cible (supporte agenceId)
  app.post("/api/clients", requireAuth, requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = insertClientSchema.parse(data);

        // L'agenceId a été validée/forcée par validateAgenceIdAction
        // Si elle manquait, validateAgenceIdAction l'a ajoutée depuis req.selectedAgenceId

        const client = await storage.createClient(parsed);

        await logAudit(
            req,
            "CREATE_CLIENT",
            "client",
            client.id,
            undefined,
            "success",
            "low"
        );

        // Update Dashboard & Lists via WebSocket
        const wsServer = await import("../ws-server"); // Dynamic import for ESM
        const wsInstance = wsServer.getWsInstance();

        if (wsInstance) {
            // Notifier dashboard global (stats)
            wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });

            // Notifier liste clients (filtrée côté client)
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client.agenceId, agence: client.agence } });

            // Activité en temps réel
            wsInstance.broadcast({
              type: "LIVE_ACTIVITY",
              payload: {
                action: `Nouveau client: ${client.nom}${client.prenom ? ' ' + client.prenom : ''}`,
                user: req.session.user?.nom || 'Système',
                type: 'client',
                timestamp: new Date().toISOString(),
                agenceId: client.agenceId // Pour filtrage côté client
              }
            });
        }

        res.status(201).json(addSnakeCaseAliasesDeep(client));
      } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json(e);
        console.error("Create client error:", e);
        res.status(500).json({ message: "Create client failed" });
      }
  });

  // UPDATE: Vérification accès + interdiction changer agence (roles: admin, chef, caisse, terrain, credit)
  app.patch("/api/clients/:id", requireAuth, requireRole('admin', 'chef', 'caisse', 'terrain', 'credit'), requireAgenceIdAccess(), async (req, res) => {
      try {
        const existing = await storage.getClient(req.params.id);
        if (!existing) return res.status(404).json({ message: "Client not found" });

        const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
        if (agenceFilter) {
          if (agenceFilter.agenceId && existing.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          } else if (agenceFilter.agence && existing.agence !== agenceFilter.agence) {
            return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
          }
        }

        const data = normalizeKeysDeep(req.body);
        const parsed = insertClientSchema.partial().parse(data);

        // Empêcher changement d'agence si non admin
        if (agenceFilter) {
          if (parsed.agenceId && parsed.agenceId !== agenceFilter.agenceId) {
            return res.status(403).json({ message: "Impossible de changer l'agence du client" });
          }
          if (parsed.agence && agenceFilter.agence && parsed.agence !== agenceFilter.agence) {
            return res.status(403).json({ message: "Impossible de changer l'agence du client" });
          }
        }

        const client = await storage.updateClient(req.params.id, parsed);

        await logAudit(
            req,
            "UPDATE_CLIENT",
            "client",
            client!.id,
            undefined,
            "success",
            "low"
        );

        // Update Lists
        // Update Lists
        const wsServer = await import("../ws-server");
        const wsInstance = wsServer.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: client!.agenceId } });
        }

        res.json(addSnakeCaseAliasesDeep(client));
      } catch (e) {
          console.error("Update client error:", e);
          res.status(500).json({ message: "Update failed" });
      }
  });

  // DELETE: Vérification accès (roles: admin, chef only)
  app.delete("/api/clients/:id", requireAuth, requireRole('admin', 'chef'), requireAgenceIdAccess(), async (req, res) => {
      const existing = await storage.getClient(req.params.id);
      if (!existing) return res.status(404).json({ message: "Client not found" });

      const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
      if (agenceFilter) {
        if (agenceFilter.agenceId && existing.agenceId !== agenceFilter.agenceId) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        } else if (agenceFilter.agence && existing.agence !== agenceFilter.agence) {
          return res.status(403).json({ message: "Accès refusé : client d'une autre agence" });
        }
      }

      const success = await storage.deleteClient(req.params.id);

      await logAudit(
            req,
            "DELETE_CLIENT",
            "client",
            req.params.id,
            undefined,
            "success",
            "low"
      );

      // Update Lists
      // Update Lists
      const wsServer = await import("../ws-server");
      const wsInstance = wsServer.getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { agenceId: existing.agenceId } });
          wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
      }

      res.status(200).json({ message: "Client deleted successfully" });
  });

  // Types de Marchés
  app.get("/api/types-marches", requireAuth, async (req, res) => {
      const types = await getAllTypesMarches();
      res.json(types);
  });

  // Client Tags
  app.get("/api/clients/:id/tags", requireAuth, async (req, res) => {
      // TODO: Vérifier accès client
      const tags = await getClientTags(req.params.id);
      res.json(tags);
  });

  app.post("/api/clients/:id/tags", requireAuth, async (req, res) => {
     // TODO: Vérifier accès client
     const ct = await addClientTag({ ...req.body, clientId: req.params.id });
     res.json(ct);
  });

  app.delete("/api/clients/:id/tags/:tagId", requireAuth, async (req, res) => {
     // TODO: Vérifier accès client
     await removeClientTag(req.params.id, req.params.tagId);
     res.sendStatus(200);
  });

  // Tags global
  app.get("/api/tags", requireAuth, async (req, res) => {
      const tags = await getAllTags();
      res.json(tags);
  });

  app.post("/api/tags", requireAuth, async (req, res) => {
      const tag = await createTag(req.body);
      res.json(tag);
  });

  // Client Activities
  app.get("/api/clients/:id/activities", requireAuth, async (req, res) => {
      // TODO: Vérifier accès client
      const acts = await getClientActivities(req.params.id);
      res.json(acts);
  });

  app.post("/api/clients/:id/activities", requireAuth, async (req, res) => {
      // TODO: Vérifier accès client
      const act = await logClientActivity({ ...req.body, clientId: req.params.id, userId: req.session.user!.id });
      res.json(act);
  });

  // Calculate Score
  app.post("/api/clients/:id/score", requireAuth, async (req, res) => {
      try {
        const result = await calculateClientScore(req.params.id);

        // Notify update
        const wsModule = await import("../ws-server");
        const wsInstance = wsModule.getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: req.params.id } });
        }

        res.json(result);
      } catch (error) {
          console.error("Score calculation error:", error);
          res.status(500).json({ message: "Score calculation failed" });
      }
  });

  // ============================================
  // NOUVELLES ROUTES POUR ARCHITECTURE users/clients
  // ============================================

  // GET - Récupérer un client par son userId
  app.get("/api/clients/by-user/:userId", requireAuth, async (req, res) => {
    try {
      const client = await getClientByUserId(req.params.userId);
      if (!client) {
        return res.status(404).json({ message: "Aucun profil client pour cet utilisateur" });
      }
      res.json(addSnakeCaseAliasesDeep(client));
    } catch (error) {
      console.error("Error fetching client by userId:", error);
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });

  // GET - Client avec données utilisateur
  app.get("/api/clients/:id/with-user", requireAuth, async (req, res) => {
    try {
      const client = await getClientWithUser(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client non trouvé" });
      }
      res.json(addSnakeCaseAliasesDeep(client));
    } catch (error) {
      console.error("Error fetching client with user:", error);
      res.status(500).json({ message: "Erreur lors de la récupération du client" });
    }
  });

  // POST - Créer un client avec un compte utilisateur (pour futur portail client)
  app.post("/api/clients/with-user", requireRole("admin", "chef"), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientWithUser } = await import("../storage/clients");

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
        ville: z.string().optional(),
        pays: z.string().optional(),
        profession: z.string().optional(),
        segment: z.string().optional(),
        agenceId: z.string().uuid().optional().nullable(),
        agence: z.string().optional(), // Legacy
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      const data = parsed.data;

      // Vérifier si username existe déjà
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
        adresse: data.adresse,
        ville: data.ville,
        pays: data.pays,
        profession: data.profession,
        segment: data.segment || 'Standard',
        agenceId: data.agenceId || (req as any).selectedAgenceId,
        agence: data.agence,
        creditTotal: '0',
        epargneTotal: '0',
        tauxRemboursement: '100',
        dateInscription: new Date(),
      };

      const result = await createClientWithUser(userData, clientData);

      await logAudit(
        req,
        "CREATE_CLIENT_WITH_USER",
        "client",
        result.client.id,
        { nom: data.nom, hasPortalAccess: !!data.username },
        "success",
        "medium"
      );

      res.status(201).json(addSnakeCaseAliasesDeep(result));

    } catch (error) {
      console.error("Error creating client with user:", error);
      res.status(500).json({ message: "Erreur lors de la création du client" });
    }
  });

  // POST - Créer un profil client pour un utilisateur existant
  app.post("/api/clients/from-user/:userId", requireRole("admin", "chef"), requireAgenceIdAccess(), validateAgenceIdAction(), async (req, res) => {
    try {
      const { createClientForUser } = await import("../storage/clients");
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
      const parsed = insertClientSchema.omit({ userId: true, nom: true }).safeParse(data);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.errors });
      }

      // Forcer l'agenceId si non fournie
      const clientData = {
        ...parsed.data,
        agenceId: parsed.data.agenceId || (req as any).selectedAgenceId,
      };

      const client = await createClientForUser(userId, clientData);

      await logAudit(
        req,
        "CREATE_CLIENT_FROM_USER",
        "client",
        client.id,
        { userId },
        "success",
        "medium"
      );

      res.status(201).json(addSnakeCaseAliasesDeep(client));

    } catch (error) {
      console.error("Error creating client from user:", error);
      res.status(500).json({ message: "Erreur lors de la création du profil client" });
    }
  });
}
