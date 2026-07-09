/**
 * Routes finance — segment /enquetes-credit (partie enquetes-credit).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/enquetes-credit
 *   POST   /api/enquetes-credit
 *   POST   /api/enquetes-credit/:id/demarrer
 *   GET    /api/enquetes-credit/mes-enquetes
 */
import type { Express } from "express";
import * as schema from "@shared/schema";
import { insertEnqueteCreditSchema, clients, demandesCredit, enquetesCredit, creditPlans, professions, activityTypes } from "@shared/schema";
import { storage } from "../../storage";
import { StatutDemande } from "@shared/enum/status-constants";
import type {
  StatutCreditDz,
  StatutDemandeDz,
  DisbursementStatusDz,
  DisbursementChannelDz,
  StatutEnqueteCreditDz,
} from "@shared/enum/enums";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { db } from "../../db";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { logger } from "./shared";

export function registerEnquetesCreditRoutes(app: Express) {
  // Enquetes (roles: admin, chef, credit, superviseur)
  /**
   * GET /api/enquetes-credit
   */
  app.get("/api/enquetes-credit", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.DEMANDE_CREDIT), async (req, res) => {
      // Return both completed/in-progress enquetes AND demandes ready for investigation
      // Actually, for now, let's just return enquetes. Frontend can merge if needed, 
      // or we can handle it here.
      // But standard pattern is:
      const enquetes = await storage.getAllEnquetes();
      res.json(enquetes);
  });

  /**
   * POST /api/enquetes-credit
   */
  app.post("/api/enquetes-credit", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.DEMANDE_CREDIT), async (req, res) => {
      try {
          const data = normalizeKeysDeep(req.body) as any;
          logger.info({ rawDemandeId: req.body.demandeId, normalizedDemandeId: data.demandeId }, 'Enquete create - demandeId check');

          const parsed = insertEnqueteCreditSchema.parse(data);
          logger.info({ parsedDemandeId: parsed.demandeId }, 'Enquete create - after parse');

          // Ensure status is ASSIGNED if an agent is selected but status is default
          if (parsed.assignedAgentId && (!parsed.statut || parsed.statut === 'PENDING_ASSIGNMENT')) {
             parsed.statut = 'ASSIGNED';
          }

          const enquete = await storage.createEnqueteCredit(parsed);
          logger.info({ enqueteId: enquete.id, enqueteDemandeId: enquete.demandeId }, 'Enquete created');

          // Update Demande Status - Marquer l'enquête comme terminée
          // Workflow: READY_FOR_INVESTIGATION -> UNDER_INVESTIGATION -> INVESTIGATION_COMPLETE
          // Quand on enregistre le formulaire d'enquête, l'enquête est TERMINÉE
          if (enquete.demandeId) {
              logger.info({ demandeId: enquete.demandeId, newStatut: StatutDemande.INVESTIGATION_COMPLETE }, 'Updating demande status');
              await storage.updateDemandeCredit(enquete.demandeId, { statut: StatutDemande.INVESTIGATION_COMPLETE as StatutDemandeDz });
              logger.info('Demande status updated successfully');
          } else {
              logger.warn({ enqueteId: enquete.id }, 'No demandeId on enquete - status not updated');
          }

          // Cancel deadline reminders — enquête terminée
          try {
            const { cancelInvestigationReminders } = await import("../../services/notifications/investigation-reminder-service");
            await cancelInvestigationReminders(enquete.id, "Enquête terminée");
          } catch {
            // Non-blocking
          }

          // Notify Credit Update
          const wsInstance = getWsInstance();
          if (wsInstance) {
              wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'enquete_new', demandeId: parsed.demandeId } });
          }

          // Note: Domain event CREDIT_INVESTIGATION_ASSIGNED est maintenant envoyé
          // lors du démarrage de l'enquête (start-investigation endpoint)

          res.json(enquete);
      } catch (error: any) {
          logger.error({ err: error }, 'Enquete create error');
          res.status(500).json({
              message: error.message || 'Erreur lors de la création de l\'enquête',
              code: 'ENQUETE_CREATE_ERROR'
          });
      }
  });

  // Agent starts an investigation — transitions enquête ASSIGNED → IN_PROGRESS, demande READY_FOR_INVESTIGATION → UNDER_INVESTIGATION
  /**
   * POST /api/enquetes-credit/:id/demarrer
   */
  app.post("/api/enquetes-credit/:id/demarrer", requireAuth, attachAbility, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.session?.user?.id;

      // Load enquête
      const [enquete] = await db
        .select()
        .from(enquetesCredit)
        .where(eq(enquetesCredit.id, id))
        .limit(1);

      if (!enquete) {
        return res.status(404).json({ message: "Enquête non trouvée" });
      }

      // The assigned agent can start, OR a supervisor acting on their behalf
      if (enquete.assignedAgentId !== userId) {
        const canSupervise = req.ability?.can(Actions.APPROVE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, Subjects.CAISSE);
        if (!canSupervise) {
          return res.status(403).json({ message: "Vous n'êtes pas l'agent assigné à cette enquête." });
        }
      }

      // Only ASSIGNED enquêtes can be started
      if (enquete.statut !== "ASSIGNED") {
        return res.status(400).json({ message: `Cette enquête ne peut pas être démarrée (statut actuel: ${enquete.statut}).` });
      }

      // Update enquête to IN_PROGRESS
      const [updated] = await db
        .update(enquetesCredit)
        .set({
          statut: "IN_PROGRESS",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enquetesCredit.id, id))
        .returning();

      // Update demande status to UNDER_INVESTIGATION
      if (enquete.demandeId) {
        await storage.updateDemandeCredit(enquete.demandeId, {
          statut: StatutDemande.UNDER_INVESTIGATION,
        });
      }

      const wsInstance = getWsInstance();
      if (wsInstance) {
        wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'investigation_started', id, demandeId: enquete.demandeId, agentId: enquete.assignedAgentId } });
      }

      res.json({ success: true, enquete: updated });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur démarrage enquête par agent');
      res.status(500).json({ message: error.message || "Erreur lors du démarrage de l'enquête" });
    }
  });

  // Agent-specific: list my assigned investigations with client info
  // Admin supervision: pass ?agentUserId=<users.id> to view a specific agent's investigations
  /**
   * GET /api/enquetes-credit/mes-enquetes
   */
  app.get("/api/enquetes-credit/mes-enquetes", requireAuth, attachAbility, async (req, res) => {
    try {
      const sessionUserId = req.session?.user?.id;
      if (!sessionUserId) return res.status(401).json({ message: "Non authentifié" });

      // Allow supervisors (admin, chef agence, superviseur, or users with supervision permissions) to query a specific agent's investigations
      const agentUserId = req.query.agentUserId as string | undefined;
      let targetUserId = sessionUserId;
      if (agentUserId) {
        const canSupervise = req.ability?.can(Actions.APPROVE, Subjects.CAISSE) || req.ability?.can(Actions.MANAGE, Subjects.CAISSE);
        if (canSupervise) {
          targetUserId = agentUserId;
        }
      }

      const results = await db.select({
        enquete: enquetesCredit,
        client: clients,
        userNom: schema.users.nom,
        userPrenom: schema.users.prenom,
        userTelephone: schema.users.telephone,
        professionNom: professions.nom,
        activityTypeNom: activityTypes.nom,
        demande: demandesCredit,
        plan: creditPlans,
      })
        .from(enquetesCredit)
        .leftJoin(clients, eq(enquetesCredit.clientId, clients.id))
        .leftJoin(schema.users, eq(clients.userId, schema.users.id))
        .leftJoin(professions, eq(clients.professionId, professions.id))
        .leftJoin(activityTypes, eq(clients.activityTypeId, activityTypes.id))
        .leftJoin(demandesCredit, eq(enquetesCredit.demandeId, demandesCredit.id))
        .leftJoin(creditPlans, eq(
          sql`COALESCE(${enquetesCredit.creditPlanId}, ${demandesCredit.creditPlanId})`,
          creditPlans.id
        ))
        .where(eq(enquetesCredit.assignedAgentId, targetUserId))
        .orderBy(desc(enquetesCredit.createdAt));

      const data = results.map(r => ({
        ...r.enquete,
        client: r.userNom ? {
          nom: r.userNom,
          prenom: r.userPrenom,
          telephone: r.userTelephone,
          adresseDomicile: r.client?.adresseDomicile,
          typeActivite: r.activityTypeNom || null,
          revenuMensuel: r.client?.revenuMensuel,
          revenuJournalier: r.client?.revenuJournalier,
          typeRevenu: r.client?.typeRevenu,
          profession: r.professionNom || r.client?.professionAutreTexte || null,
          lieuActivite: r.client?.lieuActivite,
        } : null,
        clientSituation: r.client ? {
          situationMatrimoniale: r.client.situationMatrimoniale,
          nombrePersonnesCharge: r.client.nombrePersonnesCharge,
          statutLogement: r.client.statutLogement,
        } : null,
        creditPlan: r.plan ? {
          id: r.plan.id,
          nom: r.plan.nom,
          montantMin: r.plan.montantMin,
          montantMax: r.plan.montantMax,
          tauxInteret: r.plan.tauxInteret,
          dureeValeur: r.plan.dureeValeur,
          dureeUnite: r.plan.dureeUnite,
          frequenceRemboursement: r.plan.frequenceRemboursement,
          collateralRequired: r.plan.collateralRequired,
          collateralTypes: r.plan.collateralTypes,
          documentsRequis: r.plan.documentsRequis,
          maxDebtToIncomeRatio: r.plan.maxDebtToIncomeRatio,
          guaranteeDepositPercent: r.plan.guaranteeDepositPercent,
          interestMethod: r.plan.interestMethod,
          amortizationType: r.plan.amortizationType,
        } : null,
      }));

      res.json({ success: true, data });
    } catch (error: any) {
      logger.error({ err: error }, 'Erreur récupération enquêtes agent');
      res.status(500).json({ message: error.message || "Erreur" });
    }
  });
}
