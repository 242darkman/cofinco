/**
 * Factures liées aux crédits : frais d'engagement et remboursements.
 *
 * - payerFraisEngagement
 * - createFactureForFraisEngagement
 * - createFactureForRemboursement
 */
import type { MethodePaiementDz } from "@shared/enum/enums";
import {
  StatutDemande,
  StatutFacture,
  TypeDocument,
  TypeOperationCaisse,
} from "@shared/enum/status-constants";
import {
  demandesCredit,
  factures,
  lignesFactures,
  modelesFactures,
  operationsCaisse,
  sessionsCaisse,
  type DemandeCredit,
  type Facture,
  type OperationCaisse,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import {
  executeWithLedger,
  updateSessionSolde,
  validateUserId,
  type MouvementFinancier,
} from "../../../services/ledger";
import { getModeleFactureByCode, incrementModeleFactureNumero } from "../factures";


/**
 * Payer les frais d'engagement pour une demande de crédit.
 * Génère automatiquement une facture/reçu après paiement.
 */
export async function payerFraisEngagement(data: {
  demandeId: string;
  montant: string;
  methodePaiement: string;
  sessionCaisseId?: string;
  idempotencyKey?: string;
}, userId?: string): Promise<{ demande: DemandeCredit; operation: OperationCaisse; mouvement: MouvementFinancier; facture: Facture }> {
  
  // 1. Récupérer la demande
  const [demande] = await db.select().from(demandesCredit).where(eq(demandesCredit.id, data.demandeId));
  if (!demande) throw new Error(`Demande ${data.demandeId} non trouvée`);
  if (demande.fraisEngagementPayes) throw new Error(`Les frais ont déjà été payés pour cette demande`);

  // Exiger une session pour les paiements en espèces
  if (data.methodePaiement === 'CASH' && !data.sessionCaisseId) {
      throw new Error("Une session de caisse active est requise pour le paiement des frais en espèces");
  }

  // Récupérer l'agenceId depuis la session si disponible (pour le posting GL)
  let agenceId: string | undefined;
  if (data.sessionCaisseId) {
    const [session] = await db
      .select({ agenceId: sessionsCaisse.agenceId })
      .from(sessionsCaisse)
      .where(eq(sessionsCaisse.id, data.sessionCaisseId))
      .limit(1);
    agenceId = session?.agenceId || undefined;
  }

  const ledgerResult = await executeWithLedger(
    "CREDIT",
    {
      montant: data.montant,
      sens: "CREDIT", // L'argent entre dans l'institution
      clientId: demande.clientId,
      sessionCaisseId: data.sessionCaisseId,
      methodePaiement: data.methodePaiement,
      typePaiement: "ENGAGEMENT_FEE",
      idempotencyKey: data.idempotencyKey,
      agenceId, // Passer l'agenceId au ledger pour le posting GL
    },
    async (tx, mouvement) => {
      // 2. Mettre à jour la demande
      const [updatedDemande] = await tx.update(demandesCredit)
        .set({ 
          fraisEngagementPayes: true, 
          montantFraisEngagement: data.montant,
          statut: StatutDemande.READY_FOR_INVESTIGATION
        })
        .where(eq(demandesCredit.id, data.demandeId))
        .returning();

      // 3. Mettre à jour la session caisse si applicable
      let nouveauSoldeSession: string | undefined;
      if (data.sessionCaisseId) {
        nouveauSoldeSession = await updateSessionSolde(tx, data.sessionCaisseId, parseFloat(data.montant));
      }

      // 4. Valider l'identifiant utilisateur
      const validatedUserId = await validateUserId(tx, userId);

      // 5. Créer l'opération caisse
      const reference = `FRAIS-${demande.numeroDemande}-${Date.now()}`;
      const [operation] = await tx.insert(operationsCaisse).values({
        sessionId: data.sessionCaisseId!,
        mouvementId: mouvement.id,
        typeOperation: TypeOperationCaisse.ENGAGEMENT_FEE,
        montant: data.montant,
        methodePaiement: data.methodePaiement as MethodePaiementDz,
        reference,
        description: `Paiement frais d'engagement demande ${demande.numeroDemande}`,
        clientId: demande.clientId,
        createdBy: validatedUserId,
        idempotencyKey: data.idempotencyKey,
      }).returning();

      return {
        result: { demande: updatedDemande, operation, validatedUserId },
        additionalEventData: {
          nouveauSoldeSession,
        },
      };
    },
    userId
  );

  // 6. Créer la facture/reçu APRÈS le paiement réussi (hors transaction pour simplicité)
  const facture = await createFactureForFraisEngagement({
    demandeId: data.demandeId,
    numeroDemande: demande.numeroDemande,
    clientId: demande.clientId,
    montant: data.montant,
    agentId: ledgerResult.result.validatedUserId,
    operationCaisseId: ledgerResult.result.operation.id,
    sessionCaisseId: data.sessionCaisseId,
  });

  return {
    demande: ledgerResult.result.demande,
    operation: ledgerResult.result.operation,
    mouvement: ledgerResult.mouvement,
    facture,
  };
}


/**
 * Créer une facture (reçu) pour les frais d'engagement de crédit.
 * Appelée automatiquement après le paiement réussi des frais.
 */
export async function createFactureForFraisEngagement(data: {
  demandeId: string;
  numeroDemande: string;
  clientId: string;
  montant: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
}): Promise<Facture> {
  // 1. Récupérer ou créer le modèle « FRAIS_ENGAGEMENT »
  let modele = await getModeleFactureByCode("FRAIS_ENGAGEMENT");
  
  if (!modele) {
    // Créer le modèle par défaut s'il n'existe pas
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Frais d'Engagement",
      code: "FRAIS_ENGAGEMENT",
      description: "Reçu de paiement des frais d'engagement pour demande de crédit",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: "REC",
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du paiement des frais d'engagement. Ce document ne constitue pas une approbation de crédit.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  // 2. Incrémenter le numéro de facture
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  // 3. Récupérer le shift depuis la session si disponible
  if (data.sessionCaisseId) {
    // Note : SessionsCaisse n'a pas de shiftId direct, on ne lie pas le shift pour le moment
    await db.select().from(sessionsCaisse).where(eq(sessionsCaisse.id, data.sessionCaisseId));
  }
  
  // 4. Créer la facture
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Frais d'engagement pour demande de crédit ${data.numeroDemande}`,
  }).returning();

  // 5. Créer la ligne facture
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Frais d'engagement - Demande de crédit N° ${data.numeroDemande}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "ENGAGEMENT_FEE",
    referenceId: data.demandeId,
  });
  
  return facture;
}


/**
 * Créer un reçu pour le remboursement de crédit.
 */
export async function createFactureForRemboursement(data: {
  creditId: string;
  numeroCredit: string;
  clientId: string;
  montant: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  remboursementId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('REMBOURSEMENT_CREDIT');
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Remboursement Crédit",
      code: 'REMBOURSEMENT_CREDIT',
      description: "Reçu de remboursement de crédit",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'RMB-CRD',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du remboursement effectué sur votre crédit.",
      afficherTva: false,
      isActive: true,
    }).returning();
  }
  
  const nextNum = await incrementModeleFactureNumero(modele.id);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const numeroFacture = `${modele.prefixeNumero}-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  
  const [facture] = await db.insert(factures).values({
    numero: numeroFacture,
    modeleId: modele.id,
    clientId: data.clientId,
    agentId: data.agentId,
    dateFacture: new Date(),
    sousTotal: data.montant,
    montantTva: "0",
    montantTotal: data.montant,
    montantPaye: data.montant,
    statut: StatutFacture.PAID,
    modePaiement: "CASH",
    operationCaisseId: data.operationCaisseId,
    notes: `Remboursement crédit N° ${data.numeroCredit}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Remboursement - Crédit N° ${data.numeroCredit}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "CREDIT_REPAYMENT",
    referenceId: data.creditId,
  });
  
  return facture;
}
