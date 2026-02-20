/**
 * Service d'alerte client - Evaluation server-side
 *
 * Evalue les conditions de risque du client et retourne les alertes actives.
 * Les resolutions sont persistees dans le champ JSONB `alerts` du client.
 * Les resolutions expirent apres RESOLUTION_EXPIRY_DAYS jours — les alertes
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

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

/** Resolution expires after this many days — alert reappears if condition persists */
const RESOLUTION_EXPIRY_DAYS = 30;

/** Low balance threshold in currency units */
const LOW_BALANCE_THRESHOLD = 1000;

/** Client inactivity threshold in days */
const INACTIVITY_DAYS = 90;

/** ID expiration warning thresholds in days */
const ID_EXPIRY_CRITICAL_DAYS = 30;
const ID_EXPIRY_WARNING_DAYS = 90;

/** Score thresholds */
const SCORE_DROP_THRESHOLD = 40;

export const KNOWN_ALERT_TYPES = [
  "payment_overdue",
  "document_missing",
  "kyc_pending",
  "credit_late",
  "low_balance",
  "id_expiring",
  "kyc_expired",
  "client_inactive",
  "tontine_late",
  "score_drop",
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

/** Tracking entry for firstSeenAt persistence */
interface AlertTrackingEntry {
  alertType: string;
  firstSeenAt: string;
}

/** Shape of the `alerts` JSONB stored on client */
interface AlertsJSONB {
  resolved: ResolvedAlertEntry[];
  tracking: AlertTrackingEntry[];
}

export interface AlertsResponse {
  active: ClientAlert[];
  resolved: ResolvedAlertEntry[];
}

/** Maps alert type to the target tab for quick navigation */
const ALERT_TARGET_TABS: Record<string, string> = {
  payment_overdue: "score",
  document_missing: "kyc",
  kyc_pending: "kyc",
  credit_late: "comptes",
  low_balance: "comptes",
  id_expiring: "kyc-legal",
  kyc_expired: "kyc-legal",
  client_inactive: "transactions",
  tontine_late: "comptes",
  score_drop: "score",
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
  kyc_expired:
    "Lancer la procedure de renouvellement KYC. Suspendre les operations si necessaire.",
  client_inactive:
    "Relancer le client par telephone ou SMS pour maintenir la relation.",
  tontine_late:
    "Contacter le client pour regulariser les cotisations tontine en retard.",
  score_drop:
    "Analyser les causes de la baisse du score et prendre des mesures correctives.",
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
  return daysBetween(resolved, now) > RESOLUTION_EXPIRY_DAYS;
}

/** Parse the alerts JSONB from client, handling old (array) and new (object) format */
function parseAlertsJSONB(raw: any): AlertsJSONB {
  // New format: { resolved: [...], tracking: [...] }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.resolved)) {
    return {
      resolved: raw.resolved || [],
      tracking: raw.tracking || [],
    };
  }

  // Old format: ResolvedAlertEntry[] (backwards compat)
  if (Array.isArray(raw)) {
    return {
      resolved: raw.filter((e: any) => e.resolvedAt),
      tracking: [],
    };
  }

  return { resolved: [], tracking: [] };
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
  if (!client) return { active: [], resolved: [] };

  // Load resolved + tracking entries from client JSONB
  const clientAny = client as any;
  const alertsData = parseAlertsJSONB(clientAny.alerts);

  // Only non-expired resolutions suppress alerts
  const activeResolutions = alertsData.resolved.filter(
    (e) => !isResolutionExpired(e.resolvedAt)
  );
  const resolvedTypes = new Set(activeResolutions.map((e) => e.alertType));

  // Build a lookup for existing tracking
  const trackingMap = new Map<string, string>();
  for (const t of alertsData.tracking) {
    trackingMap.set(t.alertType, t.firstSeenAt);
  }

  const alerts: ClientAlert[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  // Track which alert types are detected in this evaluation
  const detectedTypes = new Set<string>();

  const pushAlert = (
    type: AlertType,
    level: ClientAlert["alertLevel"],
    message: string
  ) => {
    detectedTypes.add(type);
    if (!resolvedTypes.has(type)) {
      // Use persisted firstSeenAt or fallback to now
      const createdAt = trackingMap.get(type) || nowIso;
      alerts.push({
        id: `alert-${clientId}-${type}`,
        clientId,
        alertType: type,
        alertLevel: level,
        message,
        isResolved: false,
        createdAt,
        action: ALERT_ACTIONS[type],
        targetTab: ALERT_TARGET_TABS[type],
      });
    }
  };

  // 1. Taux de remboursement critique (< 70%)
  const tauxRemboursement = Number(client.tauxRemboursement || 0);
  if (tauxRemboursement > 0 && tauxRemboursement < 70) {
    pushAlert(
      "payment_overdue",
      "critical",
      `Taux de remboursement critique (${tauxRemboursement}%). Action requise.`
    );
  }

  // 2. Documents KYC manquants
  const documents = Array.isArray(client.documents) ? client.documents : [];
  if (documents.length === 0) {
    pushAlert(
      "document_missing",
      "warning",
      "Aucun document KYC uploade. Verification d'identite requise."
    );
  } else {
    const pendingDocs = documents.filter((d: any) => d.status === "Pending");
    if (pendingDocs.length > 0) {
      pushAlert(
        "kyc_pending",
        "info",
        `${pendingDocs.length} document(s) en attente de verification.`
      );
    }
  }

  // 3. Credit en retard
  try {
    const credits = await getCreditsByClient(clientId);
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
      Number(compteCourant.soldeCourant) < LOW_BALANCE_THRESHOLD
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

  // 5. Piece d'identite expirant / expiree
  if (client.dateExpirationPiece) {
    const expiryDate = new Date(client.dateExpirationPiece);
    const daysUntilExpiry = daysBetween(now, expiryDate);

    if (daysUntilExpiry < 0) {
      pushAlert(
        "id_expiring",
        "critical",
        `Piece d'identite expiree depuis ${Math.abs(daysUntilExpiry)} jour(s). Renouvellement urgent.`
      );
    } else if (daysUntilExpiry <= ID_EXPIRY_CRITICAL_DAYS) {
      pushAlert(
        "id_expiring",
        "critical",
        `Piece d'identite expire dans ${daysUntilExpiry} jour(s). Renouvellement urgent.`
      );
    } else if (daysUntilExpiry <= ID_EXPIRY_WARNING_DAYS) {
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
    if (inactiveDays > INACTIVITY_DAYS) {
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
      (m) => (m as any).lateCount > 0
    );
    if (lateMembers.length > 0) {
      const totalLate = lateMembers.reduce(
        (sum, m) => sum + Number((m as any).lateCount || 0),
        0
      );
      const tontineNames = lateMembers
        .map((m) => (m as any).tontine?.nom || "Tontine")
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
  if (clientScore < SCORE_DROP_THRESHOLD) {
    pushAlert(
      "score_drop",
      "critical",
      `Score client critique (${clientScore}/100). Le client est dans le segment Risque.`
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

  return { active: alerts, resolved: alertsData.resolved };
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
