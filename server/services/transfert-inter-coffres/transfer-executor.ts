import { db } from "../../db";
import { sql, eq } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  comptesLiaison,
  reconciliationsLiaison,
  tachesRegularisation,
  mouvementsFinanciers,
} from "@shared/schema";
import { generateReference, createMouvementFinancier } from "../ledger";

interface DispatchResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementSourceId?: string;
}

interface ReceiveResult {
  success: boolean;
  errorCode?: string;
  error?: string;
  mouvementDestId?: string;
  reconciliationId?: string;
  tacheId?: string;
  ecart?: number;
}

/**
 * Exécute le dispatch d'un transfert (départ en transit)
 * - Débite le coffre source
 * - Crée le mouvement financier
 * - Verrouille le transfert
 */
export async function executeDispatch(
  transfertId: string,
  userId: string,
  userRole: string,
  ipAddress?: string,
  userAgent?: string
): Promise<DispatchResult> {
  return await db.transaction(async (tx) => {
    // 1. Récupérer le transfert avec verrouillage
    const [transfert] = await tx
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
    }

    if (transfert.verrouille) {
      return { success: false, errorCode: "TIC_024", error: "Transfert déjà verrouillé" };
    }

    if (transfert.statut !== "Approuvé N2") {
      return { success: false, errorCode: "TIC_020", error: `Impossible de dispatcher un transfert en statut "${transfert.statut}"` };
    }

    // 2. Récupérer le coffre source
    const [coffreSource] = await tx
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, transfert.coffreSourceId));

    if (!coffreSource) {
      return { success: false, errorCode: "TIC_006", error: "Coffre source introuvable" };
    }

    // 3. Vérifier le solde
    const soldeSource = parseFloat(coffreSource.solde?.toString() || "0");
    const montant = parseFloat(transfert.montant?.toString() || "0");

    if (soldeSource < montant) {
      return {
        success: false,
        errorCode: "TIC_003",
        error: `Solde insuffisant. Disponible: ${soldeSource.toLocaleString()} XAF`,
      };
    }

    // 4. Créer le mouvement financier (sortie du coffre source)
    const referenceSource = generateReference("TIC");
    const [mouvementSource] = await tx
      .insert(mouvementsFinanciers)
      .values({
        montant: transfert.montant,
        sens: "Crédit", // Sortie = Crédit (diminution)
        reference: referenceSource,
        sourceModule: "TRANSFERT",
        agenceId: coffreSource.ownerId,
        statut: "Posté",
        dateOperation: new Date(),
        metadata: {
          transfertInterCoffreId: transfertId,
          type: "SORTIE_COFFRE_TRANSIT",
          coffreSourceId: transfert.coffreSourceId,
          coffreDestId: transfert.coffreDestinationId,
        },
      })
      .returning();

    // 5. Débiter le coffre source (atomique)
    await tx
      .update(coffresForts)
      .set({
        solde: sql`${coffresForts.solde} - ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(coffresForts.id, transfert.coffreSourceId));

    // 6. Mettre à jour le transfert
    const now = new Date();
    await tx
      .update(transfertsInterCoffres)
      .set({
        statut: "En transit",
        dispatchedBy: userId,
        dispatchedAt: now,
        mouvementSourceId: mouvementSource.id,
        dateComptable: now.toISOString().split("T")[0],
        verrouille: true,
        updatedAt: now,
      })
      .where(eq(transfertsInterCoffres.id, transfertId));

    // 7. Log d'audit
    await tx.insert(transfertsInterCoffresAuditLogs).values({
      transfertId,
      action: "DISPATCHED",
      statutAvant: "Approuvé N2",
      statutApres: "En transit",
      details: {
        mouvementSourceId: mouvementSource.id,
        montant,
        soldeAvant: soldeSource,
        soldeApres: soldeSource - montant,
      },
      userId,
      userRole,
      ipAddress,
      userAgent,
    });

    return { success: true, mouvementSourceId: mouvementSource.id };
  });
}

/**
 * Exécute la réception d'un transfert
 * - Crédite le coffre destination
 * - Crée les mouvements financiers
 * - Gère les écarts
 * - Crée la réconciliation
 */
export async function executeReceive(
  transfertId: string,
  userId: string,
  userRole: string,
  data: {
    montantRecu: number;
    conforme: boolean;
    commentaire?: string;
    motifEcart?: string;
    heureReception?: string;
  },
  ipAddress?: string,
  userAgent?: string
): Promise<ReceiveResult> {
  return await db.transaction(async (tx) => {
    // 1. Récupérer le transfert
    const [transfert] = await tx
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
    }

    if (transfert.statut !== "En transit") {
      return { success: false, errorCode: "TIC_020", error: `Impossible de réceptionner un transfert en statut "${transfert.statut}"` };
    }

    const montantAttendu = parseFloat(transfert.montant?.toString() || "0");
    const montantRecu = data.montantRecu;
    const ecart = montantAttendu - montantRecu;

    // 2. Récupérer les coffres
    const [coffreSource] = await tx
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, transfert.coffreSourceId));

    const [coffreDest] = await tx
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, transfert.coffreDestinationId));

    if (!coffreSource || !coffreDest) {
      return { success: false, errorCode: "TIC_006", error: "Coffre introuvable" };
    }

    // 3. Créer le mouvement financier (entrée coffre destination)
    const referenceDest = generateReference("TIC");
    const [mouvementDest] = await tx
      .insert(mouvementsFinanciers)
      .values({
        montant: montantRecu.toString(),
        sens: "Débit", // Entrée = Débit (augmentation)
        reference: referenceDest,
        sourceModule: "TRANSFERT",
        agenceId: coffreDest.ownerId,
        statut: "Posté",
        dateOperation: new Date(),
        metadata: {
          transfertInterCoffreId: transfertId,
          type: "ENTREE_COFFRE_RECEPTION",
          coffreSourceId: transfert.coffreSourceId,
          coffreDestId: transfert.coffreDestinationId,
          ecart,
        },
      })
      .returning();

    // 4. Créditer le coffre destination (atomique)
    await tx
      .update(coffresForts)
      .set({
        solde: sql`${coffresForts.solde} + ${montantRecu}`,
        updatedAt: new Date(),
      })
      .where(eq(coffresForts.id, transfert.coffreDestinationId));

    // 5. Créer ou récupérer les comptes de liaison
    let compteLiaisonSource = await getOrCreateCompteLiaison(tx, coffreSource);
    let compteLiaisonDest = await getOrCreateCompteLiaison(tx, coffreDest);

    // 6. Créer la réconciliation
    const statutReconciliation = ecart === 0 ? "Rapproché" : "Écart détecté";
    const [reconciliation] = await tx
      .insert(reconciliationsLiaison)
      .values({
        compteLiaisonSourceId: compteLiaisonSource?.id,
        compteLiaisonDestId: compteLiaisonDest?.id,
        transfertId,
        montant: montantRecu.toString(),
        dateOperation: transfert.dateComptable || new Date().toISOString().split("T")[0],
        statut: statutReconciliation,
        dateRapprochement: ecart === 0 ? new Date() : null,
        rapprochePar: ecart === 0 ? userId : null,
      })
      .returning();

    // 7. Gestion des écarts - Créer une tâche de régularisation si nécessaire
    let tacheId: string | undefined;
    if (ecart !== 0) {
      const priorite = Math.abs(ecart) > 100000 ? "Critique" : Math.abs(ecart) > 50000 ? "Haute" : "Normale";
      const [tache] = await tx
        .insert(tachesRegularisation)
        .values({
          transfertId,
          type: "ECART_RECEPTION",
          description: `Écart de ${ecart.toLocaleString()} ${transfert.devise} sur transfert ${transfert.reference}. Attendu: ${montantAttendu.toLocaleString()}, Reçu: ${montantRecu.toLocaleString()}`,
          montantEcart: ecart.toString(),
          priorite,
          statut: "Ouverte",
        })
        .returning();
      tacheId = tache.id;
    }

    // 8. Mettre à jour le transfert
    const now = new Date();
    const nouveauStatut = data.conforme ? "Reçu" : "Reçu avec écart";

    await tx
      .update(transfertsInterCoffres)
      .set({
        statut: nouveauStatut,
        receivedBy: userId,
        receivedAt: now,
        heureReception: data.heureReception,
        montantRecu: montantRecu.toString(),
        conforme: data.conforme,
        commentaireReception: data.commentaire,
        ecartMontant: ecart !== 0 ? ecart.toString() : null,
        motifEcart: data.motifEcart,
        mouvementDestinationId: mouvementDest.id,
        updatedAt: now,
      })
      .where(eq(transfertsInterCoffres.id, transfertId));

    // 9. Log d'audit
    const action = data.conforme ? "RECEIVED" : "RECEIVED_WITH_DISCREPANCY";
    await tx.insert(transfertsInterCoffresAuditLogs).values({
      transfertId,
      action,
      statutAvant: "En transit",
      statutApres: nouveauStatut,
      details: {
        mouvementDestId: mouvementDest.id,
        montantAttendu,
        montantRecu,
        ecart,
        conforme: data.conforme,
        reconciliationId: reconciliation.id,
        tacheId,
      },
      userId,
      userRole,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      mouvementDestId: mouvementDest.id,
      reconciliationId: reconciliation.id,
      tacheId,
      ecart,
    };
  });
}

/**
 * Récupère ou crée un compte de liaison pour un coffre
 */
async function getOrCreateCompteLiaison(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  coffre: typeof coffresForts.$inferSelect
) {
  // Chercher un compte existant
  const conditions = coffre.ownerType === "SIEGE"
    ? eq(comptesLiaison.entiteType, "SIEGE")
    : eq(comptesLiaison.entiteId, coffre.ownerId!);

  const [existing] = await tx
    .select()
    .from(comptesLiaison)
    .where(conditions);

  if (existing) return existing;

  // Créer un nouveau compte
  const code = coffre.ownerType === "SIEGE"
    ? "LIAISON-SIEGE"
    : `LIAISON-${coffre.code}`;

  const intitule = coffre.ownerType === "SIEGE"
    ? "Compte de liaison - Siège"
    : `Compte de liaison - ${coffre.nom}`;

  const numeroComptable = coffre.ownerType === "SIEGE"
    ? "581200"
    : `581200`; // Même compte, différencié par entité

  const [nouveau] = await tx
    .insert(comptesLiaison)
    .values({
      code,
      intitule,
      numeroComptable,
      entiteType: coffre.ownerType,
      entiteId: coffre.ownerId,
    })
    .returning();

  return nouveau;
}

/**
 * Met à jour le solde d'un coffre (utilitaire)
 */
export async function updateCoffreSolde(
  coffreId: string,
  montant: number,
  operation: "add" | "subtract"
) {
  const operator = operation === "add" ? sql`+` : sql`-`;

  await db
    .update(coffresForts)
    .set({
      solde: sql`${coffresForts.solde} ${operator} ${montant}`,
      updatedAt: new Date(),
    })
    .where(eq(coffresForts.id, coffreId));
}
