import { Actions, Subjects } from "@shared/ability";
import { caisses, sessionsCaisseAuditLogs } from "@shared/schema/finance";
import { SystemRole } from "@shared/types/roles";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { db } from "../../db";
import { createLogger } from "../../lib/logger";
import { createMouvementFinancier } from "../../services/ledger";
import { cancelRequestSchema, processRequestSchema } from "./caisse-admin-helpers";

const logger = createLogger('Routes:CaisseAdmin');

export function registerCaisseAdminPaymentsRoutes(router: Router) {

  /**
   * GET /api/caisses/payment-requests
   * Liste les demandes de paiement en attente pour une agence
   */
  router.get(
    "/payment-requests",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const userRole = req.session.user?.role;
        const isAdmin = userRole === SystemRole.ADMIN;
        // Admins see all agencies (ignore agenceId param); regular users filter by their agency
        const agenceId = isAdmin ? undefined : (req.query.agenceId as string || req.session.user?.agenceId);
        const category = req.query.category as string | undefined;
        const caisseId = req.query.caisseId as string | undefined;
  
        if (!isAdmin && !agenceId) {
          return res.status(400).json({ error: "Agence non spécifiée" });
        }
  
        const { getPendingRequests } = await import("../../services/caisse-queue-service");
        const requests = await getPendingRequests(agenceId, category, caisseId);
  
        res.json(requests);
      } catch (error: any) {
        logger.error({ err: error }, "Erreur récupération payment requests");
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * GET /api/caisses/payment-requests/count
   * Nombre de demandes en attente (pour badge sidebar)
   */
  router.get(
    "/payment-requests/count",
    requireAuth,
    async (req, res) => {
      try {
        const userRole = req.session.user?.role;
        const isAdmin = userRole === SystemRole.ADMIN;
  
        // Admins see all agencies (ignore agenceId param); regular users filter by their agency
        const agenceId = isAdmin ? undefined : (req.query.agenceId as string || req.session.user?.agenceId);
  
        if (!isAdmin && !agenceId) {
          return res.status(400).json({ error: "Agence non spécifiée" });
        }
  
        const { getPendingCount } = await import("../../services/caisse-queue-service");
        const count = await getPendingCount(agenceId);
  
        res.json({ count });
      } catch (error: any) {
        logger.error({ err: error }, "Erreur comptage payment requests");
        res.status(500).json({ error: error.message || "Erreur interne" });
      }
    }
  );
  

  /**
   * POST /api/caisses/payment-requests/:id/process
   * Traite une demande de paiement (caissier)
   */
  router.post(
    "/payment-requests/:id/process",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.session.user!.id;
  
        const validation = processRequestSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const { processRequest } = await import("../../services/caisse-queue-service");
        const result = await processRequest(id, validation.data.sessionCaisseId, userId);
  
        res.json({
          success: true,
          request: result,
          message: "Demande traitée avec succès",
        });
      } catch (error: any) {
        logger.error({ err: error, requestId: req.params.id }, "Erreur traitement payment request");
        res.status(400).json({ error: error.message || "Erreur lors du traitement" });
      }
    }
  );
  

  /**
   * POST /api/caisses/payment-requests/:id/cancel
   * Annule une demande de paiement
   */
  router.post(
    "/payment-requests/:id/cancel",
    attachAbility, requireAbility(Actions.VIEW, Subjects.CAISSE),
    async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.session.user!.id;
  
        const validation = cancelRequestSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Données invalides",
            details: validation.error.format(),
          });
        }
  
        const { cancelRequest } = await import("../../services/caisse-queue-service");
        const result = await cancelRequest(id, validation.data.reason, userId);
  
        res.json({
          success: true,
          request: result,
          message: "Demande annulée",
        });
      } catch (error: any) {
        logger.error({ err: error, requestId: req.params.id }, "Erreur annulation payment request");
        res.status(400).json({ error: error.message || "Erreur lors de l'annulation" });
      }
    }
  );
  
  // ============================================================================
  // ROUTES - CORRECTION DE SOLDE CAISSE (Admin/Supervision)
  // ============================================================================
  
  const balanceCorrectionSchema = z.object({
    newBalance: z.number().min(0, "Le nouveau solde doit être >= 0"),
    motif: z.string().min(10, "Le motif doit contenir au moins 10 caractères"),
  });
  

  /**
   * POST /api/caisses/:id/balance-correction
   * Corrige le solde d'une caisse (ex: solde négatif suite à une incohérence).
   * Réservé aux admins/supervision. Crée un log d'audit détaillé.
   *
   * ⚠️  SECURITY NOTE — Separation of Duties Limitation:
   * This endpoint does NOT enforce maker-checker separation. A single user with
   * MANAGE permission can initiate AND execute a balance correction.
   * Compensating controls: audit trail (sessionsCaisseAuditLogs + mouvement),
   * MANAGE permission required, agence-level access control, session must be closed.
   * Future: implement pending approval workflow for corrections above a threshold.
   */
  router.post(
    "/:id/balance-correction",
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.CAISSE),
    async (req, res) => {
      try {
        const caisseId = req.params.id;
        const userId = req.user?.id;
        const parsed = balanceCorrectionSchema.safeParse(req.body);
  
        if (!parsed.success) {
          return res.status(400).json({
            error: parsed.error.errors.map((e) => e.message).join("; "),
          });
        }
  
        const { newBalance, motif } = parsed.data;
  
        // 1. Récupérer la caisse actuelle (avec agenceId pour le mouvement financier)
        const [caisse] = await db
          .select({
            id: caisses.id,
            nom: caisses.nom,
            solde: caisses.solde,
            statut: caisses.statut,
            agenceId: caisses.agenceId,
          })
          .from(caisses)
          .where(eq(caisses.id, caisseId));
  
        if (!caisse) {
          return res.status(404).json({ error: "Caisse introuvable" });
        }
  
        // Vérifier accès agence (seul un admin global peut corriger une caisse d'une autre agence)
        const isGlobalAdmin = req.ability?.can(Actions.MANAGE, 'all');
        if (!isGlobalAdmin && caisse.agenceId !== req.session.user?.agenceId) {
          return res.status(403).json({ error: "Accès interdit: caisse d'une autre agence" });
        }
  
        const oldBalance = Number(caisse.solde || 0);
  
        // 2. Vérifier qu'il n'y a pas de session active sur cette caisse
        const { sessionsCaisse, agences: agencesTable } = await import("@shared/schema");
        const [activeSession] = await db
          .select({ id: sessionsCaisse.id })
          .from(sessionsCaisse)
          .where(
            and(
              eq(sessionsCaisse.caisseId, caisseId),
              notInArray(sessionsCaisse.statut, ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"]),
              isNull(sessionsCaisse.deletedAt)
            )
          )
          .limit(1);
  
        if (activeSession) {
          return res.status(409).json({
            error: "Impossible de corriger le solde : une session est active sur cette caisse. Fermez-la d'abord.",
          });
        }
  
        // 3. Récupérer l'agenceId de la caisse
        const agenceId = caisse.agenceId;
  
        // 4. Appliquer la correction dans une transaction (avec mouvement financier pour satisfaire BALANCE_GUARD)
        const delta = newBalance - oldBalance;
        await db.transaction(async (tx) => {
          // Créer un mouvement financier d'ajustement (requis par le trigger BALANCE_GUARD)
          if (Math.abs(delta) > 0) {
            await createMouvementFinancier(
              tx,
              {
                agenceId: agenceId || undefined,
                sens: delta > 0 ? "CREDIT" : "DEBIT",
                montant: Math.abs(delta).toString(),
                sourceModule: "CAISSE",
                typePaiement: "ADJUSTMENT",
                requiresGlPosting: false,
                metadata: {
                  type: "ADMIN_BALANCE_CORRECTION",
                  caisseId,
                  caisseName: caisse.nom,
                  oldBalance,
                  newBalance,
                  motif,
                  correctedBy: userId,
                },
              },
              userId
            );
          } else {
            // Pas de delta — bypass le guard manuellement
            await tx.execute(sql`SELECT set_config('app.mouvement_created', 'true', true)`);
          }
  
          // Mettre à jour le solde
          await tx
            .update(caisses)
            .set({
              solde: newBalance.toString(),
              updatedAt: new Date(),
            })
            .where(eq(caisses.id, caisseId));
  
          // Log d'audit — sessionId requis (NOT NULL), utiliser la dernière session fermée
          const [lastSession] = await tx
            .select({ id: sessionsCaisse.id })
            .from(sessionsCaisse)
            .where(eq(sessionsCaisse.caisseId, caisseId))
            .orderBy(desc(sessionsCaisse.createdAt))
            .limit(1);
  
          if (lastSession) {
            await tx.insert(sessionsCaisseAuditLogs).values({
              sessionId: lastSession.id,
              caisseId,
              action: "BALANCE_CORRECTION",
              userId,
              details: {
                oldBalance,
                newBalance,
                delta,
                motif,
                caisseName: caisse.nom,
                correctedBy: userId,
              },
              ipAddress: req.ip,
            });
          }
        });
  
        logger.warn(
          { caisseId, caisseName: caisse.nom, oldBalance, newBalance, userId, motif },
          "[BALANCE_CORRECTION] Solde caisse corrigé par supervision"
        );
  
        res.json({
          success: true,
          caisse: {
            id: caisseId,
            nom: caisse.nom,
            oldBalance,
            newBalance,
          },
          message: `Solde corrigé de ${oldBalance.toLocaleString('fr-FR')} à ${newBalance.toLocaleString('fr-FR')} FCFA`,
        });
      } catch (error: any) {
        logger.error({ err: error, caisseId: req.params.id }, "Erreur correction solde caisse");
        res.status(500).json({ error: error.message || "Erreur lors de la correction" });
      }
    }
  );
  
  // ============================================================================
  // AUTO-CLOSE EXPIRED SESSIONS (via SQL function close_expired_sessions)
  // ============================================================================
  
}
