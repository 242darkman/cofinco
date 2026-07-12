/**
 * Coffre-fort et décaissements avec flux ledger.
 *
 * - provisionCoffreWithLedger
 * - createDecaissementWithLedger
 * - processLoanCashPayout
 */
import type {
  DisbursementStatusDz,
  StatutCreditDz,
} from "@shared/enum/enums";
import {
  clients,
  coffresForts,
  credits,
  operationsCaisse,
  sessionsCaisse,
  transactionsCompte,
  users,
  type Credit,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { balanceService } from "../../../services/balance-service";
import {
  assertCoffreCanCredit,
  updateCoffreBalance,
} from "../../../services/coffre/coffre-guard";
import {
  executeWithLedger,
  updateCompteSolde,
  updateSessionSolde,
  type MouvementFinancier
} from "../../../services/ledger";
import { generateCreditSchedule } from "../credits";
import { logger } from "./shared";


/**
 * Approvisionner le coffre-fort depuis une source externe (Banque, Capital, etc.)
 * Utilise la table unifiée coffresForts.
 */
export async function provisionCoffreWithLedger(data: {
    agenceId: string;
    montant: string;
    motif: string;
    description?: string;
    idempotencyKey?: string;
}, userId?: string): Promise<{ mouvement: MouvementFinancier }> {
    
    // 1. Trouver le coffre de l'agence depuis coffresForts (table unifiée)
    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, data.agenceId)
    );

    // Repli vers le coffre du siège si le coffre d'agence n'est pas trouvé
    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) throw new Error("Aucun coffre-fort trouvé pour cette agence");

    // 2. Exécuter la transaction ledger
    return executeWithLedger(
        "CAISSE", 
        {
            montant: data.montant,
            sens: "CREDIT", // Argent entrant
            agenceId: data.agenceId,
            typePaiement: "SAFE_SUPPLY",
            methodePaiement: "OTHER",
            metadata: {
                description: data.description || data.motif || "Approvisionnement Externe",
                motif: data.motif,
                type: "APPROVISIONNEMENT_EXTERNE",
                coffreId: targetCoffre.id,
                coffreCode: targetCoffre.code
            },
            idempotencyKey: data.idempotencyKey
        },
        async (tx, mouvement) => {
             // 3. Guard : verrouille le coffre + vérifie le plafond entrant
             const { soldeBefore } = await assertCoffreCanCredit(
                 tx, targetCoffre.id, parseFloat(data.montant),
                 { userId: userId || "system", operationType: "APPROVISIONNEMENT_COFFRE" }
             );

             // 4. Mise à jour atomique du solde (row déjà verrouillée)
             const { solde: newSolde } = await updateCoffreBalance(tx, targetCoffre.id, parseFloat(data.montant));

             return {
                 result: true,
                 additionalEventData: {
                     nouveauSoldeCoffre: newSolde
                 }
             };
        },
        userId
    ).then(({ mouvement }) => {
        // Diffuser la mise à jour du solde coffre pour l'IHM temps réel
        try {
            const montant = parseFloat(data.montant);
            const previousBalance = parseFloat(targetCoffre.solde || "0");
            balanceService.broadcastBalanceUpdate({
                entityType: 'coffre',
                entityId: targetCoffre.id,
                agenceId: data.agenceId,
                newBalance: previousBalance + montant,
                previousBalance,
                mouvementRef: mouvement.reference || mouvement.id,
                sourceModule: 'APPROVISIONNEMENT',
                typePaiement: 'SAFE_SUPPLY',
            });
        } catch (e) {
            logger.error({ err: e }, 'Erreur lors de la diffusion de l\'approvisionnement coffre');
        }
        return { mouvement };
    });
}


/**
 * Exécuter un décaissement de crédit via le ledger.
 * Utilise la table unifiée coffresForts.
 */
export async function createDecaissementWithLedger(data: {
    creditId: string;
    compteId: string;
    montant: string;
    numeroCredit: string;
}, userId?: string): Promise<{ credit: Credit; mouvement: MouvementFinancier }> {
    
    // 1. Récupérer le crédit
    const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
    if (!credit) throw new Error("Crédit non trouvé");

    // 2. Trouver le coffre de l'agence (coffresForts — table unifiée)
    if (!credit.agenceId) throw new Error("Le crédit n'est lié à aucune agence");

    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, credit.agenceId)
    );

    // Repli vers le coffre du siège si le coffre d'agence n'est pas trouvé
    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) throw new Error("Aucun coffre-fort trouvé pour cette agence");

    const montant = parseFloat(data.montant);
    const coffreId = targetCoffre.id;

    return executeWithLedger(
        "CREDIT",
        {
            montant: data.montant,
            sens: "DEBIT", // Argent sortant de l'institution (vers le compte utilisateur)
            clientId: credit.clientId,
            creditId: data.creditId,
            compteId: data.compteId, // Compte cible
            methodePaiement: "TRANSFER", // Transfert interne
            typePaiement: "CREDIT_DISBURSEMENT",
            agenceId: credit.agenceId, // Passer l'agenceId pour le filtrage historique
            referenceExterne: data.numeroCredit,
            metadata: {
                description: `Décaissement crédit ${data.numeroCredit}`,
                coffreId,
                coffreCode: targetCoffre.code,
            }
        },
        async (tx, mouvement) => {
             // SYSCOHADA : la mise à disposition sur compte client ne déplace PAS de cash physique.
             // Le coffre n'est PAS débité — seul le compte client (4111) est crédité en GL.
             // Le cash ne sortira du coffre que lorsque le client retirera effectivement.
             // On log le coffreId pour traçabilité mais sans modifier son solde.
             logger.info({ coffreId, montant, creditId: data.creditId },
                 'Décaissement sur compte : mise à disposition sans mouvement de cash (coffre non débité)');

             // Mise à jour du solde du compte (créditer le compte de l'utilisateur)
             const nouveauSoldeCompte = await updateCompteSolde(tx, data.compteId, parseFloat(data.montant));

             // Création de l'enregistrement de transaction (pour l'historique du compte)
             await tx.insert(transactionsCompte).values({
                 compteId: data.compteId,
                 mouvementId: mouvement.id,
                 typePaiement: "CREDIT_DISBURSEMENT",
                 sens: "CREDIT", // Le décaissement est de l'argent entrant
                 montant: data.montant,
                 soldeApres: nouveauSoldeCompte,
                 methodePaiement: "TRANSFER",
                 observations: `Décaissement crédit ${data.numeroCredit}`,
             });

             return {
                 result: credit,
                 additionalEventData: {
                     nouveauSoldeCompte
                 }
             };
        },
        userId
    ).then(({ result, mouvement }) => {
        // Pas de broadcast coffre : la mise à disposition sur compte ne touche pas le coffre physique.
        // Le client pourra retirer plus tard (WITHDRAWAL_CURRENT : D 4111 / C 521).
        return { credit: result, mouvement };
    }).then(async (result) => {
        // Générer l'échéancier de remboursement — obligatoire
        await generateCreditSchedule(data.creditId);
        return result;
    });
}


/**
 * Traiter un décaissement de prêt en espèces par le caissier.
 * Appelée lorsque le caissier clique « Payer » sur un décaissement en attente.
 *
 * Étapes :
 * 1. Vérifier que la session de caisse est ouverte
 * 2. Vérifier les fonds suffisants dans le coffre
 * 3. Vérifier que le crédit est au statut WAITING_DISBURSEMENT
 * 4. Débiter le coffre (le cash sort)
 * 5. Mettre à jour le statut du crédit à ACTIVE
 * 6. Générer l'échéancier de remboursement
 */
export async function processLoanCashPayout(data: {
    creditId: string;
    sessionCaisseId: string;
    paymentReference?: string; // Numéro de reçu
}, userId: string): Promise<{
    credit: Credit;
    mouvement: MouvementFinancier;
    echeances?: any[];
}> {
    // 1. Valider que le crédit existe et est dans le bon état
    const [credit] = await db.select().from(credits).where(eq(credits.id, data.creditId));
    if (!credit) {
        throw new Error("Crédit non trouvé");
    }

    if (credit.statut !== 'WAITING_DISBURSEMENT') {
        throw new Error(`Ce crédit n'est pas en attente de décaissement (statut actuel: ${credit.statut})`);
    }

    if (credit.disbursementChannel !== 'CASH') {
        throw new Error(`Ce crédit n'est pas configuré pour un décaissement en espèces (canal: ${credit.disbursementChannel})`);
    }

    if (credit.disbursementStatus !== 'PENDING') {
        throw new Error(`Le décaissement n'est pas en attente (statut: ${credit.disbursementStatus})`);
    }

    // 2. Valider la session de caisse
    const [session] = await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionCaisseId));
    if (!session) {
        throw new Error("Session de caisse non trouvée");
    }

    if (session.statut !== 'OPEN') {
        throw new Error("La session de caisse n'est pas ouverte");
    }

    // 3. Trouver le coffre de l'agence
    if (!credit.agenceId) {
        throw new Error("Le crédit n'est lié à aucune agence");
    }

    const [coffre] = await db.select().from(coffresForts).where(
        eq(coffresForts.ownerId, credit.agenceId)
    );

    let targetCoffre = coffre;
    if (!targetCoffre) {
        const [coffreSiege] = await db.select().from(coffresForts).where(
            eq(coffresForts.ownerType, "SIEGE")
        );
        targetCoffre = coffreSiege;
    }

    if (!targetCoffre) {
        throw new Error("Aucun coffre-fort trouvé pour cette agence");
    }

    const montant = parseFloat(credit.montant);
    const coffreId = targetCoffre.id;

    // Récupérer les infos du client pour l'entrée ledger
    const [clientWithUser] = await db.select({
        client: clients,
        user: { nom: users.nom, prenom: users.prenom }
    })
    .from(clients)
    .leftJoin(users, eq(clients.userId, users.id))
    .where(eq(clients.id, credit.clientId));

    // Exécuter le décaissement avec le ledger
    return executeWithLedger(
        "CAISSE",
        {
            montant: credit.montant,
            sens: "DEBIT", // Argent sortant de la caisse
            clientId: credit.clientId,
            creditId: data.creditId,
            sessionCaisseId: data.sessionCaisseId,
            methodePaiement: "CASH",
            typePaiement: "CREDIT_DISBURSEMENT",
            agenceId: credit.agenceId,
            referenceExterne: data.paymentReference || `LOAN-${credit.numeroCredit}`,
            metadata: {
                description: `Décaissement prêt ${credit.numeroCredit} - ${clientWithUser?.user?.nom || ''} ${clientWithUser?.user?.prenom || ''}`,
                coffreId, // Conservé pour référence mais pas débité opérationnellement
                coffreCode: targetCoffre.code,
                channel: 'CASH'
            }
        },
        async (tx, mouvement) => {
            // Guard de liquidité adossé au GL : vérifier les fonds via GL avant de continuer
            // Note : updateSessionSolde applique aussi un plancher à zéro comme filet de sécurité
            const { liquidityGuard } = await import("../../../services/liquidity-guard");
            await liquidityGuard.requireLiquidity("session", data.sessionCaisseId, montant, tx);

            // Débiter la session (et la caisse physique) de façon atomique
            const newSessionSolde = await updateSessionSolde(tx, data.sessionCaisseId, -montant);

            // Créer l'enregistrement d'opération de caisse
            await tx.insert(operationsCaisse).values({
                sessionId: data.sessionCaisseId,
                typeOperation: 'CREDIT_DISBURSEMENT',
                montant: credit.montant,
                methodePaiement: 'CASH',
                clientId: credit.clientId,
                mouvementId: mouvement.id,
                reference: `LOAN-${credit.numeroCredit}-${Date.now()}`,
                description: `Décaissement prêt ${credit.numeroCredit}`,
            });

            // Mettre à jour le crédit à ACTIVE
            const [updatedCredit] = await tx.update(credits)
                .set({
                    statut: 'ACTIVE' as StatutCreditDz,
                    disbursementStatus: 'COMPLETED' as DisbursementStatusDz,
                    paymentReference: data.paymentReference,
                    disbursedAt: new Date(),
                    disbursedBy: userId,
                    dateDebut: new Date(), // La date de début est maintenant (remise en main du cash)
                    updatedAt: new Date()
                })
                .where(eq(credits.id, data.creditId))
                .returning();

            return {
                result: updatedCredit,
                additionalEventData: {
                    nouveauSoldeSession: newSessionSolde
                }
            };
        },
        userId
    ).then(async ({ result, mouvement }) => {
        // Générer l'échéancier de remboursement — obligatoire
        const echeances = await generateCreditSchedule(data.creditId);
        return {
            credit: result as Credit,
            mouvement,
            echeances
        };
    });
}
