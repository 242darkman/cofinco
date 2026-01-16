import { db } from "../../db";
import {
  transfertsCoffreCaisse,
  transfertsCoffreAuditLogs,
  caisses,
  coffresForts,
  configCoffreFort,
  users,
  agences,
} from "@shared/schema";
import { eq, and, or, desc, gte, lte, count } from "drizzle-orm";
import { executeTransfertCoffre } from "./transfer-executor";
import { TransfertCoffreValidator } from "./transfert-validator";
import { isAdminRole } from "@shared/types/roles";

export class TransfertCoffreService {
  private validator = new TransfertCoffreValidator();

  // ─────────────────────────────────────────────────────────────────────────
  // Créer une demande de transfert
  // ─────────────────────────────────────────────────────────────────────────
  async createTransfert(params: {
    caisseId: string;
    typeTransfert: "COFFRE_VERS_CAISSE" | "CAISSE_VERS_COFFRE";
    montant: number;
    motif: string;
    commentaire?: string;
    idempotencyKey?: string;
    billetage?: Record<string, number>;
    requestedBy: string;
    agenceId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    // 1. Récupérer ou créer le coffre-fort de l'agence
    const coffreFort = await this.getOrCreateCoffreFort(params.agenceId);

    // 1b. Récupérer la configuration du coffre
    const [config] = await db.select().from(configCoffreFort).where(eq(configCoffreFort.agenceId, params.agenceId));
    
    if (config) {
        // --- CHECK 1: Coffre Actif ---
        if (!config.actif) {
            return { success: false, errorCode: "COFFRE_INACTIF", error: "Le coffre-fort est actuellement désactivé par l'administration." };
        }

        // --- CHECK 2: Limites Montant ---
        const montant = params.montant;
        if (config.montantMinTransfert && montant < parseFloat(config.montantMinTransfert)) {
            return { success: false, errorCode: "MONTANT_MIN_NON_ATTEINT", error: `Le montant minimum est de ${config.montantMinTransfert} FCFA` };
        }
        if (config.montantMaxTransfert && montant > parseFloat(config.montantMaxTransfert)) {
            return { success: false, errorCode: "MONTANT_MAX_DEPASSE", error: `Le montant maximum est de ${config.montantMaxTransfert} FCFA` };
        }

        // --- CHECK 3: Horaires & Jours ---
        const now = new Date();
        const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
        const currentDay = days[now.getDay()];
        
        // Jours Ouvrables
        const joursOuvrables = config.joursOuvrables as string[] || [];
        if (joursOuvrables.length > 0 && !joursOuvrables.includes(currentDay)) {
             return { success: false, errorCode: "JOUR_NON_OUVRE", error: `Opérations non autorisées le ${currentDay}` };
        }

        // Horaires
        const horaires = config.horairesOuverture as { debut: string, fin: string };
        if (horaires && horaires.debut && horaires.fin) {
             const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
             if (currentTime < horaires.debut || currentTime > horaires.fin) {
                 return { success: false, errorCode: "HORS_HORAIRES", error: `Opérations autorisées entre ${horaires.debut} et ${horaires.fin}` };
             }
        }

        // --- CHECK 4: Billetage Obligatoire ---
        if (config.billetageObligatoireSiMontantSup && montant >= parseFloat(config.billetageObligatoireSiMontantSup)) {
            if (!params.billetage || Object.keys(params.billetage).length === 0) {
                 return { success: false, errorCode: "BILLETAGE_REQUIS", error: "Le billetage est obligatoire pour ce montant." };
            }
        }
        
        // --- CHECK 5: Plafond Journalier (Coûteux, fait en dernier) ---
        // TODO: Implémenter la vérification du plafond journalier si nécessaire
        // Cela nécessite d'agréger les transferts du jour pour cette agence
    }
    
    // 2. Récupérer la caisse concernée
    const [caisse] = await db.select().from(caisses).where(eq(caisses.id, params.caisseId));
    if (!caisse) {
      return { success: false, errorCode: "CAISSE_NOT_FOUND", error: "Caisse non trouvée" };
    }

    // 3. Vérifier que la caisse appartient à la même agence
    if (caisse.agenceId !== params.agenceId) {
      return { success: false, errorCode: "PERMISSION_DENIED", error: "La caisse n'appartient pas à votre agence" };
    }

    // 4. Déterminer source et destination
    let caisseSourceId: string;
    let caisseDestinationId: string;

    if (params.typeTransfert === "COFFRE_VERS_CAISSE") {
      caisseSourceId = coffreFort.id;
      caisseDestinationId = params.caisseId;
    } else {
      caisseSourceId = params.caisseId;
      caisseDestinationId = coffreFort.id;
    }

    // 5. Vérifier idempotence
    if (params.idempotencyKey) {
      const [existing] = await db.select()
        .from(transfertsCoffreCaisse)
        .where(eq(transfertsCoffreCaisse.idempotencyKey, params.idempotencyKey));
      
      if (existing) {
        return { success: true, transfert: existing, alreadyExists: true };
      }
    }

    // 6. Générer la référence
    const reference = this.generateTransfertReference(params.typeTransfert);

    // 7. Créer le transfert
    const [transfert] = await db.insert(transfertsCoffreCaisse).values({
      agenceId: params.agenceId,
      typeTransfert: params.typeTransfert,
      caisseSourceId,
      caisseDestinationId,
      montant: params.montant.toString(),
      motif: params.motif,
      commentaire: params.commentaire,
      reference,
      idempotencyKey: params.idempotencyKey,
      billetage: params.billetage,
      statut: "Demandé",
      requestedBy: params.requestedBy,
      requestedAt: new Date(),
    }).returning();

    // 8. Créer l'entrée d'audit
    await db.insert(transfertsCoffreAuditLogs).values({
      transfertId: transfert.id,
      action: "CREATED",
      statutAvant: null,
      statutApres: "Demandé",
      details: {
        typeTransfert: params.typeTransfert,
        montant: params.montant,
        caisseId: params.caisseId,
        coffreId: coffreFort.id,
      },
      userId: params.requestedBy,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { success: true, transfert };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Valider ou rejeter un transfert
  // ─────────────────────────────────────────────────────────────────────────
  async validateTransfert(params: {
    transfertId: string;
    validatorId: string;
    approved: boolean;
    reasonRejection?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const [transfert] = await db.select()
      .from(transfertsCoffreCaisse)
      .where(eq(transfertsCoffreCaisse.id, params.transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TRANSFERT_NOT_FOUND" };
    }

    // Vérifier l'état
    if (transfert.statut !== "Demandé") {
      return { 
        success: false, 
        errorCode: "INVALID_TRANSITION",
        error: `Le transfert doit être en statut 'Demandé' (actuel: ${transfert.statut})`,
      };
    }

    // Récupérer la config pour vérifier les règles de séparation
    const [config] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, transfert.agenceId));

    if (config?.separationInitiateurValideur && transfert.requestedBy === params.validatorId) {
      return {
        success: false,
        errorCode: "SAME_USER_FORBIDDEN",
        error: "Vous ne pouvez pas valider votre propre demande",
      };
    }

    const newStatut = params.approved ? "Validé" : "Rejeté";

    const [updated] = await db.update(transfertsCoffreCaisse)
      .set({
        statut: newStatut as any, // Cast as specific enum string
        validatedBy: params.validatorId,
        validatedAt: new Date(),
        reasonRejection: params.approved ? null : params.reasonRejection,
        updatedAt: new Date(),
      })
      .where(eq(transfertsCoffreCaisse.id, params.transfertId))
      .returning();

    await db.insert(transfertsCoffreAuditLogs).values({
      transfertId: params.transfertId,
      action: params.approved ? "VALIDATED" : "REJECTED",
      statutAvant: "Demandé",
      statutApres: newStatut,
      details: {
        approved: params.approved,
        reasonRejection: params.reasonRejection,
      },
      userId: params.validatorId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { success: true, transfert: updated };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exécuter un transfert
  // ─────────────────────────────────────────────────────────────────────────
  async executeTransfert(params: {
    transfertId: string;
    executorId: string;
    sessionId?: string;
    billetage?: Record<string, number>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      const result = await executeTransfertCoffre(
        params.transfertId,
        params.executorId,
        params.sessionId,
        params.billetage,
        params.ipAddress,
        params.userAgent
      );
      return result;
    } catch (error: any) {
      const errorCode = error.message.split(":")[0];
      return {
        success: false,
        errorCode: errorCode || "INTERNAL_ERROR",
        error: error.message,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Annuler un transfert
  // ─────────────────────────────────────────────────────────────────────────
  async cancelTransfert(params: {
    transfertId: string;
    cancelledBy: string;
    reason: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const [transfert] = await db.select()
      .from(transfertsCoffreCaisse)
      .where(eq(transfertsCoffreCaisse.id, params.transfertId));

    if (!transfert) {
      return { success: false, errorCode: "TRANSFERT_NOT_FOUND" };
    }

    // Seul l'initiateur ou un admin peut annuler
    const [user] = await db.select().from(users).where(eq(users.id, params.cancelledBy));
    const isAdmin = isAdminRole(user?.role);
    
    if (transfert.requestedBy !== params.cancelledBy && !isAdmin) {
      return { success: false, errorCode: "PERMISSION_DENIED", error: "Seul l'initiateur peut annuler" };
    }

    // Vérifier l'état
    if (transfert.statut !== "Demandé") {
      return {
        success: false,
        errorCode: "INVALID_TRANSITION",
        error: "Seuls les transferts en statut 'Demandé' peuvent être annulés",
      };
    }

    const [updated] = await db.update(transfertsCoffreCaisse)
      .set({
        statut: "Annulé",
        reasonRejection: params.reason,
        updatedAt: new Date(),
      })
      .where(eq(transfertsCoffreCaisse.id, params.transfertId))
      .returning();

    await db.insert(transfertsCoffreAuditLogs).values({
      transfertId: params.transfertId,
      action: "CANCELLED",
      statutAvant: "Demandé",
      statutApres: "Annulé",
      details: { reason: params.reason },
      userId: params.cancelledBy,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return { success: true, transfert: updated };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lister les transferts
  // ─────────────────────────────────────────────────────────────────────────
  async listTransferts(params: {
    agenceId: string;
    statut?: string;
    typeTransfert?: string;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  }) {
    const conditions = [eq(transfertsCoffreCaisse.agenceId, params.agenceId)];

    if (params.statut) {
      conditions.push(eq(transfertsCoffreCaisse.statut, params.statut as any));
    }
    if (params.typeTransfert) {
      conditions.push(eq(transfertsCoffreCaisse.typeTransfert, params.typeTransfert as any));
    }
    if (params.from) {
      conditions.push(gte(transfertsCoffreCaisse.createdAt, params.from));
    }
    if (params.to) {
      conditions.push(lte(transfertsCoffreCaisse.createdAt, params.to));
    }

    const offset = (params.page - 1) * params.limit;

    const [countResult] = await db.select({ count: count() })
      .from(transfertsCoffreCaisse)
      .where(and(...conditions));

    const transferts = await db.select()
      .from(transfertsCoffreCaisse)
      .where(and(...conditions))
      .orderBy(desc(transfertsCoffreCaisse.createdAt))
      .limit(params.limit)
      .offset(offset);

    // Enrichir avec les noms des caisses
    const enriched = await Promise.all(transferts.map(async (t) => {
      const [source] = await db.select().from(caisses).where(eq(caisses.id, t.caisseSourceId));
      const [dest] = await db.select().from(caisses).where(eq(caisses.id, t.caisseDestinationId));
      const [requester] = await db.select().from(users).where(eq(users.id, t.requestedBy));
      
      return {
        ...t,
        caisseSourceNom: source?.nom,
        caisseDestinationNom: dest?.nom,
        requestedByNom: requester?.nom,
        requestedByPrenom: requester?.prenom,
      };
    }));

    return {
      data: enriched,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: Number(countResult?.count || 0),
        totalPages: Math.ceil(Number(countResult?.count || 0) / params.limit),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lister les transferts pour une caisse spécifique
  // ─────────────────────────────────────────────────────────────────────────
  async listTransfertsForCaisse(params: {
    caisseId: string;
    statut?: string;
    page: number;
    limit: number;
  }) {
    const conditions = [
      or(
        eq(transfertsCoffreCaisse.caisseSourceId, params.caisseId),
        eq(transfertsCoffreCaisse.caisseDestinationId, params.caisseId)
      ),
    ];

    if (params.statut) {
      conditions.push(eq(transfertsCoffreCaisse.statut, params.statut as any));
    }

    const offset = (params.page - 1) * params.limit;

    const transferts = await db.select()
      .from(transfertsCoffreCaisse)
      .where(and(...conditions))
      .orderBy(desc(transfertsCoffreCaisse.createdAt))
      .limit(params.limit)
      .offset(offset);

    return { data: transferts };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Détails d'un transfert
  // ─────────────────────────────────────────────────────────────────────────
  async getTransfertDetails(transfertId: string) {
    const [transfert] = await db.select()
      .from(transfertsCoffreCaisse)
      .where(eq(transfertsCoffreCaisse.id, transfertId));

    if (!transfert) return null;

    const [source] = await db.select().from(caisses).where(eq(caisses.id, transfert.caisseSourceId));
    const [dest] = await db.select().from(caisses).where(eq(caisses.id, transfert.caisseDestinationId));
    const [requester] = await db.select().from(users).where(eq(users.id, transfert.requestedBy));
    const validator = transfert.validatedBy 
      ? (await db.select().from(users).where(eq(users.id, transfert.validatedBy)))[0]
      : null;
    const executor = transfert.executedBy
      ? (await db.select().from(users).where(eq(users.id, transfert.executedBy)))[0]
      : null;

    return {
      ...transfert,
      caisseSource: source,
      caisseDestination: dest,
      requester: { nom: requester?.nom, prenom: requester?.prenom },
      validator: validator ? { nom: validator.nom, prenom: validator.prenom } : null,
      executor: executor ? { nom: executor.nom, prenom: executor.prenom } : null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Logs d'audit
  // ─────────────────────────────────────────────────────────────────────────
  async getTransfertAuditLogs(transfertId: string) {
    return db.select()
      .from(transfertsCoffreAuditLogs)
      .where(eq(transfertsCoffreAuditLogs.transfertId, transfertId))
      .orderBy(desc(transfertsCoffreAuditLogs.timestamp));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Récupérer le coffre-fort d'une agence (migré vers coffresForts)
  // ─────────────────────────────────────────────────────────────────────────────
  async getOrCreateCoffreFort(agenceId: string): Promise<{ id: string; solde: string; nom: string }> {
    // Chercher dans la nouvelle table coffresForts
    const [existing] = await db.select()
      .from(coffresForts)
      .where(eq(coffresForts.ownerId, agenceId));

    if (existing) {
      return { id: existing.id, solde: existing.solde, nom: existing.nom };
    }

    // Si pas trouvé, vérifier le coffre du siège (ownerType = SIEGE)
    const [coffreSiege] = await db.select()
      .from(coffresForts)
      .where(eq(coffresForts.ownerType, "SIEGE"));

    if (coffreSiege) {
      return { id: coffreSiege.id, solde: coffreSiege.solde, nom: coffreSiege.nom };
    }

    // Aucun coffre trouvé - créer automatiquement pour l'agence
    const [agence] = await db.select().from(agences).where(eq(agences.id, agenceId));
    
    const [coffreFort] = await db.insert(coffresForts).values({
      code: `CF-${agence?.codeAgence || agenceId.slice(0, 8)}`,
      nom: `Coffre-fort ${agence?.nom || "Agence"}`,
      ownerType: "AGENCE",
      ownerId: agenceId,
      devise: "XAF",
      solde: "0",
      statut: "Actif",
    }).returning();

    return { id: coffreFort.id, solde: coffreFort.solde, nom: coffreFort.nom };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Générer une référence unique
  // ─────────────────────────────────────────────────────────────────────────
  private generateTransfertReference(type: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const time = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    
    const prefix = type === "COFFRE_VERS_CAISSE" ? "CVC" : "CVF";
    return `${prefix}-${year}${month}${day}-${time}${random}`;
  }
}
