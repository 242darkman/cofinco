import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  documentsTransfert,
} from "@shared/schema";
import { TransfertInterCoffresValidator, type UserContext } from "./business-rules";
import { executeDispatch } from "./execute-dispatch";
import { executeReceive } from "./execute-receive";
import type { ServiceResult } from "./types";
import { generateDocumentNumber } from "./transfert-creation";

const validator = new TransfertInterCoffresValidator();

export async function dispatchTransfert(params: {
  transfertId: string;
  heureDepart?: string;
  commentaire?: string;
  userId: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const { transfertId, heureDepart, commentaire, userId, userRole, ipAddress, userAgent } = params;

  const [transfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  if (!transfert) {
    return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
  }

  if (transfert.statut !== "APPROVED_L2") {
    return { success: false, errorCode: "TIC_020", error: `Impossible de dispatcher un transfert en statut "${transfert.statut}"` };
  }

  const result = await executeDispatch(transfertId, userId, userRole, ipAddress, userAgent);

  if (!result.success) {
    return result;
  }

  if (heureDepart) {
    await db
      .update(transfertsInterCoffres)
      .set({ heureDepart })
      .where(eq(transfertsInterCoffres.id, transfertId));
  }

  const [updatedTransfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  const documentNumber = generateDocumentNumber("BON_SORTIE");
  const [document] = await db
    .insert(documentsTransfert)
    .values({
      transfertId,
      typeDocument: "BON_SORTIE",
      numeroDocument: documentNumber,
      generatedBy: userId,
      contenuData: {
        reference: updatedTransfert.reference,
        dateTransfert: updatedTransfert.dateTransfert,
        heureDepart: heureDepart || updatedTransfert.heureDepart,
        montant: updatedTransfert.montant,
        devise: updatedTransfert.devise,
        coffreSourceId: updatedTransfert.coffreSourceId,
        coffreDestinationId: updatedTransfert.coffreDestinationId,
        typeConditionnement: updatedTransfert.typeConditionnement,
        numeroScelle: updatedTransfert.numeroScelle,
        agentsTransport: updatedTransfert.agentsTransport,
        dispatchedAt: new Date().toISOString(),
        dispatchedBy: userId,
      },
    })
    .returning();

  return {
    success: true,
    transfert: updatedTransfert,
    document: { id: document.id, type: "BON_SORTIE", numero: documentNumber },
  };
}

export async function receiveTransfert(params: {
  transfertId: string;
  montantRecu: number;
  conforme: boolean;
  commentaire?: string;
  motifEcart?: string;
  heureReception?: string;
  userId: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<ServiceResult> {
  const { transfertId, montantRecu, conforme, commentaire, motifEcart, heureReception, userId, userRole, ipAddress, userAgent } = params;

  const [transfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  if (!transfert) {
    return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
  }

  const [coffreDest] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreDestinationId));
  const agenceId = coffreDest?.ownerId;

  const user: UserContext = { id: userId, role: userRole, agenceId: agenceId || undefined };
  const canReceiveResult = await validator.canReceive(user, transfert, agenceId || undefined);
  if (!canReceiveResult.valid) {
    return { success: false, errorCode: canReceiveResult.errorCode, error: canReceiveResult.error };
  }

  if (!conforme && (!motifEcart || motifEcart.trim().length < 10)) {
    return { success: false, errorCode: "TIC_027", error: "Le motif d'écart doit contenir au moins 10 caractères pour une réception non conforme" };
  }

  const result = await executeReceive(
    transfertId,
    userId,
    userRole,
    { montantRecu, conforme, commentaire, motifEcart, heureReception },
    ipAddress,
    userAgent
  );

  if (!result.success) {
    return result;
  }

  const [updatedTransfert] = await db
    .select()
    .from(transfertsInterCoffres)
    .where(eq(transfertsInterCoffres.id, transfertId));

  const documentNumber = generateDocumentNumber("BON_ENTREE");
  const [document] = await db
    .insert(documentsTransfert)
    .values({
      transfertId,
      typeDocument: "BON_ENTREE",
      numeroDocument: documentNumber,
      generatedBy: userId,
      contenuData: {
        reference: updatedTransfert.reference,
        dateTransfert: updatedTransfert.dateTransfert,
        heureReception: heureReception || new Date().toTimeString().slice(0, 5),
        montantAttendu: updatedTransfert.montant,
        montantRecu,
        ecart: result.ecart,
        conforme,
        coffreSourceId: updatedTransfert.coffreSourceId,
        coffreDestinationId: updatedTransfert.coffreDestinationId,
        commentaire,
        motifEcart,
        receivedAt: new Date().toISOString(),
        receivedBy: userId,
      },
    })
    .returning();

  return {
    success: true,
    transfert: updatedTransfert,
    document: { id: document.id, type: "BON_ENTREE", numero: documentNumber },
    data: {
      reconciliationId: result.reconciliationId,
      tacheId: result.tacheId,
      ecart: result.ecart,
    },
  };
}
