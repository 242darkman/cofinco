import {
  comptes,
  credits,
  evenementsOutbox,
  transactionsCompte
} from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";

// Import standardized status constants
import {
  StatutCompte as StatutCompteConst,
  StatutCredit as StatutCreditConst
} from "@shared/enum/status-constants";
import { CompteError, MotifBlocage, StatutCompte, VALID_TRANSITIONS, type DeblocageData } from "./types";


// ============================================================================
// BLOCKING / UNBLOCKING
// ============================================================================

/**
 * Bloque un compte
 */
export async function bloquerCompte(
  compteId: string,
  motif: MotifBlocage,
  reference?: string,
  dateFin?: Date,
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    if (compte.blocageActif) {
      throw new CompteError("Compte déjà bloqué", "ALREADY_BLOCKED");
    }

    // Update compte
    const [updated] = await tx
      .update(comptes)
      .set({
        blocageActif: true,
        blocageMotif: motif,
        blocageReference: reference,
        blocageDebut: new Date(),
        blocageFin: dateFin,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, compteId))
      .returning();

    // Create outbox event
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE", // Reuse for status change
      aggregateType: "compte",
      aggregateId: compteId,
      payload: {
        compteId,
        action: "BLOCAGE",
        motif,
        reference,
        blocageDebut: new Date().toISOString(),
        blocageFin: dateFin?.toISOString(),
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_BLOQUE",
        compteId,
        typeCompte: compte.typeCompte,
        motif,
      },
    });

    return updated;
  });
}

/**
 * Débloque un compte (CRITIQUE: tracé et événement temps réel)
 */
export async function debloquerCompte(
  data: DeblocageData,
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    if (!compte.blocageActif) {
      throw new CompteError("Compte non bloqué", "NOT_BLOCKED");
    }

    const ancienMotif = compte.blocageMotif;

    // Update compte
    const [updated] = await tx
      .update(comptes)
      .set({
        blocageActif: false,
        blocageMotif: null,
        blocageReference: null,
        blocageDebut: null,
        blocageFin: null,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, data.compteId))
      .returning();

    // Create outbox event for compte channel
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "compte",
      aggregateId: data.compteId,
      payload: {
        compteId: data.compteId,
        action: "DEBLOCAGE",
        ancienMotif,
        motifDeblocage: data.motif,
        debloqueAt: new Date().toISOString(),
        debloquePar: userId,
      },
    });

    // Notify client channel
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_DEBLOQUE",
        compteId: data.compteId,
        typeCompte: compte.typeCompte,
        nouveauSolde: compte.soldeCourant,
      },
    });

    return updated;
  });
}

// suspendCompte / unsuspendCompte vivent dans status-suspension.ts

// ============================================================================
// STATUS MANAGEMENT (STATE MACHINE)
// ============================================================================

export async function changeAccountStatus(
  compteId: string, 
  nouveauStatut: StatutCompte, 
  motif: string, 
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    const ancienStatut = compte.statut as StatutCompte;
    
    // Idempotency check
    if (ancienStatut === nouveauStatut) {
      return compte;
    }

    // Validate Transition
    const allowedTransitions = VALID_TRANSITIONS[ancienStatut];
    if (!allowedTransitions || !allowedTransitions.includes(nouveauStatut)) {
      throw new CompteError(
        `Transition de statut non autorisée: ${ancienStatut} -> ${nouveauStatut}`,
        "INVALID_STATE_TRANSITION"
      );
    }

    // Update
    const [updated] = await tx
      .update(comptes)
      .set({
        statut: nouveauStatut,
        updatedAt: new Date(),
        // If closing, set deletedAt for logical deletion if needed, or just keep as Clôturé
        // Schema says: uqClientTypeActif handles deleted_at IS NULL. 
        // If we want to allow re-creation of same type, we might need to soft-delete OR keep it Clôturé.
        // Current logic in clientHasCompteOfType checks for Clôturé status, so we don't strictly need soft delete yet.
      })
      .where(eq(comptes.id, compteId))
      .returning();

    // Event Log
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: compteId,
      payload: {
        compteId,
        ancienStatut,
        nouveauStatut,
        motif,
        changedBy: userId,
        timestamp: new Date().toISOString()
      },
    });
    
    return updated;
  });
}

export async function cloturerCompte(
  compteId: string,
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    // 1. Get compte
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    if (compte.statut === StatutCompteConst.CLOSED) {
      throw new CompteError("Le compte est déjà clôturé", "ALREADY_CLOSED");
    }

    // 2. Validate Zero Balance
    // Using loose comparison for string "0.00" or number 0
    if (parseFloat(compte.soldeCourant) !== 0) {
      throw new CompteError(
        "Le solde doit être à zéro pour clôturer le compte. Veuillez effectuer un retrait ou un dépôt de régularisation.",
        "BALANCE_NOT_ZERO"
      );
    }

    // 3. Validate No Pending Transactions
    const pendingTransactions = await tx
      .select()
      .from(transactionsCompte)
      .where(
        and(
          eq(transactionsCompte.compteId, compteId),
          eq(transactionsCompte.statut, "PENDING")
        )
      )
      .limit(1);

    if (pendingTransactions.length > 0) {
      throw new CompteError(
        "Impossible de clôturer : des transactions sont en attente.",
        "PENDING_TRANSACTIONS"
      );
    }

    // 4. Validate No Active Debts (Credits)
    // Check for credits linked to this client that are Active or Late
    // Ideally we should check if *this specific account* is linked as guarantee, but for now checking client's global state or linked credits
    // The prompt says "Dettes liées : Vérifier qu'aucun crédit actif ... n'est rattaché à ce compte"
    // Usually credits are linked to client, but maybe re-payments come from this account.
    // Let's check if client has active credits first.
    const activeCredits = await tx
      .select()
      .from(credits)
      .where(
        and(
          eq(credits.clientId, compte.clientId),
          sql`${credits.statut} IN ('${sql.raw(StatutCreditConst.ACTIVE)}', '${sql.raw(StatutCreditConst.LATE)}')`
        )
      )
      .limit(1);

    if (activeCredits.length > 0) {
      throw new CompteError(
        "Impossible de clôturer : le client a des crédits en cours.",
        "ACTIVE_CREDITS"
      );
    }

    // 5. Close Account with standardized EN status
    const [closedCompte] = await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, compteId))
      .returning();

    // 6. Audit / Outbox
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE", // Generic status change event
      aggregateType: "compte",
      aggregateId: compteId,
      payload: {
        compteId,
        action: "CLOTURE",
        closedAt: new Date().toISOString(),
        closedBy: userId,
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_CLOTURE",
        compteId,
        typeCompte: compte.typeCompte,
      },
    });

    return closedCompte;
  });
}

