import crypto from "crypto";
import { db } from "../db";
import { comptes, mouvementsFinanciers, transactionsCompte, virementsProgrammes, virementsProgrammesAuditLogs, tachesRegularisation } from "@shared/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { canDeposit, canWithdraw } from "./comptes";
import {
  FrequenceVirement,
  FrequenceVirementType,
  StatutAuditVirement,
  TypeTacheRegularisation,
  Priorite,
  StatutTransaction,
} from "@shared/enum/status-constants";

export type VirementFrequence = FrequenceVirementType;

interface ExecuteTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  createdBy?: string | null;
  description?: string;
  idempotencyKey?: string; // Clé pour éviter les doublons
}

interface ScheduleTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  frequence: VirementFrequence;
  createdBy?: string | null;
}

/** Génère une référence unique pour un virement avec crypto.randomUUID() */
const generateReference = () =>
  `VIR-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const computeNextExecution = (base: Date, frequence: string): Date | null => {
  const next = new Date(base);

  switch (frequence as FrequenceVirementType) {
    case FrequenceVirement.DAILY:
      next.setDate(next.getDate() + 1);
      return next;
    case FrequenceVirement.WEEKLY:
      next.setDate(next.getDate() + 7);
      return next;
    case FrequenceVirement.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(next.getDate(), 28));
      return next;
    case FrequenceVirement.ONCE:
    default:
      return null;
  }
};

export async function executeCompteTransfer({
  compteSourceId,
  compteDestId,
  montant,
  createdBy,
  description,
  idempotencyKey,
}: ExecuteTransferInput): Promise<{ mouvementId: string }> {
  return db.transaction(async (tx) => {
    // Vérification d'idempotence: si cette opération a déjà été exécutée, retourner le résultat existant
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

    // Verrouillage des comptes avec FOR UPDATE pour éviter les race conditions
    // L'ordre est important: on verrouille toujours dans le même ordre (par ID) pour éviter les deadlocks
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

    // Utiliser l'idempotencyKey comme référence si fournie, sinon générer une nouvelle
    const reference = idempotencyKey || generateReference();
    const mouvement = await tx
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
        typePaiement: "INTERNAL_TRANSFER" as any,
        createdBy: createdBy || undefined,
        metadata: {
          type: "VIREMENT_INTERNE",
          description: description || `Virement vers ${compteDest.numero_compte}`,
          compteDestId: compteDest.id,
        },
      })
      .returning();

    const mouvementId = mouvement[0]?.id;

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
      typePaiement: "TRANSFER_OUT" as any,
      montant: montant.toString(),
      soldeApres: nouveauSoldeSource,
      methodePaiement: "TRANSFER",
      observations: `Virement vers ${compteDest.numero_compte}`,
      createdBy: createdBy || undefined,
    });

    await tx.insert(transactionsCompte).values({
      compteId: compteDest.id,
      mouvementId,
      typePaiement: "TRANSFER_IN" as any,
      montant: montant.toString(),
      soldeApres: nouveauSoldeDest,
      methodePaiement: "TRANSFER",
      observations: `Virement depuis ${compteSource.numero_compte}`,
      createdBy: createdBy || undefined,
    });

    return { mouvementId };
  });
}

export async function createVirementProgramme({
  compteSourceId,
  compteDestId,
  montant,
  frequence,
  createdBy,
}: ScheduleTransferInput) {
  const [schedule] = await db
    .insert(virementsProgrammes)
    .values({
      compteSourceId,
      compteDestId,
      montant: montant.toString(),
      frequence,
      prochaineExecution: new Date(),
      actif: true,
      createdBy: createdBy || undefined,
      statutDernier: null, // No execution yet
    })
    .returning();

  return schedule;
}

export async function getVirementsProgrammesDue(referenceDate = new Date()) {
  return db
    .select()
    .from(virementsProgrammes)
    .where(
      and(
        eq(virementsProgrammes.actif, true),
        lte(virementsProgrammes.prochaineExecution, referenceDate)
      )
    );
}

export async function runVirementsProgrammes(referenceDate = new Date()) {
  const schedules = await getVirementsProgrammesDue(referenceDate);
  const results: { id: string; success: boolean; error?: string; mouvementId?: string }[] = [];

  for (const schedule of schedules) {
    const startTime = performance.now();
    // Générer une clé d'idempotence unique pour ce virement programmé à cette date
    const idempotencyKey = `VP-${schedule.id}-${referenceDate.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;

    try {
      const { mouvementId } = await executeCompteTransfer({
        compteSourceId: schedule.compteSourceId,
        compteDestId: schedule.compteDestId,
        montant: Number(schedule.montant || 0),
        createdBy: schedule.createdBy || undefined,
        description: "Virement programmé",
        idempotencyKey,
      });

      const executionTimeMs = Math.round(performance.now() - startTime);
      const nextExecution = computeNextExecution(referenceDate, schedule.frequence);

      // Mise à jour du virement programmé
      await db
        .update(virementsProgrammes)
        .set({
          dernierExecution: referenceDate,
          prochaineExecution: nextExecution,
          actif: nextExecution ? true : false,
          statutDernier: StatutAuditVirement.SUCCESS,
          erreurDerniere: null,
          updatedAt: new Date(),
        })
        .where(eq(virementsProgrammes.id, schedule.id));

      // Insertion du log d'audit
      await db.insert(virementsProgrammesAuditLogs).values({
        virementId: schedule.id,
        statut: StatutAuditVirement.SUCCESS,
        message: "Virement exécuté avec succès",
        executedAt: new Date(),
        executionTimeMs,
        mouvementId,
        metadata: {
          montant: Number(schedule.montant),
          compteSourceId: schedule.compteSourceId,
          compteDestId: schedule.compteDestId,
          frequence: schedule.frequence,
          idempotencyKey,
        },
      });

      results.push({ id: schedule.id, success: true, mouvementId });
    } catch (error) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";

      // Mise à jour du virement programmé avec l'erreur
      await db
        .update(virementsProgrammes)
        .set({
          dernierExecution: referenceDate,
          statutDernier: StatutAuditVirement.FAILED,
          erreurDerniere: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(virementsProgrammes.id, schedule.id));

      // Insertion du log d'audit d'échec
      await db.insert(virementsProgrammesAuditLogs).values({
        virementId: schedule.id,
        statut: StatutAuditVirement.FAILED,
        message: errorMessage,
        executedAt: new Date(),
        executionTimeMs,
        metadata: {
          montant: Number(schedule.montant),
          compteSourceId: schedule.compteSourceId,
          compteDestId: schedule.compteDestId,
          frequence: schedule.frequence,
          idempotencyKey,
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });

      // Créer une tâche de régularisation pour le virement échoué
      await db.insert(tachesRegularisation).values({
        type: TypeTacheRegularisation.VIREMENT_PROG_ECHEC,
        description: `Virement programmé #${schedule.id.slice(0, 8)} échoué: ${errorMessage}`,
        montantEcart: schedule.montant,
        priorite: Priorite.HIGH,
        dateEcheance: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // J+1
      });

      results.push({ id: schedule.id, success: false, error: errorMessage });
    }
  }

  return results;
}
