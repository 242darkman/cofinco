/**
 * Migration Script: Architecture Multi-Rôles
 *
 * Ce script migre les rôles existants de employes.roleSystem vers la nouvelle table user_roles.
 * Il peut être exécuté plusieurs fois en toute sécurité (idempotent).
 *
 * Exécution : npx tsx scripts/migrate-roles-to-multi-role.ts
 *
 * Options:
 *   --dry-run    Affiche les changements sans les appliquer
 *   --verbose    Affiche les détails de chaque migration
 */

import "dotenv/config";

import { db } from "../server/db";
import { users, employes, userRoles } from "@shared/schema";
import { eq, isNull, and, sql } from "drizzle-orm";
import { SystemRole } from "@shared/types/roles";

interface MigrationReport {
  totalEmployes: number;
  alreadyMigrated: number;
  newlyMigrated: number;
  errors: Array<{ userId: string; error: string }>;
}

// Mapping roleSystem (employes) -> SystemRole enum
const ROLE_SYSTEM_MAPPING: Record<string, SystemRole> = {
  'admin': SystemRole.ADMIN,
  'ADMIN': SystemRole.ADMIN,
  'chef_agence': SystemRole.CHEF_AGENCE,
  'CHEF_AGENCE': SystemRole.CHEF_AGENCE,
  'comptable': SystemRole.COMPTABLE,
  'COMPTABLE': SystemRole.COMPTABLE,
  'caissier': SystemRole.CAISSIER,
  'CAISSIER': SystemRole.CAISSIER,
  'terrain': SystemRole.AGENT_TERRAIN,
  'agent': SystemRole.AGENT_TERRAIN,
  'AGENT_TERRAIN': SystemRole.AGENT_TERRAIN,
  'superviseur': SystemRole.SUPERVISEUR,
  'SUPERVISEUR': SystemRole.SUPERVISEUR,
  'credit': SystemRole.GESTIONNAIRE_CREDIT,
  'GESTIONNAIRE_CREDIT': SystemRole.GESTIONNAIRE_CREDIT,
  'client': SystemRole.CLIENT,
  'CLIENT': SystemRole.CLIENT,
};

async function migrateRoles(dryRun: boolean, verbose: boolean): Promise<MigrationReport> {
  const report: MigrationReport = {
    totalEmployes: 0,
    alreadyMigrated: 0,
    newlyMigrated: 0,
    errors: [],
  };

  console.log("\n🚀 Migration des rôles vers l'architecture Multi-Rôles");
  console.log("=".repeat(60));

  if (dryRun) {
    console.log("⚠️  Mode DRY-RUN: Aucune modification ne sera effectuée\n");
  }

  // Récupérer tous les employés avec leur rôle
  const employesWithRoles = await db
    .select({
      userId: employes.userId,
      roleSystem: employes.roleSystem,
      agenceId: employes.agenceId,
      userNom: users.nom,
      userPrenom: users.prenom,
    })
    .from(employes)
    .innerJoin(users, eq(employes.userId, users.id))
    .where(sql`${employes.roleSystem} IS NOT NULL`);

  report.totalEmployes = employesWithRoles.length;
  console.log(`📊 Total employés à traiter: ${report.totalEmployes}\n`);

  for (const emp of employesWithRoles) {
    const fullName = `${emp.userPrenom || ''} ${emp.userNom}`.trim();

    try {
      // Vérifier si un rôle existe déjà pour cet utilisateur
      const [existingRole] = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.userId, emp.userId));

      if (existingRole) {
        report.alreadyMigrated++;
        if (verbose) {
          console.log(`⏭️  ${fullName}: Déjà migré (rôle: ${existingRole.role})`);
        }
        continue;
      }

      // Mapper le rôle
      const mappedRole = ROLE_SYSTEM_MAPPING[emp.roleSystem || ''] || SystemRole.CLIENT;

      if (verbose) {
        console.log(`🔄 ${fullName}: ${emp.roleSystem} → ${mappedRole}`);
      }

      if (!dryRun) {
        // Créer le nouveau rôle
        await db.insert(userRoles).values({
          userId: emp.userId,
          role: mappedRole,
          agenceId: emp.agenceId,
          isPrimary: true,
        });
      }

      report.newlyMigrated++;
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      report.errors.push({ userId: emp.userId, error: errorMsg });
      console.error(`❌ ${fullName}: ${errorMsg}`);
    }
  }

  return report;
}

async function printReport(report: MigrationReport) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 RAPPORT DE MIGRATION");
  console.log("=".repeat(60));
  console.log(`Total employés traités: ${report.totalEmployes}`);
  console.log(`✅ Nouvellement migrés: ${report.newlyMigrated}`);
  console.log(`⏭️  Déjà migrés:        ${report.alreadyMigrated}`);
  console.log(`❌ Erreurs:             ${report.errors.length}`);

  if (report.errors.length > 0) {
    console.log("\n❌ Détail des erreurs:");
    for (const err of report.errors) {
      console.log(`   - User ${err.userId}: ${err.error}`);
    }
  }

  console.log("\n" + "=".repeat(60));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");

  try {
    const report = await migrateRoles(dryRun, verbose);
    await printReport(report);

    if (dryRun && report.newlyMigrated > 0) {
      console.log("\n💡 Pour appliquer les changements, exécutez sans --dry-run");
    }

    if (report.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 Erreur fatale:", error);
    process.exit(1);
  }
}

main();
