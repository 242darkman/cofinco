/**
 * Migration Script: Création de comptes users pour les clients orphelins
 *
 * Ce script :
 * 1. Sélectionne tous les clients où userId est NULL
 * 2. Pour chaque client orphelin:
 *    - Génère un username unique (base: nom.prenom)
 *    - Génère un password sécurisé temporaire
 *    - Crée un compte users avec typeCompte='client', canLogin=false
 *    - Met à jour clients.userId avec l'ID du user créé
 *
 * Exécution : npx tsx scripts/migrate-legacy-clients.ts
 * Dry run   : npx tsx scripts/migrate-legacy-clients.ts --dry-run
 */

// Charger les variables d'environnement depuis .env
import "dotenv/config";

import { db } from "../server/db";
import { users, clients } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { SystemRole } from "@shared/types/roles";
import crypto from "crypto";

// Configuration
const DRY_RUN = process.argv.includes("--dry-run");
const DEFAULT_PASSWORD = "Cofin@2026!"; // Password temporaire, mustChangePassword=true

interface MigrationReport {
  totalOrphans: number;
  migratedCount: number;
  skippedCount: number;
  errors: Array<{ clientId: string; nom: string | null; error: string }>;
  migratedClients: Array<{ clientId: string; userId: string; username: string; nom: string | null }>;
}

/**
 * Génère un username unique basé sur nom.prenom
 * Ajoute un suffixe numérique si le username existe déjà
 */
async function generateUniqueUsername(nom: string | null, prenom: string | null): Promise<string> {
  // Nettoyer et normaliser les noms
  const cleanNom = (nom || "client")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlever les accents
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 15);

  const cleanPrenom = (prenom || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 10);

  const baseUsername = cleanPrenom ? `${cleanNom}.${cleanPrenom}` : cleanNom;

  // Vérifier si le username existe déjà
  let username = baseUsername;
  let suffix = 0;

  while (true) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));

    if (!existing) {
      return username;
    }

    suffix++;
    username = `${baseUsername}${suffix}`;

    // Sécurité: éviter boucle infinie
    if (suffix > 1000) {
      // Fallback avec UUID partiel
      return `${baseUsername}_${crypto.randomUUID().substring(0, 6)}`;
    }
  }
}

/**
 * Hash le password avec bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcrypt");
  return bcrypt.hash(password, 10);
}

/**
 * Migre un client orphelin vers un user
 */
async function migrateOrphanClient(
  client: {
    id: string;
    nom: string | null;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    photoProfile: string | null;
  }
): Promise<{ userId: string; username: string }> {
  // Générer un username unique
  const username = await generateUniqueUsername(client.nom, client.prenom);

  // Hash du password par défaut
  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  // Créer le user dans une transaction
  return await db.transaction(async (tx) => {
    // Insérer le user
    const [newUser] = await tx.insert(users).values({
      // Identité (copiée depuis clients legacy)
      nom: client.nom || "Client",
      prenom: client.prenom,
      email: client.email,
      telephone: client.telephone,
      photoProfile: client.photoProfile,

      // Authentification
      username: username,
      password: hashedPassword,

      // Type et accès
      typeCompte: "client",
      role: SystemRole.CLIENT,
      canLogin: false, // Désactivé par défaut, activation manuelle requise
      statut: "Actif",
      mustChangePassword: true, // Doit changer le password au premier login

      // LEGACY fields - NULL pour les clients
      matricule: null,
      poste: null,
      departement: null,
      dateEmbauche: null,
      typeContrat: null,
      managerId: null,
      salaireBase: null,
      tauxHoraire: null,
      tauxJournalier: null,
      modeCalculPaie: null,
      caissePin: null,
    }).returning();

    // Mettre à jour le client avec le userId
    await tx.update(clients)
      .set({
        userId: newUser.id,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, client.id));

    return { userId: newUser.id, username };
  });
}

/**
 * Script principal de migration
 */
async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Migration Clients Orphelins → Users                    ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${DRY_RUN ? "DRY RUN (simulation)" : "EXECUTION RÉELLE"}                         ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const report: MigrationReport = {
    totalOrphans: 0,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    migratedClients: [],
  };

  try {
    // 1. Compter les clients orphelins
    const orphanCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(isNull(clients.userId));

    report.totalOrphans = Number(orphanCountResult[0]?.count || 0);

    console.log(`📊 Clients orphelins trouvés: ${report.totalOrphans}\n`);

    if (report.totalOrphans === 0) {
      console.log("✅ Aucun client orphelin à migrer. La base est déjà à jour.");
      return;
    }

    // 2. Récupérer tous les clients orphelins
    const orphanClients = await db
      .select({
        id: clients.id,
        nom: clients.nom,
        prenom: clients.prenom,
        email: clients.email,
        telephone: clients.telephone,
        photoProfile: clients.photoProfile,
      })
      .from(clients)
      .where(isNull(clients.userId));

    console.log("🔄 Début de la migration...\n");

    // 3. Migrer chaque client
    for (const client of orphanClients) {
      try {
        if (DRY_RUN) {
          // En mode dry-run, simuler la génération du username
          const username = await generateUniqueUsername(client.nom, client.prenom);
          console.log(`  [DRY RUN] Client "${client.nom || 'N/A'}" (${client.id}) → Username: ${username}`);
          report.migratedClients.push({
            clientId: client.id,
            userId: "[DRY_RUN]",
            username,
            nom: client.nom,
          });
          report.migratedCount++;
        } else {
          // Migration réelle
          const { userId, username } = await migrateOrphanClient(client);
          console.log(`  ✅ Client "${client.nom || 'N/A'}" (${client.id}) → User ${userId} (${username})`);
          report.migratedClients.push({
            clientId: client.id,
            userId,
            username,
            nom: client.nom,
          });
          report.migratedCount++;
        }
      } catch (error: any) {
        console.error(`  ❌ Erreur pour client ${client.id}: ${error.message}`);
        report.errors.push({
          clientId: client.id,
          nom: client.nom,
          error: error.message,
        });
        report.skippedCount++;
      }
    }

    // 4. Rapport final
    console.log("\n" + "═".repeat(60));
    console.log("📋 RAPPORT DE MIGRATION");
    console.log("═".repeat(60));
    console.log(`  Clients orphelins trouvés: ${report.totalOrphans}`);
    console.log(`  Migrés avec succès:        ${report.migratedCount}`);
    console.log(`  Erreurs/Skippés:           ${report.skippedCount}`);

    if (report.errors.length > 0) {
      console.log("\n⚠️  Erreurs rencontrées:");
      report.errors.forEach((e) => {
        console.log(`    - Client ${e.clientId} (${e.nom || "N/A"}): ${e.error}`);
      });
    }

    if (DRY_RUN) {
      console.log("\n🔔 Mode DRY RUN: Aucune modification n'a été effectuée.");
      console.log("   Pour exécuter réellement, relancez sans --dry-run");
    } else {
      console.log("\n✅ Migration terminée avec succès!");
      console.log("\n📌 Prochaines étapes:");
      console.log("   1. Vérifier les nouveaux comptes dans la base");
      console.log("   2. Activer canLogin=true pour les clients qui doivent accéder au portail");
      console.log("   3. Envoyer les credentials par email/SMS (password temporaire: Cofin@2026!)");
    }

    // 5. Export du rapport en JSON
    if (!DRY_RUN && report.migratedCount > 0) {
      const reportPath = `./migration-clients-report-${new Date().toISOString().slice(0, 10)}.json`;
      const fs = await import("fs");
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Rapport exporté: ${reportPath}`);
    }

  } catch (error: any) {
    console.error("\n❌ Erreur fatale:", error.message);
    process.exit(1);
  }
}

// Exécution
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erreur non gérée:", err);
    process.exit(1);
  });
