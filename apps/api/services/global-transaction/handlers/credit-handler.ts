import { db } from "../../../db";
import { comptes, credits, remboursements, operationsCaisse } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { allocateRepaymentToSchedule } from "../../repayment-allocation-service";
import { validateUserId, updateSessionSolde } from "../../ledger";
import { TypeOperationCaisse, MethodePaiement, TypeCompte, StatutCompte, StatutCredit } from "@shared/enum/status-constants";
import { dispatchDomainEvent } from "../../notifications/domain-events/event-registry";
import type { TransactionHandlerContext, TransactionHandlerResult } from "../global-transaction-types";

/**
 * Gère toutes les transactions globales liées aux Crédits.
 * Inclut les décaissements et les remboursements de prêts.
 */
export async function handleCreditTransaction(ctx: TransactionHandlerContext): Promise<TransactionHandlerResult> {
  const { tx, mouvement, payload, sessionCaisseId, userId } = ctx;
  let result: any;
  let additionalEventData: any = {};

  switch (payload.natureOperation) {
    case TypeOperationCaisse.LOAN_REPAYMENT:
    case TypeOperationCaisse.CREDIT_REPAYMENT: {
      const creditId = payload.creditId || payload.targetId;
      if (!creditId) throw new Error("ID Crédit requis pour un remboursement");

      const credit = await db.query.credits.findFirst({
        where: eq(credits.id, creditId)
      });
      if (!credit) throw new Error("Crédit introuvable");
      if (credit.statut !== StatutCredit.ACTIVE && credit.statut !== StatutCredit.LATE) {
        throw new Error(`Ce crédit ne peut pas recevoir de remboursement (statut: ${credit.statut})`);
      }

      const soldeRestant = Number(credit.soldeRestant);
      if (payload.amount > soldeRestant) {
        throw new Error(`Le montant (${payload.amount}) dépasse le solde restant (${soldeRestant})`);
      }

      if (sessionCaisseId) {
        const nouveauSolde = await updateSessionSolde(tx, sessionCaisseId, payload.amount);
        additionalEventData.nouveauSoldeSession = nouveauSolde;
      }

      const validatedUserIdRemb = await validateUserId(tx, userId);
      const [remboursement] = await tx.insert(remboursements).values({
        creditId: creditId,
        mouvementId: mouvement.id,
        montant: payload.amount.toString(),
        dateRemboursement: new Date(),
        methodePaiement: payload.paymentMethod as any,
        observations: payload.description,
        createdBy: validatedUserIdRemb,
      }).returning();

      const allocationResult = await allocateRepaymentToSchedule(
        tx,
        remboursement.id,
        creditId,
        payload.amount,
        validatedUserIdRemb
      );

      const echeancesNonPayees = allocationResult.updatedEcheances.filter(e =>
        Number(e.montantPaye || 0) < Number(e.montantTotal)
      );
      const nouveauSoldeCredit = echeancesNonPayees.reduce((sum, e) => {
        return sum + (Number(e.montantTotal) - Number(e.montantPaye || 0));
      }, 0);

      const creditSolde = nouveauSoldeCredit <= 0 && echeancesNonPayees.length === 0;
      await tx.update(credits)
        .set({
          soldeRestant: nouveauSoldeCredit.toString(),
          statut: creditSolde ? StatutCredit.PAID : credit.statut,
          dateSolde: creditSolde ? new Date() : undefined,
          updatedAt: new Date()
        })
        .where(eq(credits.id, creditId));

      if (sessionCaisseId) {
        await tx.insert(operationsCaisse).values({
          sessionId: sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: TypeOperationCaisse.LOAN_REPAYMENT as any,
          montant: payload.amount.toString(),
          methodePaiement: "CASH",
          reference: `REMB-${mouvement.reference}`,
          description: payload.description || `Remboursement crédit ${credit.numeroCredit}`,
          clientId: payload.clientId,
          createdBy: validatedUserIdRemb
        });
      }

      result = { ...remboursement, nouveauSoldeCredit, creditSolde };
      additionalEventData.nouveauSoldeCredit = nouveauSoldeCredit;
      additionalEventData.creditSolde = creditSolde;

      if (creditSolde && credit.clientId) {
        dispatchDomainEvent({
          type: "CREDIT_PAID_OFF",
          data: {
            creditId: credit.id,
            numeroCredit: credit.numeroCredit || credit.id,
            clientId: credit.clientId,
            totalPaid: Number(credit.totalDu),
            agenceId: credit.agenceId,
          },
          timestamp: new Date(),
        });
      }

      break;
    }

    case TypeOperationCaisse.CREDIT_DISBURSEMENT:
    case TypeOperationCaisse.LOAN_DISBURSEMENT: {
      const creditIdDisb = payload.creditId || payload.targetId;
      if (!creditIdDisb) throw new Error("ID Crédit requis pour un décaissement");

      const creditDisb = await db.query.credits.findFirst({
        where: eq(credits.id, creditIdDisb)
      });
      if (!creditDisb) throw new Error("Crédit introuvable");

      if (creditDisb.statut !== StatutCredit.PENDING) {
        throw new Error(`Ce crédit ne peut pas être décaissé (statut: ${creditDisb.statut})`);
      }

      if (creditDisb.dateDecaissementEffectif) {
        throw new Error(`Ce crédit a déjà été décaissé le ${creditDisb.dateDecaissementEffectif.toLocaleDateString()}`);
      }

      const montantCredit = Number(creditDisb.montant);
      if (payload.amount !== montantCredit) {
        throw new Error(`Le montant doit être égal au montant du crédit (${montantCredit})`);
      }

      if (sessionCaisseId) {
        const nouveauSolde = await updateSessionSolde(tx, sessionCaisseId, -payload.amount);
        additionalEventData.nouveauSoldeSession = nouveauSolde;
      }

      await tx.update(credits)
        .set({
          statut: StatutCredit.ACTIVE,
          dateDebut: new Date(),
          dateDecaissementEffectif: new Date(),
          soldeRestant: creditDisb.montant,
          updatedAt: new Date()
        })
        .where(eq(credits.id, creditIdDisb));

      if (payload.paymentMethod !== MethodePaiement.CASH) {
        const compteClient = await db.query.comptes.findFirst({
          where: and(
            eq(comptes.clientId, payload.clientId),
            eq(comptes.typeCompte, TypeCompte.CURRENT),
            eq(comptes.statut, StatutCompte.ACTIVE)
          )
        });

        if (compteClient) {
          await tx.update(comptes)
            .set({
              soldeCourant: sql`${comptes.soldeCourant} + ${payload.amount}`,
              updatedAt: new Date()
            })
            .where(eq(comptes.id, compteClient.id));
          additionalEventData.compteCredite = compteClient.id;
        }
      }

      const validatedUserIdDisb = await validateUserId(tx, userId);
      if (sessionCaisseId) {
        const [opDisb] = await tx.insert(operationsCaisse).values({
          sessionId: sessionCaisseId,
          mouvementId: mouvement.id,
          typeOperation: TypeOperationCaisse.CREDIT_DISBURSEMENT as any,
          montant: payload.amount.toString(),
          methodePaiement: payload.paymentMethod as any,
          reference: `DEC-${mouvement.reference}`,
          description: payload.description || `Décaissement crédit ${creditDisb.numeroCredit}`,
          clientId: payload.clientId,
          createdBy: validatedUserIdDisb
        }).returning();
        result = opDisb;
      } else {
        result = { creditId: creditIdDisb, montant: payload.amount, statut: 'DISBURSED' };
      }

      additionalEventData.creditId = creditIdDisb;
      additionalEventData.creditNumero = creditDisb.numeroCredit;
      break;
    }

    default:
      throw new Error(`Opération crédit non supportée: ${payload.natureOperation}`);
  }

  return { result, additionalEventData };
}
