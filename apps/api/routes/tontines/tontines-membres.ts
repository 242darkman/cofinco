import type { Express, Request, Response } from "express";
import { insertMembreTontineSchema, tontines, clients, membresTontine } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { normalizeKeysDeep } from "../utils";
import { getWsInstance } from "../../ws-server";
import { db } from "../../db";
import { eq, sql } from "drizzle-orm";
import { createLogger } from "../../lib/logger";
import { validateMemberKycAndSegment } from "./tontines-utils";
import tontineLifecycleService from "../../services/tontine-lifecycle-service";
import { dispatchDomainEvent } from "../../services/notifications/domain-events/event-registry";
import { executeWithLedger, updateSessionSolde, updateTontineSolde } from "../../services/ledger";

const logger = createLogger('Routes:TontinesMembres');

export function registerTontineMembresRoutes(app: Express) {
  app.get("/api/tontines/:id/membres", requireAuth, async (req, res) => {
    try {
      const membres = await storage.getMembresTontine(req.params.id);
      res.json(membres);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement membres tontine');
      res.status(500).json({ message: error.message || "Erreur chargement membres" });
    }
  });

  // Add membre to tontine (roles: admin, chef, superviseur)
  app.post("/api/tontines/:id/membres", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE_MEMBRE), async (req, res) => {
      const data = normalizeKeysDeep(req.body);
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });
      if (['COMPLETED', 'CANCELLED'].includes(tontine.statut)) {
          return res.status(400).json({ message: "Impossible d'ajouter un membre à une tontine terminée ou annulée." });
      }

      const currentMembres = await storage.getMembresTontine(req.params.id);
      if (currentMembres.length >= tontine.nombreMembres) {
          return res.status(400).json({ message: "Le nombre maximum de membres pour cette tontine est atteint." });
      }

      const parsed = insertMembreTontineSchema.parse(Object.assign({}, data, { tontineId: req.params.id }));

      // B11: Validate KYC level and segment before adding member
      if (parsed.clientId) {
        await validateMemberKycAndSegment(req.params.id, parsed.clientId);
      }

      // Set joinFeePaid based on tontine config
      if (tontine.joinFeeEnabled) {
        (parsed as any).joinFeePaid = false;
      } else {
        (parsed as any).joinFeePaid = true;
      }
      const membre = await storage.createMembreTontine(parsed);

      // Increment member count
      await storage.updateTontine(req.params.id, {
        membresActuels: sql`COALESCE(${tontines.membresActuels}, 0) + 1`,
      } as any);

      // Notify
      const wsInstance = getWsInstance();
      if (wsInstance) {
          wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'membre_added', tontineId: req.params.id } });
      }

      // Domain event: member joined tontine
      if (membre.clientId) {
        dispatchDomainEvent({
          type: "TONTINE_MEMBER_JOINED",
          data: {
            tontineId: tontine.id,
            tontineName: tontine.nom,
            clientId: membre.clientId,
            montantCotisation: Number(tontine.montantCotisation || 0),
            frequence: tontine.frequence || 'Mensuelle',
            position: membre.position ?? undefined,
            agenceId: tontine.agenceId ?? undefined,
          },
          timestamp: new Date(),
        });
      }

      res.json(membre);
  });

  // Remove membre from tontine
  app.delete("/api/tontines/:id/membres/:membreId", requireAuth, attachAbility, requireAbility(Actions.DELETE, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const success = await storage.updateMembreTontine(req.params.membreId, { statut: 'Retiré', deletedAt: new Date() } as any);

      // Decrement member count
      await storage.updateTontine(req.params.id, {
        membresActuels: sql`GREATEST(0, COALESCE(${tontines.membresActuels}, 0) - 1)`,
      } as any);

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: 'membre_removed', tontineId: req.params.id, membreId: req.params.membreId } });
      }

      res.json({ success: !!success });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur suppression membre tontine');
      res.status(500).json({ message: error.message || "Erreur suppression membre" });
    }
  });

  // Update membre tontine (cotisation auto etc)
  app.patch("/api/tontines/:id/membres/:membreId", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const data = normalizeKeysDeep(req.body);
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine not found" });

      const updated = await storage.updateMembreTontine(req.params.membreId, data as any);
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "membre_updated", tontineId: req.params.id, membreId: req.params.membreId } });
      res.json(updated);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur mise à jour membre tontine');
      res.status(400).json({ message: error.message || "Erreur lors de la mise à jour du membre" });
    }
  });

  // Pay join fee for a member
  app.post("/api/tontines/:id/membres/:membreId/pay-join-fee", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req: Request, res: Response) => {
    try {
      const tontine = await storage.getTontine(req.params.id);
      if (!tontine) return res.status(404).json({ message: "Tontine introuvable" });

      if (!tontine.joinFeeEnabled) {
        return res.status(400).json({ message: "Les frais d'adhésion ne sont pas activés" });
      }

      const membre = await storage.getMembreTontineById(req.params.membreId);
      if (!membre) return res.status(404).json({ message: "Membre introuvable" });
      if (membre.joinFeePaid) return res.status(409).json({ message: "Frais d'adhésion déjà payés" });

      const montant = Number(tontine.joinFeeAmount || 0);
      if (montant <= 0) {
        // No fee to pay, just mark as paid
        await storage.updateMembreTontine(req.params.membreId, { joinFeePaid: true } as any);
        return res.json({ success: true, montant: 0 });
      }

      const userId = req.session.user?.id;
      const agenceId = tontine.agenceId;
      const { sessionCaisseId, methodePaiement = "CASH" } = req.body;

      const { mouvement } = await executeWithLedger(
        "TONTINE",
        {
          montant: montant.toString(),
          sens: "CREDIT",
          clientId: membre.clientId,
          tontineId: tontine.id,
          sessionCaisseId: methodePaiement === "CASH" ? sessionCaisseId : undefined,
          typePaiement: "TONTINE_JOIN_FEE",
          methodePaiement,
          agenceId: agenceId ?? undefined,
          idempotencyKey: `JOINFEE-${req.params.membreId}`,
          metadata: { description: `Frais d'adhésion tontine "${tontine.nom}"` },
        },
        async (tx, mouvement) => {
          // Mark fee as paid
          await tx.update(membresTontine)
            .set({ joinFeePaid: true, updatedAt: new Date() })
            .where(eq(membresTontine.id, req.params.membreId));

          // Credit tontine balance
          await updateTontineSolde(tx, tontine.id, montant);

          // Credit session caisse if cash
          if (methodePaiement === "CASH" && sessionCaisseId) {
            await updateSessionSolde(tx, sessionCaisseId, montant);
          }

          return { result: mouvement };
        },
        userId
      );

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({
          type: "TONTINE_UPDATE",
          payload: { type: "join_fee_paid", tontineId: tontine.id, membreId: req.params.membreId },
        });
      }

      res.json({ success: true, mouvementId: mouvement.id, montant });
    } catch (error: any) {
      logger.error({ err: error }, "Erreur paiement frais d'adhésion");
      res.status(400).json({ message: error.message || "Erreur paiement frais d'adhésion" });
    }
  });

  // ============================================================================
  // LIFECYCLE STATE MACHINE
  // ============================================================================

  app.post("/api/tontines/:id/activate", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "ACTIVE", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/pause", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "PAUSED", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/resume", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "ACTIVE", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/complete", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "COMPLETED", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/cancel", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.transitionStatus(
        req.params.id, "CANCELLED", req.session.user!.id, req.body.reason
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "status_changed", id: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // MEMBER EXIT/REPLACEMENT WORKFLOW
  // ============================================================================

  app.post("/api/tontines/:id/membres/:membreId/request-exit", requireAuth, async (req, res) => {
    try {
      const result = await tontineLifecycleService.requestMemberExit(
        req.params.id, req.params.membreId, req.session.user!.id
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "exit_requested", tontineId: req.params.id, membreId: req.params.membreId } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/membres/:membreId/approve-exit", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.approveMemberExit(
        req.params.id, req.params.membreId, req.session.user!.id
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "member_exit", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/membres/:membreId/replace", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const { newClientId } = req.body;
      if (!newClientId) return res.status(400).json({ message: "newClientId requis" });

      // B11: Validate KYC level and segment for replacement member
      await validateMemberKycAndSegment(req.params.id, newClientId);

      const result = await tontineLifecycleService.replaceMember(
        req.params.id, req.params.membreId, newClientId, req.session.user!.id
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "member_replaced", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // MID-CYCLE JOIN
  app.post("/api/tontines/:id/mid-cycle-join", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ message: "clientId requis" });

      // B11: Validate KYC level and segment before mid-cycle join
      await validateMemberKycAndSegment(req.params.id, clientId);

      const result = await tontineLifecycleService.midCycleJoin(
        req.params.id, clientId, req.session.user!.id
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "mid_cycle_join", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // MEMBER SUSPENSION
  app.post("/api/tontines/:id/membres/:membreId/suspend", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const { reason } = req.body;
      const result = await tontineLifecycleService.suspendMember(
        req.params.id, req.params.membreId, reason || "Suspendu par l'administrateur"
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "member_suspended", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/tontines/:id/membres/:membreId/reinstate", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const result = await tontineLifecycleService.reinstateMember(
        req.params.id, req.params.membreId
      );
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "member_reinstated", tontineId: req.params.id } });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ROLE MANAGEMENT
  app.patch("/api/tontines/:id/membres/:membreId/role", requireAuth, attachAbility, requireAbility(Actions.EDIT, Subjects.TONTINE_MEMBRE), async (req, res) => {
    try {
      const { role } = req.body;
      await tontineLifecycleService.assignMemberRole(req.params.id, req.params.membreId, role || null);
      const wsInstance = getWsInstance();
      if (wsInstance) wsInstance.broadcast({ type: "TONTINE_UPDATE", payload: { type: "role_assigned", tontineId: req.params.id, membreId: req.params.membreId } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/clients/:id/tontines", requireAuth, async (req, res) => {
    try {
      const tontines = await storage.getTontinesByClient(req.params.id);
      res.json(tontines);
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur chargement tontines client');
      res.status(500).json({ message: error.message || "Erreur chargement tontines" });
    }
  });

  // Tontine Penalites
}
