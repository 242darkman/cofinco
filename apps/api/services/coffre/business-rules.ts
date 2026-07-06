import type { TransfertCoffreCaisse, ConfigCoffreFort } from "@shared/schema";
import { SystemRole } from "@shared/types/roles";
// Assuming User type needs to be defined or imported. Using basic shape matching usage.
interface User {
  id: string;
  role?: string;
  agenceId?: string;
  [key: string]: any;
}

interface Caisse {
  id: string;
  solde?: string | null;
  [key: string]: any;
}

const normalizeRoleToken = (role?: string | null): string | undefined => {
  if (!role) return undefined;
  return role.trim().toUpperCase();
};

export interface TransfertBusinessRules {
  // Qui peut faire quoi
  canInitiate: (user: User, caisse: Caisse, config: ConfigCoffreFort) => boolean;
  canValidate: (user: User, transfert: TransfertCoffreCaisse, config: ConfigCoffreFort) => boolean;
  canExecute: (user: User, transfert: TransfertCoffreCaisse, config: ConfigCoffreFort) => boolean;
  canCancel: (user: User, transfert: TransfertCoffreCaisse) => boolean;
  
  // Validations métier
  validateSufficientFunds: (caisse: Caisse, montant: number) => boolean;
  requiresDoubleValidation: (montant: number, config: ConfigCoffreFort) => boolean;
}

export const businessRules: TransfertBusinessRules = {
  
  canInitiate: (user, caisse, config) => {
    // L'utilisateur doit avoir un rôle autorisé
    const rolesAutorisés = (config.rolesInitiateurs as string[]) || ["caissier", "chef_caisse"];
    const userRoleToken = normalizeRoleToken(user.role);
    const roleTokens = rolesAutorisés
      .map((role) => normalizeRoleToken(role))
      .filter((role): role is string => !!role);
    if (!userRoleToken || !roleTokens.includes(userRoleToken)) {
      return false;
    }
    // L'utilisateur doit avoir une session ouverte sur cette caisse (ou être le coffre)
    // Note: Session check usually happens in service/middleware
    return true;
  },

  canValidate: (user, transfert, config) => {
    // Séparation des rôles : l'initiateur ne peut pas valider sa propre demande
    if (config.separationInitiateurValideur && transfert.requestedBy === user.id) {
      return false;
    }
    // Vérifier le rôle
    const rolesAutorisés = (config.rolesValideurs as string[]) || ["chef_agence", "superviseur"];
    const userRoleToken = normalizeRoleToken(user.role);
    const roleTokens = rolesAutorisés
      .map((role) => normalizeRoleToken(role))
      .filter((role): role is string => !!role);
    return !!userRoleToken && roleTokens.includes(userRoleToken);
  },

  canExecute: (user, transfert, config) => {
    // Séparation valideur/exécuteur si configurée
    if (config.separationValideurExecuteur && transfert.validatedBy === user.id) {
      return false;
    }
    // Vérifier le rôle
    const rolesAutorisés = (config.rolesExecuteurs as string[]) || ["caissier", "chef_caisse", "chef_agence"];
    const userRoleToken = normalizeRoleToken(user.role);
    const roleTokens = rolesAutorisés
      .map((role) => normalizeRoleToken(role))
      .filter((role): role is string => !!role);
    return !!userRoleToken && roleTokens.includes(userRoleToken);
  },

  canCancel: (user, transfert) => {
    // Seul l'initiateur ou un admin peut annuler avant validation
    return transfert.requestedBy === user.id || user.role === SystemRole.ADMIN;
  },

  validateSufficientFunds: (caisse, montant) => {
    const soldeCaisse = parseFloat(caisse.solde || "0");
    return soldeCaisse >= montant;
  },

  requiresDoubleValidation: (montant, config) => {
    const seuil = parseFloat(config.seuilDoubleValidation || "0");
    return seuil > 0 && montant >= seuil;
  },
};
