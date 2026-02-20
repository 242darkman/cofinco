/**
 * Service d'alerte client - Evaluation server-side
 *
 * Evalue les conditions de risque du client et retourne les alertes actives.
 * Les resolutions sont persistees dans le champ JSONB `alerts` du client.
 * Les resolutions expirent apres N jours (configurable via ALERT_THRESHOLDS) — les alertes
 * reapparaissent si la condition persiste.
 *
 * firstSeenAt tracking: persiste la date de premiere detection de chaque
 * condition active pour que le frontend affiche "depuis X jours".
 */

import { storage } from "../storage";
import { getComptesByClient, getCreditsByClient } from "../storage/finance";
import { getTontinesByClient } from "../storage/tontines";
import { StatutCredit, StatutCompte } from "@shared/enum/status-constants";
import { currencySymbol } from "@shared/config/currency";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

/**
 * Configurable alert thresholds.
 * Override individual values via `Object.assign(ALERT_THRESHOLDS, { ... })` at startup.
 */
export const ALERT_THRESHOLDS = {
  /** Resolution expires after this many days — alert reappears if condition persists */
  resolutionExpiryDays: 30,
  /** Low balance threshold in currency units */
  lowBalanceThreshold: 1000,
  /** Client inactivity threshold in days */
  inactivityDays: 90,
  /** ID expiration critical threshold in days */
  idExpiryCriticalDays: 30,
  /** ID expiration warning threshold in days */
  idExpiryWarningDays: 90,
  /** Score below this triggers score_drop alert */
  scoreDropThreshold: 40,
  /** Repayment rate below this triggers payment_overdue */
  paymentOverdueRate: 70,
  /** Temporal escalation: warning alerts older than this (days) become critical */
  escalationDays: 30,
  /** Snooze duration in days — shorter than resolution expiry */
  snoozeDays: 7,
};

export const KNOWN_ALERT_TYPES = [
  "payment_overdue",
  "document_missing",
  "kyc_pending",
  "credit_late",
  "low_balance",
  "id_expiring",
  "id_expired",
  "kyc_expired",
  "client_inactive",
  "tontine_late",
  "score_drop",
  "blacklisted",
  "pep_flagged",
  "high_risk",
  "id_missing",
] as const;

export type AlertType = (typeof KNOWN_ALERT_TYPES)[number];

export interface ClientAlert {
  id: string;
  clientId: string;
  alertType: AlertType;
  alertLevel: "info" | "warning" | "critical";
  message: string;
  isResolved: boolean;
  resolvedAt?: string;
  createdAt: string;
  action?: string;
  /** Tab key to navigate to when clicking the action link */
  targetTab?: string;
}

export interface ResolvedAlertEntry {
  alertType: string;
  resolvedAt: string;
  resolvedBy?: string;
  resolvedByName?: string;
}

export interface SnoozedAlertEntry {
  alertType: string;
  snoozedAt: string;
  snoozedUntil: string;
  snoozedBy?: string;
  snoozedByName?: string;
}

/** Tracking entry for firstSeenAt persistence */
interface AlertTrackingEntry {
  alertType: string;
  firstSeenAt: string;
}

/** Shape of the `alerts` JSONB stored on client */
interface AlertsJSONB {
  resolved: ResolvedAlertEntry[];
  tracking: AlertTrackingEntry[];
  snoozed: SnoozedAlertEntry[];
}

export interface AlertsResponse {
  active: ClientAlert[];
  resolved: ResolvedAlertEntry[];
  snoozed: SnoozedAlertEntry[];
}

/** Maps alert type to the target tab for quick navigation */
const ALERT_TARGET_TABS: Record<string, string> = {
  payment_overdue: "score",
  document_missing: "kyc",
  kyc_pending: "kyc",
  credit_late: "comptes",
  low_balance: "comptes",
  id_expiring: "kyc-legal",
  id_expired: "kyc-legal",
  kyc_expired: "kyc-legal",
  client_inactive: "transactions",
  tontine_late: "comptes",
  score_drop: "score",
  blacklisted: "kyc-legal",
  pep_flagged: "kyc-legal",
  high_risk: "kyc-legal",
  id_missing: "kyc-legal",
};

/** Contextual recommended actions per alert type */
const ALERT_ACTIONS: Record<string, string> = {
  payment_overdue:
    "Contacter le client pour regularisation des paiements en retard.",
  document_missing:
    "Demander les documents KYC lors du prochain contact.",
  kyc_pending:
    "Verifier et valider les documents en attente dans l'onglet Documents KYC.",
  credit_late:
    "Initier une procedure de recouvrement ou envoyer un rappel de paiement.",
  low_balance:
    "Informer le client sur les options de depot disponibles.",
  id_expiring:
    "Demander le renouvellement de la piece d'identite avant expiration.",
  id_expired:
    "La piece d'identite est expiree. Renouvellement urgent requis.",
  kyc_expired:
    "Lancer la procedure de renouvellement KYC. Suspendre les operations si necessaire.",
  client_inactive:
    "Relancer le client par telephone ou SMS pour maintenir la relation.",
  tontine_late:
    "Contacter le client pour regulariser les cotisations tontine en retard.",
  score_drop:
    "Analyser les causes de la baisse du score et prendre des mesures correctives.",
  blacklisted:
    "Client sur liste noire. Verifier les motifs et suspendre les operations si necessaire.",
  pep_flagged:
    "Personne politiquement exposee. Appliquer les mesures de vigilance renforcee (EDD).",
  high_risk:
    "Niveau de risque eleve. Renforcer la surveillance et appliquer les controles LCB-FT.",
  id_missing:
    "Piece d'identite manquante ou rejetee. Demander une piece valide au client.",
};

// ============================================================================
// HELPERS
// ============================================================================

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function isResolutionExpired(resolvedAt: string): boolean {
  const resolved = new Date(resolvedAt);
  const now = new Date();
  return daysBetween(resolved, now) > ALERT_THRESHOLDS.resolutionExpiryDays;
}

/** Parse the alerts JSONB from client, handling old (array) and new (object) format */
function parseAlertsJSONB(raw: any): AlertsJSONB {
  // New format: { resolved: [...], tracking: [...], snoozed: [...] }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.resolved)) {
    return {
      resolved: raw.resolved || [],
      tracking: raw.tracking || [],
      snoozed: raw.snoozed || [],
    };
  }

  // Old format: ResolvedAlertEntry[] (backwards compat)
  if (Array.isArray(raw)) {
    return {
      resolved: raw.filter((e: any) => e.resolvedAt),
      tracking: [],
      snoozed: [],
    };
  }

  return { resolved: [], tracking: [], snoozed: [] };
}

// ============================================================================
// EVALUATION
// ============================================================================

/**
 * Evaluate client alerts server-side.
 * Returns active (unresolved) alerts and the full resolution history.
 * Also persists firstSeenAt tracking for active alert conditions.
 */
export async function evaluateClientAlerts(
  clientId: string
): Promise<AlertsResponse> {
  const client = await storage.getClient(clientId);
  if (!client) return { active: [], resolved: [], snoozed: [] };

  // Load resolved + tracking + snoozed entries from client JSONB
  const clientAny = client as any;
  const alertsData = parseAlertsJSONB(clientAny.alerts);

  // Only non-expired resolutions suppress alerts
  const activeResolutions = alertsData.resolved.filter(
    (e) => !isResolutionExpired(e.resolvedAt)
  );
  const resolvedTypes = new Set(activeResolutions.map((e) => e.alertType));

  // Active snoozes (not yet expired) suppress alerts
  const now = new Date();
  const activeSnoozed = alertsData.snoozed.filter(
    (e) => new Date(e.snoozedUntil) > now
  );
  const snoozedTypes = new Set(activeSnoozed.map((e) => e.alertType));

  // Build a lookup for existing tracking
  const trackingMap = new Map<string, string>();
  for (const t of alertsData.tracking) {
    trackingMap.set(t.alertType, t.firstSeenAt);
  }

  const alerts: ClientAlert[] = [];
  const nowIso = now.toISOString();

  // Track which alert types are detected in this evaluation
  const detectedTypes = new Set<string>();

  const pushAlert = (
    type: AlertType,
    level: ClientAlert["alertLevel"],
    message: string
  ) => {
    detectedTypes.add(type);
    if (!resolvedTypes.has(type) && !snoozedTypes.has(type)) {
      // Use persisted firstSeenAt or fallback to now
      const createdAt = trackingMap.get(type) || nowIso;

      // Temporal escalation: warning alerts older than escalationDays become critical
      let effectiveLevel = level;
      if (level === "warning") {
        const ageInDays = daysBetween(new Date(createdAt), now);
        if (ageInDays >= ALERT_THRESHOLDS.escalationDays) {
          effectiveLevel = "critical";
        }
      }

      alerts.push({
        id: `alert-${clientId}-${type}`,
        clientId,
        alertType: type,
        alertLevel: effectiveLevel,
        message,
        isResolved: false,
        createdAt,
        action: ALERT_ACTIONS[type],
        targetTab: ALERT_TARGET_TABS[type],
      });
    }
  };

  // 1. Documents KYC manquants
  const documents = Array.isArray(client.documents) ? client.documents : [];
  if (documents.length === 0) {
    pushAlert(
      "document_missing",
      "warning",
      "Aucun document KYC uploade. Verification d'identite requise."
    );
  } else {
    const pendingDocs = documents.filter((d: any) => d.status === "pending");
    if (pendingDocs.length > 0) {
      pushAlert(
        "kyc_pending",
        "info",
        `${pendingDocs.length} document(s) en attente de verification.`
      );
    }
  }

  // 2. Credit en retard + Taux de remboursement
  let hasActiveCredits = false;
  try {
    const credits = await getCreditsByClient(clientId);
    hasActiveCredits = credits.length > 0;
    const lateCredits = credits.filter(
      (c) => c.statut === StatutCredit.LATE
    );
    if (lateCredits.length > 0) {
      const totalOverdue = lateCredits.reduce(
        (sum, c) => sum + Number(c.soldeRestant || 0),
        0
      );
      pushAlert(
        "credit_late",
        "critical",
        `${lateCredits.length} credit(s) en retard. Solde restant: ${totalOverdue.toLocaleString("fr-FR")} ${currencySymbol()}.`
      );
    }
  } catch {
    // Non-blocking: credits may not exist for all clients
  }

  // 3. Taux de remboursement critique (includes 0% when credits exist)
  const tauxRemboursement = Number(client.tauxRemboursement || 0);
  if (tauxRemboursement < ALERT_THRESHOLDS.paymentOverdueRate && (tauxRemboursement > 0 || hasActiveCredits)) {
    pushAlert(
      "payment_overdue",
      "critical",
      `Taux de remboursement critique (${tauxRemboursement}%). Action requise.`
    );
  }

  // 4. Solde faible
  try {
    const comptes = await getComptesByClient(clientId);
    const compteCourant = comptes.find(
      (c) =>
        (c.typeCompte as string) === "Courant" &&
        (c.statut as string) === StatutCompte.ACTIVE
    );
    if (
      compteCourant &&
      Number(compteCourant.soldeCourant) < ALERT_THRESHOLDS.lowBalanceThreshold
    ) {
      pushAlert(
        "low_balance",
        "info",
        `Solde compte courant tres faible (${Number(compteCourant.soldeCourant).toLocaleString("fr-FR")} ${currencySymbol()}).`
      );
    }
  } catch {
    // Non-blocking
  }

  // 5. Piece d'identite expiree (separate type) vs expirant bientot
  if (client.dateExpirationPiece) {
    const expiryDate = new Date(client.dateExpirationPiece);
    const daysUntilExpiry = daysBetween(now, expiryDate);

    if (daysUntilExpiry < 0) {
      pushAlert(
        "id_expired",
        "critical",
        `Piece d'identite expiree depuis ${Math.abs(daysUntilExpiry)} jour(s). Renouvellement urgent.`
      );
    } else if (daysUntilExpiry <= ALERT_THRESHOLDS.idExpiryCriticalDays) {
      pushAlert(
        "id_expiring",
        "critical",
        `Piece d'identite expire dans ${daysUntilExpiry} jour(s). Renouvellement urgent.`
      );
    } else if (daysUntilExpiry <= ALERT_THRESHOLDS.idExpiryWarningDays) {
      pushAlert(
        "id_expiring",
        "warning",
        `Piece d'identite expire dans ${daysUntilExpiry} jour(s). Pensez au renouvellement.`
      );
    }
  }

  // 6. KYC expire
  const kycExpired =
    client.kycStatus === "EXPIRED" ||
    (client.kycExpiryDate && new Date(client.kycExpiryDate) < now);
  if (kycExpired) {
    pushAlert(
      "kyc_expired",
      "critical",
      "Dossier KYC expire. Renouvellement requis avant toute nouvelle operation."
    );
  }

  // 7. Client inactif
  if (client.derniereActivite) {
    const lastActivity = new Date(client.derniereActivite);
    const inactiveDays = daysBetween(lastActivity, now);
    if (inactiveDays > ALERT_THRESHOLDS.inactivityDays) {
      pushAlert(
        "client_inactive",
        "info",
        `Client inactif depuis ${inactiveDays} jours. Derniere activite le ${lastActivity.toLocaleDateString("fr-FR")}.`
      );
    }
  }

  // 8. Retard cotisation tontine
  try {
    const memberships = await getTontinesByClient(clientId);
    const lateMembers = memberships.filter(
      (m) => m.lateCount > 0
    );
    if (lateMembers.length > 0) {
      const totalLate = lateMembers.reduce(
        (sum, m) => sum + Number(m.lateCount || 0),
        0
      );
      const tontineNames = lateMembers
        .map((m) => m.tontine?.nom || "Tontine")
        .join(", ");
      pushAlert(
        "tontine_late",
        "warning",
        `${totalLate} cotisation(s) en retard sur ${lateMembers.length} tontine(s): ${tontineNames}.`
      );
    }
  } catch {
    // Non-blocking: client may not be in any tontine
  }

  // 9. Score en chute — segment Risque ou score < seuil
  const clientScore = Number(client.score ?? 50);
  if (clientScore < ALERT_THRESHOLDS.scoreDropThreshold) {
    pushAlert(
      "score_drop",
      "critical",
      `Score client critique (${clientScore}/100). Le client est dans le segment Risque.`
    );
  }

  // 10. Client sur liste noire (AML)
  if (client.isBlacklisted) {
    pushAlert(
      "blacklisted",
      "critical",
      "Client inscrit sur liste noire. Toute operation doit etre suspendue."
    );
  }

  // 11. Personne politiquement exposee (PEP)
  if (client.isPep) {
    pushAlert(
      "pep_flagged",
      "warning",
      "Client identifie comme personne politiquement exposee (PEP). Vigilance renforcee requise."
    );
  }

  // 12. Niveau de risque eleve
  if (client.riskLevel === "HIGH" || client.riskLevel === "VERY_HIGH") {
    pushAlert(
      "high_risk",
      "critical",
      `Niveau de risque ${client.riskLevel === "VERY_HIGH" ? "tres eleve" : "eleve"}. Controles LCB-FT obligatoires.`
    );
  }

  // 13. Piece d'identite manquante ou rejetee
  if (!client.numeroPiece || client.statutVerificationPiece === "REJECTED") {
    pushAlert(
      "id_missing",
      "warning",
      client.statutVerificationPiece === "REJECTED"
        ? "Piece d'identite rejetee. Une nouvelle piece valide est requise."
        : "Aucun numero de piece d'identite renseigne. Identification du client incomplete."
    );
  }

  // ── Persist firstSeenAt tracking ──
  // Update tracking: add new detections, keep existing ones that are still active
  const updatedTracking: AlertTrackingEntry[] = [];
  for (const type of detectedTypes) {
    updatedTracking.push({
      alertType: type,
      firstSeenAt: trackingMap.get(type) || nowIso,
    });
  }

  // Only write if tracking changed
  const trackingChanged =
    updatedTracking.length !== alertsData.tracking.length ||
    updatedTracking.some(
      (t) => !alertsData.tracking.find((old) => old.alertType === t.alertType)
    );

  if (trackingChanged) {
    const updatedJSONB: AlertsJSONB = {
      resolved: alertsData.resolved,
      tracking: updatedTracking,
    };
    // Fire-and-forget: don't block the response
    storage.updateClient(clientId, { alerts: updatedJSONB } as any).catch(() => {});
  }

  return { active: alerts, resolved: alertsData.resolved, snoozed: activeSnoozed };
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolve (dismiss) an alert for a client.
 * If already resolved, refreshes the timestamp (resets the 30-day expiry).
 */
export async function resolveClientAlert(
  clientId: string,
  alertType: string,
  resolvedBy?: string,
  resolvedByName?: string
): Promise<boolean> {
  if (!(KNOWN_ALERT_TYPES as readonly string[]).includes(alertType)) {
    return false;
  }

  const client = await storage.getClient(clientId);
  if (!client) return false;

  const clientAny = client as any;
  const alertsData = parseAlertsJSONB(clientAny.alerts);

  const existingIdx = alertsData.resolved.findIndex(
    (e) => e.alertType === alertType
  );

  if (existingIdx >= 0) {
    // Refresh the resolution timestamp (resets expiry countdown)
    alertsData.resolved[existingIdx] = {
      ...alertsData.resolved[existingIdx],
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      resolvedByName,
    };
  } else {
    alertsData.resolved.push({
      alertType,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      resolvedByName,
    });
  }

  await storage.updateClient(clientId, { alerts: alertsData } as any);
  return true;
}

/**
 * Resolve all active alert types for a client in one shot.
 */
export async function resolveAllClientAlerts(
  clientId: string,
  alertTypes: string[],
  resolvedBy?: string,
  resolvedByName?: string
): Promise<boolean> {
  const client = await storage.getClient(clientId);
  if (!client) return false;

  const clientAny = client as any;
  const alertsData = parseAlertsJSONB(clientAny.alerts);
  const nowIso = new Date().toISOString();

  for (const alertType of alertTypes) {
    if (!(KNOWN_ALERT_TYPES as readonly string[]).includes(alertType)) continue;

    const existingIdx = alertsData.resolved.findIndex(
      (e) => e.alertType === alertType
    );

    if (existingIdx >= 0) {
      alertsData.resolved[existingIdx] = {
        ...alertsData.resolved[existingIdx],
        resolvedAt: nowIso,
        resolvedBy,
        resolvedByName,
      };
    } else {
      alertsData.resolved.push({
        alertType,
        resolvedAt: nowIso,
        resolvedBy,
        resolvedByName,
      });
    }
  }

  await storage.updateClient(clientId, { alerts: alertsData } as any);
  return true;
}

/**
 * Snooze an alert for a client (hides it for snoozeDays, shorter than resolve).
 */
export async function snoozeClientAlert(
  clientId: string,
  alertType: string,
  snoozedBy?: string,
  snoozedByName?: string
): Promise<boolean> {
  if (!(KNOWN_ALERT_TYPES as readonly string[]).includes(alertType)) {
    return false;
  }

  const client = await storage.getClient(clientId);
  if (!client) return false;

  const clientAny = client as any;
  const alertsData = parseAlertsJSONB(clientAny.alerts);

  const now = new Date();
  const snoozedUntil = new Date(now);
  snoozedUntil.setDate(snoozedUntil.getDate() + ALERT_THRESHOLDS.snoozeDays);

  // Replace existing snooze for this type, or add new
  const existingIdx = alertsData.snoozed.findIndex(
    (e) => e.alertType === alertType
  );

  const entry: SnoozedAlertEntry = {
    alertType,
    snoozedAt: now.toISOString(),
    snoozedUntil: snoozedUntil.toISOString(),
    snoozedBy,
    snoozedByName,
  };

  if (existingIdx >= 0) {
    alertsData.snoozed[existingIdx] = entry;
  } else {
    alertsData.snoozed.push(entry);
  }

  await storage.updateClient(clientId, { alerts: alertsData } as any);
  return true;
}

// ============================================================================
// CROSS-CLIENT SUMMARY (Dashboard)
// ============================================================================

export interface AlertsSummaryResponse {
  /** Total clients with at least one risk flag */
  totalAtRisk: number;
  /** Breakdown by risk category */
  breakdown: {
    blacklisted: number;
    pep: number;
    highRisk: number;
    kycExpired: number;
    idExpired: number;
    idMissing: number;
    lowScore: number;
  };
  /** Top at-risk clients for quick action (max 10) */
  topClients: {
    id: string;
    nom: string;
    prenom: string;
    codeClient: string;
    flags: string[];
    score: number;
  }[];
}

/**
 * Lightweight cross-client alert summary using direct SQL.
 * Does NOT evaluate per-client alerts — uses indexed columns for performance.
 */
export async function getAlertsSummary(
  agenceId?: string
): Promise<AlertsSummaryResponse> {
  const agenceCondition = agenceId
    ? sql`AND c.agence_id = ${agenceId}`
    : sql``;

  // Single query to get all at-risk clients with their flags
  const result = await db.execute(sql`
    SELECT
      c.id,
      c.nom,
      c.prenom,
      c.code_client,
      c.score,
      c.is_blacklisted,
      c.is_pep,
      c.risk_level,
      c.kyc_status,
      c.date_expiration_piece,
      c.numero_piece,
      c.statut_verification_piece
    FROM clients c
    WHERE c.statut != 'INACTIF'
      ${agenceCondition}
      AND (
        c.is_blacklisted = true
        OR c.is_pep = true
        OR c.risk_level IN ('HIGH', 'VERY_HIGH')
        OR c.kyc_status = 'EXPIRED'
        OR c.date_expiration_piece < NOW()
        OR c.numero_piece IS NULL
        OR c.statut_verification_piece = 'REJECTED'
        OR c.score < ${ALERT_THRESHOLDS.scoreDropThreshold}
      )
    ORDER BY
      c.is_blacklisted DESC,
      c.risk_level = 'VERY_HIGH' DESC,
      c.risk_level = 'HIGH' DESC,
      c.score ASC
    LIMIT 50
  `);

  const rows = (result as any).rows || result || [];

  const breakdown = {
    blacklisted: 0,
    pep: 0,
    highRisk: 0,
    kycExpired: 0,
    idExpired: 0,
    idMissing: 0,
    lowScore: 0,
  };

  const topClients: AlertsSummaryResponse["topClients"] = [];
  const uniqueIds = new Set<string>();

  for (const row of rows) {
    const flags: string[] = [];

    if (row.is_blacklisted) { flags.push("blacklisted"); breakdown.blacklisted++; }
    if (row.is_pep) { flags.push("pep"); breakdown.pep++; }
    if (row.risk_level === "HIGH" || row.risk_level === "VERY_HIGH") { flags.push("high_risk"); breakdown.highRisk++; }
    if (row.kyc_status === "EXPIRED") { flags.push("kyc_expired"); breakdown.kycExpired++; }
    if (row.date_expiration_piece && new Date(row.date_expiration_piece) < new Date()) { flags.push("id_expired"); breakdown.idExpired++; }
    if (!row.numero_piece || row.statut_verification_piece === "REJECTED") { flags.push("id_missing"); breakdown.idMissing++; }
    if (Number(row.score ?? 50) < ALERT_THRESHOLDS.scoreDropThreshold) { flags.push("low_score"); breakdown.lowScore++; }

    if (!uniqueIds.has(row.id)) {
      uniqueIds.add(row.id);
      if (topClients.length < 10) {
        topClients.push({
          id: row.id,
          nom: row.nom || "",
          prenom: row.prenom || "",
          codeClient: row.code_client || "",
          flags,
          score: Number(row.score ?? 50),
        });
      }
    }
  }

  return {
    totalAtRisk: uniqueIds.size,
    breakdown,
    topClients,
  };
}
