/**
 * Service de gestion du pipeline d'onboarding
 *
 * Fonctionnalités:
 * - Gestion des checklists d'onboarding par agence
 * - Création d'instances d'onboarding pour les candidats embauchés
 * - Conversion candidat → employé
 * - Suivi de l'avancement de l'onboarding
 */

import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  onboardingChecklists,
  onboardingInstances,
  candidatures,
  OnboardingChecklistItem,
  OnboardingCompletedItem,
} from "@shared/schema/hr";
import { employes, InsertEmploye } from "@shared/schema/employes";
import { randomUUID } from "crypto";

export interface StartOnboardingResult {
  success: boolean;
  instance?: any;
  message: string;
}

export interface ConvertToEmployeeResult {
  success: boolean;
  employe?: any;
  message: string;
}

class OnboardingService {
  /**
   * Récupère les checklists d'onboarding pour une agence
   */
  async getChecklists(agenceId?: string) {
    const conditions = [eq(onboardingChecklists.actif, true)];

    if (agenceId) {
      conditions.push(eq(onboardingChecklists.agenceId, agenceId));
    }

    return db
      .select()
      .from(onboardingChecklists)
      .where(and(...conditions))
      .orderBy(onboardingChecklists.nom);
  }

  /**
   * Crée ou met à jour une checklist
   */
  async upsertChecklist(data: {
    id?: string;
    agenceId?: string;
    nom: string;
    description?: string;
    items: OnboardingChecklistItem[];
    createdBy?: string;
  }) {
    if (data.id) {
      const [updated] = await db
        .update(onboardingChecklists)
        .set({
          nom: data.nom,
          description: data.description,
          items: data.items,
          updatedAt: new Date(),
        })
        .where(eq(onboardingChecklists.id, data.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(onboardingChecklists)
      .values({
        agenceId: data.agenceId,
        nom: data.nom,
        description: data.description,
        items: data.items,
        createdBy: data.createdBy,
      })
      .returning();

    return created;
  }

  /**
   * Supprime (désactive) une checklist
   */
  async deleteChecklist(id: string) {
    await db
      .update(onboardingChecklists)
      .set({ actif: false, updatedAt: new Date() })
      .where(eq(onboardingChecklists.id, id));
  }

  /**
   * Démarre le processus d'onboarding pour un candidat
   */
  async startOnboarding(
    candidatureId: number,
    checklistId: string,
    assignedTo?: string
  ): Promise<StartOnboardingResult> {
    // Vérifier que la candidature existe et est acceptée
    const [candidature] = await db
      .select()
      .from(candidatures)
      .where(eq(candidatures.id, candidatureId))
      .limit(1);

    if (!candidature) {
      return { success: false, message: "Candidature non trouvée" };
    }

    if (candidature.statut !== "ACCEPTED") {
      return {
        success: false,
        message: "La candidature doit être acceptée pour démarrer l'onboarding",
      };
    }

    // Vérifier s'il n'y a pas déjà un onboarding en cours
    const [existing] = await db
      .select()
      .from(onboardingInstances)
      .where(
        and(
          eq(onboardingInstances.candidatureId, candidatureId),
          isNull(onboardingInstances.completedAt)
        )
      )
      .limit(1);

    if (existing) {
      return {
        success: false,
        message: "Un processus d'onboarding est déjà en cours pour cette candidature",
      };
    }

    const [instance] = await db
      .insert(onboardingInstances)
      .values({
        candidatureId,
        checklistId,
        statut: "IN_PROGRESS",
        startedAt: new Date(),
        assignedTo,
        completedItems: [],
      })
      .returning();

    return { success: true, instance, message: "Onboarding démarré" };
  }

  /**
   * Récupère les instances d'onboarding
   */
  async getInstances(filters?: {
    candidatureId?: number;
    employeId?: string;
    statut?: string;
    assignedTo?: string;
  }) {
    const conditions = [];

    if (filters?.candidatureId) {
      conditions.push(eq(onboardingInstances.candidatureId, filters.candidatureId));
    }
    if (filters?.employeId) {
      conditions.push(eq(onboardingInstances.employeId, filters.employeId));
    }
    if (filters?.statut) {
      conditions.push(eq(onboardingInstances.statut, filters.statut));
    }
    if (filters?.assignedTo) {
      conditions.push(eq(onboardingInstances.assignedTo, filters.assignedTo));
    }

    const query = db
      .select({
        instance: onboardingInstances,
        checklist: onboardingChecklists,
        candidature: candidatures,
      })
      .from(onboardingInstances)
      .leftJoin(onboardingChecklists, eq(onboardingInstances.checklistId, onboardingChecklists.id))
      .leftJoin(candidatures, eq(onboardingInstances.candidatureId, candidatures.id));

    const result = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(onboardingInstances.createdAt))
      : await query.orderBy(desc(onboardingInstances.createdAt));

    return result;
  }

  /**
   * Récupère une instance d'onboarding par ID
   */
  async getInstance(id: string) {
    const [result] = await db
      .select({
        instance: onboardingInstances,
        checklist: onboardingChecklists,
        candidature: candidatures,
      })
      .from(onboardingInstances)
      .leftJoin(onboardingChecklists, eq(onboardingInstances.checklistId, onboardingChecklists.id))
      .leftJoin(candidatures, eq(onboardingInstances.candidatureId, candidatures.id))
      .where(eq(onboardingInstances.id, id))
      .limit(1);

    return result;
  }

  /**
   * Marque un item comme complété
   */
  async completeItem(
    instanceId: string,
    itemName: string,
    completedBy?: string,
    notes?: string
  ) {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error("Instance d'onboarding non trouvée");
    }

    const currentItems = (instance.instance.completedItems || []) as OnboardingCompletedItem[];

    // Vérifier si l'item n'est pas déjà complété
    if (currentItems.some((item) => item.itemName === itemName)) {
      throw new Error("Cet item est déjà complété");
    }

    const newItem: OnboardingCompletedItem = {
      itemName,
      completedAt: new Date().toISOString(),
      completedBy,
      notes,
    };

    const updatedItems = [...currentItems, newItem];

    // Vérifier si tous les items requis sont complétés
    const checklistItems = (instance.checklist?.items || []) as OnboardingChecklistItem[];
    const requiredItems = checklistItems.filter((item) => item.required);
    const completedRequired = requiredItems.filter((item) =>
      updatedItems.some((c) => c.itemName === item.name)
    );
    const isComplete = completedRequired.length === requiredItems.length;

    const [updated] = await db
      .update(onboardingInstances)
      .set({
        completedItems: updatedItems,
        statut: isComplete ? "COMPLETED" : "IN_PROGRESS",
        completedAt: isComplete ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(onboardingInstances.id, instanceId))
      .returning();

    return { updated, isComplete };
  }

  /**
   * Démarque un item (le retire de la liste des complétés)
   */
  async uncompleteItem(instanceId: string, itemName: string) {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      throw new Error("Instance d'onboarding non trouvée");
    }

    const currentItems = (instance.instance.completedItems || []) as OnboardingCompletedItem[];
    const updatedItems = currentItems.filter((item) => item.itemName !== itemName);

    const [updated] = await db
      .update(onboardingInstances)
      .set({
        completedItems: updatedItems,
        statut: "IN_PROGRESS",
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(onboardingInstances.id, instanceId))
      .returning();

    return updated;
  }

  /**
   * Convertit une candidature en employé
   */
  async createEmployeeFromCandidate(
    candidatureId: number,
    employeData: Partial<InsertEmploye> & { agenceId: string }
  ): Promise<ConvertToEmployeeResult> {
    // Récupérer la candidature
    const [candidature] = await db
      .select()
      .from(candidatures)
      .where(eq(candidatures.id, candidatureId))
      .limit(1);

    if (!candidature) {
      return { success: false, message: "Candidature non trouvée" };
    }

    if (candidature.statut !== "ACCEPTED" && candidature.approvalStatus !== "APPROVED") {
      return {
        success: false,
        message: "La candidature doit être acceptée et approuvée",
      };
    }

    // Créer l'employé
    const employeId = randomUUID();
    const [employe] = await db
      .insert(employes)
      .values({
        id: employeId,
        nom: candidature.nom,
        prenom: candidature.prenom,
        email: candidature.email,
        telephone: candidature.telephone,
        poste: candidature.posteVise,
        agenceId: employeData.agenceId,
        dateEmbauche: new Date().toISOString().split('T')[0],
        statut: "ACTIVE",
        ...employeData,
      })
      .returning();

    // Mettre à jour l'instance d'onboarding si elle existe
    await db
      .update(onboardingInstances)
      .set({
        employeId: employe.id,
        updatedAt: new Date(),
      })
      .where(eq(onboardingInstances.candidatureId, candidatureId));

    // Mettre à jour le statut de la candidature
    await db
      .update(candidatures)
      .set({
        statut: "HIRED",
        updatedAt: new Date(),
      })
      .where(eq(candidatures.id, candidatureId));

    return {
      success: true,
      employe,
      message: `Employé ${employe.prenom} ${employe.nom} créé avec succès`,
    };
  }

  /**
   * Annule un processus d'onboarding
   */
  async cancelOnboarding(instanceId: string, reason?: string) {
    const [updated] = await db
      .update(onboardingInstances)
      .set({
        statut: "CANCELLED",
        notes: reason,
        updatedAt: new Date(),
      })
      .where(eq(onboardingInstances.id, instanceId))
      .returning();

    return updated;
  }
}

export const onboardingService = new OnboardingService();
