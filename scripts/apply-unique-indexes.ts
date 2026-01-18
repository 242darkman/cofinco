
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function applyUniqueIndexes() {
  console.log("🛠️  Application des index uniques de sécurité...");

  try {
    // Index pour le Dispatch (Sortie)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_mvt_transfert_dispatch 
      ON mouvements_financiers ((metadata->>'transfertInterCoffreId')) 
      WHERE metadata->>'type' = 'SORTIE_COFFRE_TRANSIT';
    `);
    console.log("✅ Index idx_unique_mvt_transfert_dispatch créé/vérifié.");

    // Index pour la Réception (Entrée)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_mvt_transfert_receive 
      ON mouvements_financiers ((metadata->>'transfertInterCoffreId')) 
      WHERE metadata->>'type' = 'ENTREE_COFFRE_RECEPTION';
    `);
    console.log("✅ Index idx_unique_mvt_transfert_receive créé/vérifié.");

    console.log("\n🎉 Sécurisation base de données terminée.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur lors de l'application des index :", error);
    process.exit(1);
  }
}

applyUniqueIndexes();
