/**
 * Factures liées aux comptes : dépôt, retrait, tontine et dépôt initial.
 *
 * - createFactureForDepot
 * - createFactureForRetrait
 * - createFactureForContributionTontine
 * - createFactureForDepotInitial
 */
import {
  StatutFacture,
  TypeCompte,
  TypeDocument,
} from "@shared/enum/status-constants";
import {
  factures,
  lignesFactures,
  modelesFactures,
  transactionsCompte,
  type Facture,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { getModeleFactureByCode, incrementModeleFactureNumero } from "../factures";


/**
 * Créer un reçu pour un dépôt sur compte.
 */
export async function createFactureForDepot(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  transactionId?: string; // Pour lier la facture à la transaction
}): Promise<Facture> {
  // Mapping TypeCompte vers code facture
  const codeMap: Record<string, string> = {
    [TypeCompte.SAVINGS]: 'DEPOT_EPARGNE',
    [TypeCompte.CURRENT]: 'DEPOT_COURANT',
    [TypeCompte.BLOCKED]: 'DEPOT_BLOQUE',
  };
  const code = codeMap[data.typeCompte] || 'DEPOT_EPARGNE';
  
  let modele = await getModeleFactureByCode(code);
  if (!modele) {
    const prefixMap: Record<string, string> = {
      'DEPOT_EPARGNE': 'DEP-EPG',
      'DEPOT_COURANT': 'DEP-CRT',
      'DEPOT_BLOQUE': 'DEP-BLQ',
    };
    [modele] = await db.insert(modelesFactures).values({
      nom: `Reçu Dépôt ${data.typeCompte}`,
      code,
      description: `Reçu de dépôt sur compte ${data.typeCompte.toLowerCase()}`,
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: prefixMap[code],
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du dépôt effectué sur votre compte.",
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
    notes: `Dépôt sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: data.typeCompte === TypeCompte.CURRENT ? "DEPOSIT_CURRENT" :
                   data.typeCompte === TypeCompte.BLOCKED ? "DEPOSIT_BLOCKED" : "DEPOSIT_SAVINGS",
    referenceId: data.compteId,
  });
  
  // Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}


/**
 * Créer un reçu pour un retrait sur compte.
 */
export async function createFactureForRetrait(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
  transactionId?: string;
}): Promise<Facture> {
  // Mapping TypeCompte vers code facture
  const codeMap: Record<string, string> = {
    [TypeCompte.SAVINGS]: 'RETRAIT_EPARGNE',
    [TypeCompte.CURRENT]: 'RETRAIT_COURANT',
    [TypeCompte.BLOCKED]: 'RETRAIT_BLOQUE',
  };
  const code = codeMap[data.typeCompte] || 'RETRAIT_EPARGNE';
  
  let modele = await getModeleFactureByCode(code);
  if (!modele) {
    const prefixMap: Record<string, string> = {
      'RETRAIT_EPARGNE': 'RET-EPG',
      'RETRAIT_COURANT': 'RET-CRT',
      'RETRAIT_BLOQUE': 'RET-BLQ',
    };
    [modele] = await db.insert(modelesFactures).values({
      nom: `Reçu Retrait ${data.typeCompte}`,
      code,
      description: `Reçu de retrait sur compte ${data.typeCompte.toLowerCase()}`,
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: prefixMap[code],
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du retrait effectué sur votre compte.",
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
    notes: `Retrait sur compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Retrait - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: data.typeCompte === TypeCompte.CURRENT ? "WITHDRAWAL_CURRENT" :
                   data.typeCompte === TypeCompte.BLOCKED ? "WITHDRAWAL_BLOCKED" : "WITHDRAWAL_SAVINGS",
    referenceId: data.compteId,
  });
  
  // Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}


/**
 * Créer un reçu pour une contribution tontine.
 */
export async function createFactureForContributionTontine(data: {
  tontineId: string;
  nomTontine: string;
  clientId: string;
  montant: string;
  tourNumero: number;
  agentId?: string;
  operationCaisseId?: string;
  sessionCaisseId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('CONTRIBUTION_TONTINE');
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Contribution Tontine",
      code: 'CONTRIBUTION_TONTINE',
      description: "Reçu de contribution tontine",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'CTB-TON',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste de votre contribution à la tontine.",
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
    notes: `Contribution tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
  }).returning();

  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Contribution - Tontine "${data.nomTontine}" - Tour ${data.tourNumero}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "TONTINE_CONTRIBUTION",
    referenceId: data.tontineId,
  });
  
  return facture;
}


/**
 * Créer un reçu pour le dépôt initial lors de l'ouverture de compte.
 */
export async function createFactureForDepotInitial(data: {
  compteId: string;
  numeroCompte: string;
  clientId: string;
  montant: string;
  typeCompte: string;
  modePaiement: string;
  transactionId?: string;
  agentId?: string;
}): Promise<Facture> {
  let modele = await getModeleFactureByCode('DEPOT_INITIAL');
  
  if (!modele) {
    [modele] = await db.insert(modelesFactures).values({
      nom: "Reçu Dépôt Initial - Ouverture de Compte",
      code: 'DEPOT_INITIAL',
      description: "Reçu de dépôt initial lors de l'ouverture de compte",
      typeDocument: TypeDocument.RECEIPT,
      prefixeNumero: 'DI',
      dernierNumero: 0,
      mentionsLegales: "Ce reçu atteste du dépôt initial effectué lors de l'ouverture de votre compte.",
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
    modePaiement: data.modePaiement,
    notes: `Dépôt initial - Ouverture compte ${data.typeCompte} N° ${data.numeroCompte}`,
  }).returning();
  
  await db.insert(lignesFactures).values({
    factureId: facture.id,
    description: `Dépôt Initial - Compte ${data.typeCompte} N° ${data.numeroCompte}`,
    quantite: 1,
    prixUnitaire: data.montant,
    montant: data.montant,
    typeOperation: "INITIAL_DEPOSIT",
    referenceId: data.compteId,
  });
  
  // Lier la facture à la transaction
  if (data.transactionId) {
    await db.update(transactionsCompte)
      .set({ factureId: facture.id })
      .where(eq(transactionsCompte.id, data.transactionId));
  }
  
  return facture;
}
