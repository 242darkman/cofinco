import { db } from "../../db";
import {
  sessionsCaisse,
  sessionsCaisseAuditLogs,
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  caisses,
} from "@shared/schema";
import { eq, and, isNull, notInArray } from "drizzle-orm";
import { StatutTransfertCoffre } from "@shared/enum/status-constants";
import { TransfertCoffreService } from "../coffre/transfert-service";
import { getWsInstance } from "../../ws-server";
import { createLogger } from "../../lib/logger";
import { TERMINAL_STATUSES, DEFAULT_REQUEST_EXPIRY_HOURS } from "./session-opening-constants";
import type { SessionRow, TransfertRow } from "./types";

const logger = createLogger('SessionOpeningRequest');
const transfertService = new TransfertCoffreService();

export interface RequestOpeningParams {
  caissierId: string;
  caisseId: string;
  agenceId: string;
  montantDemande: number;
  observations?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RequestOpeningResult {
  success: boolean;
  session?: SessionRow;
  transfert?: TransfertRow;
  error?: string;
  errorCode?:
    | "CAISSE_OCCUPIED"
    | "USER_HAS_SESSION"
    | "INVALID_AMOUNT"
    | "COFFRE_NOT_FOUND"
    | "DB_ERROR";
}

/**
 * PHASE A: Demande d'ouverture par le caissier
 */
export async function requestSessionOpening(
  params: RequestOpeningParams
): Promise<RequestOpeningResult> {
  const {
    caissierId,
    caisseId,
    agenceId,
    montantDemande,
    observations,
    ipAddress,
    userAgent,
  } = params;

  // Validation: Montant positif
  if (montantDemande <= 0) {
    return {
      success: false,
      error: "Le montant demandé doit être positif",
      errorCode: "INVALID_AMOUNT",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Vérifier qu'aucune session n'est ouverte sur cette caisse
      const existingCaisseSession = await tx
        .select()
        .from(sessionsCaisse)
        .where(
          and(
            eq(sessionsCaisse.caisseId, caisseId),
            notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          )
        )
        .limit(1);

      if (existingCaisseSession.length > 0) {
        throw new Error("CAISSE_OCCUPIED");
      }

      // 2. Vérifier que le caissier n'a pas d'autre session active
      const existingUserSession = await tx
        .select()
        .from(sessionsCaisse)
        .where(
          and(
            eq(sessionsCaisse.caissierId, caissierId),
            notInArray(sessionsCaisse.statut, [...TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          )
        )
        .limit(1);

      if (existingUserSession.length > 0) {
        throw new Error("USER_HAS_SESSION");
      }

      // 3. Récupérer le solde veille de la caisse physique
      const [caisse] = await tx
        .select()
        .from(caisses)
        .where(eq(caisses.id, caisseId));

      if (!caisse) {
        throw new Error("CAISSE_NOT_FOUND");
      }

      const soldeVeille = Number(caisse.solde || 0);

      // 4. Récupérer ou créer le coffre-fort de l'agence
      const coffreFort = await transfertService.getOrCreateCoffreFort(
        agenceId
      );

      // 5. Calculer l'expiration de la demande
      const requestExpiresAt = new Date();
      requestExpiresAt.setHours(
        requestExpiresAt.getHours() + DEFAULT_REQUEST_EXPIRY_HOURS
      );

      // 6. Créer la session en état REQUESTING_FUNDS
      const [session] = await tx
        .insert(sessionsCaisse)
        .values({
          caissierId,
          caisseId,
          agenceId,
          statut: "REQUESTING_FUNDS",
          montantOuverture: "0", // Sera calculé à la Phase C
          montantFermetureTheorique: "0",
          montantDemande: montantDemande.toString(),
          soldeVeille: soldeVeille.toString(),
          fundsRequestedAt: new Date(),
          requestExpiresAt,
          observations,
          connectionStatus: "DISCONNECTED",
        })
        .returning();

      // 7. Créer le transfert COFFRE_VERS_CAISSE
      const { randomBytes } = require('crypto');
      const reference = `OUV-${Date.now().toString().slice(-6)}-${randomBytes(3).toString('hex').slice(0, 3).toUpperCase()}`;

      const [transfert] = await tx
        .insert(transfertsCoffreCaisse)
        .values({
          agenceId,
          typeTransfert: "COFFRE_VERS_CAISSE",
          coffreId: coffreFort.id,
          caisseId,
          montant: montantDemande.toString(),
          motif: `Approvisionnement ouverture caisse - Session ${session.id}`,
          reference,
          statut: "REQUESTED",
          requestedBy: caissierId,
          requestedAt: new Date(),
          sessionOuvertureId: session.id,
          isOpeningFund: true,
        })
        .returning();

      // 8. Lier le transfert à la session
      await tx
        .update(sessionsCaisse)
        .set({ openingTransfertId: transfert.id })
        .where(eq(sessionsCaisse.id, session.id));

      // 9. Créer log d'audit session
      await tx.insert(sessionsCaisseAuditLogs).values({
        sessionId: session.id,
        action: "FUNDS_REQUESTED",
        statutApres: "REQUESTING_FUNDS",
        details: {
          montantDemande,
          soldeVeille,
          transfertId: transfert.id,
          caisseId,
          agenceId,
          coffreId: coffreFort.id,
        },
        userId: caissierId,
        ipAddress,
        userAgent,
      });

      // 10. Créer log d'audit transfert
      await tx.insert(transfertsCoffreAuditLogs).values({
        transfertId: transfert.id,
        action: "CREATED",
        statutApres: StatutTransfertCoffre.REQUESTED,
        details: {
          typeTransfert: "COFFRE_VERS_CAISSE",
          montant: montantDemande,
          isOpeningFund: true,
          sessionId: session.id,
        },
        userId: caissierId,
        ipAddress,
        userAgent,
      });

      // 11. Notification WebSocket au coffre (demande en attente)
      try {
        const ws = getWsInstance();
        if (ws) {
          // Notifier le coffre d'une nouvelle demande d'ouverture
          ws.broadcastToAggregate('coffre', agenceId, {
            type: 'REALTIME_EVENT',
            payload: {
              aggregateType: 'coffre',
              aggregateId: agenceId,
              event: 'OPENING_REQUEST_CREATED',
              transfertId: transfert.id,
              sessionId: session.id,
              montant: montantDemande,
              caisseId,
            }
          });

          // Activité en temps réel
          ws.broadcastToAgency(agenceId, {
            type: 'LIVE_ACTIVITY',
            payload: {
              action: `Demande d'ouverture: ${montantDemande.toLocaleString()} FCFA`,
              type: 'request',
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (wsError) {
        logger.error({ err: wsError }, 'WebSocket notification failed');
      }

      return {
        success: true,
        session: { ...session, openingTransfertId: transfert.id },
        transfert,
      };
    });
  } catch (error: unknown) {
    if ((error as Error).message === "CAISSE_OCCUPIED") {
      return {
        success: false,
        error: "Cette caisse est déjà occupée ou a une demande en cours",
        errorCode: "CAISSE_OCCUPIED",
      };
    }
    if ((error as Error).message === "USER_HAS_SESSION") {
      return {
        success: false,
        error: "Vous avez déjà une session ouverte ou une demande en cours",
        errorCode: "USER_HAS_SESSION",
      };
    }
    if ((error as Error).message === "CAISSE_NOT_FOUND") {
      return {
        success: false,
        error: "Caisse non trouvée",
        errorCode: "DB_ERROR",
      };
    }
    // Contrainte unique DB (race condition — belt-and-suspenders avec SERIALIZABLE)
    if ((error as { code?: string }).code === "23505") {
      const constraint = (error as { constraint?: string }).constraint || '';
      if (constraint.includes("one_active_per_caisse") || constraint.includes("caisse")) {
        return {
          success: false,
          error: "Cette caisse a déjà une session active ou une demande en cours.",
          errorCode: "CAISSE_OCCUPIED",
        };
      }
      if (constraint.includes("one_active_per_user") || constraint.includes("user")) {
        return {
          success: false,
          error: "Vous avez déjà une session active ou une demande en cours.",
          errorCode: "USER_HAS_SESSION",
        };
      }
    }
    logger.error({ err: error }, 'Error in requestSessionOpening');
    return {
      success: false,
      error: (error instanceof Error ? error.message : "Erreur interne"),
      errorCode: "DB_ERROR",
    };
  }
}
