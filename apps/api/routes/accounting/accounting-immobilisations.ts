import type { Express } from "express";
import { createLogger } from "../../lib/logger";

const logger = createLogger('Routes:Accounting');

import { Actions, Subjects } from "@shared/ability";
import { requireAuth } from "../../auth";
import { attachAbility, requireAbility } from "../../authorization";
import { toHttpError } from "../utils";

import { calculateAmortissements, getAmortissementSummary } from "../../services/amortissement-service";

import { amortissements, immobilisations } from "@shared/schema";
import { db } from "../../db";

import { asc, eq } from "drizzle-orm";

import { AuthenticatedRequest } from "./accounting-types";



export function registerAccountingImmobilisationsRoutes(app: Express) {

  // ======================================================================
  // IMMOBILISATIONS & AMORTISSEMENTS
  // ======================================================================

  // Lister les immobilisations
  app.get("/api/comptabilite/immobilisations", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const { categorie, statut } = req.query;
      let query = db.select().from(immobilisations).where(eq(immobilisations.agenceId, agenceId)).$dynamic();

      if (categorie) query = query.where(eq(immobilisations.categorie, categorie as string));
      if (statut) query = query.where(eq(immobilisations.statut, statut as string));

      const result = await query.orderBy(asc(immobilisations.code));
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Créer une immobilisation
  app.post("/api/comptabilite/immobilisations", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const data = req.body;
      const valeurAcquisition = parseFloat(data.valeurAcquisition || '0');
      const valeurResiduelle = parseFloat(data.valeurResiduelle || '0');
      const cumulAmortissements = parseFloat(data.cumulAmortissements || '0');

      const [created] = await db.insert(immobilisations).values({
        agenceId,
        code: data.code,
        designation: data.designation,
        categorie: data.categorie,
        compteImmobilisation: data.compteImmobilisation,
        compteAmortissement: data.compteAmortissement,
        dateAcquisition: data.dateAcquisition,
        dateMiseEnService: data.dateMiseEnService,
        valeurAcquisition: valeurAcquisition.toFixed(2),
        valeurResiduelle: valeurResiduelle.toFixed(2),
        dureeAmortissementMois: parseInt(data.dureeAmortissementMois),
        methodeAmortissement: data.methodeAmortissement || 'LINEAIRE',
        tauxAmortissement: data.tauxAmortissement,
        cumulAmortissements: cumulAmortissements.toFixed(2),
        valeurNetteComptable: (valeurAcquisition - cumulAmortissements).toFixed(2),
        fournisseur: data.fournisseur,
        numeroFacture: data.numeroFacture,
        localisation: data.localisation,
        description: data.description,
        createdBy: req.user!.id,
      }).returning();

      res.json(created);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Détails de l'immobilisation avec l'historique d'amortissement
  app.get("/api/comptabilite/immobilisations/:id", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const [immo] = await db.select().from(immobilisations).where(eq(immobilisations.id, req.params.id)).limit(1);
      if (!immo) return res.status(404).json({ message: "Immobilisation non trouvée" });

      const history = await db.select().from(amortissements)
        .where(eq(amortissements.immobilisationId, req.params.id))
        .orderBy(asc(amortissements.periodeDate));

      res.json({ ...immo, amortissements: history });
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Calculer les amortissements manuellement
  app.post("/api/comptabilite/amortissements/calculate", requireAuth, attachAbility, requireAbility(Actions.CREATE, Subjects.ECRITURE_COMPTABLE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.body.agenceId;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const periodeDate = req.body.periodeDate ? new Date(req.body.periodeDate) : new Date();
      const result = await calculateAmortissements(agenceId, periodeDate, req.user?.id);

      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

  // Amortissement summary
  app.get("/api/comptabilite/amortissements/summary", requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.COMPTABILITE), async (req: AuthenticatedRequest, res) => {
    try {
      const agenceId = req.user?.agenceId || req.query.agenceId as string;
      if (!agenceId) return res.status(400).json({ message: "agenceId requis" });

      const result = await getAmortissementSummary(agenceId);
      res.json(result);
    } catch (error) {
      const err = toHttpError(error);
      res.status(err.status).json({ code: err.code, message: err.message });
    }
  });

}
