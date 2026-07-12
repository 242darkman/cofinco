import type { Express } from "express";
import { createLogger } from "../../lib/logger";
import { logAudit } from "../../lib/logger";
import {
  prospectionPrimes,
  type ProspectionPrime,
} from "@shared/schema";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep, parsePagination, paginateResponse } from "../utils";
import { db } from "../../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getWsInstance } from "../../ws-server";
import { notDeleted } from "../../storage/query-helpers";

const logger = createLogger("Routes:ProspectionPrimes");

export function registerProspectionPrimesRoutes(app: Express) {
  /**
   * GET /api/prospection-primes
   * Liste des primes de prospection avec filtres et pagination
   */
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
        logger.error({ err: error }, "Erreur lors du chargement des primes de prospection");
        res.status(500).json({ message: "Erreur lors du chargement des primes" });
      }
    }
  );

  /**
   * GET /api/prospection-primes/:id
   * Obtenir une prime spécifique
   */
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
        logger.error({ err: error }, "Erreur lors du chargement de la prime de prospection");
        res.status(500).json({ message: "Erreur lors du chargement de la prime" });
      }
    }
  );

  /**
   * POST /api/prospection-primes/:id/approve
   * Approuver une prime
   */
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
        logger.error({ err: error }, "Erreur lors de l'approbation de la prime de prospection");
        res.status(500).json({ message: "Erreur lors de l'approbation de la prime" });
      }
    }
  );

  /**
   * POST /api/prospection-primes/:id/reject
   * Rejeter une prime
   */
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
        logger.error({ err: error }, "Erreur lors du rejet de la prime de prospection");
        res.status(500).json({ message: "Erreur lors du rejet de la prime" });
      }
    }
  );

  /**
   * POST /api/prospection-primes/:id/pay
   * Payer une prime (déclenche une écriture GL en Phase 4)
   */
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
          return res.status(400).json({ message: "Agence non identifiée pour l'écriture comptable (GL)" });
        }

        // Intégration RH et comptable dans une transaction
        const { payProspectionPrime } = await import("../../services/prospection-prime-service");
        const result = await db.transaction(async (tx) => {
          return payProspectionPrime(tx, prime, agenceId, userId!);
        });

        // Rechargement de la prime mise à jour
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
        logger.error({ err: error }, "Erreur lors du paiement de la prime de prospection");
        res.status(500).json({ message: "Erreur lors du paiement de la prime" });
      }
    }
  );
}
