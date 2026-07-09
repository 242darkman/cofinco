/**
 * Routes comptes — segment /produits-compte (partie produits-compte).
 *
 * Enregistré par l'index comptes.ts dans l'ordre historique.
 * Endpoints :
 *   GET    /api/produits-compte
 *   PATCH  /api/produits-compte/:id
 *   POST   /api/produits-compte
 */
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess, requireAgenceIdAccess, validateAgenceIdAction } from "../../middleware";
import { logAudit } from "../../audit";
import { normalizeKeysDeep } from "../utils";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { comptes, produitsCompte, insertProduitCompteSchema, clients, users, virementsProgrammes } from "@shared/schema";
import type {
  TypeCompteDz,
  SuspensionReasonDz,
  ClosurePayoutMethodDz,
  StatutTransactionDz,
} from "@shared/enum/enums";
import { logger } from "./shared";

export function registerProduitsCompteRoutes(app: Express) {
  /**
   * GET /api/produits-compte - Liste des produits de compte (taux d'intérêt au niveau produit)
   */
  /**
   * GET /api/produits-compte
   */
  app.get("/api/produits-compte", requireAuth, requireAgenceAccess(), async (req, res) => {
    try {
      const typeCompte = req.query.typeCompte as string | undefined;
      const actifOnly = req.query.actif !== 'false';

      const conditions: any[] = [];
      if (actifOnly) conditions.push(eq(produitsCompte.actif, true));
      if (typeCompte) conditions.push(eq(produitsCompte.typeCompte, typeCompte as TypeCompteDz));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const produits = whereClause
        ? await db.select().from(produitsCompte).where(whereClause)
        : await db.select().from(produitsCompte);

      res.json(produits);
    } catch (error: any) {
      logger.error({ err: error }, 'Error listing produits compte');
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * PATCH /api/produits-compte/:id - Update product rates and fees (Admin only)
   */
  /**
   * PATCH /api/produits-compte/:id
   */
  app.patch(
    "/api/produits-compte/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.SETTINGS),
    async (req, res) => {
      try {
        const { id } = req.params;
        const data = normalizeKeysDeep(req.body) as any;

        // Get current product for audit
        const [currentProduct] = await db.select().from(produitsCompte).where(eq(produitsCompte.id, id)).limit(1);
        if (!currentProduct) {
          return res.status(404).json({ error: "Produit non trouvé" });
        }

        // Build update object
        const updateData: any = {};
        if (data.nom !== undefined) updateData.nom = data.nom;
        if (data.tauxInteret !== undefined) updateData.tauxInteret = data.tauxInteret?.toString() || null;
        if (data.frais !== undefined) updateData.frais = data.frais;
        if (data.regles !== undefined) updateData.regles = data.regles;
        if (data.actif !== undefined) updateData.actif = data.actif;

        const [updated] = await db
          .update(produitsCompte)
          .set(updateData)
          .where(eq(produitsCompte.id, id))
          .returning();

        // Log audit
        await logAudit(req, 'UPDATE', 'produit_compte', id, {
          before: {
            tauxInteret: currentProduct.tauxInteret,
            frais: currentProduct.frais,
            regles: currentProduct.regles,
          },
          after: updateData,
        }, 'success', 'high');

        res.json(updated);
      } catch (error: any) {
        logger.error({ err: error }, 'Error updating produit compte');
        res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * POST /api/produits-compte - Create a new product (Admin only)
   */
  /**
   * POST /api/produits-compte
   */
  app.post(
    "/api/produits-compte",
    requireAuth,
    attachAbility,
    requireAbility(Actions.MANAGE, Subjects.SETTINGS),
    async (req, res) => {
      try {
        const data = normalizeKeysDeep(req.body) as any;
        const parsed = insertProduitCompteSchema.parse(data);

        const [created] = await db
          .insert(produitsCompte)
          .values(parsed)
          .returning();

        await logAudit(req, 'CREATE', 'produit_compte', created.id, {
          after: { code: created.code, nom: created.nom, typeCompte: created.typeCompte },
        }, 'success', 'high');

        res.status(201).json(created);
      } catch (error: any) {
        if (error.code === '23505') {
          return res.status(409).json({ error: "Un produit avec ce code existe déjà" });
        }
        if (error.name === 'ZodError') {
          return res.status(400).json({ error: "Données invalides", details: error.errors });
        }
        logger.error({ err: error }, 'Error creating produit compte');
        res.status(500).json({ error: error.message });
      }
    }
  );
}
