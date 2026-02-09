import { db } from "../../db";
import {
  coffresForts,
  configEvacuationCoffre,
  evacuationsCoffre,
} from "@shared/schema";
import { isAdminRole, normalizeRole } from "@shared/types/roles";
import { eq, isNull } from "drizzle-orm";
import { CANCELLABLE_STATES } from "./state-machine";

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
 * Validateur des règles métier pour les évacuations de coffre-fort
 */
export class EvacuationCoffreValidator {
  /**
   * Récupère la configuration (agence ou globale)
   */
  async getConfig(agenceId?: string | null) {
    if (agenceId) {
      const [agenceConfig] = await db
        .select()
        .from(configEvacuationCoffre)
        .where(eq(configEvacuationCoffre.agenceId, agenceId));
      if (agenceConfig) return agenceConfig;
    }

    const [globalConfig] = await db
      .select()
      .from(configEvacuationCoffre)
      .where(isNull(configEvacuationCoffre.agenceId));

    return globalConfig || this.getDefaultConfig();
  }

  private getDefaultConfig() {
    return {
      montantMinEvacuation: "100000",
      montantMaxEvacuation: null,
      seuilEvacuationObligatoire: null,
      approbationRequise: true,
      separationCreateurApprobateur: true,
      separationApprobateurPreparateur: true,
      separationPreparateurDispatcher: false,
      rolesCreateurs: ["agent_caisse", "Comptable", "Chef d'Agence"],
      rolesApprobateurs: ["Chef d'Agence", "Directeur", "Trésorier"],
      rolesPreparateurs: ["agent_caisse", "Comptable", "Trésorier"],
      rolesDispatchers: ["Chef d'Agence", "Trésorier"],
      nombreAgentsTransportMin: "1",
      scelleObligatoire: false,
      scelleObligatoireSiMontantSuperieur: null,
      billetageObligatoire: true,
      destinationsAutorisees: ["BANQUE", "COFFRE_CENTRAL", "TRANSPORTEUR"],
      delaiMaxReconciliation: "5",
      alerteReconciliationActive: true,
      seuilEcartAcceptable: "0",
      actif: true,
    };
  }

  private normalizeRoleToken(role: string): string {
    const normalized = normalizeRole(role);
    if (normalized) return normalized;
    return role.trim().toLowerCase();
  }

  /**
   * Vérifie si l'utilisateur peut créer une évacuation
   */
  async canCreate(user: UserContext, agenceId?: string): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesRaw = (config.rolesCreateurs as string[]) || [];
    const roles = rolesRaw.map((r) => this.normalizeRoleToken(r));

    if (!roles.includes(normalizedRole) && !isAdminRole(user.role)) {
      return {
        valid: false,
        errorCode: "EVC_023",
        error: `Rôle non autorisé pour créer une évacuation. Rôles autorisés: ${rolesRaw.join(", ")}`,
      };
    }
    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut approuver
   */
  async canApprove(
    user: UserContext,
    evacuation: typeof evacuationsCoffre.$inferSelect,
    agenceId?: string,
  ): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesRaw = (config.rolesApprobateurs as string[]) || [];
    const roles = rolesRaw.map((r) => this.normalizeRoleToken(r));

    if (!roles.includes(normalizedRole) && !isAdminRole(user.role)) {
      return {
        valid: false,
        errorCode: "EVC_023",
        error: `Rôle non autorisé pour approuver. Rôles autorisés: ${rolesRaw.join(", ")}`,
      };
    }

    if (config.separationCreateurApprobateur && evacuation.createdBy === user.id) {
      return {
        valid: false,
        errorCode: "EVC_021",
        error: "Le créateur ne peut pas approuver sa propre évacuation",
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut préparer
   */
  async canPrepare(
    user: UserContext,
    evacuation: typeof evacuationsCoffre.$inferSelect,
    agenceId?: string,
  ): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesRaw = (config.rolesPreparateurs as string[]) || [];
    const roles = rolesRaw.map((r) => this.normalizeRoleToken(r));

    if (!roles.includes(normalizedRole) && !isAdminRole(user.role)) {
      return {
        valid: false,
        errorCode: "EVC_023",
        error: `Rôle non autorisé pour préparer. Rôles autorisés: ${rolesRaw.join(", ")}`,
      };
    }

    if (config.separationApprobateurPreparateur && evacuation.approvedBy === user.id) {
      return {
        valid: false,
        errorCode: "EVC_022",
        error: "L'approbateur ne peut pas préparer l'évacuation",
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut expédier (dispatch)
   */
  async canDispatch(
    user: UserContext,
    evacuation: typeof evacuationsCoffre.$inferSelect,
    agenceId?: string,
  ): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);
    const normalizedRole = this.normalizeRoleToken(user.role);
    const rolesRaw = (config.rolesDispatchers as string[]) || [];
    const roles = rolesRaw.map((r) => this.normalizeRoleToken(r));

    if (!roles.includes(normalizedRole) && !isAdminRole(user.role)) {
      return {
        valid: false,
        errorCode: "EVC_023",
        error: `Rôle non autorisé pour expédier. Rôles autorisés: ${rolesRaw.join(", ")}`,
      };
    }

    if (config.separationPreparateurDispatcher && evacuation.preparedBy === user.id) {
      return {
        valid: false,
        errorCode: "EVC_022",
        error: "Le préparateur ne peut pas expédier l'évacuation",
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si l'utilisateur peut annuler
   */
  async canCancel(
    user: UserContext,
    evacuation: typeof evacuationsCoffre.$inferSelect,
  ): Promise<ValidationResult> {
    if (evacuation.createdBy !== user.id && !isAdminRole(user.role)) {
      return {
        valid: false,
        errorCode: "EVC_023",
        error: "Seul le créateur ou un administrateur peut annuler cette évacuation",
      };
    }

    if (!CANCELLABLE_STATES.includes(evacuation.statut as any)) {
      return {
        valid: false,
        errorCode: "EVC_024",
        error: `Impossible d'annuler une évacuation en statut "${evacuation.statut}"`,
      };
    }

    return { valid: true };
  }

  /**
   * Valide les données de création
   */
  async validateCreation(data: {
    coffreSourceId: string;
    typeDestination: string;
    coffreDestinationId?: string;
    banqueNom?: string;
    banqueCompte?: string;
    transporteurNom?: string;
    montant: number;
    devise: string;
    motifDetail: string;
    agentsTransport?: Array<{ nom: string; contact: string }>;
  }, agenceId?: string): Promise<ValidationResult> {
    const config = await this.getConfig(agenceId);

    // Montant positif
    if (data.montant <= 0) {
      return { valid: false, errorCode: "EVC_001", error: "Le montant doit être strictement positif" };
    }

    // Motif obligatoire (min 10 caractères)
    if (!data.motifDetail || data.motifDetail.trim().length < 10) {
      return { valid: false, errorCode: "EVC_010", error: "Le motif doit contenir au moins 10 caractères" };
    }

    // Vérifier destination autorisée
    const destAutorisees = (config.destinationsAutorisees as string[]) || ["BANQUE", "COFFRE_CENTRAL", "TRANSPORTEUR"];
    if (!destAutorisees.includes(data.typeDestination)) {
      return { valid: false, errorCode: "EVC_015", error: `Destination "${data.typeDestination}" non autorisée pour cette agence` };
    }

    // Validation selon type de destination
    if (data.typeDestination === "BANQUE") {
      if (!data.banqueNom || !data.banqueCompte) {
        return { valid: false, errorCode: "EVC_016", error: "Le nom et le compte bancaire sont obligatoires pour une évacuation vers banque" };
      }
    } else if (data.typeDestination === "COFFRE_CENTRAL") {
      if (!data.coffreDestinationId) {
        return { valid: false, errorCode: "EVC_017", error: "Le coffre destination est obligatoire pour une évacuation vers coffre central" };
      }
      if (data.coffreSourceId === data.coffreDestinationId) {
        return { valid: false, errorCode: "EVC_011", error: "Le coffre source et destination ne peuvent pas être identiques" };
      }
    } else if (data.typeDestination === "TRANSPORTEUR") {
      if (!data.transporteurNom) {
        return { valid: false, errorCode: "EVC_018", error: "Le nom du transporteur est obligatoire" };
      }
    }

    // Agents de transport
    const minAgents = parseInt(config.nombreAgentsTransportMin?.toString() || "1");
    if (data.agentsTransport && data.agentsTransport.length < minAgents) {
      return { valid: false, errorCode: "EVC_008", error: `Au moins ${minAgents} agent(s) de transport requis` };
    }

    // Montant minimum
    const montantMin = parseFloat(config.montantMinEvacuation?.toString() || "0");
    if (data.montant < montantMin) {
      return { valid: false, errorCode: "EVC_001", error: `Le montant minimum d'évacuation est de ${montantMin.toLocaleString()} XAF` };
    }

    // Montant maximum
    if (config.montantMaxEvacuation) {
      const montantMax = parseFloat(config.montantMaxEvacuation.toString());
      if (data.montant > montantMax) {
        return { valid: false, errorCode: "EVC_001", error: `Le montant maximum d'évacuation est de ${montantMax.toLocaleString()} XAF` };
      }
    }

    // Vérifier coffre source
    const [coffreSource] = await db
      .select()
      .from(coffresForts)
      .where(eq(coffresForts.id, data.coffreSourceId));

    if (!coffreSource) {
      return { valid: false, errorCode: "EVC_006", error: "Coffre source introuvable" };
    }

    if (coffreSource.statut !== "ACTIVE") {
      return { valid: false, errorCode: "EVC_006", error: "Le coffre source n'est pas actif" };
    }

    // Devise identique
    if (data.devise !== coffreSource.devise) {
      return { valid: false, errorCode: "EVC_002", error: `La devise du transfert doit être ${coffreSource.devise}` };
    }

    // Solde suffisant
    const soldeSource = parseFloat(coffreSource.solde?.toString() || "0");
    if (soldeSource < data.montant) {
      return {
        valid: false,
        errorCode: "EVC_003",
        error: `Solde insuffisant. Disponible: ${soldeSource.toLocaleString()} XAF, Demandé: ${data.montant.toLocaleString()} XAF`,
      };
    }

    // Vérifier coffre destination si COFFRE_CENTRAL
    if (data.typeDestination === "COFFRE_CENTRAL" && data.coffreDestinationId) {
      const [coffreDest] = await db
        .select()
        .from(coffresForts)
        .where(eq(coffresForts.id, data.coffreDestinationId));

      if (!coffreDest) {
        return { valid: false, errorCode: "EVC_007", error: "Coffre destination introuvable" };
      }
      if (coffreDest.statut !== "ACTIVE") {
        return { valid: false, errorCode: "EVC_007", error: "Le coffre destination n'est pas actif" };
      }
      if (coffreDest.devise !== coffreSource.devise) {
        return { valid: false, errorCode: "EVC_002", error: "Les devises des coffres source et destination doivent être identiques" };
      }

      // Plafond destination
      if (coffreDest.plafondEncaisse) {
        const plafondDest = parseFloat(coffreDest.plafondEncaisse.toString());
        const soldeDest = parseFloat(coffreDest.solde?.toString() || "0");
        if (soldeDest + data.montant > plafondDest) {
          return {
            valid: false,
            errorCode: "EVC_004",
            error: `Le plafond du coffre destination serait dépassé. Plafond: ${plafondDest.toLocaleString()} XAF`,
          };
        }
      }
    }

    return { valid: true };
  }
}
