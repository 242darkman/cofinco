/**
 * Reevaluation API Routes
 * 
 * Handles all HTTP endpoints for credit reevaluation workflow.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { 
  createReevaluation,
  validateEligibility,
  startEnqueteComplementaire,
  submitToCommittee,
  recordCommitteeDecision,
  cancelReevaluation,
  getReevaluationById,
  getReevaluationsByDemande,
  getAuditLogs,
  getDemandeById,
  getConfigReevaluation
} from "../services/reevaluation-service";
import { checkEligibilityQuick, CreateReevaluationPayload } from "../services/reevaluation-validator";
import { db } from "../db";
import { reevaluationsCredit, enquetesComplementaires, demandesCredit, enquetesCredit, credits } from "@shared/schema/finance";
import { clients } from "@shared/schema/clients";
import { users } from "@shared/schema/auth";
import { eq, desc, sql } from "drizzle-orm";

// Validation schemas
const createReevaluationSchema = z.object({
  elementsNouveaux: z.array(z.object({
    type: z.string(),
    description: z.string().default(""),  // Allow empty descriptions
    valeurAjoutee: z.number().optional(),
    documents: z.array(z.string()).optional()
  })).min(1, "Au moins un élément nouveau requis"),
  justification: z.string().min(10, "Justification doit contenir au moins 10 caractères"),
  nouveauMontantDemande: z.number().optional(),
  nouvelleDureeValeur: z.number().optional(),
  nouvelleDureeUnite: z.enum(["Jour", "Semaine", "Mois"]).optional(),
  nouvelleFrequence: z.string().optional(),
  garantiesAdditionnelles: z.array(z.object({
    type: z.string().default(""),  // Allow empty type
    description: z.string().default(""),  // Allow empty description
    valeurEstimee: z.number().default(0),  // Default to 0
    documents: z.array(z.string()).optional()
  })).optional().default([]),
  coEmprunteur: z.object({
    clientId: z.string().optional(),
    nom: z.string().optional(),
    relation: z.string(),
    revenusMensuels: z.number(),
    consentement: z.boolean()
  }).optional(),
  documentsJoints: z.array(z.string()).optional().default([])
});

const validateEligibilitySchema = z.object({
  override: z.boolean().optional(),
  motifOverride: z.string().optional()
});

const startEnqueteSchema = z.object({
  objectifEnquete: z.string().min(10),
  pointsAVerifier: z.array(z.string()),
  enqueteurId: z.string().uuid()
});

const submitToCommitteeSchema = z.object({
  membresConvoques: z.array(z.string().uuid()),
  notePreparatoire: z.string().optional()
});

const committeeDecisionSchema = z.object({
  decision: z.enum(["Approuvée", "Rejetée définitivement", "Montant réduit"]),
  montantApprouve: z.number().optional(),
  commentaire: z.string().min(10, "Commentaire requis"),
  membresPresents: z.array(z.string().uuid()),
  conditionsSpeciales: z.string().optional()
});

const cancelSchema = z.object({
  motif: z.string().min(10, "Motif d'annulation requis")
});

/**
 * Register all reevaluation routes
 */
export function registerReevaluationRoutes(app: Express) {
  
  // ========================================
  // DEMANDE-LEVEL ENDPOINTS
  // ========================================
  
  /**
   * GET /api/demandes/:demandeId/reevaluation-eligibility
   * Quick eligibility check for UI
   */
  app.get("/api/demandes/:demandeId/reevaluation-eligibility", async (req: Request, res: Response) => {
    try {
      const { demandeId } = req.params;
      
      const demande = await getDemandeById(demandeId);
      if (!demande) {
        return res.status(404).json({ 
          success: false, 
          error: { code: "DEMANDE_NOT_FOUND", message: "Demande introuvable" } 
        });
      }
      
      const config = await getConfigReevaluation();
      const eligibility = checkEligibilityQuick(demande, config);
      
      res.json({
        success: true,
        ...eligibility
      });
    } catch (error: any) {
      console.error("Error checking eligibility:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "SERVER_ERROR", message: error.message } 
      });
    }
  });
  
  /**
   * POST /api/demandes/:demandeId/reevaluations
   * Create a new reevaluation request
   */
  app.post("/api/demandes/:demandeId/reevaluations", requireAuth, async (req: Request, res: Response) => {
    try {
      const { demandeId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: { code: "UNAUTHORIZED", message: "Authentification requise" } 
        });
      }
      
      // Validate request body
      const parsed = createReevaluationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Données invalides",
            details: parsed.error.errors
          }
        });
      }
      
      const result = await createReevaluation(
        demandeId,
        parsed.data as CreateReevaluationPayload,
        userId,
        {
          ipAddress: req.ip,
          userAgent: req.get("User-Agent")
        }
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.errors?.[0] || { code: "CREATION_FAILED", message: "Échec de création" }
        });
      }
      
      // Get eligibility info for response
      const demande = await getDemandeById(demandeId);
      const config = await getConfigReevaluation();
      const eligibility = demande ? checkEligibilityQuick(demande, config) : null;
      
      res.status(201).json({
        success: true,
        reevaluation: result.reevaluation,
        eligibilite: eligibility ? {
          verificationEnCours: true,
          resultatsEstimes: eligibility
        } : null
      });
    } catch (error: any) {
      console.error("Error creating reevaluation:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "SERVER_ERROR", message: error.message } 
      });
    }
  });
  
  /**
   * GET /api/demandes/:demandeId/reevaluations
   * List all reevaluations for a demande
   */
  app.get("/api/demandes/:demandeId/reevaluations", async (req: Request, res: Response) => {
    try {
      const { demandeId } = req.params;
      
      const reevaluations = await getReevaluationsByDemande(demandeId);
      
      res.json({
        success: true,
        reevaluations
      });
    } catch (error: any) {
      console.error("Error fetching reevaluations:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "SERVER_ERROR", message: error.message } 
      });
    }
  });
  
  /**
   * GET /api/demandes/:demandeId/timeline
   * Get complete timeline for a demande including all reevaluations
   */
  app.get("/api/demandes/:demandeId/timeline", async (req: Request, res: Response) => {
    try {
      const { demandeId } = req.params;
      
      // Get demande with client info
      const demande = await getDemandeById(demandeId);
      if (!demande) {
        return res.status(404).json({ 
          success: false, 
          error: { code: "DEMANDE_NOT_FOUND", message: "Demande introuvable" } 
        });
      }
      
      // Get client
      const [client] = await db.select().from(clients).where(eq(clients.id, demande.clientId));
      
      // Get all reevaluations
      const reevaluations = await getReevaluationsByDemande(demandeId);
      
      // Get linked enquete and credit
      const [enquete] = await db.select().from(enquetesCredit).where(eq(enquetesCredit.demandeId, demandeId));
      const [credit] = enquete ? await db.select().from(credits).where(eq(credits.enqueteId, enquete.id)) : [undefined];
      
      // Build timeline events
      const timeline: any[] = [];
      
      // 1. Demande creation
      timeline.push({
        id: `demande-created-${demande.id}`,
        type: 'DEMANDE',
        date: demande.createdAt,
        titre: 'Demande créée',
        description: `Demande de crédit de ${demande.montantDemande} FCFA`,
        statut: 'En attente'
      });
      
      // 2. Enquete
      if (enquete) {
        timeline.push({
          id: `enquete-${enquete.id}`,
          type: 'ENQUETE',
          date: enquete.createdAt,
          titre: 'Enquête réalisée',
          description: `Score global: ${enquete.scoreGlobal ?? 'N/A'}/100`,
          statut: enquete.statut
        });
      }

      // 3. Rejet initial (if any)
      if (demande.dateRejet) {
        timeline.push({
          id: `demande-rejet-${demande.id}`,
          type: 'DECISION',
          date: demande.dateRejet,
          titre: 'Demande rejetée',
          description: demande.motifRejet || 'Aucun motif précisé',
          statut: 'Rejetée'
        });
      }
      
      // 4. Reevaluations & Decisions
      for (const reeval of reevaluations) {
        // Reevaluation request
        timeline.push({
          id: `reeval-${reeval.id}`,
          type: 'REEVALUATION',
          date: reeval.createdAt,
          titre: `Réévaluation #${reeval.numeroVersion}`,
          description: `Nouveaux éléments: ${((reeval.elementsNouveaux as any[]) || []).map(e => e.type).join(', ')}`,
          statut: reeval.statut,
           details: {
            numeroReevaluation: reeval.numeroReevaluation,
            scoreAvant: reeval.scoreRejetInitial,
            scoreApres: reeval.nouveauScore,
            deltaScore: reeval.deltaScore
          }
        });
        
        // Committee Decision
        if (reeval.dateDecisionComite && reeval.decisionComite) {
             timeline.push({
                id: `reeval-decision-${reeval.id}`,
                type: 'DECISION',
                date: reeval.dateDecisionComite,
                titre: `Décision Comité #${reeval.numeroVersion}`,
                description: `Décision: ${reeval.decisionComite} ${reeval.commentaireComite ? `- ${reeval.commentaireComite}` : ''}`,
                statut: reeval.decisionComite
            });
        }
      }

      // 5. Disbursement (Credit created)
      if (credit) {
         timeline.push({
            id: `credit-disbursed-${credit.id}`,
            type: 'DECAISSEMENT',
            date: credit.createdAt,
            titre: 'Crédit décaissé',
            description: `Montant financé: ${credit.montant} FCFA`,
            statut: 'Actif'
         });
      }
      
      // Sort by date
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      res.json({
        success: true,
        demande: {
          id: demande.id,
          numeroDemande: demande.numeroDemande,
          client: client ? {
            id: client.id,
            nom: client.nom,
            prenom: client.prenom
          } : null,
          montantInitial: demande.montantDemande,
          statutActuel: demande.statut
        },
        timeline,
        reevaluations: reevaluations.map(r => ({
          id: r.id,
          numero: r.numeroReevaluation,
          version: r.numeroVersion,
          statut: r.statut,
          dateCreation: r.createdAt,
          dateCloture: r.dateDecisionComite,
          elementsNouveaux: r.elementsNouveaux,
          scoreAvant: r.scoreRejetInitial,
          scoreApres: r.nouveauScore,
          decision: r.decisionComite
        })),
        statistiques: {
          nombreReevaluations: reevaluations.length
        }
      });
    } catch (error: any) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "SERVER_ERROR", message: error.message } 
      });
    }
  });
  
  // ========================================
  // REEVALUATION-LEVEL ENDPOINTS
  // ========================================
  
  /**
   * GET /api/reevaluations/:reevaluationId
   * Get single reevaluation with details
   */
  app.get("/api/reevaluations/:reevaluationId", async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      
      const reevaluation = await getReevaluationById(reevaluationId);
      if (!reevaluation) {
        return res.status(404).json({ 
          success: false, 
          error: { code: "REEVALUATION_NOT_FOUND", message: "Réévaluation introuvable" } 
        });
      }
      
      // Get related data
      const demande = await getDemandeById(reevaluation.demandeId);
      const [client] = demande 
        ? await db.select().from(clients).where(eq(clients.id, demande.clientId))
        : [null];
      
      res.json({
        success: true,
        reevaluation,
        demande,
        client
      });
    } catch (error: any) {
      console.error("Error fetching reevaluation:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "SERVER_ERROR", message: error.message } 
      });
    }
  });
  
  /**
   * POST /api/reevaluations/:reevaluationId/eligibility/validate
   * Validate eligibility for a reevaluation
   */
  app.post("/api/reevaluations/:reevaluationId/eligibility/validate", requireAuth, async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: { code: "UNAUTHORIZED", message: "Authentification requise" } 
        });
      }
      
      const parsed = validateEligibilitySchema.safeParse(req.body);
      const override = parsed.success ? { 
        force: parsed.data.override || false, 
        motif: parsed.data.motifOverride 
      } : undefined;
      
      const result = await validateEligibility(reevaluationId, userId, override);
      
      res.json({
        success: true,
        eligibilite: {
          estEligible: result.statut === 'Autorisée',
          motifRefus: result.motifRefus
        },
        reevaluation: {
          id: reevaluationId,
          statut: result.statut
        }
      });
    } catch (error: any) {
      console.error("Error validating eligibility:", error);
      res.status(400).json({ 
        success: false, 
        error: { code: "VALIDATION_FAILED", message: error.message } 
      });
    }
  });
  
  /**
   * POST /api/reevaluations/:reevaluationId/enquete-complementaire
   * Start a complementary inquiry
   */
  app.post("/api/reevaluations/:reevaluationId/enquete-complementaire", requireAuth, async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: { code: "UNAUTHORIZED", message: "Authentification requise" } 
        });
      }
      
      const parsed = startEnqueteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Données invalides",
            details: parsed.error.errors
          }
        });
      }
      
      const result = await startEnqueteComplementaire(
        reevaluationId,
        parsed.data.objectifEnquete,
        parsed.data.pointsAVerifier,
        parsed.data.enqueteurId,
        userId
      );
      
      res.status(201).json({
        success: true,
        enquete: result.enquete
      });
    } catch (error: any) {
      console.error("Error starting enquete:", error);
      res.status(400).json({ 
        success: false, 
        error: { code: "ENQUETE_FAILED", message: error.message } 
      });
    }
  });
  
  /**
   * POST /api/reevaluations/:reevaluationId/submit-to-committee
   * Submit reevaluation to committee
   */
  app.post("/api/reevaluations/:reevaluationId/submit-to-committee", requireAuth, async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: { code: "UNAUTHORIZED", message: "Authentification requise" } 
        });
      }
      
      const parsed = submitToCommitteeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Données invalides",
            details: parsed.error.errors
          }
        });
      }
      
      const result = await submitToCommittee(
        reevaluationId,
        parsed.data.membresConvoques,
        parsed.data.notePreparatoire,
        userId
      );
      
      const reevaluation = await getReevaluationById(reevaluationId);
      
      res.json({
        success: true,
        reevaluation: {
          id: reevaluationId,
          statut: 'En comité'
        },
        scoring: result.scoring,
        comparatif: reevaluation ? {
          initial: {
            montant: reevaluation.montantInitialDemande,
            score: reevaluation.scoreRejetInitial,
            dateRejet: reevaluation.dateRejetInitial,
            motifRejet: reevaluation.motifRejetInitial
          },
          reevaluation: {
            montant: reevaluation.nouveauMontantDemande,
            score: reevaluation.nouveauScore,
            deltaMontant: Number(reevaluation.montantInitialDemande) - Number(reevaluation.nouveauMontantDemande || reevaluation.montantInitialDemande),
            deltaScore: reevaluation.deltaScore,
            elementsNouveaux: reevaluation.elementsNouveaux
          }
        } : null
      });
    } catch (error: any) {
      console.error("Error submitting to committee:", error);
      res.status(400).json({ 
        success: false, 
        error: { code: "SUBMISSION_FAILED", message: error.message } 
      });
    }
  });
  
  /**
   * POST /api/reevaluations/:reevaluationId/committee-decision
   * Record committee decision
   */
  app.post("/api/reevaluations/:reevaluationId/committee-decision", requireAuth, async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: { code: "UNAUTHORIZED", message: "Authentification requise" } 
        });
      }
      
      const parsed = committeeDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Données invalides",
            details: parsed.error.errors
          }
        });
      }
      
      const result = await recordCommitteeDecision(
        reevaluationId,
        parsed.data.decision,
        parsed.data.montantApprouve,
        parsed.data.commentaire,
        parsed.data.membresPresents,
        parsed.data.conditionsSpeciales,
        userId
      );
      
      // Get updated demande
      const reevaluation = result.reevaluation;
      const demande = reevaluation ? await getDemandeById(reevaluation.demandeId) : null;
      
      res.json({
        success: true,
        reevaluation: {
          id: reevaluationId,
          statut: reevaluation?.statut,
          decisionComite: reevaluation?.decisionComite,
          montantApprouveComite: reevaluation?.montantApprouveComite,
          dateDecisionComite: reevaluation?.dateDecisionComite,
          commentaireComite: reevaluation?.commentaireComite,
          verrouille: reevaluation?.verrouille
        },
        demande: demande ? {
          id: demande.id,
          statut: demande.statut,
          montantApprouve: demande.montantApprouve,
          nombreReevaluations: demande.nombreReevaluations
        } : null
      });
    } catch (error: any) {
      console.error("Error recording decision:", error);
      res.status(400).json({ 
        success: false, 
        error: { code: "DECISION_FAILED", message: error.message } 
      });
    }
  });
  
  /**
   * POST /api/reevaluations/:reevaluationId/cancel
   * Cancel a reevaluation
   */
  app.post("/api/reevaluations/:reevaluationId/cancel", requireAuth, async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: { code: "UNAUTHORIZED", message: "Authentification requise" } 
        });
      }
      
      const parsed = cancelSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Données invalides",
            details: parsed.error.errors
          }
        });
      }
      
      await cancelReevaluation(reevaluationId, parsed.data.motif, userId);
      
      res.json({
        success: true,
        message: "Réévaluation annulée"
      });
    } catch (error: any) {
      console.error("Error cancelling reevaluation:", error);
      res.status(400).json({ 
        success: false, 
        error: { code: "CANCELLATION_FAILED", message: error.message } 
      });
    }
  });
  
  /**
   * GET /api/reevaluations/:reevaluationId/audit-logs
   * Get audit logs for a reevaluation
   */
  app.get("/api/reevaluations/:reevaluationId/audit-logs", async (req: Request, res: Response) => {
    try {
      const { reevaluationId } = req.params;
      
      const logs = await getAuditLogs(reevaluationId);
      
      res.json({
        success: true,
        logs
      });
    } catch (error: any) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ 
        success: false, 
        error: { code: "SERVER_ERROR", message: error.message } 
      });
    }
  });
  
  // ========================================
  // LIST ENDPOINTS
  // ========================================
  
  /**
   * GET /api/reevaluations
   * List all reevaluations with filters
   */
  app.get("/api/reevaluations", async (req: Request, res: Response) => {
    try {
      const { statut, limit = '50', offset = '0' } = req.query;

      // Build query with client join
      let baseQuery = db.select({
        id: reevaluationsCredit.id,
        numeroReevaluation: reevaluationsCredit.numeroReevaluation,
        numeroVersion: reevaluationsCredit.numeroVersion,
        demandeId: reevaluationsCredit.demandeId,
        clientId: reevaluationsCredit.clientId,
        statut: reevaluationsCredit.statut,
        montantInitialDemande: reevaluationsCredit.montantInitialDemande,
        nouveauMontantDemande: reevaluationsCredit.nouveauMontantDemande,
        scoreRejetInitial: reevaluationsCredit.scoreRejetInitial,
        nouveauScore: reevaluationsCredit.nouveauScore,
        deltaScore: reevaluationsCredit.deltaScore,
        elementsNouveaux: reevaluationsCredit.elementsNouveaux,
        createdAt: reevaluationsCredit.createdAt,
        dateDecisionComite: reevaluationsCredit.dateDecisionComite,
        decisionComite: reevaluationsCredit.decisionComite,
        client: {
          nom: clients.nom,
          prenom: clients.prenom
        }
      })
      .from(reevaluationsCredit)
      .leftJoin(clients, eq(reevaluationsCredit.clientId, clients.id));

      if (statut) {
        baseQuery = baseQuery.where(eq(reevaluationsCredit.statut, statut as any)) as any;
      }

      const reevaluations = await baseQuery
        .orderBy(desc(reevaluationsCredit.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      res.json({
        success: true,
        reevaluations,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });
    } catch (error: any) {
      console.error("Error listing reevaluations:", error);
      res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: error.message }
      });
    }
  });
}
