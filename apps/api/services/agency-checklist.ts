import { db } from "../db";
import { agences, userAgences } from "@shared/schema/agences";
import { coffresForts, comptesLiaison } from "@shared/schema/coffres-forts";
import { caisses } from "@shared/schema/finance";
import { userRoles } from "@shared/schema/auth";
import { accountingRules } from "@shared/schema/accounting";
import { eq, and, sql, or } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const logger = createLogger("AgencyChecklist");

export interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  details?: string;
}

export interface ChecklistResult {
  ready: boolean;
  items: ChecklistItem[];
  passedCount: number;
  requiredCount: number;
}

/**
 * Evaluates the activation checklist for an agency.
 * All required items must pass before activation is allowed.
 */
export async function getAgencyActivationChecklist(agencyId: string): Promise<ChecklistResult> {
  const items: ChecklistItem[] = [];

  // 1. Identity: code + name + valid type
  const [agency] = await db
    .select()
    .from(agences)
    .where(eq(agences.id, agencyId));

  if (!agency) {
    throw new Error(`Agence non trouvée: ${agencyId}`);
  }

  items.push({
    key: "identity",
    label: "Identité (code, nom, type)",
    required: true,
    passed: !!(agency.codeAgence && agency.nom && agency.typeAgence),
    details: !agency.codeAgence ? "Code agence manquant"
      : !agency.nom ? "Nom de l'agence manquant"
      : !agency.typeAgence ? "Type d'agence manquant"
      : undefined,
  });

  // 2. Location: villeId + adresse
  items.push({
    key: "location",
    label: "Localisation (ville, adresse)",
    required: true,
    passed: !!(agency.villeId && agency.adresse),
    details: !agency.villeId ? "Ville non sélectionnée"
      : !agency.adresse ? "Adresse manquante"
      : undefined,
  });

  // 3. Manager: responsableId set and has CHEF_AGENCE role
  let managerPassed = false;
  let managerDetails: string | undefined;

  if (!agency.responsableId) {
    managerDetails = "Aucun responsable assigné";
  } else {
    const [managerRole] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, agency.responsableId),
          eq(userRoles.role, "CHEF_AGENCE" as any),
        ),
      );
    if (managerRole) {
      managerPassed = true;
    } else {
      managerDetails = "Le responsable assigné n'a pas le rôle Chef d'agence";
    }
  }

  items.push({
    key: "manager",
    label: "Responsable (Chef d'agence)",
    required: true,
    passed: managerPassed,
    details: managerDetails,
  });

  // 4. Treasury: coffre-fort exists
  const [coffreResult] = await db
    .select({ id: coffresForts.id, devise: coffresForts.devise })
    .from(coffresForts)
    .where(eq(coffresForts.ownerId, agencyId));

  items.push({
    key: "treasury",
    label: "Coffre-fort configuré",
    required: true,
    passed: !!coffreResult,
    details: !coffreResult ? "Aucun coffre-fort associé à cette agence" : undefined,
  });

  // 5. Staff: at least 1 active user with CAISSIER or CHEF_AGENCE role
  const [staffCount] = await db
    .select({ count: sql<number>`count(distinct ${userAgences.userId})` })
    .from(userAgences)
    .innerJoin(
      userRoles,
      and(
        eq(userRoles.userId, userAgences.userId),
        or(eq(userRoles.role, "CAISSIER" as any), eq(userRoles.role, "CHEF_AGENCE" as any)),
      ),
    )
    .where(
      and(
        eq(userAgences.agenceId, agencyId),
        eq(userAgences.actif, true),
      ),
    );

  const hasStaff = Number(staffCount?.count || 0) > 0;
  items.push({
    key: "staff",
    label: "Personnel minimum (caissier ou chef d'agence assigné)",
    required: true,
    passed: hasStaff,
    details: !hasStaff
      ? "Aucun utilisateur avec le rôle Caissier ou Chef d'agence n'est assigné à cette agence"
      : undefined,
  });

  // 6. Liaison account
  const [liaisonResult] = await db
    .select({ id: comptesLiaison.id })
    .from(comptesLiaison)
    .where(eq(comptesLiaison.entiteId, agencyId));

  items.push({
    key: "liaison_account",
    label: "Compte de liaison",
    required: true,
    passed: !!liaisonResult,
    details: !liaisonResult ? "Aucun compte de liaison associé" : undefined,
  });

  // 7. Caisse: at least 1 caisse for this agency
  const [caisseResult] = await db
    .select({ id: caisses.id })
    .from(caisses)
    .where(eq(caisses.agenceId, agencyId));

  items.push({
    key: "caisse",
    label: "Caisse opérationnelle",
    required: true,
    passed: !!caisseResult,
    details: !caisseResult ? "Aucune caisse créée pour cette agence" : undefined,
  });

  // 8. Currency: coffre-fort has valid devise
  const currencyValid = !!(coffreResult?.devise && coffreResult.devise.length === 3);
  items.push({
    key: "currency",
    label: "Devise configurée",
    required: true,
    passed: currencyValid,
    details: !currencyValid ? "La devise du coffre-fort n'est pas configurée correctement" : undefined,
  });

  // 9. Products/Accounting: at least 1 active accounting rule (global or agency-specific)
  const [rulesCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(accountingRules)
    .where(
      and(
        or(eq(accountingRules.agenceId, agencyId), sql`${accountingRules.agenceId} IS NULL`),
        eq(accountingRules.active, true),
      ),
    );

  const hasRules = Number(rulesCount?.count || 0) > 0;
  items.push({
    key: "products",
    label: "Règles comptables configurées",
    required: true,
    passed: hasRules,
    details: !hasRules
      ? "Aucune règle comptable active (globale ou spécifique à l'agence)"
      : undefined,
  });

  // 10. KYC: graceful check — pass if no KYC module
  // Currently KYC is tag-based (tags: VIP, Risque, Nouveau, KYC), not a dedicated module
  // This check always passes but is kept for future expansion
  items.push({
    key: "kyc_rules",
    label: "Règles KYC",
    required: false,
    passed: true,
    details: undefined,
  });

  const requiredItems = items.filter(i => i.required);
  const passedRequired = requiredItems.filter(i => i.passed);

  return {
    ready: passedRequired.length === requiredItems.length,
    items,
    passedCount: passedRequired.length,
    requiredCount: requiredItems.length,
  };
}
