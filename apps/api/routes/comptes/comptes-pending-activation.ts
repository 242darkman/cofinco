/**
 * Routes comptes — segment /comptes (partie comptes-pending-activation).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/comptes/pending-activation
 *   POST   /api/comptes/transferts
 *   GET    /api/comptes/transferts-programmes/stats
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { normalizeKeysDeep } from "../utils";
import { createVirementProgramme, executeCompteTransfer } from "../../services/compte-transfers";
import { aliasedTable, and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage, SuspensionReason } from "@shared/enum/status-constants";
import { logger, virementCompteSchema } from "./shared";

export function registerComptesPendingActivationRoutes(app: Express) {
  /**
   * GET /api/comptes/pending-activation - Lister les comptes en attente de paiement (pour encaissement)
   * Includes: PENDING_PAYMENT, PENDING_PAYMENT_AND_APPROVAL, and legacy PENDING_ACTIVATION
   * Tri: FIFO (plus ancien en premier)
   */
  /**
   * GET /api/comptes/pending-activation
   */
  app.get(
    "/api/comptes/pending-activation",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
        try {
            const agenceId = req.selectedAgenceId;
            const pendingPaymentStatuses = [
                StatutCompte.PENDING_PAYMENT,
                StatutCompte.PENDING_PAYMENT_AND_APPROVAL,
                StatutCompte.PENDING_ACTIVATION, // legacy backward compatibility
            ];
            const conditions: any[] = [inArray(comptes.statut, pendingPaymentStatuses)];

            if (agenceId) {
                // Robust agency check: either the account is explicitly assigned to this agency
                // OR the account has no agency set but the client belongs to this agency
                conditions.push(
                    or(
                        eq(comptes.agenceId, agenceId),
                        and(
                            sql`${comptes.agenceId} IS NULL`,
                            eq(clients.agenceId, agenceId)
                        )
                    )
                );
            }


            const results = await db
                .select({
                    id: comptes.id,
                    numeroCompte: comptes.numeroCompte,
                    typeCompte: comptes.typeCompte,
                    statut: comptes.statut,
                    montantInitial: comptes.soldeCourant,
                    openingSnapshot: comptes.openingSnapshot,
                    paidOpeningFee: comptes.paidOpeningFee,
                    paidInitialDeposit: comptes.paidInitialDeposit,
                    createdAt: comptes.createdAt,
                    clientId: clients.id,
                    // Architecture V3: nom/prenom proviennent de users
                    userNom: users.nom,
                    userPrenom: users.prenom,
                    userPhoto: users.photoProfile,
                })
                .from(comptes)
                .innerJoin(clients, eq(comptes.clientId, clients.id))
                .leftJoin(users, eq(clients.userId, users.id))
                .where(and(...conditions))
                .orderBy(comptes.createdAt);

            const formatted = results.map(r => {
                // WARNING: Dirty Data Fix
                // r.userPhoto sometimes contains a JSON stringified array of URLs (legacy artifact)
                // We must parse it to extract a single valid URL string
                let photoUrl = r.userPhoto;
                if (photoUrl && typeof photoUrl === 'string') {
                    // Check if it looks like a JSON array
                    if (photoUrl.trim().startsWith('[')) {
                        try {
                            const parsed = JSON.parse(photoUrl);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                // Extract first item
                                photoUrl = parsed[0];
                            }
                        } catch (e) {
                            // Not valid JSON, keep original string
                        }
                    }
                }

                // Compute remaining opening fee and deposit from snapshot
                const snapshot = r.openingSnapshot as any;
                const paidFee = parseFloat(r.paidOpeningFee || '0');
                const paidDeposit = parseFloat(r.paidInitialDeposit || '0');
                const requiredFee = snapshot?.openingFee || 0;
                const requiredDeposit = (snapshot?.initialDepositRequired && snapshot?.minInitialDeposit) ? snapshot.minInitialDeposit : 0;

                return {
                    id: r.id,
                    numeroCompte: r.numeroCompte,
                    typeCompte: r.typeCompte,
                    statut: r.statut,
                    montantInitial: parseFloat(r.montantInitial || '0'),
                    remainingOpeningFee: Math.max(0, requiredFee - paidFee),
                    remainingDeposit: Math.max(0, requiredDeposit - paidDeposit),
                    createdAt: r.createdAt,
                    client: {
                        id: r.clientId,
                        nom: r.userNom,
                        prenom: r.userPrenom,
                        photoUrl: photoUrl // Use cleaned photoUrl
                    }
                };
            });

            res.json(formatted);
        } catch (error) {
            logger.error({ err: error }, 'Error fetching pending activations');
            res.status(500).json({ message: "Erreur lors du chargement des activations en attente" });
        }
    }
  );

  /**
   * POST /api/comptes/transferts - Virement interne immediat ou programme
   */
  /**
   * POST /api/comptes/transferts
   */
  app.post(
    "/api/comptes/transferts",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const parsed = virementCompteSchema.parse(data);

        if (!parsed.destinationCompteId && !parsed.destinationAccountNumber) {
          return res.status(400).json({ message: "Compte destinataire requis" });
        }

        let destinationCompteId = parsed.destinationCompteId;
        const destinationNumber = parsed.destinationAccountNumber?.trim();
        if (!destinationCompteId && destinationNumber) {
          const [destCompte] = await db
            .select()
            .from(comptes)
            .where(eq(comptes.numeroCompte, destinationNumber))
            .limit(1);
          if (!destCompte) {
            return res.status(404).json({ message: "Compte destinataire introuvable" });
          }
          destinationCompteId = destCompte.id;
        }

        if (!destinationCompteId) {
          return res.status(400).json({ message: "Compte destinataire introuvable" });
        }

        if (destinationCompteId === parsed.sourceCompteId) {
          return res.status(400).json({ message: "Compte source et destinataire identiques" });
        }

        const userId = req.session?.user?.id || null;

        if (parsed.scheduled) {
          const schedule = await createVirementProgramme({
            compteSourceId: parsed.sourceCompteId,
            compteDestId: destinationCompteId,
            montant: parsed.montant,
            frequence: parsed.frequence,
            createdBy: userId,
            prochaineExecution: parsed.prochaineExecution ? new Date(parsed.prochaineExecution) : undefined,
          });

          return res.status(201).json(
            {
              scheduled: true,
              schedule,
            }
          );
        }

        const result = await executeCompteTransfer({
          compteSourceId: parsed.sourceCompteId,
          compteDestId: destinationCompteId,
          montant: parsed.montant,
          createdBy: userId,
        });

        return res.status(201).json({
          scheduled: false,
          mouvementId: result.mouvementId,
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error compte transfer');
        res.status(400).json({ message: error.message || "Erreur transfert" });
      }
    }
  );

  /**
   * GET /api/comptes/transferts-programmes/stats - Statistiques des virements programmés
   */
  /**
   * GET /api/comptes/transferts-programmes/stats
   */
  app.get(
    "/api/comptes/transferts-programmes/stats",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const agenceId = req.selectedAgenceId;
        const sourceCompte = aliasedTable(comptes, "source_compte");
        const destCompte = aliasedTable(comptes, "dest_compte");

        const conditions: any[] = [];
        if (agenceId) {
          conditions.push(
            or(eq(sourceCompte.agenceId, agenceId), eq(destCompte.agenceId, agenceId))
          );
        }

        const whereClause = conditions.length ? and(...conditions) : undefined;

        // Fetch all relevant transfers to calculate stats in memory (easier for complex weighting)
        // or complex SQL. Let's do SQL for robustness.
        const stats = await db
          .select({
            totalCount: sql<number>`count(*)`.mapWith(Number),
            activeCount: sql<number>`sum(case when ${virementsProgrammes.actif} = true then 1 else 0 end)`.mapWith(Number),
            pausedCount: sql<number>`sum(case when ${virementsProgrammes.actif} = false then 1 else 0 end)`.mapWith(Number),
            failedCount: sql<number>`sum(case when ${virementsProgrammes.statutDernier} = 'FAILED' then 1 else 0 end)`.mapWith(Number),
            // Weighted volume for ALL active transfers (monthly equivalent)
            currentWeightedVolume: sql<number>`sum(
              case
                when ${virementsProgrammes.actif} = true then
                  case ${virementsProgrammes.frequence}
                    when 'DAILY' then ${virementsProgrammes.montant} * 30
                    when 'WEEKLY' then ${virementsProgrammes.montant} * 4
                    when 'BI_MONTHLY' then ${virementsProgrammes.montant} * 2
                    when 'MONTHLY' then ${virementsProgrammes.montant}
                    when 'QUARTERLY' then ${virementsProgrammes.montant} / 3
                    when 'ONCE' then ${virementsProgrammes.montant}
                    else 0
                  end
                else 0
              end
            )`.mapWith(Number),
            // Weighted volume for transfers created > 30 days ago (Old Baseline)
            oldWeightedVolume: sql<number>`sum(
              case
                when ${virementsProgrammes.actif} = true and ${virementsProgrammes.createdAt} < NOW() - INTERVAL '30 days' then
                  case ${virementsProgrammes.frequence}
                    when 'DAILY' then ${virementsProgrammes.montant} * 30
                    when 'WEEKLY' then ${virementsProgrammes.montant} * 4
                    when 'BI_MONTHLY' then ${virementsProgrammes.montant} * 2
                    when 'MONTHLY' then ${virementsProgrammes.montant}
                    when 'QUARTERLY' then ${virementsProgrammes.montant} / 3
                    when 'ONCE' then ${virementsProgrammes.montant}
                    else 0
                  end
                else 0
              end
            )`.mapWith(Number),
            nextExecution: sql<string>`min(case when ${virementsProgrammes.actif} = true then ${virementsProgrammes.prochaineExecution} else null end)`,
          })
          .from(virementsProgrammes)
          .leftJoin(sourceCompte, eq(virementsProgrammes.compteSourceId, sourceCompte.id))
          .leftJoin(destCompte, eq(virementsProgrammes.compteDestId, destCompte.id))
          .where(whereClause);

        const result = stats[0] || {
          totalCount: 0,
          activeCount: 0,
          pausedCount: 0,
          failedCount: 0,
          currentWeightedVolume: 0,
          oldWeightedVolume: 0,
          nextExecution: null,
        };

        const currentVol = result.currentWeightedVolume || 0;
        const oldVol = result.oldWeightedVolume || 0;
        
        let trend = 0;
        if (oldVol > 0) {
          trend = ((currentVol - oldVol) / oldVol) * 100;
        } else if (currentVol > 0) {
          trend = 100; // 100% growth if started from 0
        }

        res.json({
          totalCount: result.totalCount,
          activeCount: result.activeCount,
          pausedCount: result.pausedCount,
          failedCount: result.failedCount,
          totalVolume: currentVol,
          nextExecution: result.nextExecution,
          trend: Math.round(trend),
          trendUp: trend >= 0
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Error fetching scheduled transfer stats');
        res.status(500).json({ message: "Erreur lors du chargement des statistiques" });
      }
    }
  );
}
