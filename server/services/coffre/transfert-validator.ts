import { db } from "../../db";
import { caisses, configCoffreFort, users, userRoles } from "@shared/schema";
import { isAdminRole, normalizeRole } from "@shared/types/roles";
import { eq, and } from "drizzle-orm";
import { validateTransition } from "./state-machine";

export class TransfertCoffreValidator {
  private normalizeRoleToken(role?: string | null): string {
    if (!role) return "";
    const normalized = normalizeRole(role);
    if (normalized) return normalized;
    return role.trim().toLowerCase();
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Valider une transition d'état
  // ─────────────────────────────────────────────────────────────────────────
  validateTransition(currentStatut: string, targetStatut: string) {
    return validateTransition(currentStatut, targetStatut);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Vérifier les permissions pour une action
  // ─────────────────────────────────────────────────────────────────────────
  async validatePermissions(params: {
    action: "create" | "validate" | "execute" | "cancel";
    userId: string;
    agenceId: string;
    transfert?: any;
  }): Promise<{ valid: boolean; error?: string }> {
    const [user] = await db.select().from(users).where(eq(users.id, params.userId));
    if (!user) {
      return { valid: false, error: "Utilisateur non trouvé" };
    }

    // Get user's primary role from userRoles table (Architecture V3)
    const [primaryRole] = await db.select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, params.userId), eq(userRoles.isPrimary, true)));

    const [config] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, params.agenceId));

    // Config par défaut si non configuré
    const effectiveConfig = config || {
      rolesInitiateurs: ["caissier", "chef_caisse", "Chef d'Agence"],
      rolesValideurs: ["Chef d'Agence", "superviseur", "admin"],
      rolesExecuteurs: ["caissier", "chef_caisse", "Chef d'Agence"],
      separationInitiateurValideur: true,
      separationValideurExecuteur: false,
    };

    const userRoleToken = this.normalizeRoleToken(primaryRole?.role);

    switch (params.action) {
      case "create": {
        const roles = (effectiveConfig.rolesInitiateurs as string[]) || [];
        const roleTokens = roles.map((r) => this.normalizeRoleToken(r));
        const hasRole = roleTokens.includes(userRoleToken);
        if (!hasRole) {
          return { valid: false, error: "Vous n'avez pas le rôle requis pour créer un transfert" };
        }
        break;
      }

      case "validate": {
        const roles = (effectiveConfig.rolesValideurs as string[]) || [];
        const roleTokens = roles.map((r) => this.normalizeRoleToken(r));
        const hasRole = roleTokens.includes(userRoleToken);
        if (!hasRole) {
          return { valid: false, error: "Vous n'avez pas le rôle requis pour valider" };
        }
        if (effectiveConfig.separationInitiateurValideur &&
            params.transfert?.requestedBy === params.userId) {
          return { valid: false, error: "Vous ne pouvez pas valider votre propre demande" };
        }
        break;
      }

      case "execute": {
        const roles = (effectiveConfig.rolesExecuteurs as string[]) || [];
        const roleTokens = roles.map((r) => this.normalizeRoleToken(r));
        const hasRole = roleTokens.includes(userRoleToken);
        if (!hasRole) {
          return { valid: false, error: "Vous n'avez pas le rôle requis pour exécuter" };
        }
        if (effectiveConfig.separationValideurExecuteur &&
            params.transfert?.validatedBy === params.userId) {
          return { valid: false, error: "Le valideur ne peut pas exécuter le transfert" };
        }
        break;
      }

      case "cancel": {
        const isAdmin = isAdminRole(primaryRole?.role);
        const isInitiator = params.transfert?.requestedBy === params.userId;
        if (!isAdmin && !isInitiator) {
          return { valid: false, error: "Seul l'initiateur ou un admin peut annuler" };
        }
        break;
      }
    }

    return { valid: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Vérifier la disponibilité des fonds au moment de l'exécution
  // ─────────────────────────────────────────────────────────────────────────
  async validateSufficientFunds(
    caisseId: string,
    montant: number
  ): Promise<{ valid: boolean; soldeDisponible: number; error?: string }> {
    const [caisse] = await db.select().from(caisses).where(eq(caisses.id, caisseId));
    
    if (!caisse) {
      return { valid: false, soldeDisponible: 0, error: "Caisse non trouvée" };
    }

    const solde = parseFloat(caisse.solde || "0");
    
    if (solde < montant) {
      return {
        valid: false,
        soldeDisponible: solde,
        error: `Solde insuffisant. Disponible: ${solde.toLocaleString("fr-FR")} FCFA, Requis: ${montant.toLocaleString("fr-FR")} FCFA`,
      };
    }

    return { valid: true, soldeDisponible: solde };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Vérifier le seuil de double validation
  // ─────────────────────────────────────────────────────────────────────────
  async checkDoubleValidationRequired(
    agenceId: string,
    montant: number
  ): Promise<boolean> {
    const [config] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, agenceId));

    if (!config?.seuilDoubleValidation) {
      return false;
    }

    const seuil = parseFloat(config.seuilDoubleValidation);
    return montant >= seuil;
  }
}
