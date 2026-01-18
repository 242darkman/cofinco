import { db } from "../db";
import { comptes, mouvementsFinanciers, transactionsCompte, virementsProgrammes } from "@shared/schema";
import { and, eq, lte } from "drizzle-orm";
import { canDeposit, canWithdraw } from "./comptes";

export type VirementFrequence = "once" | "daily" | "weekly" | "monthly";

interface ExecuteTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  createdBy?: string | null;
  description?: string;
}

interface ScheduleTransferInput {
  compteSourceId: string;
  compteDestId: string;
  montant: number;
  frequence: VirementFrequence;
  createdBy?: string | null;
}

const generateReference = () =>
  `VIR-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

const computeNextExecution = (base: Date, frequence: VirementFrequence): Date | null => {
  const next = new Date(base);

  switch (frequence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(next.getDate(), 28));
      return next;
    case "once":
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
}: ExecuteTransferInput): Promise<{ mouvementId: string }> {
  return db.transaction(async (tx) => {
    const [compteSource] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, compteSourceId))
      .limit(1);

    const [compteDest] = await tx
      .select()
      .from(comptes)
      .where(eq(comptes.id, compteDestId))
      .limit(1);

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

    const soldeSource = Number(compteSource.soldeCourant || 0);
    const soldeDest = Number(compteDest.soldeCourant || 0);

    if (soldeSource < montant) {
      throw new Error(`Solde insuffisant (${soldeSource} FCFA disponible)`);
    }

    const reference = generateReference();
    const mouvement = await tx
      .insert(mouvementsFinanciers)
      .values({
        dateOperation: new Date(),
        montant: montant.toString(),
        sens: "Débit",
        statut: "Posté",
        methodePaiement: "Virement",
        reference,
        sourceModule: "COMPTE",
        compteId: compteSource.id,
        clientId: compteSource.clientId,
        agenceId: compteSource.agenceId || undefined,
        typePaiement: "Virement Interne" as any,
        createdBy: createdBy || undefined,
        metadata: {
          type: "VIREMENT_INTERNE",
          description: description || `Virement vers ${compteDest.numeroCompte}`,
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
      typePaiement: "Transfert Sortant" as any,
      montant: montant.toString(),
      soldeApres: nouveauSoldeSource,
      methodePaiement: "Virement",
      observations: `Virement vers ${compteDest.numeroCompte}`,
      createdBy: createdBy || undefined,
    });

    await tx.insert(transactionsCompte).values({
      compteId: compteDest.id,
      mouvementId,
      typePaiement: "Transfert Entrant" as any,
      montant: montant.toString(),
      soldeApres: nouveauSoldeDest,
      methodePaiement: "Virement",
      observations: `Virement depuis ${compteSource.numeroCompte}`,
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
      statutDernier: "pending",
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
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const schedule of schedules) {
    try {
      await executeCompteTransfer({
        compteSourceId: schedule.compteSourceId,
        compteDestId: schedule.compteDestId,
        montant: Number(schedule.montant || 0),
        createdBy: schedule.createdBy || undefined,
        description: "Virement programme",
      });

      const nextExecution = computeNextExecution(referenceDate, schedule.frequence as VirementFrequence);

      await db
        .update(virementsProgrammes)
        .set({
          dernierExecution: referenceDate,
          prochaineExecution: nextExecution,
          actif: nextExecution ? true : false,
          statutDernier: "success",
          erreurDerniere: null,
          updatedAt: new Date(),
        })
        .where(eq(virementsProgrammes.id, schedule.id));

      results.push({ id: schedule.id, success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      await db
        .update(virementsProgrammes)
        .set({
          dernierExecution: referenceDate,
          statutDernier: "failed",
          erreurDerniere: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(virementsProgrammes.id, schedule.id));

      results.push({ id: schedule.id, success: false, error: errorMessage });
    }
  }

  return results;
}
