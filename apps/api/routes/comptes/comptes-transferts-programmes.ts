/**
 * Routes comptes — segment /comptes (partie comptes-transferts-programmes).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/transferts-programmes
 *   PATCH  /api/comptes/transferts-programmes/:id
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import { aliasedTable, and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../../ws-server";
import { logger, updateVirementProgrammeSchema } from "./shared";

export function registerComptesTransfertsProgrammesRoutes(app: Express) {
  /**
   * GET /api/comptes/transferts-programmes - Lister les virements programmés
   */
  /**
   * GET /api/comptes/transferts-programmes
   */
  app.get(
    "/api/comptes/transferts-programmes",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const page = Math.max(parseInt(req.query.page as string) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || "").trim();
        const actifParam = req.query.actif as string | undefined;
        const actif = actifParam === "true" ? true : actifParam === "false" ? false : undefined;

        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");
        const sourceClient = aliasedTable(clients, "source_client");
        const destClient = aliasedTable(clients, "dest_client");
        const sourceUser = aliasedTable(users, "source_user");
        const destUser = aliasedTable(users, "dest_user");

        const conditions: any[] = [];
        if (req.selectedAgenceId) {
          conditions.push(
            or(eq(sourceCompte.agenceId, req.selectedAgenceId), eq(destCompte.agenceId, req.selectedAgenceId))
          );
        }

        if (actif !== undefined) {
          conditions.push(eq(virementsProgrammes.actif, actif));
        }

        // Filter by statutDernier (for "failed" filter)
        const statutParam = req.query.statut as string | undefined;
        if (statutParam && (statutParam === 'SUCCESS' || statutParam === 'FAILED')) {
          conditions.push(eq(virementsProgrammes.statutDernier, statutParam));
        }

        if (search) {
          const pattern = `%${search}%`;
          // Architecture V3: nom/prenom sont dans users, pas dans clients
          conditions.push(or(
            ilike(sourceCompte.numeroCompte, pattern),
            ilike(destCompte.numeroCompte, pattern),
            ilike(sql`COALESCE(${sourceUser.nom}, '')`, pattern),
            ilike(sql`COALESCE(${sourceUser.prenom}, '')`, pattern),
            ilike(sql`COALESCE(${destUser.nom}, '')`, pattern),
            ilike(sql`COALESCE(${destUser.prenom}, '')`, pattern),
          ));
        }

        const whereClause = conditions.length ? and(...conditions) : undefined;

        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .leftJoin(sourceClient, eq(sourceCompte.clientId, sourceClient.id))
          .leftJoin(destClient, eq(destCompte.clientId, destClient.id))
          .leftJoin(sourceUser, eq(sourceClient.userId, sourceUser.id))
          .leftJoin(destUser, eq(destClient.userId, destUser.id))
          .where(whereClause);

        // Architecture V3: nom/prenom proviennent de users, pas de clients
        const schedules = await db
          .select({
            id: virementsProgrammes.id,
            compteSourceId: virementsProgrammes.compteSourceId,
            compteDestId: virementsProgrammes.compteDestId,
            montant: virementsProgrammes.montant,
            frequence: virementsProgrammes.frequence,
            prochaineExecution: virementsProgrammes.prochaineExecution,
            actif: virementsProgrammes.actif,
            dernierExecution: virementsProgrammes.dernierExecution,
            statutDernier: virementsProgrammes.statutDernier,
            erreurDerniere: virementsProgrammes.erreurDerniere,
            createdAt: virementsProgrammes.createdAt,
            updatedAt: virementsProgrammes.updatedAt,
            createdBy: virementsProgrammes.createdBy,
            // Technical configuration fields
            timezone: virementsProgrammes.timezone,
            jourExecution: virementsProgrammes.jourExecution,
            retryCount: virementsProgrammes.retryCount,
            maxRetries: virementsProgrammes.maxRetries,
            libelle: virementsProgrammes.libelle,
            // Source account info
            sourceNumero: sourceCompte.numeroCompte,
            sourceType: sourceCompte.typeCompte,
            sourceAgenceId: sourceCompte.agenceId,
            destNumero: destCompte.numeroCompte,
            destType: destCompte.typeCompte,
            destAgenceId: destCompte.agenceId,
            sourceUserNom: sourceUser.nom,
            sourceUserPrenom: sourceUser.prenom,
            destUserNom: destUser.nom,
            destUserPrenom: destUser.prenom,
          })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .leftJoin(sourceClient, eq(sourceCompte.clientId, sourceClient.id))
          .leftJoin(destClient, eq(destCompte.clientId, destClient.id))
          .leftJoin(sourceUser, eq(sourceClient.userId, sourceUser.id))
          .leftJoin(destUser, eq(destClient.userId, destUser.id))
          .where(whereClause)
          .orderBy(desc(virementsProgrammes.createdAt))
          .limit(limit)
          .offset(offset);

        res.json(
          {
            data: schedules,
            pagination: {
              page,
              limit,
              total: Number(countResult?.count || 0),
              totalPages: Math.ceil(Number(countResult?.count || 0) / limit),
            },
          }
        );
      } catch (error: any) {
        logger.error({ err: error }, 'Error listing scheduled transfers');
        res.status(500).json({ message: error.message || "Erreur chargement virements programmes" });
      }
    }
  );

  /**
   * PATCH /api/comptes/transferts-programmes/:id - Mettre à jour un virement programmé
   */
  /**
   * PATCH /api/comptes/transferts-programmes/:id
   */
  app.patch(
    "/api/comptes/transferts-programmes/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.EDIT, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const parsed = updateVirementProgrammeSchema.parse(data);

        if (Object.keys(parsed).length === 0) {
          return res.status(400).json({ message: "Aucune modification fournie" });
        }

        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");

        const [existing] = await db
          .select({
            id: virementsProgrammes.id,
            actif: virementsProgrammes.actif,
            prochaineExecution: virementsProgrammes.prochaineExecution,
            sourceAgenceId: sourceCompte.agenceId,
            destAgenceId: destCompte.agenceId,
          })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .where(eq(virementsProgrammes.id, req.params.id))
          .limit(1);

        if (!existing) {
          return res.status(404).json({ message: "Virement programmé introuvable" });
        }

        if (
          req.selectedAgenceId &&
          existing.sourceAgenceId !== req.selectedAgenceId &&
          existing.destAgenceId !== req.selectedAgenceId
        ) {
          return res.status(403).json({ message: "Accès refusé pour ce virement programmé" });
        }

        const updateData: Record<string, any> = {
          updatedAt: new Date(),
        };

        if (parsed.montant !== undefined) {
          updateData.montant = parsed.montant.toString();
        }
        if (parsed.frequence !== undefined) {
          updateData.frequence = parsed.frequence;
        }
        if (parsed.actif !== undefined) {
          updateData.actif = parsed.actif;
        }
        if (parsed.prochaineExecution !== undefined) {
          if (parsed.prochaineExecution === null || parsed.prochaineExecution === "") {
            updateData.prochaineExecution = null;
          } else {
            const nextDate = new Date(parsed.prochaineExecution);
            if (Number.isNaN(nextDate.getTime())) {
              return res.status(400).json({ message: "Date de prochaine exécution invalide" });
            }
            updateData.prochaineExecution = nextDate;
          }
        }

        if (parsed.actif === true && parsed.prochaineExecution === undefined) {
          const existingNext = existing.prochaineExecution ? new Date(existing.prochaineExecution) : null;
          if (!existingNext || existingNext < new Date()) {
            updateData.prochaineExecution = new Date();
          }
        }

        if (parsed.montant !== undefined || parsed.frequence !== undefined || parsed.prochaineExecution !== undefined) {
          updateData.statutDernier = "pending";
          updateData.erreurDerniere = null;
        }

        const [updated] = await db
          .update(virementsProgrammes)
          .set(updateData)
          .where(eq(virementsProgrammes.id, req.params.id))
          .returning();

        await logAudit(
          req,
          "UPDATE_VIREMENT_PROGRAMME",
          "virement_programme",
          updated.id,
          {
            montant: parsed.montant,
            frequence: parsed.frequence,
            prochaineExecution: parsed.prochaineExecution,
            actif: parsed.actif,
          },
          "success",
          "medium"
        );

        // Broadcast WebSocket pour mise à jour temps réel
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "SCHEDULED_TRANSFER_UPDATED",
            payload: {
              transferId: updated.id,
              action: parsed.actif !== undefined ? (parsed.actif ? "resumed" : "paused") : "modified",
              actif: updated.actif,
              prochaineExecution: updated.prochaineExecution,
            },
          });
        }

        res.json(updated);
      } catch (error: any) {
        if (error.name === "ZodError") {
          return res.status(400).json({
            message: "Données invalides",
            details: error.errors,
          });
        }
        logger.error({ err: error }, 'Error updating scheduled transfer');
        res.status(500).json({ message: error.message || "Erreur mise à jour virement programmé" });
      }
    }
  );
}
