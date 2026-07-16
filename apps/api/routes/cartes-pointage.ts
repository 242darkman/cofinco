/**
 * Routes — Cartes de pointage (épargne libre par cases).
 *
 * Routes volontairement minces (AGENTS.md §4) : validation zod des entrées,
 * authentification + autorisation CASL, application du périmètre agence,
 * délégation au service puis transformation de la réponse.
 */

import type { Express } from "express";
import { ZodError } from "zod";
import {
  ouvrirCartePointageSchema,
  versementCartePointageSchema,
  retraitCartePointageSchema,
} from "@shared/schema";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { requireAgenceAccess } from "../middleware";
import {
  CartePointageError,
  ouvrirCarte,
  effectuerVersement,
  effectuerRetrait,
  getCarteDetail,
  getCarteParReference,
  listerCartes,
} from "../services/cartes-pointage/carte-pointage-service";
import { getWsInstance } from "../ws-server";
import { createLogger } from "../lib/logger";

const logger = createLogger("Routes:CartesPointage");

/** Transforme les erreurs métier/validation en réponses HTTP sobres. */
function handleError(res: any, error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Données invalides", details: error.flatten().fieldErrors });
  }
  if (error instanceof CartePointageError) {
    return res.status(400).json({ message: error.message, code: error.code });
  }
  const message = error instanceof Error ? error.message : fallback;
  logger.error({ err: error }, fallback);
  // Les erreurs métier levées par le storage (carte pleine, N insuffisant…) restent lisibles.
  return res.status(400).json({ message: message || fallback });
}

/** Diffuse une mise à jour temps réel du module (grille des cartes + dashboard caisse). */
function broadcastUpdate(payload: Record<string, unknown>, refreshDashboard: boolean) {
  const ws = getWsInstance();
  if (!ws) return;
  ws.broadcast({ type: "CARTE_POINTAGE_UPDATE", payload });
  if (refreshDashboard) {
    ws.broadcast({ type: "DASHBOARD_UPDATE", payload: {} });
  }
}

export function registerCartesPointageRoutes(app: Express) {
  // Liste des cartes du périmètre (filtres : client, statut)
  app.get(
    "/api/cartes-pointage",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CARTE_POINTAGE),
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        const cartes = await listerCartes({
          agenceId: agenceFilter?.agenceId,
          clientId: typeof req.query.clientId === "string" ? req.query.clientId : undefined,
          status: req.query.status === "WITHDRAWN" ? "WITHDRAWN"
            : req.query.status === "ACTIVE" ? "ACTIVE" : undefined,
        });
        res.json(cartes);
      } catch (error) {
        handleError(res, error, "Erreur chargement des cartes de pointage");
      }
    },
  );

  // Recherche par référence (scan QR par un agent)
  app.get(
    "/api/cartes-pointage/reference/:reference",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CARTE_POINTAGE),
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        const carte = await getCarteParReference(req.params.reference, agenceFilter?.agenceId);
        if (!carte) return res.status(404).json({ message: "Carte introuvable" });
        res.json(carte);
      } catch (error) {
        handleError(res, error, "Erreur recherche de carte");
      }
    },
  );

  // Détail d'une carte + historique des transactions
  app.get(
    "/api/cartes-pointage/:id",
    requireAuth,
    attachAbility,
    requireAbility(Actions.VIEW, Subjects.CARTE_POINTAGE),
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        const detail = await getCarteDetail(req.params.id, agenceFilter?.agenceId);
        if (!detail) return res.status(404).json({ message: "Carte introuvable" });
        res.json(detail);
      } catch (error) {
        handleError(res, error, "Erreur chargement de la carte");
      }
    },
  );

  // Ouverture d'une carte (montant unitaire M défini par le client, figé)
  app.post(
    "/api/cartes-pointage",
    requireAuth,
    attachAbility,
    requireAbility(Actions.CREATE, Subjects.CARTE_POINTAGE),
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const parsed = ouvrirCartePointageSchema.parse(req.body);
        // L'agence provient de la session serveur, jamais du client (AGENTS.md §8).
        const agenceId = req.user?.agenceId as string | undefined;
        if (!agenceId) {
          return res.status(403).json({ message: "Aucune agence associée à votre session" });
        }
        const carte = await ouvrirCarte({
          clientId: parsed.clientId,
          unitAmount: parsed.unitAmount,
          agenceId,
          userId: req.session.user!.id,
        });
        broadcastUpdate({ type: "carte_new", cardId: carte.id }, false);
        res.status(201).json(carte);
      } catch (error) {
        handleError(res, error, "Erreur lors de l'ouverture de la carte");
      }
    },
  );

  // Versement : coche la case suivante (max 31)
  app.post(
    "/api/cartes-pointage/:id/versements",
    requireAuth,
    attachAbility,
    requireAbility(Actions.DEPOSIT, Subjects.CARTE_POINTAGE),
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const parsed = versementCartePointageSchema.parse(req.body);
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        // Contrôle de périmètre avant tout effet de bord.
        const detail = await getCarteDetail(req.params.id, agenceFilter?.agenceId);
        if (!detail) return res.status(404).json({ message: "Carte introuvable" });

        const transaction = await effectuerVersement({
          cardId: req.params.id,
          paymentMethod: parsed.paymentMethod,
          idempotencyKey: parsed.idempotencyKey,
          userId: req.session.user!.id,
        });
        broadcastUpdate({ type: "versement", cardId: req.params.id }, parsed.paymentMethod === "CASH");
        res.status(201).json(transaction);
      } catch (error) {
        handleError(res, error, "Erreur lors de l'enregistrement du versement");
      }
    },
  );

  // Retrait : restitue M×N − M au client, commission M en caisse, clôture la carte
  app.post(
    "/api/cartes-pointage/:id/retrait",
    requireAuth,
    attachAbility,
    requireAbility(Actions.WITHDRAW, Subjects.CARTE_POINTAGE),
    requireAgenceAccess("agenceId"),
    async (req, res) => {
      try {
        const parsed = retraitCartePointageSchema.parse(req.body);
        const agenceFilter = req.agenceFilter as { agenceId?: string } | null;
        const detail = await getCarteDetail(req.params.id, agenceFilter?.agenceId);
        if (!detail) return res.status(404).json({ message: "Carte introuvable" });

        const resultat = await effectuerRetrait({
          cardId: req.params.id,
          paymentMethod: parsed.paymentMethod,
          idempotencyKey: parsed.idempotencyKey,
          userId: req.session.user!.id,
        });
        broadcastUpdate({ type: "retrait", cardId: req.params.id }, parsed.paymentMethod === "CASH");
        res.json(resultat);
      } catch (error) {
        handleError(res, error, "Erreur lors du retrait");
      }
    },
  );
}
