import {
  comptes,
  sessionsCaisse
} from "@shared/schema";
import { randomInt } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";

// Import standardized status constants
import {
  StatutCompte as StatutCompteConst,
  TypeCompte as TypeCompteEnum
} from "@shared/enum/status-constants";
import { CompteError, TypeCompte, type OpeningSnapshot } from "./types";


/**
 * Pure function: compute account status from snapshot + cumulative payments + approval.
 * This is the SINGLE source of truth for account status determination.
 */
export function recomputeAccountStatus(compte: {
  openingSnapshot: OpeningSnapshot | null;
  paidOpeningFee: string;
  paidInitialDeposit: string;
  isApproved: boolean;
}): string {
  const snap = compte.openingSnapshot;
  if (!snap) return StatutCompteConst.ACTIVE; // Legacy accounts without snapshot

  const needFee = (snap.openingFee || 0) > 0;
  const needDeposit = snap.initialDepositRequired && (snap.minInitialDeposit || 0) > 0;

  const paidFee = parseFloat(compte.paidOpeningFee || "0");
  const paidDeposit = parseFloat(compte.paidInitialDeposit || "0");

  const paymentOK = (!needFee || paidFee >= snap.openingFee)
                  && (!needDeposit || paidDeposit >= snap.minInitialDeposit);
  const approvalOK = !snap.requiresApproval || compte.isApproved;

  if (paymentOK && approvalOK) return StatutCompteConst.ACTIVE;
  if (!paymentOK && !approvalOK) return StatutCompteConst.PENDING_PAYMENT_AND_APPROVAL;
  if (!paymentOK) return StatutCompteConst.PENDING_PAYMENT;
  return StatutCompteConst.PENDING_APPROVAL;
}

/**
 * Helper: compute allocation of a payment toward opening fee first, then deposit.
 */
export function allocateOpeningPayment(
  amount: number,
  snapshot: OpeningSnapshot,
  currentPaidFee: number,
  currentPaidDeposit: number,
): { feePayment: number; depositPayment: number } {
  const feeRemaining = Math.max(0, (snapshot.openingFee || 0) - currentPaidFee);
  const feePayment = Math.min(amount, feeRemaining);
  const depositPayment = amount - feePayment;
  return { feePayment, depositPayment };
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
export async function validateSessionCaisse(sessionId: string): Promise<void> {
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

/**
 * Génère un numéro de compte unique
 */
export function generateNumeroCompte(typeCompte: TypeCompte): string {
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
