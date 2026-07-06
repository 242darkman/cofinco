/**
 * Compte Transfers Service
 *
 * Ce fichier est maintenant un wrapper vers scheduled-transfers-service.ts
 * pour assurer la compatibilite ascendante avec le code existant.
 *
 * @deprecated Utiliser scheduled-transfers-service.ts directement pour les nouvelles fonctionnalites
 */

import crypto from "crypto";
import { db } from "../db";
import { comptes, mouvementsFinanciers, transactionsCompte } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { canDeposit, canWithdraw } from "./comptes";
import { StatutTransaction } from "@shared/enum/status-constants";
import { postGlForMouvement } from "./accounting-posting-service";
import { createLogger } from "../lib/logger";

const logger = createLogger('CompteTransfers');

// Re-export depuis le nouveau service
export {
  createVirementProgramme,
  getVirementsProgrammesDue,
  processScheduledTransfers,
  runVirementsProgrammes,
  computeNextExecution,
  getScheduledTransferHistory,
  getScheduledTransfersHealth,
  cleanupStaleProcessingLocks,
} from "./scheduled-transfers-service";

export type { VirementFrequence } from "./scheduled-transfers-service";

// ============================================
// TYPES
// ============================================

interface ExecuteTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  createdBy?: string | null;
  description?: string;
  idempotencyKey?: string;
}

// ============================================
// HELPERS
// ============================================

/** Genere une reference unique pour un virement avec crypto.randomUUID() */
const generateReference = () =>
  `VIR-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

// ============================================
// EXECUTE IMMEDIATE TRANSFER
// ============================================

/**
 * Execute un virement immediat entre deux comptes.
 *
 * ATTENTION: Pour les virements programmes, utiliser scheduled-transfers-service.ts
 * qui garantit l'idempotence et la robustesse.
 *
 * Cette fonction reste disponible pour les virements manuels/immediats
 * qui ne font pas partie d'un schedule.
 */
export async function executeCompteTransfer({
  compteSourceId,
  compteDestId,
  montant,
  createdBy,
  description,
  idempotencyKey,
}: ExecuteTransferInput): Promise<{ mouvementId: string }> {
  return db.transaction(async (tx) => {
    // Verification d'idempotence si cle fournie
    if (idempotencyKey) {
      const [existingMouvement] = await tx
        .select({ id: mouvementsFinanciers.id })
        .from(mouvementsFinanciers)
        .where(eq(mouvementsFinanciers.reference, idempotencyKey))
        .limit(1);

      if (existingMouvement) {
        return { mouvementId: existingMouvement.id };
      }
    }

    // Verrouillage des comptes avec FOR UPDATE pour eviter les race conditions
    // L'ordre est important: on verrouille toujours dans le meme ordre (par ID) pour eviter les deadlocks
    const [smallerId, largerId] = compteSourceId < compteDestId
      ? [compteSourceId, compteDestId]
      : [compteDestId, compteSourceId];

    const lockedAccounts = await tx.execute(
      sql`SELECT * FROM comptes WHERE id IN (${smallerId}, ${largerId}) ORDER BY id FOR UPDATE`
    );

    const accountsMap = new Map(
      (lockedAccounts.rows as any[]).map((row: any) => [row.id, row])
    );

    const compteSource = accountsMap.get(compteSourceId);
    const compteDest = accountsMap.get(compteDestId);

    if (!compteSource) {
      throw new Error("Compte source introuvable");
    }
    if (!compteDest) {
      throw new Error("Compte destinataire introuvable");
    }
    if (compteSource.id === compteDest.id) {
      throw new Error("Le compte source et le compte destinataire sont identiques");
    }

    const withdrawCheck = canWithdraw(compteSource);
    if (!withdrawCheck.allowed) {
      throw new Error(withdrawCheck.reason || "Retrait impossible depuis ce compte");
    }

    const depositCheck = canDeposit(compteDest);
    if (!depositCheck.allowed) {
      throw new Error(depositCheck.reason || "Depot impossible sur ce compte");
    }

    const soldeSource = Number(compteSource.solde_courant || 0);
    const soldeDest = Number(compteDest.solde_courant || 0);

    if (soldeSource < montant) {
      throw new Error(`Solde insuffisant (${soldeSource} FCFA disponible)`);
    }

    // Utiliser l'idempotencyKey comme reference si fournie, sinon generer une nouvelle
    const reference = idempotencyKey || generateReference();
    const mouvementResult = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: montant.toString(),
        sens: "DEBIT",
        statut: StatutTransaction.POSTED,
        methodePaiement: "TRANSFER",
        reference,
        sourceModule: "COMPTE",
        compteId: compteSource.id,
        clientId: compteSource.client_id,
        agenceId: compteSource.agence_id || undefined,
        typePaiement: "INTERNAL_TRANSFER",
        createdBy: createdBy || undefined,
        metadata: {
          type: "VIREMENT_INTERNE",
          description: description || `Virement vers ${compteDest.numero_compte}`,
          compteDestId: compteDest.id,
        },
      })
      .returning();

    const mouvementId = mouvementResult[0].id;
    const mouvement = mouvementResult[0];

    // Post GL entry (STRICT — failure rolls back the entire transaction)
    const agenceId = compteSource.agence_id;
    if (!agenceId) {
      throw new Error(`GL posting impossible: no agenceId on source account ${compteSource.numero_compte}`);
    }
    const glResult = await postGlForMouvement(tx, mouvement, agenceId, createdBy || undefined, {
      type: "VIREMENT_INTERNE",
      compteSourceNumero: compteSource.numero_compte,
      compteDestNumero: compteDest.numero_compte,
    });
    if (glResult) {
      logger.info({ mouvementId, numeroPiece: glResult.numeroPiece }, 'GL posted for compte transfer');
    }
    await tx
      .update(mouvementsFinanciers)
      .set({ glPostingStatus: "POSTED" })
      .where(eq(mouvementsFinanciers.id, mouvementId));

    const nouveauSoldeSource = (soldeSource - montant).toString();
    const nouveauSoldeDest = (soldeDest + montant).toString();

    await tx.update(comptes)
      .set({ soldeCourant: nouveauSoldeSource, updatedAt: new Date() })
      .where(eq(comptes.id, compteSource.id));

    await tx.update(comptes)
      .set({ soldeCourant: nouveauSoldeDest, updatedAt: new Date() })
      .where(eq(comptes.id, compteDest.id));

    await tx.insert(transactionsCompte).values({
      compteId: compteSource.id,
      mouvementId,
      typePaiement: "TRANSFER_OUT",
      sens: "DEBIT",
      montant: montant.toString(),
      soldeApres: nouveauSoldeSource,
      methodePaiement: "TRANSFER",
      observations: `Virement vers ${compteDest.numero_compte}`,
      createdBy: createdBy || undefined,
    });

    await tx.insert(transactionsCompte).values({
      compteId: compteDest.id,
      mouvementId,
      typePaiement: "TRANSFER_IN",
      sens: "CREDIT",
      montant: montant.toString(),
      soldeApres: nouveauSoldeDest,
      methodePaiement: "TRANSFER",
      observations: `Virement depuis ${compteSource.numero_compte}`,
      createdBy: createdBy || undefined,
    });

    return { mouvementId };
  });
}
