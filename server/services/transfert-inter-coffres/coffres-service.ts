import { db } from "../../db";
import { eq, and, desc, asc, sql, isNull } from "drizzle-orm";
import {
  coffresForts,
  comptesLiaison,
  agences,
  configTransfertInterCoffres,
} from "@shared/schema";
import { StatutCoffre } from "@shared/enum/status-constants";

interface ServiceResult<T = any> {
  success: boolean;
  errorCode?: string;
  error?: string;
  data?: T;
}

export class CoffresFortsService {
  /**
   * Crée un coffre-fort pour une agence (appelé automatiquement à la création d'agence)
   */
  async createCoffreForAgence(
    agenceId: string,
    agenceCode: string,
    agenceNom: string,
    options?: {
      plafondEncaisse?: number;
      soldeMinimum?: number;
    }
  ): Promise<ServiceResult> {
    const code = `CF-${agenceCode}`;
    const nom = `Coffre-fort ${agenceNom}`;

    // Vérifier si un coffre existe déjà pour cette agence
    const [existing] = await db
      .select()
      .from(coffresForts)
      .where(and(
        eq(coffresForts.ownerType, "AGENCE"),
        eq(coffresForts.ownerId, agenceId)
      ));

    if (existing) {
      return { success: true, data: existing };
    }

    const [coffre] = await db
      .insert(coffresForts)
      .values({
        code,
        nom,
        ownerType: "AGENCE",
        ownerId: agenceId,
        devise: "XAF",
        solde: "0",
        plafondEncaisse: options?.plafondEncaisse?.toString(),
        soldeMinimum: options?.soldeMinimum?.toString() || "0",
        statut: StatutCoffre.ACTIVE,
      })
      .returning();

    // Créer aussi le compte de liaison
    await this.createCompteLiaisonForCoffre(coffre);

    return { success: true, data: coffre };
  }

  /**
   * Crée le coffre-fort du siège (unique)
   */
  async createCoffreSiege(options?: {
    plafondEncaisse?: number;
    soldeMinimum?: number;
  }): Promise<ServiceResult> {
    // Vérifier si le coffre siège existe déjà
    const [existing] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.ownerType, "SIEGE"));

    if (existing) {
      return { success: true, data: existing };
    }

    const [coffre] = await db
      .insert(coffresForts)
      .values({
        code: "CF-SIEGE",
        nom: "Coffre-fort Siège",
        ownerType: "SIEGE",
        ownerId: null,
        devise: "XAF",
        solde: "0",
        plafondEncaisse: options?.plafondEncaisse?.toString(),
        soldeMinimum: options?.soldeMinimum?.toString() || "0",
        statut: StatutCoffre.ACTIVE,
      })
      .returning();

    // Créer le compte de liaison
    await this.createCompteLiaisonForCoffre(coffre);

    return { success: true, data: coffre };
  }

  /**
   * Crée un compte de liaison pour un coffre
   */
  private async createCompteLiaisonForCoffre(coffre: typeof coffresForts.$inferSelect) {
    const code = coffre.ownerType === "SIEGE"
      ? "LIAISON-SIEGE"
      : `LIAISON-${coffre.code.replace("CF-", "")}`;

    const intitule = coffre.ownerType === "SIEGE"
      ? "Compte de liaison - Siège"
      : `Compte de liaison - ${coffre.nom.replace("Coffre-fort ", "")}`;

    // Vérifier si existe déjà
    const [existing] = await db
      .select()
      .from(comptesLiaison)
      .where(eq(comptesLiaison.code, code));

    if (existing) return existing;

    const [compte] = await db
      .insert(comptesLiaison)
      .values({
        code,
        intitule,
        numeroComptable: "581200",
        entiteType: coffre.ownerType,
        entiteId: coffre.ownerId,
        soldeCourant: "0",
        actif: true,
      })
      .returning();

    return compte;
  }

  /**
   * Liste tous les coffres-forts
   */
  async listCoffres(params?: {
    ownerType?: "AGENCE" | "SIEGE";
    statut?: string;
    agenceId?: string;
  }): Promise<ServiceResult> {
    const conditions = [];

    if (params?.ownerType) {
      conditions.push(eq(coffresForts.ownerType, params.ownerType));
    }
    if (params?.statut) {
      conditions.push(eq(coffresForts.statut, params.statut as any));
    }
    if (params?.agenceId) {
      conditions.push(eq(coffresForts.ownerId, params.agenceId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const coffres = await db
      .select({
        coffre: coffresForts,
        agence: agences,
      })
      .from(coffresForts)
      .leftJoin(agences, eq(coffresForts.ownerId, agences.id))
      .where(whereClause)
      .orderBy(asc(coffresForts.nom));

    const result = coffres.map(c => ({
      ...c.coffre,
      agence: c.agence,
      agenceNom: c.agence?.nom || (c.coffre.ownerType === "SIEGE" ? "Siège" : null),
    }));

    return { success: true, data: result };
  }

  /**
   * Récupère un coffre par ID
   */
  async getCoffreById(coffreId: string): Promise<ServiceResult> {
    const [coffre] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, coffreId));

    if (!coffre) {
      return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Coffre-fort introuvable" };
    }

    let agence = null;
    if (coffre.ownerId) {
      [agence] = await db.select().from(agences).where(eq(agences.id, coffre.ownerId));
    }

    return {
      success: true,
      data: {
        ...coffre,
        agence,
        agenceNom: agence?.nom || (coffre.ownerType === "SIEGE" ? "Siège" : null),
      },
    };
  }

  /**
   * Récupère le coffre d'une agence
   */
  async getCoffreByAgenceId(agenceId: string): Promise<ServiceResult> {
    const [coffre] = await db
      .select()
      .from(coffresForts)
      .where(and(
        eq(coffresForts.ownerType, "AGENCE"),
        eq(coffresForts.ownerId, agenceId)
      ));

    if (!coffre) {
      return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Cette agence n'a pas de coffre-fort" };
    }

    const [agence] = await db.select().from(agences).where(eq(agences.id, agenceId));

    return {
      success: true,
      data: {
        ...coffre,
        agence,
        agenceNom: agence?.nom,
      },
    };
  }

  /**
   * Récupère le coffre du siège
   */
  async getCoffreSiege(): Promise<ServiceResult> {
    const [coffre] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.ownerType, "SIEGE"));

    if (!coffre) {
      // Créer automatiquement si n'existe pas
      return this.createCoffreSiege();
    }

    return {
      success: true,
      data: {
        ...coffre,
        agence: null,
        agenceNom: "Siège",
      },
    };
  }

  /**
   * Met à jour un coffre-fort
   */
  async updateCoffre(
    coffreId: string,
    data: {
      nom?: string;
      plafondEncaisse?: number;
      soldeMinimum?: number;
      statut?: typeof StatutCoffre[keyof typeof StatutCoffre];
      description?: string;
    }
  ): Promise<ServiceResult> {
    const updateData: any = { updatedAt: new Date() };

    if (data.nom !== undefined) updateData.nom = data.nom;
    if (data.plafondEncaisse !== undefined) updateData.plafondEncaisse = data.plafondEncaisse.toString();
    if (data.soldeMinimum !== undefined) updateData.soldeMinimum = data.soldeMinimum.toString();
    if (data.statut !== undefined) updateData.statut = data.statut;
    if (data.description !== undefined) updateData.description = data.description;

    const [updated] = await db
      .update(coffresForts)
      .set(updateData)
      .where(eq(coffresForts.id, coffreId))
      .returning();

    if (!updated) {
      return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Coffre-fort introuvable" };
    }

    return { success: true, data: updated };
  }

  /**
   * Approvisionne un coffre (ajout de fonds externe)
   */
  async approvisionnerCoffre(
    coffreId: string,
    montant: number,
    motif: string,
    userId: string
  ): Promise<ServiceResult> {
    if (montant <= 0) {
      return { success: false, errorCode: "INVALID_AMOUNT", error: "Le montant doit être positif" };
    }

    const [coffre] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, coffreId));

    if (!coffre) {
      return { success: false, errorCode: "COFFRE_NOT_FOUND", error: "Coffre-fort introuvable" };
    }

    if (coffre.statut !== StatutCoffre.ACTIVE) {
      return { success: false, errorCode: "COFFRE_INACTIVE", error: "Le coffre-fort n'est pas actif" };
    }

    // Vérifier le plafond
    if (coffre.plafondEncaisse) {
      const soldeActuel = parseFloat(coffre.solde?.toString() || "0");
      const plafond = parseFloat(coffre.plafondEncaisse.toString());
      if (soldeActuel + montant > plafond) {
        return {
          success: false,
          errorCode: "PLAFOND_EXCEEDED",
          error: `Le plafond serait dépassé. Plafond: ${plafond.toLocaleString()} XAF, Solde après: ${(soldeActuel + montant).toLocaleString()} XAF`,
        };
      }
    }

    // Mettre à jour le solde
    const [updated] = await db
      .update(coffresForts)
      .set({
        solde: sql`${coffresForts.solde} + ${montant}`,
        updatedAt: new Date(),
      })
      .where(eq(coffresForts.id, coffreId))
      .returning();

    return { success: true, data: updated };
  }

  /**
   * Récupère ou crée la configuration globale
   */
  async getOrCreateGlobalConfig(): Promise<ServiceResult> {
    let [config] = await db
      .select()
      .from(configTransfertInterCoffres)
      .where(isNull(configTransfertInterCoffres.agenceId));

    if (!config) {
      [config] = await db
        .insert(configTransfertInterCoffres)
        .values({
          agenceId: null,
          actif: true,
        })
        .returning();
    }

    return { success: true, data: config };
  }

  /**
   * Met à jour la configuration
   */
  async updateConfig(
    agenceId: string | null,
    data: Partial<typeof configTransfertInterCoffres.$inferInsert>
  ): Promise<ServiceResult> {
    const condition = agenceId
      ? eq(configTransfertInterCoffres.agenceId, agenceId)
      : isNull(configTransfertInterCoffres.agenceId);

    let [config] = await db
      .select()
      .from(configTransfertInterCoffres)
      .where(condition);

    if (!config) {
      // Créer si n'existe pas
      [config] = await db
        .insert(configTransfertInterCoffres)
        .values({
          agenceId,
          ...data,
          actif: true,
        } as any)
        .returning();
    } else {
      // Mettre à jour
      [config] = await db
        .update(configTransfertInterCoffres)
        .set({
          ...data,
          updatedAt: new Date(),
        } as any)
        .where(eq(configTransfertInterCoffres.id, config.id))
        .returning();
    }

    return { success: true, data: config };
  }

  /**
   * Récupère les statistiques des coffres
   */
  async getStatistiques(): Promise<ServiceResult> {
    const coffres = await db.select().from(coffresForts);

    const stats = {
      totalCoffres: coffres.length,
      coffresActifs: coffres.filter(c => c.statut === StatutCoffre.ACTIVE).length,
      coffresSuspendus: coffres.filter(c => c.statut === StatutCoffre.SUSPENDED).length,
      coffresFermes: coffres.filter(c => c.statut === StatutCoffre.CLOSED).length,
      soldeTotal: coffres.reduce((sum, c) => sum + parseFloat(c.solde?.toString() || "0"), 0),
      soldeSiege: coffres
        .filter(c => c.ownerType === "SIEGE")
        .reduce((sum, c) => sum + parseFloat(c.solde?.toString() || "0"), 0),
      soldeAgences: coffres
        .filter(c => c.ownerType === "AGENCE")
        .reduce((sum, c) => sum + parseFloat(c.solde?.toString() || "0"), 0),
    };

    return { success: true, data: stats };
  }
}
