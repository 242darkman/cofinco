
import { db } from "../server/db";
import { 
  clients, 
  credits, 
  demandesCredit, 
  comptes, 
  enquetesCredit
} from "@shared/schema";
import { 
  StatutClient, 
  StatutCredit, 
  StatutDemande, 
  StatutCompte, 
  StatutEnquete
} from "@shared/enum/status-constants";
import { eq, sql } from "drizzle-orm";

/**
 * Script de migration pour standardiser les statuts (Legacy FR -> Standard EN)
 * 
 * Ce script parcourt les tables principales et met à jour les valeurs textuelles
 * vers les énumérations standardisées définies dans status-constants.ts
 */

// Mappings spécifiques par table pour éviter les collisions
const CLIENT_STATUS_MAP: Record<string, string> = {
  "Actif": "ACTIVE",
  "Active": "ACTIVE",
  "actif": "ACTIVE",
  "Inactif": "INACTIVE",
  "Suspendu": "SUSPENDED",
  "Supprimé": "DELETED",
};

const COMPTE_STATUS_MAP: Record<string, string> = {
  "Actif": "ACTIVE",
  "En attente": "PENDING_ACTIVATION",
  "Pending": "PENDING_ACTIVATION", 
  "Fermé": "CLOSED",
  "Annulé": "CANCELLED",
  "Bloqué": "SUSPENDED",
};

const CREDIT_STATUS_MAP: Record<string, string> = {
  "En attente": "PENDING",    
  "En cours": "ACTIVE",
  "En retard": "LATE",
  "Soldé": "PAID",
  "Clôturé": "CLOSED",
};

const DEMANDE_STATUS_MAP: Record<string, string> = {
  "En attente des frais": "PENDING_FEES",
  "Prêt pour enquête": "READY_FOR_INVESTIGATION",
  "En cours d'enquête": "UNDER_INVESTIGATION",
  "Enquête terminée": "INVESTIGATION_COMPLETE",
  "Approuvée": "APPROVED",
  "Rejetée": "REJECTED",
  "Décaissée": "DISBURSED",
  "Clôturée": "CLOSED",
  "Réévaluation en cours": "REEVALUATION_IN_PROGRESS",
  "Approuvée (réévaluation)": "APPROVED_AFTER_REEVALUATION",
  "Rejetée définitivement": "DEFINITIVELY_REJECTED",
  "Supprimée": "DELETED",
};

const ENQUETE_STATUS_MAP: Record<string, string> = {
  "en_attente": "PENDING",
  "En cours": "IN_PROGRESS",
  "Approuvé": "APPROVED",
  "Rejeté": "REJECTED",
};


async function migrateTable(tableName: string, table: any, statusCol: any, statusMap: Record<string, string>) {
  console.log(`\n--- Migration ${tableName} ---`);
  let updatedCount = 0;
  
  // Récupérer toutes les valeurs distinctes actuelles
  const currentStatuses = await db.selectDistinct({ status: statusCol }).from(table);
  console.log(`Statuts actuels dans ${tableName}:`, currentStatuses.map(s => s.status));

  // Pour chaque mapping défini pour CETTE table
  for (const [legacy, standard] of Object.entries(statusMap)) {
    // Utiliser sql et un cast explicite pour éviter l'erreur "invalid input value for enum"
    // si la valeur legacy n'existe pas dans la définition de l'enum Postgres
    const result = await db.update(table)
      .set({ [statusCol.name]: standard })
      .where(sql`${statusCol}::text = ${legacy}`);
    
    if (result.rowCount && result.rowCount > 0) {
      console.log(`✅ ${result.rowCount} entrées mises à jour: "${legacy}" -> "${standard}"`);
      updatedCount += result.rowCount;
    }
  }
  
  console.log(`Total mis à jour pour ${tableName}: ${updatedCount}`);
}

async function runMigration() {
  console.log("🚀 Démarrage de la migration des statuts Legacy...");

  try {
    // 0. UPDATE DATABASE TYPES (Important pour DELETED)
    console.log("\n--- Mise à jour des Types de Base de Données ---");
    try {
      await db.execute(sql`ALTER TYPE statut_demande_enum ADD VALUE IF NOT EXISTS 'DELETED'`);
      console.log("✅ Type statut_demande_enum mis à jour avec la valeur 'DELETED'");
    } catch (e) {
      console.warn("⚠️ Impossible de mettre à jour le type statut_demande_enum (peut-être déjà à jour ou permission refusée)", e);
    }

    // 1. Clients
    await migrateTable("clients", clients, clients.status, CLIENT_STATUS_MAP);

    // 2. Comptes
    await migrateTable("comptes", comptes, comptes.statut, COMPTE_STATUS_MAP);

    // 3. Crédits
    await migrateTable("credits", credits, credits.statut, CREDIT_STATUS_MAP);

    // 4. Demandes de Crédit
    await migrateTable("demandesCredit", demandesCredit, demandesCredit.statut, DEMANDE_STATUS_MAP);

    // 5. Enquêtes
    await migrateTable("enquetesCredit", enquetesCredit, enquetesCredit.statut, ENQUETE_STATUS_MAP);

    
    console.log("\n✨ Migration terminée avec succès !");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erreur pendant la migration:", error);
    process.exit(1);
  }
}

runMigration();
