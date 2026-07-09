/**
 * Routes finance — segment /credits (partie credits).
 *
 * Enregistré par l'index finance.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/credits
 *   POST   /api/credits
 */
import type { Express } from "express";
import { insertCreditSchema, credits } from "@shared/schema";
import { storage } from "../../storage";
import { requireAuth } from "../../auth";
import { requireAgenceAccess, requireAgenceIdAccess } from "../../middleware";
import { attachAbility, requireAbility, requireDisbursement, hasAbility, Actions, Subjects } from "../../authorization";
import { logAudit } from "../../audit";
import { normalizeKeysDeep, coerceValueToSchema } from "../utils";
import { getWsInstance } from "../../ws-server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";

export function registerCreditsRoutes(app: Express) {
  // Credits
  /**
   * GET /api/credits
   */
  app.get("/api/credits", requireAuth, requireAgenceAccess("agenceId"), async (req, res) => {
    // req.agenceFilter est injecté par requireAgenceAccess avec l'agenceId
    const agenceFilter = req.agenceFilter as { agenceId?: string } | null;

    const filter: { agenceId?: string; clientId?: string } = agenceFilter ? { agenceId: agenceFilter.agenceId } : {};

    if (req.query.clientId) {
      filter.clientId = req.query.clientId as string;
    }

    const options = {
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      statut: req.query.statut as string | undefined,
    };

    const result = await storage.getAllCredits(filter, options);

    // Optionally attach échéances to each credit (used by Échéancier view)
    const includeEcheances = req.query.include_echeances === 'true';
    let data = result.data;
    if (includeEcheances) {
      data = await Promise.all(
        result.data.map(async (credit: any) => ({
          ...credit,
          echeances: await storage.getEcheancesByCredit(credit.id),
        }))
      );
    }

    res.json({
      data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  });

  // Create credit (roles: admin, chef, credit only)
  /**
   * POST /api/credits
   */
  app.post("/api/credits", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.CREDIT), requireAgenceAccess(), async (req, res) => {
     try {
       const data = normalizeKeysDeep(req.body) as any;
       
       // Generate ID and credit number uniquely
       if (!data.id) {
         const { randomUUID } = await import('crypto'); 
         data.id = randomUUID();
       }

       if (!data.numeroCredit) {
          // Use the generated ID as requested by user
          // "on pourra utilisé l'id du credit"
          data.numeroCredit = `CRED-${data.id.substring(0, 8).toUpperCase()}`;
       }

       // Plan de crédit obligatoire
       if (!data.creditPlanId) {
         return res.status(400).json({ message: "Un plan de crédit est requis pour créer un crédit" });
       }

       const parsed = insertCreditSchema.parse(data);

       // Vérifier que le client appartient à l'agence de l'utilisateur
       const agenceFilter = req.agenceFilter as { agenceId?: string; agence?: string } | null;
       if (agenceFilter?.agenceId) {
         const client = await storage.getClient(parsed.clientId);
         // Si le client n'existe pas ou n'est pas de la bonne agence => Refusé
         if (!client || client.agenceId !== agenceFilter.agenceId) {
           return res.status(403).json({ message: "Accès refusé : ce client appartient à une autre agence" });
         }
       }
       
       const credit = await storage.createCredit(parsed);
       
       await logAudit(
          req,
          "CREATE_CREDIT",
          "credit",
          credit.id,
          undefined,
          "success",
          "low"
       );

       // Notify Credit Update
       const wsInstance = getWsInstance();
       if (wsInstance) {
          wsInstance.broadcast({ type: "CREDIT_UPDATE", payload: { type: 'credit_new', id: credit.id } });
       }

       res.status(201).json(credit);
     } catch (e) {
       res.status(400).json({ message: "Invalid data" });
     }
  });
}
