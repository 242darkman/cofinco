/**
 * Job quotidien de génération des alertes RH
 * Scanne les employés actifs pour détecter les événements à venir :
 * - Fin de période d'essai
 * - Expiration de contrat CDD
 * - Documents expirants
 * - Anniversaires de travail
 * - Visites médicales
 */

import cron from "node-cron";
import { db } from "../db";
import {
  employes,
  users,
  hrAlertConfig,
  hrAlerts,
  employeeDocuments,
  type HrAlertConfig,
} from "@shared/schema";
import { eq, and, sql, gte, lte, not, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("HrAlertsCron");

const CRON_SCHEDULE = "0 6 * * *"; // Quotidien à 6h
const TIMEZONE = "Africa/Brazzaville";
const SCAN_DAYS_AHEAD = 60; // Scanner 60 jours à l'avance

interface AlertCandidate {
  employeId: string;
  employeNom: string;
  alertType: string;
  eventDate: string;
  eventLabel: string;
  metadata: Record<string, any>;
  agenceId: string | null;
}

/**
 * Fonction principale du job
 */
async function runHrAlertsJob() {
  const startTime = Date.now();
  logger.info("Démarrage de la génération des alertes RH");

  try {
    // Charger la configuration des alertes
    const configs = await db.select().from(hrAlertConfig);
    const configMap = new Map(configs.map((c) => [c.alertType, c]));

    let totalCreated = 0;

    // Scanner chaque type d'alerte activé avec paliers configurables
    for (const [type, config] of configMap) {
      if (!config.enabled) continue;

      const candidates = await scanForAlertType(type);
      // Tag each candidate with its reminder level based on configurable reminderDays
      const reminderDays = config.reminderDays || [30, 15, 7, 1];
      const today = new Date();
      const taggedCandidates = candidates.map(c => {
        const eventDate = new Date(c.eventDate);
        const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        // Find the nearest reminder threshold
        const matchedDay = reminderDays.find(d => daysUntil <= d);
        return { ...c, metadata: { ...c.metadata, reminderLevel: matchedDay || daysUntil, daysUntil } };
      });
      const created = await createAlertsIfNew(taggedCandidates);
      totalCreated += created;
    }

    // Expirer les alertes passées
    const expired = await expireOldAlerts();

    const duration = Date.now() - startTime;
    logger.info({ totalCreated, expired, durationMs: duration }, "Alertes RH générées");
  } catch (error) {
    logger.error({ err: error }, "Erreur lors de la génération des alertes RH");
  }
}

/**
 * Scanne les employés pour un type d'alerte donné
 */
async function scanForAlertType(alertType: string): Promise<AlertCandidate[]> {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + SCAN_DAYS_AHEAD);
  const todayStr = today.toISOString().split("T")[0];
  const futureStr = futureDate.toISOString().split("T")[0];

  switch (alertType) {
    case "FIN_PERIODE_ESSAI":
      return scanPeriodeEssai(todayStr, futureStr);
    case "EXPIRATION_CDD":
      return scanExpirationCDD(todayStr, futureStr);
    case "DOCUMENT_EXPIRANT":
      return scanDocumentsExpirants(todayStr, futureStr);
    case "ANNIVERSAIRE_TRAVAIL":
      return scanAnniversairesTravail(todayStr);
    case "VISITE_MEDICALE":
      return scanVisitesMedicales(todayStr, futureStr);
    case "PIECE_IDENTITE_EXPIRANTE":
      return scanPieceIdentiteExpirante(todayStr, futureStr);
    default:
      return [];
  }
}

async function scanPeriodeEssai(todayStr: string, futureStr: string): Promise<AlertCandidate[]> {
  const results = await db
    .select({
      id: employes.id,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`,
      dateFinEssai: employes.dateFinEssai,
      agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "ACTIVE"),
        sql`${employes.dateFinEssai} IS NOT NULL`,
        gte(employes.dateFinEssai, todayStr),
        lte(employes.dateFinEssai, futureStr)
      )
    );

  return results.map((r) => ({
    employeId: r.id,
    employeNom: r.nom,
    alertType: "FIN_PERIODE_ESSAI",
    eventDate: r.dateFinEssai!,
    eventLabel: `Fin de période d'essai - ${r.nom}`,
    metadata: {},
    agenceId: r.agenceId,
  }));
}

async function scanExpirationCDD(todayStr: string, futureStr: string): Promise<AlertCandidate[]> {
  const results = await db
    .select({
      id: employes.id,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`,
      dateFinContrat: employes.dateFinContrat,
      typeContrat: employes.typeContrat,
      agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "ACTIVE"),
        eq(employes.typeContrat, "CDD"),
        sql`${employes.dateFinContrat} IS NOT NULL`,
        gte(employes.dateFinContrat, todayStr),
        lte(employes.dateFinContrat, futureStr)
      )
    );

  return results.map((r) => ({
    employeId: r.id,
    employeNom: r.nom,
    alertType: "EXPIRATION_CDD",
    eventDate: r.dateFinContrat!,
    eventLabel: `Expiration contrat CDD - ${r.nom}`,
    metadata: { typeContrat: r.typeContrat },
    agenceId: r.agenceId,
  }));
}

async function scanDocumentsExpirants(todayStr: string, futureStr: string): Promise<AlertCandidate[]> {
  const results = await db
    .select({
      employeId: employeeDocuments.employeId,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`,
      dateExpiration: employeeDocuments.dateExpiration,
      typeDocument: employeeDocuments.typeDocument,
      agenceId: employes.agenceId,
    })
    .from(employeeDocuments)
    .innerJoin(employes, eq(employeeDocuments.employeId, employes.id))
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "ACTIVE"),
        sql`${employeeDocuments.dateExpiration} IS NOT NULL`,
        gte(employeeDocuments.dateExpiration, todayStr),
        lte(employeeDocuments.dateExpiration, futureStr)
      )
    );

  return results.map((r) => ({
    employeId: r.employeId,
    employeNom: r.nom,
    alertType: "DOCUMENT_EXPIRANT",
    eventDate: r.dateExpiration!,
    eventLabel: `Document expirant (${r.typeDocument}) - ${r.nom}`,
    metadata: { typeDocument: r.typeDocument },
    agenceId: r.agenceId,
  }));
}

async function scanAnniversairesTravail(todayStr: string): Promise<AlertCandidate[]> {
  const today = new Date(todayStr);
  const milestones = [1, 5, 10, 15, 20, 25, 30];
  const currentYear = today.getFullYear();
  const candidates: AlertCandidate[] = [];

  // Recherche des anniversaires dans les 30 prochains jours
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 30);

  const results = await db
    .select({
      id: employes.id,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`,
      dateEmbauche: employes.dateEmbauche,
      agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "ACTIVE"),
        sql`${employes.dateEmbauche} IS NOT NULL`
      )
    );

  for (const r of results) {
    if (!r.dateEmbauche) continue;
    const embauche = new Date(r.dateEmbauche);
    const yearsWorked = currentYear - embauche.getFullYear();

    if (milestones.includes(yearsWorked)) {
      // Calculer la date anniversaire cette année
      const anniversary = new Date(currentYear, embauche.getMonth(), embauche.getDate());
      if (anniversary >= today && anniversary <= futureDate) {
        candidates.push({
          employeId: r.id,
          employeNom: r.nom,
          alertType: "ANNIVERSAIRE_TRAVAIL",
          eventDate: anniversary.toISOString().split("T")[0],
          eventLabel: `${yearsWorked} ans d'ancienneté - ${r.nom}`,
          metadata: { yearsWorked },
          agenceId: r.agenceId,
        });
      }
    }
  }

  return candidates;
}

async function scanVisitesMedicales(todayStr: string, futureStr: string): Promise<AlertCandidate[]> {
  const results = await db
    .select({
      id: employes.id,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`,
      prochaineMedicale: employes.prochaineMedicale,
      agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "ACTIVE"),
        sql`${employes.prochaineMedicale} IS NOT NULL`,
        gte(employes.prochaineMedicale, todayStr),
        lte(employes.prochaineMedicale, futureStr)
      )
    );

  return results.map((r) => ({
    employeId: r.id,
    employeNom: r.nom,
    alertType: "VISITE_MEDICALE",
    eventDate: r.prochaineMedicale!,
    eventLabel: `Visite médicale à planifier - ${r.nom}`,
    metadata: {},
    agenceId: r.agenceId,
  }));
}

async function scanPieceIdentiteExpirante(todayStr: string, futureStr: string): Promise<AlertCandidate[]> {
  const results = await db
    .select({
      id: employes.id,
      nom: sql<string>`concat(${users.nom}, ' ', coalesce(${users.prenom}, ''))`,
      dateExpirationPiece: employes.dateExpirationPiece,
      typePiece: employes.typePiece,
      agenceId: employes.agenceId,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(
      and(
        eq(employes.statut, "ACTIVE"),
        sql`${employes.dateExpirationPiece} IS NOT NULL`,
        gte(employes.dateExpirationPiece, todayStr),
        lte(employes.dateExpirationPiece, futureStr)
      )
    );

  return results.map((r) => ({
    employeId: r.id,
    employeNom: r.nom,
    alertType: "PIECE_IDENTITE_EXPIRANTE",
    eventDate: r.dateExpirationPiece!,
    eventLabel: `Pièce d'identité expirante (${r.typePiece || 'N/A'}) - ${r.nom}`,
    metadata: { typePiece: r.typePiece },
    agenceId: r.agenceId,
  }));
}

/**
 * Crée les alertes qui n'existent pas encore (idempotent)
 */
async function createAlertsIfNew(candidates: AlertCandidate[]): Promise<number> {
  if (candidates.length === 0) return 0;

  // Vérifier les alertes existantes
  const existingAlerts = await db
    .select({
      employeId: hrAlerts.employeId,
      alertType: hrAlerts.alertType,
      eventDate: hrAlerts.eventDate,
    })
    .from(hrAlerts)
    .where(
      and(
        not(eq(hrAlerts.status, "EXPIRED")),
        inArray(
          hrAlerts.employeId,
          candidates.map((c) => c.employeId)
        )
      )
    );

  const existingKeys = new Set(
    existingAlerts.map((a) => `${a.employeId}:${a.alertType}:${a.eventDate}`)
  );

  const toCreate = candidates.filter(
    (c) => !existingKeys.has(`${c.employeId}:${c.alertType}:${c.eventDate}`)
  );

  if (toCreate.length > 0) {
    await db.insert(hrAlerts).values(
      toCreate.map((c) => ({
        alertType: c.alertType,
        employeId: c.employeId,
        employeNom: c.employeNom,
        eventDate: c.eventDate,
        eventLabel: c.eventLabel,
        metadata: c.metadata,
        agenceId: c.agenceId,
      }))
    );
  }

  return toCreate.length;
}

/**
 * Expire les alertes dont la date d'événement est passée
 */
async function expireOldAlerts(): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const result = await db
    .update(hrAlerts)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(
      and(
        eq(hrAlerts.status, "PENDING"),
        sql`${hrAlerts.eventDate} < ${today}`
      )
    )
    .returning({ id: hrAlerts.id });

  return result.length;
}

export function startHrAlertsGeneratorCron() {
  logger.info({ schedule: CRON_SCHEDULE }, "Cron alertes RH enregistré");
  return cron.schedule(CRON_SCHEDULE, runHrAlertsJob, { timezone: TIMEZONE });
}

// Export pour tests
export { runHrAlertsJob };
