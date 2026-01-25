/**
 * Routes API pour les comptes microfinance
 *
 * Endpoints:
 * - POST   /api/comptes              - Créer un compte (avec validation unique par type)
 * - GET    /api/comptes              - Lister les comptes (filtré par agence)
 * - GET    /api/comptes/:id          - Détails d'un compte
 * - POST   /api/comptes/:id/depot    - Effectuer un dépôt
 * - POST   /api/comptes/:id/retrait  - Effectuer un retrait
 * - POST   /api/comptes/:id/bloquer  - Bloquer un compte
 * - POST   /api/comptes/:id/debloquer - Débloquer un compte
 * - POST   /api/comptes/:id/transfert-agence - Transférer vers une autre agence
 * - GET    /api/comptes/:id/historique-agences - Historique des transferts d'agence
 * - GET    /api/comptes/:id/transactions - Transactions du compte
 * - GET    /api/clients/:id/portfolio - Portfolio complet du client
 */

import type { Express } from "express";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../middleware";
import { logAudit } from "../audit";
import { normalizeKeysDeep, addSnakeCaseAliasesDeep } from "./utils";
import { z } from "zod";
import comptesService, { CompteError } from "../services/comptes";
import { createVirementProgramme, executeCompteTransfer } from "../services/compte-transfers";
import { storage } from "../storage";
import { aliasedTable, and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { comptes, produitsCompte, clients, users, virementsProgrammes } from "@shared/schema";
import { getWsInstance } from "../ws-server";
import { StatutCompte, TypeCompte, MethodePaiement, MotifBlocage } from "@shared/enum/status-constants";

// Validation schemas
const createCompteSchema = z.object({
  clientId: z.string().uuid(),
  typeCompte: z.enum([TypeCompte.SAVINGS, TypeCompte.CURRENT, TypeCompte.BLOCKED]),
  agenceId: z.string().uuid(),
  produitId: z.string().uuid().optional(),
  soldeInitial: z.number().min(0).optional().default(0),
  modePaiement: z.enum([MethodePaiement.CASH, MethodePaiement.TRANSFER]).default(MethodePaiement.CASH),
  compteSourceId: z.string().uuid().optional(), // requis si Virement
  blocageActif: z.boolean().optional(),
  blocageMotif: z.enum([
    MotifBlocage.LOAN_GUARANTEE,
    MotifBlocage.TONTINE_GUARANTEE,
    MotifBlocage.FORCED_SAVINGS,
    MotifBlocage.INTERNAL_DECISION,
    MotifBlocage.DISPUTE,
    MotifBlocage.OTHER,
  ]).optional(),
  blocageReference: z.string().optional(),
});

const depotRetraitSchema = z.object({
  montant: z.number().positive("Le montant doit être positif"),
  methodePaiement: z.string().default(MethodePaiement.CASH),
  sessionCaisseId: z.string().uuid().optional(),
  observations: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const blocageSchema = z.object({
  motif: z.enum([
    MotifBlocage.LOAN_GUARANTEE,
    MotifBlocage.TONTINE_GUARANTEE,
    MotifBlocage.FORCED_SAVINGS,
    MotifBlocage.INTERNAL_DECISION,
    MotifBlocage.DISPUTE,
    MotifBlocage.OTHER,
  ]),
  reference: z.string().optional(),
  dateFin: z.string().datetime().optional(),
});

const deblocageSchema = z.object({
  motif: z.string().optional(),
});

const transfertAgenceSchema = z.object({
  nouvelleAgenceId: z.string().uuid(),
  motif: z.string().optional(),
});

const virementCompteSchema = z.object({
  sourceCompteId: z.string().uuid(),
  destinationCompteId: z.string().uuid().optional(),
  destinationAccountNumber: z.string().min(3).optional(),
  montant: z.coerce.number().positive("Le montant doit etre positif"),
  scheduled: z.boolean().optional().default(false),
  frequence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY"]).optional().default("ONCE"),
});

const updateVirementProgrammeSchema = z.object({
  montant: z.coerce.number().positive().optional(),
  frequence: z.enum(["once", "daily", "weekly", "monthly"]).optional(),
  prochaineExecution: z.string().nullable().optional(),
  actif: z.boolean().optional(),
});

export function registerComptesRoutes(app: Express) {
  // ============================================================================
  // CREATE COMPTE
  // ============================================================================

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * GET /api/comptes/stats - Statistiques globales des comptes
   */
  app.get(
    "/api/comptes/stats",
    requireAuth,
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const agenceId = req.selectedAgenceId;
        
        const conditions = [eq(comptes.statut, StatutCompte.ACTIVE)];
        
        if (agenceId) {
           conditions.push(eq(comptes.agenceId, agenceId));
        }
        
        const whereClause = and(...conditions);

        const allStats = await db.select({
            typeCompte: comptes.typeCompte,
            count: sql<number>`count(*)`.mapWith(Number),
            totalSolde: sql<number>`sum(${comptes.soldeCourant})`.mapWith(Number)
        })
        .from(comptes)
        .where(whereClause)
        .groupBy(comptes.typeCompte);

        const tauxStats = await db.select({
          typeCompte: comptes.typeCompte,
          tauxMoyen: sql<number>`avg(coalesce(${produitsCompte.tauxInteret}, 0))`.mapWith(Number),
        })
        .from(comptes)
        .leftJoin(produitsCompte, eq(comptes.produitId, produitsCompte.id))
        .where(whereClause)
        .groupBy(comptes.typeCompte);

        const tauxByType = Object.fromEntries(
          tauxStats.map((stat) => [stat.typeCompte, Number(stat.tauxMoyen || 0)])
        );

        // Format for frontend
        const totalAccounts = allStats.reduce((sum, s) => sum + s.count, 0);
        const tauxMoyenGlobal =
          totalAccounts > 0
            ? allStats.reduce((sum, s) => sum + (tauxByType[s.typeCompte] || 0) * s.count, 0) / totalAccounts
            : 0;

        const result = {
          total: allStats.reduce((sum, s) => sum + s.count, 0),
          epargne: allStats.find(s => s.typeCompte === TypeCompte.SAVINGS)?.count || 0,
          courant: allStats.find(s => s.typeCompte === TypeCompte.CURRENT)?.count || 0,
          bloque: allStats.find(s => s.typeCompte === TypeCompte.BLOCKED)?.count || 0,
          totalSolde: allStats.reduce((sum, s) => sum + (s.totalSolde || 0), 0),
          tauxMoyenGlobal,
          tauxMoyenEpargne: tauxByType[TypeCompte.SAVINGS] || 0,
          tauxMoyenCourant: tauxByType[TypeCompte.CURRENT] || 0,
          tauxMoyenBloque: tauxByType[TypeCompte.BLOCKED] || 0,
        };

        res.json(result);
      } catch (error) {
        console.error("Error fetching account stats:", error);
        res.status(500).json({ message: "Erreur lors du chargement des statistiques" });
      }
    }
  );

  /**
   * POST /api/comptes - Créer un nouveau compte
   * Validation: Un client ne peut avoir qu'un seul compte par type
   */
  /**
   * POST /api/comptes - Créer un nouveau compte
   * Validation: Un client ne peut avoir qu'un seul compte par type
   */
  app.post(
    "/api/comptes",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    requireAgenceIdAccess(),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const user = req.session.user;

        // Force l'agenceId du client si non spécifié ou pour garantir la cohérence
        if (data.clientId) {
          const client = await storage.getClient(data.clientId);
          if (!client) {
            return res.status(404).json({ message: "Client non trouvé" });
          }
          data.agenceId = client.agenceId;
        }

        const parsed = createCompteSchema.parse(data);

        // Appel au nouveau service qui gère la création conditionnelle
        const result = await comptesService.createCompteWithInitialDeposit(
          {
            clientId: parsed.clientId,
            typeCompte: parsed.typeCompte,
            agenceId: parsed.agenceId,
            produitId: parsed.produitId,
            montantInitial: parsed.soldeInitial,
            modePaiement: parsed.modePaiement,
            compteSourceId: parsed.compteSourceId,
            blocageActif: parsed.blocageActif,
            blocageMotif: parsed.blocageMotif,
          },
          user?.id!
        );

        // Traiter la configuration de versement automatique si activée (sur le compte créé)
        if (data.versementAutoActif && result.compte) {
          const { calculateNextTransferDate } = await import("../services/automatic-transfers-service");
          
          const prochainVersement = calculateNextTransferDate(
            data.versementAutoFrequence || 'Mensuel',
            data.versementAutoJour || 28
          );
          
          await db.update(comptes)
            .set({
              versementAutoActif: true,
              versementAutoMontant: data.versementAutoMontant,
              versementAutoFrequence: data.versementAutoFrequence,
              versementAutoJour: data.versementAutoJour,
              compteSourceId: data.compteSourceId,
              prochainVersementAuto: prochainVersement,
            })
            .where(eq(comptes.id, result.compte.id));
        }

        await logAudit(
          req,
          "CREATE_COMPTE",
          "compte",
          result.compte.id,
          { 
            statut: result.compte.statut, 
            montantInitial: parsed.soldeInitial,
            modePaiement: parsed.modePaiement 
          },
          "success",
          "medium"
        );

        // Broadcast pour mise à jour UI
        const wsInstance = getWsInstance();
        if (wsInstance) {
          wsInstance.broadcast({
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
          
          if (result.facture) {
             // Notifier la facture disponible
          }
        }

        res.status(201).json(addSnakeCaseAliasesDeep(result));
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.name === "ZodError") {
          return res.status(400).json({
            message: "Données invalides",
            details: error.errors,
          });
        }
        console.error("Error creating compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // LIST & GET COMPTES
  // ============================================================================

  /**
   * GET /api/comptes - Lister les comptes avec clients, recherche et pagination
   * Query params: search, page, limit, typeCompte
   */
  app.get(
    "/api/comptes",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agence?: string } | null;
        const filter = agenceFilter ? { agence: agenceFilter.agence } : {};

        // Parse query parameters
        const options = {
          search: req.query.search as string | undefined,
          page: req.query.page ? parseInt(req.query.page as string) : 1,
          limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
          typeCompte: req.query.typeCompte as string | undefined,
          statut: req.query.statut as string | undefined,
        };

        const result = await storage.getAllComptesWithClients(filter, options);
        res.json(result);
      } catch (error: any) {
        console.error("Error listing comptes:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/accounts/check/:accountNumber - Vérifier un compte par numéro
   * Retourne uniquement le nom/prénom pour confidentialité
   */
  app.get(
    "/api/accounts/check/:accountNumber",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const accountNumber = String(req.params.accountNumber || '').trim();
        if (!accountNumber) {
          return res.status(400).json({ message: "Numéro de compte requis" });
        }

        const agenceId = req.selectedAgenceId;
        const conditions: any[] = [eq(comptes.numeroCompte, accountNumber)];
        if (agenceId) {
          conditions.push(eq(comptes.agenceId, agenceId));
        }

        const [result] = await db
          .select({
            userNom: users.nom,
            userPrenom: users.prenom,
          })
          .from(comptes)
          .leftJoin(clients, eq(comptes.clientId, clients.id))
          .leftJoin(users, eq(clients.userId, users.id))
          .where(and(...conditions))
          .limit(1);

        if (!result) {
          return res.status(404).json({ message: "Compte introuvable" });
        }

        const ownerName = `${result.userNom || ''} ${result.userPrenom || ''}`.trim();
        return res.json({
          found: true,
          accountNumber,
          ownerName: ownerName || 'Compte trouvé',
        });
      } catch (error: any) {
        console.error("Error checking account number:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/comptes/pending-activation - Lister les comptes en attente d'activation (pour encaissement)
   * Tri: FIFO (plus ancien en premier)
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
            const conditions: any[] = [eq(comptes.statut, StatutCompte.PENDING_ACTIVATION)];

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
                    montantInitial: comptes.soldeCourant,
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

                return {
                    id: r.id,
                    numeroCompte: r.numeroCompte,
                    typeCompte: r.typeCompte,
                    montantInitial: parseFloat(r.montantInitial || '0'),
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
            console.error("Error fetching pending activations:", error);
            res.status(500).json({ message: "Erreur lors du chargement des activations en attente" });
        }
    }
  );

  /**
   * GET /api/produits-compte - Liste des produits de compte (taux d'intérêt au niveau produit)
   */
  app.get("/api/produits-compte", requireAuth, requireAgenceAccess(), async (req, res) => {
    try {
      const typeCompte = req.query.typeCompte as string | undefined;
      const actifOnly = req.query.actif !== 'false';

      const conditions: any[] = [];
      if (actifOnly) conditions.push(eq(produitsCompte.actif, true));
      if (typeCompte) conditions.push(eq(produitsCompte.typeCompte, typeCompte as any));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const produits = whereClause
        ? await db.select().from(produitsCompte).where(whereClause)
        : await db.select().from(produitsCompte);

      res.json(addSnakeCaseAliasesDeep(produits));
    } catch (error: any) {
      console.error("Error listing produits compte:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/comptes/transferts - Virement interne immediat ou programme
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
          });

          return res.status(201).json(
            addSnakeCaseAliasesDeep({
              scheduled: true,
              schedule,
            })
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
        console.error("Error compte transfer:", error);
        res.status(400).json({ message: error.message || "Erreur transfert" });
      }
    }
  );

  /**
   * GET /api/comptes/transferts-programmes/stats - Statistiques des virements programmés
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
            // Weighted volume for ALL active transfers
            currentWeightedVolume: sql<number>`sum(
              case 
                when ${virementsProgrammes.actif} = true then 
                  case ${virementsProgrammes.frequence}
                    when 'daily' then ${virementsProgrammes.montant} * 30
                    when 'weekly' then ${virementsProgrammes.montant} * 4
                    when 'monthly' then ${virementsProgrammes.montant}
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
                    when 'daily' then ${virementsProgrammes.montant} * 30
                    when 'weekly' then ${virementsProgrammes.montant} * 4
                    when 'monthly' then ${virementsProgrammes.montant}
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
        console.error("Error fetching scheduled transfer stats:", error);
        res.status(500).json({ message: "Erreur lors du chargement des statistiques" });
      }
    }
  );

  /**
   * GET /api/comptes/transferts-programmes - Lister les virements programmés
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
          addSnakeCaseAliasesDeep({
            data: schedules,
            pagination: {
              page,
              limit,
              total: Number(countResult?.count || 0),
              totalPages: Math.ceil(Number(countResult?.count || 0) / limit),
            },
          })
        );
      } catch (error: any) {
        console.error("Error listing scheduled transfers:", error);
        res.status(500).json({ message: error.message || "Erreur chargement virements programmes" });
      }
    }
  );

  /**
   * PATCH /api/comptes/transferts-programmes/:id - Mettre à jour un virement programmé
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

        res.json(addSnakeCaseAliasesDeep(updated));
      } catch (error: any) {
        if (error.name === "ZodError") {
          return res.status(400).json({
            message: "Données invalides",
            details: error.errors,
          });
        }
        console.error("Error updating scheduled transfer:", error);
        res.status(500).json({ message: error.message || "Erreur mise à jour virement programmé" });
      }
    }
  );

  /**
   * GET /api/comptes-bloques - Liste des comptes de type "Bloqué"
   * Retourne les comptes avec type_compte = "Bloqué" pour la section Comptes Bloqués
   */
  app.get(
    "/api/comptes-bloques",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agence?: string } | null;
        const filter = agenceFilter ? { agence: agenceFilter.agence } : {};

        // Get all blocked accounts
        const result = await storage.getAllComptesWithClients(filter, {
          typeCompte: TypeCompte.BLOCKED,
          page: 1,
          limit: 100, // Get all blocked accounts
        });

        // Transform to match expected frontend interface
        const comptesTransformed = result.data.map((compte: any) => ({
          id: compte.id,
          numero_compte: compte.numeroCompte || compte.numero_compte,
          montant_initial: parseFloat(compte.soldeCourant || compte.solde_courant || '0'),
          montant_actuel: parseFloat(compte.soldeCourant || compte.solde_courant || '0'),
          taux_interet: 0, // Not applicable for blocked accounts in this schema
          date_ouverture: compte.createdAt || compte.created_at,
          date_echeance: compte.blocageFin || compte.blocage_fin || null,
          duree_mois: 0,
          statut: compte.statut,
          clients: compte.clients,
        }));

        res.json(addSnakeCaseAliasesDeep(comptesTransformed));
      } catch (error: any) {
        console.error("Error listing comptes bloqués:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/comptes-bloques/:id - Détail d'un compte bloqué
   * Utilise le format spécifique attendu par le frontend (CompteBloqueDetail)
   */
  app.get(
    "/api/comptes-bloques/:id",
    requireAuth,
    requireAgenceAccess(),
    async (req, res) => {
      try {
        const compte = await storage.getCompte(req.params.id);
        if (!compte) {
          return res.status(404).json({ message: "Compte non trouvé" });
        }

        // Vérifier si c'est bien un compte bloqué ?
        // if (compte.typeCompte !== 'Bloqué') ... (Optionnel mais sécurisé)

        const client = await storage.getClient(compte.clientId);
        
        // Structure alignée avec CompteBloqueDetail.tsx
        // Note: tauxInteret et description ne sont pas dans la table comptes,
        // ils viendraient de produitsCompte si un produit est lié
        const transformed = {
          id: compte.id,
          numero_compte: compte.numeroCompte,
          montant_initial: parseFloat(compte.soldeCourant || '0'),
          montant_actuel: parseFloat(compte.soldeCourant || '0'),
          taux_interet: 0, // TODO: récupérer depuis produit si compte.produitId existe
          date_ouverture: compte.createdAt,
          date_echeance: compte.blocageFin || null,
          duree_mois: compte.blocageFin
            ? Math.round((new Date(compte.blocageFin).getTime() - new Date(compte.createdAt!).getTime()) / (1000 * 60 * 60 * 24 * 30))
            : 0,
          statut: compte.statut,
          penalite_retrait_anticipe: 5, // Default penalty
          clients: client ? {
             id: client.id,
             nom: client.nom,
             prenom: client.prenom,
             phone: client.telephone,
          } : null,
          description: compte.blocageMotif || null // Use blocageMotif as description
        };

        res.json(addSnakeCaseAliasesDeep(transformed));
      } catch (error: any) {
        console.error("Error getting compte bloque detail:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  /**
   * GET /api/comptes/:id - Détails d'un compte avec permissions
   */
  app.get("/api/comptes/:id", requireAuth, async (req, res) => {
    try {
      const compte = await storage.getCompte(req.params.id);
      if (!compte) {
        return res.status(404).json({ message: "Compte non trouvé" });
      }

      // Ajouter les informations de permission de retrait
      const withdrawalCheck = comptesService.canWithdraw(compte);
      const depositCheck = comptesService.canDeposit(compte);

      res.json(
        addSnakeCaseAliasesDeep({
          ...compte,
          permissions: {
            canWithdraw: withdrawalCheck.allowed,
            withdrawalBlockedReason: withdrawalCheck.reason,
            canDeposit: depositCheck.allowed,
            depositBlockedReason: depositCheck.reason,
          },
        })
      );
    } catch (error: any) {
      console.error("Error getting compte:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // DEPOT / RETRAIT
  // ============================================================================

  /**
   * POST /api/comptes/:id/depot - Effectuer un dépôt
   * Les dépôts sont toujours autorisés (même sur compte bloqué)
   */
  app.post(
    "/api/comptes/:id/depot",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = depotRetraitSchema.parse(data);
        const user = req.session.user;

        // Si pas de sessionCaisseId fourni, essayer de récupérer la session active
        let sessionCaisseId = parsed.sessionCaisseId;
        if (!sessionCaisseId && user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }

        const result = await comptesService.deposerSurCompte(
          {
            compteId: req.params.id,
            montant: parsed.montant,
            methodePaiement: parsed.methodePaiement,
            sessionCaisseId,
            observations: parsed.observations,
            idempotencyKey: parsed.idempotencyKey,
          },
          user?.id
        );

        await logAudit(
          req,
          "DEPOT_COMPTE",
          "compte",
          req.params.id,
          { montant: parsed.montant },
          "success",
          "medium"
        );

        // Broadcast temps réel (outbox worker gère le reste)
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Dépôt: ${parsed.montant.toLocaleString()} FCFA`,
              user: user.nom || "Système",
              type: "savings",
              timestamp: new Date().toISOString(),
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
        }

        res.json(
          addSnakeCaseAliasesDeep({
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            message: "Dépôt effectué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.message?.includes("Duplicate idempotency")) {
          return res.status(409).json({
            message: "Opération déjà effectuée (doublon détecté)",
            code: "DUPLICATE_OPERATION",
          });
        }
        console.error("Error depot:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/depot-initial - Payer le dépôt initial (Activation)
   * Réservé aux caissiers avec session active
   */
  app.post(
    "/api/comptes/:id/depot-initial",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
    requireAgenceAccess(),
    async (req, res) => {
        try {
            const data = normalizeKeysDeep(req.body) as any;

            // Validation stricte du montant et session
            if (!data.montant || Number(data.montant) <= 0) {
                return res.status(400).json({ message: "Montant invalide" });
            }
            if (!data.sessionCaisseId) {
                 return res.status(400).json({ message: "Session de caisse requise" });
            }

            const result = await comptesService.payerDepotInitialCompte(
                req.params.id,
                {
                    montant: Number(data.montant),
                    sessionCaisseId: data.sessionCaisseId,
                    userId: req.session.user!.id
                }
            );
            
            // Logs & Broadcast...
            await logAudit(req, "DEPOT_INITIAL", "compte", req.params.id, { montant: data.montant }, "success", "high");
             
             // Broadcast temps réel
            const wsInstance = getWsInstance();
            if (wsInstance && req.session.user?.agence) {
              wsInstance.broadcastToAgency(req.session.user.agence, {
                type: "LIVE_ACTIVITY",
                payload: {
                  action: `Activation Compte: ${result.compte.numeroCompte}`,
                  user: req.session.user.nom || "Système",
                  type: "account_activation",
                  timestamp: new Date().toISOString(),
                },
              });
               wsInstance.broadcastToAgency(req.session.user.agence, {
                type: "DASHBOARD_UPDATE",
                payload: {},
              });
            }

            res.json(addSnakeCaseAliasesDeep(result));
        } catch (error: any) {
             console.error("Error depot initial:", error);
             const message = error.message || "Erreur serveur";
             
             if (message.includes("Compte introuvable")) {
                 return res.status(404).json({ message });
             }
             if (message.includes("n'est pas en attente") || message.includes("Montant invalide")) {
                 return res.status(400).json({ message });
             }
             
             res.status(500).json({ message });
        }
    }
  );

  /**
   * POST /api/comptes/:id/retrait - Effectuer un retrait
   * CRITIQUE: Vérifie les règles de blocage pour les comptes bloqués
   */
  app.post(
    "/api/comptes/:id/retrait",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CAISSE_OPERATION),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = depotRetraitSchema.parse(data);
        const user = req.session.user;

        // Si pas de sessionCaisseId fourni, essayer de récupérer la session active
        let sessionCaisseId = parsed.sessionCaisseId;
        if (!sessionCaisseId && user) {
          const activeSession = await storage.getActiveSessionForUser(user.id);
          if (activeSession) {
            sessionCaisseId = activeSession.id;
          }
        }

        const result = await comptesService.retirerDuCompte(
          {
            compteId: req.params.id,
            montant: parsed.montant,
            methodePaiement: parsed.methodePaiement,
            sessionCaisseId,
            observations: parsed.observations,
            idempotencyKey: parsed.idempotencyKey,
          },
          user?.id
        );

        await logAudit(
          req,
          "RETRAIT_COMPTE",
          "compte",
          req.params.id,
          { montant: parsed.montant },
          "success",
          "high"
        );

        // Broadcast temps réel
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Retrait de ${parsed.montant.toLocaleString()} FCFA effectué`,
              targetRole: "admin",
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "LIVE_ACTIVITY",
            payload: {
              action: `Retrait: ${parsed.montant.toLocaleString()} FCFA`,
              user: user.nom || "Système",
              type: "payment",
              timestamp: new Date().toISOString(),
            },
          });
          wsInstance.broadcastToAgency(user.agence, {
            type: "DASHBOARD_UPDATE",
            payload: {},
          });
        }

        res.json(
          addSnakeCaseAliasesDeep({
            transaction: result.transaction,
            mouvement_id: result.mouvement.id,
            message: "Retrait effectué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          // Codes spécifiques pour le frontend
          const statusCode =
            error.code === "WITHDRAWAL_NOT_ALLOWED" ||
            error.code === "INSUFFICIENT_BALANCE"
              ? 403
              : 400;
          return res.status(statusCode).json({
            message: error.message,
            code: error.code,
          });
        }
        if (error.message?.includes("Duplicate idempotency")) {
          return res.status(409).json({
            message: "Opération déjà effectuée (doublon détecté)",
            code: "DUPLICATE_OPERATION",
          });
        }
        console.error("Error retrait:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // BLOCAGE / DEBLOCAGE
  // ============================================================================

  /**
   * POST /api/comptes/:id/bloquer - Bloquer un compte
   */
  app.post(
    "/api/comptes/:id/bloquer",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = blocageSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.bloquerCompte(
          req.params.id,
          parsed.motif,
          parsed.reference,
          parsed.dateFin ? new Date(parsed.dateFin) : undefined,
          user?.id
        );

        await logAudit(
          req,
          "BLOQUER_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte bloqué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error bloquer compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * POST /api/comptes/:id/debloquer - Débloquer un compte
   * CRITIQUE: Tracé et événement temps réel obligatoire
   */
  app.post(
    "/api/comptes/:id/debloquer",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = deblocageSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.debloquerCompte(
          {
            compteId: req.params.id,
            motif: parsed.motif,
          },
          user?.id
        );

        await logAudit(
          req,
          "DEBLOQUER_COMPTE",
          "compte",
          req.params.id,
          { motif: parsed.motif },
          "success",
          "high"
        );

        // Notification explicite (en plus de l'outbox)
        const wsInstance = getWsInstance();
        if (wsInstance && user?.agence) {
          wsInstance.broadcastToAgency(user.agence, {
            type: "NOTIFICATION",
            payload: {
              message: `Compte ${compte.numeroCompte} débloqué`,
              type: "success",
            },
          });
        }

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte débloqué avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error debloquer compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  // ============================================================================
  // TRANSFERT INTER-AGENCE
  // ============================================================================

  /**
   * POST /api/comptes/:id/transfert-agence - Transférer vers une autre agence
   * Historisé via compte_agences_historique
   */
  app.post(
    "/api/comptes/:id/transfert-agence",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body);
        const parsed = transfertAgenceSchema.parse(data);
        const user = req.session.user;

        const compte = await comptesService.transfererCompteAgence(
          {
            compteId: req.params.id,
            nouvelleAgenceId: parsed.nouvelleAgenceId,
            motif: parsed.motif,
          },
          user?.id
        );

        await logAudit(
          req,
          "TRANSFERT_COMPTE_AGENCE",
          "compte",
          req.params.id,
          { nouvelleAgenceId: parsed.nouvelleAgenceId },
          "success",
          "high"
        );

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte transféré avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error transfert agence:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/historique-agences - Historique des transferts d'agence
   */
  app.get(
    "/api/comptes/:id/historique-agences",
    requireAuth,
    async (req, res) => {
      try {
        const historique = await comptesService.getCompteAgenceHistorique(
          req.params.id
        );
        res.json(addSnakeCaseAliasesDeep(historique));
      } catch (error: any) {
        console.error("Error getting historique agences:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  // ============================================================================
  // TRANSACTIONS & PORTFOLIO
  // ============================================================================

  /**
   * GET /api/comptes/:id/transactions - Transactions du compte
   */
  app.get("/api/comptes/:id/transactions", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const transactions = await comptesService.getCompteTransactions(
        req.params.id,
        limit
      );
      res.json(addSnakeCaseAliasesDeep(transactions));
    } catch (error: any) {
      console.error("Error getting transactions:", error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/clients/:id/portfolio - Portfolio complet du client
   * Retourne: comptes, crédits, tontines, totaux
   */
  app.get("/api/clients/:id/portfolio", requireAuth, async (req, res) => {
    try {
      const portfolio = await comptesService.getClientPortfolio(req.params.id);
      res.json(addSnakeCaseAliasesDeep(portfolio));
    } catch (error: any) {
      console.error("Error getting portfolio:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // STATS & CLOTURE
  // ============================================================================

  /**
   * POST /api/comptes/:id/cloturer - Clôturer un compte définitivement
   */
  app.post(
    "/api/comptes/:id/cloturer",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.COMPTE),
    async (req, res) => {
      try {
        const user = req.session.user;
        const compte = await comptesService.cloturerCompte(
          req.params.id,
          user?.id
        );

        await logAudit(
          req,
          "CLOTURER_COMPTE",
          "compte",
          req.params.id,
          undefined,
          "success",
          "critical"
        );

        res.json(
          addSnakeCaseAliasesDeep({
            ...compte,
            message: "Compte clôturé avec succès",
          })
        );
      } catch (error: any) {
        if (error instanceof CompteError) {
          // Specific error codes to help frontend (BALANCE_NOT_ZERO, PENDING_TRANSACTIONS...)
          return res.status(400).json({
            message: error.message,
            code: error.code,
          });
        }
        console.error("Error cloturer compte:", error);
        res.status(500).json({ message: error.message || "Erreur serveur" });
      }
    }
  );

  /**
   * GET /api/comptes/:id/stats - Statistiques d'évolution du solde
   * Query: period (1M, 3M, 6M, 1Y)
   */
  app.get("/api/comptes/:id/stats", requireAuth, async (req, res) => {
    try {
      const period = (req.query.period as '1M' | '3M' | '6M' | '1Y') || '1M';
      // Basic validation of period
      if (!['1M', '3M', '6M', '1Y'].includes(period)) {
        return res.status(400).json({ message: "Période invalide" });
      }

      const stats = await comptesService.getCompteStats(req.params.id, period);
      res.json(stats); // Already JSON structure
    } catch (error: any) {
      console.error("Error getting stats:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // VALIDATION ENDPOINT (pour le frontend)
  // ============================================================================

  /**
   * GET /api/clients/:id/can-create-compte/:type - Vérifie si le client peut créer ce type de compte
   */
  app.get(
    "/api/clients/:id/can-create-compte/:type",
    requireAuth,
    async (req, res) => {
      try {
        const { id, type } = req.params;
        const validTypes = [TypeCompte.SAVINGS, TypeCompte.CURRENT, TypeCompte.BLOCKED];

        if (!validTypes.includes(type as any)) {
          return res.status(400).json({
            message: "Type de compte invalide",
            allowed: false,
          });
        }

        const hasExisting = await comptesService.clientHasCompteOfType(
          id,
          type as typeof TypeCompte[keyof typeof TypeCompte]
        );

        res.json({
          allowed: !hasExisting,
          reason: hasExisting
            ? `Le client possède déjà un compte ${type}`
            : null,
        });
      } catch (error: any) {
        console.error("Error checking compte eligibility:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );
}
