import type { Express } from "express";
import { createLogger } from "../lib/logger";
import { logAudit } from "../lib/logger";
import {
  prospectionPrimes,
  prospectionPrimeConfig,
  insertProspectionPrimeConfigSchema,
  type ProspectionPrime,
} from "@shared/schema";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep, parsePagination, paginateResponse } from "./utils";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getWsInstance } from "../ws-server";
import { notDeleted } from "../storage/query-helpers";

const logger = createLogger("ProspectionPrimes");

export function registerProspectionPrimesRoutes(app: Express) {
  // ============================================================
  // PROSPECTION PRIMES
  // ============================================================

  // GET /api/prospection-primes - List primes with filters
  app.get(
    "/api/prospection-primes",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.PROSPECTION_PRIME),
    async (req, res) => {
      try {
        const { page, perPage } = parsePagination(req.query);
        const {
          agent_id, agentId: agentIdQ,
          periode,
          statut,
          agence_id, agenceId: agenceIdQ,
        } = req.query as Record<string, string>;

        const filterAgentId = agent_id || agentIdQ;
        const filterAgenceId = agence_id || agenceIdQ;

        const conditions = [notDeleted(prospectionPrimes)];

        if (filterAgentId) {
          conditions.push(eq(prospectionPrimes.agentId, filterAgentId));
        }
        if (filterAgenceId) {
          conditions.push(eq(prospectionPrimes.agenceId, filterAgenceId));
        }
        if (periode && typeof periode === "string") {
          conditions.push(eq(prospectionPrimes.periode, periode));
        }
        if (statut && typeof statut === "string") {
          conditions.push(eq(prospectionPrimes.statut, statut));
        }

        const whereClause = and(...conditions);

        const totalResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(prospectionPrimes)
          .where(whereClause);
        const total = totalResult[0]?.count ? Number(totalResult[0].count) : 0;

        const data = await db
          .select()
          .from(prospectionPrimes)
          .where(whereClause)
          .orderBy(desc(prospectionPrimes.createdAt))
          .limit(perPage)
          .offset((page - 1) * perPage);

        res.json(
          paginateResponse(data as unknown[], total, page, perPage, {
            path: `${req.baseUrl}${req.path}`,
            query: req.query,
          })
        );
      } catch (error) {
        logger.error({ err: error }, "Error listing prospection primes");
        res.status(500).json({ message: "Erreur lors du chargement des primes" });
      }
    }
  );

  // GET /api/prospection-primes/:id - Get single prime
  app.get(
    "/api/prospection-primes/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.PROSPECTION_PRIME),
    async (req, res) => {
      try {
        const { id } = req.params;

        const [prime] = await db
          .select()
          .from(prospectionPrimes)
          .where(and(eq(prospectionPrimes.id, id), notDeleted(prospectionPrimes)));

        if (!prime) {
          return res.status(404).json({ message: "Prime non trouvée" });
        }

        res.json(prime);
      } catch (error) {
        logger.error({ err: error }, "Error getting prospection prime");
        res.status(500).json({ message: "Erreur lors du chargement de la prime" });
      }
    }
  );

  // POST /api/prospection-primes/:id/approve - Approve a prime
  app.post(
    "/api/prospection-primes/:id/approve",
    requireAuth,
    attachAbility,
    requireAbility(Actions.APPROVE, Subjects.PROSPECTION_PRIME),
    async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.session?.user?.id;

        const [prime] = await db
          .select()
          .from(prospectionPrimes)
          .where(and(eq(prospectionPrimes.id, id), notDeleted(prospectionPrimes)));

        if (!prime) {
          return res.status(404).json({ message: "Prime non trouvée" });
        }

        if (prime.statut !== "PENDING") {
          return res.status(400).json({
            message: `Impossible d'approuver une prime avec le statut ${prime.statut}`,
          });
        }

        const [updated] = await db
          .update(prospectionPrimes)
          .set({
            statut: "APPROVED",
            approvedBy: userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(prospectionPrimes.id, id))
          .returning();

        logAudit("APPROVE_PROSPECTION_PRIME", {
          userId,
          entityType: "prospection_prime",
          entityId: id,
          changes: { statut: "APPROVED" },
        });

        const ws = getWsInstance();
        if (ws) {
          ws.broadcast({
            type: "OPERATIONS_UPDATE",
            payload: { type: "prospection_prime_approved", id },
          });
        }

        res.json(updated);
      } catch (error) {
        logger.error({ err: error }, "Error approving prospection prime");
        res.status(500).json({ message: "Erreur lors de l'approbation de la prime" });
      }
    }
  );

  // POST /api/prospection-primes/:id/reject - Reject a prime
  app.post(
    "/api/prospection-primes/:id/reject",
    requireAuth,
    attachAbility,
    requireAbility(Actions.REJECT, Subjects.PROSPECTION_PRIME),
    async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.session?.user?.id;
        const data = normalizeKeysDeep(req.body) as Record<string, any>;
        const rejectionReason = data.rejectionReason || data.motif || "";

        const [prime] = await db
          .select()
          .from(prospectionPrimes)
          .where(and(eq(prospectionPrimes.id, id), notDeleted(prospectionPrimes)));

        if (!prime) {
          return res.status(404).json({ message: "Prime non trouvée" });
        }

        if (prime.statut !== "PENDING") {
          return res.status(400).json({
            message: `Impossible de rejeter une prime avec le statut ${prime.statut}`,
          });
        }

        const [updated] = await db
          .update(prospectionPrimes)
          .set({
            statut: "REJECTED",
            rejectedBy: userId,
            rejectedAt: new Date(),
            rejectionReason,
            updatedAt: new Date(),
          })
          .where(eq(prospectionPrimes.id, id))
          .returning();

        logAudit("REJECT_PROSPECTION_PRIME", {
          userId,
          entityType: "prospection_prime",
          entityId: id,
          changes: { statut: "REJECTED", rejectionReason },
        });

        const ws = getWsInstance();
        if (ws) {
          ws.broadcast({
            type: "OPERATIONS_UPDATE",
            payload: { type: "prospection_prime_rejected", id },
          });
        }

        res.json(updated);
      } catch (error) {
        logger.error({ err: error }, "Error rejecting prospection prime");
        res.status(500).json({ message: "Erreur lors du rejet de la prime" });
      }
    }
  );

  // POST /api/prospection-primes/:id/pay - Pay a prime (triggers GL in Phase 4)
  app.post(
    "/api/prospection-primes/:id/pay",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VALIDATE, Subjects.PROSPECTION_PRIME),
    async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.session?.user?.id;

        const [prime] = await db
          .select()
          .from(prospectionPrimes)
          .where(and(eq(prospectionPrimes.id, id), notDeleted(prospectionPrimes)));

        if (!prime) {
          return res.status(404).json({ message: "Prime non trouvée" });
        }

        if (prime.statut !== "APPROVED") {
          return res.status(400).json({
            message: `Impossible de payer une prime avec le statut ${prime.statut}. La prime doit être approuvée.`,
          });
        }

        const agenceId = prime.agenceId || req.session?.user?.agenceId;
        if (!agenceId) {
          return res.status(400).json({ message: "Agence non identifiée pour le posting GL" });
        }

        // GL posting + HR integration within a transaction
        const { payProspectionPrime } = await import("../services/prospection-prime-service");
        const result = await db.transaction(async (tx) => {
          return payProspectionPrime(tx, prime, agenceId, userId!);
        });

        // Reload updated prime
        const [updated] = await db
          .select()
          .from(prospectionPrimes)
          .where(eq(prospectionPrimes.id, id));

        logAudit("PAY_PROSPECTION_PRIME", {
          userId,
          entityType: "prospection_prime",
          entityId: id,
          changes: {
            statut: "PAID",
            montant: prime.montant,
            mouvementId: result.mouvementId,
            glPostingStatus: result.glPostingStatus,
            avantageEmployeId: result.avantageEmployeId,
          },
        });

        const ws = getWsInstance();
        if (ws) {
          ws.broadcast({
            type: "OPERATIONS_UPDATE",
            payload: { type: "prospection_prime_paid", id },
          });
        }

        res.json(updated);
      } catch (error) {
        logger.error({ err: error }, "Error paying prospection prime");
        res.status(500).json({ message: "Erreur lors du paiement de la prime" });
      }
    }
  );

  // ============================================================
  // PROSPECTION PRIME CONFIG
  // ============================================================

  // GET /api/prospection-prime-config - Get config (optionally by agenceId)
  app.get(
    "/api/prospection-prime-config",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.PROSPECTION_CONFIG),
    async (req, res) => {
      try {
        const { agence_id, agenceId: agenceIdQ } = req.query as Record<string, string>;
        const filterAgenceId = agence_id || agenceIdQ;

        const conditions = [];
        if (filterAgenceId) {
          conditions.push(eq(prospectionPrimeConfig.agenceId, filterAgenceId));
        }

        const configs = await db
          .select()
          .from(prospectionPrimeConfig)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(prospectionPrimeConfig.createdAt));

        res.json(configs);
      } catch (error) {
        logger.error({ err: error }, "Error getting prospection prime config");
        res.status(500).json({ message: "Erreur lors du chargement de la configuration" });
      }
    }
  );

  // PATCH /api/prospection-prime-config/:id - Update config
  app.patch(
    "/api/prospection-prime-config/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.PROSPECTION_CONFIG),
    async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as Record<string, any>;

        const [existing] = await db
          .select()
          .from(prospectionPrimeConfig)
          .where(eq(prospectionPrimeConfig.id, id));

        if (!existing) {
          return res.status(404).json({ message: "Configuration non trouvée" });
        }

        const updates: Record<string, any> = {};
        if (typeof data.nom === "string") updates.nom = data.nom;
        if (typeof data.typePrime === "string") updates.typePrime = data.typePrime;
        if (data.montantFixe !== undefined) updates.montantFixe = data.montantFixe === "" ? null : String(data.montantFixe);
        if (data.tauxVariable !== undefined) updates.tauxVariable = data.tauxVariable === "" ? null : String(data.tauxVariable);
        if (typeof data.requireFirstCredit === "boolean") updates.requireFirstCredit = data.requireFirstCredit;
        if (data.requireMinRevenu !== undefined) updates.requireMinRevenu = data.requireMinRevenu === "" ? null : String(data.requireMinRevenu);
        if (typeof data.actif === "boolean") updates.actif = data.actif;
        if (typeof data.effectiveFrom === "string") updates.effectiveFrom = new Date(data.effectiveFrom);
        if (typeof data.effectiveTo === "string") updates.effectiveTo = new Date(data.effectiveTo);
        updates.updatedAt = new Date();

        const [row] = await db
          .update(prospectionPrimeConfig)
          .set(updates)
          .where(eq(prospectionPrimeConfig.id, id))
          .returning();

        logAudit("UPDATE_PROSPECTION_PRIME_CONFIG", {
          userId: req.session?.user?.id,
          entityType: "prospection_prime_config",
          entityId: id,
          changes: updates,
        });

        res.json(row);
      } catch (error) {
        logger.error({ err: error }, "Error updating prospection prime config");
        res.status(500).json({ message: "Erreur lors de la modification de la configuration" });
      }
    }
  );

  // POST /api/prospection-prime-config - Create config
  app.post(
    "/api/prospection-prime-config",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.PROSPECTION_CONFIG),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as Record<string, any>;
        // Sanitize empty strings for numeric fields → null
        if (data.tauxVariable === "" || data.tauxVariable === undefined) data.tauxVariable = null;
        if (data.requireMinRevenu === "" || data.requireMinRevenu === undefined) data.requireMinRevenu = null;
        if (data.montantFixe === "") data.montantFixe = null;
        const parsed = insertProspectionPrimeConfigSchema.parse({
          ...data,
          createdBy: req.session?.user?.id,
        });

        const [row] = await db
          .insert(prospectionPrimeConfig)
          .values(parsed)
          .returning();

        logAudit("CREATE_PROSPECTION_PRIME_CONFIG", {
          userId: req.session?.user?.id,
          entityType: "prospection_prime_config",
          entityId: row.id,
          changes: parsed as Record<string, any>,
        });

        res.status(201).json(row);
      } catch (error) {
        logger.error({ err: error }, "Error creating prospection prime config");
        res.status(500).json({ message: "Erreur lors de la création de la configuration" });
      }
    }
  );
}
