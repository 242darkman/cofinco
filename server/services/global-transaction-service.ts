import { db } from "../db";
import {
  sessionsCaisse,
  operationsCaisse,
  tontines,
  comptes,
  credits,
  remboursements,
  type MouvementFinancier
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  executeWithLedger,
  validateUserId,
  updateSessionSolde,
  generateReference
} from "./ledger";
import {
  TypeOperationCaisse,
  MethodePaiement,
  StatutSessionCaisse,
  TypeCompte,
  StatutCompte,
  StatutCredit
} from "@shared/enum/status-constants";
import {
  processTontineContribution,
  processTontineDistribution,
  getMemberTontineState,
  isTourFullyPaid
} from "./tontine-logic";
import {
  processCompteDepot,
  processCompteRetrait,
  canDeposit,
  canWithdraw
} from "./comptes";

// Payload definition
export interface GlobalTransactionPayload {
  clientId: string;
  amount: number;
  paymentMethod: string; // "CASH" | "MOMO" | "TRANSFER"
  natureOperation: string; // Enum TypeOperationCaisse
  targetId?: string; // TontineId, CompteId, CreditId
  description?: string;
  
  // Specific fields
  tontineId?: string;
  membreId?: string;
  compteId?: string;
  creditId?: string;
  
  // Metadata for external refs
  referenceExterne?: string;
  numeroTransaction?: string;
  numeroTelephone?: string;
}

export class GlobalTransactionService {
  
  /**
   * Process a global transaction
   * Acts as an orchestrator ensuring ACID properties and accounting rules
   */
  static async process(userId: string | undefined, payload: GlobalTransactionPayload) {
    // Sanitize payload: convert empty strings to undefined for UUID fields
    const sanitizeUuid = (val: string | undefined) => (val && val.trim() !== "" ? val : undefined);
    
    payload.clientId = sanitizeUuid(payload.clientId)!; // Required based on validation below
    payload.targetId = sanitizeUuid(payload.targetId);
    payload.tontineId = sanitizeUuid(payload.tontineId);
    payload.membreId = sanitizeUuid(payload.membreId);
    payload.compteId = sanitizeUuid(payload.compteId);
    payload.creditId = sanitizeUuid(payload.creditId);

    // 1. Validation de base
    if (!payload.amount || payload.amount <= 0) {
      throw new Error("Le montant doit être supérieur à 0");
    }
    if (!payload.clientId) {
      throw new Error("Client requis");
    }

    // 2. Validation Session Caisse (si ESPÈCES)
    let sessionCaisseId: string | undefined;
    if (payload.paymentMethod === MethodePaiement.CASH) {
      if (!userId) {
         throw new Error("Utilisateur requis pour les opérations en espèces");
      }
      
      const session = await db.query.sessionsCaisse.findFirst({
        where: and(
          eq(sessionsCaisse.caissierId, userId),
          eq(sessionsCaisse.statut, StatutSessionCaisse.OPEN)
        )
      });
      
      if (!session) {
        throw new Error("Aucune session de caisse ouverte pour cet agent");
      }
      sessionCaisseId = session.id;

      // Vérification Solde Caisse pour les SORTIES
      const isSortie = [
        TypeOperationCaisse.TONTINE_WITHDRAWAL,
        TypeOperationCaisse.WITHDRAWAL_SAVINGS,
        TypeOperationCaisse.WITHDRAWAL_CURRENT,
        TypeOperationCaisse.WITHDRAWAL_BLOCKED,
        TypeOperationCaisse.CREDIT_DISBURSEMENT,
        TypeOperationCaisse.LOAN_DISBURSEMENT,
        TypeOperationCaisse.MISC_DISBURSEMENT
      ].includes(payload.natureOperation as any);

      if (isSortie) {
        const soldeActuel = Number(session.montantFermetureTheorique || 0);
        if (soldeActuel < payload.amount) {
          throw new Error(`Fonds insuffisants en caisse. Disponible: ${soldeActuel}`);
        }
      }
    }

    // 3. Routage & Exécution (Switch Central)
    // On utilise executeWithLedger une seule fois pour garantir l'atomicité
    // Le module "SOURCE" dépend de l'opération, mais on peut utiliser "CAISSE" ou le module spécifique
    
    let sourceModule: any = "CAISSE";
    if (payload.natureOperation.startsWith("TONTINE")) sourceModule = "TONTINE";
    else if (payload.natureOperation.includes("SAVINGS") || payload.natureOperation.includes("CURRENT")) sourceModule = "EPARGNE";
    else if (payload.natureOperation.includes("LOAN") || payload.natureOperation.includes("CREDIT")) sourceModule = "CREDIT";

    return await executeWithLedger(
      sourceModule,
      {
        montant: payload.amount.toString(),
        sens: this.getSensByOperation(payload.natureOperation), // Helper needed or hardcoded logic
        clientId: payload.clientId,
        sessionCaisseId,
        typePaiement: payload.natureOperation,
        methodePaiement: payload.paymentMethod,
        compteId: payload.compteId,
        tontineId: payload.tontineId,
        creditId: payload.creditId,
        referenceExterne: payload.referenceExterne || payload.numeroTransaction,
        metadata: {
          description: payload.description,
          telephone: payload.numeroTelephone
        }
      },
      async (tx, mouvement) => {
        let result: any;
        let additionalData: any = {};

        switch (payload.natureOperation) {
          // ==================== TONTINES ====================
          case TypeOperationCaisse.TONTINE_CONTRIBUTION: {
            if (!payload.tontineId) throw new Error("ID Tontine requis");
            
            // Récupérer l'état actuel (nécessaire pour le smart dispatch)
            const state = await getMemberTontineState(payload.clientId, payload.tontineId);
            if (!state) throw new Error("Membre non trouvé dans cette tontine");

            const tontineResult = await processTontineContribution(tx, mouvement, {
              clientId: payload.clientId,
              tontineId: payload.tontineId,
              amountTotal: payload.amount,
              sessionCaisseId,
              userId,
              state
            });
            result = tontineResult.result;
            additionalData = tontineResult.additionalEventData;
            break;
          }

          case TypeOperationCaisse.TONTINE_WITHDRAWAL: {
             if (!payload.tontineId) throw new Error("ID Tontine requis");
             if (!payload.membreId) throw new Error("ID Membre requis");

             // Retrait tontine = Distribution de bénéfice
             // Le numéro de tour doit être déterminé. 
             // Simplification: on prend le tour actuel de la tontine ou on suppose que c'est un retrait "fin de cycle"
             // Pour l'instant, disons qu'on distribue le tour courant si le membre est bénéficiaire
             
             // TODO: Logique plus fine pour déterminer QUEL tour on retire.
             // Pour cette V1, on va supposer qu'on retire le montant total disponible ou un tour spécifique si passé en param
             
             const tontine = await db.query.tontines.findFirst({
                 where: eq(tontines.id, payload.tontineId)
             });
             
             if (!tontine) throw new Error("Tontine introuvable");
             
             // Utiliser le tour qui vient de passer ou le tour actuel
             // Warning: This logic assumes we withdraw the current round's gain
             const tourNumero = tontine.nombreMembres; // Defaulting logic needs check

             const distResult = await processTontineDistribution(tx, mouvement, {
                tontineId: payload.tontineId,
                membreId: payload.membreId,
                tourNumero: tourNumero, // FIXME: Needs logic to identify correct round
                montantTotal: payload.amount,
                modeDistribution: "CASH_WITHDRAWAL",
                modePaiement: payload.paymentMethod,
                sessionCaisseId,
                userId,
                notes: payload.description,
                reference: mouvement.reference,
                tontineNom: tontine.nom
             });
             result = distResult.result;
             break;
          }

          // ==================== COMPTES (ÉPARGNE/COURANT) ====================
          case TypeOperationCaisse.DEPOSIT_SAVINGS:
          case TypeOperationCaisse.DEPOSIT_CURRENT: 
          case TypeOperationCaisse.DEPOSIT_BLOCKED: {
            if (!payload.compteId) throw new Error("ID Compte requis");
            
            // Vérifier autorisation
            const compte = await db.query.comptes.findFirst({ where: eq(comptes.id, payload.compteId) });
            if (!compte) throw new Error("Compte introuvable");
            
            const check = canDeposit(compte);
            if (!check.allowed) throw new Error(check.reason);

            const opResult = await processCompteDepot(tx, mouvement, {
              compteId: payload.compteId,
              montant: payload.amount,
              sessionCaisseId,
              observations: payload.description,
              typePaiement: payload.natureOperation,
              methodePaiement: payload.paymentMethod,
              userId
            });
            result = opResult.result;
            additionalData = opResult.additionalEventData;
            break;
          }

          case TypeOperationCaisse.WITHDRAWAL_SAVINGS:
          case TypeOperationCaisse.WITHDRAWAL_CURRENT:
          case TypeOperationCaisse.WITHDRAWAL_BLOCKED: {
             if (!payload.compteId) throw new Error("ID Compte requis");

             const compte = await db.query.comptes.findFirst({ where: eq(comptes.id, payload.compteId) });
             if (!compte) throw new Error("Compte introuvable");

             const check = canWithdraw(compte);
             if (!check.allowed) throw new Error(check.reason);

             // Solde check handled by processCompteRetrait implicitly via updateCompteSolde? 
             // updateCompteSolde doesn't check negative balance unless constraint exists.
             // Manual check here is safer.
             if (Number(compte.soldeCourant) < payload.amount) {
                 throw new Error("Solde compte insuffisant");
             }

             const opResult = await processCompteRetrait(tx, mouvement, {
               compteId: payload.compteId,
               montant: payload.amount,
               sessionCaisseId,
               observations: payload.description,
               typePaiement: payload.natureOperation,
               methodePaiement: payload.paymentMethod,
               userId
             });
             result = opResult.result;
             additionalData = opResult.additionalEventData;
             break;
          }

          // ==================== CRÉDITS ====================
          case TypeOperationCaisse.LOAN_REPAYMENT:
          case TypeOperationCaisse.CREDIT_REPAYMENT: {
            // Remboursement de prêt - ENTRÉE d'argent
            const creditId = payload.creditId || payload.targetId;
            if (!creditId) throw new Error("ID Crédit requis pour un remboursement");

            const credit = await db.query.credits.findFirst({
              where: eq(credits.id, creditId)
            });
            if (!credit) throw new Error("Crédit introuvable");
            if (credit.statut !== StatutCredit.ACTIVE && credit.statut !== StatutCredit.LATE) {
              throw new Error(`Ce crédit ne peut pas recevoir de remboursement (statut: ${credit.statut})`);
            }

            // Vérifier que le montant ne dépasse pas le solde restant
            const soldeRestant = Number(credit.soldeRestant || credit.montant);
            if (payload.amount > soldeRestant) {
              throw new Error(`Le montant (${payload.amount}) dépasse le solde restant (${soldeRestant})`);
            }

            // 1. Mettre à jour le solde du crédit (diminution)
            const nouveauSoldeCredit = soldeRestant - payload.amount;
            await tx.update(credits)
              .set({
                soldeRestant: nouveauSoldeCredit.toString(),
                statut: nouveauSoldeCredit <= 0 ? StatutCredit.PAID : credit.statut,
                dateSolde: nouveauSoldeCredit <= 0 ? new Date() : undefined,
                updatedAt: new Date()
              })
              .where(eq(credits.id, creditId));

            // 2. Mettre à jour la session caisse (entrée d'argent)
            if (sessionCaisseId) {
              const nouveauSolde = await updateSessionSolde(tx, sessionCaisseId, payload.amount);
              additionalData.nouveauSoldeSession = nouveauSolde;
            }

            // 3. Créer le remboursement
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

            // 4. Créer opération caisse
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

            result = remboursement;
            additionalData.nouveauSoldeCredit = nouveauSoldeCredit;
            additionalData.creditSolde = nouveauSoldeCredit <= 0;
            break;
          }

          case TypeOperationCaisse.CREDIT_DISBURSEMENT:
          case TypeOperationCaisse.LOAN_DISBURSEMENT: {
            // Décaissement de prêt - SORTIE d'argent
            const creditIdDisb = payload.creditId || payload.targetId;
            if (!creditIdDisb) throw new Error("ID Crédit requis pour un décaissement");

            const creditDisb = await db.query.credits.findFirst({
              where: eq(credits.id, creditIdDisb)
            });
            if (!creditDisb) throw new Error("Crédit introuvable");

            // Vérifier que le crédit est en statut PENDING (approuvé mais pas encore décaissé)
            if (creditDisb.statut !== StatutCredit.PENDING) {
              throw new Error(`Ce crédit ne peut pas être décaissé (statut: ${creditDisb.statut})`);
            }

            // Vérifier que le crédit n'a pas déjà été décaissé
            if (creditDisb.dateDecaissementEffectif) {
              throw new Error(`Ce crédit a déjà été décaissé le ${creditDisb.dateDecaissementEffectif.toLocaleDateString()}`);
            }

            // Le montant décaissé doit correspondre au montant du crédit
            const montantCredit = Number(creditDisb.montant);
            if (payload.amount !== montantCredit) {
              throw new Error(`Le montant doit être égal au montant du crédit (${montantCredit})`);
            }

            // 1. Mettre à jour la session caisse (sortie d'argent)
            if (sessionCaisseId) {
              const nouveauSolde = await updateSessionSolde(tx, sessionCaisseId, -payload.amount);
              additionalData.nouveauSoldeSession = nouveauSolde;
            }

            // 2. Mettre à jour le crédit (statut ACTIVE, date décaissement)
            await tx.update(credits)
              .set({
                statut: StatutCredit.ACTIVE,
                dateDebut: new Date(),
                dateDecaissementEffectif: new Date(),
                soldeRestant: creditDisb.montant, // Le solde restant = montant total au départ
                updatedAt: new Date()
              })
              .where(eq(credits.id, creditIdDisb));

            // 3. Créditer le compte courant du client si mode = virement sur compte
            // Pour CASH, on donne directement au client (pas de crédit compte)
            if (payload.paymentMethod !== MethodePaiement.CASH) {
              // Trouver le compte courant du client
              const compteClient = await db.query.comptes.findFirst({
                where: and(
                  eq(comptes.clientId, payload.clientId),
                  eq(comptes.typeCompte, TypeCompte.CURRENT),
                  eq(comptes.statut, StatutCompte.ACTIVE)
                )
              });

              if (compteClient) {
                // Créditer le compte
                await tx.update(comptes)
                  .set({
                    soldeCourant: sql`${comptes.soldeCourant} + ${payload.amount}`,
                    updatedAt: new Date()
                  })
                  .where(eq(comptes.id, compteClient.id));
                additionalData.compteCredite = compteClient.id;
              }
            }

            // 4. Créer opération caisse
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

            additionalData.creditId = creditIdDisb;
            additionalData.creditNumero = creditDisb.numeroCredit;
            break;
          }

          // ==================== DIVERS ====================
          case TypeOperationCaisse.MISC_COLLECTION:
          case TypeOperationCaisse.MISC_DISBURSEMENT: {
             // Simplement une écriture caisse + mouvement financier
             // Le ledger a déjà créé le mouvement. Il reste à mettre à jour la caisse si ESPÈCES
             
             if (sessionCaisseId) {
                const sens = payload.natureOperation === TypeOperationCaisse.MISC_COLLECTION ? 1 : -1;
                const nouveauSolde = await updateSessionSolde(tx, sessionCaisseId, payload.amount * sens);
                additionalData.nouveauSoldeSession = nouveauSolde;
                
                // Créer opération caisse
                const validatedUserId = await validateUserId(tx, userId);
                const [op] = await tx.insert(operationsCaisse).values({
                    sessionId: sessionCaisseId,
                    mouvementId: mouvement.id,
                    typeOperation: payload.natureOperation as any,
                    montant: payload.amount.toString(),
                    methodePaiement: "CASH",
                    reference: `DIV-${mouvement.reference}`,
                    description: payload.description || "Opération Divers",
                    createdBy: validatedUserId
                }).returning();
                result = op;
             }
             break;
          }
          
          default:
            throw new Error(`Opération non supportée: ${payload.natureOperation}`);
        }

        return { result, additionalEventData: additionalData };
      },
      userId
    );
  }

  static getSensByOperation(op: string): "CREDIT" | "DEBIT" {
     // CREDIT = entrée d'argent en caisse (le client nous donne de l'argent)
     // DEBIT = sortie d'argent de la caisse (nous donnons de l'argent au client)
     const entrees = [
         TypeOperationCaisse.TONTINE_CONTRIBUTION,
         TypeOperationCaisse.DEPOSIT_SAVINGS,
         TypeOperationCaisse.DEPOSIT_CURRENT,
         TypeOperationCaisse.DEPOSIT_BLOCKED,
         TypeOperationCaisse.MISC_COLLECTION,
         TypeOperationCaisse.LOAN_REPAYMENT,
         TypeOperationCaisse.CREDIT_REPAYMENT,
         TypeOperationCaisse.ENGAGEMENT_FEE
     ];
     return entrees.includes(op as any) ? "CREDIT" : "DEBIT";
  }
}
