/**
 * Migration Script: Standardisation des Enums FR -> EN
 *
 * Ce script migre toutes les valeurs de statut de Français vers Anglais
 * dans la base de données.
 *
 * ⚠️ IMPORTANT: Ce script gère 2 types de colonnes:
 *   1. Colonnes TEXT: Migration directe des valeurs
 *   2. Colonnes ENUM PostgreSQL: Nécessite ALTER TYPE pour ajouter les nouvelles valeurs
 *
 * ⚠️ BREAKING CHANGE: Le Frontend doit être mis à jour AVANT ou EN MÊME TEMPS
 * que cette migration, sinon les utilisateurs verront les codes EN au lieu des labels FR.
 *
 * Exécution :
 *   - Dry run:  npx tsx scripts/standardize-enums.ts --dry-run
 *   - Réel:     npx tsx scripts/standardize-enums.ts
 *
 * Tables migrées:
 *   - users.statut (TEXT)
 *   - clients.status (TEXT)
 *   - comptes.statut (ENUM statut_compte_enum)
 *   - credits.statut (ENUM statut_credit_enum)
 *   - demandes_credit.statut (ENUM statut_demande_enum)
 *   - mouvements_financiers.statut (ENUM statut_transaction_enum)
 *   - transferts_caisse.statut (ENUM statut_transfert_caisse_enum)
 *   - transferts_coffre.statut (ENUM statut_transfert_coffre_enum)
 *   - transferts_inter_coffres.statut (ENUM statut_transfert_inter_coffre_enum)
 *   - coffres.statut (ENUM statut_coffre_enum)
 *   - caisses_agents.statut (ENUM statut_caisse_agent_enum)
 *   - reconciliations.statut (ENUM statut_reconciliation_enum)
 *   - taches_regularisation.statut (ENUM), priorite (ENUM)
 *   - mouvements_financiers.sens (ENUM sens_mouvement_enum)
 */

import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

interface MigrationResult {
  table: string;
  column: string;
  oldValue: string;
  newValue: string;
  rowsAffected: number;
}

interface EnumExtensionResult {
  enumName: string;
  newValue: string;
  success: boolean;
}

const results: MigrationResult[] = [];
const enumExtensions: EnumExtensionResult[] = [];

/**
 * Ajoute une nouvelle valeur à un enum PostgreSQL si elle n'existe pas déjà
 */
async function addEnumValue(enumName: string, newValue: string): Promise<boolean> {
  try {
    // Vérifier si la valeur existe déjà
    const checkQuery = sql.raw(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = '${enumName}'::regtype
        AND enumlabel = '${newValue}'
      ) as exists
    `);
    const checkResult = await db.execute(checkQuery);
    const exists = (checkResult.rows[0] as any)?.exists;

    if (exists) {
      console.log(`  ⏭️  Enum ${enumName}: "${newValue}" existe déjà`);
      return true;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Enum ${enumName}: ajouterait "${newValue}"`);
      enumExtensions.push({ enumName, newValue, success: true });
      return true;
    }

    // Ajouter la nouvelle valeur
    const alterQuery = sql.raw(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${newValue}'`);
    await db.execute(alterQuery);
    console.log(`  ✅ Enum ${enumName}: ajouté "${newValue}"`);
    enumExtensions.push({ enumName, newValue, success: true });
    return true;
  } catch (error: any) {
    console.log(`  ❌ Enum ${enumName}: échec ajout "${newValue}" - ${error.message}`);
    enumExtensions.push({ enumName, newValue, success: false });
    return false;
  }
}

/**
 * Exécute une mise à jour de migration pour colonnes TEXT
 */
async function migrateTextColumn(
  table: string,
  column: string,
  oldValue: string,
  newValue: string
): Promise<number> {
  if (oldValue === newValue) return 0;

  const query = sql.raw(`
    UPDATE "${table}"
    SET "${column}" = '${newValue}'
    WHERE "${column}" = '${oldValue}'
  `);

  if (DRY_RUN) {
    const countQuery = sql.raw(`
      SELECT COUNT(*) as count
      FROM "${table}"
      WHERE "${column}" = '${oldValue}'
    `);
    const result = await db.execute(countQuery);
    const count = Number((result.rows[0] as any)?.count || 0);

    if (count > 0) {
      results.push({ table, column, oldValue, newValue, rowsAffected: count });
      console.log(`  [DRY RUN] ${table}.${column}: "${oldValue}" → "${newValue}" (${count} rows)`);
    }
    return count;
  } else {
    const result = await db.execute(query);
    const rowsAffected = result.rowCount || 0;

    if (rowsAffected > 0) {
      results.push({ table, column, oldValue, newValue, rowsAffected });
      console.log(`  ✅ ${table}.${column}: "${oldValue}" → "${newValue}" (${rowsAffected} rows)`);
    }
    return rowsAffected;
  }
}

/**
 * Vérifie si une valeur existe dans un enum PostgreSQL
 */
async function enumValueExists(enumName: string, value: string): Promise<boolean> {
  try {
    const checkQuery = sql.raw(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = '${enumName}'::regtype
        AND enumlabel = '${value}'
      ) as exists
    `);
    const result = await db.execute(checkQuery);
    return (result.rows[0] as any)?.exists === true;
  } catch (e) {
    // L'enum n'existe peut-être pas encore
    return false;
  }
}

/**
 * Exécute une mise à jour de migration pour colonnes ENUM
 * Nécessite que les nouvelles valeurs aient été ajoutées à l'enum au préalable
 */
async function migrateEnumColumn(
  table: string,
  column: string,
  enumName: string,
  oldValue: string,
  newValue: string
): Promise<number> {
  if (oldValue === newValue) return 0;

  // D'abord, s'assurer que la nouvelle valeur existe dans l'enum
  const enumAdded = await addEnumValue(enumName, newValue);
  if (!enumAdded && !DRY_RUN) {
    console.log(`  ⚠️  Skip migration ${table}.${column}: enum value not available`);
    return 0;
  }

  // Vérifier si l'ancienne valeur existe encore dans l'enum PostgreSQL
  // Si elle n'existe pas, la migration a déjà été faite ou n'est pas nécessaire
  const oldValueExists = await enumValueExists(enumName, oldValue);
  if (!oldValueExists) {
    console.log(`  ⏭️  ${table}.${column}: ancienne valeur "${oldValue}" n'existe plus dans l'enum, migration déjà effectuée`);
    return 0;
  }

  const query = sql.raw(`
    UPDATE "${table}"
    SET "${column}" = '${newValue}'
    WHERE "${column}" = '${oldValue}'
  `);

  if (DRY_RUN) {
    const countQuery = sql.raw(`
      SELECT COUNT(*) as count
      FROM "${table}"
      WHERE "${column}" = '${oldValue}'
    `);
    const result = await db.execute(countQuery);
    const count = Number((result.rows[0] as any)?.count || 0);

    if (count > 0) {
      results.push({ table, column, oldValue, newValue, rowsAffected: count });
      console.log(`  [DRY RUN] ${table}.${column}: "${oldValue}" → "${newValue}" (${count} rows)`);
    }
    return count;
  } else {
    const result = await db.execute(query);
    const rowsAffected = result.rowCount || 0;

    if (rowsAffected > 0) {
      results.push({ table, column, oldValue, newValue, rowsAffected });
      console.log(`  ✅ ${table}.${column}: "${oldValue}" → "${newValue}" (${rowsAffected} rows)`);
    }
    return rowsAffected;
  }
}

// ============================================================
// MIGRATION FUNCTIONS - TEXT COLUMNS (sans enum PostgreSQL)
// ============================================================

/**
 * Migration des statuts utilisateurs (TEXT column)
 */
async function migrateUsersStatus(): Promise<void> {
  console.log("\n📋 Migration: users.statut (TEXT)");

  await migrateTextColumn("users", "statut", "Actif", "ACTIVE");
  await migrateTextColumn("users", "statut", "Inactif", "INACTIVE");
  await migrateTextColumn("users", "statut", "Suspendu", "SUSPENDED");
}

/**
 * Migration des statuts clients (TEXT column)
 */
async function migrateClientsStatus(): Promise<void> {
  console.log("\n📋 Migration: clients.status (TEXT)");

  await migrateTextColumn("clients", "status", "Actif", "ACTIVE");
  await migrateTextColumn("clients", "status", "Inactif", "INACTIVE");
  await migrateTextColumn("clients", "status", "Suspendu", "SUSPENDED");
  await migrateTextColumn("clients", "status", "Supprimé", "DELETED");
}

// ============================================================
// MIGRATION FUNCTIONS - ENUM COLUMNS (nécessitent ALTER TYPE)
// ============================================================

/**
 * Migration des statuts comptes (ENUM statut_compte_enum)
 */
async function migrateComptesStatus(): Promise<void> {
  console.log("\n📋 Migration: comptes.statut (ENUM statut_compte_enum)");

  const enumName = "statut_compte_enum";
  await migrateEnumColumn("comptes", "statut", enumName, "Actif", "ACTIVE");
  await migrateEnumColumn("comptes", "statut", enumName, "Suspendu", "SUSPENDED");
  await migrateEnumColumn("comptes", "statut", enumName, "Clôturé", "CLOSED");
  await migrateEnumColumn("comptes", "statut", enumName, "EN_ATTENTE_PAIEMENT", "PENDING_ACTIVATION");
  await migrateEnumColumn("comptes", "statut", enumName, "Annulé", "CANCELLED");
}

/**
 * Migration des statuts crédits (ENUM statut_credit_enum)
 */
async function migrateCreditsStatus(): Promise<void> {
  console.log("\n📋 Migration: credits.statut (ENUM statut_credit_enum)");

  const enumName = "statut_credit_enum";
  await migrateEnumColumn("credits", "statut", enumName, "En attente", "PENDING");
  await migrateEnumColumn("credits", "statut", enumName, "Actif", "ACTIVE");
  await migrateEnumColumn("credits", "statut", enumName, "En retard", "LATE");
  await migrateEnumColumn("credits", "statut", enumName, "Soldé", "PAID");
  await migrateEnumColumn("credits", "statut", enumName, "Clôturé", "CLOSED");
  await migrateEnumColumn("credits", "statut", enumName, "Annulé", "CANCELLED");
}

/**
 * Migration des statuts demandes de crédit (ENUM statut_demande_enum)
 */
async function migrateDemandesCreditStatus(): Promise<void> {
  console.log("\n📋 Migration: demandes_credit.statut (ENUM statut_demande_enum)");

  const enumName = "statut_demande_enum";
  await migrateEnumColumn("demandes_credit", "statut", enumName, "En attente", "PENDING_FEES");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "A enquêter", "READY_FOR_INVESTIGATION");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "En enquête", "UNDER_INVESTIGATION");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Enquête terminée", "INVESTIGATION_COMPLETE");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Approuvée", "APPROVED");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Rejetée", "REJECTED");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Annulée", "CANCELLED");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Décaissée", "DISBURSED");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Clôturée", "CLOSED");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Réévaluation en cours", "REEVALUATION_IN_PROGRESS");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Approuvée après réévaluation", "APPROVED_AFTER_REEVALUATION");
  await migrateEnumColumn("demandes_credit", "statut", enumName, "Rejetée définitivement", "DEFINITIVELY_REJECTED");
}

/**
 * Migration des statuts transactions (ENUM statut_transaction_enum)
 * Note: La colonne SQL s'appelle "statut" (pas "statut_transaction")
 */
async function migrateTransactionsStatus(): Promise<void> {
  console.log("\n📋 Migration: mouvements_financiers.statut (ENUM statut_transaction_enum)");

  const enumName = "statut_transaction_enum";
  await migrateEnumColumn("mouvements_financiers", "statut", enumName, "Pending", "PENDING");
  await migrateEnumColumn("mouvements_financiers", "statut", enumName, "Posté", "POSTED");
  await migrateEnumColumn("mouvements_financiers", "statut", enumName, "Annulé", "CANCELLED");
  await migrateEnumColumn("mouvements_financiers", "statut", enumName, "Reversé", "REVERSED");
}

/**
 * Migration des statuts transferts caisse (ENUM statut_transfert_caisse_enum)
 */
async function migrateTransfertsCaisseStatus(): Promise<void> {
  console.log("\n📋 Migration: transferts_caisse.statut (ENUM statut_transfert_caisse_enum)");

  const enumName = "statut_transfert_caisse_enum";
  try {
    await migrateEnumColumn("transferts_caisse", "statut", enumName, "En attente", "PENDING");
    await migrateEnumColumn("transferts_caisse", "statut", enumName, "Validé", "VALIDATED");
    await migrateEnumColumn("transferts_caisse", "statut", enumName, "Rejeté", "REJECTED");
    await migrateEnumColumn("transferts_caisse", "statut", enumName, "Annulé", "CANCELLED");
    await migrateEnumColumn("transferts_caisse", "statut", enumName, "Reçu", "RECEIVED");
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      console.log("  ⏭️  Table transferts_caisse not found, skipping");
    } else {
      throw e;
    }
  }
}

/**
 * Migration des statuts transferts coffre (ENUM statut_transfert_coffre_enum)
 */
async function migrateTransfertsCoffreStatus(): Promise<void> {
  console.log("\n📋 Migration: transferts_coffre.statut (ENUM statut_transfert_coffre_enum)");

  const enumName = "statut_transfert_coffre_enum";
  try {
    await migrateEnumColumn("transferts_coffre", "statut", enumName, "Demandé", "REQUESTED");
    await migrateEnumColumn("transferts_coffre", "statut", enumName, "Validé", "VALIDATED");
    await migrateEnumColumn("transferts_coffre", "statut", enumName, "Exécuté", "EXECUTED");
    await migrateEnumColumn("transferts_coffre", "statut", enumName, "Rejeté", "REJECTED");
    await migrateEnumColumn("transferts_coffre", "statut", enumName, "Annulé", "CANCELLED");
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      console.log("  ⏭️  Table transferts_coffre not found, skipping");
    } else {
      throw e;
    }
  }
}

/**
 * Migration des statuts transferts inter-coffres (ENUM statut_transfert_inter_coffre_enum)
 */
async function migrateTransfertsInterCoffresStatus(): Promise<void> {
  console.log("\n📋 Migration: transferts_inter_coffres.statut (ENUM statut_transfert_inter_coffre_enum)");

  const enumName = "statut_transfert_inter_coffre_enum";
  try {
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Brouillon", "DRAFT");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Soumis", "SUBMITTED");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Approuvé N1", "APPROVED_L1");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Approuvé N2", "APPROVED_L2");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "En transit", "IN_TRANSIT");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Reçu", "RECEIVED");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Reçu avec écart", "RECEIVED_WITH_DISCREPANCY");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Rejeté", "REJECTED");
    await migrateEnumColumn("transferts_inter_coffres", "statut", enumName, "Annulé", "CANCELLED");
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      console.log("  ⏭️  Table transferts_inter_coffres not found, skipping");
    } else {
      throw e;
    }
  }
}

/**
 * Migration des statuts coffres (ENUM statut_coffre_enum)
 */
async function migrateCoffresStatus(): Promise<void> {
  console.log("\n📋 Migration: coffres.statut (ENUM statut_coffre_enum)");

  const enumName = "statut_coffre_enum";
  try {
    await migrateEnumColumn("coffres", "statut", enumName, "Actif", "ACTIVE");
    await migrateEnumColumn("coffres", "statut", enumName, "Suspendu", "SUSPENDED");
    await migrateEnumColumn("coffres", "statut", enumName, "Fermé", "CLOSED");
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      console.log("  ⏭️  Table coffres not found, skipping");
    } else {
      throw e;
    }
  }
}

/**
 * Migration des statuts caisses agents (ENUM statut_caisse_agent_enum)
 */
async function migrateCaissesAgentsStatus(): Promise<void> {
  console.log("\n📋 Migration: caisses_agents.statut (ENUM statut_caisse_agent_enum)");

  const enumName = "statut_caisse_agent_enum";
  try {
    await migrateEnumColumn("caisses_agents", "statut", enumName, "Active", "ACTIVE");
    await migrateEnumColumn("caisses_agents", "statut", enumName, "Suspendue", "SUSPENDED");
    await migrateEnumColumn("caisses_agents", "statut", enumName, "Clôturée", "CLOSED");
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      console.log("  ⏭️  Table caisses_agents not found, skipping");
    } else {
      throw e;
    }
  }
}

/**
 * Migration des statuts réconciliations (ENUM statut_reconciliation_enum)
 */
async function migrateReconciliationsStatus(): Promise<void> {
  console.log("\n📋 Migration: reconciliations_transferts.statut (ENUM statut_reconciliation_enum)");

  const enumName = "statut_reconciliation_enum";
  try {
    await migrateEnumColumn("reconciliations_transferts", "statut", enumName, "En attente", "PENDING");
    await migrateEnumColumn("reconciliations_transferts", "statut", enumName, "Rapproché", "RECONCILED");
    await migrateEnumColumn("reconciliations_transferts", "statut", enumName, "Écart détecté", "DISCREPANCY_DETECTED");
  } catch (e) {
    console.log("  ⏭️  Table reconciliations_transferts not found, skipping");
  }
}

/**
 * Migration des tâches de régularisation (ENUMs)
 */
async function migrateTachesRegularisationStatus(): Promise<void> {
  console.log("\n📋 Migration: taches_regularisation.statut & priorite (ENUMs)");

  try {
    // Statut (statut_tache_regularisation_enum)
    const statutEnum = "statut_tache_regularisation_enum";
    await migrateEnumColumn("taches_regularisation", "statut", statutEnum, "Ouverte", "OPEN");
    await migrateEnumColumn("taches_regularisation", "statut", statutEnum, "En cours", "IN_PROGRESS");
    await migrateEnumColumn("taches_regularisation", "statut", statutEnum, "Résolue", "RESOLVED");
    await migrateEnumColumn("taches_regularisation", "statut", statutEnum, "Escaladée", "ESCALATED");

    // Priorité (priorite_tache_enum)
    const prioriteEnum = "priorite_tache_enum";
    await migrateEnumColumn("taches_regularisation", "priorite", prioriteEnum, "Basse", "LOW");
    await migrateEnumColumn("taches_regularisation", "priorite", prioriteEnum, "Normale", "NORMAL");
    await migrateEnumColumn("taches_regularisation", "priorite", prioriteEnum, "Haute", "HIGH");
    await migrateEnumColumn("taches_regularisation", "priorite", prioriteEnum, "Critique", "CRITICAL");
  } catch (e) {
    console.log("  ⏭️  Table taches_regularisation not found, skipping");
  }
}

/**
 * Migration des sens mouvement (ENUM sens_mouvement_enum)
 */
async function migrateSensMouvement(): Promise<void> {
  console.log("\n📋 Migration: mouvements_financiers.sens (ENUM sens_mouvement_enum)");

  const enumName = "sens_mouvement_enum";
  await migrateEnumColumn("mouvements_financiers", "sens", enumName, "Débit", "DEBIT");
  await migrateEnumColumn("mouvements_financiers", "sens", enumName, "Crédit", "CREDIT");
}

// ============================================================
// MIGRATION FUNCTIONS - PAYMENT ENUMS (methode/type paiement)
// ============================================================

/**
 * Migration des méthodes de paiement (ENUM methode_paiement_enum)
 * Tables: mouvements_financiers, transactions_compte, contributions_tontine, etc.
 */
async function migrateMethodePaiement(): Promise<void> {
  console.log("\n📋 Migration: methode_paiement_enum (multiple tables)");

  const enumName = "methode_paiement_enum";

  // Ajouter les nouvelles valeurs EN à l'enum (si pas déjà présentes)
  await addEnumValue(enumName, "CASH");
  await addEnumValue(enumName, "MOBILE_MONEY");
  await addEnumValue(enumName, "TRANSFER");
  await addEnumValue(enumName, "CARD");
  await addEnumValue(enumName, "CHECK");
  await addEnumValue(enumName, "OTHER");

  // Migration des tables principales
  const tables = [
    "mouvements_financiers",
    "transactions_compte",
    "contributions_tontine",
    "remboursements",
    "operations_caisse",
    "paiements_terrain",
  ];

  for (const table of tables) {
    try {
      await migrateEnumColumn(table, "methode_paiement", enumName, "Espèces", "CASH");
      await migrateEnumColumn(table, "methode_paiement", enumName, "Mobile Money", "MOBILE_MONEY");
      await migrateEnumColumn(table, "methode_paiement", enumName, "Virement", "TRANSFER");
      await migrateEnumColumn(table, "methode_paiement", enumName, "Carte", "CARD");
      await migrateEnumColumn(table, "methode_paiement", enumName, "Chèque", "CHECK");
      await migrateEnumColumn(table, "methode_paiement", enumName, "Autre", "OTHER");
    } catch (e: any) {
      if (e.message?.includes("does not exist") || e.message?.includes("column")) {
        console.log(`  ⏭️  Table/Column ${table}.methode_paiement skipped`);
      } else {
        throw e;
      }
    }
  }
}

/**
 * Migration des types de paiement terrain (ENUM type_paiement_terrain_enum)
 */
async function migrateTypePaiementTerrain(): Promise<void> {
  console.log("\n📋 Migration: type_paiement_terrain_enum");

  const enumName = "type_paiement_terrain_enum";

  // Ajouter les nouvelles valeurs EN à l'enum
  const newValues = [
    "DEPOSIT_SAVINGS", "DEPOSIT_CURRENT", "DEPOSIT_BLOCKED",
    "WITHDRAWAL_SAVINGS", "WITHDRAWAL_CURRENT", "WITHDRAWAL_BLOCKED",
    "CREDIT_REPAYMENT", "ENGAGEMENT_FEE", "CREDIT_DISBURSEMENT",
    "TONTINE_CONTRIBUTION", "TONTINE_WITHDRAWAL",
    "SAFE_SUPPLY", "SAFE_DEPOSIT",
    "TRANSFER_IN", "TRANSFER_OUT", "INITIAL_DEPOSIT", "INTERNAL_TRANSFER",
  ];

  for (const val of newValues) {
    await addEnumValue(enumName, val);
  }

  // Migration des tables
  const tables = ["paiements_terrain", "mouvements_financiers", "transactions_compte"];

  for (const table of tables) {
    try {
      // Dépôts
      await migrateEnumColumn(table, "type_paiement", enumName, "Dépôt Épargne", "DEPOSIT_SAVINGS");
      await migrateEnumColumn(table, "type_paiement", enumName, "Dépôt Courant", "DEPOSIT_CURRENT");
      await migrateEnumColumn(table, "type_paiement", enumName, "Dépôt Bloqué", "DEPOSIT_BLOCKED");

      // Retraits
      await migrateEnumColumn(table, "type_paiement", enumName, "Retrait Épargne", "WITHDRAWAL_SAVINGS");
      await migrateEnumColumn(table, "type_paiement", enumName, "Retrait Courant", "WITHDRAWAL_CURRENT");
      await migrateEnumColumn(table, "type_paiement", enumName, "Retrait Bloqué", "WITHDRAWAL_BLOCKED");

      // Crédits
      await migrateEnumColumn(table, "type_paiement", enumName, "Remboursement Crédit", "CREDIT_REPAYMENT");
      await migrateEnumColumn(table, "type_paiement", enumName, "Frais Engagement", "ENGAGEMENT_FEE");
      await migrateEnumColumn(table, "type_paiement", enumName, "Décaissement Crédit", "CREDIT_DISBURSEMENT");

      // Tontines
      await migrateEnumColumn(table, "type_paiement", enumName, "Cotisation Tontine", "TONTINE_CONTRIBUTION");
      await migrateEnumColumn(table, "type_paiement", enumName, "Versement Tontine", "TONTINE_CONTRIBUTION");
      await migrateEnumColumn(table, "type_paiement", enumName, "Retrait Tontine", "TONTINE_WITHDRAWAL");

      // Coffre
      await migrateEnumColumn(table, "type_paiement", enumName, "Approvisionnement coffre", "SAFE_SUPPLY");
      await migrateEnumColumn(table, "type_paiement", enumName, "Versement coffre", "SAFE_DEPOSIT");

      // Transferts
      await migrateEnumColumn(table, "type_paiement", enumName, "Transfert Entrant", "TRANSFER_IN");
      await migrateEnumColumn(table, "type_paiement", enumName, "Transfert Sortant", "TRANSFER_OUT");
      await migrateEnumColumn(table, "type_paiement", enumName, "Virement Interne", "INTERNAL_TRANSFER");
      await migrateEnumColumn(table, "type_paiement", enumName, "Dépôt Initial", "INITIAL_DEPOSIT");
    } catch (e: any) {
      if (e.message?.includes("does not exist") || e.message?.includes("column")) {
        console.log(`  ⏭️  Table/Column ${table}.type_paiement skipped`);
      } else {
        throw e;
      }
    }
  }
}

/**
 * Migration des types d'opération caisse (ENUM type_operation_caisse)
 */
async function migrateTypeOperationCaisse(): Promise<void> {
  console.log("\n📋 Migration: type_operation_caisse (operations_caisse.type_operation)");

  const enumName = "type_operation_caisse";

  // Ajouter les nouvelles valeurs EN
  const newValues = [
    "SAVINGS_DEPOSIT", "SAVINGS_WITHDRAWAL",
    "CREDIT_DISBURSEMENT", "CREDIT_REPAYMENT", "ENGAGEMENT_FEE",
    "FEE", "ADJUSTMENT", "CASH_TRANSFER",
    "SAFE_SUPPLY", "SAFE_DEPOSIT",
    "DEPOSIT_SAVINGS", "DEPOSIT_CURRENT", "WITHDRAWAL_CURRENT",
    "DEPOSIT_BLOCKED", "WITHDRAWAL_BLOCKED",
    "MISC_COLLECTION", "MISC_DISBURSEMENT", "BANK_FEE",
    "TONTINE_CONTRIBUTION", "TONTINE_WITHDRAWAL",
    "LOAN_REPAYMENT", "LOAN_DISBURSEMENT", "WITHDRAWAL_SAVINGS",
    "INITIAL_DEPOSIT",
  ];

  for (const val of newValues) {
    await addEnumValue(enumName, val);
  }

  try {
    // Migrations principales
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Dépôt épargne", "SAVINGS_DEPOSIT");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Retrait épargne", "SAVINGS_WITHDRAWAL");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Décaissement crédit", "CREDIT_DISBURSEMENT");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Remboursement crédit", "CREDIT_REPAYMENT");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Frais Engagement", "ENGAGEMENT_FEE");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Frais", "FEE");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Ajustement", "ADJUSTMENT");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Transfert caisse", "CASH_TRANSFER");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Approvisionnement coffre", "SAFE_SUPPLY");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Versement coffre", "SAFE_DEPOSIT");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Cotisation Tontine", "TONTINE_CONTRIBUTION");
    await migrateEnumColumn("operations_caisse", "type_operation", enumName, "Retrait Tontine", "TONTINE_WITHDRAWAL");
  } catch (e: any) {
    if (e.message?.includes("does not exist")) {
      console.log("  ⏭️  Table operations_caisse not found, skipping");
    } else {
      throw e;
    }
  }
}

/**
 * Migration des types de transaction épargne (ENUM type_transaction_epargne_enum)
 */
async function migrateTypeTransactionEpargne(): Promise<void> {
  console.log("\n📋 Migration: type_transaction_epargne_enum");

  const enumName = "type_transaction_epargne_enum";

  // Ajouter les nouvelles valeurs EN
  await addEnumValue(enumName, "DEPOSIT");
  await addEnumValue(enumName, "WITHDRAWAL");
  await addEnumValue(enumName, "INTEREST");
  await addEnumValue(enumName, "FEE");
  await addEnumValue(enumName, "ADJUSTMENT");

  // Note: Ce type est utilisé dans la logique code, pas forcément en colonne directe
  // La migration des données existantes se fait sur les tables qui l'utilisent
}

/**
 * Script principal
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Standardisation des Enums FR → EN                      ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${DRY_RUN ? "DRY RUN (simulation)" : "EXECUTION RÉELLE"}                         ║`);
  console.log("╚════════════════════════════════════════════════════════════╝");

  if (!DRY_RUN) {
    console.log("\n⚠️  ATTENTION: Ce script va modifier la base de données!");
    console.log("   Assurez-vous que le Frontend est mis à jour avec les labels FR.");
    console.log("   Ctrl+C pour annuler...\n");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  try {
    // Exécuter toutes les migrations
    await migrateUsersStatus();
    await migrateClientsStatus();
    await migrateComptesStatus();
    await migrateCreditsStatus();
    await migrateDemandesCreditStatus();
    await migrateTransactionsStatus();
    await migrateTransfertsCaisseStatus();
    await migrateTransfertsCoffreStatus();
    await migrateTransfertsInterCoffresStatus();
    await migrateCoffresStatus();
    await migrateCaissesAgentsStatus();
    await migrateReconciliationsStatus();
    await migrateTachesRegularisationStatus();
    await migrateSensMouvement();

    // Payment-related enum migrations
    await migrateMethodePaiement();
    await migrateTypePaiementTerrain();
    await migrateTypeOperationCaisse();
    await migrateTypeTransactionEpargne();

    // Rapport final
    console.log("\n" + "═".repeat(60));
    console.log("📋 RAPPORT DE MIGRATION");
    console.log("═".repeat(60));

    if (results.length === 0) {
      console.log("  Aucune donnée à migrer. La base est déjà standardisée.");
    } else {
      const totalRows = results.reduce((sum, r) => sum + r.rowsAffected, 0);
      console.log(`  Colonnes modifiées: ${results.length}`);
      console.log(`  Lignes affectées:   ${totalRows}`);

      console.log("\n  Détail par table:");
      const byTable = results.reduce((acc, r) => {
        if (!acc[r.table]) acc[r.table] = 0;
        acc[r.table] += r.rowsAffected;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(byTable).forEach(([table, count]) => {
        console.log(`    - ${table}: ${count} rows`);
      });
    }

    if (DRY_RUN) {
      console.log("\n🔔 Mode DRY RUN: Aucune modification n'a été effectuée.");
      console.log("   Pour exécuter réellement, relancez sans --dry-run");
    } else {
      console.log("\n✅ Migration terminée avec succès!");
      console.log("\n📌 Prochaines étapes:");
      console.log("   1. Vérifier que le Frontend affiche les labels FR correctement");
      console.log("   2. Tester les filtres et recherches par statut");
      console.log("   3. Mettre à jour les définitions enum dans shared/enum/enums.ts");
    }

    // Rapport des extensions d'enum
    if (enumExtensions.length > 0) {
      console.log("\n📊 Extensions d'enum PostgreSQL:");
      const byEnum = enumExtensions.reduce((acc, e) => {
        if (!acc[e.enumName]) acc[e.enumName] = [];
        acc[e.enumName].push(e.newValue);
        return acc;
      }, {} as Record<string, string[]>);

      Object.entries(byEnum).forEach(([enumName, values]) => {
        console.log(`    - ${enumName}: ${values.join(", ")}`);
      });
    }

    // Export du rapport
    if (results.length > 0) {
      const reportPath = `./migration-enums-report-${new Date().toISOString().slice(0, 10)}.json`;
      const fs = await import("fs");
      fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        dryRun: DRY_RUN,
        results,
        summary: {
          totalColumns: results.length,
          totalRows: results.reduce((sum, r) => sum + r.rowsAffected, 0),
        }
      }, null, 2));
      console.log(`\n📄 Rapport exporté: ${reportPath}`);
    }

  } catch (error: any) {
    console.error("\n❌ Erreur:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur non gérée:", err);
    process.exit(1);
  });
