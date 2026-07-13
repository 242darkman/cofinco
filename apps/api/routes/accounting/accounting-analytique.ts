import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { getBalanceAnalytique, getCompteResultatAnalytique } from "../../services/analytique-service";

import { db } from "../../db";

import { centresCouts, clesRepartition, clesRepartitionLignes, lignesProduits } from "@shared/schema/analytique";
import { eq, sql } from "drizzle-orm";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingAnalytiqueRoutes(app: Express) {

  // ======================================================================
  // COMPTABILITE ANALYTIQUE
  // ======================================================================

  // Balance analytique (by centre or produit)
  app.get("/api/comptabilite/analytique/balance", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateDebut = req.query.dateDebut as string || `${new Date().getFullYear()}-01-01`;
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const groupBy = req.query.groupBy as 'centre_cout' | 'ligne_produit' || 'centre_cout';

      const result = await getBalanceAnalytique(agenceId, dateDebut, dateFin, groupBy);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Compte de résultat analytique
  app.get("/api/comptabilite/analytique/compte-resultat", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const dateDebut = req.query.dateDebut as string || `${new Date().getFullYear()}-01-01`;
      const dateFin = req.query.dateFin as string || new Date().toISOString().split('T')[0];
      const centreCoutId = req.query.centreCoutId as string | undefined;
      const ligneProduitId = req.query.ligneProduitId as string | undefined;

      const result = await getCompteResultatAnalytique(agenceId, dateDebut, dateFin, centreCoutId, ligneProduitId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // CRUD: Centres de coûts
  app.get("/api/comptabilite/analytique/centres", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      const result = await db.select().from(centresCouts)
        .where(agenceId ? eq(centresCouts.agenceId, agenceId) : sql`true`)
        .orderBy(centresCouts.code);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  app.post("/api/comptabilite/analytique/centres", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      const { code, intitule, typeCenter, responsable } = req.body;
      if (!code || !intitule) return res.status(400).json({ message: "code et intitule requis" });

      const [result] = await db.insert(centresCouts).values({
        agenceId, code, intitule, typeCenter, responsable,
      }).returning();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // CRUD: Lignes de produits
  app.get("/api/comptabilite/analytique/produits", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      const result = await db.select().from(lignesProduits)
        .where(agenceId ? eq(lignesProduits.agenceId, agenceId) : sql`true`)
        .orderBy(lignesProduits.code);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  app.post("/api/comptabilite/analytique/produits", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      const { code, intitule, categorie } = req.body;
      if (!code || !intitule) return res.status(400).json({ message: "code et intitule requis" });

      const [result] = await db.insert(lignesProduits).values({
        agenceId, code, intitule, categorie,
      }).returning();
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // CRUD: Clés de répartition
  app.get("/api/comptabilite/analytique/cles", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      const keys = await db.select().from(clesRepartition)
        .where(agenceId ? eq(clesRepartition.agenceId, agenceId) : sql`true`)
        .orderBy(clesRepartition.code);

      // Charger les lignes pour chaque clé
      const result = [];
      for (const key of keys) {
        const lignes = await db.select().from(clesRepartitionLignes)
          .where(eq(clesRepartitionLignes.cleId, key.id));
        result.push({ ...key, lignes });
      }
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  app.post("/api/comptabilite/analytique/cles", requireAuth, attachAbility, requireAbility(Actions.MANAGE, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      const { code, intitule, lignes } = req.body;
      if (!code || !intitule) return res.status(400).json({ message: "code et intitule requis" });

      const [key] = await db.insert(clesRepartition).values({
        agenceId, code, intitule,
      }).returning();

      if (lignes && Array.isArray(lignes)) {
        for (const ligne of lignes) {
          await db.insert(clesRepartitionLignes).values({
            cleId: key.id,
            centreCoutId: ligne.centreCoutId,
            pourcentage: ligne.pourcentage,
          });
        }
      }

      res.json(key);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
