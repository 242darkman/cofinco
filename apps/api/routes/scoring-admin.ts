/**
 * Admin Scoring Routes
 * Cross-client scoring audit log, score states overview, and CSV exports.
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import { attachAbility, requireAbility } from "../authorization";
import { Actions, Subjects } from "@shared/ability";
import { createLogger } from "../lib/logger";
import {
  getAdminScoreEvents,
  getAdminScoreStates,
  getAgencyScoreStats,
} from "../services/scoring-engine";

const logger = createLogger("Routes:ScoringAdmin");

export const scoringAdminRouter = Router();

// All routes require auth + loyalty view permission
scoringAdminRouter.use(requireAuth, attachAbility, requireAbility(Actions.VIEW, Subjects.LOYALTY));

// ============================================================================
// EVENT TYPE LABELS (for display & CSV)
// ============================================================================

const EVENT_TYPE_LABELS: Record<string, string> = {
  EPARGNE_DEPOT: "Dépôt épargne",
  CREDIT_REMBOURSEMENT: "Remboursement crédit",
  CREDIT_SOLDE: "Crédit soldé",
  TONTINE_CONTRIBUTION: "Cotisation tontine",
  KYC_VERIFIED: "KYC vérifié",
  PROFILE_COMPLETED: "Profil complété",
  INCIDENT_RETARD: "Incident retard",
  INCIDENT_DEFAUT: "Incident défaut",
  TONTINE_PENALITE: "Pénalité tontine",
  COMPTE_BLOQUE: "Compte bloqué",
  BONUS_MANUEL: "Bonus manuel",
  MALUS_MANUEL: "Malus manuel",
  INITIAL_SCORE: "Score initial",
  RECALCUL_COMPLET: "Recalcul complet",
};

// ============================================================================
// CROSS-CLIENT EVENTS (audit log)
// ============================================================================

scoringAdminRouter.get("/events", async (req, res) => {
  try {
    const { agenceId, eventType, dateFrom, dateTo, clientId, limit, offset } = req.query;

    const result = await getAdminScoreEvents({
      agenceId: agenceId as string,
      eventType: eventType as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      clientId: clientId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to fetch admin score events");
    res.status(500).json({ error: "Erreur lors de la récupération des événements scoring" });
  }
});

// ============================================================================
// ALL SCORE STATES (overview)
// ============================================================================

scoringAdminRouter.get("/states", async (req, res) => {
  try {
    const { agenceId, segment, limit, offset } = req.query;

    const result = await getAdminScoreStates({
      agenceId: agenceId as string,
      segment: segment as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to fetch admin score states");
    res.status(500).json({ error: "Erreur lors de la récupération des états scoring" });
  }
});

// ============================================================================
// CSV EXPORTS
// ============================================================================

function escapeCsv(val: any): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

scoringAdminRouter.get("/events/export", async (req, res) => {
  try {
    const { agenceId, eventType, dateFrom, dateTo, clientId } = req.query;

    const result = await getAdminScoreEvents({
      agenceId: agenceId as string,
      eventType: eventType as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      clientId: clientId as string,
      limit: 10000,
      offset: 0,
    });

    const header = "Date,Client,Type,Points,Montant,Motif,Ref\n";
    const rows = result.rows.map((r) =>
      [
        r.createdAt ? new Date(r.createdAt as any).toISOString().slice(0, 19) : "",
        escapeCsv(`${r.clientPrenom || ""} ${r.clientNom || ""}`.trim()),
        EVENT_TYPE_LABELS[r.eventType] || r.eventType,
        r.pointsDelta ?? 0,
        r.montant ?? "",
        escapeCsv(r.reason || ""),
        escapeCsv(r.refId),
      ].join(",")
    ).join("\n");

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=scoring_events_${date}.csv`);
    res.send("\uFEFF" + header + rows); // BOM for Excel UTF-8
  } catch (err) {
    logger.error({ err }, "Failed to export score events CSV");
    res.status(500).json({ error: "Erreur export CSV événements" });
  }
});

scoringAdminRouter.get("/states/export", async (req, res) => {
  try {
    const { agenceId, segment } = req.query;

    const result = await getAdminScoreStates({
      agenceId: agenceId as string,
      segment: segment as string,
      limit: 10000,
      offset: 0,
    });

    const header = "Client,Score Global,Segment,Paiement,Fidélité,Engagement,Conformité,Taux Remb.,Points,Incidents,Mis à jour\n";
    const rows = result.rows.map((r) =>
      [
        escapeCsv(`${r.clientPrenom || ""} ${r.clientNom || ""}`.trim()),
        r.scoreGlobal,
        r.segment,
        r.scorePayment,
        r.scoreLoyalty,
        r.scoreEngagement,
        r.scoreCompliance,
        r.tauxRemboursement ? `${r.tauxRemboursement}%` : "",
        r.totalPointsFidelite ?? 0,
        r.totalIncidents ?? 0,
        r.updatedAt ? new Date(r.updatedAt as any).toISOString().slice(0, 19) : "",
      ].join(",")
    ).join("\n");

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=scoring_states_${date}.csv`);
    res.send("\uFEFF" + header + rows);
  } catch (err) {
    logger.error({ err }, "Failed to export score states CSV");
    res.status(500).json({ error: "Erreur export CSV états scoring" });
  }
});

scoringAdminRouter.get("/agency-stats/export", async (req, res) => {
  try {
    const { agenceId } = req.query;
    const stats = await getAgencyScoreStats(agenceId as string);

    const header = "Agence,Clients,Score Moyen,Paiement Moy.,Fidélité Moy.,Engagement Moy.,Conformité Moy.,VIP,Premium,Standard,Risque\n";
    const rows = stats.map((r: any) =>
      [
        r.agenceId || "Toutes",
        r.totalClients,
        r.avgScore,
        r.avgPayment,
        r.avgLoyalty,
        r.avgEngagement,
        r.avgCompliance,
        r.segments.VIP,
        r.segments.Premium,
        r.segments.Standard,
        r.segments.Risque,
      ].join(",")
    ).join("\n");

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=scoring_agences_${date}.csv`);
    res.send("\uFEFF" + header + rows);
  } catch (err) {
    logger.error({ err }, "Failed to export agency stats CSV");
    res.status(500).json({ error: "Erreur export CSV stats agences" });
  }
});

// Event type labels endpoint (for UI filters)
scoringAdminRouter.get("/event-types", (_req, res) => {
  res.json(EVENT_TYPE_LABELS);
});
