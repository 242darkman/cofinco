import type { Express } from "express";
import { insertContributionTontineSchema, tontines, membresTontine, contributionsTontine } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";

const logger = createLogger('Routes:TontinesContributions');

export function registerTontineContributionsRoutes(app: Express) {
  app.get("/api/tontines/:id/contributions", requireAuth, async (req, res) => {
    try {
      const contribs = await storage.getContributionsByTontine(req.params.id);
      res.json(contribs);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement contributions');
      res.status(500).json({ message: error.message || "Erreur chargement contributions" });
    }
  });

  // Create contribution tontine (roles: admin, chef, caisse, superviseur)
  app.post("/api/contributions-tontine", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE_CONTRIBUTION), async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = insertContributionTontineSchema.parse(data);

        // Validate tontine statut
        const tontine = await storage.getTontine(parsed.tontineId);
        if (!tontine) return res.status(404).json({ message: "Tontine introuvable" });
        if (['COMPLETED', 'CANCELLED'].includes(tontine.statut)) {
          return res.status(400).json({ message: "Impossible d'enregistrer une cotisation sur une tontine terminée ou annulée." });
        }

        let sessionCaisseId = undefined;

        // If Cash, we need an active session
        const isCash = parsed.methodePaiement === 'CASH';
        if (isCash) {
            const activeSession = await storage.getActiveSessionForUser(req.session.user!.id);
            if (!activeSession) {
                return res.status(400).json({ message: "Vous devez avoir une caisse ouverte pour encaisser des espèces." });
            }
            sessionCaisseId = activeSession.id;
        }
        // Mobile Money contributions don't require a caisse session

        const contrib = await storage.createContributionTontineWithLedger(parsed, sessionCaisseId, req.session.user!.id);

        // Notify
        const wsInstance = getWsInstance();
        if (wsInstance) {
            wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'contribution_new', tontineId: parsed.tontineId } });
            // Refresh Dashboard as cash balance changed
            if (sessionCaisseId) {
                 wsInstance.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
            }
        }

        // Domain event: contribution received + scoring
        if (parsed.clientId) {
          const tontineInfo = await storage.getTontine(parsed.tontineId);
          dispatchDomainEvent({
            type: "TONTINE_CONTRIBUTION_RECEIVED",
            data: {
              tontineId: parsed.tontineId,
              tontineName: tontineInfo?.nom || 'Tontine',
              clientId: parsed.clientId,
              montant: Number(parsed.montant || 0),
              tourNumero: parsed.tourNumero ?? undefined,
              reference: (contrib as any)?.reference,
              agenceId: tontineInfo?.agenceId ?? undefined,
            },
            timestamp: new Date(),
          });

          // Score event: tontine contribution
          try {
            const { recordScoreEvent } = await import('../../services/scoring-engine');
            await recordScoreEvent({
              clientId: parsed.clientId,
              agenceId: tontineInfo?.agenceId ?? undefined,
              eventType: 'TONTINE_CONTRIBUTION',
              refId: (contrib as any)?.id || (contrib as any)?.reference || `tontine-${parsed.tontineId}-${Date.now()}`,
              refType: 'contribution_tontine',
              montant: Number(parsed.montant || 0),
              metadata: { tontineId: parsed.tontineId, tontineName: tontineInfo?.nom },
              createdBy: req.session.user!.id,
            });
          } catch (err) {
            logger.error({ err }, 'Scoring event error (tontine contribution)');
          }
        }

        res.json(contrib);
      } catch (e: any) {
        logger.error({ err: e }, 'Erreur contribution tontine');
        res.status(400).json({ message: e.message || "Erreur lors de l'enregistrement de la contribution" });
      }
  });

  // Get tontines for a specific client (their memberships)
}
