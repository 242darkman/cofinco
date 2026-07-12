import { db } from "../../db";
import { sql, eq } from "drizzle-orm";
import { comptesLiaison, coffresForts, transfertsInterCoffres } from "@shared/schema";

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

export interface DispatchResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementSourceId?: string;
}

export interface ReceiveResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementDestId?: string;
  reconciliationId?: string;
  tacheId?: string;
  ecart?: number;
}

/**
 * Récupère un transfert avec verrouillage en écriture (FOR UPDATE).
 * Bloque les autres transactions jusqu'à la fin de la transaction courante.
 * Utilise NOWAIT pour échouer immédiatement si la ligne est verrouillée.
 */
export async function selectTransfertForUpdate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  transfertId: string
): Promise<typeof transfertsInterCoffres.$inferSelect | null> {
  const result = await tx.execute(
    sql`SELECT * FROM transferts_inter_coffres WHERE id = ${transfertId} FOR UPDATE NOWAIT`
  );

  if (!result.rows || result.rows.length === 0) {
    return null;
  }

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
export async function checkMouvementAlreadyExists(
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

/**
 * Récupère ou crée un compte de liaison pour un coffre
 */
export async function getOrCreateCompteLiaison(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  coffre: {
    ownerType: "AGENCE" | "SIEGE";
    ownerId?: string;
    code: string;
    nom: string;
  }
) {
  const conditions =
    coffre.ownerType === "SIEGE"
      ? eq(comptesLiaison.entiteType, "SIEGE")
      : eq(comptesLiaison.entiteId, coffre.ownerId!);

  const [existing] = await tx.select().from(comptesLiaison).where(conditions);

  if (existing) return existing;

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
