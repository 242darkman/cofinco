/**
 * Service d'alerte client - Evaluation server-side
 *
 * Evalue les conditions de risque du client et retourne les alertes actives.
 * Les alertes sont calculees a la volee (pas stockees en DB) sauf les
 * resolved_ids qui sont persistes dans le champ JSON `alerts` du client.
 */

import { storage } from "../storage";
import { getComptesByClient, getCreditsByClient, getDemandesByClient } from "../storage/finance";
import { StatutCredit, StatutCompte } from "@shared/enum/status-constants";

// ============================================================================
// TYPES
// ============================================================================

export interface ClientAlert {
  id: string;
  client_id: string;
  alert_type: "payment_overdue" | "document_missing" | "kyc_pending" | "credit_late" | "low_balance";
  alert_level: "info" | "warning" | "critical";
  message: string;
  is_resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

interface ResolvedAlertEntry {
  alertType: string;
  resolvedAt: string;
  resolvedBy?: string;
}

// ============================================================================
// EVALUATION
// ============================================================================

/**
 * Evaluate client alerts server-side.
 * Returns all active (unresolved) alerts for a given client.
 */
export async function evaluateClientAlerts(clientId: string): Promise<ClientAlert[]> {
  const client = await storage.getClient(clientId);
  if (!client) return [];

  // Load resolved alert types from client.alerts JSON
  const resolvedEntries: ResolvedAlertEntry[] = Array.isArray(client.alerts)
    ? (client.alerts as ResolvedAlertEntry[]).filter((a: any) => a.resolvedAt)
    : [];
  const resolvedTypes = new Set(resolvedEntries.map((e) => e.alertType));

  const alerts: ClientAlert[] = [];
  const now = new Date().toISOString();

  // 1. Taux de remboursement critique (< 70%)
  const tauxRemboursement = Number(client.tauxRemboursement || 0);
  if (tauxRemboursement > 0 && tauxRemboursement < 70 && !resolvedTypes.has("payment_overdue")) {
    alerts.push({
      id: `alert-${clientId}-payment_overdue`,
      client_id: clientId,
      alert_type: "payment_overdue",
      alert_level: "critical",
      message: `Taux de remboursement critique (${tauxRemboursement}%). Action requise.`,
      is_resolved: false,
      created_at: now,
    });
  }

  // 2. Documents KYC manquants
  const documents = Array.isArray(client.documents) ? client.documents : [];
  if (documents.length === 0 && !resolvedTypes.has("document_missing")) {
    alerts.push({
      id: `alert-${clientId}-document_missing`,
      client_id: clientId,
      alert_type: "document_missing",
      alert_level: "warning",
      message: "Aucun document KYC uploade. Verification d'identite requise.",
      is_resolved: false,
      created_at: now,
    });
  } else {
    const pendingDocs = documents.filter((d: any) => d.status === "Pending");
    if (pendingDocs.length > 0 && !resolvedTypes.has("kyc_pending")) {
      alerts.push({
        id: `alert-${clientId}-kyc_pending`,
        client_id: clientId,
        alert_type: "kyc_pending",
        alert_level: "info",
        message: `${pendingDocs.length} document(s) en attente de verification.`,
        is_resolved: false,
        created_at: now,
      });
    }
  }

  // 3. Credit en retard
  try {
    const credits = await getCreditsByClient(clientId);
    const lateCredits = credits.filter((c) => c.statut === StatutCredit.LATE);
    if (lateCredits.length > 0 && !resolvedTypes.has("credit_late")) {
      const totalOverdue = lateCredits.reduce(
        (sum, c) => sum + Number(c.soldeRestant || 0),
        0
      );
      alerts.push({
        id: `alert-${clientId}-credit_late`,
        client_id: clientId,
        alert_type: "credit_late",
        alert_level: "critical",
        message: `${lateCredits.length} credit(s) en retard. Solde restant: ${totalOverdue.toLocaleString("fr-FR")} FCFA.`,
        is_resolved: false,
        created_at: now,
      });
    }
  } catch {
    // Non-blocking: credits may not exist for all clients
  }

  // 4. Solde faible (< 1000 FCFA sur compte courant)
  try {
    const comptes = await getComptesByClient(clientId);
    const compteCourant = comptes.find(
      (c) => c.typeCompte === "Courant" && c.statut === StatutCompte.ACTIVE
    );
    if (
      compteCourant &&
      Number(compteCourant.soldeCourant) < 1000 &&
      !resolvedTypes.has("low_balance")
    ) {
      alerts.push({
        id: `alert-${clientId}-low_balance`,
        client_id: clientId,
        alert_type: "low_balance",
        alert_level: "info",
        message: `Solde compte courant tres faible (${Number(compteCourant.soldeCourant).toLocaleString("fr-FR")} FCFA).`,
        is_resolved: false,
        created_at: now,
      });
    }
  } catch {
    // Non-blocking
  }

  return alerts;
}

/**
 * Resolve (dismiss) an alert for a client.
 * Persists the resolved alert type in client.alerts JSON.
 */
export async function resolveClientAlert(
  clientId: string,
  alertType: string,
  resolvedBy?: string
): Promise<boolean> {
  const client = await storage.getClient(clientId);
  if (!client) return false;

  const existingResolved: ResolvedAlertEntry[] = Array.isArray(client.alerts)
    ? (client.alerts as ResolvedAlertEntry[])
    : [];

  // Don't duplicate
  if (existingResolved.some((e) => e.alertType === alertType)) {
    return true;
  }

  const updatedResolved: ResolvedAlertEntry[] = [
    ...existingResolved,
    {
      alertType,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
    },
  ];

  await storage.updateClient(clientId, { alerts: updatedResolved } as any);
  return true;
}
