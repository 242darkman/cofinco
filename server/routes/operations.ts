import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { insertAgentTerrainSchema, insertProspectionSchema, insertVisiteTerrainSchema, insertPaiementTerrainSchema, insertZoneSchema, insertObjectifMensuelSchema, prospections, agentsTerrain, employes, arrondissements, marches, clients, users, prospectionPrimes, prospectionPrimeConfig } from "@shared/schema";
import { PROSPECTION_STATUS_TRANSITIONS, StatutProspection, ClientOrigin } from "@shared/enum/status-constants";
import { logAudit } from "../lib/logger";
import { and, desc, isNull, sql } from "drizzle-orm";
import { notDeleted } from "../storage/query-helpers";

const logger = createLogger('Routes:Operations');
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep, parsePagination, paginateResponse } from "./utils";
import { SystemRole, normalizeRole } from "@shared/types/roles";
import { getWsInstance } from "../ws-server";
import { StorageService } from "../services/storage-service";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { dispatchDomainEvent } from "../services/notifications/domain-events/event-registry";
import type { StatutProspectionType } from "@shared/enum/status-constants";

export function registerOperationsRoutes(app: Express) {
  // Agents
  app.get("/api/agents-terrain", requireAuth, async (req, res) => {
      const { page, perPage } = parsePagination(req.query);
      const { data, total } = await storage.getAgentsTerrainPaginated(page, perPage);
      res.json(
        paginateResponse(data as unknown[], total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
        })
      );
  });

  // Create agent terrain (roles: admin, chef)
  app.post("/api/agents-terrain", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.TERRAIN), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertAgentTerrainSchema.parse(data);
      const agent = await storage.createAgentTerrain(parsed);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'agent_new', id: agent.id } });
      }

      res.json(agent);
  });

  // Resolve current user's agent terrain profile (userId → agentTerrainId)
  app.get("/api/agents-terrain/me", requireAuth, async (req, res) => {
      const userId = (req as any).user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Non authentifié" });

      const [result] = await db
        .select({ agentId: agentsTerrain.id })
        .from(agentsTerrain)
        .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
        .where(eq(employes.userId, userId))
        .limit(1);

      if (!result) {
        return res.json({ data: null, message: "Aucun profil agent terrain pour cet utilisateur" });
      }

      const agent = await storage.getAgentTerrain(result.agentId);
      if (!agent) {
        return res.json({ data: null, message: "Agent terrain introuvable" });
      }

      res.json({ data: agent });
  });

  app.get("/api/agents-terrain/:id", requireAuth, async (req, res) => {
      const agent = await storage.getAgentTerrain(req.params.id);
      if (!agent) {
          return res.status(404).json({ error: "Agent non trouvé" });
      }
      res.json(agent);
  });

  app.get("/api/agents-terrain/:id/visites", requireAuth, async (req, res) => {
      const visites = await storage.getVisitesByAgent(req.params.id);
      res.json(visites);
  });

  app.get("/api/agents-terrain/:id/paiements", requireAuth, async (req, res) => {
      const paiements = await storage.getPaiementsByAgent(req.params.id);
      res.json(paiements);
  });

  // Prospections - Enhanced GET with filters and JOINs
  app.get("/api/prospections", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.PROSPECTION), async (req, res) => {
    try {
      const { page, perPage } = parsePagination(req.query);
      const {
        arrondissement_id, arrondissementId: arrIdQ,
        marche_id, marcheId: marcheIdQ,
        statut,
        agent_id, agentId: agentIdQ,
        date_from, dateFrom: dateFromQ,
        date_to, dateTo: dateToQ,
      } = req.query as Record<string, string>;

      const filterArrondissementId = arrondissement_id || arrIdQ;
      const filterMarcheId = marche_id || marcheIdQ;
      const filterAgentId = agent_id || agentIdQ;
      const filterDateFrom = date_from || dateFromQ;
      const filterDateTo = date_to || dateToQ;

      const conditions = [notDeleted(prospections)];

      if (filterArrondissementId) {
        conditions.push(eq(prospections.arrondissementId, filterArrondissementId));
      }
      if (filterMarcheId) {
        conditions.push(eq(prospections.marcheId, filterMarcheId));
      }
      if (statut && typeof statut === "string") {
        conditions.push(eq(prospections.statut, statut));
      }
      if (filterAgentId) {
        conditions.push(eq(prospections.agentId, filterAgentId));
      }
      if (filterDateFrom) {
        conditions.push(sql`${prospections.createdAt} >= ${filterDateFrom}`);
      }
      if (filterDateTo) {
        conditions.push(sql`${prospections.createdAt} <= ${filterDateTo}`);
      }

      const whereClause = and(...conditions);

      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(prospections)
        .where(whereClause);
      const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

      const data = await db
        .select({
          id: prospections.id,
          agentId: prospections.agentId,
          nomProspect: prospections.nomProspect,
          telephoneProspect: prospections.telephoneProspect,
          sexe: prospections.sexe,
          activitePrincipale: prospections.activitePrincipale,
          ancienneteActivite: prospections.ancienneteActivite,
          arrondissementId: prospections.arrondissementId,
          marcheId: prospections.marcheId,
          arrondissementNom: arrondissements.nom,
          marcheNom: marches.nom,
          statut: prospections.statut,
          observations: prospections.observations,
          photoUrl: prospections.photoUrl,

          lastActionAt: prospections.lastActionAt,
          createdAt: prospections.createdAt,
          updatedAt: prospections.updatedAt,
        })
        .from(prospections)
        .leftJoin(arrondissements, eq(prospections.arrondissementId, arrondissements.id))
        .leftJoin(marches, eq(prospections.marcheId, marches.id))
        .where(whereClause)
        .orderBy(desc(prospections.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage);

      res.json(
        paginateResponse(data as unknown[], total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
        })
      );
    } catch (error) {
      logger.error({ err: error }, "Error listing prospections");
      res.status(500).json({ message: "Erreur lors du chargement des prospections" });
    }
  });

  // Create prospection
  app.post("/api/prospections", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.PROSPECTION), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      // Capture tempEntityId before schema parsing (insertProspectionSchema strips unknown fields)
      const tempEntityId = (data as any).tempEntityId || (data as any).temp_entity_id;

      try {
        const parsed = insertProspectionSchema.parse(data);
        const prospection = await storage.createProspection(parsed);

        // Relocate files from temp UUID to real entity ID
        if (tempEntityId && tempEntityId !== prospection.id) {
          try {
            const keyMapping = await StorageService.relocateEntityFiles('prospection', tempEntityId, prospection.id);

            if (keyMapping.size > 0 && prospection.photoUrl && keyMapping.has(prospection.photoUrl)) {
              await db.update(prospections)
                .set({ photoUrl: keyMapping.get(prospection.photoUrl)! })
                .where(eq(prospections.id, prospection.id));
            }

            await StorageService.deleteEntityFiles('prospection', tempEntityId);
          } catch (relocateError) {
            logger.error({ err: relocateError, prospectionId: prospection.id }, 'File relocation failed for prospection');
          }
        }

        // Domain event: prospection created
        dispatchDomainEvent({
          type: "PROSPECTION_CREATED",
          data: {
            prospectionId: prospection.id,
            agentId: parsed.agentId,
            agentNom: req.session.user?.nom || undefined,
            userId: req.session.user?.id || undefined,
            nomProspect: parsed.nomProspect,
            telephone: parsed.telephoneProspect || undefined,
          },
          timestamp: new Date(),
        });

        // Notify
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'prospection_new', id: prospection.id } });
        }

        res.json(prospection);
      } catch (error) {
        // Cleanup temp files if creation failed
        if (tempEntityId) {
          StorageService.deleteEntityFiles('prospection', tempEntityId)
            .catch(err => logger.error({ err }, 'Cleanup temp files failed'));
        }
        logger.error({ err: error }, 'Create prospection error');
        res.status(500).json({ message: "Erreur lors de la création de la prospection" });
      }
  });

  // GET single prospection
  app.get("/api/prospections/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.PROSPECTION), async (req, res) => {
    try {
      const { id } = req.params;

      const [prospection] = await db
        .select({
          id: prospections.id,
          agentId: prospections.agentId,
          nomProspect: prospections.nomProspect,
          telephoneProspect: prospections.telephoneProspect,
          sexe: prospections.sexe,
          activitePrincipale: prospections.activitePrincipale,
          ancienneteActivite: prospections.ancienneteActivite,
          arrondissementId: prospections.arrondissementId,
          marcheId: prospections.marcheId,
          arrondissementNom: arrondissements.nom,
          marcheNom: marches.nom,
          statut: prospections.statut,
          observations: prospections.observations,
          photoUrl: prospections.photoUrl,

          lastActionAt: prospections.lastActionAt,
          createdAt: prospections.createdAt,
          updatedAt: prospections.updatedAt,
        })
        .from(prospections)
        .leftJoin(arrondissements, eq(prospections.arrondissementId, arrondissements.id))
        .leftJoin(marches, eq(prospections.marcheId, marches.id))
        .where(and(eq(prospections.id, id), notDeleted(prospections)));

      if (!prospection) {
        return res.status(404).json({ message: "Prospection non trouvée" });
      }

      res.json(prospection);
    } catch (error) {
      logger.error({ err: error }, "Error getting prospection");
      res.status(500).json({ message: "Erreur lors du chargement de la prospection" });
    }
  });

  // PATCH /api/prospections/:id - Update prospection with status transition validation
  app.patch("/api/prospections/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.PROSPECTION), async (req, res) => {
    try {
      const { id } = req.params;
      const data = normalizeKeysDeep(req.body);

      const existing = await storage.getProspection(id);
      if (!existing) {
        return res.status(404).json({ message: "Prospection non trouvée" });
      }

      // Validate status transition if status is being changed
      const newStatut = (data as any).statut;
      if (newStatut && newStatut !== existing.statut) {
        const currentStatut = existing.statut as StatutProspectionType;
        const allowedTransitions = PROSPECTION_STATUS_TRANSITIONS[currentStatut] || [];

        if (!allowedTransitions.includes(newStatut as StatutProspectionType)) {
          return res.status(400).json({
            message: `Transition de statut invalide: ${existing.statut} → ${newStatut}`,
            allowedTransitions,
          });
        }

        // Cannot transition directly to CONVERTED_TO_CLIENT — use /convert endpoint
        if (newStatut === StatutProspection.CONVERTED_TO_CLIENT) {
          return res.status(400).json({
            message: "Utilisez l'endpoint POST /api/prospections/:id/convert pour convertir un prospect en client",
          });
        }
      }

      const updatePayload: Record<string, any> = {};
      const allowedFields = [
        "nomProspect", "telephoneProspect", "sexe", "activitePrincipale",
        "ancienneteActivite", "arrondissementId", "marcheId",
        "observations", "photoUrl", "statut",
      ];

      for (const field of allowedFields) {
        if ((data as any)[field] !== undefined) {
          updatePayload[field] = (data as any)[field];
        }
      }

      updatePayload.lastActionAt = new Date();
      updatePayload.updatedAt = new Date();

      const updated = await storage.updateProspection(id, updatePayload);

      logAudit("UPDATE_PROSPECTION", {
        userId: req.session?.user?.id,
        entityType: "prospection",
        entityId: id,
        changes: updatePayload,
      });

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "OPERATIONS_UPDATE",
          payload: { type: "prospection_updated", id },
        });
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, "Error updating prospection");
      res.status(500).json({ message: "Erreur lors de la modification de la prospection" });
    }
  });

  // POST /api/prospections/:id/convert - Convert prospect to client
  app.post("/api/prospections/:id/convert", requireAuth, attachAbility, requireAbility(Actions.CONVERT, Subjects.PROSPECTION), async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.user?.id;

      const existing = await storage.getProspection(id);
      if (!existing) {
        return res.status(404).json({ message: "Prospection non trouvée" });
      }

      // Only INTERESTED or TO_FOLLOW_UP can be converted
      const convertibleStatuses = [StatutProspection.INTERESTED, StatutProspection.TO_FOLLOW_UP];
      if (!convertibleStatuses.includes(existing.statut as any)) {
        return res.status(400).json({
          message: `Impossible de convertir un prospect avec le statut "${existing.statut}". Statuts autorisés: ${convertibleStatuses.join(", ")}`,
        });
      }

      // Convert within a transaction
      const result = await db.transaction(async (tx) => {
        // 1. Create user record for the client
        const nameParts = existing.nomProspect.trim().split(/\s+/);
        const nom = nameParts.length > 1 ? nameParts[nameParts.length - 1] : existing.nomProspect;
        const prenom = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : undefined;

        const [newUser] = await tx.insert(users).values({
          username: existing.telephoneProspect || `prospect_${id.substring(0, 8)}`,
          password: "PENDING_SETUP",
          nom,
          prenom,
          telephone: existing.telephoneProspect,
          sexe: existing.sexe,
          typeCompte: "client",
          canLogin: false,
        }).returning();

        // 2. Create client with origin tracking
        const agenceId = req.session?.user?.agenceId;
        const [newClient] = await tx.insert(clients).values({
          userId: newUser.id,
          agence: agenceId || "Brazzaville",
          agenceId: agenceId || null,
          clientOrigin: ClientOrigin.FIELD_PROSPECTION,
          prospectId: id,
        } as any).returning();

        // 3. Update prospect status
        await tx
          .update(prospections)
          .set({
            statut: StatutProspection.CONVERTED_TO_CLIENT,
            lastActionAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(prospections.id, id));

        // 4. Auto-create prime if config is active
        const [primeConfig] = await tx
          .select()
          .from(prospectionPrimeConfig)
          .where(
            and(
              eq(prospectionPrimeConfig.actif, true),
              agenceId ? eq(prospectionPrimeConfig.agenceId, agenceId) : sql`true`
            )
          )
          .limit(1);

        let prime = null;
        if (primeConfig && existing.agentId) {
          const now = new Date();
          const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

          const [newPrime] = await tx.insert(prospectionPrimes).values({
            agentId: existing.agentId,
            agenceId: agenceId || primeConfig.agenceId,
            prospectionId: id,
            clientId: newClient.id,
            montant: primeConfig.montantFixe || "5000",
            typePrime: primeConfig.typePrime || "FIXED",
            periode,
            statut: "PENDING",
          }).returning();
          prime = newPrime;
        }

        return { client: newClient, user: newUser, prime };
      });

      // Domain event
      dispatchDomainEvent({
        type: "PROSPECT_CONVERTED",
        data: {
          prospectionId: id,
          clientId: result.client.id,
          agentId: existing.agentId,
          agentNom: req.session?.user?.nom || undefined,
          nomProspect: existing.nomProspect,
          userId,
        },
        timestamp: new Date(),
      });

      // WebSocket broadcast
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "OPERATIONS_UPDATE",
          payload: { type: "prospect_converted", prospectionId: id, clientId: result.client.id },
        });
      }

      logAudit("CONVERT_PROSPECT_TO_CLIENT", {
        userId,
        entityType: "prospection",
        entityId: id,
        changes: { clientId: result.client.id, primeCreated: !!result.prime },
      });

      res.status(201).json({
        client: result.client,
        prospection: { id, statut: StatutProspection.CONVERTED_TO_CLIENT },
        prime: result.prime,
      });
    } catch (error) {
      logger.error({ err: error }, "Error converting prospect to client");
      res.status(500).json({ message: "Erreur lors de la conversion du prospect en client" });
    }
  });

  // GET /api/agents/:agentId/prospection-stats - Agent prospection statistics
  app.get("/api/agents/:agentId/prospection-stats", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.PROSPECTION), async (req, res) => {
    try {
      const { agentId } = req.params;
      const { period, periode } = req.query as Record<string, string>;
      const filterPeriod = period || periode;

      // Count by status
      const statusCounts = await db
        .select({
          statut: prospections.statut,
          count: sql<number>`count(*)`,
        })
        .from(prospections)
        .where(
          and(
            eq(prospections.agentId, agentId),
            notDeleted(prospections),
            filterPeriod
              ? sql`to_char(${prospections.createdAt}, 'YYYY-MM') = ${filterPeriod}`
              : sql`true`
          )
        )
        .groupBy(prospections.statut);

      const byStatus: Record<string, number> = {};
      let totalProspects = 0;
      let convertedClients = 0;

      for (const row of statusCounts) {
        byStatus[row.statut] = Number(row.count);
        totalProspects += Number(row.count);
        if (row.statut === StatutProspection.CONVERTED_TO_CLIENT) {
          convertedClients = Number(row.count);
        }
      }

      const qualifiedProspects = (byStatus[StatutProspection.INTERESTED] || 0) +
        (byStatus[StatutProspection.TO_FOLLOW_UP] || 0) +
        convertedClients;

      const conversionRate = totalProspects > 0
        ? Math.round((convertedClients / totalProspects) * 10000) / 100
        : 0;

      // Count by arrondissement
      const byArrondissement = await db
        .select({
          arrondissementNom: arrondissements.nom,
          count: sql<number>`count(*)`,
        })
        .from(prospections)
        .leftJoin(arrondissements, eq(prospections.arrondissementId, arrondissements.id))
        .where(
          and(
            eq(prospections.agentId, agentId),
            notDeleted(prospections),
            filterPeriod
              ? sql`to_char(${prospections.createdAt}, 'YYYY-MM') = ${filterPeriod}`
              : sql`true`
          )
        )
        .groupBy(arrondissements.nom);

      // Count primes
      const [primesData] = await db
        .select({
          totalPrimes: sql<number>`count(*)`,
          totalAmount: sql<string>`coalesce(sum(${prospectionPrimes.montant}::numeric), 0)`,
        })
        .from(prospectionPrimes)
        .where(
          and(
            eq(prospectionPrimes.agentId, agentId),
            notDeleted(prospectionPrimes),
            filterPeriod ? eq(prospectionPrimes.periode, filterPeriod) : sql`true`
          )
        );

      res.json({
        prospectsCreated: totalProspects,
        qualifiedProspects,
        convertedClients,
        conversionRate,
        bonusAmount: Number(primesData?.totalAmount || 0),
        bonusCount: Number(primesData?.totalPrimes || 0),
        byStatus,
        byArrondissement: byArrondissement.map(r => ({
          arrondissement: r.arrondissementNom || "Non défini",
          count: Number(r.count),
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "Error getting prospection stats");
      res.status(500).json({ message: "Erreur lors du chargement des statistiques" });
    }
  });

  // GET /api/agents/:agentId/prospection-followups - Prospects needing follow-up
  app.get("/api/agents/:agentId/prospection-followups", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.PROSPECTION), async (req, res) => {
    try {
      const { agentId } = req.params;

      const followups = await db
        .select({
          id: prospections.id,
          nomProspect: prospections.nomProspect,
          telephoneProspect: prospections.telephoneProspect,
          statut: prospections.statut,
          arrondissementNom: arrondissements.nom,
          marcheNom: marches.nom,
          lastActionAt: prospections.lastActionAt,

        })
        .from(prospections)
        .leftJoin(arrondissements, eq(prospections.arrondissementId, arrondissements.id))
        .leftJoin(marches, eq(prospections.marcheId, marches.id))
        .where(
          and(
            eq(prospections.agentId, agentId),
            notDeleted(prospections),
            sql`${prospections.statut} IN (${StatutProspection.TO_FOLLOW_UP}, ${StatutProspection.INTERESTED}, ${StatutProspection.REGISTERED})`
          )
        )
        .orderBy(prospections.lastActionAt);

      res.json(followups);
    } catch (error) {
      logger.error({ err: error }, "Error getting followups");
      res.status(500).json({ message: "Erreur lors du chargement des relances" });
    }
  });

  // GET /api/supervision/prospection-performance - Performance by agent (supervision)
  app.get("/api/supervision/prospection-performance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.TERRAIN), async (req, res) => {
    try {
      const { agence_id, agenceId: agenceIdQ, period, periode } = req.query as Record<string, string>;
      const filterAgenceId = agence_id || agenceIdQ;
      const filterPeriod = period || periode;

      const agentStats = await db
        .select({
          agentId: prospections.agentId,
          totalProspects: sql<number>`count(*)`,
          converted: sql<number>`count(*) filter (where ${prospections.statut} = ${StatutProspection.CONVERTED_TO_CLIENT})`,
          interested: sql<number>`count(*) filter (where ${prospections.statut} = ${StatutProspection.INTERESTED})`,
          toFollowUp: sql<number>`count(*) filter (where ${prospections.statut} = ${StatutProspection.TO_FOLLOW_UP})`,
          refused: sql<number>`count(*) filter (where ${prospections.statut} = ${StatutProspection.REFUSED})`,
        })
        .from(prospections)
        .innerJoin(agentsTerrain, eq(prospections.agentId, agentsTerrain.id))
        .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
        .where(
          and(
            notDeleted(prospections),
            filterAgenceId ? eq(employes.agenceId, filterAgenceId) : sql`true`,
            filterPeriod
              ? sql`to_char(${prospections.createdAt}, 'YYYY-MM') = ${filterPeriod}`
              : sql`true`
          )
        )
        .groupBy(prospections.agentId);

      // Enrich with agent names (via employes → users)
      const enriched = await Promise.all(
        agentStats.map(async (stat) => {
          const [agent] = await db
            .select({
              agentId: agentsTerrain.id,
              nom: users.nom,
              prenom: users.prenom,
            })
            .from(agentsTerrain)
            .innerJoin(employes, eq(agentsTerrain.employeId, employes.id))
            .innerJoin(users, eq(employes.userId, users.id))
            .where(eq(agentsTerrain.id, stat.agentId))
            .limit(1);

          const total = Number(stat.totalProspects);
          const converted = Number(stat.converted);

          return {
            agentId: stat.agentId,
            agentNom: agent ? `${agent.prenom || ""} ${agent.nom || ""}`.trim() : "Inconnu",
            totalProspects: total,
            converted,
            interested: Number(stat.interested),
            toFollowUp: Number(stat.toFollowUp),
            refused: Number(stat.refused),
            conversionRate: total > 0 ? Math.round((converted / total) * 10000) / 100 : 0,
          };
        })
      );

      res.json(enriched);
    } catch (error) {
      logger.error({ err: error }, "Error getting prospection performance");
      res.status(500).json({ message: "Erreur lors du chargement des performances" });
    }
  });

  // Visites
  app.get("/api/visites-terrain", requireAuth, async (req, res) => {
      const { page, perPage } = parsePagination(req.query);
      const { data, total } = await storage.getVisitesTerrainPaginated(page, perPage);
      res.json(
        paginateResponse(data as unknown[], total, page, perPage, {
          path: `${req.baseUrl}${req.path}`,
          query: req.query,
        })
      );
  });
  

  // Create Paiement Terrain (roles: admin, chef, terrain, superviseur)
  // Now creates a PENDING payment that needs validation
  app.post("/api/paiements-terrain", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.OPERATION_TERRAIN), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;

        // Create PENDING payment
        // Storage function now handles creating "En attente" payment without immediate ledger impact
        const paiement = await storage.createPendingPaiementTerrain({
          agentId: data.agentId,
          clientId: data.clientId,
          creditId: data.creditId,
          compteId: data.compteId,
          visiteId: data.visiteId,
          montant: data.montant,
          typePaiement: data.typePaiement || 'Paiement Crédit',
          methodePaiement: data.methodePaiement || 'Espèces',
          numeroTelephone: data.numeroTelephone,
          numeroTransaction: data.numeroTransaction,
          reference: data.reference || `PAY-${Date.now()}`,
          notes: data.notes,
          latitude: data.latitude,
          longitude: data.longitude,
          idempotencyKey: data.idempotencyKey,
          presenceVerification: data.presenceVerification,
          tontineId: data.tontineId,
          membreId: data.membreId
        }, user?.id);
        
        // Notify admins/managers of new pending payment
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_pending', id: paiement.id } });
        }
        
        res.status(201).json(paiement);
      } catch (error: any) {
        logger.error({ err: error }, 'Error creating paiement terrain');
        res.status(400).json({ error: error.message || "Invalid data" });
      }
  });

  // Validate Paiement Terrain (roles: admin, chef, superviseur)
  app.post("/api/paiements-terrain/:id/validate", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.PAIEMENT_TERRAIN), async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.session.user;

      const { paiement, mouvement } = await storage.validatePaiementTerrain(id, user?.id || 'system');

      // Domain event: paiement terrain validated
      dispatchDomainEvent({
        type: "PAIEMENT_TERRAIN_VALIDATED",
        data: {
          paiementId: paiement.id,
          clientId: paiement.clientId || undefined,
          agentId: paiement.agentId || undefined,
          montant: paiement.montant,
          typePaiement: paiement.typePaiement || "Autre",
          methodePaiement: paiement.methodePaiement || "CASH",
          reference: paiement.referenceExterne || undefined,
          creditId: paiement.creditId || undefined,
          compteId: paiement.compteId || undefined,
        },
        timestamp: new Date(),
      });

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_validated', id: paiement.id } });

          if (paiement.clientId) {
            wsInstance.broadcast({ type: "CLIENT_UPDATE", payload: { clientId: paiement.clientId } });
         }
      }

      res.json({ ...paiement, mouvement_id: mouvement.id });
    } catch (error: any) {
      logger.error({ err: error }, 'Error validating paiement terrain');
      res.status(400).json({ error: error.message || "Error validating payment" });
    }
  });

  // Reject Paiement Terrain
  app.post("/api/paiements-terrain/:id/reject", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.PAIEMENT_TERRAIN), async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const paiement = await storage.rejectPaiementTerrain(id, reason || 'Rejeté par administrateur');

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'paiement_rejected', id: paiement.id } });
      }

      res.json(paiement);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Error rejecting payment" });
    }
  });

  // Paiements
  app.get("/api/paiements-terrain", requireAuth, async (req, res) => {
      try {
        const user = req.session.user;
        let agenceId: string | undefined;

        // For chef d'agence, automatically filter by their agency
        const normalizedRole = normalizeRole(user?.role);
        if (normalizedRole === SystemRole.CHEF_AGENCE) {
          agenceId = user?.agenceId || undefined;
          if (!agenceId && user?.id) {
            const employe = await storage.getEmployeByUserId(user.id);
            agenceId = employe?.agenceId || undefined;
          }
        } else if (normalizedRole === SystemRole.ADMIN) {
          // For admin, use query parameter (optional)
          agenceId = req.query.agenceId as string | undefined;
          if (agenceId === 'all') agenceId = undefined;
        }

        const { page, perPage } = parsePagination(req.query);
        const { data, total } = await storage.getPendingPaiementsByAgencePaginated(agenceId, page, perPage);
        res.json(
          paginateResponse(data as unknown[], total, page, perPage, {
            path: `${req.baseUrl}${req.path}`,
            query: req.query,
            filters: agenceId ? { agenceId } : {},
          })
        );
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching paiements terrain');
        res.status(500).json({ error: 'Failed to fetch payments' });
      }
  });

  // POS Devices
  app.get("/api/pos-devices", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.TERRAIN), async (req, res) => {
      try {
        const user = req.session.user;
        const normalizedRole = normalizeRole(user?.role);
        const queryAgenceId = req.query.agenceId as string | undefined;

        const agenceId = normalizedRole === SystemRole.ADMIN ? queryAgenceId : user?.agenceId || queryAgenceId;
        const assignedTo = req.query.assignedTo as string | undefined;

        const { page, perPage } = parsePagination(req.query);
        const { data, total } = await storage.getPosDevicesPaginated({ agenceId, assignedTo }, page, perPage);

        res.json(
          paginateResponse(data as unknown[], total, page, perPage, {
            path: `${req.baseUrl}${req.path}`,
            query: req.query,
            filters: {
              ...(agenceId ? { agenceId } : {}),
              ...(assignedTo ? { assignedTo } : {}),
            },
          })
        );
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching POS devices');
        res.status(500).json({ error: 'Failed to fetch POS devices' });
      }
  });

  // Zones
  app.get("/api/zones", requireAuth, async (req, res) => {
    const list = await storage.getAllZones();
    res.json(list);
  });

  // Create zone (roles: admin, chef)
  app.post("/api/zones", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.TERRAIN), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const parsed = insertZoneSchema.parse(data);
    const zone = await storage.createZone(parsed);

    // Notify
    const wsInstance = require("../ws-server").getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'zone_new', id: zone.id } });
    }

    res.json(zone);
  });

  // Objectifs Mensuels
  app.get("/api/objectifs-mensuels/:agentId", requireAuth, async (req, res) => {
    const { agentId } = req.params;
    const { annee } = req.query;
    const objectifs = await storage.getObjectifsMensuelsByAgent(agentId, annee ? Number(annee) : undefined);
    res.json(objectifs);
  });

  app.get("/api/objectifs-mensuels/:agentId/current", requireAuth, async (req, res) => {
    const objectif = await storage.getCurrentObjectifMensuel(req.params.agentId);
    if (!objectif) {
      // Return fallback to agent's default objectifMensuel
      const agent = await storage.getAgentTerrain(req.params.agentId);
      return res.json({ montant: agent?.objectifMensuel || "0", isDefault: true });
    }
    res.json(objectif);
  });

  // Create/update objectif mensuel (roles: admin, chef, superviseur)
  app.post("/api/objectifs-mensuels", requireAuth, attachAbility, requireAbility(Actions.APPROVE, Subjects.PAIEMENT_TERRAIN), async (req, res) => {
    const data = normalizeKeysDeep(req.body);
    const parsed = insertObjectifMensuelSchema.parse(data);
    const objectif = await storage.createOrUpdateObjectifMensuel(parsed);

    // Notify
    const wsInstance = require("../ws-server").getWsInstance();
    if (wsInstance) {
        wsInstance.broadcast({ type: "OPERATIONS_UPDATE", payload: { type: 'objectif_update', agentId: parsed.agentId } });
    }

    res.json(objectif);
  });
}
