import { db } from "../../db";
import { sql, eq, and } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  comptesLiaison,
  reconciliationsLiaison,
  tachesRegularisation,
  mouvementsFinanciers,
} from "@shared/schema";
import { generateReference } from "../ledger";
import {
  TypeTacheRegularisation,
  StatutTacheRegularisation,
  Priorite,
} from "@shared/enum/status-constants";

// ============================================================================
// TYPES ET ERREURS PERSONNALISÉES
// ============================================================================

export class TransfertAlreadyProcessedError extends Error {
  public readonly code: string = "TIC_CONFLICT";
  public readonly httpStatus: number = 409;

  constructor(message: string, public readonly transfertId: string) {
    super(message);
    this.name = "TransfertAlreadyProcessedError";
  }
}

export class InsufficientFundsError extends Error {
  public readonly code: string = "TIC_003";
  public readonly httpStatus: number = 400;

  constructor(
    public readonly soldeDisponible: number,
    public readonly montantRequis: number
  ) {
    super(
      `Solde insuffisant. Disponible: ${soldeDisponible.toLocaleString()} XAF, Requis: ${montantRequis.toLocaleString()} XAF`
    );
    this.name = "InsufficientFundsError";
  }
}

interface DispatchResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementSourceId?: string;
}

interface ReceiveResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementDestId?: string;
  reconciliationId?: string;
  tacheId?: string;
  ecart?: number;
}

// ============================================================================
// VERROUILLAGE PESSIMISTE (FOR UPDATE)
// ============================================================================

/**
 * Récupère un transfert avec verrouillage en écriture (FOR UPDATE).
 * Bloque les autres transactions jusqu'à la fin de la transaction courante.
 * Utilise NOWAIT pour échouer immédiatement si la ligne est verrouillée.
 */
async function selectTransfertForUpdate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  transfertId: string
): Promise<typeof transfertsInterCoffres.$inferSelect | null> {
  // Requête SQL brute avec FOR UPDATE NOWAIT
  const result = await tx.execute(
    sql`SELECT * FROM transferts_inter_coffres WHERE id = ${transfertId} FOR UPDATE NOWAIT`
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

  // Mapper les colonnes snake_case vers l'objet TypeScript
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    reference: row.reference as string,
    dateTransfert: row.date_transfert as string,
    heureDepart: row.heure_depart as string | null,
    coffreSourceId: row.coffre_source_id as string,
    coffreDestinationId: row.coffre_destination_id as string,
    montant: row.montant as string,
    devise: row.devise as string,
    typeTransfert: row.type_transfert as any,
    typeConditionnement: row.type_conditionnement as any,
    numeroScelle: row.numero_scelle as string | null,
    motif: row.motif as string,
    statut: row.statut as any,
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date | null,
    submittedBy: row.submitted_by as string | null,
    submittedAt: row.submitted_at as Date | null,
    approvedByLevel1: row.approved_by_level1 as string | null,
    approvedAtLevel1: row.approved_at_level1 as Date | null,
    commentaireN1: row.commentaire_n1 as string | null,
    approvedByLevel2: row.approved_by_level2 as string | null,
    approvedAtLevel2: row.approved_at_level2 as Date | null,
    commentaireN2: row.commentaire_n2 as string | null,
    dispatchedBy: row.dispatched_by as string | null,
    dispatchedAt: row.dispatched_at as Date | null,
    agentsTransport: row.agents_transport as any,
    receivedBy: row.received_by as string | null,
    receivedAt: row.received_at as Date | null,
    heureReception: row.heure_reception as string | null,
    montantRecu: row.montant_recu as string | null,
    conforme: row.conforme as boolean | null,
    commentaireReception: row.commentaire_reception as string | null,
    ecartMontant: row.ecart_montant as string | null,
    motifEcart: row.motif_ecart as string | null,
    mouvementSourceId: row.mouvement_source_id as string | null,
    mouvementDestinationId: row.mouvement_destination_id as string | null,
    dateComptable: row.date_comptable as string | null,
    rejectionReason: row.rejection_reason as string | null,
    rejectedBy: row.rejected_by as string | null,
    rejectedAt: row.rejected_at as Date | null,
    cancellationReason: row.cancellation_reason as string | null,
    cancelledBy: row.cancelled_by as string | null,
    cancelledAt: row.cancelled_at as Date | null,
    verrouille: row.verrouille as boolean,
    idempotencyKey: row.idempotency_key as string | null,
    metadata: row.metadata as any,
    updatedAt: row.updated_at as Date | null,
  };
}

/**
 * Vérifie qu'un mouvement de ce type n'existe pas déjà pour ce transfert.
 * Protection contre les insertions dupliquées.
 */
async function checkMouvementAlreadyExists(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  transfertId: string,
  type: "SORTIE_COFFRE_TRANSIT" | "ENTREE_COFFRE_RECEPTION"
): Promise<boolean> {
  const result = await tx.execute(
    sql`SELECT id FROM mouvements_financiers 
        WHERE metadata->>'transfertInterCoffreId' = ${transfertId} 
        AND metadata->>'type' = ${type}
        LIMIT 1`
  );
  return result.rows && result.rows.length > 0;
}

// ============================================================================
// EXECUTION DU DISPATCH (DÉPART EN TRANSIT)
// ============================================================================

/**
 * Exécute le dispatch d'un transfert (départ en transit)
 * - Acquiert un verrou exclusif sur la ligne (FOR UPDATE NOWAIT)
 * - Vérifie l'état et l'idempotence
 * - Débite le coffre source
 * - Crée le mouvement financier
 * - Verrouille le transfert
 * 
 * @throws TransfertAlreadyProcessedError si le transfert a déjà été dispatché
 * @throws InsufficientFundsError si le solde est insuffisant
 */
export async function executeDispatch(
  transfertId: string,
  userId: string,
  userRole: string,
  ipAddress?: string,
  userAgent?: string
): Promise<DispatchResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. VERROUILLAGE PESSIMISTE: Récupérer le transfert avec FOR UPDATE NOWAIT
      const transfert = await selectTransfertForUpdate(tx, transfertId);

      if (!transfert) {
        return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
      }

      // 2. VÉRIFICATION D'ÉTAT STRICTE (après verrouillage)
      if (transfert.verrouille) {
        throw new TransfertAlreadyProcessedError(
          "Ce transfert a déjà été traité par un autre processus",
          transfertId
        );
      }

      if (transfert.statut !== "APPROVED_L2") {
        // Si déjà "IN_TRANSIT", c'est une demande dupliquée
        if (transfert.statut === "IN_TRANSIT" || transfert.statut === "RECEIVED" || transfert.statut === "RECEIVED_WITH_DISCREPANCY") {
          throw new TransfertAlreadyProcessedError(
            `Ce transfert a déjà été dispatché (statut actuel: ${transfert.statut})`,
            transfertId
          );
        }
        return {
          success: false,
          errorCode: "TIC_020",
          error: `Impossible de dispatcher un transfert en statut "${transfert.statut}"`,
        };
      }

      // 3. IDEMPOTENCE MÉTIER: Vérifier qu'aucun mouvement de sortie n'existe
      const mouvementExists = await checkMouvementAlreadyExists(
        tx,
        transfertId,
        "SORTIE_COFFRE_TRANSIT"
      );
      if (mouvementExists) {
        throw new TransfertAlreadyProcessedError(
          "Un mouvement de sortie existe déjà pour ce transfert",
          transfertId
        );
      }

      // 4. Récupérer le coffre source avec verrouillage
      const coffreResult = await tx.execute(
        sql`SELECT * FROM coffres_forts WHERE id = ${transfert.coffreSourceId} FOR UPDATE`
      );
      
      if (!coffreResult.rows || coffreResult.rows.length === 0) {
        return { success: false, errorCode: "TIC_006", error: "Coffre source introuvable" };
      }
      
      const coffreSource = coffreResult.rows[0] as Record<string, unknown>;

      // 5. Vérifier le solde
      const soldeSource = parseFloat((coffreSource.solde as string) || "0");
      const montant = parseFloat(transfert.montant?.toString() || "0");

      if (soldeSource < montant) {
        throw new InsufficientFundsError(soldeSource, montant);
      }

      // 6. Créer le mouvement financier (sortie du coffre source)
      const referenceSource = generateReference("TIC");
      const [mouvementSource] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: transfert.montant,
          sens: "CREDIT", // Sortie = Crédit (diminution)
          reference: referenceSource,
          sourceModule: "TRANSFERT",
          agenceId: coffreSource.owner_id as string | null,
          statut: "POSTED",
          dateOperation: new Date(),
          metadata: {
            transfertInterCoffreId: transfertId,
            type: "SORTIE_COFFRE_TRANSIT",
            coffreSourceId: transfert.coffreSourceId,
            coffreDestId: transfert.coffreDestinationId,
          },
        })
        .returning();

      // 7. Débiter le coffre source (atomique)
      await tx
        .update(coffresForts)
        .set({
          solde: sql`${coffresForts.solde} - ${montant}`,
          updatedAt: new Date(),
        })
        .where(eq(coffresForts.id, transfert.coffreSourceId));

      // 8. Mettre à jour le transfert avec condition stricte
      const now = new Date();
      const updateResult = await tx
        .update(transfertsInterCoffres)
        .set({
          statut: "IN_TRANSIT",
          dispatchedBy: userId,
          dispatchedAt: now,
          mouvementSourceId: mouvementSource.id,
          dateComptable: now.toISOString().split("T")[0],
          verrouille: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(transfertsInterCoffres.id, transfertId),
            eq(transfertsInterCoffres.statut, "APPROVED_L2") // Double vérification
          )
        )
        .returning();

      // Si l'update n'a rien modifié, quelqu'un d'autre a changé le statut
      if (updateResult.length === 0) {
        throw new TransfertAlreadyProcessedError(
          "Le transfert a été modifié par un autre processus pendant le traitement",
          transfertId
        );
      }

      // 9. Log d'audit
      await tx.insert(transfertsInterCoffresAuditLogs).values({
        transfertId,
        action: "DISPATCHED",
        statutAvant: "APPROVED_L2",
        statutApres: "IN_TRANSIT",
        details: {
          mouvementSourceId: mouvementSource.id,
          montant,
          soldeAvant: soldeSource,
          soldeApres: soldeSource - montant,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      return { success: true, mouvementSourceId: mouvementSource.id };
    });
  } catch (error) {
    // Gérer les erreurs de verrouillage PostgreSQL
    if (error instanceof TransfertAlreadyProcessedError) {
      return {
        success: false,
        errorCode: error.code,
        error: error.message,
      };
    }
    if (error instanceof InsufficientFundsError) {
      return {
        success: false,
        errorCode: error.code,
        error: error.message,
      };
    }
    // PostgreSQL error pour NOWAIT lock conflict
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "55P03") {
      // lock_not_available
      return {
        success: false,
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur. Veuillez réessayer.",
      };
    }
    throw error;
  }
}

// ============================================================================
// EXECUTION DE LA RÉCEPTION
// ============================================================================

/**
 * Exécute la réception d'un transfert
 * - Acquiert un verrou exclusif sur la ligne (FOR UPDATE NOWAIT)
 * - Vérifie l'état et l'idempotence
 * - Crédite le coffre destination
 * - Crée les mouvements financiers
 * - Gère les écarts
 * - Crée la réconciliation
 * 
 * @throws TransfertAlreadyProcessedError si le transfert a déjà été réceptionné
 */
export async function executeReceive(
  transfertId: string,
  userId: string,
  userRole: string,
  data: {
    montantRecu: number;
    conforme: boolean;
    commentaire?: string;
    motifEcart?: string;
    heureReception?: string;
  },
  ipAddress?: string,
  userAgent?: string
): Promise<ReceiveResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. VERROUILLAGE PESSIMISTE: Récupérer le transfert avec FOR UPDATE NOWAIT
      const transfert = await selectTransfertForUpdate(tx, transfertId);

      if (!transfert) {
        return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
      }

      // 2. VÉRIFICATION D'ÉTAT STRICTE (après verrouillage)
      if (transfert.statut !== "IN_TRANSIT") {
        if (transfert.statut === "RECEIVED" || transfert.statut === "RECEIVED_WITH_DISCREPANCY") {
          throw new TransfertAlreadyProcessedError(
            `Ce transfert a déjà été réceptionné (statut actuel: ${transfert.statut})`,
            transfertId
          );
        }
        return {
          success: false,
          errorCode: "TIC_020",
          error: `Impossible de réceptionner un transfert en statut "${transfert.statut}"`,
        };
      }

      // 3. IDEMPOTENCE MÉTIER: Vérifier qu'aucun mouvement d'entrée n'existe
      const mouvementExists = await checkMouvementAlreadyExists(
        tx,
        transfertId,
        "ENTREE_COFFRE_RECEPTION"
      );
      if (mouvementExists) {
        throw new TransfertAlreadyProcessedError(
          "Un mouvement d'entrée existe déjà pour ce transfert",
          transfertId
        );
      }

      const montantAttendu = parseFloat(transfert.montant?.toString() || "0");
      const montantRecu = data.montantRecu;
      const ecart = montantAttendu - montantRecu;

      // 4. Récupérer les coffres avec verrouillage
      const [coffreSourceResult, coffreDestResult] = await Promise.all([
        tx.execute(
          sql`SELECT * FROM coffres_forts WHERE id = ${transfert.coffreSourceId}`
        ),
        tx.execute(
          sql`SELECT * FROM coffres_forts WHERE id = ${transfert.coffreDestinationId} FOR UPDATE`
        ),
      ]);

      if (!coffreSourceResult.rows?.length || !coffreDestResult.rows?.length) {
        return { success: false, errorCode: "TIC_006", error: "Coffre introuvable" };
      }

      const coffreSource = coffreSourceResult.rows[0] as Record<string, unknown>;
      const coffreDest = coffreDestResult.rows[0] as Record<string, unknown>;

      // 5. Créer le mouvement financier (entrée coffre destination)
      const referenceDest = generateReference("TIC");
      const [mouvementDest] = await tx
        .insert(mouvementsFinanciers)
        .values({
          montant: montantRecu.toString(),
          sens: "DEBIT", // Entrée = Débit (augmentation)
          reference: referenceDest,
          sourceModule: "TRANSFERT",
          agenceId: coffreDest.owner_id as string | null,
          statut: "POSTED",
          dateOperation: new Date(),
          metadata: {
            transfertInterCoffreId: transfertId,
            type: "ENTREE_COFFRE_RECEPTION",
            coffreSourceId: transfert.coffreSourceId,
            coffreDestId: transfert.coffreDestinationId,
            ecart,
          },
        })
        .returning();

      // 6. Créditer le coffre destination (atomique)
      await tx
        .update(coffresForts)
        .set({
          solde: sql`${coffresForts.solde} + ${montantRecu}`,
          updatedAt: new Date(),
        })
        .where(eq(coffresForts.id, transfert.coffreDestinationId));

      // 7. Créer ou récupérer les comptes de liaison
      const compteLiaisonSource = await getOrCreateCompteLiaison(tx, {
        ownerType: coffreSource.owner_type as any,
        ownerId: coffreSource.owner_id as string | undefined,
        code: coffreSource.code as string,
        nom: coffreSource.nom as string,
      });
      const compteLiaisonDest = await getOrCreateCompteLiaison(tx, {
        ownerType: coffreDest.owner_type as any,
        ownerId: coffreDest.owner_id as string | undefined,
        code: coffreDest.code as string,
        nom: coffreDest.nom as string,
      });

      // 8. Créer la réconciliation
      const statutReconciliation = ecart === 0 ? "RECONCILED" : "DISCREPANCY_DETECTED";
      const [reconciliation] = await tx
        .insert(reconciliationsLiaison)
        .values({
          compteLiaisonSourceId: compteLiaisonSource?.id,
          compteLiaisonDestId: compteLiaisonDest?.id,
          transfertId,
          montant: montantRecu.toString(),
          dateOperation: transfert.dateComptable || new Date().toISOString().split("T")[0],
          statut: statutReconciliation,
          dateRapprochement: ecart === 0 ? new Date() : null,
          rapprochePar: ecart === 0 ? userId : null,
        })
        .returning();

      // 9. Gestion des écarts - Créer une tâche de régularisation si nécessaire
      let tacheId: string | undefined;
      if (ecart !== 0) {
        const priorite =
          Math.abs(ecart) > 100000
            ? Priorite.CRITICAL
            : Math.abs(ecart) > 50000
              ? Priorite.HIGH
              : Priorite.NORMAL;
        const [tache] = await tx
          .insert(tachesRegularisation)
          .values({
            transfertId,
            type: TypeTacheRegularisation.ECART_RECEPTION,
            description: `Écart de ${ecart.toLocaleString()} ${transfert.devise} sur transfert ${transfert.reference}. Attendu: ${montantAttendu.toLocaleString()}, Reçu: ${montantRecu.toLocaleString()}`,
            montantEcart: ecart.toString(),
            priorite,
            statut: StatutTacheRegularisation.OPEN,
          })
          .returning();
        tacheId = tache.id;
      }

      // 10. Mettre à jour le transfert avec condition stricte
      const now = new Date();
      const nouveauStatut = data.conforme ? "RECEIVED" : "RECEIVED_WITH_DISCREPANCY";

      const updateResult = await tx
        .update(transfertsInterCoffres)
        .set({
          statut: nouveauStatut,
          receivedBy: userId,
          receivedAt: now,
          heureReception: data.heureReception,
          montantRecu: montantRecu.toString(),
          conforme: data.conforme,
          commentaireReception: data.commentaire,
          ecartMontant: ecart !== 0 ? ecart.toString() : null,
          motifEcart: data.motifEcart,
          mouvementDestinationId: mouvementDest.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(transfertsInterCoffres.id, transfertId),
            eq(transfertsInterCoffres.statut, "IN_TRANSIT") // Double vérification
          )
        )
        .returning();

      // Si l'update n'a rien modifié, quelqu'un d'autre a changé le statut
      if (updateResult.length === 0) {
        throw new TransfertAlreadyProcessedError(
          "Le transfert a été modifié par un autre processus pendant le traitement",
          transfertId
        );
      }

      // 11. Log d'audit
      const action = data.conforme ? "RECEIVED" : "RECEIVED_WITH_DISCREPANCY";
      await tx.insert(transfertsInterCoffresAuditLogs).values({
        transfertId,
        action,
        statutAvant: "IN_TRANSIT",
        statutApres: nouveauStatut,
        details: {
          mouvementDestId: mouvementDest.id,
          montantAttendu,
          montantRecu,
          ecart,
          conforme: data.conforme,
          reconciliationId: reconciliation.id,
          tacheId,
        },
        userId,
        userRole,
        ipAddress,
        userAgent,
      });

      return {
        success: true,
        mouvementDestId: mouvementDest.id,
        reconciliationId: reconciliation.id,
        tacheId,
        ecart,
      };
    });
  } catch (error) {
    // Gérer les erreurs de verrouillage PostgreSQL
    if (error instanceof TransfertAlreadyProcessedError) {
      return {
        success: false,
        errorCode: error.code,
        error: error.message,
      };
    }
    // PostgreSQL error pour NOWAIT lock conflict
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "55P03") {
      // lock_not_available
      return {
        success: false,
        errorCode: "TIC_CONFLICT",
        error: "Ce transfert est en cours de traitement par un autre utilisateur. Veuillez réessayer.",
      };
    }
    throw error;
  }
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Récupère ou crée un compte de liaison pour un coffre
 */
async function getOrCreateCompteLiaison(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  coffre: {
    ownerType: "AGENCE" | "SIEGE";
    ownerId?: string;
    code: string;
    nom: string;
  }
) {
  // Chercher un compte existant
  const conditions =
    coffre.ownerType === "SIEGE"
      ? eq(comptesLiaison.entiteType, "SIEGE")
      : eq(comptesLiaison.entiteId, coffre.ownerId!);

  const [existing] = await tx.select().from(comptesLiaison).where(conditions);

  if (existing) return existing;

  // Créer un nouveau compte
  const code =
    coffre.ownerType === "SIEGE" ? "LIAISON-SIEGE" : `LIAISON-${coffre.code}`;

  const intitule =
    coffre.ownerType === "SIEGE"
      ? "Compte de liaison - Siège"
      : `Compte de liaison - ${coffre.nom}`;

  const numeroComptable = "581200";

  const [nouveau] = await tx
    .insert(comptesLiaison)
    .values({
      code,
      intitule,
      numeroComptable,
      entiteType: coffre.ownerType,
      entiteId: coffre.ownerId,
    })
    .returning();

  return nouveau;
}

/**
 * Met à jour le solde d'un coffre (utilitaire)
 */
export async function updateCoffreSolde(
  coffreId: string,
  montant: number,
  operation: "add" | "subtract"
) {
  const operator = operation === "add" ? sql`+` : sql`-`;

  await db
    .update(coffresForts)
    .set({
      solde: sql`${coffresForts.solde} ${operator} ${montant}`,
      updatedAt: new Date(),
    })
    .where(eq(coffresForts.id, coffreId));
}
