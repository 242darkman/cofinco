import { db } from "../../db";
import { sql } from "drizzle-orm";

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

export interface DispatchResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementTransitId?: string;
}

export interface DepositResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementDepotId?: string;
  ecart?: number;
}

export async function selectEvacuationForUpdate(
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

export async function checkMouvementAlreadyExists(
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
