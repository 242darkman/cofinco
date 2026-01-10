
// scripts/seed-coffre-demo.ts

import { db } from "../server/db";
import { agences, caisses, configCoffreFort } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function seedCoffreFortDemo() {
  console.log("🏦 Seeding Coffre-Fort configuration...");

  // 1. Récupérer toutes les agences
  const allAgences = await db.select().from(agences);
  console.log(`  Found ${allAgences.length} agencies`);

  for (const agence of allAgences) {
    // 2. Vérifier si un coffre-fort existe déjà
    const [existingCoffre] = await db.select()
      .from(caisses)
      .where(and(
        eq(caisses.agenceId, agence.id),
        eq(caisses.type, "Coffre-Fort")
      ));

    if (!existingCoffre) {
      // Créer le coffre-fort
      const [newCoffre] = await db.insert(caisses).values({
        nom: `Coffre-Fort ${agence.nom}`,
        agenceId: agence.id,
        type: "Coffre-Fort",
        solde: "5000000", // Solde initial demo: 5M FCFA
        statut: "Ouverte",
      }).returning();
      console.log(`  ✅ Created Coffre-Fort for ${agence.nom}`);
    } else {
      console.log(`  ⏭️  Coffre-Fort already exists for ${agence.nom}`);
    }

    // 3. Vérifier si la config existe déjà
    const [existingConfig] = await db.select()
      .from(configCoffreFort)
      .where(eq(configCoffreFort.agenceId, agence.id));

    if (!existingConfig) {
      await db.insert(configCoffreFort).values({
        agenceId: agence.id,
        seuilDoubleValidation: "1000000",
        separationInitiateurValideur: true,
        separationValideurExecuteur: false,
        rolesInitiateurs: ["caissier", "chef_caisse", "Chef d'Agence"],
        rolesValideurs: ["Chef d'Agence", "superviseur", "Administrateur"],
        rolesExecuteurs: ["caissier", "chef_caisse", "Chef d'Agence"],
        billetageObligatoire: false,
        actif: true,
      });
      console.log(`  ✅ Created config for ${agence.nom}`);
    }
  }

  console.log("🏦 Coffre-Fort seeding complete!");
}

// Exécuter si lancé directement
if (require.main === module) {
  seedCoffreFortDemo()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
