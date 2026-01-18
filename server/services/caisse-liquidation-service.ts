/**
 * CaisseLiquidationService - Service pour la liquidation et suppression intelligente des caisses
 * Gère le transfert atomique des fonds avant suppression
 */

import { db } from "../db";
import {
  caisses,
  sessionsCaisse,
  mouvementsFinanciers,
  evenementsOutbox,
  type Caisse,
  type MouvementFinancier,
} from "@shared/schema";
import { coffresForts } from "@shared/schema/coffres-forts";
import { eq, and, isNull } from "drizzle-orm";

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
          isNull(sessionsCaisse.closedAt),
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
            isNull(sessionsCaisse.closedAt),
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
      console.error("Erreur check liquidation:", error);
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
            isNull(sessionsCaisse.closedAt),
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
        // 3a. Créer mouvement DEBIT sur la caisse à supprimer
        const reference = `LIQUIDATION-${Date.now()}`;
        
        const [mouvementDebit] = await tx.insert(mouvementsFinanciers).values({
          montant: soldeActuel.toString(),
          sens: 'Débit',
          statut: 'Posté',
          methodePaiement: 'Virement',
          reference: `${reference}-DEBIT`,
          sourceModule: 'CAISSE',
          sourceTable: 'caisses',
          sourceId: params.caisseId,
          agenceId: caisse.agenceId,
          typePaiement: 'Liquidation Suppression' as any,
          createdBy: params.executedBy,
          metadata: {
            description: `Liquidation caisse ${caisse.nom} - Transfert vers ${params.destinationType}`,
            motif: params.motif,
            destinationType: params.destinationType,
            destinationId: params.destinationId,
          },
        }).returning();

        // 3b. Créer mouvement CREDIT sur la destination
        const [mouvementCredit] = await tx.insert(mouvementsFinanciers).values({
          montant: soldeActuel.toString(),
          sens: 'Crédit',
          statut: 'Posté',
          methodePaiement: 'Virement',
          reference: `${reference}-CREDIT`,
          sourceModule: params.destinationType === 'COFFRE' ? 'COFFRE' : 'CAISSE',
          sourceTable: params.destinationType === 'COFFRE' ? 'coffres_forts' : 'caisses',
          sourceId: params.destinationId,
          agenceId: caisse.agenceId,
          typePaiement: 'Liquidation Suppression' as any,
          createdBy: params.executedBy,
          metadata: {
            description: `Réception liquidation caisse ${caisse.nom}`,
            sourceCaisseId: params.caisseId,
          },
        }).returning();

        // 3c. Mettre à jour le solde de la caisse source à 0
        await tx.update(caisses)
          .set({
            solde: "0",
            updatedAt: new Date(),
          })
          .where(eq(caisses.id, params.caisseId));

        // 3d. Mettre à jour le solde de la destination
        if (params.destinationType === 'COFFRE') {
          const [coffre] = await tx.select().from(coffresForts).where(eq(coffresForts.id, params.destinationId));
          const nouveauSolde = parseFloat(coffre.solde || "0") + soldeActuel;
          
          await tx.update(coffresForts)
            .set({
              solde: nouveauSolde.toString(),
              updatedAt: new Date(),
            })
            .where(eq(coffresForts.id, params.destinationId));
        } else {
          const [caisseDestination] = await tx.select().from(caisses).where(eq(caisses.id, params.destinationId));
          const nouveauSolde = parseFloat(caisseDestination.solde || "0") + soldeActuel;
          
          await tx.update(caisses)
            .set({
              solde: nouveauSolde.toString(),
              updatedAt: new Date(),
            })
            .where(eq(caisses.id, params.destinationId));
        }

        // 3e. Soft delete de la caisse
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
          montantTransfere: soldeActuel.toString(),
          destinationType: params.destinationType,
          destinationId: params.destinationId,
          executedBy: params.executedBy,
          motif: params.motif,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        caisse: result.deletedCaisse,
        mouvementDebit: result.mouvementDebit,
        mouvementCredit: result.mouvementCredit,
        montantTransfere: soldeActuel.toString(),
      };
    } catch (error: any) {
      console.error("Erreur execute liquidation:", error);
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
