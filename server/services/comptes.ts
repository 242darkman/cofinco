/**
 * Service Comptes Microfinance
 *
 * Règles métier:
 * - Un client ne peut avoir qu'un seul compte par type (Épargne/Courant/Bloqué)
 * - Compte Épargne: dépôts + retraits autorisés (si statut OK)
 * - Compte Courant: dépôts + retraits fréquents
 * - Compte Bloqué: dépôts autorisés, retraits strictement interdits tant que bloqué
 * - Déblocage explicite, tracé, avec événement temps réel
 * - Toute opération crée un mouvement_financier (ledger, source de vérité)
 * - Transfert inter-agence historisé via compte_agences_historique
 */

import { randomInt, randomBytes } from "crypto";
import { db } from "../db";
import {
  comptes,
  transactionsCompte,
  compteAgencesHistorique,
  mouvementsFinanciers,
  operationsCaisse, // Added
  evenementsOutbox,
  sessionsCaisse,
  clients,
  users,
  userRoles,
  credits,
  type Compte,
  type TransactionCompte,
} from "@shared/schema";
import { eq, and, isNull, desc, sql, gte, lte, lt, asc } from "drizzle-orm";
import { subMonths, subYears, startOfDay, endOfDay, eachDayOfInterval, format, isSameDay } from "date-fns";
import {
  executeWithLedger,
  updateCompteSolde,
  updateSessionSolde,
  createOutboxEvent,
  generateReference,
  type SensMouvement,
  type MouvementFinancier,
} from "./ledger";
import { postGlForMouvement } from "./accounting-posting-service";
import {
  deriveSensFromType,
  formatTransactionDescription,
} from "@shared/config/transaction-labels";
import {
  createFactureForDepot,
  createFactureForRetrait,
  createFactureForDepotInitial,
} from "../storage/finance";
import type { Facture } from "@shared/schema";
import type { PgTransaction } from "drizzle-orm/pg-core";

// Import standardized status constants
import {
  StatutCompte as StatutCompteConst,
  StatutCredit as StatutCreditConst,
  TypeCompte as TypeCompteEnum,
  MotifBlocage as MotifBlocageEnum,
  SuspensionReason as SuspensionReasonEnum,
  type StatutCompteType,
  type TypeCompteType,
  type MotifBlocageType,
  type SuspensionReasonType,
  getTypePaiementForCompte,
} from "@shared/enum/status-constants";

// Types - Re-export from status-constants for consistency
export type TypeCompte = TypeCompteType;
export type StatutCompte = StatutCompteType;
export type MotifBlocage = MotifBlocageType;

// State Machine Transitions (using EN constants)
// ACTIVE -> SUSPENDED (suspension) | CLOSURE_PENDING (clôture)
// SUSPENDED -> ACTIVE (levée) | CLOSURE_PENDING (clôture)
// CLOSURE_PENDING -> ACTIVE (annulation) | CLOSED (finalisation)
// PENDING_ACTIVATION -> ACTIVE (premier versement) | CLOSED (rejet)

export const VALID_TRANSITIONS: Record<StatutCompte, StatutCompte[]> = {
  [StatutCompteConst.ACTIVE]: [StatutCompteConst.SUSPENDED, StatutCompteConst.CLOSURE_PENDING],
  [StatutCompteConst.SUSPENDED]: [StatutCompteConst.ACTIVE, StatutCompteConst.CLOSURE_PENDING],
  [StatutCompteConst.CLOSURE_PENDING]: [StatutCompteConst.ACTIVE, StatutCompteConst.CLOSED],
  [StatutCompteConst.CLOSED]: [], // Terminal state
  [StatutCompteConst.PENDING_ACTIVATION]: [StatutCompteConst.ACTIVE, StatutCompteConst.CLOSED],
  [StatutCompteConst.CANCELLED]: [], // Terminal state
};

export interface CreateCompteData {
  clientId: string;
  typeCompte: TypeCompte;
  agenceId: string;
  produitId?: string;
  soldeInitial?: number;
  blocageActif?: boolean;
  blocageMotif?: MotifBlocage;
  blocageReference?: string;
}

export interface DepotRetraitData {
  compteId: string;
  montant: number;
  methodePaiement: string;
  sessionCaisseId?: string;
  observations?: string;
  idempotencyKey?: string;
}

export interface TransfertAgenceData {
  compteId: string;
  nouvelleAgenceId: string;
  motif?: string;
}

export interface DeblocageData {
  compteId: string;
  motif?: string;
}

// Errors
export class CompteError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "CompteError";
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Vérifie si un client a déjà un compte du type demandé
 */
export async function clientHasCompteOfType(
  clientId: string,
  typeCompte: TypeCompte
): Promise<boolean> {
  // Fetch non-deleted accounts for this client
  const existingAccounts = await db
    .select()
    .from(comptes)
    .where(
      and(
        eq(comptes.clientId, clientId),
        isNull(comptes.deletedAt)
      )
    );

  // Normalize and check in JS to be absolutely sure about casing/accents
  const normalizedTarget = typeCompte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  return existingAccounts.some(acc => {
      const accType = (acc.typeCompte || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isSameType = accType === normalizedTarget;
      
      // Check status: Only 'Clôturé' or 'Fermé' are considered free
      // 'Actif', 'Suspendu', 'EN_ATTENTE_PAIEMENT' all count as existing account
      const status = (acc.statut || '').toLowerCase();
      const isClosed = ['clôturé', 'fermé', 'cloture', 'ferme'].includes(status);
      
      return isSameType && !isClosed;
  });
}

/**
 * Vérifie si le compte permet les retraits
 */
export function canWithdraw(compte: typeof comptes.$inferSelect): {
  allowed: boolean;
  reason?: string;
} {
  // Statut check
  if (compte.statut === StatutCompteConst.SUSPENDED) {
    return { allowed: false, reason: "Compte suspendu" };
  }
  if (compte.statut === StatutCompteConst.CLOSED) {
    return { allowed: false, reason: "Compte clôturé" };
  }
  if (compte.statut === StatutCompteConst.CLOSURE_PENDING) {
    return { allowed: false, reason: "Compte en cours de clôture" };
  }

  // Blocage check for Bloqué accounts
  // Admin role check should be done at the call site (retirerDuCompte),
  // but here we just check the account state.
  if (compte.typeCompte === TypeCompteEnum.BLOCKED && compte.blocageActif) {
    return {
      allowed: false,
      reason: `Compte bloqué: ${compte.blocageMotif || "Raison non spécifiée"}`,
    };
  }

  // Check blocage dates
  if (compte.blocageActif && compte.blocageFin) {
    const now = new Date();
    if (now < compte.blocageFin) {
      return {
        allowed: false,
        reason: `Compte bloqué jusqu'au ${compte.blocageFin.toLocaleDateString("fr-FR")}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Vérifie si le compte permet les dépôts
 */
export function canDeposit(compte: typeof comptes.$inferSelect): {
  allowed: boolean;
  reason?: string;
} {
  if (compte.statut === StatutCompteConst.CLOSED) {
    return { allowed: false, reason: "Compte clôturé" };
  }
  if (compte.statut === StatutCompteConst.CLOSURE_PENDING) {
    return { allowed: false, reason: "Compte en cours de clôture" };
  }
  // Les dépôts sont toujours autorisés sur les comptes bloqués
  return { allowed: true };
}

/**
 * Vérifie la session caisse si fournie
 */
async function validateSessionCaisse(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(sessionsCaisse)
    .where(eq(sessionsCaisse.id, sessionId));

  if (!session) {
    throw new CompteError("Session caisse non trouvée", "SESSION_NOT_FOUND");
  }
  if (session.closedAt) {
    throw new CompteError("Session caisse fermée", "SESSION_CLOSED");
  }
}

// ============================================================================
// ACCOUNT CREATION
// ============================================================================

/**
 * Génère un numéro de compte unique
 */
function generateNumeroCompte(typeCompte: TypeCompte): string {
  const prefixes: Record<TypeCompte, string> = {
    [TypeCompteEnum.SAVINGS]: "CE",
    [TypeCompteEnum.CURRENT]: "CC",
    [TypeCompteEnum.BLOCKED]: "CB",
  };
  const timestamp = Date.now().toString().slice(-8);
  const random = randomInt(0, 10000)
    .toString()
    .padStart(4, "0");
  return `${prefixes[typeCompte]}-${timestamp}-${random}`;
}

/**
 * Crée un nouveau compte avec validation des règles métier
 */
export async function createCompte(
  data: CreateCompteData,
  userId?: string
): Promise<typeof comptes.$inferSelect> {
  // 1. Vérifier que le client n'a pas déjà ce type de compte
  const hasExisting = await clientHasCompteOfType(data.clientId, data.typeCompte);
  if (hasExisting) {
    throw new CompteError(
      `Le client possède déjà un compte ${data.typeCompte}`,
      "DUPLICATE_ACCOUNT_TYPE"
    );
  }

  // 2. Vérifier que le client existe
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, data.clientId));
  if (!client) {
    throw new CompteError("Client non trouvé", "CLIENT_NOT_FOUND");
  }

  // 3. Créer le compte dans une transaction
  return await db.transaction(async (tx) => {
    const numeroCompte = generateNumeroCompte(data.typeCompte);

    // Create account with standardized EN status
    const [compte] = await tx
      .insert(comptes)
      .values({
        clientId: data.clientId,
        agenceId: data.agenceId,
        produitId: data.produitId,
        numeroCompte,
        typeCompte: data.typeCompte,
        statut: StatutCompteConst.ACTIVE,
        soldeCourant: (data.soldeInitial || 0).toString(),
        blocageActif: data.blocageActif || data.typeCompte === TypeCompteEnum.BLOCKED,
        blocageMotif: data.blocageMotif,
        blocageReference: data.blocageReference,
        blocageDebut: data.blocageActif ? new Date() : null,
        createdBy: userId,
      })
      .returning();

    // Create initial agency history record
    await tx.insert(compteAgencesHistorique).values({
      compteId: compte.id,
      agenceId: data.agenceId,
      dateDebut: new Date(),
      motif: "Création du compte",
      transferePar: userId,
    });

    // If there's an initial deposit, create mouvement
    if (data.soldeInitial && data.soldeInitial > 0) {
      const initialDepositTypePaiement = getTypePaiementForCompte(data.typeCompte, true);

      // Create mouvement
      const reference = `EPG-INIT-${Date.now()}-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
      const [mouvement] = await tx
        .insert(mouvementsFinanciers)
        .values({
          reference,
          sourceModule: "EPARGNE",
          sens: "CREDIT",
          montant: data.soldeInitial.toString(),
          dateOperation: new Date(),
          clientId: data.clientId,
          compteId: compte.id,
          agenceId: data.agenceId,
          methodePaiement: "CASH",
          typePaiement: initialDepositTypePaiement,
          createdBy: userId,
        })
        .returning();

      // Create transaction record with derived sens
      await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        mouvementId: mouvement.id,
        typePaiement: initialDepositTypePaiement,
        sens: deriveSensFromType(initialDepositTypePaiement),
        montant: data.soldeInitial.toString(),
        soldeApres: data.soldeInitial.toString(),
        methodePaiement: "CASH",
        observations: "Dépôt initial à la création",
        createdBy: userId,
      });

      // Create outbox events
      await tx.insert(evenementsOutbox).values({
        type: "MOUVEMENT_CREE",
        aggregateType: "compte",
        aggregateId: compte.id,
        payload: {
          mouvementId: mouvement.id,
          compteId: compte.id,
          montant: data.soldeInitial,
          type: "INITIAL_DEPOSIT",
        },
      });

      await tx.insert(evenementsOutbox).values({
        type: "SOLDE_COMPTE_CHANGE",
        aggregateType: "compte",
        aggregateId: compte.id,
        payload: {
          compteId: compte.id,
          nouveauSolde: data.soldeInitial.toString(),
          ancienSolde: "0",
        },
      });

      // Notify client channel
      await tx.insert(evenementsOutbox).values({
        type: "MOUVEMENT_CREE",
        aggregateType: "client",
        aggregateId: data.clientId,
        payload: {
          type: "COMPTE_CREE",
          compteId: compte.id,
          typeCompte: data.typeCompte,
          numeroCompte,
        },
      });
    }

    return compte;
  });
}

// ============================================================================
// DEPOSIT / WITHDRAWAL OPERATIONS
// ============================================================================

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
      typePaiement: typePaiement as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      return processCompteDepot(tx, mouvement, {
        compteId: data.compteId,
        montant: data.montant,
        sessionCaisseId: data.sessionCaisseId,
        observations: data.observations,
        typePaiement: typePaiement as any,
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
      typePaiement: typePaiement as any,
      sens: deriveSensFromType(typePaiement),
      montant: montant.toString(),
      soldeApres: nouveauSolde,
      methodePaiement: methodePaiement as any,
      observations: observations,
      createdBy: userId,
    } as any)
    .returning();

  // IMPORTANT: Create operation caisse for cash transactions
  if (sessionCaisseId && methodePaiement === "CASH") {
    const { validateUserId } = await import("./ledger");
    const validatedUserId = await validateUserId(tx, userId);

    await tx.insert(operationsCaisse).values({
      sessionId: sessionCaisseId,
      mouvementId: mouvement.id,
      typeOperation: typePaiement as any,
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
    // Check if user is Admin to override (Architecture V3: rôle via userRoles)
    let isAdmin = false;
    if (userId) {
       const { isAdminRole, SystemRole } = await import("@shared/types/roles");
       // Récupérer le rôle principal depuis userRoles
       const [primaryRole] = await db.select({ role: userRoles.role })
         .from(userRoles)
         .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)))
         .limit(1);

       const effectiveRole = primaryRole?.role;
       if (effectiveRole && isAdminRole(effectiveRole as string)) {
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
      typePaiement: typePaiement as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      return processCompteRetrait(tx, mouvement, {
        compteId: data.compteId,
        montant: data.montant,
        sessionCaisseId: data.sessionCaisseId,
        observations: data.observations,
        typePaiement: typePaiement as any,
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
      typePaiement: typePaiement as any,
      sens: deriveSensFromType(typePaiement),
      montant: montant.toString(),
      soldeApres: nouveauSolde,
      methodePaiement: methodePaiement as any,
      observations: observations,
      createdBy: userId,
    })
    .returning();

  // IMPORTANT: Create operation caisse for cash transactions
  if (sessionCaisseId && methodePaiement === "CASH") {
    const { validateUserId } = await import("./ledger");
    const validatedUserId = await validateUserId(tx, userId);

    await tx.insert(operationsCaisse).values({
      sessionId: sessionCaisseId,
      mouvementId: mouvement.id,
      typeOperation: typePaiement as any,
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

// ============================================================================
// SUSPENSION / UNSUSPENSION (Account Lifecycle)
// ============================================================================

export interface SuspendCompteData {
  compteId: string;
  reasonCode: SuspensionReasonType;
  reasonText?: string;
  autoLift?: boolean;
  endDate?: Date;
  reviewRequired?: boolean;
}

/**
 * Suspend un compte (change statut à SUSPENDED + métadonnées enrichies)
 * Distinct du blocage (blocageActif) qui est un hold financier
 */
export async function suspendCompte(
  data: SuspendCompteData,
  userId: string
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, data.compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    // Validate state transition
    const allowed = VALID_TRANSITIONS[compte.statut as StatutCompte];
    if (!allowed?.includes(StatutCompteConst.SUSPENDED)) {
      throw new CompteError(
        `Impossible de suspendre un compte en statut ${compte.statut}`,
        "INVALID_STATE_TRANSITION"
      );
    }

    // Idempotency: if already suspended, update reason
    if (compte.statut === StatutCompteConst.SUSPENDED) {
      const [updated] = await tx
        .update(comptes)
        .set({
          suspendedReasonCode: data.reasonCode,
          suspendedReasonText: data.reasonText || null,
          autoLift: data.autoLift || false,
          suspendedEndDate: data.endDate || null,
          suspendedReviewRequired: data.reviewRequired || false,
          updatedAt: new Date(),
        })
        .where(eq(comptes.id, data.compteId))
        .returning();
      return updated;
    }

    const [updated] = await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.SUSPENDED,
        suspendedAt: new Date(),
        suspendedBy: userId,
        suspendedReasonCode: data.reasonCode,
        suspendedReasonText: data.reasonText || null,
        autoLift: data.autoLift || false,
        suspendedEndDate: data.endDate || null,
        suspendedReviewRequired: data.reviewRequired || false,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, data.compteId))
      .returning();

    // Outbox event
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: data.compteId,
      payload: {
        compteId: data.compteId,
        action: "SUSPENSION",
        reasonCode: data.reasonCode,
        reasonText: data.reasonText,
        autoLift: data.autoLift,
        endDate: data.endDate?.toISOString(),
        suspendedBy: userId,
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_SUSPENDU",
        compteId: data.compteId,
        typeCompte: compte.typeCompte,
        reasonCode: data.reasonCode,
      },
    });

    return updated;
  });
}

/**
 * Lève la suspension d'un compte (SUSPENDED -> ACTIVE)
 * Peut être appelé manuellement ou par le cron auto-lift
 */
export async function unsuspendCompte(
  compteId: string,
  motif?: string,
  userId?: string,
  isAutoLift: boolean = false
): Promise<typeof comptes.$inferSelect> {
  return await db.transaction(async (tx) => {
    const [compte] = await tx.select().from(comptes).where(eq(comptes.id, compteId));
    if (!compte) {
      throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
    }

    if (compte.statut !== StatutCompteConst.SUSPENDED) {
      throw new CompteError("Le compte n'est pas suspendu", "NOT_SUSPENDED");
    }

    const ancienReasonCode = compte.suspendedReasonCode;

    const [updated] = await tx
      .update(comptes)
      .set({
        statut: StatutCompteConst.ACTIVE,
        suspendedAt: null,
        suspendedBy: null,
        suspendedReasonCode: null,
        suspendedReasonText: null,
        autoLift: false,
        suspendedEndDate: null,
        suspendedReviewRequired: false,
        updatedAt: new Date(),
      })
      .where(eq(comptes.id, compteId))
      .returning();

    // Outbox event
    await tx.insert(evenementsOutbox).values({
      type: "MOUVEMENT_STATUT_CHANGE",
      aggregateType: "compte",
      aggregateId: compteId,
      payload: {
        compteId,
        action: "UNSUSPENSION",
        ancienReasonCode,
        motif: motif || (isAutoLift ? "Levée automatique (date de fin atteinte)" : undefined),
        unsuspendedBy: userId,
        isAutoLift,
      },
    });

    // Notify client
    await tx.insert(evenementsOutbox).values({
      type: "SOLDE_COMPTE_CHANGE",
      aggregateType: "client",
      aggregateId: compte.clientId,
      payload: {
        type: "COMPTE_REACTIVE",
        compteId,
        typeCompte: compte.typeCompte,
        nouveauSolde: compte.soldeCourant,
      },
    });

    return updated;
  });
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

// ============================================================================
// PORTFOLIO & QUERIES
// ============================================================================

/**
 * Récupère le portfolio complet d'un client
 */
export async function getClientPortfolio(clientId: string) {
  const { credits, membresTontine, tontines } = await import("@shared/schema");

  const [comptesResult, creditsResult, memberships] = await Promise.all([
    db.select().from(comptes).where(and(eq(comptes.clientId, clientId), isNull(comptes.deletedAt))),
    db.select().from(credits).where(eq(credits.clientId, clientId)),
    db
      .select({
        membre: membresTontine,
        tontine: tontines,
      })
      .from(membresTontine)
      .leftJoin(tontines, eq(membresTontine.tontineId, tontines.id))
      .where(eq(membresTontine.clientId, clientId)),
  ]);

  // Calculate totals - ONLY count ACTIVE accounts for real totals
  // PENDING_ACTIVATION funds are virtual (not yet deposited)
  const isActiveAccount = (c: typeof comptesResult[0]) =>
    c.statut === StatutCompteConst.ACTIVE;

  const totalEpargne = comptesResult
    .filter((c) => c.typeCompte === TypeCompteEnum.SAVINGS && isActiveAccount(c))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalCourant = comptesResult
    .filter((c) => c.typeCompte === TypeCompteEnum.CURRENT && isActiveAccount(c))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalBloque = comptesResult
    .filter((c) => c.typeCompte === TypeCompteEnum.BLOCKED && isActiveAccount(c))
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  // Calculate pending deposits (virtual funds waiting to be deposited)
  const totalPendingDeposit = comptesResult
    .filter((c) => c.statut === StatutCompteConst.PENDING_ACTIVATION)
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalCreditsRestant = creditsResult.reduce(
    (sum, c) => sum + parseFloat(c.soldeRestant || "0"),
    0
  );

  return {
    comptes: comptesResult,
    credits: creditsResult,
    tontines: memberships.map((m) => ({
      ...m.tontine,
      membre: m.membre,
    })),
    totaux: {
      epargne: totalEpargne,
      courant: totalCourant,
      bloque: totalBloque,
      totalComptes: totalEpargne + totalCourant + totalBloque,
      pendingDeposit: totalPendingDeposit, // Virtual funds awaiting deposit
      creditsRestant: totalCreditsRestant,
    },
  };
}

/**
 * Récupère l'historique des agences d'un compte
 */
export async function getCompteAgenceHistorique(compteId: string) {
  return db
    .select()
    .from(compteAgencesHistorique)
    .where(eq(compteAgencesHistorique.compteId, compteId))
    .orderBy(compteAgencesHistorique.dateDebut);
}

/**
 * Récupère les transactions d'un compte
 */
export async function getCompteTransactions(
  compteId: string,
  limit = 50,
  cursor?: string // ISO timestamp of last item (createdAt) — items before this will be returned
) {
  const conditions = [eq(transactionsCompte.compteId, compteId)];
  if (cursor) {
    conditions.push(lt(transactionsCompte.createdAt, new Date(cursor)));
  }

  // Fetch limit + 1 to detect if there are more items
  // Now using sens directly from transactionsCompte (stored at insert time)
  const rawResult = await db
    .select({
      id: transactionsCompte.id,
      createdAt: transactionsCompte.createdAt,
      montant: transactionsCompte.montant,
      // sens is now stored directly in transactionsCompte
      sens: transactionsCompte.sens,
      typePaiement: transactionsCompte.typePaiement,
      observations: transactionsCompte.observations,
      recu_numero: transactionsCompte.referenceExterne,
      referenceExterne: transactionsCompte.referenceExterne,
      solde_apres: transactionsCompte.soldeApres,
      mouvementId: transactionsCompte.mouvementId,
      factureId: transactionsCompte.factureId,
      // Métadonnées pour enrichir les libellés (numéro compte dest, etc.)
      metadata: mouvementsFinanciers.metadata,
    })
    .from(transactionsCompte)
    .leftJoin(mouvementsFinanciers, eq(transactionsCompte.mouvementId, mouvementsFinanciers.id))
    .where(and(...conditions))
    .orderBy(desc(transactionsCompte.createdAt))
    .limit(limit + 1);

  const hasMore = rawResult.length > limit;
  const items = hasMore ? rawResult.slice(0, limit) : rawResult;

  const data = items.map(t => {
    // Use stored sens, fallback to derivation for records without sens (pre-migration)
    const effectiveSens = t.sens || deriveSensFromType(t.typePaiement);

    // Extraire les métadonnées du mouvement pour enrichir le libellé
    const mouvementMeta = (t as any).metadata as Record<string, unknown> | null;
    const metadata = mouvementMeta ? {
      compteDestNumero: mouvementMeta.compteDestNumero as string | undefined,
      compteSourceNumero: mouvementMeta.compteSourceNumero as string | undefined,
      numeroCredit: mouvementMeta.numeroCredit as string | undefined,
      tontineName: mouvementMeta.tontineName as string | undefined,
      motif: mouvementMeta.motif as string | undefined,
    } : undefined;

    // Générer un libellé bancaire professionnel
    const description = formatTransactionDescription(
      t.typePaiement,
      t.observations,
      metadata
    );

    return {
      ...t,
      sens: effectiveSens,
      type: t.typePaiement,
      description,
      factureId: t.factureId,
    };
  });

  const nextCursor = hasMore && data.length > 0
    ? data[data.length - 1].createdAt?.toISOString() ?? null
    : null;

  return { data, nextCursor, hasMore };
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

export async function getCompteStats(
  compteId: string,
  period: '1M' | '3M' | '6M' | '1Y' = '1M'
) {
  const endDate = new Date();
  let startDate = new Date();

  switch (period) {
    case '1M': startDate = subMonths(endDate, 1); break;
    case '3M': startDate = subMonths(endDate, 3); break;
    case '6M': startDate = subMonths(endDate, 6); break;
    case '1Y': startDate = subYears(endDate, 1); break;
    default: startDate = subMonths(endDate, 1);
  }

  // 1. Get initial balance before start date
  // Find last transaction before startDate
  const [lastTxBefore] = await db
    .select({ soldeApres: transactionsCompte.soldeApres })
    .from(transactionsCompte)
    .where(
      and(
        eq(transactionsCompte.compteId, compteId),
        lte(transactionsCompte.createdAt, startDate)
      )
    )
    .orderBy(desc(transactionsCompte.createdAt))
    .limit(1);

  let currentBalance = lastTxBefore ? parseFloat(lastTxBefore.soldeApres || '0') : 0;

  // 2. Get all transactions in range
  const transactions = await db
    .select({
      createdAt: transactionsCompte.createdAt,
      soldeApres: transactionsCompte.soldeApres,
      montant: transactionsCompte.montant,
    })
    .from(transactionsCompte)
    .where(
      and(
        eq(transactionsCompte.compteId, compteId),
        gte(transactionsCompte.createdAt, startDate),
        lte(transactionsCompte.createdAt, endDate)
      )
    )
    .orderBy(transactionsCompte.createdAt); // Ascending for traversal

  // 3. Build daily points
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const dataPoints = [];
  let txIndex = 0;

  for (const day of days) {
    const dayEnd = endOfDay(day);
    let dailyCredit = 0;
    let dailyDebit = 0;
    
    // Process all transactions for this day
    while (
      txIndex < transactions.length && 
      transactions[txIndex].createdAt <= dayEnd
    ) {
      const tx = transactions[txIndex];
      const newBalance = parseFloat(tx.soldeApres || '0');
      const diff = newBalance - currentBalance;

      // In case of slight floating point issues or 0 diff (rare but possible if logic allows)
      if (diff > 0.0001) {
        dailyCredit += diff;
      } else if (diff < -0.0001) {
        dailyDebit += Math.abs(diff);
      }
      
      currentBalance = newBalance;
      txIndex++;
    }

    dataPoints.push({
      date: format(day, 'yyyy-MM-dd'),
      balance: currentBalance,
      credit: dailyCredit,
      debit: dailyDebit
    });
  }

  // Determine trend (start vs end)
  const startBal = dataPoints[0]?.balance || 0;
  const endBal = dataPoints[dataPoints.length - 1]?.balance || 0;
  // Simple trend: verify if any point was negative (red zone) or just global direction?
  // User says: "Vert si la tendance globale est positive, Rouge si le compte a été à découvert sur la période."
  // BUT logic also says: "Rouge si le compte a été à découvert".
  // Let's check for overdraft.
  const hasOverdraft = dataPoints.some(p => p.balance < 0);
  const trend = hasOverdraft ? 'negative' : (endBal >= startBal ? 'positive' : 'neutral');

  return {
    period,
    currency: 'XAF',
    trend,
    data_points: dataPoints
  };
}


/**
 * Create a new account with conditional status based on payment method.
 * - Cash: Created as EN_ATTENTE_PAIEMENT
 * - Transfer: Created as Actif, with atomic debit from source account
 */
export async function createCompteWithInitialDeposit(
  data: {
    clientId: string;
    typeCompte: TypeCompte;
    agenceId: string;
    produitId?: string;
    montantInitial: number;
    modePaiement: 'CASH' | 'TRANSFER';
    compteSourceId?: string; // Required for Transfer
    blocageActif?: boolean;
    blocageMotif?: MotifBlocage;
  },
  userId: string
): Promise<{ compte: Compte; transaction?: TransactionCompte; facture?: Facture }> {

  return await db.transaction(async (tx) => {
    // 1. Determine Status (using standardized EN values)
    const statut = data.modePaiement === 'CASH' && data.montantInitial > 0
      ? StatutCompteConst.PENDING_ACTIVATION
      : StatutCompteConst.ACTIVE;
    
    // 2. Generate Account Number
    const numeroCompte = await generateNumeroCompte(data.typeCompte);

    // 3. Create Account
    // For PENDING_ACTIVATION accounts, store the requested initial amount in soldeCourant
    // This will be the amount the cashier needs to collect for activation
    const initialBalance = statut === StatutCompteConst.PENDING_ACTIVATION
      ? data.montantInitial.toString()
      : '0';

    const [compte] = await tx.insert(comptes).values({
      clientId: data.clientId,
      agenceId: data.agenceId,
      typeCompte: data.typeCompte,
      produitId: data.produitId,
      numeroCompte,
      statut: statut,
      soldeCourant: initialBalance,
      blocageActif: data.blocageActif || false,
      blocageMotif: data.blocageMotif,
      blocageDebut: data.blocageActif ? new Date() : null,
      createdBy: userId,
    }).returning();

    // 4. Agency History
    await tx.insert(compteAgencesHistorique).values({
      compteId: compte.id,
      agenceId: data.agenceId,
      dateDebut: new Date(),
      motif: "Création du compte",
      transferePar: userId,
    });
    
    // 5. Handle Transfer Payment (Immediate Activation)
    if (data.modePaiement === 'TRANSFER' && data.montantInitial > 0) {
      if (!data.compteSourceId) throw new Error('Compte source requis pour virement');

      // A. Verify Source Account
      const [compteSource] = await tx.select()
        .from(comptes)
        .where(eq(comptes.id, data.compteSourceId));

      if (!compteSource) throw new Error('Compte source introuvable');

      const soldeSource = parseFloat(compteSource.soldeCourant);
      if (soldeSource < data.montantInitial) {
        throw new Error(`Solde insuffisant. Disponible: ${soldeSource}, Requis: ${data.montantInitial}`);
      }

      // B. Create Financial Movement (Internal Transfer)
      const reference = `VIR-OUVERTURE-${Date.now()}`;
      const [mouvement] = await tx.insert(mouvementsFinanciers).values({
        dateOperation: new Date(),
        montant: data.montantInitial.toString(),
        sens: 'CREDIT',
        statut: 'POSTED',
        methodePaiement: 'TRANSFER',
        reference,
        sourceModule: 'COMPTE',
        compteId: compte.id, // Linked to the new account
        clientId: data.clientId,
        agenceId: data.agenceId,
        typePaiement: "INITIAL_DEPOSIT",
        createdBy: userId,
        metadata: { description: `Virement ouverture depuis ${compteSource.numeroCompte}` }
      }).returning();

      // B2. Post GL entry (blocking — rollback if GL fails)
      if (data.agenceId) {
        await postGlForMouvement(tx, mouvement, data.agenceId, userId, {
          type: "INITIAL_DEPOSIT",
          compteSourceNumero: compteSource.numeroCompte,
          compteDestNumero: compte.numeroCompte,
          description: `Virement ouverture depuis ${compteSource.numeroCompte}`,
        });
        await tx.update(mouvementsFinanciers)
          .set({ glPostingStatus: "POSTED" })
          .where(eq(mouvementsFinanciers.id, mouvement.id));
      }

      // C. Transaction 1: DEBIT Source Account
      await tx.insert(transactionsCompte).values({
        compteId: data.compteSourceId,
        mouvementId: mouvement.id,
        typePaiement: 'INTERNAL_TRANSFER',
        sens: 'DEBIT', // Outgoing transfer
        montant: data.montantInitial.toString(),
        soldeApres: (soldeSource - data.montantInitial).toString(),
        methodePaiement: 'TRANSFER',
        observations: `Virement vers nouveau compte ${compte.numeroCompte}`,
        createdBy: userId,
      } as any);

      // Update Source Balance
      await tx.update(comptes)
        .set({
          soldeCourant: (soldeSource - data.montantInitial).toString(),
          updatedAt: new Date()
        })
        .where(eq(comptes.id, data.compteSourceId));

      // D. Transaction 2: CREDIT New Account (Initial Deposit)
      const [transaction] = await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        mouvementId: mouvement.id,
        typePaiement: 'INITIAL_DEPOSIT',
        sens: 'CREDIT', // Incoming deposit
        montant: data.montantInitial.toString(),
        soldeApres: data.montantInitial.toString(),
        methodePaiement: 'TRANSFER',
        observations: 'Dépôt initial - Ouverture de compte',
        createdBy: userId,
      }).returning();

      // Update New Account Balance
      await tx.update(comptes)
        .set({
          soldeCourant: data.montantInitial.toString(),
          updatedAt: new Date()
        })
        .where(eq(comptes.id, compte.id));

      // E. Generate Receipt (Facture)
      const facture = await createFactureForDepotInitial({
        compteId: compte.id,
        numeroCompte: compte.numeroCompte,
        clientId: data.clientId,
        montant: data.montantInitial.toString(),
        typeCompte: data.typeCompte,
        modePaiement: 'TRANSFER',
        transactionId: transaction.id,
        agentId: userId,
      });
      
      // Re-fetch updated account
      const [updatedCompte] = await tx.select().from(comptes).where(eq(comptes.id, compte.id));
      
      return { compte: updatedCompte!, transaction, facture };
    }
    
    // 6. Handle Cash (Pending Payment)
    // No transaction created yet. Status is EN_ATTENTE_PAIEMENT.
    return { compte };
  });
}

/**
 * Validates and processes the initial deposit for a pending account via Cashier.
 */
export async function payerDepotInitialCompte(
  compteId: string,
  data: {
    montant: number;
    sessionCaisseId: string;
    userId: string;
  }
): Promise<{ compte: Compte; transaction: TransactionCompte; facture: Facture }> {
  
  return await executeWithLedger(
    "COMPTE",
    {
      montant: data.montant.toString(),
      sens: "CREDIT",
      compteId,
      sessionCaisseId: data.sessionCaisseId,
      typePaiement: "INITIAL_DEPOSIT",
      methodePaiement: "CASH",
      metadata: { description: "Paiement dépôt initial - Activation compte" },
      agenceId: undefined, // Will be inferred or can be passed if needed
    },
    async (tx, mouvement) => {
      // 1. Verify Account
    const [compte] = await tx.select()
        .from(comptes)
        .where(eq(comptes.id, compteId));

      if (!compte) {
        throw new Error("Compte introuvable");
      }

      if (compte.statut !== StatutCompteConst.PENDING_ACTIVATION) {
          throw new Error("Ce compte n'est pas en attente de paiement initial");
      }

      // 2. Validate payment amount (flexible: client can deposit more or less than initially promised)
      if (data.montant <= 0) {
        throw new Error("Le montant du dépôt initial doit être supérieur à 0");
      }

      // 3. Create Transaction for account history
      const [transaction] = await tx.insert(transactionsCompte).values({
        compteId,
        mouvementId: mouvement.id,
        typePaiement: 'INITIAL_DEPOSIT',
        sens: 'CREDIT', // Incoming deposit
        montant: data.montant.toString(),
        soldeApres: data.montant.toString(),
        methodePaiement: 'CASH',
        observations: 'Dépôt initial - Activation de compte',
        createdBy: data.userId,
      } as any).returning();

      // 3. Activate Account & Update Balance with standardized EN status
      const [updatedCompte] = await tx.update(comptes)
        .set({
          statut: StatutCompteConst.ACTIVE,
          soldeCourant: data.montant.toString(),
          updatedAt: new Date()
        })
        .where(eq(comptes.id, compteId))
        .returning();

      // 4. Update Session Balance
      const nouveauSoldeSession = await updateSessionSolde(
        tx,
        data.sessionCaisseId,
        data.montant
      );

      // 5. Create Operation Caisse
      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionCaisseId,
        mouvementId: mouvement.id,
        typeOperation: "INITIAL_DEPOSIT",
        montant: data.montant.toString(),
        methodePaiement: "CASH",
        reference: `DEP-INIT-${compte.numeroCompte}`,
        description: `Dépôt initial - Activation compte ${compte.numeroCompte}`,
        clientId: compte.clientId,
        createdBy: data.userId
      }).returning();

      return {
        result: { compte: updatedCompte, transaction, operation },
        additionalEventData: { nouveauSoldeSession },
      };
    },
    data.userId
  ).then(async ({ result }) => {
    // 6. Generate Receipt
    const facture = await createFactureForDepotInitial({
      compteId: result.compte.id,
      numeroCompte: result.compte.numeroCompte,
      clientId: result.compte.clientId,
      montant: data.montant.toString(),
      typeCompte: result.compte.typeCompte,
      modePaiement: 'CASH',
      transactionId: result.transaction.id,
      agentId: data.userId,
    });

    return { ...result, facture };
  });
}

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

export default {
  // Validation
  clientHasCompteOfType,
  canWithdraw,
  canDeposit,
  // Creation
  createCompte,
  createCompteWithInitialDeposit,
  payerDepotInitialCompte,
  // Operations
  deposerSurCompte,
  retirerDuCompte,
  cloturerCompte,
  crediterInterets,
  // Blocking
  bloquerCompte,
  debloquerCompte,
  // Transfer
  transfererCompteAgence,
  // Queries
  getClientPortfolio,
  getCompteAgenceHistorique,
  getCompteTransactions,
  getCompteStats,
  // Error class
  CompteError,
};
