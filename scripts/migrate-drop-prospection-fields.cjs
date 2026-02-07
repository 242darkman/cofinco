/**
 * Migration: Drop deprecated prospection columns
 * - jours_travail_mois, interet_credit, montant_souhaite, objet_credit, date_prospection
 * - Replace idx_prospections_date index with idx_prospections_created_at
 *
 * Run: node --env-file=.env scripts/migrate-drop-prospection-fields.cjs
 */
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const statements = [
    // Drop old index on date_prospection (if exists)
    `DROP INDEX IF EXISTS idx_prospections_date`,
    `DROP INDEX IF EXISTS idx_prospections_date_prospection`,

    // Drop columns
    `ALTER TABLE prospections DROP COLUMN IF EXISTS jours_travail_mois`,
    `ALTER TABLE prospections DROP COLUMN IF EXISTS interet_credit`,
    `ALTER TABLE prospections DROP COLUMN IF EXISTS montant_souhaite`,
    `ALTER TABLE prospections DROP COLUMN IF EXISTS objet_credit`,
    `ALTER TABLE prospections DROP COLUMN IF EXISTS date_prospection`,

    // Create new index on created_at (if not exists)
    `CREATE INDEX IF NOT EXISTS idx_prospections_created_at ON prospections (created_at)`,
  ];

  for (const sql of statements) {
    console.log('  →', sql.substring(0, 80) + (sql.length > 80 ? '...' : ''));
    await client.query(sql);
  }

  console.log('\n✅ Migration complete — 5 columns dropped, index updated.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
