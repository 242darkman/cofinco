import { type PayrollRun } from "@shared/schema";
import { postEntry } from "../accounting-posting-service";
import { createLogger } from "../../lib/logger";
import { resolveAccount } from "./resolvers";

const logger = createLogger("HrAccounting:Payment");

/**
 * Publie l'écriture comptable de paiement lorsqu'une paie est PAYÉE.
 *
 * D 4211 Personnel rémun. dues     [net total]
 * C 521  Caisse                     [net total]
 * 
 * @param run - La paie en cours de paiement.
 * @param agenceId - L'identifiant de l'agence.
 * @param userId - L'identifiant de l'utilisateur qui exécute l'action.
 * @returns Un objet contenant l'identifiant de l'écriture générée ou un message d'erreur.
 */
export async function postRunPayment(
  run: PayrollRun,
  agenceId: string,
  userId: string
): Promise<{ ecritureId: string | null; error: string | null }> {
  const totalNet = Number(run.totalNet);
  if (totalNet <= 0) {
    return { ecritureId: null, error: "Total net is 0" };
  }

  try {
    const debitAccount = await resolveAccount("4211");
    const creditAccount = await resolveAccount("521");

    if (!debitAccount || !creditAccount) {
      return { ecritureId: null, error: "Missing GL accounts 4211 or 521" };
    }

    const result = await postEntry({
      agenceId,
      sourceType: "PAYROLL_PAYMENT",
      sourceId: `run-${run.id}-payment`,
      journalCode: "CAI",
      entryDate: new Date(),
      description: `Paiement salaires - Paie ${run.period} v${run.version}`,
      lines: [
        {
          compteId: debitAccount.id,
          numeroCompte: "4211",
          libelle: `Personnel rémun. dues - ${run.period}`,
          debit: totalNet,
          credit: 0,
        },
        {
          compteId: creditAccount.id,
          numeroCompte: "521",
          libelle: `Caisse - Paiement salaires ${run.period}`,
          debit: 0,
          credit: totalNet,
        },
      ],
      metadata: {
        payrollRunId: run.id,
        period: run.period,
        version: run.version,
        type: "PAIEMENT",
        totalNet,
      },
      userId,
    });

    return { ecritureId: result.ecritureId, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ runId: run.id, error: msg }, "Failed to post payment GL");
    return { ecritureId: null, error: msg };
  }
}

/**
 * Publie l'écriture comptable lorsqu'une avance sur salaire est PAYÉE en dehors d'une paie classique.
 *
 * D 4212 (Personnel - Avances) / C 521 (Caisse)
 * 
 * @param avanceId - L'identifiant de l'avance sur salaire.
 * @param montant - Le montant de l'avance.
 * @param employeNom - Le nom de l'employé recevant l'avance.
 * @param agenceId - L'identifiant de l'agence.
 * @param userId - L'identifiant de l'utilisateur qui exécute l'action.
 * @returns Un objet contenant l'identifiant de l'écriture générée ou un message d'erreur.
 */
export async function postAdvancePaymentGL(
  avanceId: string,
  montant: number,
  employeNom: string,
  agenceId: string,
  userId: string
): Promise<{ ecritureId: string | null; error: string | null }> {
  try {
    const debitAccount = await resolveAccount("4212");
    const creditAccount = await resolveAccount("521");

    if (!debitAccount || !creditAccount) {
      return { ecritureId: null, error: "Missing GL accounts 4212 or 521" };
    }

    const result = await postEntry({
      agenceId,
      sourceType: "SALARY_ADVANCE",
      sourceId: `advance-${avanceId}`,
      journalCode: "CAI",
      entryDate: new Date(),
      description: `Avance sur salaire - ${employeNom}`,
      lines: [
        {
          compteId: debitAccount.id,
          numeroCompte: "4212",
          libelle: `Avance versée - ${employeNom}`,
          debit: montant,
          credit: 0,
        },
        {
          compteId: creditAccount.id,
          numeroCompte: "521",
          libelle: `Caisse - Avance ${employeNom}`,
          debit: 0,
          credit: montant,
        },
      ],
      metadata: { avanceId, employeNom, type: "PAIEMENT_AVANCE" },
      userId,
    });

    return { ecritureId: result.ecritureId, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ecritureId: null, error: msg };
  }
}
