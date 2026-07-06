/**
 * CaisseLiquidationService - Service pour la liquidation et suppression intelligente des caisses
 * Gère le transfert atomique des fonds avant suppression
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";

const logger = createLogger('CaisseLiquidation');
import {
  caisses,
  sessionsCaisse,
  mouvementsFinanciers,
  evenementsOutbox,
  type Caisse,
  type MouvementFinancier,
} from "@shared/schema";
import { coffresForts } from "@shared/schema/coffres-forts";
import { StatutTransaction, MethodePaiement } from "@shared/enum/status-constants";
import { eq, and, isNull, notInArray } from "drizzle-orm";

const SESSION_TERMINAL_STATUSES = ["CLOSED", "RECONCILIATION_PENDING", "RECONCILIATION_COMPLETE"] as const;
import {
  assertCaisseCanDebit,
  assertCaisseCanCredit,
  assertCoffreCanCredit,
  updateCaisseBalance,
  updateCoffreBalance,
} from "./coffre/coffre-guard";
import { balanceService } from "./balance-service";
import { postGlForMouvement, AccountingRuleNotFoundError } from "./accounting-posting-service";

export interface LiquidationDestination {
  id: string;
  nom: string;
  type: 'COFFRE' | 'CAISSE';
  agenceId: string;
  soldeActuel?: string;
}

export interface CheckLiquidationResult {
  canDelete: boolean;
  soldeActuel: string;
  hasOpenSession: boolean;
  availableDestinations: LiquidationDestination[];
  error?: string;
  errorCode?: string;
}

export interface ExecuteLiquidationParams {
  caisseId: string;
  destinationType: 'COFFRE' | 'CAISSE';
  destinationId: string;
  executedBy: string;
  motif?: string;
}

export interface LiquidationResult {
  success: boolean;
  caisse?: Caisse;
  mouvementDebit?: MouvementFinancier;
  mouvementCredit?: MouvementFinancier;
  montantTransfere?: string;
  error?: string;
  errorCode?: string;
}

export class CaisseLiquidationService {
  /**
   * Wizard de liquidation - Étape 1: Vérification
   * Vérifie si la caisse peut être supprimée et retourne les destinations disponibles
   */
  async checkCaisseLiquidation(caisseId: string): Promise<CheckLiquidationResult> {
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
          availableDestinations: [],
          error: "Caisse non trouvée",
          errorCode: "CAISSE_NOT_FOUND",
        };
      }

      // 2. Vérifier s'il y a une session ouverte
      const [openSession] = await db
        .select()
        .from(sessionsCaisse)
        .where(and(
          eq(sessionsCaisse.caisseId, caisseId),
          notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
          isNull(sessionsCaisse.deletedAt)
        ));

      if (openSession) {
        return {
          canDelete: false,
          soldeActuel: caisse.solde || "0",
          hasOpenSession: true,
          availableDestinations: [],
          error: "Impossible de supprimer une caisse avec une session ouverte. Fermez d'abord la session.",
          errorCode: "SESSION_OPEN",
        };
      }

      const soldeActuel = parseFloat(caisse.solde || "0");

      // 3. Si solde = 0, peut supprimer directement
      if (soldeActuel === 0) {
        return {
          canDelete: true,
          soldeActuel: "0",
          hasOpenSession: false,
          availableDestinations: [],
        };
      }

      // 4. Si solde > 0, récupérer les destinations disponibles
      const destinations: LiquidationDestination[] = [];

      // 4a. Récupérer les coffres de la même agence
      if (caisse.agenceId) {
        const coffresAgence = await db
          .select()
          .from(coffresForts)
          .where(eq(coffresForts.ownerId, caisse.agenceId));

        for (const coffre of coffresAgence) {
          destinations.push({
            id: coffre.id,
            nom: coffre.nom,
            type: 'COFFRE',
            agenceId: coffre.ownerId!,
            soldeActuel: coffre.solde,
          });
        }
      }

      // 4b. Récupérer les autres caisses ouvertes de la même agence
      const autresCaisses = await db
        .select()
        .from(caisses)
        .where(and(
          eq(caisses.agenceId, caisse.agenceId!),
          isNull(caisses.deletedAt)
        ));

      for (const autreCaisse of autresCaisses) {
        // Exclure la caisse actuelle
        if (autreCaisse.id === caisseId) continue;

        // Vérifier si la caisse a une session ouverte
        const [sessionOuverte] = await db
          .select()
          .from(sessionsCaisse)
          .where(and(
            eq(sessionsCaisse.caisseId, autreCaisse.id),
            notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          ));

        if (sessionOuverte) {
          destinations.push({
            id: autreCaisse.id,
            nom: autreCaisse.nom,
            type: 'CAISSE',
            agenceId: autreCaisse.agenceId!,
            soldeActuel: autreCaisse.solde,
          });
        }
      }

      return {
        canDelete: false, // Nécessite transfert
        soldeActuel: soldeActuel.toString(),
        hasOpenSession: false,
        availableDestinations: destinations,
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error checking liquidation');
      return {
        canDelete: false,
        soldeActuel: "0",
        hasOpenSession: false,
        availableDestinations: [],
        error: error.message || "Erreur interne",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  /**
   * Wizard de liquidation - Étape 2: Transfert et Suppression
   * Exécute le transfert atomique des fonds et supprime la caisse
   */
  async executeLiquidation(params: ExecuteLiquidationParams): Promise<LiquidationResult> {
    try {
      // 1. Vérifier que la caisse existe et a un solde > 0
      const [caisse] = await db
        .select()
        .from(caisses)
        .where(and(
          eq(caisses.id, params.caisseId),
          isNull(caisses.deletedAt)
        ));

      if (!caisse) {
        return {
          success: false,
          error: "Caisse non trouvée",
          errorCode: "CAISSE_NOT_FOUND",
        };
      }

      const soldeActuel = parseFloat(caisse.solde || "0");

      if (soldeActuel <= 0) {
        return {
          success: false,
          error: "La caisse n'a pas de solde à transférer",
          errorCode: "NO_BALANCE",
        };
      }

      // 2. Vérifier la destination
      if (params.destinationType === 'COFFRE') {
        const [coffre] = await db
          .select()
          .from(coffresForts)
          .where(eq(coffresForts.id, params.destinationId));

        if (!coffre) {
          return {
            success: false,
            error: "Coffre de destination non trouvé",
            errorCode: "DESTINATION_NOT_FOUND",
          };
        }

        // Vérifier même agence
        if (coffre.ownerId !== caisse.agenceId) {
          return {
            success: false,
            error: "Le coffre doit être de la même agence que la caisse",
            errorCode: "DIFFERENT_AGENCY",
          };
        }
      } else {
        const [caisseDestination] = await db
          .select()
          .from(caisses)
          .where(and(
            eq(caisses.id, params.destinationId),
            isNull(caisses.deletedAt)
          ));

        if (!caisseDestination) {
          return {
            success: false,
            error: "Caisse de destination non trouvée",
            errorCode: "DESTINATION_NOT_FOUND",
          };
        }

        // Vérifier même agence
        if (caisseDestination.agenceId !== caisse.agenceId) {
          return {
            success: false,
            error: "La caisse de destination doit être de la même agence",
            errorCode: "DIFFERENT_AGENCY",
          };
        }

        // Vérifier que la caisse destination a une session ouverte
        const [sessionOuverte] = await db
          .select()
          .from(sessionsCaisse)
          .where(and(
            eq(sessionsCaisse.caisseId, params.destinationId),
            notInArray(sessionsCaisse.statut, [...SESSION_TERMINAL_STATUSES]),
            isNull(sessionsCaisse.deletedAt)
          ));

        if (!sessionOuverte) {
          return {
            success: false,
            error: "La caisse de destination doit avoir une session ouverte",
            errorCode: "DESTINATION_CLOSED",
          };
        }
      }

      // 3. Exécuter la transaction atomique
      const result = await db.transaction(async (tx) => {
        const guardCtx = { userId: params.executedBy, operationType: "LIQUIDATION" };

        // 3a. Lock source caisse + verify balance (amount=0 to just acquire lock)
        const { soldeBefore: montantTransfert } = await assertCaisseCanDebit(
          tx, params.caisseId, 0, guardCtx
        );

        if (montantTransfert <= 0) {
          throw new Error("La caisse n'a pas de solde à transférer");
        }

        // 3b. Lock destination
        if (params.destinationType === 'COFFRE') {
          await assertCoffreCanCredit(tx, params.destinationId, montantTransfert, guardCtx);
        } else {
          await assertCaisseCanCredit(tx, params.destinationId, montantTransfert, guardCtx);
        }

        // 3c. Créer mouvement DEBIT sur la caisse à supprimer
        const reference = `LIQUIDATION-${Date.now()}`;

        const [mouvementDebit] = await tx.insert(mouvementsFinanciers).values({
          montant: montantTransfert.toString(),
          sens: 'DEBIT',
          statut: StatutTransaction.POSTED,
          methodePaiement: MethodePaiement.TRANSFER,
          reference: `${reference}-DEBIT`,
          sourceModule: 'CAISSE',
          sourceTable: 'caisses',
          sourceId: params.caisseId,
          agenceId: caisse.agenceId,
          typePaiement: 'LIQUIDATION',
          createdBy: params.executedBy,
          metadata: {
            description: `Liquidation caisse ${caisse.nom} - Transfert vers ${params.destinationType}`,
            motif: params.motif,
            destinationType: params.destinationType,
            destinationId: params.destinationId,
          },
        }).returning();

        // 3d. Créer mouvement CREDIT sur la destination
        const [mouvementCredit] = await tx.insert(mouvementsFinanciers).values({
          montant: montantTransfert.toString(),
          sens: 'CREDIT',
          statut: StatutTransaction.POSTED,
          methodePaiement: MethodePaiement.TRANSFER,
          reference: `${reference}-CREDIT`,
          sourceModule: params.destinationType === 'COFFRE' ? 'COFFRE' : 'CAISSE',
          sourceTable: params.destinationType === 'COFFRE' ? 'coffres_forts' : 'caisses',
          sourceId: params.destinationId,
          agenceId: caisse.agenceId,
          typePaiement: 'LIQUIDATION',
          createdBy: params.executedBy,
          metadata: {
            description: `Réception liquidation caisse ${caisse.nom}`,
            sourceCaisseId: params.caisseId,
          },
        }).returning();

        // 3d-bis. Post GL entries for both mouvements (non-blocking)
        const agenceId = caisse.agenceId;
        if (agenceId) {
          // GL for debit mouvement
          try {
            const glResultDebit = await postGlForMouvement(tx, mouvementDebit, agenceId, params.executedBy, {
              operationType: 'LIQUIDATION',
              caisseNom: caisse.nom,
            });
            if (glResultDebit) {
              logger.info({ mouvementId: mouvementDebit.id, numeroPiece: glResultDebit.numeroPiece }, 'GL posted for liquidation debit');
            }
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED" })
              .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
          } catch (glError: unknown) {
            const message = glError instanceof Error ? glError.message : "Unknown GL error";
            const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
            logger.warn({ mouvementId: mouvementDebit.id, error: message }, `GL ${status.toLowerCase()} for liquidation debit`);
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: status, glPostingError: message })
              .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
          }

          // GL for credit mouvement
          try {
            const glResultCredit = await postGlForMouvement(tx, mouvementCredit, agenceId, params.executedBy, {
              operationType: 'LIQUIDATION',
              destinationType: params.destinationType,
            });
            if (glResultCredit) {
              logger.info({ mouvementId: mouvementCredit.id, numeroPiece: glResultCredit.numeroPiece }, 'GL posted for liquidation credit');
            }
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: "POSTED" })
              .where(eq(mouvementsFinanciers.id, mouvementCredit.id));
          } catch (glError: unknown) {
            const message = glError instanceof Error ? glError.message : "Unknown GL error";
            const status = glError instanceof AccountingRuleNotFoundError ? "SKIPPED" : "FAILED";
            logger.warn({ mouvementId: mouvementCredit.id, error: message }, `GL ${status.toLowerCase()} for liquidation credit`);
            await tx
              .update(mouvementsFinanciers)
              .set({ glPostingStatus: status, glPostingError: message })
              .where(eq(mouvementsFinanciers.id, mouvementCredit.id));
          }
        } else {
          logger.warn({ caisseId: params.caisseId }, 'GL posting skipped for liquidation: no agenceId');
          await tx
            .update(mouvementsFinanciers)
            .set({ glPostingStatus: "SKIPPED", glPostingError: "No agenceId" })
            .where(eq(mouvementsFinanciers.id, mouvementDebit.id));
          await tx
            .update(mouvementsFinanciers)
            .set({ glPostingStatus: "SKIPPED", glPostingError: "No agenceId" })
            .where(eq(mouvementsFinanciers.id, mouvementCredit.id));
        }

        // 3e. Debit source caisse atomically (full balance)
        await updateCaisseBalance(tx, params.caisseId, -montantTransfert);

        // 3f. Credit destination atomically
        if (params.destinationType === 'COFFRE') {
          await updateCoffreBalance(tx, params.destinationId, montantTransfert);
        } else {
          await updateCaisseBalance(tx, params.destinationId, montantTransfert);
        }

        // 3g. Soft delete de la caisse
        const [deletedCaisse] = await tx.update(caisses)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, params.caisseId))
          .returning();

        return {
          mouvementDebit,
          mouvementCredit,
          deletedCaisse,
          montantTransfert,
        };
      });

      // 4. Créer événement d'audit
      await db.insert(evenementsOutbox).values({
        type: "CAISSE_LIQUIDATED",
        aggregateType: "caisse",
        aggregateId: params.caisseId,
        payload: {
          caisseId: params.caisseId,
          caisseName: caisse.nom,
          montantTransfere: result.montantTransfert.toString(),
          destinationType: params.destinationType,
          destinationId: params.destinationId,
          executedBy: params.executedBy,
          motif: params.motif,
          timestamp: new Date().toISOString(),
        },
      });

      // 5. Broadcast balance updates for real-time UI
      try {
        const montantTransfert = result.montantTransfert;
        const previousCaisseBalance = parseFloat(caisse.solde || "0");
        const ref = result.mouvementDebit.reference || result.mouvementDebit.id;

        // Source caisse (debited to 0)
        balanceService.broadcastBalanceUpdate({
          entityType: 'caisse',
          entityId: params.caisseId,
          agenceId: caisse.agenceId!,
          newBalance: 0,
          previousBalance: previousCaisseBalance,
          mouvementRef: ref,
          sourceModule: 'LIQUIDATION',
          typePaiement: 'LIQUIDATION',
        });

        // Destination (coffre or caisse, credited)
        balanceService.broadcastBalanceUpdate({
          entityType: params.destinationType === 'COFFRE' ? 'coffre' : 'caisse',
          entityId: params.destinationId,
          agenceId: caisse.agenceId!,
          newBalance: 0, // We don't have the exact new balance here, but the invalidation will refetch
          previousBalance: 0,
          mouvementRef: result.mouvementCredit.reference || result.mouvementCredit.id,
          sourceModule: 'LIQUIDATION',
          typePaiement: 'LIQUIDATION',
        });
      } catch (e) {
        logger.error({ err: e }, 'Error broadcasting liquidation');
      }

      return {
        success: true,
        caisse: result.deletedCaisse,
        mouvementDebit: result.mouvementDebit,
        mouvementCredit: result.mouvementCredit,
        montantTransfere: result.montantTransfert.toString(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error executing liquidation');
      return {
        success: false,
        error: error.message || "Erreur interne",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }
}

// Export singleton
export const caisseLiquidationService = new CaisseLiquidationService();
