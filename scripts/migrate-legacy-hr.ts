/**
 * Migration Script: Transfert des données RH LEGACY de users vers employes
 *
 * Ce script :
 * 1. Sélectionne tous les users où typeCompte est 'employe' ou 'both'
 * 2. Pour chaque user, vérifie/crée une entrée dans employes
 * 3. Copie les valeurs des colonnes LEGACY de users vers employes si la destination est vide
 *
 * Exécution : npx tsx scripts/migrate-legacy-hr.ts
 */

// Charger les variables d'environnement depuis .env
import "dotenv/config";

import { db } from "../server/db";
import { users, employes } from "@shared/schema";
import { eq, or, isNull, and } from "drizzle-orm";
import { normalizeRole } from "@shared/types/roles";

interface MigrationReport {
  totalUsers: number;
  alreadyMigrated: number;
  newlyMigrated: number;
  updatedEmployes: number;
  errors: Array<{ userId: string; error: string }>;
}

async function migrateUserToEmploye(
  userId: string,
  userData: {
    matricule: string | null;
    poste: string | null;
    departement: string | null;
    dateEmbauche: Date | null;
    typeContrat: string | null;
    managerId: string | null;
    salaireBase: number | null;
    tauxHoraire: number | null;
    tauxJournalier: number | null;
    modeCalculPaie: string | null;
    caissePin: string | null;
    role: string | null;
  }
): Promise<{ created: boolean; updated: boolean }> {
  // Vérifier si un employe existe déjà pour ce user
  const [existingEmploye] = await db
    .select()
    .from(employes)
    .where(eq(employes.userId, userId));

  if (existingEmploye) {
    // Mettre à jour uniquement les champs vides de l'employé existant
    const updateData: Record<string, any> = {};

    if (!existingEmploye.matricule && userData.matricule) {
      updateData.matricule = userData.matricule;
    }
    if (!existingEmploye.poste && userData.poste) {
      updateData.poste = userData.poste;
    }
    if (!existingEmploye.departement && userData.departement) {
      updateData.departement = userData.departement;
    }
    if (!existingEmploye.dateEmbauche && userData.dateEmbauche) {
      updateData.dateEmbauche = userData.dateEmbauche.toISOString().split('T')[0];
    }
    if (!existingEmploye.typeContrat && userData.typeContrat) {
      updateData.typeContrat = userData.typeContrat;
    }
    if (!existingEmploye.managerId && userData.managerId) {
      updateData.managerId = userData.managerId;
    }
    if (existingEmploye.salaireBase === null && userData.salaireBase !== null) {
      updateData.salaireBase = userData.salaireBase;
    }
    if (existingEmploye.tauxHoraire === null && userData.tauxHoraire !== null) {
      updateData.tauxHoraire = userData.tauxHoraire;
    }
    if (existingEmploye.tauxJournalier === null && userData.tauxJournalier !== null) {
      updateData.tauxJournalier = userData.tauxJournalier;
    }
    if (!existingEmploye.modeCalculPaie && userData.modeCalculPaie) {
      updateData.modeCalculPaie = userData.modeCalculPaie;
    }
    if (!existingEmploye.caissePin && userData.caissePin) {
      updateData.caissePin = userData.caissePin;
    }
    // Copier le rôle seulement si roleSystem est vide/null ou "agent" (valeur par défaut)
    if ((!existingEmploye.roleSystem || existingEmploye.roleSystem === 'agent') && userData.role) {
      // Convertir le rôle en format roleSystem (lowercase)
      const roleMapping: Record<string, string> = {
        'ADMIN': 'admin',
        'CHEF_AGENCE': 'chef_agence',
        'COMPTABLE': 'comptable',
        'CAISSIER': 'caissier',
        'AGENT_TERRAIN': 'terrain',
        'SUPERVISEUR': 'superviseur',
        'GESTIONNAIRE_CREDIT': 'credit',
        'CLIENT': 'client',
      };
      updateData.roleSystem = roleMapping[userData.role] || userData.role.toLowerCase();
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date();
      await db.update(employes).set(updateData).where(eq(employes.id, existingEmploye.id));
      return { created: false, updated: true };
    }

    return { created: false, updated: false };
  } else {
    // Créer un nouvel employé
    const roleMapping: Record<string, string> = {
      'ADMIN': 'admin',
      'CHEF_AGENCE': 'chef_agence',
      'COMPTABLE': 'comptable',
      'CAISSIER': 'caissier',
      'AGENT_TERRAIN': 'terrain',
      'SUPERVISEUR': 'superviseur',
      'GESTIONNAIRE_CREDIT': 'credit',
      'CLIENT': 'client',
    };

    await db.insert(employes).values({
      userId,
      matricule: userData.matricule,
      poste: userData.poste,
      departement: userData.departement,
      dateEmbauche: userData.dateEmbauche?.toISOString().split('T')[0] || null,
      typeContrat: userData.typeContrat || 'CDI',
      managerId: userData.managerId,
      salaireBase: userData.salaireBase || 0,
      tauxHoraire: userData.tauxHoraire || 0,
      tauxJournalier: userData.tauxJournalier || 0,
      modeCalculPaie: userData.modeCalculPaie || 'Mensuel',
      caissePin: userData.caissePin,
      roleSystem: userData.role ? (roleMapping[userData.role] || userData.role.toLowerCase()) : 'agent',
    });

    return { created: true, updated: false };
  }
}

async function runMigration(): Promise<MigrationReport> {
  console.log("🚀 Démarrage de la migration des données RH LEGACY...\n");

  const report: MigrationReport = {
    totalUsers: 0,
    alreadyMigrated: 0,
    newlyMigrated: 0,
    updatedEmployes: 0,
    errors: [],
  };

  // Sélectionner tous les users de type 'employe' ou 'both'
  const usersToMigrate = await db
    .select()
    .from(users)
    .where(
      and(
        or(
          eq(users.typeCompte, 'employe'),
          eq(users.typeCompte, 'both')
        ),
        isNull(users.deletedAt)
      )
    );

  report.totalUsers = usersToMigrate.length;
  console.log(`📋 ${report.totalUsers} utilisateurs à traiter...\n`);

  for (const user of usersToMigrate) {
    try {
      console.log(`  ➡️  Traitement de ${user.nom} ${user.prenom || ''} (${user.id})...`);

      const result = await migrateUserToEmploye(user.id, {
        matricule: user.matricule,
        poste: user.poste,
        departement: user.departement,
        dateEmbauche: user.dateEmbauche,
        typeContrat: user.typeContrat,
        managerId: user.managerId,
        salaireBase: user.salaireBase,
        tauxHoraire: user.tauxHoraire,
        tauxJournalier: user.tauxJournalier,
        modeCalculPaie: user.modeCalculPaie,
        caissePin: user.caissePin,
        role: user.role,
      });

      if (result.created) {
        report.newlyMigrated++;
        console.log(`      ✅ Nouvel employé créé`);
      } else if (result.updated) {
        report.updatedEmployes++;
        console.log(`      🔄 Employé mis à jour`);
      } else {
        report.alreadyMigrated++;
        console.log(`      ⏭️  Déjà migré (aucune modification)`);
      }
    } catch (error: any) {
      report.errors.push({
        userId: user.id,
        error: error.message || String(error),
      });
      console.log(`      ❌ Erreur: ${error.message}`);
    }
  }

  return report;
}

async function printReport(report: MigrationReport): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("📊 RAPPORT DE MIGRATION");
  console.log("=".repeat(60));
  console.log(`
  Total utilisateurs traités: ${report.totalUsers}
  ├── Nouveaux employés créés: ${report.newlyMigrated}
  ├── Employés mis à jour:     ${report.updatedEmployes}
  ├── Déjà migrés (inchangés): ${report.alreadyMigrated}
  └── Erreurs:                 ${report.errors.length}
  `);

  if (report.errors.length > 0) {
    console.log("\n⚠️  ERREURS DÉTECTÉES:");
    report.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. User ${e.userId}: ${e.error}`);
    });
  }

  const successRate = report.totalUsers > 0
    ? ((report.totalUsers - report.errors.length) / report.totalUsers * 100).toFixed(1)
    : 100;

  console.log(`\n✅ Migration terminée avec ${successRate}% de succès.`);
  console.log("=".repeat(60) + "\n");
}

async function main() {
  try {
    const report = await runMigration();
    await printReport(report);
    process.exit(report.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n💥 ERREUR FATALE:", error);
    process.exit(1);
  }
}

main();
