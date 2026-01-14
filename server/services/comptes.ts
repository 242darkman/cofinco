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

import { db } from "../db";
import {
  comptes,
  transactionsCompte,
  compteAgencesHistorique,
  mouvementsFinanciers,
  evenementsOutbox,
  sessionsCaisse,
  clients,
} from "@shared/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import {
  executeWithLedger,
  updateCompteSolde,
  updateSessionSolde,
  createOutboxEvent,
  type SensMouvement,
  type MouvementFinancier,
} from "./ledger";
import type { PgTransaction } from "drizzle-orm/pg-core";

// Types
export type TypeCompte = "Épargne" | "Courant" | "Bloqué";
export type StatutCompte = "Actif" | "Suspendu" | "Clôturé";
export type MotifBlocage =
  | "Garantie crédit"
  | "Garantie tontine"
  | "Épargne forcée"
  | "Décision interne"
  | "Litige"
  | "Autre";

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
  const [existing] = await db
    .select()
    .from(comptes)
    .where(
      and(
        eq(comptes.clientId, clientId),
        eq(comptes.typeCompte, typeCompte),
        isNull(comptes.deletedAt)
      )
    );
  return !!existing;
}

/**
 * Vérifie si le compte permet les retraits
 */
export function canWithdraw(compte: typeof comptes.$inferSelect): {
  allowed: boolean;
  reason?: string;
} {
  // Statut check
  if (compte.statut === "Suspendu") {
    return { allowed: false, reason: "Compte suspendu" };
  }
  if (compte.statut === "Clôturé") {
    return { allowed: false, reason: "Compte clôturé" };
  }

  // Blocage check for Bloqué accounts
  if (compte.typeCompte === "Bloqué" && compte.blocageActif) {
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
  if (compte.statut === "Clôturé") {
    return { allowed: false, reason: "Compte clôturé" };
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
  if (session.statut !== "Ouverte") {
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
    Épargne: "CE",
    Courant: "CC",
    Bloqué: "CB",
  };
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000)
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

    // Create account
    const [compte] = await tx
      .insert(comptes)
      .values({
        clientId: data.clientId,
        agenceId: data.agenceId,
        produitId: data.produitId,
        numeroCompte,
        typeCompte: data.typeCompte,
        statut: "Actif",
        soldeCourant: (data.soldeInitial || 0).toString(),
        blocageActif: data.blocageActif || data.typeCompte === "Bloqué",
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
      const typePaiementMap: Record<TypeCompte, string> = {
        Épargne: "Dépôt Épargne",
        Courant: "Dépôt Courant",
        Bloqué: "Dépôt Bloqué",
      };

      // Create mouvement
      const reference = `EPG-INIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const [mouvement] = await tx
        .insert(mouvementsFinanciers)
        .values({
          reference,
          sourceModule: "EPARGNE",
          sens: "Crédit",
          montant: data.soldeInitial.toString(),
          dateOperation: new Date(),
          clientId: data.clientId,
          compteId: compte.id,
          agenceId: data.agenceId,
          methodePaiement: "Espèces",
          typePaiement: typePaiementMap[data.typeCompte] as any,
          createdBy: userId,
        })
        .returning();

      // Create transaction record
      await tx.insert(transactionsCompte).values({
        compteId: compte.id,
        mouvementId: mouvement.id,
        typePaiement: typePaiementMap[data.typeCompte] as any,
        montant: data.soldeInitial.toString(),
        soldeApres: data.soldeInitial.toString(),
        methodePaiement: "Espèces",
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
          type: "Dépôt initial",
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
): Promise<{ transaction: typeof transactionsCompte.$inferSelect; mouvement: MouvementFinancier }> {
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
  if (data.methodePaiement === "Espèces" && !data.sessionCaisseId) {
    throw new CompteError(
      "Une session de caisse active est requise pour les dépôts en espèces",
      "SESSION_REQUIRED"
    );
  }

  if (data.sessionCaisseId) {
    await validateSessionCaisse(data.sessionCaisseId);
  }

  // 4. Determine type paiement based on account type
  const typePaiementMap: Record<string, string> = {
    Épargne: "Dépôt Épargne",
    Courant: "Dépôt Courant",
    Bloqué: "Dépôt Bloqué",
  };
  const typePaiement = typePaiementMap[compte.typeCompte];

  // 5. Execute with ledger
  return executeWithLedger(
    "EPARGNE",
    {
      montant: data.montant.toString(),
      sens: "Crédit",
      clientId: compte.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionCaisseId,
      agenceId: compte.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: typePaiement as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // Update compte solde
      const nouveauSolde = await updateCompteSolde(tx, data.compteId, data.montant);

      // Update session caisse if applicable (cash comes in)
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, data.montant);
      }

      // Create transaction record
      const [transaction] = await tx
        .insert(transactionsCompte)
        .values({
          compteId: data.compteId,
          mouvementId: mouvement.id,
          typePaiement: typePaiement as any,
          montant: data.montant.toString(),
          soldeApres: nouveauSolde,
          methodePaiement: data.methodePaiement as any,
          observations: data.observations,
          idempotencyKey: data.idempotencyKey,
          createdBy: userId,
        })
        .returning();

      return {
        result: transaction,
        additionalEventData: {
          nouveauSoldeCompte: nouveauSolde,
          nouveauSoldeSession,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ transaction: result, mouvement }));
}

/**
 * Effectue un retrait sur un compte
 */
export async function retirerDuCompte(
  data: DepotRetraitData,
  userId?: string
): Promise<{ transaction: typeof transactionsCompte.$inferSelect; mouvement: MouvementFinancier }> {
  // 1. Get compte
  const [compte] = await db.select().from(comptes).where(eq(comptes.id, data.compteId));
  if (!compte) {
    throw new CompteError("Compte non trouvé", "COMPTE_NOT_FOUND");
  }

  // 2. Validate withdrawal is allowed (CRITICAL for Bloqué accounts)
  const withdrawCheck = canWithdraw(compte);
  if (!withdrawCheck.allowed) {
    throw new CompteError(withdrawCheck.reason!, "WITHDRAWAL_NOT_ALLOWED");
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
  if (data.methodePaiement === "Espèces" && !data.sessionCaisseId) {
    throw new CompteError(
      "Une session de caisse active est requise pour les retraits en espèces",
      "SESSION_REQUIRED"
    );
  }

  if (data.sessionCaisseId) {
    await validateSessionCaisse(data.sessionCaisseId);
  }

  // 5. Determine type paiement based on account type
  const typePaiementMap: Record<string, string> = {
    Épargne: "Retrait Épargne",
    Courant: "Retrait Courant",
    Bloqué: "Retrait Bloqué",
  };
  const typePaiement = typePaiementMap[compte.typeCompte];

  // 6. Execute with ledger
  return executeWithLedger(
    "EPARGNE",
    {
      montant: data.montant.toString(),
      sens: "Débit",
      clientId: compte.clientId,
      compteId: data.compteId,
      sessionCaisseId: data.sessionCaisseId,
      agenceId: compte.agenceId || undefined,
      methodePaiement: data.methodePaiement,
      typePaiement: typePaiement as any,
      idempotencyKey: data.idempotencyKey,
    },
    async (tx, mouvement) => {
      // Update compte solde (negative delta for withdrawal)
      const nouveauSolde = await updateCompteSolde(tx, data.compteId, -data.montant);

      // Update session caisse if applicable (cash goes out)
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, -data.montant);
      }

      // Create transaction record
      const [transaction] = await tx
        .insert(transactionsCompte)
        .values({
          compteId: data.compteId,
          mouvementId: mouvement.id,
          typePaiement: typePaiement as any,
          montant: data.montant.toString(),
          soldeApres: nouveauSolde,
          methodePaiement: data.methodePaiement as any,
          observations: data.observations,
          idempotencyKey: data.idempotencyKey,
          createdBy: userId,
        })
        .returning();

      return {
        result: transaction,
        additionalEventData: {
          nouveauSoldeCompte: nouveauSolde,
          nouveauSoldeSession,
        },
      };
    },
    userId
  ).then(({ result, mouvement }) => ({ transaction: result, mouvement }));
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

  // Calculate totals
  const totalEpargne = comptesResult
    .filter((c) => c.typeCompte === "Épargne")
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalCourant = comptesResult
    .filter((c) => c.typeCompte === "Courant")
    .reduce((sum, c) => sum + parseFloat(c.soldeCourant || "0"), 0);

  const totalBloque = comptesResult
    .filter((c) => c.typeCompte === "Bloqué")
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
export async function getCompteTransactions(compteId: string, limit = 50) {
  const rawResult = await db
    .select({
      id: transactionsCompte.id,
      createdAt: transactionsCompte.createdAt,
      montant: transactionsCompte.montant,
      // Fetch raw enum value
      sens: mouvementsFinanciers.sens,
      typePaiement: transactionsCompte.typePaiement,
      observations: transactionsCompte.observations,
      recu_numero: transactionsCompte.referenceExterne,
      referenceExterne: transactionsCompte.referenceExterne,
      solde_apres: transactionsCompte.soldeApres,
      mouvementId: transactionsCompte.mouvementId,
    })
    .from(transactionsCompte)
    .leftJoin(mouvementsFinanciers, eq(transactionsCompte.mouvementId, mouvementsFinanciers.id))
    .where(eq(transactionsCompte.compteId, compteId))
    .orderBy(desc(transactionsCompte.createdAt))
    .limit(limit);

  return rawResult.map(t => {
    // Logic moved to JS for safety
    let finalSens = 'DEBIT'; // Default
    if (t.sens === 'Crédit') finalSens = 'CREDIT';
    else if (t.sens === 'Débit') finalSens = 'DEBIT';

    // Priority for description
    const description = t.observations || t.typePaiement || 'Opération';

    return {
      ...t,
      sens: finalSens,
      type: t.typePaiement, // Maintain compatibility
      description,
    };
  });
}

export default {
  // Validation
  clientHasCompteOfType,
  canWithdraw,
  canDeposit,
  // Creation
  createCompte,
  // Operations
  deposerSurCompte,
  retirerDuCompte,
  // Blocking
  bloquerCompte,
  debloquerCompte,
  // Transfer
  transfererCompteAgence,
  // Queries
  getClientPortfolio,
  getCompteAgenceHistorique,
  getCompteTransactions,
  mouvementsFinanciers,
  sessionsCaisse,
  // Error class
  CompteError,
};
