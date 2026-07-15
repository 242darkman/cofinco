import {
  deriveSensFromType
} from "@shared/config/transaction-labels";
import {
  compteAgencesHistorique,
  comptes,
  evenementsOutbox,
  operationsCaisse,
  transactionsCompte,
  userRoles,
  type Facture
} from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../db";
import {
  createFactureForDepot,
  createFactureForRetrait
} from "../../storage/finance";
import {
  executeWithLedger,
  updateCompteSolde,
  updateSessionSolde,
  type MouvementFinancier,
  type SensMouvement
} from "../ledger";

// Import standardized status constants
import type {
  MethodePaiementDz,
  TypeOperationCaisseDz,
  TypePaiementTerrainDz,
} from "@shared/enum/enums";
import {
  StatutCompte as StatutCompteConst,
  TypeCompte as TypeCompteEnum,
  type TypeCompteType
} from "@shared/enum/status-constants";
import { SystemRole } from "@shared/types/roles";
import { canDeposit, canWithdraw, validateSessionCaisse } from "./helpers";
import { CompteError, type DepotRetraitData, type TransfertAgenceData } from "./types";


// ============================================================================
// DEPOSIT / WITHDRAWAL OPERATIONS
/**
 * Intérêts et transfert de compte entre agences.
 * Extrait pour respecter la limite de 400 lignes (code déplacé verbatim).
 */
/**
 * Créditer des intérêts sur un compte (opération atomique via ledger)
 *
 * Crée un mouvement financier + écriture GL + transaction compte,
 * le tout dans une seule transaction DB.
 */
export async function crediterInterets(
  data: {
    compteId: string;
    montant: number;
    periode: string;
    tauxInteret: number;
    observations?: string;
  },
  userId?: string
): Promise<{ transaction: typeof transactionsCompte.$inferSelect; mouvement: MouvementFinancier }> {
  // 1. Get & validate compte
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) {
    throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
  }

  if (compte.statut === StatutCompteConst.CLOSED) {
    throw new CompteError("Impossible de créditer des intérêts sur un compte clôturé", "COMPTE_CLOSED");
  }
  if (compte.statut === StatutCompteConst.CLOSURE_PENDING) {
    throw new CompteError("Impossible de créditer des intérêts sur un compte en cours de clôture", "CLOSURE_PENDING");
  }

  if (data.montant <= 0) {
    throw new CompteError("Le montant des intérêts doit être supérieur à 0", "INVALID_AMOUNT");
  }

  // 2. Round to 2 decimals (floor to avoid over-crediting)
  const montantAcrediter = Math.floor(data.montant * 100) / 100;

  // 3. Execute atomically via ledger
  const observations = data.observations ||
    `Intérêts créditeurs - ${data.periode} (${data.tauxInteret}%)`;

  const { result, mouvement } = await executeWithLedger(
    "EPARGNE",
    {
      montant: montantAcrediter.toString(),
      sens: "CREDIT" as SensMouvement,
      clientId: compte.clientId,
      compteId: data.compteId,
      agenceId: compte.agenceId || undefined,
      methodePaiement: "TRANSFER",
      typePaiement: "INTEREST_PAYMENT",
      metadata: {
        observations,
        periode: data.periode,
        tauxInteret: data.tauxInteret,
        soldeAvant: compte.soldeCourant,
      },
    },
    async (tx, mvt) => {
      // Atomic balance update with pessimistic lock
      const nouveauSolde = await updateCompteSolde(tx, data.compteId, montantAcrediter);

      // Create transaction record linked to mouvement
      const [transaction] = await tx
        .insert(transactionsCompte)
        .values({
          compteId: data.compteId,
          mouvementId: mvt.id,
          typePaiement: "INTEREST_PAYMENT",
          sens: "CREDIT", // Interest is always incoming
          montant: montantAcrediter.toString(),
          soldeApres: nouveauSolde,
          methodePaiement: "TRANSFER",
          observations,
          createdBy: userId || null,
        } as any)
        .returning();

      return {
        result: transaction,
        additionalEventData: {
          nouveauSoldeCompte: nouveauSolde,
        },
      };
    },
    userId
  );

  return { transaction: result, mouvement };
}

// ============================================================================
// INTER-AGENCY TRANSFER
// ============================================================================

/**
 * Transfère un compte vers une autre agence
 * Historisé via compte_agences_historique
 */
export async function transfererCompteAgence(
  data: TransfertAgenceData,
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    // 1. Get compte
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    if (compte.agenceId === data.nouvelleAgenceId) {
      throw new CompteError("Le compte est déjà dans cette agence", "SAME_AGENCY");
    }

    const ancienneAgenceId = compte.agenceId;

    // 2. Close current agency history record
    await tx
      .update(compteAgencesHistorique)
      .set({ dateFin: new Date() })
      .where(
        and(eq(compteAgencesHistorique.compteId, data.compteId), isNull(compteAgencesHistorique.dateFin))
      );

    // 3. Create new agency history record
    const reference = `TR-${Date.now().toString(36).toUpperCase()}`;
    await tx.insert(compteAgencesHistorique).values({
      compteId: data.compteId,
      agenceId: data.nouvelleAgenceId,
      dateDebut: new Date(),
      motif: data.motif || "Transfert inter-agence",
      reference,
      transferePar: userId,
    });

    // 4. Update compte
    const [updated] = await tx
      .update(comptes)
      .set({
        agenceId: data.nouvelleAgenceId,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, data.compteId))
      .returning();

    // 5. Create outbox events
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "compte",
      aggregateId: data.compteId,
      payload: {
        compteId: data.compteId,
        action: "TRANSFERT_AGENCE",
        ancienneAgenceId,
        nouvelleAgenceId: data.nouvelleAgenceId,
        reference,
        motif: data.motif,
        transfereAt: new Date().toISOString(),
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_TRANSFERE",
        compteId: data.compteId,
        typeCompte: compte.typeCompte,
        nouvelleAgenceId: data.nouvelleAgenceId,
      },
    });

    return updated;
  });
}
