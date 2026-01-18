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
      const soldeTheorique = parseFloat(session.soldeTheorique || "0");

      // 3. Fermer la session avec marquage force close
      const [closedSession] = await db
        .update(sessionsCaisse)
        .set({
          closedAt: new Date(),
          forcedCloseReason: params.motif || ForcedCloseReason.ADMIN_FORCE,
          forceClosedBy: params.closedBy,
          forceClosedAt: new Date(),
          fundsKeptInCaisse: params.keepFunds || false,
          soldeReel: soldeTheorique.toString(), // Assume theoretical = real for force close
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
          status: "Fermée",
          forceClosed: true,
          sessionId: params.sessionId,
        },
      });

      return {
        success: true,
        session: closedSession,
      };
    } catch (error: any) {
      console.error("Erreur force close session:", error);
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "INTERNAL_ERROR",
      };
    }
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
      console.error("Erreur check caisse deletion:", error);
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
