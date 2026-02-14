/**
 * CaisseAdminService - Service pour les opérations administratives sur les caisses
 * Réservé aux rôles ADMIN et CHEF_AGENCE
 */

import { db } from "../db";
import {
  sessionsCaisse,
  caisses,
  mouvementsFinanciers,
  evenementsOutbox,
  type SessionCaisse,
  type Caisse,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { ForcedCloseReason } from "@shared/enums";
import { createLogger } from "../lib/logger";

const logger = createLogger('CaisseAdmin');

export interface ForceCloseSessionParams {
  sessionId: string;
  closedBy: string;
  motif: string;
  keepFunds?: boolean;
}

export interface ForceCloseResult {
  success: boolean;
  session?: SessionCaisse;
  error?: string;
  errorCode?: string;
}

export interface DeleteCaisseWithTransferParams {
  caisseId: string;
  deletedBy: string;
  transferDestination: 'COFFRE' | 'CAISSE';
  destinationId?: string;
  motif?: string;
}

export interface DeleteCaisseResult {
  success: boolean;
  caisse?: Caisse;
  transferMouvementId?: string;
  error?: string;
  errorCode?: string;
}

export class CaisseAdminService {
  /**
   * Force la fermeture d'une session de caisse active
   * Réservé aux ADMIN et CHEF_AGENCE
   */
  async forceCloseSession(params: ForceCloseSessionParams): Promise<ForceCloseResult> {
    try {
      // 1. Vérifier que la session existe et est ouverte
      const [session] = await db
        .select()
        .from(sessionsCaisse)
        .where(and(
          eq(sessionsCaisse.id, params.sessionId),
          isNull(sessionsCaisse.deletedAt)
        ));

      if (!session) {
        return {
          success: false,
          error: "Session non trouvée",
          errorCode: "SESSION_NOT_FOUND",
        };
      }

      if (session.closedAt) {
        return {
          success: false,
          error: "La session n'est pas ouverte",
          errorCode: "SESSION_NOT_OPEN",
        };
      }

      // 2. Calculer le solde théorique actuel
      const soldeTheorique = parseFloat(session.montantFermetureTheorique || "0");

      // 3. Fermer la session avec marquage force close
      const [closedSession] = await db
        .update(sessionsCaisse)
        .set({
          closedAt: new Date(),
          forcedCloseReason: params.motif || ForcedCloseReason.ADMIN_FORCE,
          forceClosedBy: params.closedBy,
          forceClosedAt: new Date(),
          fundsKeptInCaisse: params.keepFunds || false,
          montantFermetureDeclare: soldeTheorique.toString(), // Assume theoretical = real for force close
          ecart: "0",
          updatedAt: new Date(),
        })
        .where(eq(sessionsCaisse.id, params.sessionId))
        .returning();

      // 4. Créer événement d'audit
      await db.insert(evenementsOutbox).values({
        type: "SESSION_FORCE_CLOSED",
        aggregateType: "session_caisse",
        aggregateId: params.sessionId,
        payload: {
          sessionId: params.sessionId,
          caisseId: session.caisseId,
          caissierId: session.caissierId,
          closedBy: params.closedBy,
          motif: params.motif,
          keepFunds: params.keepFunds,
          soldeTheorique: soldeTheorique.toString(),
          timestamp: new Date().toISOString(),
        },
      });

      // 5. Créer événement pour mise à jour temps réel
      await db.insert(evenementsOutbox).values({
        type: "CAISSE_STATUS_CHANGED",
        aggregateType: "caisse",
        aggregateId: session.caisseId,
        payload: {
          caisseId: session.caisseId,
          status: "CLOSED",
          forceClosed: true,
          sessionId: params.sessionId,
        },
      });

      return {
        success: true,
        session: closedSession,
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error force closing session');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  /**
   * Fermeture forcée de la session de caisse lors du logout utilisateur.
   * Reporte le solde théorique intégralement pour la prochaine ouverture.
   * Non-bloquant : retourne silencieusement si aucune session ouverte.
   */
  async forceCloseOnLogout(userId: string): Promise<void> {
    // 1. Trouver la session ouverte du user
    const [session] = await db
      .select()
      .from(sessionsCaisse)
      .where(and(
        eq(sessionsCaisse.caissierId, userId),
        isNull(sessionsCaisse.closedAt),
        isNull(sessionsCaisse.deletedAt)
      ));

    if (!session) return; // Pas de session ouverte — rien à faire

    const soldeTheorique = parseFloat(session.montantFermetureTheorique || "0");
    const now = new Date();

    await db.transaction(async (tx) => {
      // 2. Fermer la session avec report intégral du solde
      await tx
        .update(sessionsCaisse)
        .set({
          statut: "CLOSED",
          closedAt: now,
          closingFinalizedAt: now,
          forcedCloseReason: ForcedCloseReason.USER_LOGOUT,
          forceClosedBy: userId,
          forceClosedAt: now,
          fundsKeptInCaisse: true,
          montantFermetureDeclare: soldeTheorique.toString(),
          montantPhysique: soldeTheorique.toString(),
          montantReporte: soldeTheorique.toString(),
          montantVersCoffre: "0",
          ecart: "0",
          updatedAt: now,
        })
        .where(eq(sessionsCaisse.id, session.id));

      // 3. Mettre à jour le solde de la caisse physique (carry-over)
      await tx
        .update(caisses)
        .set({
          solde: soldeTheorique.toString(),
          updatedAt: now,
        })
        .where(eq(caisses.id, session.caisseId));

      // 4. Événement d'audit
      await tx.insert(evenementsOutbox).values({
        type: "SESSION_FORCE_CLOSED",
        aggregateType: "session_caisse",
        aggregateId: session.id,
        payload: {
          sessionId: session.id,
          caisseId: session.caisseId,
          caissierId: session.caissierId,
          closedBy: userId,
          reason: ForcedCloseReason.USER_LOGOUT,
          soldeReporte: soldeTheorique.toString(),
          timestamp: now.toISOString(),
        },
      });

      // 5. Événement temps réel
      await tx.insert(evenementsOutbox).values({
        type: "CAISSE_STATUS_CHANGED",
        aggregateType: "caisse",
        aggregateId: session.caisseId,
        payload: {
          caisseId: session.caisseId,
          status: "CLOSED",
          forceClosed: true,
          reason: ForcedCloseReason.USER_LOGOUT,
          sessionId: session.id,
        },
      });
    });

    logger.info({ userId, sessionId: session.id, soldeReporte: soldeTheorique }, 'Caisse session force-closed on logout');
  }

  /**
   * Vérifie si une caisse peut être supprimée
   * Retourne le solde actuel et les destinations disponibles
   */
  async checkCaisseDeletion(caisseId: string): Promise<{
    canDelete: boolean;
    soldeActuel: string;
    hasOpenSession: boolean;
    availableDestinations?: {
      coffres: Array<{ id: string; nom: string; agenceId: string }>;
      caisses: Array<{ id: string; nom: string; agenceId: string }>;
    };
    error?: string;
  }> {
    try {
      // 1. Vérifier que la caisse existe
      const [caisse] = await db
        .select()
        .from(caisses)
        .where(and(
          eq(caisses.id, caisseId),
          isNull(caisses.deletedAt)
        ));

      if (!caisse) {
        return {
          canDelete: false,
          soldeActuel: "0",
          hasOpenSession: false,
          error: "Caisse non trouvée",
        };
      }

      // 2. Vérifier s'il y a une session ouverte
      const [openSession] = await db
        .select()
        .from(sessionsCaisse)
        .where(and(
          eq(sessionsCaisse.caisseId, caisseId),
          isNull(sessionsCaisse.closedAt),
          isNull(sessionsCaisse.deletedAt)
        ));

      if (openSession) {
        return {
          canDelete: false,
          soldeActuel: caisse.solde || "0",
          hasOpenSession: true,
          error: "Impossible de supprimer une caisse avec une session ouverte",
        };
      }

      const soldeActuel = parseFloat(caisse.solde || "0");

      // 3. Si solde = 0, peut supprimer directement
      if (soldeActuel === 0) {
        return {
          canDelete: true,
          soldeActuel: "0",
          hasOpenSession: false,
        };
      }

      // 4. Si solde > 0, retourner les destinations disponibles
      // TODO: Implémenter la récupération des coffres et caisses de la même agence
      // Pour l'instant, retourner une structure vide
      return {
        canDelete: false,
        soldeActuel: soldeActuel.toString(),
        hasOpenSession: false,
        availableDestinations: {
          coffres: [],
          caisses: [],
        },
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking caisse deletion');
      return {
        canDelete: false,
        soldeActuel: "0",
        hasOpenSession: false,
        error: error.message || "Erreur interne",
      };
    }
  }
}

// Export singleton
export const caisseAdminService = new CaisseAdminService();
