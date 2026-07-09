import { db } from "../../db";
import {
  coffresForts,
  configTransfertInterCoffres,
  transfertsInterCoffres,
  users,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { currencySymbol } from "@shared/config/currency";
import { SystemRole } from "@shared/types/roles";

export interface ValidationResult {
  valid: boolean;
  errorCode?: string;
  error?: string;
}

export interface UserContext {
  id: string;
  role: string;
  agenceId?: string;
}

/**
 * Validateur des règles métier pour les transferts inter-coffres
 */
export class TransfertInterCoffresValidator {
  /**
   * Récupère la configuration (agence ou globale)
   */
  async getConfig(agenceId?: string | null) {
    // D'abord chercher la config de l'agence
    if (agenceId) {
      const [agenceConfig] = await db
        .select()
        .from(configTransfertInterCoffres)
        .where(eq(configTransfertInterCoffres.agenceId, agenceId));

      if (agenceConfig) return agenceConfig;
    }

    // Sinon, config globale (agenceId = NULL)
    const [globalConfig] = await db
      .select()
      .from(configTransfertInterCoffres)
      .where(isNull(configTransfertInterCoffres.agenceId));

    // Retourner config par défaut si aucune trouvée
    return globalConfig || this.getDefaultConfig();
  }

  private getDefaultConfig() {
    return {
      montantMinTransfert: "10000",
      montantMaxTransfert: null,
      seuilAlertePlafond: "80",
      approbationDoubleNiveau: true,
      nombreAgentsTransportMin: "2",
      scelleObligatoireSiMontantSuperieur: null,
      separationCreateurApprobateurN1: true,
      separationApprobateurN1N2: true,
      separationApprobateurRecepteur: true,
      rolesCreateurs: ["CAISSIER", "COMPTABLE", "CHEF_AGENCE"],
      rolesApprobateursN1: ["CHEF_AGENCE", "SUPERVISEUR"],
      rolesApprobateursN2: ["ADMIN"],
      rolesRecepteurs: ["CHEF_AGENCE", "COMPTABLE", "SUPERVISEUR"],
      delaiMaxReconciliation: "3",
      alerteReconciliationActive: true,
      actif: true,
    };
  }

  /**
   * Normalise le rôle pour comparaison
   */
  private normalizeRoleToken(role: string): string {
    return role.trim().toUpperCase();
  }

  /**
   * Vérifie si l'utilisateur peut créer un transfert
   */
  async canCreate(user: UserContext, agenceId?: string): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesCreateursRaw = (config.rolesCreateurs as string[] || []);
    const rolesCreateurs = rolesCreateursRaw.map((r) => this.normalizeRoleToken(r));

    if (!rolesCreateurs.includes(normalizedRole) && user.role !== SystemRole.ADMIN) {
      return {
        valid: false,
        errorCode: "TIC_023",
        error: `Rôle non autorisé pour créer un transfert. Rôles autorisés: ${rolesCreateursRaw.join(", ")}`,
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut approuver niveau 1
   */
  async canApproveLevel1(
    user: UserContext,
    transfert: typeof transfertsInterCoffres.$inferSelect,
    agenceId?: string
  ): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesApprobateursRaw = (config.rolesApprobateursN1 as string[] || []);
    const rolesApprobateurs = rolesApprobateursRaw.map((r) => this.normalizeRoleToken(r));

    // Vérifier le rôle
    if (!rolesApprobateurs.includes(normalizedRole) && user.role !== SystemRole.ADMIN) {
      return {
        valid: false,
        errorCode: "TIC_023",
        error: `Rôle non autorisé pour approuver niveau 1. Rôles autorisés: ${rolesApprobateursRaw.join(", ")}`,
      };
    }

    // Vérifier séparation créateur / approbateur
    if (config.separationCreateurApprobateurN1 && transfert.createdBy === user.id) {
      return {
        valid: false,
        errorCode: "TIC_021",
        error: "Le créateur ne peut pas approuver son propre transfert",
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut approuver niveau 2
   */
  async canApproveLevel2(
    user: UserContext,
    transfert: typeof transfertsInterCoffres.$inferSelect,
    agenceId?: string
  ): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesApprobateursRaw = (config.rolesApprobateursN2 as string[] || []);
    const rolesApprobateurs = rolesApprobateursRaw.map((r) => this.normalizeRoleToken(r));

    // Vérifier le rôle
    if (!rolesApprobateurs.includes(normalizedRole) && user.role !== SystemRole.ADMIN) {
      return {
        valid: false,
        errorCode: "TIC_023",
        error: `Rôle non autorisé pour approuver niveau 2. Rôles autorisés: ${rolesApprobateursRaw.join(", ")}`,
      };
    }

    // Vérifier séparation approbateur N1 / N2
    if (config.separationApprobateurN1N2 && transfert.approvedByLevel1 === user.id) {
      return {
        valid: false,
        errorCode: "TIC_022",
        error: "L'approbateur niveau 1 ne peut pas approuver niveau 2",
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut réceptionner
   */
  async canReceive(
    user: UserContext,
    transfert: typeof transfertsInterCoffres.$inferSelect,
    agenceId?: string
  ): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesRecepteursRaw = (config.rolesRecepteurs as string[] || []);
    const rolesRecepteurs = rolesRecepteursRaw.map((r) => this.normalizeRoleToken(r));

    // Vérifier le rôle
    if (!rolesRecepteurs.includes(normalizedRole) && user.role !== SystemRole.ADMIN) {
      return {
        valid: false,
        errorCode: "TIC_023",
        error: `Rôle non autorisé pour réceptionner. Rôles autorisés: ${rolesRecepteursRaw.join(", ")}`,
      };
    }

    // Vérifier séparation approbateur / récepteur
    if (config.separationApprobateurRecepteur) {
      if (transfert.approvedByLevel1 === user.id || transfert.approvedByLevel2 === user.id) {
        return {
          valid: false,
          errorCode: "TIC_023",
          error: "L'approbateur ne peut pas être le récepteur",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut annuler
   */
  async canCancel(
    user: UserContext,
    transfert: typeof transfertsInterCoffres.$inferSelect
  ): Promise<ValidationResult> {
    // Seul le créateur ou un admin peut annuler
    if (transfert.createdBy !== user.id && user.role !== SystemRole.ADMIN) {
      return {
        valid: false,
        errorCode: "TIC_023",
        error: "Seul le créateur ou un administrateur peut annuler ce transfert",
      };
    }

    // Vérifier le statut
    const cancellableStatuts = ["DRAFT", "SUBMITTED", "APPROVED_L1", "APPROVED_L2"];
    if (!cancellableStatuts.includes(transfert.statut)) {
      return {
        valid: false,
        errorCode: "TIC_024",
        error: `Impossible d'annuler un transfert en statut "${transfert.statut}"`,
      };
    }

    return { valid: true };
  }

  /**
   * Valide les données de création d'un transfert
   */
  async validateCreation(data: {
    coffreSourceId: string;
    coffreDestinationId: string;
    montant: number;
    devise: string;
    typeConditionnement: string;
    numeroScelle?: string;
    motif: string;
    agentsTransport?: Array<{ nom: string; contact: string }>;
  }, agenceId?: string): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);

    // RG-001: Montant positif
    if (data.montant <= 0) {
      return { valid: false, errorCode: "TIC_001", error: "Le montant doit être strictement positif" };
    }

    // RG-011: Source != Destination
    if (data.coffreSourceId === data.coffreDestinationId) {
      return { valid: false, errorCode: "TIC_011", error: "Le coffre source et destination ne peuvent pas être identiques" };
    }

    // RG-012: Motif obligatoire (min 10 caractères)
    if (!data.motif || data.motif.trim().length < 10) {
      return { valid: false, errorCode: "TIC_010", error: "Le motif doit contenir au moins 10 caractères" };
    }

    // RG-008: Minimum 2 agents de transport
    const minAgents = parseInt(config.nombreAgentsTransportMin?.toString() || "2");
    if (!data.agentsTransport || data.agentsTransport.length < minAgents) {
      return { valid: false, errorCode: "TIC_008", error: `Au moins ${minAgents} agents de transport sont requis` };
    }

    // RG-009: Numéro de scellé obligatoire si sac scellé
    if (data.typeConditionnement === "Sac scellé" && !data.numeroScelle) {
      return { valid: false, errorCode: "TIC_009", error: "Le numéro de scellé est obligatoire pour un sac scellé" };
    }

    // Vérifier montant minimum
    const montantMin = parseFloat(config.montantMinTransfert?.toString() || "0");
    if (data.montant < montantMin) {
      return { valid: false, errorCode: "TIC_001", error: `Le montant minimum est de ${montantMin.toLocaleString()} ${currencySymbol()}` };
    }

    // Vérifier montant maximum
    if (config.montantMaxTransfert) {
      const montantMax = parseFloat(config.montantMaxTransfert.toString());
      if (data.montant > montantMax) {
        return { valid: false, errorCode: "TIC_001", error: `Le montant maximum est de ${montantMax.toLocaleString()} ${currencySymbol()}` };
      }
    }

    // Vérifier les coffres
    const [coffreSource] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, data.coffreSourceId));

    const [coffreDest] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, data.coffreDestinationId));

    if (!coffreSource) {
      return { valid: false, errorCode: "TIC_006", error: "Coffre source introuvable" };
    }

    if (!coffreDest) {
      return { valid: false, errorCode: "TIC_007", error: "Coffre destination introuvable" };
    }

    // RG-003: Coffre source actif
    if (coffreSource.statut !== "ACTIVE") {
      return { valid: false, errorCode: "TIC_006", error: "Le coffre source n'est pas actif" };
    }

    // RG-004: Coffre destination actif
    if (coffreDest.statut !== "ACTIVE") {
      return { valid: false, errorCode: "TIC_007", error: "Le coffre destination n'est pas actif" };
    }

    // RG-002: Devise identique
    if (coffreSource.devise !== coffreDest.devise) {
      return { valid: false, errorCode: "TIC_002", error: "Les devises des coffres source et destination doivent être identiques" };
    }

    if (data.devise !== coffreSource.devise) {
      return { valid: false, errorCode: "TIC_002", error: `La devise du transfert doit être ${coffreSource.devise}` };
    }

    // RG-005: Solde suffisant
    const soldeSource = parseFloat(coffreSource.solde?.toString() || "0");
    if (soldeSource < data.montant) {
      return {
        valid: false,
        errorCode: "TIC_003",
        error: `Solde insuffisant. Disponible: ${soldeSource.toLocaleString()} ${currencySymbol()}, Demandé: ${data.montant.toLocaleString()} ${currencySymbol()}`,
      };
    }

    // RG-007: Solde minimum source respecté après transfert
    const soldeMinSource = parseFloat(coffreSource.soldeMinimum?.toString() || "0");
    if (soldeSource - data.montant < soldeMinSource) {
      return {
        valid: false,
        errorCode: "TIC_005",
        error: `Le solde après transfert (${(soldeSource - data.montant).toLocaleString()} ${currencySymbol()}) serait inférieur au minimum requis (${soldeMinSource.toLocaleString()} ${currencySymbol()})`,
      };
    }

    // RG-006: Plafond destination respecté après transfert
    if (coffreDest.plafondEncaisse) {
      const plafondDest = parseFloat(coffreDest.plafondEncaisse.toString());
      const soldeDest = parseFloat(coffreDest.solde?.toString() || "0");
      if (soldeDest + data.montant > plafondDest) {
        return {
          valid: false,
          errorCode: "TIC_004",
          error: `Le plafond du coffre destination serait dépassé. Plafond: ${plafondDest.toLocaleString()} ${currencySymbol()}, Solde après: ${(soldeDest + data.montant).toLocaleString()} ${currencySymbol()}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Vérifie si le solde est suffisant (pour le dispatch)
   */
  async validateSufficientFunds(coffreSourceId: string, montant: number): Promise<ValidationResult> {
    const [coffre] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, coffreSourceId));

    if (!coffre) {
      return { valid: false, errorCode: "TIC_006", error: "Coffre source introuvable" };
    }

    const solde = parseFloat(coffre.solde?.toString() || "0");
    if (solde < montant) {
      return {
        valid: false,
        errorCode: "TIC_003",
        error: `Solde insuffisant pour le dispatch. Disponible: ${solde.toLocaleString()} ${currencySymbol()}`,
      };
    }

    return { valid: true };
  }

  /**
   * Valide la transition de statut
   */
  validateStatusTransition(
    currentStatus: string,
    newStatus: string,
    action: string
  ): ValidationResult {
    const validTransitions: Record<string, Record<string, string>> = {
      DRAFT: { submit: "SUBMITTED", cancel: "CANCELLED" },
      SUBMITTED: { approve_l1: "APPROVED_L1", reject: "REJECTED", cancel: "CANCELLED" },
      APPROVED_L1: { approve_l2: "APPROVED_L2", reject: "REJECTED", cancel: "CANCELLED" },
      APPROVED_L2: { dispatch: "IN_TRANSIT" },
      IN_TRANSIT: { receive_ok: "RECEIVED", receive_ecart: "RECEIVED_WITH_DISCREPANCY" },
    };

    const transitions = validTransitions[currentStatus];
    if (!transitions) {
      return {
        valid: false,
        errorCode: "TIC_020",
        error: `Aucune transition possible depuis le statut "${currentStatus}"`,
      };
    }

    const expectedStatus = transitions[action];
    if (!expectedStatus || expectedStatus !== newStatus) {
      return {
        valid: false,
        errorCode: "TIC_020",
        error: `Transition non autorisée: ${currentStatus} → ${newStatus} (action: ${action})`,
      };
    }

    return { valid: true };
  }
}
