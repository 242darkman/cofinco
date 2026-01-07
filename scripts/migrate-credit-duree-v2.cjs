/**
 * Migration V2: Durée crédit avec unités
 * 
 * Usage: node --env-file=.env scripts/migrate-credit-duree-v2.cjs
 * 
 * Ce script migre les données de:
 *   - duree (en jours) -> dureeValeur + dureeUnite
 *   - supprime jours_travail_mois (hardcodé à 26)
 */

const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  console.log('🔄 Migration V2: Durée crédit avec unités\n');
  
  try {
    await pool.query('BEGIN');
    
    // 1. Créer les enums si ils n'existent pas
    console.log('1️⃣ Vérification des enums...');
    const enums = [
      { name: 'frequence_remboursement_enum', values: ['Journalier', 'Hebdomadaire', 'Mensuel', 'Bimensuel', 'Trimestriel'] },
      { name: 'duree_unite_enum', values: ['Jour', 'Semaine', 'Mois'] },
    ];
    
    for (const e of enums) {
      const check = await pool.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [e.name]);
      if (check.rows.length === 0) {
        const valuesStr = e.values.map(v => `'${v}'`).join(', ');
        await pool.query(`CREATE TYPE ${e.name} AS ENUM (${valuesStr})`);
        console.log(`   ✅ Créé enum: ${e.name}`);
      } else {
        console.log(`   ⏭️ Enum existe: ${e.name}`);
      }
    }
    
    // 2. Vérifier les colonnes existantes
    console.log('\n2️⃣ Analyse des colonnes...');
    const colsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'demandes_credit'
    `);
    const existingCols = colsResult.rows.map(r => r.column_name);
    
    const hasLegacyDuree = existingCols.includes('duree');
    const hasV2 = existingCols.includes('duree_valeur');
    
    if (hasV2 && !hasLegacyDuree) {
      console.log('   ⏭️ Déjà migré vers V2');
      await pool.query('COMMIT');
      await pool.end();
      return;
    }
    
    // 3. Ajouter nouvelles colonnes (nullable au départ)
    console.log('\n3️⃣ Ajout colonnes V2...');
    if (!existingCols.includes('duree_valeur')) {
      await pool.query('ALTER TABLE demandes_credit ADD COLUMN duree_valeur INTEGER');
      console.log('   ✅ Ajouté: duree_valeur');
    }
    if (!existingCols.includes('duree_unite')) {
      await pool.query('ALTER TABLE demandes_credit ADD COLUMN duree_unite duree_unite_enum');
      console.log('   ✅ Ajouté: duree_unite');
    }
    if (!existingCols.includes('nombre_echeances')) {
      await pool.query('ALTER TABLE demandes_credit ADD COLUMN nombre_echeances INTEGER');
      console.log('   ✅ Ajouté: nombre_echeances');
    }
    
    // 4. Migrer les données existantes
    if (hasLegacyDuree) {
      console.log('\n4️⃣ Migration des données...');
      
      // Compter les demandes à migrer
      const countResult = await pool.query('SELECT COUNT(*) FROM demandes_credit WHERE duree IS NOT NULL');
      const count = parseInt(countResult.rows[0].count);
      console.log(`   📊 ${count} demandes à migrer`);
      
      if (count > 0) {
        // Migrer selon la fréquence de remboursement
        await pool.query(`
          UPDATE demandes_credit 
          SET 
            duree_valeur = CASE 
              WHEN frequence_remboursement = 'Journalier' THEN duree
              WHEN frequence_remboursement = 'Hebdomadaire' THEN CEIL(duree::float / 7)
              ELSE CEIL(duree::float / 30)
            END,
            duree_unite = CASE 
              WHEN frequence_remboursement = 'Journalier' THEN 'Jour'::duree_unite_enum
              WHEN frequence_remboursement = 'Hebdomadaire' THEN 'Semaine'::duree_unite_enum
              ELSE 'Mois'::duree_unite_enum
            END,
            nombre_echeances = CASE 
              WHEN frequence_remboursement = 'Journalier' THEN duree
              WHEN frequence_remboursement = 'Hebdomadaire' THEN CEIL(duree::float / 7)
              WHEN frequence_remboursement = 'Bimensuel' THEN CEIL(duree::float / 15)
              WHEN frequence_remboursement = 'Mensuel' THEN CEIL(duree::float / 30)
              WHEN frequence_remboursement = 'Trimestriel' THEN CEIL(duree::float / 90)
              ELSE duree
            END
          WHERE duree IS NOT NULL
        `);
        console.log(`   ✅ ${count} demandes migrées`);
      }
      
      // 5. Ajouter contraintes NOT NULL
      console.log('\n5️⃣ Ajout contraintes NOT NULL...');
      
      // Valeurs par défaut pour les nulls restants
      await pool.query(`UPDATE demandes_credit SET duree_valeur = 30 WHERE duree_valeur IS NULL`);
      await pool.query(`UPDATE demandes_credit SET duree_unite = 'Jour' WHERE duree_unite IS NULL`);
      
      await pool.query('ALTER TABLE demandes_credit ALTER COLUMN duree_valeur SET NOT NULL');
      await pool.query('ALTER TABLE demandes_credit ALTER COLUMN duree_unite SET NOT NULL');
      console.log('   ✅ Contraintes ajoutées');
      
      // 6. Supprimer colonnes legacy
      console.log('\n6️⃣ Suppression colonnes legacy...');
      await pool.query('ALTER TABLE demandes_credit DROP COLUMN IF EXISTS duree');
      await pool.query('ALTER TABLE demandes_credit DROP COLUMN IF EXISTS jours_travail_mois');
      console.log('   ✅ Colonnes legacy supprimées');
    }
    
    await pool.query('COMMIT');
    console.log('\n🎉 Migration terminée avec succès!');
    
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('\n❌ Erreur de migration:', err.message);
    console.error('   La transaction a été annulée (rollback)');
    process.exit(1);
  }
  
  await pool.end();
}

migrate();
