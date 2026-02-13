import { db } from "../../db";
import { eq, and, or, desc, asc, gte, lte, ilike, count, sql, isNull } from "drizzle-orm";
import {
  coffresForts,
  transfertsInterCoffres,
  transfertsInterCoffresAuditLogs,
  documentsTransfert,
  reconciliationsLiaison,
  tachesRegularisation,
  configTransfertInterCoffres,
  agences,
  users,
  userRoles,
} from "@shared/schema";
import { TransfertInterCoffresValidator, UserContext, ValidationResult } from "./business-rules";
import { executeDispatch, executeReceive } from "./transfer-executor";
import { generateReference } from "../ledger";
import { currencyCode } from "@shared/config/currency";

interface ServiceResult<T = any> {
  success: boolean;
  errorCode?: string;
  error?: string;
  transfert?: T;
  document?: any;
  alreadyExists?: boolean;
  data?: any;
}

interface ListParams {
  page?: number;
  limit?: number;
  statut?: string;
  coffreSourceId?: string;
  coffreDestinationId?: string;
  dateDebut?: string;
  dateFin?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export class TransfertInterCoffresService {
  private validator = new TransfertInterCoffresValidator();

  /**
   * Génère un numéro de référence unique pour un transfert
   */
  private generateTransfertReference(): string {
    const { randomBytes } = require('crypto');
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const random = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    return `TIC-${dateStr}-${random}`;
  }

  /**
   * Génère un numéro de document unique
   */
  private generateDocumentNumber(type: "BON_TRANSFERT" | "BON_SORTIE" | "BON_ENTREE"): string {
    const { randomBytes } = require('crypto');
    const prefixes = {
      BON_TRANSFERT: "BT",
      BON_SORTIE: "BS",
      BON_ENTREE: "BE",
    };
    const year = new Date().getFullYear();
    const random = randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
    return `${prefixes[type]}-${year}-${random}`;
  }

  /**
   * Détermine le type de transfert basé sur les coffres
   */
  private async determineTransferType(
    coffreSourceId: string,
    coffreDestinationId: string
  ): Promise<"AGENCE_VERS_SIEGE" | "AGENCE_VERS_AGENCE" | "SIEGE_VERS_AGENCE"> {
    const [source] = await db.select().from(coffresForts).where(eq(coffresForts.id, coffreSourceId));
    const [dest] = await db.select().from(coffresForts).where(eq(coffresForts.id, coffreDestinationId));

    if (source.ownerType === "AGENCE" && dest.ownerType === "SIEGE") {
      return "AGENCE_VERS_SIEGE";
    } else if (source.ownerType === "SIEGE" && dest.ownerType === "AGENCE") {
      return "SIEGE_VERS_AGENCE";
    } else {
      return "AGENCE_VERS_AGENCE";
    }
  }

  /**
   * Crée un brouillon de transfert
   */
  async createTransfert(params: {
    coffreSourceId: string;
    coffreDestinationId: string;
    montant: number;
    devise?: string;
    motif: string;
    typeConditionnement: string;
    numeroScelle?: string;
    agentsTransport: Array<{ userId?: string; nom: string; contact: string }>;
    heureDepart?: string;
    dateTransfert?: string;
    userId: string;
    userRole: string;
    idempotencyKey?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ServiceResult> {
    const {
      coffreSourceId,
      coffreDestinationId,
      montant,
      devise = currencyCode(),
      motif,
      typeConditionnement,
      numeroScelle,
      agentsTransport,
      heureDepart,
      dateTransfert,
      userId,
      userRole,
      idempotencyKey,
      ipAddress,
      userAgent,
    } = params;

    // Vérifier idempotence
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(transfertsInterCoffres)
        .where(eq(transfertsInterCoffres.idempotencyKey, idempotencyKey));

      if (existing) {
        return { success: true, transfert: existing, alreadyExists: true };
      }
    }

    // Récupérer le coffre source pour l'agence ID
    const [coffreSource] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, coffreSourceId));

    const agenceId = coffreSource?.ownerId;

    // Vérifier les permissions
    const user: UserContext = { id: userId, role: userRole, agenceId: agenceId || undefined };
    const canCreateResult = await this.validator.canCreate(user, agenceId || undefined);
    if (!canCreateResult.valid) {
      return { success: false, errorCode: canCreateResult.errorCode, error: canCreateResult.error };
    }

    // Valider les données
    const validationResult = await this.validator.validateCreation({
      coffreSourceId,
      coffreDestinationId,
      montant,
      devise,
      typeConditionnement,
      numeroScelle,
      motif,
      agentsTransport,
    }, agenceId || undefined);

    if (!validationResult.valid) {
      return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
    }

    // Déterminer le type de transfert
    const typeTransfert = await this.determineTransferType(coffreSourceId, coffreDestinationId);

    // Générer la référence
    const reference = this.generateTransfertReference();

    // Créer le transfert
    const [transfert] = await db
      .insert(transfertsInterCoffres)
      .values({
        reference,
        dateTransfert: dateTransfert || new Date().toISOString().split("T")[0],
        heureDepart,
        coffreSourceId,
        coffreDestinationId,
        montant: montant.toString(),
        devise,
        typeTransfert,
        typeConditionnement: typeConditionnement as any,
        numeroScelle,
        motif,
        statut: "DRAFT",
        createdBy: userId,
        agentsTransport,
        idempotencyKey,
      })
      .returning();

    // Log d'audit
    await db.insert(transfertsInterCoffresAuditLogs).values({
      transfertId: transfert.id,
      action: "CREATED",
      statutAvant: null,
      statutApres: "DRAFT",
      details: {
        coffreSourceId,
        coffreDestinationId,
        montant,
        typeTransfert,
        agentsTransport,
      },
      userId,
      userRole,
      ipAddress,
      userAgent,
    });

    return { success: true, transfert };
  }

  /**
   * Soumet un transfert pour approbation
   */
  async submitTransfert(params: {
    transfertId: string;
    userId: string;
    userRole: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ServiceResult> {
    const { transfertId, userId, userRole, ipAddress, userAgent } = params;

    const [transfert] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
    }

    if (transfert.statut !== "DRAFT") {
      return { success: false, errorCode: "TIC_020", error: `Impossible de soumettre un transfert en statut "${transfert.statut}"` };
    }

    // Re-valider les données avant soumission
    const [coffreSource] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreSourceId));
    const validationResult = await this.validator.validateCreation({
      coffreSourceId: transfert.coffreSourceId,
      coffreDestinationId: transfert.coffreDestinationId,
      montant: parseFloat(transfert.montant?.toString() || "0"),
      devise: transfert.devise,
      typeConditionnement: transfert.typeConditionnement,
      numeroScelle: transfert.numeroScelle || undefined,
      motif: transfert.motif,
      agentsTransport: transfert.agentsTransport as any,
    }, coffreSource?.ownerId || undefined);

    if (!validationResult.valid) {
      return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
    }

    const now = new Date();

    // Mettre à jour le transfert
    const [updated] = await db
      .update(transfertsInterCoffres)
      .set({
        statut: "SUBMITTED",
        submittedBy: userId,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(transfertsInterCoffres.id, transfertId))
      .returning();

    // Générer le Bon de Transfert
    const documentNumber = this.generateDocumentNumber("BON_TRANSFERT");
    const [document] = await db
      .insert(documentsTransfert)
      .values({
        transfertId,
        typeDocument: "BON_TRANSFERT",
        numeroDocument: documentNumber,
        generatedBy: userId,
        contenuData: {
          reference: updated.reference,
          dateTransfert: updated.dateTransfert,
          montant: updated.montant,
          devise: updated.devise,
          motif: updated.motif,
          typeConditionnement: updated.typeConditionnement,
          numeroScelle: updated.numeroScelle,
          agentsTransport: updated.agentsTransport,
          coffreSourceId: updated.coffreSourceId,
          coffreDestinationId: updated.coffreDestinationId,
          submittedAt: now.toISOString(),
        },
      })
      .returning();

    // Log d'audit
    await db.insert(transfertsInterCoffresAuditLogs).values({
      transfertId,
      action: "SUBMITTED",
      statutAvant: "DRAFT",
      statutApres: "SUBMITTED",
      details: { documentId: document.id, documentNumber },
      userId,
      userRole,
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      transfert: updated,
      document: { id: document.id, type: "BON_TRANSFERT", numero: documentNumber },
    };
  }

  /**
   * Approuve un transfert (niveau 1 ou 2)
   */
  async approveTransfert(params: {
    transfertId: string;
    level: 1 | 2;
    approved: boolean;
    commentaire?: string;
    rejectionReason?: string;
    userId: string;
    userRole: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ServiceResult> {
    const { transfertId, level, approved, commentaire, rejectionReason, userId, userRole, ipAddress, userAgent } = params;

    const [transfert] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
    }

    // Récupérer l'agence ID pour la config
    const [coffreSource] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreSourceId));
    const agenceId = coffreSource?.ownerId;

    const user: UserContext = { id: userId, role: userRole, agenceId: agenceId || undefined };

    // Vérifier les permissions selon le niveau
    let validationResult: ValidationResult;
    let expectedStatus: string;
    let newStatus: string;

    if (level === 1) {
      if (transfert.statut !== "SUBMITTED") {
        return { success: false, errorCode: "TIC_020", error: `Impossible d'approuver niveau 1 un transfert en statut "${transfert.statut}"` };
      }
      validationResult = await this.validator.canApproveLevel1(user, transfert, agenceId || undefined);
      expectedStatus = "SUBMITTED";
      newStatus = approved ? "APPROVED_L1" : "REJECTED";
    } else {
      if (transfert.statut !== "APPROVED_L1") {
        return { success: false, errorCode: "TIC_020", error: `Impossible d'approuver niveau 2 un transfert en statut "${transfert.statut}"` };
      }
      validationResult = await this.validator.canApproveLevel2(user, transfert, agenceId || undefined);
      expectedStatus = "APPROVED_L1";
      newStatus = approved ? "APPROVED_L2" : "REJECTED";
    }

    if (!validationResult.valid) {
      return { success: false, errorCode: validationResult.errorCode, error: validationResult.error };
    }

    // Si rejet, vérifier le motif
    if (!approved && (!rejectionReason || rejectionReason.trim().length < 10)) {
      return { success: false, errorCode: "TIC_025", error: "Le motif de rejet doit contenir au moins 10 caractères" };
    }

    const now = new Date();
    const updateData: any = {
      statut: newStatus,
      updatedAt: now,
    };

    if (level === 1) {
      updateData.approvedByLevel1 = userId;
      updateData.approvedAtLevel1 = now;
      updateData.commentaireN1 = commentaire;
    } else {
      updateData.approvedByLevel2 = userId;
      updateData.approvedAtLevel2 = now;
      updateData.commentaireN2 = commentaire;
    }

    if (!approved) {
      updateData.rejectionReason = rejectionReason;
      updateData.rejectedBy = userId;
      updateData.rejectedAt = now;
    }

    const [updated] = await db
      .update(transfertsInterCoffres)
      .set(updateData)
      .where(eq(transfertsInterCoffres.id, transfertId))
      .returning();

    // Log d'audit
    const action = approved ? (level === 1 ? "APPROVED_L1" : "APPROVED_L2") : "REJECTED";
    await db.insert(transfertsInterCoffresAuditLogs).values({
      transfertId,
      action,
      statutAvant: expectedStatus,
      statutApres: newStatus,
      details: {
        level,
        approved,
        commentaire,
        rejectionReason: !approved ? rejectionReason : null,
      },
      userId,
      userRole,
      ipAddress,
      userAgent,
    });

    return { success: true, transfert: updated };
  }

  /**
   * Dispatche un transfert (départ en transit)
   */
  async dispatchTransfert(params: {
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

    // Exécuter le dispatch (débite le coffre source)
    const result = await executeDispatch(transfertId, userId, userRole, ipAddress, userAgent);

    if (!result.success) {
      return result;
    }

    // Mettre à jour l'heure de départ si fournie
    if (heureDepart) {
      await db
        .update(transfertsInterCoffres)
        .set({ heureDepart })
        .where(eq(transfertsInterCoffres.id, transfertId));
    }

    // Générer le Bon de Sortie
    const [updatedTransfert] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    const documentNumber = this.generateDocumentNumber("BON_SORTIE");
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

  /**
   * Réceptionne un transfert
   */
  async receiveTransfert(params: {
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

    // Récupérer l'agence destination pour la config
    const [coffreDest] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreDestinationId));
    const agenceId = coffreDest?.ownerId;

    // Vérifier les permissions
    const user: UserContext = { id: userId, role: userRole, agenceId: agenceId || undefined };
    const canReceiveResult = await this.validator.canReceive(user, transfert, agenceId || undefined);
    if (!canReceiveResult.valid) {
      return { success: false, errorCode: canReceiveResult.errorCode, error: canReceiveResult.error };
    }

    // Si non conforme, vérifier le motif
    if (!conforme && (!motifEcart || motifEcart.trim().length < 10)) {
      return { success: false, errorCode: "TIC_027", error: "Le motif d'écart doit contenir au moins 10 caractères pour une réception non conforme" };
    }

    // Exécuter la réception
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

    // Générer le Bon d'Entrée
    const [updatedTransfert] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    const documentNumber = this.generateDocumentNumber("BON_ENTREE");
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

  /**
   * Annule un transfert
   */
  async cancelTransfert(params: {
    transfertId: string;
    reason: string;
    userId: string;
    userRole: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ServiceResult> {
    const { transfertId, reason, userId, userRole, ipAddress, userAgent } = params;

    const [transfert] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
    }

    // Vérifier les permissions
    const user: UserContext = { id: userId, role: userRole };
    const canCancelResult = await this.validator.canCancel(user, transfert);
    if (!canCancelResult.valid) {
      return { success: false, errorCode: canCancelResult.errorCode, error: canCancelResult.error };
    }

    // Vérifier le motif
    if (!reason || reason.trim().length < 10) {
      return { success: false, errorCode: "TIC_025", error: "Le motif d'annulation doit contenir au moins 10 caractères" };
    }

    const now = new Date();
    const statutAvant = transfert.statut;

    const [updated] = await db
      .update(transfertsInterCoffres)
      .set({
        statut: "CANCELLED",
        cancellationReason: reason,
        cancelledBy: userId,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(transfertsInterCoffres.id, transfertId))
      .returning();

    // Log d'audit
    await db.insert(transfertsInterCoffresAuditLogs).values({
      transfertId,
      action: "CANCELLED",
      statutAvant,
      statutApres: "CANCELLED",
      details: { reason },
      userId,
      userRole,
      ipAddress,
      userAgent,
    });

    return { success: true, transfert: updated };
  }

  /**
   * Récupère les détails d'un transfert
   */
  async getTransfertDetails(transfertId: string) {
    const [transfert] = await db
      .select()
      .from(transfertsInterCoffres)
      .where(eq(transfertsInterCoffres.id, transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TIC_050", error: "Transfert introuvable" };
    }

    // Récupérer les coffres
    const [coffreSource] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreSourceId));
    const [coffreDest] = await db.select().from(coffresForts).where(eq(coffresForts.id, transfert.coffreDestinationId));

    // Récupérer les agences
    let agenceSource = null;
    let agenceDest = null;
    if (coffreSource?.ownerId) {
      [agenceSource] = await db.select().from(agences).where(eq(agences.id, coffreSource.ownerId));
    }
    if (coffreDest?.ownerId) {
      [agenceDest] = await db.select().from(agences).where(eq(agences.id, coffreDest.ownerId));
    }

    // Récupérer les documents
    const documents = await db
      .select()
      .from(documentsTransfert)
      .where(eq(documentsTransfert.transfertId, transfertId))
      .orderBy(asc(documentsTransfert.dateGeneration));

    // Récupérer les logs d'audit
    const auditLogs = await db
      .select()
      .from(transfertsInterCoffresAuditLogs)
      .where(eq(transfertsInterCoffresAuditLogs.transfertId, transfertId))
      .orderBy(asc(transfertsInterCoffresAuditLogs.timestamp));

    // Récupérer la réconciliation
    const [reconciliation] = await db
      .select()
      .from(reconciliationsLiaison)
      .where(eq(reconciliationsLiaison.transfertId, transfertId));

    // Récupérer la tâche de régularisation
    const [tache] = await db
      .select()
      .from(tachesRegularisation)
      .where(eq(tachesRegularisation.transfertId, transfertId));

    // Récupérer les noms des utilisateurs impliqués
    const userIds = [
      transfert.createdBy,
      transfert.submittedBy,
      transfert.approvedByLevel1,
      transfert.approvedByLevel2,
      transfert.dispatchedBy,
      transfert.receivedBy,
      transfert.rejectedBy,
      transfert.cancelledBy,
    ].filter(Boolean) as string[];

    const usersData = userIds.length > 0
      ? await db.select({ id: users.id, nom: users.nom, prenom: users.prenom, role: userRoles.role })
          .from(users)
          .leftJoin(userRoles, and(
            eq(userRoles.userId, users.id),
            eq(userRoles.isPrimary, true)
          ))
          .where(sql`${users.id} IN ${userIds}`)
      : [];

    const usersMap = new Map(usersData.map(u => [u.id, u]));

    return {
      success: true,
      transfert: {
        ...transfert,
        coffreSource: {
          ...coffreSource,
          agence: agenceSource,
        },
        coffreDestination: {
          ...coffreDest,
          agence: agenceDest,
        },
        createdByUser: usersMap.get(transfert.createdBy),
        submittedByUser: transfert.submittedBy ? usersMap.get(transfert.submittedBy) : null,
        approvedByLevel1User: transfert.approvedByLevel1 ? usersMap.get(transfert.approvedByLevel1) : null,
        approvedByLevel2User: transfert.approvedByLevel2 ? usersMap.get(transfert.approvedByLevel2) : null,
        dispatchedByUser: transfert.dispatchedBy ? usersMap.get(transfert.dispatchedBy) : null,
        receivedByUser: transfert.receivedBy ? usersMap.get(transfert.receivedBy) : null,
      },
      documents,
      auditLogs,
      reconciliation,
      tache,
    };
  }

  /**
   * Liste les transferts avec filtres et pagination
   */
  async listTransferts(params: ListParams) {
    const {
      page = 1,
      limit = 20,
      statut,
      coffreSourceId,
      coffreDestinationId,
      dateDebut,
      dateFin,
      search,
      sortBy = "dateTransfert",
      sortOrder = "desc",
    } = params;

    const offset = (page - 1) * limit;
    const conditions = [];

    if (statut && statut !== "all") {
      conditions.push(eq(transfertsInterCoffres.statut, statut as any));
    }
    if (coffreSourceId) {
      conditions.push(eq(transfertsInterCoffres.coffreSourceId, coffreSourceId));
    }
    if (coffreDestinationId) {
      conditions.push(eq(transfertsInterCoffres.coffreDestinationId, coffreDestinationId));
    }
    if (dateDebut) {
      conditions.push(gte(transfertsInterCoffres.dateTransfert, dateDebut));
    }
    if (dateFin) {
      conditions.push(lte(transfertsInterCoffres.dateTransfert, dateFin));
    }
    if (search) {
      conditions.push(
        or(
          ilike(transfertsInterCoffres.reference, `%${search}%`),
          ilike(transfertsInterCoffres.motif, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Requête pour les données
    let query = db
      .select({
        transfert: transfertsInterCoffres,
        coffreSource: coffresForts,
      })
      .from(transfertsInterCoffres)
      .leftJoin(coffresForts, eq(transfertsInterCoffres.coffreSourceId, coffresForts.id));

    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }

    // Tri
    const sortColumn = sortBy === "montant"
      ? transfertsInterCoffres.montant
      : sortBy === "reference"
        ? transfertsInterCoffres.reference
        : transfertsInterCoffres.dateTransfert;

    query = query.orderBy(sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn)) as typeof query;
    query = query.limit(limit).offset(offset) as typeof query;

    const results = await query;

    // Compter le total
    const [countResult] = await db
      .select({ count: count() })
      .from(transfertsInterCoffres)
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    // Enrichir avec les coffres destination
    const transfertsEnriched = await Promise.all(
      results.map(async (r) => {
        const [coffreDest] = await db
          .select()
          .from(coffresForts)
          .where(eq(coffresForts.id, r.transfert.coffreDestinationId));

        // Récupérer les noms des agences
        let agenceSourceNom = null;
        let agenceDestNom = null;

        if (r.coffreSource?.ownerId) {
          const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, r.coffreSource.ownerId));
          agenceSourceNom = agence?.nom;
        } else if (r.coffreSource?.ownerType === "SIEGE") {
          agenceSourceNom = "Siège";
        }

        if (coffreDest?.ownerId) {
          const [agence] = await db.select({ nom: agences.nom }).from(agences).where(eq(agences.id, coffreDest.ownerId));
          agenceDestNom = agence?.nom;
        } else if (coffreDest?.ownerType === "SIEGE") {
          agenceDestNom = "Siège";
        }

        return {
          ...r.transfert,
          coffreSource: {
            ...r.coffreSource,
            agenceNom: agenceSourceNom,
          },
          coffreDestination: {
            ...coffreDest,
            agenceNom: agenceDestNom,
          },
        };
      })
    );

    // Statistiques
    const allTransferts = await db
      .select({ statut: transfertsInterCoffres.statut, montant: transfertsInterCoffres.montant })
      .from(transfertsInterCoffres)
      .where(whereClause);

    const stats = {
      total: allTransferts.length,
      parStatut: allTransferts.reduce((acc, t) => {
        acc[t.statut] = (acc[t.statut] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      montantTotal: allTransferts.reduce((sum, t) => sum + parseFloat(t.montant?.toString() || "0"), 0),
    };

    return {
      success: true,
      transferts: transfertsEnriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  /**
   * Récupère les documents d'un transfert
   */
  async getDocuments(transfertId: string) {
    const documents = await db
      .select()
      .from(documentsTransfert)
      .where(eq(documentsTransfert.transfertId, transfertId))
      .orderBy(asc(documentsTransfert.dateGeneration));

    return { success: true, documents };
  }

  /**
   * Récupère les logs d'audit d'un transfert
   */
  async getAuditLogs(transfertId: string) {
    const logs = await db
      .select()
      .from(transfertsInterCoffresAuditLogs)
      .where(eq(transfertsInterCoffresAuditLogs.transfertId, transfertId))
      .orderBy(desc(transfertsInterCoffresAuditLogs.timestamp));

    return { success: true, auditLogs: logs };
  }

  /**
   * Statistiques des transferts par statut (comptage + montants)
   */
  async getTransfertStats() {
    const sumMontant = sql<string>`coalesce(sum(${transfertsInterCoffres.montant}), 0)`;

    const rows = await db
      .select({
        statut: transfertsInterCoffres.statut,
        count: count(),
        montant: sumMontant,
      })
      .from(transfertsInterCoffres)
      .groupBy(transfertsInterCoffres.statut);

    const byStatus: Record<string, { count: number; montant: string }> = {};
    let total = 0;
    let totalMontant = 0;
    for (const row of rows) {
      byStatus[row.statut] = { count: Number(row.count), montant: row.montant };
      total += Number(row.count);
      totalMontant += parseFloat(row.montant || "0");
    }

    return {
      success: true,
      data: { total, totalMontant: totalMontant.toString(), byStatus },
    };
  }
}
