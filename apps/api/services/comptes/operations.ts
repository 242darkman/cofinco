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
 * Effectue un dépôt sur un compte
 */
export async function deposerSurCompte(
  data: DepotRetraitData,
  userId?: string
): Promise<{ transaction: typeof transactionsCompte.$inferSelect; mouvement: MouvementFinancier; facture: Facture }> {
  // 1. Get compte
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) {
    throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
  }

  // 2. Validate deposit is allowed
  const depositCheck = canDeposit(compte);
  if (!depositCheck.allowed) {
    throw new CompteError(depositCheck.reason!, "DEPOSIT_NOT_ALLOWED");
  }

  // 3. Validate session if provided or required
  if (data.methodePaiement === "CASH" && !data.sessionCaisseId) {
    throw new CompteError(
      "Une session de caisse active est requise pour les dépôts en espèces",
      "SESSION_REQUIRED"
    );
  }

  if (data.sessionCaisseId) {
    await validateSessionCaisse(data.sessionCaisseId);
  }

  // 4. Determine type paiement based on account type (EN values)
  const typePaiementMap: Record<TypeCompteType, string> = {
    [TypeCompteEnum.SAVINGS]: "DEPOSIT_SAVINGS",
    [TypeCompteEnum.CURRENT]: "DEPOSIT_CURRENT",
    [TypeCompteEnum.BLOCKED]: "DEPOSIT_BLOCKED",
  };
  const typePaiement = typePaiementMap[compte.typeCompte as TypeCompteType];

  // 5. Execute with ledger
  return executeWithLedger(
    "EPARGNE",
    {
      montant: data.montant.toString(),
      sens: "CREDIT",
      clientId: compte.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionCaisseId,
      agenceId: compte.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: typePaiement as TypePaiementTerrainDz,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      return processCompteDepot(tx, mouvement, {
        compteId: data.compteId,
        montant: data.montant,
        sessionCaisseId: data.sessionCaisseId,
        observations: data.observations,
        typePaiement: typePaiement as TypePaiementTerrainDz,
        methodePaiement: data.methodePaiement,
        userId
      });
    },
    userId
  ).then(async ({ result, mouvement }) => {
    // Generate receipt for the deposit
    const facture = await createFactureForDepot({
      compteId: data.compteId,
      numeroCompte: compte.numeroCompte,
      clientId: compte.clientId,
      montant: data.montant.toString(),
      typeCompte: compte.typeCompte,
      agentId: userId,
      sessionCaisseId: data.sessionCaisseId,
      transactionId: result.id,
    });
    
    return { transaction: result, mouvement, facture };
  });
}

/**
 * Core logic for account deposit within a transaction
 */
export async function processCompteDepot(
  tx: PgTransaction<any, any, any>,
  mouvement: MouvementFinancier,
  params: {
    compteId: string;
    montant: number;
    sessionCaisseId?: string;
    observations?: string;
    typePaiement: string;
    methodePaiement: string;
    userId?: string;
  }
) {
  const { compteId, montant, sessionCaisseId, observations, typePaiement, methodePaiement, userId } = params;

  // Update compte solde
  const nouveauSolde = await updateCompteSolde(tx, compteId, montant);

  // Update session caisse if applicable (cash comes in)
  let nouveauSoldeSession: string | undefined;
  if (sessionCaisseId) {
    nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, montant);
  }

  // Create transaction record with sens derived from typePaiement
  const [transaction] = await tx
    .insert(transactionsCompte)
    .values({
      compteId: compteId,
      mouvementId: mouvement.id,
      typePaiement: typePaiement as TypePaiementTerrainDz,
      sens: deriveSensFromType(typePaiement),
      montant: montant.toString(),
      soldeApres: nouveauSolde,
      methodePaiement: methodePaiement as MethodePaiementDz,
      observations: observations,
      createdBy: userId,
    } as any)
    .returning();

  // IMPORTANT: Create operation caisse for cash transactions
  if (sessionCaisseId && methodePaiement === "CASH") {
    const { validateUserId } = await import("../ledger");
    const validatedUserId = await validateUserId(tx, userId);

    await tx.insert(operationsCaisse).values({
      sessionId: sessionCaisseId,
      mouvementId: mouvement.id,
      typeOperation: typePaiement as TypeOperationCaisseDz,
      montant: montant.toString(),
      methodePaiement: "CASH",
      reference: `EPG-${mouvement.reference}`,
      description: observations || `Dépôt compte ${typePaiement.replace('DEPOSIT_', '')}`,
      createdBy: validatedUserId,
    });
  }

  return {
    result: transaction,
    additionalEventData: {
      nouveauSoldeCompte: nouveauSolde,
      nouveauSoldeSession,
    },
  };
}

/**
 * Effectue un retrait sur un compte
 */
export async function retirerDuCompte(
  data: DepotRetraitData,
  userId?: string
): Promise<{ transaction: typeof transactionsCompte.$inferSelect; mouvement: MouvementFinancier; facture: Facture }> {
  // 1. Get compte
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) {
    throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
  }

  // 2. Validate withdrawal is allowed (CRITICAL for Bloqué accounts)
  const withdrawCheck = canWithdraw(compte);
  if (!withdrawCheck.allowed) {
    // Vérifier si user is Admin to override (Architecture V3: rôle via userRoles)
    let isAdmin = false;
    if (userId) {
       // Récupérer le rôle principal depuis userRoles
       const [primaryRole] = await db.select({ role: userRoles.role })
         .from(userRoles)
         .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)))
         .limit(1);

       const effectiveRole = primaryRole?.role;
       if (effectiveRole === SystemRole.ADMIN) {
           isAdmin = true;
       }
    }

    if (!isAdmin) {
        throw new CompteError(withdrawCheck.reason!, "WITHDRAWAL_NOT_ALLOWED");
    }
    // If admin, we proceed but maybe add a note in observations?
    // For now we just allow it.
  }

  // 3. Check sufficient balance
  const soldeCourant = parseFloat(compte.soldeCourant || "0");
  if (soldeCourant < data.montant) {
    throw new CompteError(
      `Solde insuffisant. Disponible: ${soldeCourant.toFixed(2)}, Demandé: ${data.montant.toFixed(2)}`,
      "INSUFFICIENT_BALANCE"
    );
  }

  // 4. Validate session if provided or required
  if (data.methodePaiement === "CASH" && !data.sessionCaisseId) {
    throw new CompteError(
      "Une session de caisse active est requise pour les retraits en espèces",
      "SESSION_REQUIRED"
    );
  }

  if (data.sessionCaisseId) {
    await validateSessionCaisse(data.sessionCaisseId);
  }

  // 5. Determine type paiement based on account type (EN values)
  const typePaiementMap: Record<TypeCompteType, string> = {
    [TypeCompteEnum.SAVINGS]: "WITHDRAWAL_SAVINGS",
    [TypeCompteEnum.CURRENT]: "WITHDRAWAL_CURRENT",
    [TypeCompteEnum.BLOCKED]: "WITHDRAWAL_BLOCKED",
  };
  const typePaiement = typePaiementMap[compte.typeCompte as TypeCompteType];

  // 6. Execute with ledger
  return executeWithLedger(
    "EPARGNE",
    {
      montant: data.montant.toString(),
      sens: "DEBIT",
      clientId: compte.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionCaisseId,
      agenceId: compte.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: typePaiement as TypePaiementTerrainDz,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      return processCompteRetrait(tx, mouvement, {
        compteId: data.compteId,
        montant: data.montant,
        sessionCaisseId: data.sessionCaisseId,
        observations: data.observations,
        typePaiement: typePaiement as TypePaiementTerrainDz,
        methodePaiement: data.methodePaiement,
        userId
      });
    },
    userId
  ).then(async ({ result, mouvement }) => {
    // Generate receipt for the withdrawal
    const facture = await createFactureForRetrait({
      compteId: data.compteId,
      numeroCompte: compte.numeroCompte,
      clientId: compte.clientId,
      montant: data.montant.toString(),
      typeCompte: compte.typeCompte,
      agentId: userId,
      sessionCaisseId: data.sessionCaisseId,
    });
    
    return { transaction: result, mouvement, facture };
  });
}

/**
 * Core logic for account withdrawal within a transaction
 */
export async function processCompteRetrait(
  tx: PgTransaction<any, any, any>,
  mouvement: MouvementFinancier,
  params: {
    compteId: string;
    montant: number;
    sessionCaisseId?: string;
    observations?: string;
    typePaiement: string;
    methodePaiement: string;
    userId?: string;
  }
) {
  const { compteId, montant, sessionCaisseId, observations, typePaiement, methodePaiement, userId } = params;

  // Update compte solde (negative delta for withdrawal)
  const nouveauSolde = await updateCompteSolde(tx, compteId, -montant);

  // Update session caisse if applicable (cash goes out)
  let nouveauSoldeSession: string | undefined;
  if (sessionCaisseId) {
    nouveauSoldeSession = await updateSessionSolde(tx, sessionCaisseId, -montant);
  }

  // Create transaction record with sens derived from typePaiement
  const [transaction] = await tx
    .insert(transactionsCompte)
    .values({
      compteId: compteId,
      mouvementId: mouvement.id,
      typePaiement: typePaiement as TypePaiementTerrainDz,
      sens: deriveSensFromType(typePaiement),
      montant: montant.toString(),
      soldeApres: nouveauSolde,
      methodePaiement: methodePaiement as MethodePaiementDz,
      observations: observations,
      createdBy: userId,
    })
    .returning();

  // IMPORTANT: Create operation caisse for cash transactions
  if (sessionCaisseId && methodePaiement === "CASH") {
    const { validateUserId } = await import("../ledger");
    const validatedUserId = await validateUserId(tx, userId);

    await tx.insert(operationsCaisse).values({
      sessionId: sessionCaisseId,
      mouvementId: mouvement.id,
      typeOperation: typePaiement as TypeOperationCaisseDz,
      montant: montant.toString(),
      methodePaiement: "CASH",
      reference: `EPG-${mouvement.reference}`,
      description: observations || `Retrait compte ${typePaiement.replace('WITHDRAWAL_', '')}`,
      createdBy: validatedUserId,
    });
  }

  return {
    result: transaction,
    additionalEventData: {
      nouveauSoldeCompte: nouveauSolde,
      nouveauSoldeSession,
    },
  };
}
