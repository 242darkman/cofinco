import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  comptageBillets,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { STATUT_SESSION_CAISSE_LABELS, type StatutSessionCaisseType } from "@shared/enum/status-constants";
import { calculateBilletageTotal } from "./session-service";
import { createLogger } from "../../lib/logger";
import { recordEcartAudit } from "./session-closing-audit";
import type { SessionRow, BilletageRecord } from "./types";

const logger = createLogger('SessionClosingCount');

// Seuil d'écart considéré comme "mineur" (en FCFA)
const ECART_MINEUR_SEUIL = 100;

export interface SubmitCountParams {
  sessionId: string;
  caissierId: string;
  billetageFermeture: Record<string, number>;
  ecartJustification?: string; // Obligatoire si écart != 0
  ipAddress?: string;
  userAgent?: string;
}

export interface SubmitCountResult {
  success: boolean;
  session?: SessionRow;
  soldeTheorique?: number;
  montantPhysique?: number;
  ecart?: number;
  error?: string;
  errorCode?:
    | "SESSION_NOT_FOUND"
    | "NOT_YOUR_SESSION"
    | "INVALID_STATUS"
    | "MISSING_JUSTIFICATION"
    | "DB_ERROR";
}

export interface SubmitVerificationCountParams {
  sessionId: string;
  verifierId: string;
  billetage: Record<string, number>;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SubmitVerificationCountResult {
  success: boolean;
  verificationTotal?: number;
  primaryTotal?: number;
  ecartVerification?: number;
  matched?: boolean;
  error?: string;
  errorCode?: string;
}

export interface SessionCountsResult {
  primary: { total: number; billetage: BilletageRecord; countedBy?: string; countedAt?: string } | null;
  verification: { total: number; billetage: BilletageRecord; countedBy?: string; countedAt?: string } | null;
  ecartVerification: number | null;
  matched: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────
// PHASE B: Soumission du comptage à l'aveugle (Blind Count)
// ─────────────────────────────────────────────────────────────────────────
export async function submitCount(params: SubmitCountParams): Promise<SubmitCountResult> {
  const {
    sessionId,
    caissierId,
    billetageFermeture,
    ecartJustification,
    ipAddress,
    userAgent,
  } = params;

  try {
    return await db.transaction(async (tx) => {
      // 1. Récupérer la session
      const [session] = await tx
        .select()
        .from(sessionsCaisse)
        .where(eq(sessionsCaisse.id, sessionId));

      if (!session) {
        return {
          success: false,
          error: "Session introuvable",
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      // 2. Vérifier que c'est bien la session du caissier
      if (session.caissierId !== caissierId) {
        return {
          success: false,
          error: "Cette session ne vous appartient pas",
          errorCode: "NOT_YOUR_SESSION",
        };
      }

      // 3. Vérifier que la session est en statut CLOSING_COUNT
      if (session.statut !== "CLOSING_COUNT") {
        const label = STATUT_SESSION_CAISSE_LABELS[session.statut as StatutSessionCaisseType] || session.statut;
        return {
          success: false,
          error: `Impossible de soumettre le comptage : la session est actuellement en statut « ${label} » et non en phase de comptage.`,
          errorCode: "INVALID_STATUS",
        };
      }

      // 4. Calculer le montant physique depuis le billetage
      const montantPhysique = calculateBilletageTotal(billetageFermeture);

      // 5. Récupérer le solde théorique
      const soldeTheorique = Number(session.montantFermetureTheorique || 0);

      // 6. Calculer l'écart
      const ecart = montantPhysique - soldeTheorique;

      // 7. Si écart non-nul, vérifier que la justification est fournie
      if (Math.abs(ecart) > 0 && !ecartJustification?.trim()) {
        return {
          success: false,
          error: `Un écart de ${ecart.toLocaleString('fr-FR')} FCFA a été détecté. Une justification est obligatoire.`,
          errorCode: "MISSING_JUSTIFICATION",
          soldeTheorique,
          montantPhysique,
          ecart,
        };
      }

      // 8. Mettre à jour la session avec les données de comptage
      const [updatedSession] = await tx
        .update(sessionsCaisse)
        .set({
          statut: "CLOSING_VALIDATION",
          billetageFermeture,
          montantFermetureDeclare: montantPhysique.toString(),
          montantPhysique: montantPhysique.toString(),
          ecart: ecart.toString(),
          ecartJustification: ecartJustification || null,
          countSubmittedAt: new Date(),
          lastActivity: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sessionsCaisse.id, sessionId))
        .returning();

      // 9. Enregistrer le Billetage de Fermeture dans comptage_billets
      await tx.insert(comptageBillets).values({
        sessionId: sessionId,
        typeComptage: "FERMETURE",
        billets10000: billetageFermeture["10000"] || 0,
        billets5000: billetageFermeture["5000"] || 0,
        billets2000: billetageFermeture["2000"] || 0,
        billets1000: billetageFermeture["1000"] || 0,
        billets500: billetageFermeture["500"] || 0,
        pieces250: billetageFermeture["250"] || 0,
        pieces100: billetageFermeture["100"] || 0,
        pieces50: billetageFermeture["50"] || 0,
        pieces25: billetageFermeture["25"] || 0,
        totalCalcule: montantPhysique.toString(),
        totalDeclare: montantPhysique.toString(),
        ecart: ecart.toString(),
        observations: ecartJustification || "Billetage de fermeture de session",
      });

      // 10. Créer log d'audit
      await tx.insert(sessionsCaisseAuditLogs).values({
        sessionId,
        action: "COUNT_SUBMITTED",
        userId: caissierId,
        statutAvant: session.statut,
        statutApres: "CLOSING_VALIDATION",
        details: {
          montantPhysique,
          soldeTheorique,
          ecart,
          ecartJustification,
        },
        ipAddress,
        userAgent,
      });

      // 11. Si écart significatif, créer une entrée dans l'historique des écarts
      if (Math.abs(ecart) > ECART_MINEUR_SEUIL) {
        await recordEcartAudit(tx, {
          sessionId,
          caissierId,
          agenceId: session.agenceId || undefined,
          soldeTheorique,
          montantPhysique,
          ecart,
          justification: ecartJustification || "",
          ipAddress,
          userAgent,
        });
      }

      return {
        success: true,
        session: updatedSession,
        soldeTheorique,
        montantPhysique,
        ecart,
      };
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'submitCount error');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur lors de la soumission du comptage"),
      errorCode: "DB_ERROR",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// VERIFICATION COUNT: Second blind count by a different user (supervisor)
// ─────────────────────────────────────────────────────────────────────────
export async function submitVerificationCount(params: SubmitVerificationCountParams): Promise<SubmitVerificationCountResult> {
  const { sessionId, verifierId, billetage, observations, ipAddress, userAgent } = params;

  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, sessionId));
      if (!session) {
        return { success: false, error: "Session introuvable", errorCode: "SESSION_NOT_FOUND" };
      }

      // Must be in CLOSING_VALIDATION (after primary count)
      if (session.statut !== "CLOSING_VALIDATION") {
        return { success: false, error: "La session doit être en phase de validation pour un comptage de vérification", errorCode: "INVALID_STATUS" };
      }

      // Verifier must be different from the cashier
      if (session.caissierId === verifierId) {
        return { success: false, error: "Le vérificateur doit être différent du caissier", errorCode: "SAME_USER" };
      }

      // Check if verification already submitted
      const existingVerif = await tx
        .select()
        .from(comptageBillets)
        .where(and(eq(comptageBillets.sessionId, sessionId), eq(comptageBillets.typeComptage, "VERIFICATION")));

      if (existingVerif.length > 0) {
        return { success: false, error: "Un comptage de vérification a déjà été soumis pour cette session", errorCode: "ALREADY_VERIFIED" };
      }

      const verificationTotal = calculateBilletageTotal(billetage);
      const primaryTotal = Number(session.montantPhysique || 0);
      const ecartVerification = verificationTotal - primaryTotal;

      // Record verification count
      await tx.insert(comptageBillets).values({
        sessionId,
        typeComptage: "VERIFICATION",
        billets10000: billetage["10000"] || 0,
        billets5000: billetage["5000"] || 0,
        billets2000: billetage["2000"] || 0,
        billets1000: billetage["1000"] || 0,
        billets500: billetage["500"] || 0,
        pieces250: billetage["250"] || 0,
        pieces100: billetage["100"] || 0,
        pieces50: billetage["50"] || 0,
        pieces25: billetage["25"] || 0,
        totalCalcule: verificationTotal.toString(),
        totalDeclare: verificationTotal.toString(),
        ecart: ecartVerification.toString(),
        validePar: verifierId,
        dateValidation: new Date(),
        observations: observations || "Comptage de vérification",
      });

      // Audit log
      await tx.insert(sessionsCaisseAuditLogs).values({
        sessionId,
        action: "VERIFICATION_COUNT_SUBMITTED",
        userId: verifierId,
        statutAvant: session.statut,
        statutApres: session.statut, // no status change
        details: {
          verificationTotal,
          primaryTotal,
          ecartVerification,
          matched: Math.abs(ecartVerification) <= ECART_MINEUR_SEUIL,
        },
        ipAddress,
        userAgent,
      });

      return {
        success: true,
        verificationTotal,
        primaryTotal,
        ecartVerification,
        matched: Math.abs(ecartVerification) <= ECART_MINEUR_SEUIL,
      };
    });
  } catch (error: unknown) {
    logger.error({ err: error }, 'submitVerificationCount error');
    return { success: false, error: (error instanceof Error ? error.message : "Erreur lors du comptage de vérification"), errorCode: "DB_ERROR" };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET COUNTS: Retrieve primary and verification counts for a session
// ─────────────────────────────────────────────────────────────────────────
export async function getSessionCounts(sessionId: string): Promise<SessionCountsResult> {
  const counts = await db
    .select({
      typeComptage: comptageBillets.typeComptage,
      totalCalcule: comptageBillets.totalCalcule,
      ecart: comptageBillets.ecart,
      validePar: comptageBillets.validePar,
      dateValidation: comptageBillets.dateValidation,
      billets10000: comptageBillets.billets10000,
      billets5000: comptageBillets.billets5000,
      billets2000: comptageBillets.billets2000,
      billets1000: comptageBillets.billets1000,
      billets500: comptageBillets.billets500,
      pieces250: comptageBillets.pieces250,
      pieces100: comptageBillets.pieces100,
      pieces50: comptageBillets.pieces50,
      pieces25: comptageBillets.pieces25,
      observations: comptageBillets.observations,
      createdAt: comptageBillets.createdAt,
    })
    .from(comptageBillets)
    .where(eq(comptageBillets.sessionId, sessionId));

  const primary = counts.find(c => c.typeComptage === "FERMETURE");
  const verification = counts.find(c => c.typeComptage === "VERIFICATION");

  const primaryTotal = primary ? Number(primary.totalCalcule) : null;
  const verificationTotal = verification ? Number(verification.totalCalcule) : null;
  const ecartVerification = primaryTotal !== null && verificationTotal !== null
    ? verificationTotal - primaryTotal
    : null;

  return {
    primary: primary ? {
      total: Number(primary.totalCalcule),
      billetage: {
        "10000": primary.billets10000, "5000": primary.billets5000,
        "2000": primary.billets2000, "1000": primary.billets1000,
        "500": primary.billets500, "250": primary.pieces250,
        "100": primary.pieces100, "50": primary.pieces50,
        "25": primary.pieces25,
      },
      countedBy: primary.validePar || undefined,
      countedAt: primary.createdAt?.toISOString(),
    } : null,
    verification: verification ? {
      total: Number(verification.totalCalcule),
      billetage: {
        "10000": verification.billets10000, "5000": verification.billets5000,
        "2000": verification.billets2000, "1000": verification.billets1000,
        "500": verification.billets500, "250": verification.pieces250,
        "100": verification.pieces100, "50": verification.pieces50,
        "25": verification.pieces25,
      },
      countedBy: verification.validePar || undefined,
      countedAt: verification.createdAt?.toISOString(),
    } : null,
    ecartVerification,
    matched: ecartVerification !== null ? Math.abs(ecartVerification) <= ECART_MINEUR_SEUIL : null,
  };
}
