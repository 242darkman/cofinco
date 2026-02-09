import { db } from "../../db";
import { sql, eq, and } from "drizzle-orm";
import {
  coffresForts,
  evacuationsCoffre,
  evacuationsCoffreAuditLogs,
  mouvementsFinanciers,
} from "@shared/schema";
import { generateReference } from "../ledger";
import { postGlForMouvement } from "../accounting-posting-service";
import { StatutEvacuationCoffre } from "@shared/enum/status-constants";
import { createLogger } from "../../lib/logger";

const logger = createLogger("EvacuationCoffre");

// ============================================================================
// TYPES ET ERREURS
// ============================================================================

export class EvacuationAlreadyProcessedError extends Error {
  public readonly code = "EVC_CONFLICT";
  public readonly httpStatus = 409;
  constructor(message: string, public readonly evacuationId: string) {
    super(message);
    this.name = "EvacuationAlreadyProcessedError";
  }
}

export class InsufficientFundsError extends Error {
  public readonly code = "EVC_003";
  public readonly httpStatus = 400;
  constructor(public readonly soldeDisponible: number, public readonly montantRequis: number) {
    super(`Solde insuffisant. Disponible: ${soldeDisponible.toLocaleString()} XAF, Requis: ${montantRequis.toLocaleString()} XAF`);
    this.name = "InsufficientFundsError";
  }
}

interface DispatchResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementTransitId?: string;
}

interface DepositResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementDepotId?: string;
  ecart?: number;
}

// ============================================================================
// VERROUILLAGE PESSIMISTE
// ============================================================================

async function selectEvacuationForUpdate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  evacuationId: string,
) {
  const result = await tx.execute(
    sql`SELECT * FROM evacuations_coffre WHERE id = ${evacuationId} FOR UPDATE NOWAIT`,
  );

  if (!result.rows || result.rows.length === 0) return null;

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    reference: row.reference as string,
    dateEvacuation: row.date_evacuation as string,
    coffreSourceId: row.coffre_source_id as string,
    agenceId: row.agence_id as string,
    typeDestination: row.type_destination as string,
    banqueNom: row.banque_nom as string | null,
    banqueCompte: row.banque_compte as string | null,
    banqueNumeroComptable: row.banque_numero_comptable as string | null,
    coffreDestinationId: row.coffre_destination_id as string | null,
    transporteurNom: row.transporteur_nom as string | null,
    montant: row.montant as string,
    devise: row.devise as string,
    motifEvacuation: row.motif_evacuation as string,
    motifDetail: row.motif_detail as string,
    statut: row.statut as string,
    createdBy: row.created_by as string,
    preparedBy: row.prepared_by as string | null,
    montantCompte: row.montant_compte as string | null,
    verrouille: row.verrouille as boolean,
    mouvementTransitId: row.mouvement_transit_id as string | null,
    mouvementDepotId: row.mouvement_depot_id as string | null,
    metadata: row.metadata as any,
  };
}

async function checkMouvementAlreadyExists(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  evacuationId: string,
  type: string,
): Promise<boolean> {
  const result = await tx.execute(
    sql`SELECT id FROM mouvements_financiers
        WHERE metadata->>'evacuationCoffreId' = ${evacuationId}
        AND metadata->>'type' = ${type}
        LIMIT 1`,
  );
  return result.rows && result.rows.length > 0;
}

// ============================================================================
// EXECUTION DU DISPATCH (SORTIE COFFRE -> TRANSIT)
// ============================================================================

/**
 * Exécute le dispatch d'une évacuation.
 * Comptabilité: Débit 581 (transit) / Crédit 531 (coffre)
 */
export async function executeDispatch(
  evacuationId: string,
  userId: string,
  userRole: string,
  dispatchData: {
    agentsTransport?: Array<{ userId?: string; nom: string; contact: string; fonction?: string }>;
    heureDepart?: string;
  },
  ipAddress?: string,
  userAgent?: string,
): Promise<DispatchResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Verrouillage pessimiste
      const evacuation = await selectEvacuationForUpdate(tx, evacuationId);

      if (!evacuation) {
        return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
      }

      // 2. Vérification d'état
      if (evacuation.verrouille) {
        throw new EvacuationAlreadyProcessedError(
          "Cette évacuation a déjà été traitée",
          evacuationId,
        );
      }

      if (evacuation.statut !== StatutEvacuationCoffre.PREPARED) {
        if (evacuation.statut === StatutEvacuationCoffre.IN_TRANSIT ||
            evacuation.statut === StatutEvacuationCoffre.DEPOSITED) {
          throw new EvacuationAlreadyProcessedError(
            `Évacuation déjà expédiée (statut: ${evacuation.statut})`,
            evacuationId,
          );
        }
        return {
          success: false,
          errorCode: "EVC_020",
          error: `Impossible d'expédier une évacuation en statut "${evacuation.statut}"`,
        };
      }

      // 3. Idempotence
      const mouvExists = await checkMouvementAlreadyExists(tx, evacuationId, "SORTIE_COFFRE_EVACUATION");
      if (mouvExists) {
        throw new EvacuationAlreadyProcessedError("Un mouvement de sortie existe déjà", evacuationId);
      }

      // 4. Verrouillage coffre source
      const coffreResult = await tx.execute(
        sql`SELECT * FROM coffres_forts WHERE id = ${evacuation.coffreSourceId} FOR UPDATE`,
      );
      if (!coffreResult.rows || coffreResult.rows.length === 0) {
        return { success: false, errorCode: "EVC_006", error: "Coffre source introuvable" };
      }
      const coffreSource = coffreResult.rows[0] as Record<string, unknown>;

      // 5. Vérifier le solde
      const soldeSource = parseFloat((coffreSource.solde as string) || "0");
      const montant = parseFloat(evacuation.montantCompte || evacuation.montant || "0");

      if (soldeSource < montant) {
        throw new InsufficientFundsError(soldeSource, montant);
      }

      // 6. Créer le mouvement financier (sortie coffre)
      const refTransit = generateReference("EVC");
      const agenceId = evacuation.agenceId;

      const [mouvementTransit] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: montant.toString(),
          sens: "CREDIT",
          reference: refTransit,
          sourceModule: "EVACUATION_COFFRE" as any,
          typePaiement: "COFFRE_TRANSIT_OUT" as any,
          agenceId,
          statut: "POSTED",
          dateOperation: new Date(),
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: {
            evacuationCoffreId: evacuationId,
            type: "SORTIE_COFFRE_EVACUATION",
            coffreSourceId: evacuation.coffreSourceId,
            typeDestination: evacuation.typeDestination,
          },
        })
        .returning();

      // 7. Débiter le coffre source
      await tx
        .update(coffresForts)
        .set({
          solde: sql`${coffresForts.solde} - ${montant}`,
          updatedAt: new Date(),
        })
        .where(eq(coffresForts.id, evacuation.coffreSourceId));

      // 8. GL Posting: eventType = EVACUATION_COFFRE_OUT (STRICT)
      const glResultDispatch = await postGlForMouvement(tx, mouvementTransit, agenceId, userId, {
        evacuationCoffreId: evacuationId,
        direction: "DISPATCH",
        coffreSourceCode: coffreSource.code as string,
        eventType: "EVACUATION_COFFRE_OUT",
      });
      if (glResultDispatch) {
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, mouvementTransit.id));
      }

      // 9. Mettre à jour l'évacuation
      const now = new Date();
      const updateResult = await tx
        .update(evacuationsCoffre)
        .set({
          statut: StatutEvacuationCoffre.IN_TRANSIT,
          dispatchedBy: userId,
          dispatchedAt: now,
          heureDepart: dispatchData.heureDepart || now.toTimeString().slice(0, 8),
          agentsTransport: dispatchData.agentsTransport || undefined,
          mouvementTransitId: mouvementTransit.id,
          dateComptable: now.toISOString().split("T")[0],
          verrouille: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(evacuationsCoffre.id, evacuationId),
            eq(evacuationsCoffre.statut, StatutEvacuationCoffre.PREPARED),
          ),
        )
        .returning();

      if (updateResult.length === 0) {
        throw new EvacuationAlreadyProcessedError(
          "L'évacuation a été modifiée par un autre processus",
          evacuationId,
        );
      }

      // 10. Audit
      await tx.insert(evacuationsCoffreAuditLogs).values({
        evacuationId,
        action: "DISPATCHED",
        statutAvant: StatutEvacuationCoffre.PREPARED,
        statutApres: StatutEvacuationCoffre.IN_TRANSIT,
        details: {
          mouvementTransitId: mouvementTransit.id,
          montant,
          soldeAvant: soldeSource,
          soldeApres: soldeSource - montant,
          agentsTransport: dispatchData.agentsTransport,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      logger.info({ evacuationId, montant, mouvementId: mouvementTransit.id }, "Dispatch exécuté");

      return { success: true, mouvementTransitId: mouvementTransit.id };
    });
  } catch (error) {
    if (error instanceof EvacuationAlreadyProcessedError || error instanceof InsufficientFundsError) {
      throw error;
    }
    logger.error({ evacuationId, error }, "Erreur lors du dispatch");
    throw error;
  }
}

// ============================================================================
// EXECUTION DU DEPOT (TRANSIT -> DESTINATION)
// ============================================================================

/**
 * Exécute le dépôt d'une évacuation.
 * Comptabilité selon destination:
 * - BANQUE: Débit 512 / Crédit 581
 * - COFFRE_CENTRAL: Débit 531 / Crédit 581
 * - TRANSPORTEUR: Débit 512 / Crédit 581
 */
export async function executeDeposit(
  evacuationId: string,
  userId: string,
  userRole: string,
  depositData: {
    montantDepose: number;
    referenceBordereau?: string;
    referenceRecuTransporteur?: string;
    heureDepot?: string;
    commentaireDepot?: string;
  },
  ipAddress?: string,
  userAgent?: string,
): Promise<DepositResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Verrouillage
      const evacuation = await selectEvacuationForUpdate(tx, evacuationId);

      if (!evacuation) {
        return { success: false, errorCode: "EVC_050", error: "Évacuation introuvable" };
      }

      if (evacuation.statut !== StatutEvacuationCoffre.IN_TRANSIT) {
        if (evacuation.statut === StatutEvacuationCoffre.DEPOSITED) {
          throw new EvacuationAlreadyProcessedError("Dépôt déjà enregistré", evacuationId);
        }
        return {
          success: false,
          errorCode: "EVC_020",
          error: `Impossible d'enregistrer le dépôt pour statut "${evacuation.statut}"`,
        };
      }

      // 2. Idempotence
      const mouvExists = await checkMouvementAlreadyExists(tx, evacuationId, "DEPOT_EVACUATION");
      if (mouvExists) {
        throw new EvacuationAlreadyProcessedError("Un mouvement de dépôt existe déjà", evacuationId);
      }

      // 3. Déterminer le type d'événement GL selon destination
      let eventType: string;
      switch (evacuation.typeDestination) {
        case "BANQUE":
          eventType = "EVACUATION_COFFRE_BANQUE";
          break;
        case "COFFRE_CENTRAL":
          eventType = "EVACUATION_COFFRE_CENTRAL";
          break;
        case "TRANSPORTEUR":
          eventType = "EVACUATION_COFFRE_TRANSPORTEUR";
          break;
        default:
          return { success: false, errorCode: "EVC_019", error: `Type de destination inconnu: ${evacuation.typeDestination}` };
      }

      const montantDepose = depositData.montantDepose;
      const montantOriginal = parseFloat(evacuation.montantCompte || evacuation.montant || "0");

      // 4. Créer le mouvement de dépôt
      const refDepot = generateReference("EVC");
      const [mouvementDepot] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: montantDepose.toString(),
          sens: "DEBIT",
          reference: refDepot,
          sourceModule: "EVACUATION_COFFRE" as any,
          typePaiement: "COFFRE_TRANSIT_IN" as any,
          agenceId: evacuation.agenceId,
          statut: "POSTED",
          dateOperation: new Date(),
          requiresGlPosting: true,
          glPostingStatus: "PENDING",
          metadata: {
            evacuationCoffreId: evacuationId,
            type: "DEPOT_EVACUATION",
            typeDestination: evacuation.typeDestination,
            referenceBordereau: depositData.referenceBordereau,
          },
        })
        .returning();

      // 5. Si COFFRE_CENTRAL, créditer le coffre destination
      if (evacuation.typeDestination === "COFFRE_CENTRAL" && evacuation.coffreDestinationId) {
        await tx
          .update(coffresForts)
          .set({
            solde: sql`${coffresForts.solde} + ${montantDepose}`,
            updatedAt: new Date(),
          })
          .where(eq(coffresForts.id, evacuation.coffreDestinationId));
      }

      // 6. GL Posting (STRICT — failure rolls back transaction)
      const glResultDeposit = await postGlForMouvement(tx, mouvementDepot, evacuation.agenceId, userId, {
        evacuationCoffreId: evacuationId,
        direction: "DEPOSIT",
        typeDestination: evacuation.typeDestination,
        eventType,
      });
      if (glResultDeposit) {
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED", glPostingError: null })
          .where(eq(mouvementsFinanciers.id, mouvementDepot.id));
      }

      // 7. Calculer l'écart
      const ecart = montantDepose - montantOriginal;

      // 8. Mettre à jour l'évacuation
      const now = new Date();
      await tx
        .update(evacuationsCoffre)
        .set({
          statut: StatutEvacuationCoffre.DEPOSITED,
          depositedBy: userId,
          depositedAt: now,
          heureDepot: depositData.heureDepot || now.toTimeString().slice(0, 8),
          montantDepose: montantDepose.toString(),
          referenceBordereau: depositData.referenceBordereau,
          referenceRecuTransporteur: depositData.referenceRecuTransporteur,
          commentaireDepot: depositData.commentaireDepot,
          mouvementDepotId: mouvementDepot.id,
          updatedAt: now,
        })
        .where(eq(evacuationsCoffre.id, evacuationId));

      // 9. Audit
      await tx.insert(evacuationsCoffreAuditLogs).values({
        evacuationId,
        action: "DEPOSITED",
        statutAvant: StatutEvacuationCoffre.IN_TRANSIT,
        statutApres: StatutEvacuationCoffre.DEPOSITED,
        details: {
          mouvementDepotId: mouvementDepot.id,
          montantDepose,
          montantOriginal,
          ecart,
          referenceBordereau: depositData.referenceBordereau,
          typeDestination: evacuation.typeDestination,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      logger.info({ evacuationId, montantDepose, ecart, mouvementId: mouvementDepot.id }, "Dépôt exécuté");

      return { success: true, mouvementDepotId: mouvementDepot.id, ecart };
    });
  } catch (error) {
    if (error instanceof EvacuationAlreadyProcessedError) throw error;
    logger.error({ evacuationId, error }, "Erreur lors du dépôt");
    throw error;
  }
}
