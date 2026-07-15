import type { Express, Request, Response } from "express";
import { insertTontinePenaliteSchema, tontines, tontinePenalites } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { z } from "zod";
import { executeWithLedger, updateTontineSolde, updateSessionSolde } from "../../services/ledger";

const logger = createLogger('Routes:TontinesPenalites');

export function registerTontinePenalitesRoutes(app: Express) {
  app.get("/api/tontines/:id/penalites", requireAuth, async (req, res) => {
    try {
      const penalites = await storage.getTontinePenalites(req.params.id);
      res.json(penalites);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement penalites');
      res.status(500).json({ message: error.message || "Erreur chargement penalites" });
    }
  });

  // Create penalty manually (B1)
  app.post("/api/tontines/:id/penalites", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE), async (req: Request, res: Response) => {
    try {
      const data = normalizeKeysDeep(req.body) as Record<string, unknown>;
      const parsed = insertTontinePenaliteSchema.parse({
        ...data,
        tontineId: req.params.id,
        autoApplied: false,
      });
      const penalite = await storage.createTontinePenalite(parsed);

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'penalite_created', tontineId: req.params.id } });
      }

      res.json(penalite);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Erreur de validation", errors: error.errors });
      }
      logger.error({ err: error }, 'Erreur création pénalité manuelle');
      res.status(400).json({ message: error.message || "Erreur lors de la création de la pénalité" });
    }
  });

  app.patch("/api/tontine-penalites/:id", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const parsed = insertTontinePenaliteSchema.partial().parse(data);
      const updated = await storage.updateTontinePenalite(req.params.id, parsed);

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'penalite_updated', id: req.params.id } });
      }

      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Erreur de validation", errors: error.errors });
      }
      logger.error({ err: error }, 'Erreur mise à jour pénalité');
      res.status(400).json({ message: error.message || "Erreur lors de la mise à jour" });
    }
  });

  /**
   * GAP #4 FIX: Pay a tontine penalty through the ledger.
   * Creates a mouvement financier, posts to GL, and emits WS events.
   */
  app.post("/api/tontines/:tontineId/penalites/:penaliteId/pay", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const { tontineId, penaliteId } = req.params;
      const userId = req.session.user?.id;
      const { sessionCaisseId, methodePaiement = "CASH" } = req.body;

      // 1. Load penalty
      const [penalite] = await db
        .select()
        .from(tontinePenalites)
        .where(eq(tontinePenalites.id, penaliteId));

      if (!penalite) {
        return res.status(404).json({ message: "Pénalité introuvable" });
      }

      if (penalite.statut === "PAID" || penalite.statut === "paye") {
        return res.status(409).json({ message: "Pénalité déjà payée" });
      }

      if (penalite.statut === "WAIVED" || penalite.statut === "CANCELLED") {
        return res.status(409).json({ message: "Pénalité annulée ou exonérée" });
      }

      // 2. Load tontine for agenceId
      const [tontine] = await db
        .select()
        .from(tontines)
        .where(eq(tontines.id, tontineId));

      if (!tontine) {
        return res.status(404).json({ message: "Tontine introuvable" });
      }

      // 3. Load member for clientId
      const membre = await storage.getMembreTontineById(penalite.membreId);

      if (!membre) {
        return res.status(404).json({ message: "Membre introuvable" });
      }

      const montant = Number(penalite.montant);

      // 4. Execute through ledger
      const { result, mouvement } = await executeWithLedger(
        "TONTINE",
        {
          montant: montant.toString(),
          sens: "CREDIT",
          clientId: membre.clientId,
          tontineId,
          sessionCaisseId: methodePaiement === "CASH" ? sessionCaisseId : undefined,
          typePaiement: "TONTINE_PENALTY",
          methodePaiement,
          agenceId: tontine.agenceId ?? undefined,
          idempotencyKey: `PENALTY-PAY-${penaliteId}`,
          metadata: {
            description: `Paiement pénalité tontine "${tontine.nom}"`,
            penaliteId,
            penaltyType: penalite.penaltyType,
          },
        },
        async (tx, mouvement) => {
          // a. Update penalty status
          await tx
            .update(tontinePenalites)
            .set({
              statut: "PAID",
              datePaiement: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(tontinePenalites.id, penaliteId));

          // b. Update tontine solde (penalty goes to pot)
          const nouveauSoldeTontine = await updateTontineSolde(tx, tontineId, montant);

          // c. Update session caisse solde if cash payment
          let nouveauSoldeSession: string | undefined;
          if (methodePaiement === "CASH" && sessionCaisseId) {
            nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, montant);
          }

          return {
            result: { penaliteId, montant, tontineId },
            additionalEventData: {
              nouveauSoldeTontine,
              nouveauSoldeSession,
            },
          };
        },
        userId
      );

      // 5. Score event — partial rehabilitation for paying off penalty
      try {
        const { recordScoreEvent } = await import('../../services/scoring-engine');
        await recordScoreEvent({
          clientId: membre.clientId,
          agenceId: tontine.agenceId ?? undefined,
          eventType: 'TONTINE_CONTRIBUTION',
          refId: `penalite-paid-${penaliteId}`,
          refType: 'tontine_penalite',
          montant,
          createdBy: userId,
        });
      } catch (scoreErr) {
        logger.error({ err: scoreErr, penaliteId }, 'Failed to record penalty payment score event');
      }

      // 6. WS notifications
      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "penalite_paid", penaliteId, tontineId, montant },
        });
      }

      res.json({
        success: true,
        penaliteId,
        mouvementId: mouvement.id,
        montant,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur paiement pénalité";
      logger.error({ message }, 'TontinePenalitePay error');

      if (message.includes("Duplicate idempotency")) {
        return res.status(409).json({ message: "Pénalité déjà payée (idempotency)" });
      }

      res.status(500).json({ message });
    }
  });

  /**
   * GAP #6 FIX: Reconciliation endpoint.
   * Compares tontines.solde vs SUM(contributions) - SUM(distributions).
   */
}
